/**
 * Clip fence geometries to Pakistan boundary (pakistan_provinces union).
 * Runs for both fences_master and fence table (Map page uses fence, GIS uses fences_master).
 * - Fences that extend outside Pakistan are trimmed to the part inside.
 * - Fences entirely outside get geom = NULL and region/region_name = 'Outside Pakistan'.
 * - Optional: simplify geometries (Douglas–Peucker style) to reduce points while preserving shape.
 *
 * Requires: pakistan_provinces with geom populated (npm run import:pakistan:boundaries).
 *
 * Usage: node scripts/clip-fences-to-pakistan.mjs [--simplify]
 * Or: npm run clip:fences:pakistan
 * Env: SIMPLIFY_TOLERANCE=0.00005 (degrees, ~5m; default 0.00005)
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

const DO_SIMPLIFY = process.argv.includes("--simplify");
const SIMPLIFY_TOLERANCE = parseFloat(process.env.SIMPLIFY_TOLERANCE || "0.00005", 10) || 0.00005;

/** Clip a table to Pakistan. tableName: 'fences_master' | 'fence'. regionCol: 'region_name' | 'region'. */
async function clipTable(client, tableName, regionCol) {
  const clipRes = await client.query(`
    UPDATE ${tableName} f
    SET geom = ST_RemoveRepeatedPoints(ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SnapToGrid(ST_Intersection(f.geom, b.geom), 0.00001)), 3)), 0.00001)
    FROM _pak_boundary b
    WHERE f.geom IS NOT NULL
      AND ST_Intersects(f.geom, b.geom)
      AND NOT ST_Covers(b.geom, f.geom)
  `);
  console.log(`  [${tableName}] Clipped (trimmed to Pakistan): ${clipRes.rowCount ?? 0} fences`);

  const outsideRes = await client.query(`
    UPDATE ${tableName} f
    SET geom = NULL, ${regionCol} = 'Outside Pakistan'
    FROM _pak_boundary b
    WHERE f.geom IS NOT NULL
      AND NOT ST_Intersects(f.geom, b.geom)
  `);
  console.log(`  [${tableName}] Outside Pakistan (geom cleared, ${regionCol} set): ${outsideRes.rowCount ?? 0}`);
}

/** Simplify geometries (Douglas–Peucker style) to reduce points; only where point count > minPoints. */
async function simplifyTable(client, tableName, minPoints = 80) {
  const geomCol = "geom";
  const res = await client.query(`
    UPDATE ${tableName} f
    SET geom = ST_MakeValid(ST_SimplifyPreserveTopology(f.${geomCol}, $1))
    WHERE f.${geomCol} IS NOT NULL
      AND ST_NPoints(f.${geomCol}) > $2
  `, [SIMPLIFY_TOLERANCE, minPoints]);
  console.log(`  [${tableName}] Simplified (tolerance=${SIMPLIFY_TOLERANCE}, npoints>${minPoints}): ${res.rowCount ?? 0} fences`);
}

/** Clip fence table; geom may be Polygon so use largest part if MultiPolygon fails. */
async function clipFenceTable(client) {
  const hasRegion = await client.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fence' AND column_name = 'region'
  `);
  const regionCol = hasRegion.rows.length ? "region" : "region_name";
  const hasRegionName = await client.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fence' AND column_name = 'region_name'
  `);
  const setCol = hasRegion.rows.length ? "region" : (hasRegionName.rows.length ? "region_name" : null);
  if (!setCol) {
    console.log("  [fence] No region/region_name column; outside rows will only have geom = NULL.");
  }

  try {
    const clipRes = await client.query(`
      UPDATE fence f
      SET geom = ST_RemoveRepeatedPoints(ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SnapToGrid(ST_Intersection(f.geom, b.geom), 0.00001)), 3)), 0.00001)
      FROM _pak_boundary b
      WHERE f.geom IS NOT NULL
        AND ST_Intersects(f.geom, b.geom)
        AND NOT ST_Covers(b.geom, f.geom)
    `);
    console.log(`  [fence] Clipped (trimmed to Pakistan): ${clipRes.rowCount ?? 0} fences`);
  } catch (e) {
    if (e.message && (e.message.includes("geometry") || e.message.includes("MultiPolygon") || e.message.includes("type"))) {
      console.log("  [fence] geom may be Polygon; using largest part of intersection...");
      const lateralRes = await client.query(`
        WITH clipped AS (
          SELECT f.id,
            (SELECT ST_RemoveRepeatedPoints(ST_SnapToGrid(ST_MakeValid((d).geom), 0.00001), 0.00001)::geometry(Polygon, 4326)
             FROM ST_Dump(ST_CollectionExtract(ST_Intersection(f.geom, b.geom), 3)) AS d
             ORDER BY ST_Area((d).geom::geography) DESC NULLS LAST
             LIMIT 1) AS new_geom
          FROM fence f, _pak_boundary b
          WHERE f.geom IS NOT NULL
            AND ST_Intersects(f.geom, b.geom)
            AND NOT ST_Covers(b.geom, f.geom)
        )
        UPDATE fence f
        SET geom = c.new_geom
        FROM clipped c
        WHERE f.id = c.id AND c.new_geom IS NOT NULL
      `);
      console.log(`  [fence] Clipped (largest part): ${lateralRes.rowCount ?? 0} fences`);
    } else {
      throw e;
    }
  }

  const setClause = setCol ? `geom = NULL, ${setCol} = 'Outside Pakistan'` : "geom = NULL";
  const outsideRes = await client.query(`
    UPDATE fence f
    SET ${setClause}
    FROM _pak_boundary b
    WHERE f.geom IS NOT NULL
      AND NOT ST_Intersects(f.geom, b.geom)
  `);
  console.log(`  [fence] Outside Pakistan (geom cleared): ${outsideRes.rowCount ?? 0}`);
}

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

    console.log("Clipping fences_master to Pakistan...");
    await clipTable(client, "fences_master", "region_name");

    const hasFence = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'fence'
    `);
    if (hasFence.rows.length) {
      console.log("Clipping fence table (Map page) to Pakistan...");
      await clipFenceTable(client);
    } else {
      console.log("(fence table not found; skipping)");
    }

    if (DO_SIMPLIFY) {
      console.log("\nSimplifying geometries (reduce points, preserve shape)...");
      await simplifyTable(client, "fences_master");
      if (hasFence.rows.length) await simplifyTable(client, "fence");
      console.log("Re-clipping after simplify (ensure none extend outside)...");
      await clipTable(client, "fences_master", "region_name");
      if (hasFence.rows.length) await clipFenceTable(client);
    }

    const statsMaster = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE geom IS NOT NULL) AS with_geom,
        COUNT(*) FILTER (WHERE region_name = 'Outside Pakistan') AS outside_pakistan
      FROM fences_master
    `);
    const s = statsMaster.rows[0] || {};
    console.log("\n[fences_master] total", s.total, "| with geometry", s.with_geom, "| outside Pakistan", s.outside_pakistan);

    if (hasFence.rows.length) {
      const statsFence = await client.query(`
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE geom IS NOT NULL) AS with_geom FROM fence
      `).catch(() => ({ rows: [{ total: 0, with_geom: 0 }] }));
      const s2 = statsFence.rows[0] || {};
      console.log("[fence] total", s2.total, "| with geometry", s2.with_geom);
    }
    console.log("Done. Fences extending outside Pakistan are now clipped; entirely outside are marked.");
  } catch (e) {
    console.error(e?.message ?? e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
