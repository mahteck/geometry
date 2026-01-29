import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
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

async function main() {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    await pool.end();
    console.log("Database connection OK.");
    process.exit(0);
  } catch (err) {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  }
}

main();
