/**
 * GET /api/gis/regions?bbox=...
 * Returns regions_master as GeoJSON FeatureCollection.
 */

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { TABLE, parseBbox, bboxClause } from "@/lib/masterGis";
import type { RegionsFeatureCollection, RegionFeature } from "@/types/masterGis";

const REGIONS = TABLE.regions_master;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bbox = parseBbox(searchParams);
    const bboxWhere = bboxClause(bbox, "geom");
    const where = `WHERE geom IS NOT NULL ${bboxWhere}`;

    const client = await pool.connect();
    try {
      const sql = `
        SELECT id, name, admin_level, region_type,
          ST_AsGeoJSON(geom)::json AS geometry
        FROM ${REGIONS}
        ${where}
        ORDER BY id
        LIMIT 2000
      `;
      const r = await client.query<{
        id: number;
        name: string | null;
        admin_level: string | null;
        region_type: string | null;
        geometry: unknown;
      }>(sql);
      const features: RegionFeature[] = r.rows
        .map((row): RegionFeature | null => {
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
              admin_level: row.admin_level ?? null,
              region_type: row.region_type ?? null,
            },
            geometry: geom,
          };
        })
        .filter((f): f is RegionFeature => f != null);

      const fc: RegionsFeatureCollection = {
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
      { error: "Failed to fetch regions", detail: message },
      { status: 500 }
    );
  }
}
