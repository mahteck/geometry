/**
 * Review fence + fences_master: counts for outside Pakistan, extends outside, invalid geom.
 * Helps see why many fences show red on the map.
 *
 * Usage: node scripts/review-fence-tables-pakistan.mjs
 * Or: npm run review:fences:pakistan
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

async function reviewTable(client, tableName) {
  const hasProvinces = await client.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pakistan_provinces'
  `);
  if (!hasProvinces.rows.length) {
    return { error: "pakistan_provinces not found" };
  }

  const geomCol = tableName === "fence" ? "geom" : "geom";
  const base = `FROM ${tableName} f WHERE f.${geomCol} IS NOT NULL`;
  const totalRes = await client.query(`SELECT COUNT(*) AS c ${base}`);
  const total = parseInt(totalRes.rows[0]?.c ?? "0", 10);

  const invalidRes = await client.query(`
    SELECT COUNT(*) AS c ${base} AND NOT ST_IsValid(f.${geomCol})
  `);
  const invalid = parseInt(invalidRes.rows[0]?.c ?? "0", 10);

  const pakBoundary = `
    WITH pak_boundary AS (
      SELECT ST_Union(geom) AS geom FROM pakistan_provinces WHERE geom IS NOT NULL
    ),
    snapped AS (
      SELECT f.id,
        ST_SnapToGrid(ST_MakeValid(f.${geomCol}), 0.00001) AS f_snap,
        ST_SnapToGrid(ST_MakeValid(b.geom), 0.00001) AS b_snap
      FROM ${tableName} f, pak_boundary b
      WHERE f.${geomCol} IS NOT NULL
    )
    SELECT s.id,
      NOT ST_Intersects(s.f_snap, s.b_snap) AS outside,
      (ST_Intersects(s.f_snap, s.b_snap) AND NOT ST_Covers(s.b_snap, s.f_snap)) AS extends_outside
    FROM snapped s
  `;
  const pakRes = await client.query(pakBoundary);
  let outside = 0;
  let extendsOutside = 0;
  for (const row of pakRes.rows) {
    if (row.outside) outside++;
    else if (row.extends_outside) extendsOutside++;
  }

  return {
    total,
    invalid,
    outsidePakistan: outside,
    extendsOutsidePakistan: extendsOutside,
    redReasons: {
      outsidePakistan: outside,
      extendsOutsidePakistan: extendsOutside,
      invalidGeometry: invalid,
      totalRed: Math.max(outside + extendsOutside, invalid) + (invalid > 0 ? 0 : 0),
    },
  };
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("Reviewing both tables (Pakistan boundary = pakistan_provinces union)\n");

    const fenceStats = await reviewTable(client, "fence").catch((e) => ({ error: e.message }));
    console.log("--- fence (Map page) ---");
    if (fenceStats.error) {
      console.log("  Error:", fenceStats.error);
    } else {
      console.log("  Total with geom:", fenceStats.total);
      console.log("  Invalid geometry (ST_IsValid = false):", fenceStats.invalid);
      console.log("  Entirely outside Pakistan:", fenceStats.outsidePakistan);
      console.log("  Extends outside Pakistan:", fenceStats.extendsOutsidePakistan);
      const red = fenceStats.outsidePakistan + fenceStats.extendsOutsidePakistan + (fenceStats.invalid > 0 ? fenceStats.invalid : 0);
      console.log("  → Likely red on map (outside + extends + invalid):", red);
    }

    console.log("");

    const masterStats = await reviewTable(client, "fences_master").catch((e) => ({ error: e.message }));
    console.log("--- fences_master (GIS page) ---");
    if (masterStats.error) {
      console.log("  Error:", masterStats.error);
    } else {
      console.log("  Total with geom:", masterStats.total);
      console.log("  Invalid geometry:", masterStats.invalid);
      console.log("  Entirely outside Pakistan:", masterStats.outsidePakistan);
      console.log("  Extends outside Pakistan:", masterStats.extendsOutsidePakistan);
      const red = masterStats.outsidePakistan + masterStats.extendsOutsidePakistan + (masterStats.invalid > 0 ? masterStats.invalid : 0);
      console.log("  → Likely red on map:", red);
    }

    console.log("\nDone. Run: npm run clip:fences:pakistan — then refresh map and re-run this script to compare.");
  } finally {
    client.release();
    await pool.end();
  }
}

main();
