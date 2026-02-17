/**
 * Clip fences_master geometries to Pakistan boundary (pakistan_provinces union).
 * - Fences that extend into India (Srinagar), Afghanistan, etc. are trimmed to only the part inside Pakistan.
 * - Fences entirely outside Pakistan get geom = NULL and region_name = 'Outside Pakistan'.
 *
 * Requires: pakistan_provinces with geom populated (npm run import:pakistan:boundaries).
 *
 * Usage: node scripts/clip-fences-to-pakistan.mjs
 * Or: npm run clip:fences:pakistan
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

async function main() {
  const client = await pool.connect();
  try {
    const hasProvinces = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'pakistan_provinces'
    `);
    if (!hasProvinces.rows.length) {
      console.log("pakistan_provinces not found. Run: npm run setup:pakistan && npm run import:pakistan:boundaries");
      process.exit(1);
    }

    const withGeom = await client.query(`
      SELECT COUNT(*) AS c FROM pakistan_provinces WHERE geom IS NOT NULL
    `);
    if (parseInt(withGeom.rows[0]?.c ?? "0", 10) === 0) {
      console.log("pakistan_provinces has no geometry. Run: npm run import:pakistan:boundaries");
      process.exit(1);
    }

    console.log("Building Pakistan boundary (union of provinces)...");
    await client.query(`
      CREATE TEMP TABLE IF NOT EXISTS _pak_boundary AS
      SELECT ST_Union(geom) AS geom FROM pakistan_provinces WHERE geom IS NOT NULL
    `);

    console.log("Clipping fences to Pakistan (intersecting parts only)...");
    const clipRes = await client.query(`
      UPDATE fences_master f
      SET geom = ST_Multi(ST_CollectionExtract(ST_Intersection(f.geom, b.geom), 3))
      FROM _pak_boundary b
      WHERE f.geom IS NOT NULL
        AND ST_Intersects(f.geom, b.geom)
        AND NOT ST_Within(f.geom, b.geom)
    `);
    console.log(`  Clipped (trimmed to Pakistan): ${clipRes.rowCount ?? 0} fences`);

    console.log("Marking fences entirely outside Pakistan...");
    const outsideRes = await client.query(`
      UPDATE fences_master f
      SET geom = NULL, region_name = 'Outside Pakistan'
      FROM _pak_boundary b
      WHERE f.geom IS NOT NULL
        AND NOT ST_Intersects(f.geom, b.geom)
    `);
    console.log(`  Outside Pakistan (geom cleared, region_name set): ${outsideRes.rowCount ?? 0}`);

    const stats = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE geom IS NOT NULL) AS with_geom,
        COUNT(*) FILTER (WHERE region_name = 'Outside Pakistan') AS outside_pakistan
      FROM fences_master
    `);
    const s = stats.rows[0] || {};
    console.log("\nSummary: total", s.total, "| with geometry", s.with_geom, "| outside Pakistan", s.outside_pakistan);
    console.log("Done. Fences extending into Srinagar/Afghanistan are now clipped to Pakistan only.");
  } catch (e) {
    console.error(e?.message ?? e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
