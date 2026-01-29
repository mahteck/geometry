/**
 * Transform fencedetail (Excel or CSV): polygon-id × multiple points → one row per
 * polygon with WKT POLYGON ((lng lat, lng lat, ...)), then CREATE TABLE + INSERT into
 * cherat_fences.
 *
 * Run: npm run transform:fences
 * Input: fencedetail.xlsx (needs xlsx) or fencedetail.csv (no extra deps).
 * Set TRANSFORM_INPUT=fencedetail.csv to use CSV. Writes scripts/output/fences.sql.
 * Set TRANSFORM_RUN_SQL=0 to skip DB run.
 */

import { config } from "dotenv";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

config({ path: join(root, ".env") });
config({ path: join(root, ".env.local"), override: true });

const INPUT_NAME = process.env.TRANSFORM_INPUT || "fencedetail.xlsx";
const EXCEL_PATH = join(root, INPUT_NAME);
const OUTPUT_DIR = join(__dirname, "output");
const SQL_PATH = join(OUTPUT_DIR, "fences.sql");

const runSql = process.env.TRANSFORM_RUN_SQL !== "0";
const noHeader = process.env.TRANSFORM_NO_HEADER === "1";
const _raw = (process.env.TRANSFORM_TABLE || "fence").trim();
const tableName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(_raw) ? _raw : "fence";
const FENCE_CSV_HEADERS = ["id", "name", "_", "lat", "lon", "order"];

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function detectColumns(headers) {
  const h = headers.map((cell, i) => [norm(cell), i]);
  let idIdx = -1,
    lonIdx = -1,
    latIdx = -1,
    orderIdx = -1;
  const attrs = [];

  for (const [name, i] of h) {
    if (/^(id|fence_id|polygon_id|fenceid|polygonid)$/.test(name) || name === "id") {
      if (idIdx === -1) idIdx = i;
    } else if (/^(lon|lng|longitude|long|x)$/.test(name) || name.endsWith("_lon") || name.endsWith("_lng")) {
      if (lonIdx === -1) lonIdx = i;
    } else if (/^(lat|latitude|y)$/.test(name) || name.endsWith("_lat")) {
      if (latIdx === -1) latIdx = i;
    } else if (/^(order|seq|sequence|point_order|point_no|index|point_index|sr|sno)$/.test(name)) {
      if (orderIdx === -1) orderIdx = i;
    } else if (name && name !== "_" && !/^(geometry|geom|wkt|shape|polygon)$/.test(name)) {
      attrs.push({ name, idx: i });
    }
  }

  return { idIdx, lonIdx, latIdx, orderIdx, attrs };
}

function toNum(v) {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function buildPolygonWkt(points) {
  if (!points.length) return null;
  const ring = [];
  for (const p of points) {
    const [a, b] = p;
    const prev = ring[ring.length - 1];
    if (prev && Math.abs(prev[0] - a) < 1e-9 && Math.abs(prev[1] - b) < 1e-9) continue;
    ring.push([a, b]);
  }
  if (ring.length < 3) return null;
  const [first] = ring;
  const last = ring[ring.length - 1];
  const closed = Math.abs(last[0] - first[0]) < 1e-9 && Math.abs(last[1] - first[1]) < 1e-9;
  if (!closed) ring.push(first);
  if (ring.length < 4) return null;
  const coordStr = ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `POLYGON ((${coordStr}))`;
}

function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inq = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inq = !inq;
      continue;
    }
    if (!inq && c === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function readCSV(path, useNoHeader = false) {
  let text = readFileSync(path, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  if (useNoHeader) {
    const rows = lines.map((ln) => parseCSVLine(ln));
    return { headers: FENCE_CSV_HEADERS, rows };
  }
  const headers = parseCSVLine(lines[0]).map((h, i) => String(h ?? "").trim() || `col_${i}`);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCSVLine(lines[i]));
  }
  return { headers, rows };
}

async function readXLSX(path) {
  const X = await import("xlsx");
  const buf = readFileSync(path);
  const wb = X.read(buf, { type: "buffer" });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = X.utils.sheet_to_json(sh, { header: 1, defval: "", raw: false });
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h, i) => String(h ?? "").trim() || `col_${i}`);
  const data = rows.slice(1);
  return { headers, rows: data };
}

function parseGrid(path, { headers, rows }) {
  if (!rows.length) throw new Error("No data rows.");
  const { idIdx, lonIdx, latIdx, orderIdx, attrs } = detectColumns(headers);

  if (idIdx === -1) throw new Error("Could not find polygon ID column (id, fence_id, polygon_id, etc.)");
  if (lonIdx === -1) throw new Error("Could not find longitude column (lon, lng, x)");
  if (latIdx === -1) throw new Error("Could not find latitude column (lat, y)");

  const byId = new Map();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const idRaw = row[idIdx];
    const id = Number.isFinite(Number(idRaw)) ? Number(idRaw) : String(idRaw ?? "").trim();
    if (id === "" || (typeof id === "number" && Number.isNaN(id))) continue;

    const lon = toNum(row[lonIdx]);
    const lat = toNum(row[latIdx]);
    if (lon == null || lat == null) continue;

    const order = orderIdx >= 0 ? toNum(row[orderIdx]) : null;
    if (!byId.has(id)) byId.set(id, { points: [], attrs: {}, seq: 0 });
    const rec = byId.get(id);
    const seq = rec.seq++;
    rec.points.push({ lon, lat, order: order ?? seq });
    if (Object.keys(rec.attrs).length === 0) {
      for (const { name, idx } of attrs) {
        const v = row[idx];
        rec.attrs[name] = v != null && String(v).trim() !== "" ? String(v).trim() : null;
      }
    }
  }

  const polygons = [];
  for (const [id, { points, attrs: a }] of byId) {
    points.sort((x, y) => (x.order != null && y.order != null ? x.order - y.order : 0));
    const coords = points.map((p) => [p.lon, p.lat]);
    const wkt = buildPolygonWkt(coords);
    if (!wkt) continue;
    polygons.push({ id, wkt, attrs: a });
  }

  return { polygons, attrs: attrs.map((a) => a.name) };
}

