/**
 * GET /api/gis/roads?type=motorway&bbox=...
 * Returns roads_master as GeoJSON FeatureCollection. Bbox optional.
 */

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { TABLE, parseBbox, bboxClause } from "@/lib/masterGis";
import type { RoadsFeatureCollection, RoadFeature } from "@/types/masterGis";

const ROADS = TABLE.roads_master;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type")?.trim().toLowerCase();
    const bbox = parseBbox(searchParams);
    const bboxWhere = bboxClause(bbox, "geom");

    const params: unknown[] = [];
    let where = "WHERE geom IS NOT NULL";
    if (type && ["motorway", "trunk", "primary", "secondary"].includes(type)) {
      params.push(type);
      where += ` AND highway = $1`;
    }
    const tail = `${where}${bboxWhere}`;

    const client = await pool.connect();
    try {
      const sql = `
        SELECT id, name, highway, road_class,
          ST_AsGeoJSON(geom)::json AS geometry
        FROM ${ROADS}
        ${tail}
        ORDER BY id
        LIMIT 5000
      `;
      const r = await client.query<{
        id: number;
        name: string | null;
        highway: string | null;
        road_class: string | null;
        geometry: unknown;
      }>(sql, params);
      const features: RoadFeature[] = r.rows
        .map((row): RoadFeature | null => {
          const geom =
            typeof row.geometry === "string"
              ? JSON.parse(row.geometry)
              : row.geometry;
          if (!geom?.type || !geom?.coordinates) return null;
          return {
            type: "Feature",
            id: row.id,
            properties: {
              name: row.name ?? null,
              highway: row.highway ?? null,
              road_class: row.road_class ?? null,
            },
            geometry: geom,
          };
        })
        .filter((f): f is RoadFeature => f != null);

      const fc: RoadsFeatureCollection = {
        type: "FeatureCollection",
        features,
      };
      return NextResponse.json(fc);
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch roads", detail: message },
      { status: 500 }
    );
  }
}
