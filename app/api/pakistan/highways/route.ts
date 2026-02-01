import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { HighwayCollection } from "@/types/roads";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const routeType = searchParams.get("type")?.trim();
    const id = searchParams.get("id")?.trim();

    const client = await pool.connect();
    try {
      let query = `SELECT id, highway_code, name, route_type, start_city, end_city, length_km, surface_type, condition,
                          ST_AsGeoJSON(geom)::json as geometry
                   FROM pakistan_highways WHERE geom IS NOT NULL`;
      const params: unknown[] = [];
      let idx = 0;
      if (id) {
        idx++;
        params.push(parseInt(id, 10));
        query += ` AND id = $${idx}`;
      }
      if (routeType && !id) {
        idx++;
        params.push(routeType);
        query += ` AND route_type = $${idx}`;
      }
      query += ` ORDER BY highway_code`;

      const result = await client.query(query, params);
      const features = result.rows.map((row: { id: number; highway_code: string; name: string | null; route_type: string | null; start_city: string | null; end_city: string | null; length_km: unknown; surface_type: string | null; condition: string | null; geometry: unknown }) => {
        const geom = row.geometry as { type: string; coordinates: number[][] } | null;
        if (!geom || geom.type !== "LineString" || !Array.isArray(geom.coordinates)) return null;
        return {
          type: "Feature" as const,
          id: row.id,
          properties: {
            id: row.id,
            highway_code: row.highway_code,
            name: row.name ?? "",
            route_type: row.route_type ?? "national_highway",
            start_city: row.start_city ?? "",
            end_city: row.end_city ?? "",
            length_km: Number(row.length_km ?? 0),
            surface_type: row.surface_type ?? "",
            condition: row.condition ?? "good",
          },
          geometry: { type: "LineString" as const, coordinates: geom.coordinates },
        };
      });

      const fc: HighwayCollection = {
        type: "FeatureCollection",
        features: features.filter((f): f is NonNullable<typeof f> => f != null),
      };
      return NextResponse.json(fc);
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "Failed to fetch highways", detail: message }, { status: 500 });
  }
}
