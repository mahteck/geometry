/**
 * Classify fences into route types (motorway, highway, intracity) based on name patterns.
 *
 * - Adds route_type column to the fences table if it does not exist.
 * - Fills route_type using simple heuristics on the fence name.
 * - Non-destructive: never deletes rows; only updates route_type.
 *
 * Usage:
 *   node scripts/classify-fence-route-type.mjs
 *   or: npm run classify:fences:route-type
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

config({ path: join(ROOT, ".env.local") });
config({ path: join(ROOT, ".env"), override: true });

// Resolve fences table name similar to lib/fenceApi.ts
const rawTable = (process.env.FENCES_TABLE || "fence").trim();
const FENCES_TABLE = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rawTable)
  ? rawTable
  : "fence";

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 15000,
});

async function ensureColumn(client) {
  console.log(`Using fences table: ${FENCES_TABLE}`);
  console.log("Ensuring route_type column exists...");
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = '${FENCES_TABLE}'
          AND column_name = 'route_type'
      ) THEN
        EXECUTE 'ALTER TABLE ${FENCES_TABLE} ADD COLUMN route_type text';
      END IF;
    END;
    $$;
  `);
  console.log("  route_type column OK.");
}

async function classifyByName(client) {
  console.log("Classifying fences by name patterns...");

  // Motorway: M-xx, 'Motorway', 'M xx'
  const motorwaySql = `
    UPDATE ${FENCES_TABLE}
    SET route_type = 'motorway'
    WHERE (route_type IS NULL OR route_type = '')
      AND name IS NOT NULL
      AND (
        name ILIKE '%motorway%' OR
        name ~* '\\yM- ?[0-9]+' OR
        name ~* '\\bM ?[0-9]+\\b'
      )
  `;
  const motorwayRes = await client.query(motorwaySql);
  console.log(`  Motorway classified: ${motorwayRes.rowCount ?? 0}`);

  // Highway: N-xx, 'Highway', 'National Highway', 'GT Road'
  const highwaySql = `
    UPDATE ${FENCES_TABLE}
    SET route_type = 'highway'
    WHERE (route_type IS NULL OR route_type = '')
      AND name IS NOT NULL
      AND (
        name ILIKE '%highway%' OR
        name ILIKE '%national highway%' OR
        name ILIKE '%GT Road%' OR
        name ~* '\\yN- ?[0-9]+' OR
        name ~* '\\bN ?[0-9]+\\b'
      )
  `;
  const highwayRes = await client.query(highwaySql);
  console.log(`  Highway classified: ${highwayRes.rowCount ?? 0}`);

  // Intracity / local: names that look like city/local areas and are relatively small
  const intracitySql = `
    UPDATE ${FENCES_TABLE}
    SET route_type = 'intracity'
    WHERE (route_type IS NULL OR route_type = '')
      AND name IS NOT NULL
      AND (
        name ILIKE '%city%' OR
        name ILIKE '%town%' OR
        name ILIKE '%mandi%' OR
        name ILIKE '%market%' OR
        name ILIKE '%block%' OR
        name ILIKE '%sector%'
      )
      AND ST_Area(geom::geography) <= 20000000 -- ~20 km², heuristic for local areas
  `;
  const intracityRes = await client.query(intracitySql);
  console.log(`  Intracity classified: ${intracityRes.rowCount ?? 0}`);

  // Clear wrongly classified intracity: very large polygons (e.g. provincial/regional) should not be "Intracity"
  const clearLargeIntracitySql = `
    UPDATE ${FENCES_TABLE}
    SET route_type = NULL
    WHERE LOWER(TRIM(COALESCE(route_type, ''))) = 'intracity'
      AND ST_Area(geom::geography) > 20000000
  `;
  const clearRes = await client.query(clearLargeIntracitySql);
  console.log(`  Cleared intracity for large polygons (>20 km²): ${clearRes.rowCount ?? 0}`);

  // Sanitize "other": clear existing so we re-apply with strict rules only
  const clearOtherSql = `
    UPDATE ${FENCES_TABLE}
    SET route_type = NULL
    WHERE LOWER(TRIM(COALESCE(route_type, ''))) = 'other'
  `;
  const clearOtherRes = await client.query(clearOtherSql);
  console.log(`  Cleared existing 'other' for re-classification: ${clearOtherRes.rowCount ?? 0}`);

  // Other = only clear regional/boundary polygons (narrow definition for data sanity)
  // - Name contains "boundary" OR
  // - Name contains two provinces (e.g. Sindh + Punjab/POK) = multi-province boundary
  // We do NOT use: single province, district, region, or area alone (too many false positives)
  const otherSql = `
    UPDATE ${FENCES_TABLE}
    SET route_type = 'other'
    WHERE (route_type IS NULL OR TRIM(COALESCE(route_type, '')) = '')
      AND name IS NOT NULL
      AND (
        name ILIKE '%boundary%'
        OR (name ILIKE '%Sindh%' AND (name ILIKE '%Punjab%' OR name ILIKE '%POK%'))
        OR (name ILIKE '%Punjab%' AND name ILIKE '%POK%')
        OR (name ILIKE '%Kashmir%' AND (name ILIKE '%Punjab%' OR name ILIKE '%Sindh%'))
      )
  `;
  const otherRes = await client.query(otherSql);
  console.log(`  Other (regional/boundary only) classified: ${otherRes.rowCount ?? 0}`);
}

async function main() {
  console.log("Fence route-type classification");
  console.log("================================");

  const client = await pool.connect();
  try {
    await ensureColumn(client);
    await classifyByName(client);

    const stats = await client.query(`
      SELECT
        COUNT(*)                          AS total,
        COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(route_type, ''))) = 'motorway')   AS motorway,
        COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(route_type, ''))) = 'highway')    AS highway,
        COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(route_type, ''))) = 'intracity')  AS intracity,
        COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(route_type, ''))) = 'other')      AS other,
        COUNT(*) FILTER (WHERE route_type IS NULL OR TRIM(route_type) = '') AS unclassified
      FROM ${FENCES_TABLE}
    `);
    const s = stats.rows[0] || {};
    console.log("\nSummary:");
    console.log(`  Total fences      : ${s.total}`);
    console.log(`  Motorway          : ${s.motorway}`);
    console.log(`  Highway           : ${s.highway}`);
    console.log(`  Intracity         : ${s.intracity}`);
    console.log(`  Other (regional)  : ${s.other}`);
    console.log(`  Unclassified (NULL): ${s.unclassified}`);
    console.log("\nDone. You can re-run this script after manually adjusting names to improve classification.");
  } catch (e) {
    console.error("Classification failed:", e.message ?? e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

