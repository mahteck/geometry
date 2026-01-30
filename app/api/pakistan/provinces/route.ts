import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { ProvinceCollection } from "@/types/pakistan";

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query<{
        id: number;
        code: string;
        name: string;
        name_urdu: string | null;
        area_sqkm: number | null;
        population: number | null;
        capital_city: string | null;
        geometry: unknown;
      }>(
        `SELECT id, code, name, name_urdu, area_sqkm, population, capital_city,
                ST_AsGeoJSON(geom)::json as geometry
         FROM pakistan_provinces
         WHERE geom IS NOT NULL
         ORDER BY name`
      );

      const features = result.rows.map((row) => {
        const geom = row.geometry as { type: string; coordinates: number[][][] } | null;
        if (!geom || geom.type !== "Polygon" || !Array.isArray(geom.coordinates)) {
          return null;
        }
        return {
          type: "Feature" as const,
          id: row.id,
          properties: {
            id: row.id,
            code: row.code,
            name: row.name,
            nameUrdu: row.name_urdu ?? "",
            area: row.area_sqkm != null ? Number(row.area_sqkm) : 0,
            population: row.population != null ? Number(row.population) : 0,
            capital: row.capital_city ?? "",
          },
          geometry: {
            type: "Polygon" as const,
            coordinates: geom.coordinates,
          },
        };
      });

      const fc: ProvinceCollection = {
        type: "FeatureCollection",
        features: features.filter((f): f is NonNullable<typeof f> => f != null),
      };
      return NextResponse.json(fc);
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch provinces", detail: message },
      { status: 500 }
    );
  }
}
