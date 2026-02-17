/**
 * Import Pakistan cities/places from OpenStreetMap (Overpass API).
 * Better coordinates than GeoNames for tracking/trips.
 *
 * Usage: node scripts/import-pakistan-osm-places.mjs
 * Or: npm run import:pakistan:osm
 *
 * Requires: npm run setup:pakistan first, and optionally run import:pakistan:boundaries for GADM boundaries.
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
  connectionTimeoutMillis: 60000,
});

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
// Pakistan bbox
const BBOX = "23.69,60.87,37.08,77.84";

const OVERPASS_QUERY = `
[out:json][timeout:120];
(
  node["place"~"city|town|village|hamlet"](${BBOX});
  way["place"~"city|town|village|hamlet"](${BBOX});
);
out center;

async function fetchOverpass() {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log("Pakistan OSM Places Import");
  console.log("==========================");
  console.log("Fetching places from OpenStreetMap (Overpass API)...");
  console.log("This may take 1-2 minutes...");

  const client = await pool.connect();
  try {
    await client.query("SELECT 1 FROM pakistan_cities LIMIT 1");
  } catch (e) {
    console.error("ERROR: Run npm run setup:pakistan first.");
    process.exit(1);
  }

  try {
    const data = await fetchOverpass();
    const elements = data.elements || [];
    const places = [];

    for (const el of elements) {
      let lat, lon, name;
      if (el.type === "node") {
        lat = el.lat;
        lon = el.lon;
      } else if (el.type === "way" && el.center) {
        lat = el.center.lat;
        lon = el.center.lon;
      } else continue;
      name = el.tags?.name || el.tags?.["name:en"] || `Place_${el.id}`;
      const pop = parseInt(el.tags?.population || "0", 10) || 0;
      const admin = (el.tags?.["addr:state"] || el.tags?.["is_in:state"] || "").toLowerCase();
      const provCode = { punjab: "04", sindh: "05", "khyber pakhtunkhwa": "03", "kpk": "03", balochistan: "02", "gilgit-baltistan": "01", "ajk": "06", "azad kashmir": "06", islamabad: "07" }[admin] || null;
      places.push({
        id: el.id,
        name: String(name).slice(0, 200),
        lat,
        lon,
        population: pop,
        provinceCode: provCode,
      });
    }

    console.log(`  Found ${places.length} OSM places.`);

    if (places.length === 0) {
      console.log("No places to import. Overpass may have timed out - try again or use: npm run import:pakistan (with bbox filter).");
      return;
    }

    // Clear existing cities and insert OSM (or merge - for now we'll do upsert by a generated geonameid)
    const batchSize = 500;
    let inserted = 0;
    for (let i = 0; i < places.length; i += batchSize) {
      const batch = places.slice(i, i + batchSize);
      const values = [];
      const placeholders = [];
      let idx = 0;
      for (const p of batch) {
        const gid = 900000000 + Math.abs(p.id % 100000000);
        placeholders.push(`($${++idx}, $${++idx}, $${++idx}, $${++idx}, $${++idx}, $${++idx}, $${++idx}, ST_SetSRID(ST_MakePoint($${++idx}, $${++idx}), 4326))`);
        values.push(gid, p.name, "", p.provinceCode, null, p.lat, p.lon, p.population, p.lon, p.lat);
      }
      await client.query(
        `INSERT INTO pakistan_cities (geonameid, name, name_alternate, province_code, district_name, latitude, longitude, population, geom)
         VALUES ${placeholders.join(", ")}
         ON CONFLICT (geonameid) DO UPDATE SET
           name = EXCLUDED.name,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           population = EXCLUDED.population,
           geom = EXCLUDED.geom`,
        values
      );
      inserted += batch.length;
      process.stdout.write(`\r  Imported ${inserted}/${places.length}...`);
    }
    console.log(`\n  Done. ${inserted} places imported from OSM.`);
  } catch (e) {
    console.error("\nImport failed:", e.message);
    console.error("Fallback: use npm run import:pakistan (GeoNames with Pakistan bbox filter).");
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
