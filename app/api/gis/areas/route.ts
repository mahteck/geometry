/**
 * GET /api/gis/areas?bbox=...
 * Returns areas_master as GeoJSON FeatureCollection. Lazy-load friendly.
 */

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { TABLE, parseBbox, bboxClause } from "@/lib/masterGis";
import type { AreasFeatureCollection, AreaFeature } from "@/types/masterGis";

const AREAS = TABLE.areas_master;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bbox = parseBbox(searchParams);
    const bboxWhere = bboxClause(bbox, "geom");
    const where = `WHERE geom IS NOT NULL ${bboxWhere}`;
    const limit = Math.min(
      5000,
      Math.max(1, parseInt(searchParams.get("limit") ?? "2000", 10))
    );

    const client = await pool.connect();
    try {
      const sql = `
        SELECT id, name, place_type,
          ST_AsGeoJSON(geom)::json AS geometry
        FROM ${AREAS}
        ${where}
        ORDER BY id
        LIMIT $1
      `;
      const r = await client.query<{
        id: number;
        name: string | null;
        place_type: string | null;
        geometry: unknown;
      }>(sql, [limit]);
      const features: AreaFeature[] = r.rows
        .map((row): AreaFeature | null => {
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
              place_type: row.place_type ?? null,
            },
            geometry: geom,
          };
        })
        .filter((f): f is AreaFeature => f != null);

      const fc: AreasFeatureCollection = {
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
      { error: "Failed to fetch areas", detail: message },
      { status: 500 }
    );
  }
}
