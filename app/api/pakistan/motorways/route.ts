import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { MotorwayCollection } from "@/types/roads";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim();
    const code = searchParams.get("code")?.trim();
    const id = searchParams.get("id")?.trim();

    const client = await pool.connect();
    try {
      let query = `SELECT id, motorway_code, name, start_city, end_city, length_km, lanes, toll_status, status, operator, speed_limit,
                          ST_AsGeoJSON(geom)::json as geometry
                   FROM pakistan_motorways WHERE geom IS NOT NULL`;
      const params: unknown[] = [];
      let idx = 0;
      if (id) {
        idx++;
        params.push(parseInt(id, 10));
        query += ` AND id = $${idx}`;
      }
      if (status && !id) {
        idx++;
        params.push(status);
        query += ` AND status = $${idx}`;
      }
      if (code && !id) {
        idx++;
        params.push(code);
        query += ` AND motorway_code = $${idx}`;
      }
      query += ` ORDER BY motorway_code`;

      const result = await client.query(query, params);
      const features = result.rows.map((row: { id: number; motorway_code: string; name: string | null; start_city: string | null; end_city: string | null; length_km: unknown; lanes: number | null; toll_status: string | null; status: string | null; operator: string | null; speed_limit: number | null; geometry: unknown }) => {
        const geom = row.geometry as { type: string; coordinates: number[][] } | null;
        if (!geom || geom.type !== "LineString" || !Array.isArray(geom.coordinates)) return null;
        return {
          type: "Feature" as const,
          id: row.id,
          properties: {
            id: row.id,
            motorway_code: row.motorway_code,
            name: row.name ?? "",
            start_city: row.start_city ?? "",
            end_city: row.end_city ?? "",
            length_km: Number(row.length_km ?? 0),
            lanes: row.lanes ?? 0,
            toll_status: row.toll_status ?? "toll",
            status: row.status ?? "operational",
            operator: row.operator ?? "",
            speed_limit: row.speed_limit,
          },
          geometry: geom,
        };
      });

      const fc: MotorwayCollection = {
        type: "FeatureCollection",
        features: features.filter((f): f is NonNullable<typeof f> => f != null),
      };
      return NextResponse.json(fc);
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "Failed to fetch motorways", detail: message }, { status: 500 });
  }
}
