/**
 * Run Pakistan geo setup SQL via Node.js (no psql required)
 * Usage: node scripts/setup-pakistan-db.mjs
 * Or: npm run setup:pakistan
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

// Split SQL into statements (handle multi-line, skip comments and empty)
function splitStatements(sql) {
  const lines = sql.split("\n");
  const statements = [];
  let current = [];
  let inComment = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) continue;
    if (trimmed === "") continue;
    current.push(line);
    if (trimmed.endsWith(";")) {
      const stmt = current.join("\n").trim();
      if (stmt.length > 1) {
        statements.push(stmt);
      }
      current = [];
    }
  }
  if (current.length > 0) {
    const stmt = current.join("\n").trim();
    if (stmt.length > 1 && !stmt.startsWith("--")) {
      statements.push(stmt);
    }
  }
  return statements;
}

async function main() {
  console.log("Pakistan Geo Setup - Running SQL via Node.js...");
  const sqlPath = join(root, "sql", "setup_pakistan_geo.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const statements = splitStatements(sql);

  const client = await pool.connect();
  try {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.slice(0, 60).replace(/\n/g, " ");
      try {
        await client.query(stmt);
        console.log(`  [${i + 1}/${statements.length}] OK: ${preview}...`);
      } catch (err) {
        if (err.message?.includes("already exists")) {
          console.log(`  [${i + 1}/${statements.length}] SKIP (exists): ${preview}...`);
        } else {
          throw err;
        }
      }
    }
    console.log("\nSetup complete. Tables ready.");
  } catch (err) {
    console.error("\nSetup failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
