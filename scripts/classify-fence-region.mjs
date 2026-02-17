/**
 * Set fence region from actual lat/long: centroid of each fence polygon is
 * tested against pakistan_provinces boundaries (ST_Contains). So region = real
 * province name (Punjab, Sindh, Khyber Pakhtunkhwa, etc.). If centroid is
 * outside all provinces, region = 'Other'.
 *
 * Requires: pakistan_provinces table with geom populated (run setup:pakistan
 * and import:pakistan:boundaries first).
 *
 * Usage:
 *   node scripts/classify-fence-region.mjs
 *   or: npm run classify:fences:region
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

config({ path: join(ROOT, ".env.local") });
config({ path: join(ROOT, ".env"), override: true });

const rawTable = (process.env.FENCES_TABLE || "fence").trim();
const FENCES_TABLE = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rawTable) ? rawTable : "fence";

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 30000,
});

async function ensureColumn(client) {
  console.log(`Using fences table: ${FENCES_TABLE}`);
  console.log("Ensuring region column exists...");
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = '${FENCES_TABLE}' AND column_name = 'region'
      ) THEN
        ALTER TABLE ${FENCES_TABLE} ADD COLUMN region text;
      END IF;
    END;
    $$;
  `);
  console.log("  region column OK.");
}

async function classifyByGeometry(client) {
  console.log("Setting region from centroid vs pakistan_provinces (lat/long)...");

  const hasProvinces = await client.query(`
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pakistan_provinces'
  `);
  if (!hasProvinces.rows.length) {
    console.log("  pakistan_provinces table not found. Run: npm run setup:pakistan && npm run import:pakistan:boundaries");
    return false;
  }

  const withGeom = await client.query(`
    SELECT COUNT(*) AS c FROM pakistan_provinces WHERE geom IS NOT NULL
  `);
  if (parseInt(withGeom.rows[0]?.c ?? "0", 10) === 0) {
    console.log("  pakistan_provinces has no geometry. Run: npm run import:pakistan:boundaries");
    return false;
  }

  const updateByCentroid = `
    UPDATE ${FENCES_TABLE} f
    SET region = (
      SELECT p.name FROM pakistan_provinces p
      WHERE p.geom IS NOT NULL
        AND ST_Contains(p.geom, ST_Centroid(f.geom))
      LIMIT 1
    )
    WHERE f.geom IS NOT NULL
  `;
  const r1 = await client.query(updateByCentroid);
  console.log(`  Assigned by centroid: ${r1.rowCount ?? 0} fences`);

  const otherSql = `
    UPDATE ${FENCES_TABLE}
    SET region = 'Other'
    WHERE geom IS NOT NULL AND (region IS NULL OR TRIM(COALESCE(region, '')) = '')
  `;
  const r2 = await client.query(otherSql);
  console.log(`  Set to Other (outside provinces): ${r2.rowCount ?? 0}`);

  return true;
}

async function classifyRegion(client) {
  const ok = await classifyByGeometry(client);
  if (!ok) {
    console.log("  Fallback: setting region from name (Lahore/Karachi/Islamabad → else Other)...");
    const lahoreSql = `UPDATE ${FENCES_TABLE} SET region = 'Lahore' WHERE (region IS NULL OR TRIM(COALESCE(region, '')) = '') AND name ILIKE '%lahore%'`;
    const karachiSql = `UPDATE ${FENCES_TABLE} SET region = 'Karachi' WHERE (region IS NULL OR TRIM(COALESCE(region, '')) = '') AND name ILIKE '%karachi%'`;
    const islamabadSql = `UPDATE ${FENCES_TABLE} SET region = 'Islamabad' WHERE (region IS NULL OR TRIM(COALESCE(region, '')) = '') AND name ILIKE '%islamabad%'`;
    await client.query(lahoreSql);
    await client.query(karachiSql);
    await client.query(islamabadSql);
    const otherSql = `UPDATE ${FENCES_TABLE} SET region = 'Other' WHERE region IS NULL OR TRIM(COALESCE(region, '')) = ''`;
    await client.query(otherSql);
  }
}

async function main() {
  console.log("Fence region classification");
  console.log("============================");

  const client = await pool.connect();
  try {
    await ensureColumn(client);
    await classifyRegion(client);

    const stats = await client.query(`
      SELECT region, COUNT(*) AS c
      FROM ${FENCES_TABLE}
      WHERE region IS NOT NULL AND TRIM(region) != ''
      GROUP BY region
      ORDER BY c DESC
    `);
    const totalRes = await client.query(`SELECT COUNT(*) AS total FROM ${FENCES_TABLE}`);
    const total = totalRes.rows[0]?.total ?? 0;
    console.log("\nSummary (region = actual province name by lat/long):");
    console.log(`  Total   : ${total}`);
    for (const row of stats.rows) {
      console.log(`  ${row.region} : ${row.c}`);
    }
    console.log("\nDone. Filter by region=<province name> in API (e.g. Punjab, Sindh, Other).");
  } catch (e) {
    console.error("Classification failed:", e?.message ?? e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
