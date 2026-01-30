/**
 * Import Pakistan geolocation data from PK/ folder into PostgreSQL.
 *
 * Data source: PK/PK.txt (GeoNames tab-delimited format - see PK/readme.txt)
 * - Parses TSV with columns: geonameid, name, asciiname, alternatenames, lat, lng,
 *   feature_class, feature_code, country, cc2, admin1, admin2, admin3, admin4,
 *   population, elevation, dem, timezone, modification_date
 *
 * Usage: npx ts-node scripts/import-pakistan-data.ts
 * Or: npm run import:pakistan
 */

import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";
import pool from "../lib/db";

// Load .env.local for DB connection (standalone script)
const ROOT = path.resolve(__dirname, "..");
config({ path: path.join(ROOT, ".env.local") });
config({ path: path.join(ROOT, ".env") });

// Support both PK and pk folder names (case-sensitive filesystems)
const PK_FILE = fs.existsSync(path.join(ROOT, "PK", "PK.txt"))
  ? path.join(ROOT, "PK", "PK.txt")
  : path.join(ROOT, "pk", "PK.txt");

// Province code to name (GeoNames admin1 FIPS for Pakistan)
const PROVINCE_NAMES: Record<string, string> = {
  "01": "Gilgit-Baltistan",
  "02": "Balochistan",
  "03": "Khyber Pakhtunkhwa",
  "04": "Punjab",
  "05": "Sindh",
  "06": "Azad Jammu and Kashmir",
  "07": "Islamabad",
  "08": "Islamabad", // Sometimes used for ICT
};

interface GeoNameRow {
  geonameid: number;
  name: string;
  asciiname: string;
  alternatenames: string;
  lat: number;
  lng: number;
  featureClass: string;
  featureCode: string;
  country: string;
  admin1: string;
  admin2: string;
  population: number;
  elevation: number;
}

