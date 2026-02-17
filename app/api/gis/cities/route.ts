/**
 * GET /api/gis/cities?bbox=...
 * Returns cities_master as GeoJSON FeatureCollection.
 */

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { TABLE, parseBbox, bboxClause } from "@/lib/masterGis";
import type { CitiesFeatureCollection, CityFeature } from "@/types/masterGis";

const CITIES = TABLE.cities_master;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bbox = parseBbox(searchParams);
    const bboxWhere = bboxClause(bbox, "geom");
    const where = `WHERE geom IS NOT NULL ${bboxWhere}`;

    const client = await pool.connect();
    try {
      const sql = `
        SELECT id, name, place_type, population,
          ST_AsGeoJSON(geom)::json AS geometry
        FROM ${CITIES}
        ${where}
        ORDER BY id
        LIMIT 3000
      `;
      const r = await client.query<{
        id: number;
        name: string | null;
        place_type: string | null;
        population: string | null;
        geometry: unknown;
      }>(sql);
      const features: CityFeature[] = r.rows
        .map((row): CityFeature | null => {
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
              population: row.population ?? null,
            },
            geometry: geom,
          };
        })
        .filter((f): f is CityFeature => f != null);

      const fc: CitiesFeatureCollection = {
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
      { error: "Failed to fetch cities", detail: message },
      { status: 500 }
    );
  }
}
