/**
 * Classify fences_master.route_type by name patterns (motorway, highway, intracity, other).
 * Does not add column; fences_master already has route_type.
 *
 * Usage: node scripts/classify-fences-master-route-type.mjs
 * Or: npm run classify:fences-master:route-type
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

async function classifyByName(client) {
  const T = "fences_master";
  console.log("Classifying fences_master by name patterns...");

  const motorwaySql = `
    UPDATE ${T} SET route_type = 'motorway'
    WHERE (route_type IS NULL OR TRIM(COALESCE(route_type, '')) = '')
      AND name IS NOT NULL
      AND (name ILIKE '%motorway%' OR name ~* '\\yM- ?[0-9]+' OR name ~* '\\bM ?[0-9]+\\b')
  `;
  await client.query(motorwaySql);

  const highwaySql = `
    UPDATE ${T} SET route_type = 'highway'
    WHERE (route_type IS NULL OR TRIM(COALESCE(route_type, '')) = '')
      AND name IS NOT NULL
      AND (name ILIKE '%highway%' OR name ILIKE '%national highway%' OR name ILIKE '%GT Road%'
           OR name ~* '\\yN- ?[0-9]+' OR name ~* '\\bN ?[0-9]+\\b')
  `;
  await client.query(highwaySql);

  const intracitySql = `
    UPDATE ${T} SET route_type = 'intracity'
    WHERE (route_type IS NULL OR TRIM(COALESCE(route_type, '')) = '')
      AND name IS NOT NULL
      AND (name ILIKE '%city%' OR name ILIKE '%town%' OR name ILIKE '%mandi%'
           OR name ILIKE '%market%' OR name ILIKE '%block%' OR name ILIKE '%sector%')
      AND ST_Area(geom::geography) <= 20000000
  `;
  await client.query(intracitySql);

  await client.query(`
    UPDATE ${T} SET route_type = NULL
    WHERE LOWER(TRIM(COALESCE(route_type, ''))) = 'intracity'
      AND ST_Area(geom::geography) > 20000000
  `);

  await client.query(`
    UPDATE ${T} SET route_type = NULL
    WHERE LOWER(TRIM(COALESCE(route_type, ''))) = 'other'
  `);

  const otherSql = `
    UPDATE ${T} SET route_type = 'other'
    WHERE (route_type IS NULL OR TRIM(COALESCE(route_type, '')) = '')
      AND name IS NOT NULL
      AND (name ILIKE '%boundary%'
           OR (name ILIKE '%Sindh%' AND (name ILIKE '%Punjab%' OR name ILIKE '%POK%'))
           OR (name ILIKE '%Punjab%' AND name ILIKE '%POK%')
           OR (name ILIKE '%Kashmir%' AND (name ILIKE '%Punjab%' OR name ILIKE '%Sindh%')))
  `;
  await client.query(otherSql);
}

async function main() {
  const client = await pool.connect();
  try {
    await classifyByName(client);
    const stats = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(route_type, ''))) = 'motorway') AS motorway,
        COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(route_type, ''))) = 'highway') AS highway,
        COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(route_type, ''))) = 'intracity') AS intracity,
        COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(route_type, ''))) = 'other') AS other,
        COUNT(*) FILTER (WHERE route_type IS NULL OR TRIM(COALESCE(route_type, '')) = '') AS unclassified
      FROM fences_master
    `);
    const s = stats.rows[0] || {};
    console.log("Summary:", s);
    console.log("Done.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
