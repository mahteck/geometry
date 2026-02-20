/**
 * Create fence-related tables in mfm_db and copy data from source DB (vehicle_tracking).
 * Uses: DB_* for source, DB_NAME1, DB_USER1, DB_PASSWORD1 for target (same host/port).
 *
 * Tables: fence1 (copy of source "fence" – target "fence" is left untouched), fences_master,
 *        roads_master, regions_master, cities_master, areas_master, gis_config, pakistan_provinces.
 *
 * Usage: node scripts/sync-fence-tables-to-mfm.mjs
 * Or: npm run sync:fence-tables:mfm
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, readdirSync } from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });
config({ path: join(root, ".env"), override: true });

const sourcePool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 30000,
});

const targetPool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  database: process.env.DB_NAME1,
  user: process.env.DB_USER1,
  password: process.env.DB_PASSWORD1,
  connectionTimeoutMillis: 30000,
});

const migrationsDir = join(root, "db", "migrations");

function runSql(client, sql) {
  return client.query(sql);
}

async function runMigrations(target) {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql") && /^00[1-7]_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    try {
      await target.query(sql);
    } catch (e) {
      if (!e.message?.includes("already exists")) throw e;
    }
    console.log(`  Ran ${file}`);
  }
}

async function ensureFence1Table(target) {
  await target.query(`
    CREATE TABLE IF NOT EXISTS fence1 (
      id SERIAL PRIMARY KEY,
      name TEXT,
      geom geometry(Polygon, 4326),
      route_type TEXT,
      region TEXT,
      address TEXT,
      city TEXT
    )
  `);
  await target.query(`CREATE INDEX IF NOT EXISTS idx_fence1_geom ON fence1 USING GIST (geom)`);
  console.log("  fence1 table OK (target 'fence' table is not touched)");
}

async function ensurePakistanProvincesTable(target) {
  await target.query(`
    CREATE TABLE IF NOT EXISTS pakistan_provinces (
      id SERIAL PRIMARY KEY,
      code VARCHAR(10) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      name_urdu VARCHAR(100),
      geom GEOMETRY(POLYGON, 4326),
      area_sqkm DECIMAL(12, 2),
      population BIGINT,
      capital_city VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await target.query("CREATE INDEX IF NOT EXISTS idx_provinces_geom ON pakistan_provinces USING GIST (geom)").catch(() => {});
  await target.query(`
    INSERT INTO pakistan_provinces (code, name, name_urdu, area_sqkm, population, capital_city)
    VALUES ('01','Gilgit-Baltistan','گلگت بلتستان',72971,1500000,'Gilgit'),
           ('02','Balochistan','بلوچستان',347190,12344000,'Quetta'),
           ('03','Khyber Pakhtunkhwa','خیبر پختونخوا',101741,35523000,'Peshawar'),
           ('04','Punjab','پنجاب',205344,110012442,'Lahore'),
           ('05','Sindh','سندھ',140914,47886000,'Karachi'),
           ('06','Azad Jammu and Kashmir','آزاد کشمیر',13297,4045366,'Muzaffarabad'),
           ('07','Islamabad','اسلام آباد',906,1009832,'Islamabad')
    ON CONFLICT (code) DO NOTHING
  `).catch(() => {});
  console.log("  pakistan_provinces table OK");
}

async function copyTable(source, target, sourceTableName, geomColumns = [], batchSize = 500, targetTableName = null) {
  const targetTable = targetTableName || sourceTableName;
  const colsRes = await source.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [sourceTableName]);
  if (colsRes.rows.length === 0) {
    console.log(`  Skip ${sourceTableName} (not in source)`);
    return 0;
  }
  const cols = colsRes.rows.map((r) => r.column_name);
  const geomCols = new Set(geomColumns.length ? geomColumns : colsRes.rows.filter((r) => r.udt_name === "geometry").map((r) => r.column_name));
  const selectCols = cols.map((c) => (geomCols.has(c) ? `ST_AsGeoJSON(${c})::text AS ${c}` : c)).join(", ");
  const countRes = await source.query(`SELECT COUNT(*) AS n FROM ${sourceTableName}`);
  const total = parseInt(countRes.rows[0]?.n ?? "0", 10);
  if (total === 0) {
    console.log(`  ${sourceTableName} → ${targetTable}: 0 rows`);
    return 0;
  }
  const hasId = cols.includes("id");
  if (targetTable === "fences_master") {
    await target.query("TRUNCATE TABLE fences_master_audit CASCADE").catch(() => {});
  }
  await target.query(`TRUNCATE TABLE ${targetTable} CASCADE`);
  let copied = 0;
  const placeholders = cols.map((_, i) => (geomCols.has(cols[i]) ? `ST_GeomFromGeoJSON($${i + 1})::geometry` : `$${i + 1}`)).join(", ");
  const insertCols = cols.join(", ");
  const conflictClause = hasId ? " ON CONFLICT (id) DO NOTHING" : "";
  const orderCol = cols.includes("id") ? "id" : cols[0];
  for (let offset = 0; offset < total; offset += batchSize) {
    const res = await source.query(`SELECT ${selectCols} FROM ${sourceTableName} ORDER BY ${orderCol} LIMIT ${batchSize} OFFSET ${offset}`);
    for (const row of res.rows) {
      const values = cols.map((c) => row[c]);
      await target.query(
        `INSERT INTO ${targetTable} (${insertCols}) VALUES (${placeholders})${conflictClause}`,
        values
      );
      copied++;
    }
  }
  if (hasId) {
    await target.query(`SELECT setval(pg_get_serial_sequence('${targetTable}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${targetTable}))`).catch(() => {});
  }
  console.log(`  ${sourceTableName} → ${targetTable}: ${copied} rows`);
  return copied;
}

async function main() {
  if (!process.env.DB_NAME1) {
    console.error("Set DB_NAME1, DB_USER1, DB_PASSWORD1 in .env.local for target mfm_db");
    process.exit(1);
  }
  console.log("Source:", process.env.DB_NAME, "→ Target:", process.env.DB_NAME1);
  const source = await sourcePool.connect();
  const target = await targetPool.connect();
  try {
    await target.query("CREATE EXTENSION IF NOT EXISTS postgis");
    console.log("PostGIS OK on target");

    console.log("\nRunning migrations on target...");
    await runMigrations(target);

    console.log("\nEnsuring fence1 + pakistan_provinces on target (existing 'fence' not touched)...");
    await ensureFence1Table(target);
    await ensurePakistanProvincesTable(target);

    console.log("\nCopying data (source → target)...");
    await copyTable(source, target, "gis_config", []);
    await copyTable(source, target, "fence", ["geom"], 500, "fence1");
    await copyTable(source, target, "fences_master", ["geom"]);
    await copyTable(source, target, "roads_master", ["geom"]);
    await copyTable(source, target, "regions_master", ["geom"]);
    await copyTable(source, target, "cities_master", ["geom"]);
    await copyTable(source, target, "areas_master", ["geom"]);
    await copyTable(source, target, "pakistan_provinces", ["geom"]);

    console.log("\nDone. mfm_db has fence-related tables with data.");
    console.log("  Fence data is in table 'fence1' (target 'fence' was not modified).");
    console.log("  To use mfm_db for the Fence Map app, set in .env: FENCES_TABLE=fence1");
  } catch (e) {
    console.error(e?.message ?? e);
    process.exit(1);
  } finally {
    source.release();
    target.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

main();
