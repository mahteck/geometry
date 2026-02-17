#!/usr/bin/env node
/**
 * Import Pakistan OSM PBF into PostgreSQL using osm2pgsql.
 * Requires: osm2pgsql installed (https://github.com/openstreetmap/osm2pgsql#installation)
 *   Windows: choco install osm2pgsql   OR  download from GitHub releases
 * Usage: npm run osm:import
 * Uses: .env (DB_*), and pakistan-260215.osm.pbf (or pakistan-latest.osm.pbf) in project root.
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const pbfFiles = [
  "pakistan-260215.osm.pbf",
  "pakistan-latest.osm.pbf",
  "pakistan-260216.osm.pbf",
];
let pbfPath = null;
for (const name of pbfFiles) {
  const p = join(projectRoot, name);
  if (existsSync(p)) {
    pbfPath = p;
    break;
  }
}

if (!pbfPath) {
  console.error("No PBF file found. Put one of these in project root:");
  console.error("  pakistan-260215.osm.pbf, pakistan-latest.osm.pbf");
  process.exit(1);
}

const db = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || "5432",
  database: process.env.DB_NAME || "vehicle_tracking",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
};

if (!db.password) {
  console.error("Set DB_PASSWORD in .env");
  process.exit(1);
}

console.log("PBF file:", pbfPath);
console.log("DB:", `${db.user}@${db.host}:${db.port}/${db.database}`);
console.log("Running osm2pgsql (this may take several minutes)...\n");

const env = { ...process.env, PGPASSWORD: db.password };
const args = [
  "-d", db.database,
  "-H", db.host,
  "-P", db.port,
  "-U", db.user,
  "--create",
  "--slim",
  pbfPath,
];

const child = spawn("osm2pgsql", args, {
  env,
  stdio: "inherit",
  shell: true,
});

child.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error("\nosm2pgsql not found. Install it first:");
    console.error("  Windows (Chocolatey): choco install osm2pgsql");
    console.error("  Or: https://github.com/openstreetmap/osm2pgsql/releases");
    console.error("\nThen run: npm run osm:import");
  } else {
    console.error(err);
  }
  process.exit(1);
});

child.on("close", (code) => {
  if (code === 0) {
    console.log("\nOSM import done. Run migrations to fill roads_master, regions_master, etc.:");
    console.log("  npm run db:migrate");
  }
  process.exit(code ?? 0);
});
