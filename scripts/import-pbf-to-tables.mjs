#!/usr/bin/env node
/**
 * Import pakistan-260215.osm.pbf into roads_master, cities_master, areas_master.
 * Nodes stored in temp DB table to avoid memory limits.
 *
 * Usage: npm run pbf:import
 */

import { createReadStream } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";
import parseOSM from "osm-pbf-parser";
import { Transform } from "stream";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const PBF_FILES = ["pakistan-260215.osm.pbf", "pakistan-latest.osm.pbf"];
let pbfPath = null;
const fs = await import("fs");
for (const name of PBF_FILES) {
  const p = join(projectRoot, name);
  if (fs.existsSync(p)) {
    pbfPath = p;
    break;
  }
}
if (!pbfPath) {
  console.error("No PBF file found. Put pakistan-260215.osm.pbf in project root.");
  process.exit(1);
}

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5,
});

const ROAD_HIGHWAYS = new Set(["motorway", "trunk", "primary", "secondary"]);
const CITIES_PLACES = new Set(["city", "town"]);
const AREAS_PLACES = new Set(["suburb", "neighbourhood", "locality"]);
const NODE_BATCH = 50000;

/** Pass 1: stream nodes into DB */
function collectNodesToDb(pbfPath, client) {
  return new Promise((resolve, reject) => {
    let batch = [];
    let total = 0;
    const flush = async () => {
      if (batch.length === 0) return;
      const ids = batch.map((n) => n.id);
      const lats = batch.map((n) => n.lat);
      const lons = batch.map((n) => n.lon);
      await client.query(
        `INSERT INTO pbf_nodes_import (id, lat, lon) SELECT * FROM unnest($1::bigint[], $2::double precision[], $3::double precision[]) ON CONFLICT (id) DO NOTHING`,
        [ids, lats, lons]
      );
      total += batch.length;
      batch = [];
      if (total % 100000 === 0 && total > 0) process.stdout.write(`\r  Nodes: ${total}`);
    };
    const transform = new Transform({
      objectMode: true,
      async transform(chunk, enc, cb) {
        const items = Array.isArray(chunk) ? chunk : [chunk];
        for (const item of items) {
          if (item.type === "node") {
            batch.push({ id: Number(item.id), lat: item.lat, lon: item.lon });
            if (batch.length >= NODE_BATCH) await flush();
          }
        }
        cb();
      },
      async flush(cb) {
        await flush();
        console.log(`\r  Nodes: ${total} in DB`);
        resolve(total);
        cb();
      },
    });
    createReadStream(pbfPath).pipe(parseOSM()).pipe(transform).on("error", reject);
  });
}

/** Pass 2: collect ways (highway), cities, areas. No DB lookup in stream. */
function collectWaysAndPlaces(pbfPath) {
  return new Promise((resolve, reject) => {
    const ways = [];
    const cities = [];
    const areas = [];
    const transform = new Transform({
      objectMode: true,
      transform(chunk, enc, cb) {
        const items = Array.isArray(chunk) ? chunk : [chunk];
        for (const item of items) {
          if (item.type === "node") {
            const place = item.tags?.place;
            const name = item.tags?.name;
            if (place && name) {
              if (CITIES_PLACES.has(place)) {
                cities.push({
                  name,
                  place_type: place,
                  population: item.tags?.population ?? null,
                  lon: item.lon,
                  lat: item.lat,
                });
              } else if (AREAS_PLACES.has(place)) {
                areas.push({ name, place_type: place, lon: item.lon, lat: item.lat });
              }
            }
          } else if (item.type === "way" && item.tags?.highway && ROAD_HIGHWAYS.has(item.tags.highway)) {
            const refs = (item.refs || []).map(Number);
            if (refs.length >= 2) {
              ways.push({
                name: item.tags?.name ?? null,
                highway: item.tags.highway,
                road_class: item.tags.highway,
                refs,
              });
            }
          }
        }
        cb();
      },
      flush(cb) {
        resolve({ ways, cities, areas });
        cb();
      },
    });
    createReadStream(pbfPath).pipe(parseOSM()).pipe(transform).on("error", reject);
  });
}

