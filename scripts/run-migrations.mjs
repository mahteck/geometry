#!/usr/bin/env node
/**
 * Run Enterprise GIS DB migrations in order.
 * Usage: node scripts/run-migrations.mjs
 * Requires: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD in env (e.g. from .env).
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "db", "migrations");

const client = new pg.Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function main() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    console.log("No .sql files in db/migrations");
    process.exit(0);
  }
  console.log("Connecting to DB...");
  await client.connect();
  try {
    for (const file of files) {
      const path = join(migrationsDir, file);
      const sql = readFileSync(path, "utf8");
      const optional = /^00[89]|^01[01]/.test(file);
      console.log(`Running ${file}...`);
      try {
        await client.query(sql);
        console.log(`  OK`);
      } catch (err) {
        if (optional) {
          console.log(`  Skipped (optional OSM import: ${err.message})`);
        } else {
          throw err;
        }
      }
    }
    console.log("Migrations complete.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
