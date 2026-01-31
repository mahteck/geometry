/**
 * Setup Pakistan roads database tables and sample data
 * Usage: node scripts/setup-roads-db.mjs
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

config({ path: join(root, ".env.local") });
config({ path: join(root, ".env"), override: true });

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 15000,
});

function splitStatements(sql) {
  const lines = sql.split("\n");
  const statements = [];
  let current = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) continue;
    if (trimmed === "") continue;
    current.push(line);
    if (trimmed.endsWith(";")) {
      const stmt = current.join("\n").trim();
      if (stmt.length > 1) statements.push(stmt);
      current = [];
    }
  }
  if (current.length > 0) {
    const stmt = current.join("\n").trim();
    if (stmt.length > 1 && !stmt.startsWith("--")) statements.push(stmt);
  }
  return statements;
}

async function main() {
  console.log("Setting up Pakistan roads tables...");
  const client = await pool.connect();
  try {
    const schema = readFileSync(join(root, "sql", "roads_schema.sql"), "utf8");
    for (const stmt of splitStatements(schema)) {
      try {
        await client.query(stmt);
        console.log("  OK:", stmt.slice(0, 50) + "...");
      } catch (e) {
        if (!e.message?.includes("already exists")) throw e;
      }
    }
    console.log("\nLoading sample road data...");
    const data = readFileSync(join(root, "sql", "roads_sample_data.sql"), "utf8");
    for (const stmt of splitStatements(data)) {
      try {
        await client.query(stmt);
        console.log("  OK: Insert");
      } catch (e) {
        if (e.code === "23505") console.log("  SKIP: Data exists");
        else throw e;
      }
    }
    console.log("\nRoads setup complete.");
  } catch (e) {
    console.error("Failed:", e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