/** Load node coords from DB for all refs in ways, build roads array */
async function buildRoadsFromWays(client, ways) {
  const allRefs = new Set();
  for (const w of ways) for (const r of w.refs) allRefs.add(r);
  const refList = [...allRefs];
  const nodeMap = new Map();
  const BATCH = 100000;
  for (let i = 0; i < refList.length; i += BATCH) {
    const batch = refList.slice(i, i + BATCH);
    const res = await client.query(`SELECT id, lat, lon FROM pbf_nodes_import WHERE id = ANY($1::bigint[])`, [batch]);
    for (const r of res.rows) nodeMap.set(Number(r.id), { lat: r.lat, lon: r.lon });
  }
  const roads = [];
  for (const w of ways) {
    const coords = [];
    let ok = true;
    for (const ref of w.refs) {
      const n = nodeMap.get(ref);
      if (!n) {
        ok = false;
        break;
      }
      coords.push([n.lon, n.lat]);
    }
    if (ok && coords.length >= 2) {
      roads.push({
        name: w.name,
        highway: w.highway,
        road_class: w.road_class,
        coords,
      });
    }
  }
  return roads;
}

async function main() {
  console.log("PBF:", pbfPath);
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS pbf_nodes_import (id BIGINT PRIMARY KEY, lat DOUBLE PRECISION, lon DOUBLE PRECISION);
      TRUNCATE pbf_nodes_import;
    `);

    console.log("Pass 1: Loading nodes into DB...");
    await collectNodesToDb(pbfPath, client);

    console.log("Pass 2: Collecting ways, cities, areas...");
    const { ways, cities, areas } = await collectWaysAndPlaces(pbfPath);
    console.log("  Ways (highway):", ways.length, "Cities:", cities.length, "Areas:", areas.length);

    console.log("Building road geometries from node refs...");
    const roads = await buildRoadsFromWays(client, ways);
    console.log("  Roads to insert:", roads.length);

    await client.query("DROP TABLE IF EXISTS pbf_nodes_import");
    await client.query("TRUNCATE roads_master, cities_master, areas_master RESTART IDENTITY");

    if (roads.length > 0) {
      console.log("\nInserting roads...");
      for (let i = 0; i < roads.length; i++) {
        const r = roads[i];
        const wkt = `LINESTRING(${r.coords.map((c) => `${c[0]} ${c[1]}`).join(",")})`;
        await client.query(
          `INSERT INTO roads_master (name, highway, road_class, geom) VALUES ($1, $2, $3, ST_Multi(ST_GeomFromText($4, 4326)))`,
          [r.name, r.highway, r.road_class, wkt]
        );
        if ((i + 1) % 1000 === 0) process.stdout.write(`\r  ${i + 1}/${roads.length}`);
      }
      console.log(`\r  Roads: ${roads.length} inserted.`);
    }

    if (cities.length > 0) {
      console.log("Inserting cities...");
      for (let i = 0; i < cities.length; i++) {
        const c = cities[i];
        await client.query(
          `INSERT INTO cities_master (name, place_type, population, geom) VALUES ($1, $2, $3, ST_GeomFromText($4, 4326))`,
          [c.name, c.place_type, c.population, `POINT(${c.lon} ${c.lat})`]
        );
        if ((i + 1) % 500 === 0) process.stdout.write(`\r  ${i + 1}/${cities.length}`);
      }
      console.log(`\r  Cities: ${cities.length} inserted.`);
    }

    if (areas.length > 0) {
      console.log("Inserting areas...");
      for (let i = 0; i < areas.length; i++) {
        const a = areas[i];
        await client.query(
          `INSERT INTO areas_master (name, place_type, geom) VALUES ($1, $2, ST_GeomFromText($3, 4326))`,
          [a.name, a.place_type, `POINT(${a.lon} ${a.lat})`]
        );
        if ((i + 1) % 500 === 0) process.stdout.write(`\r  ${i + 1}/${areas.length}`);
      }
      console.log(`\r  Areas: ${areas.length} inserted.`);
    }

    console.log("\nDone. Open /gis-map to see roads, cities, areas.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
