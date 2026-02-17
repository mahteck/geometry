/**
 * Set fences_master.region_name from centroid vs pakistan_provinces.
 * Run after 013 (or if fence had no region). Requires pakistan_provinces with geom.
 *
 * Usage: node scripts/classify-fences-master-region.mjs
 * Or: npm run classify:fences-master:region
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
});

async function main() {
  const client = await pool.connect();
  try {
    const hasProvinces = await client.query(`
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pakistan_provinces'
    `);
    if (!hasProvinces.rows.length) {
      console.log("pakistan_provinces not found. Run: npm run setup:pakistan && npm run import:pakistan:boundaries");
      process.exit(1);
    }

    const updateByCentroid = `
      UPDATE fences_master f
      SET region_name = (
        SELECT p.name FROM pakistan_provinces p
        WHERE p.geom IS NOT NULL AND ST_Contains(p.geom, ST_Centroid(f.geom))
        LIMIT 1
      )
      WHERE f.geom IS NOT NULL
    `;
    const r1 = await client.query(updateByCentroid);
    console.log("Assigned by centroid:", r1.rowCount ?? 0);

    await client.query(`
      UPDATE fences_master
      SET region_name = 'Other'
      WHERE geom IS NOT NULL AND (region_name IS NULL OR TRIM(COALESCE(region_name, '')) = '')
    `);

    const stats = await client.query(`
      SELECT region_name, COUNT(*) AS c FROM fences_master
      WHERE region_name IS NOT NULL AND TRIM(region_name) != ''
      GROUP BY region_name ORDER BY c DESC
    `);
    console.log("By region_name:", stats.rows);
    console.log("Done. Region filter (e.g. Sindh) will work on /gis-map.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
