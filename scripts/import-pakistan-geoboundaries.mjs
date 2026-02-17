/**
 * Import Pakistan provinces and districts from GADM (accurate boundaries).
 * Replaces convex-hull polygons with official administrative boundaries.
 *
 * Data source: GADM (https://gadm.org) - UC Davis geodata
 * Usage: node scripts/import-pakistan-geoboundaries.mjs
 * Or: npm run import:pakistan:boundaries
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
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
  connectionTimeoutMillis: 30000,
});

// GADM NAME_1 → our province code
const PROVINCE_MAP = {
  "azad kashmir": "06",
  "azadkashmir": "06",
  balochistan: "02",
  "gilgit-baltistan": "01",
  "gilgit baltistan": "01",
  islamabad: "07",
  "khyber pakhtunkhwa": "03",
  "khyber pakhtunkwa": "03",
  kpk: "03",
  punjab: "04",
  sindh: "05",
  "fata": "03",
  "federally administered tribal areas": "03",
};

function toProvinceCode(name) {
  if (!name || typeof name !== "string") return null;
  const key = name.toLowerCase().replace(/\s+/g, " ").trim();
  return PROVINCE_MAP[key] ?? PROVINCE_MAP[key.replace(/\s/g, "")] ?? null;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function importProvinces(client) {
  console.log("[1/3] Fetching GADM Pakistan ADM1 (provinces)...");
  const data = await fetchJson("https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_PAK_1.json");
  const features = data.features || [];
  console.log(`  Found ${features.length} provinces.`);

  let updated = 0;
  for (const f of features) {
    const props = f.properties || {};
    const name = props.NAME_1 || props.name || "Unknown";
    const code = toProvinceCode(name);
    if (!code) {
      console.warn(`  Skipping unmapped province: ${name}`);
      continue;
    }
    try {
      const geoJson = JSON.stringify(f.geometry);
      // pakistan_provinces.geom is Polygon - GADM gives MultiPolygon; use largest part
      await client.query(
        `UPDATE pakistan_provinces SET geom = (
          SELECT geom FROM (
            SELECT (ST_Dump(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))).geom as geom
          ) x
          ORDER BY ST_Area(geom) DESC LIMIT 1
        )
         WHERE code = $2`,
        [geoJson, code]
      );
      updated++;
      console.log(`  Updated ${name} (${code})`);
    } catch (e) {
      console.warn(`  Skip ${name}: ${e.message}`);
    }
  }
  console.log(`  Updated ${updated} province boundaries.`);
}

async function importDistricts(client) {
  console.log("[2/3] Fetching GADM Pakistan ADM2 (districts)...");
  const data = await fetchJson("https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_PAK_2.json");
  const features = data.features || [];
  console.log(`  Found ${features.length} districts.`);

  let updated = 0;
  for (const f of features) {
    const props = f.properties || {};
    const name = (props.NAME_2 || props.name || "Unknown").trim();
    const provName = props.NAME_1 || "";
    const code = toProvinceCode(provName);
    if (!code) continue;
    const gid = props.GID_2 || props.GID_1 || `${code}-${name}`;
    const geoId = Math.abs(hashCode(gid)) || 1;
    const geoJson = JSON.stringify(f.geometry);
    try {
      await client.query(
        `INSERT INTO pakistan_districts (geonameid, name, province_code, geom)
         VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))
         ON CONFLICT (geonameid) DO UPDATE SET
           name = EXCLUDED.name,
           province_code = EXCLUDED.province_code,
           geom = EXCLUDED.geom`,
        [geoId, name, code, geoJson]
      );
      updated++;
    } catch (e) {
      console.warn(`  Skip district ${name}: ${e.message}`);
    }
  }
  console.log(`  Imported/updated ${updated} district boundaries.`);
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) || 1;
}

async function main() {
  console.log("Pakistan GeoBoundaries Import (GADM)");
  console.log("=====================================");
  const client = await pool.connect();
  try {
    await client.query("SELECT 1 FROM pakistan_provinces LIMIT 1");
    await client.query("SELECT 1 FROM pakistan_districts LIMIT 1");
  } catch (e) {
    console.error("ERROR: Run npm run setup:pakistan first.");
    process.exit(1);
  }

  try {
    await importProvinces(client);
    await importDistricts(client);
    console.log("\n[3/3] Done. Province and district boundaries updated from GADM.");
  } catch (e) {
    console.error("Import failed:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