function parseRow(line: string): GeoNameRow | null {
  const cols = line.split("\t");
  if (cols.length < 15) return null;
  const lat = parseFloat(cols[4]);
  const lng = parseFloat(cols[5]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const pop = parseInt(cols[14] || "0", 10) || 0;
  const elev = parseInt(cols[15] || "0", 10) || 0;
  return {
    geonameid: parseInt(cols[0], 10) || 0,
    name: (cols[1] || "").trim(),
    asciiname: (cols[2] || "").trim(),
    alternatenames: (cols[3] || "").trim(),
    lat,
    lng,
    featureClass: (cols[6] || "").trim(),
    featureCode: (cols[7] || "").trim(),
    country: (cols[8] || "").trim(),
    admin1: (cols[10] || "").trim(),
    admin2: (cols[11] || "").trim(),
    population: pop,
    elevation: elev,
  };
}

async function ensureTables(client: import("pg").PoolClient): Promise<void> {
  console.log("[1/6] Ensuring database tables exist...");
  try {
    await client.query("SELECT 1 FROM pakistan_provinces LIMIT 1");
    await client.query("SELECT 1 FROM pakistan_cities LIMIT 1");
  } catch (e) {
    console.error("\nERROR: Database tables not found. Please run the setup SQL first:");
    console.error("  psql -U <user> -d vehicle_tracking -f sql/setup_pakistan_geo.sql");
    console.error("\nOr on Windows with full path:");
    console.error(`  psql -U <user> -d vehicle_tracking -f "${path.join(ROOT, "sql", "setup_pakistan_geo.sql")}"`);
    throw e;
  }
  console.log("  Tables OK.");
}

async function loadDistrictNames(client: import("pg").PoolClient): Promise<Map<string, string>> {
  console.log("[2/6] Building district name lookup from ADM2 records...");
  const content = fs.readFileSync(PK_FILE, "utf8");
  const lines = content.split("\n");
  const districtMap = new Map<string, string>();
  for (const line of lines) {
    const row = parseRow(line);
    if (!row || row.featureClass !== "A" || row.featureCode !== "ADM2") continue;
    districtMap.set(row.admin2 || String(row.geonameid), row.name);
  }
  console.log(`  Found ${districtMap.size} districts.`);
  return districtMap;
}

async function importCities(
  client: import("pg").PoolClient,
  districtNames: Map<string, string>
): Promise<void> {
  console.log("[3/6] Importing cities (feature_class=P)...");
  const content = fs.readFileSync(PK_FILE, "utf8");
  const lines = content.split("\n").filter((l) => l.trim());
  const batchSize = 1000;
  let inserted = 0;
  let batch: Array<{ gid: number; name: string; alt: string; pc: string; dn: string; lat: number; lng: number; pop: number; elev: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    if (!row || row.featureClass !== "P") continue; // Only populated places
    const districtName = row.admin2 ? districtNames.get(row.admin2) || "" : "";
    batch.push({
      gid: row.geonameid,
      name: row.name || row.asciiname,
      alt: row.alternatenames || "",
      pc: row.admin1 || "",
      dn: districtName,
      lat: row.lat,
      lng: row.lng,
      pop: row.population,
      elev: row.elevation,
    });
    if (batch.length >= batchSize) {
      await insertCityBatch(client, batch);
      inserted += batch.length;
      batch = [];
      process.stdout.write(`\r  Imported ${inserted} cities...`);
    }
  }
  if (batch.length > 0) {
    await insertCityBatch(client, batch);
    inserted += batch.length;
  }
  console.log(`\r  Imported ${inserted} cities total.`);
}

async function insertCityBatch(
  client: import("pg").PoolClient,
  batch: Array<{ gid: number; name: string; alt: string; pc: string; dn: string; lat: number; lng: number; pop: number; elev: number }>
): Promise<void> {
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 0;
  for (const c of batch) {
    placeholders.push(`($${++idx}, $${++idx}, $${++idx}, $${++idx}, $${++idx}, $${++idx}, $${++idx}, $${++idx}, $${++idx}, ST_SetSRID(ST_MakePoint($${++idx}, $${++idx}), 4326))`);
    values.push(c.gid, c.name, c.alt, c.pc || null, c.dn || null, c.lat, c.lng, c.pop, c.elev, c.lng, c.lat);
  }
  const sql = `
    INSERT INTO pakistan_cities (geonameid, name, name_alternate, province_code, district_name, latitude, longitude, population, elevation, geom)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (geonameid) DO UPDATE SET
      name = EXCLUDED.name,
      name_alternate = EXCLUDED.name_alternate,
      province_code = EXCLUDED.province_code,
      district_name = EXCLUDED.district_name,
      population = EXCLUDED.population,
      elevation = EXCLUDED.elevation,
      geom = EXCLUDED.geom
  `;
  await client.query(sql, values);
}

async function importDistricts(client: import("pg").PoolClient): Promise<void> {
  console.log("[4/6] Importing district records (ADM2)...");
  // Ensure province 08 exists for FK (some GeoNames use 08 for Islamabad)
  await client.query(
    `INSERT INTO pakistan_provinces (code, name, name_urdu, area_sqkm, population, capital_city)
     VALUES ('08', 'Islamabad', 'اسلام آباد', 906, 1009832, 'Islamabad')
     ON CONFLICT (code) DO NOTHING`
  ).catch(() => {});
  const content = fs.readFileSync(PK_FILE, "utf8");
  const lines = content.split("\n");
  let count = 0;
  for (const line of lines) {
    const row = parseRow(line);
    if (!row || row.featureClass !== "A" || row.featureCode !== "ADM2") continue;
    const provCode = row.admin1 || "04";
    if (!PROVINCE_NAMES[provCode]) continue;
    try {
      await client.query(
        `INSERT INTO pakistan_districts (geonameid, name, province_code, population)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (geonameid) DO UPDATE SET name = EXCLUDED.name, province_code = EXCLUDED.province_code, population = EXCLUDED.population`,
        [row.geonameid, row.name, provCode, row.population]
      );
      count++;
    } catch {
      // Skip duplicates or FK issues
    }
  }
  console.log(`  Imported ${count} district records (points).`);
}

async function buildProvincePolygons(client: import("pg").PoolClient): Promise<void> {
  console.log("[5/6] Building province polygons (convex hull from cities)...");
  await client.query(`
    UPDATE pakistan_provinces p
    SET geom = sub.geom
    FROM (
      SELECT province_code as code,
             ST_ConvexHull(ST_Collect(c.geom))::geometry(Polygon, 4326) as geom
      FROM pakistan_cities c
      WHERE c.province_code != ''
      GROUP BY c.province_code
    ) sub
    WHERE p.code = sub.code AND sub.geom IS NOT NULL
  `);
  const r = await client.query("SELECT COUNT(*) FROM pakistan_provinces WHERE geom IS NOT NULL");
  console.log(`  Updated ${r.rows[0]?.count || 0} province polygons.`);
}

async function buildDistrictPolygons(client: import("pg").PoolClient): Promise<void> {
  console.log("[6/6] Building district polygons (convex hull from cities)...");
  await client.query(`
    UPDATE pakistan_districts d
    SET geom = sub.geom
    FROM (
      SELECT c.district_name as dname, c.province_code as pcode,
             ST_ConvexHull(ST_Collect(c.geom))::geometry(Polygon, 4326) as geom
      FROM pakistan_cities c
      WHERE c.district_name != '' AND c.province_code != ''
      GROUP BY c.district_name, c.province_code
    ) sub
    WHERE d.name = sub.dname AND d.province_code = sub.pcode AND sub.geom IS NOT NULL
  `);
  const r = await client.query("SELECT COUNT(*) FROM pakistan_districts WHERE geom IS NOT NULL");
  console.log(`  Updated ${r.rows[0]?.count || 0} district polygons.`);
}

async function main(): Promise<void> {
  console.log("Pakistan Geolocation Import");
  console.log("===========================");
  if (!fs.existsSync(PK_FILE)) {
    console.error(`ERROR: Data file not found: ${PK_FILE}`);
    console.error("Please ensure PK/PK.txt exists (from GeoNames Pakistan dump).");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await ensureTables(client);
    const districtNames = await loadDistrictNames(client);
    await importCities(client, districtNames);
    await importDistricts(client);
    await buildProvincePolygons(client);
    await buildDistrictPolygons(client);

    const stats = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM pakistan_provinces) as provinces,
        (SELECT COUNT(*) FROM pakistan_districts) as districts,
        (SELECT COUNT(*) FROM pakistan_cities) as cities,
        (SELECT SUM(population) FROM pakistan_cities) as total_pop
    `);
    const s = stats.rows[0];
    console.log("\n--- Summary ---");
    console.log(`Provinces: ${s?.provinces}`);
    console.log(`Districts: ${s?.districts}`);
    console.log(`Cities: ${s?.cities}`);
    console.log(`Total city population: ${s?.total_pop || 0}`);
    console.log("\nImport complete.");
  } catch (e) {
    console.error("Import failed:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
