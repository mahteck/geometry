import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { DistrictCollection } from "@/types/pakistan";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const province = searchParams.get("province")?.trim();

    const client = await pool.connect();
    try {
      let query = `SELECT id, name, province_code, area_sqkm, population,
                          ST_AsGeoJSON(geom)::json as geometry
                   FROM pakistan_districts
                   WHERE geom IS NOT NULL`;
      const params: unknown[] = [];
      if (province) {
        params.push(province);
        query += ` AND province_code = $1`;
      }
      query += ` ORDER BY name`;

      const result = await client.query<{
        id: number;
        name: string;
        province_code: string;
        area_sqkm: number | null;
        population: number | null;
        geometry: unknown;
      }>(query, params);

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
            name: row.name,
            provinceCode: row.province_code,
            area: row.area_sqkm != null ? Number(row.area_sqkm) : 0,
            population: row.population != null ? Number(row.population) : 0,
          },
          geometry: {
            type: "Polygon" as const,
            coordinates: geom.coordinates,
          },
        };
      });

      const fc: DistrictCollection = {
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
      { error: "Failed to fetch districts", detail: message },
      { status: 500 }
    );
  }
}
