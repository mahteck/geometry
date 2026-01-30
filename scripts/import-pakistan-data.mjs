/**
 * Import Pakistan geolocation data from PK/ folder into PostgreSQL.
 *
 * Data source: PK/PK.txt (GeoNames tab-delimited format - see PK/readme.txt)
 * Usage: node scripts/import-pakistan-data.mjs
 * Or: npm run import:pakistan
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync } from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

config({ path: join(ROOT, ".env.local") });
config({ path: join(ROOT, ".env"), override: true });

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 15000,
});

const PK_FILE = existsSync(join(ROOT, "PK", "PK.txt"))
  ? join(ROOT, "PK", "PK.txt")
  : join(ROOT, "pk", "PK.txt");

const PROVINCE_NAMES = {
  "01": "Gilgit-Baltistan",
  "02": "Balochistan",
  "03": "Khyber Pakhtunkhwa",
  "04": "Punjab",
  "05": "Sindh",
  "06": "Azad Jammu and Kashmir",
  "07": "Islamabad",
  "08": "Islamabad",
};

function parseRow(line) {
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

async function ensureTables(client) {
  console.log("[1/6] Ensuring database tables exist...");
  try {
    await client.query("SELECT 1 FROM pakistan_provinces LIMIT 1");
    await client.query("SELECT 1 FROM pakistan_cities LIMIT 1");
  } catch (e) {
    console.error("\nERROR: Database tables not found. Run setup first:");
    console.error("  npm run setup:pakistan");
    throw e;
  }
  console.log("  Tables OK.");
}

async function loadDistrictNames(client) {
  console.log("[2/6] Building district name lookup from ADM2 records...");
  const content = readFileSync(PK_FILE, "utf8");
  const lines = content.split("\n");
  const districtMap = new Map();
  for (const line of lines) {
    const row = parseRow(line);
    if (!row || row.featureClass !== "A" || row.featureCode !== "ADM2") continue;
    districtMap.set(row.admin2 || String(row.geonameid), row.name);
  }
  console.log(`  Found ${districtMap.size} districts.`);
  return districtMap;
}

async function insertCityBatch(client, batch) {
  const values = [];
  const placeholders = [];
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

async function importCities(client, districtNames) {
  console.log("[3/6] Importing cities (feature_class=P)...");
  const content = readFileSync(PK_FILE, "utf8");
  const lines = content.split("\n").filter((l) => l.trim());
  const batchSize = 1000;
  let inserted = 0;
  let batch = [];

  for (let i = 0; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    if (!row || row.featureClass !== "P") continue;
    const districtName = row.admin2 ? districtNames.get(row.admin2) || "" : "";
    batch.push({
      gid: row.geonameid,
      name: (row.name || row.asciiname || "").slice(0, 200),
      alt: (row.alternatenames || "").slice(0, 500),
      pc: (row.admin1 || "").slice(0, 10),
      dn: districtName.slice(0, 150),
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

async function importDistricts(client) {
  console.log("[4/6] Importing district records (ADM2)...");
  await client.query(
    `INSERT INTO pakistan_provinces (code, name, name_urdu, area_sqkm, population, capital_city)
     VALUES ('08', 'Islamabad', 'اسلام آباد', 906, 1009832, 'Islamabad')
     ON CONFLICT (code) DO NOTHING`
  ).catch(() => {});
  const content = readFileSync(PK_FILE, "utf8");
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
      // Skip duplicates
    }
  }
  console.log(`  Imported ${count} district records.`);
}

async function buildProvincePolygons(client) {
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

async function buildDistrictPolygons(client) {
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
      HAVING COUNT(*) >= 3
    ) sub
    WHERE d.name = sub.dname AND d.province_code = sub.pcode AND sub.geom IS NOT NULL
  `);
  const r = await client.query("SELECT COUNT(*) FROM pakistan_districts WHERE geom IS NOT NULL");
  console.log(`  Updated ${r.rows[0]?.count || 0} district polygons.`);
}

async function main() {
  console.log("Pakistan Geolocation Import");
  console.log("===========================");
  if (!existsSync(PK_FILE)) {
    console.error(`ERROR: Data file not found: ${PK_FILE}`);
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