function sqlEscape(s) {
  if (s == null) return "NULL";
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function generateSql(polygons, attrNames, sourceLabel) {
  const hasName = attrNames.some((a) => /name/i.test(a));
  const hasAddress = attrNames.some((a) => /address|addr/i.test(a));
  const hasCity = attrNames.some((a) => /city/i.test(a));

  const cols = ["id", "name"];
  if (hasAddress) cols.push("address");
  if (hasCity) cols.push("city");
  cols.push("geom");

  const tbl = tableName;
  let sql = `-- Generated from ${sourceLabel}\n`;
  sql += `-- New table "${tbl}" only; cherat_fences unchanged.\n`;
  sql += `-- Format: POLYGON ((lng lat, lng lat, ...)) per fence, one row per polygon.\n\n`;
  sql += `CREATE EXTENSION IF NOT EXISTS postgis;\n\n`;
  sql += `CREATE TABLE IF NOT EXISTS ${tbl} (\n`;
  sql += `  id INT PRIMARY KEY,\n`;
  sql += `  name TEXT,\n`;
  if (hasAddress) sql += `  address TEXT,\n`;
  if (hasCity) sql += `  city TEXT,\n`;
  sql += `  geom GEOMETRY(Polygon, 4326)\n`;
  sql += `);\n\n`;
  sql += `TRUNCATE TABLE ${tbl};\n\n`;

  const nameKey = attrNames.find((a) => /name/i.test(a));
  const addrKey = attrNames.find((a) => /address|addr/i.test(a));
  const cityKey = attrNames.find((a) => /city/i.test(a));

  for (const { id, wkt, attrs } of polygons) {
    const nv = hasName && nameKey ? attrs[nameKey] : null;
    const name =
      nv != null && String(nv).trim() !== "" ? String(nv).trim() : `Zone_${id}`;
    const address = hasAddress && addrKey ? attrs[addrKey] : null;
    const city = hasCity && cityKey ? attrs[cityKey] : null;

    const idNum = Number(id);
    if (!Number.isInteger(idNum)) continue;

    const geom = `ST_GeomFromText(${sqlEscape(wkt)}, 4326)`;
    const vals = [idNum, sqlEscape(name)];
    if (hasAddress) vals.push(sqlEscape(address));
    if (hasCity) vals.push(sqlEscape(city));
    vals.push(geom);
    sql += `INSERT INTO ${tbl} (${cols.join(", ")}) VALUES (${vals.join(", ")});\n`;
  }

  return sql;
}

async function main() {
  if (!existsSync(EXCEL_PATH)) {
    const csvAlt = join(root, "fencedetail.csv");
    if (INPUT_NAME.endsWith(".xlsx") && existsSync(csvAlt)) {
      throw new Error(`Missing ${INPUT_NAME}. Export Excel to fencedetail.csv and run: TRANSFORM_INPUT=fencedetail.csv npm run transform:fences`);
    }
    throw new Error(`Input not found: ${EXCEL_PATH}`);
  }

  const isCSV = EXCEL_PATH.toLowerCase().endsWith(".csv");
  let headers, rows;

  if (isCSV) {
    console.log("Reading CSV", EXCEL_PATH, noHeader ? "(no header)" : "");
    ({ headers, rows } = readCSV(EXCEL_PATH, noHeader));
  } else {
    console.log("Reading Excel", EXCEL_PATH);
    try {
      ({ headers, rows } = await readXLSX(EXCEL_PATH));
    } catch (e) {
      if (e?.code === "ERR_MODULE_NOT_FOUND" && e?.message?.includes("xlsx")) {
        throw new Error("Package 'xlsx' required for Excel. Run: npm install xlsx\nOr export to fencedetail.csv and run: TRANSFORM_INPUT=fencedetail.csv npm run transform:fences");
      }
      throw e;
    }
  }

  const { polygons, attrs } = parseGrid(EXCEL_PATH, { headers, rows });
  console.log("Polygons:", polygons.length, "| Attr columns:", attrs.join(", ") || "(none)");
  if (!polygons.length) throw new Error("No polygons produced. Check input: id, lon/x, lat/y columns and point data.");

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const sql = generateSql(polygons, attrs, INPUT_NAME);
  writeFileSync(SQL_PATH, sql, "utf8");
  console.log("Wrote", SQL_PATH);

  if (!runSql) {
    console.log("Skipping DB run (TRANSFORM_RUN_SQL=0). Run the SQL manually.");
    return;
  }

  const pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 15000,
  });

  try {
    await pool.query(sql);
    console.log(`Executed SQL on DB. Table "${tableName}" ready.`);
  } catch (e) {
    console.error("DB error:", e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
