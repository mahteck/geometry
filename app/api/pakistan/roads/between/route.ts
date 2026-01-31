import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromCity = searchParams.get("from")?.trim();
    const toCity = searchParams.get("to")?.trim();

    if (!fromCity || !toCity) {
      return NextResponse.json({ error: "from and to cities required" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      const patternFrom = `%${fromCity}%`;
      const patternTo = `%${toCity}%`;

      const [motorwaysRes, highwaysRes] = await Promise.all([
        client.query(
          `SELECT id, motorway_code, name, start_city, end_city, length_km, lanes, toll_status, speed_limit,
                  ST_AsGeoJSON(geom)::json as geometry
           FROM pakistan_motorways
           WHERE geom IS NOT NULL
             AND ((start_city ILIKE $1 AND end_city ILIKE $2)
                  OR (start_city ILIKE $2 AND end_city ILIKE $1))
           ORDER BY length_km ASC
           LIMIT 5`,
          [patternFrom, patternTo]
        ),
        client.query(
          `SELECT id, highway_code, name, start_city, end_city, length_km, surface_type, condition,
                  ST_AsGeoJSON(geom)::json as geometry
           FROM pakistan_highways
           WHERE geom IS NOT NULL
             AND ((start_city ILIKE $1 AND end_city ILIKE $2)
                  OR (start_city ILIKE $2 AND end_city ILIKE $1))
           ORDER BY length_km ASC
           LIMIT 5`,
          [patternFrom, patternTo]
        ),
      ]);

      const motorways = motorwaysRes.rows.map((r: { id: number; motorway_code: string; name: string; start_city: string; end_city: string; length_km: unknown; lanes: number; toll_status: string; speed_limit: number | null; geometry: unknown }) => ({
        type: "motorway" as const,
        id: r.id,
        code: r.motorway_code,
        name: r.name,
        startCity: r.start_city,
        endCity: r.end_city,
        lengthKm: Number(r.length_km),
        lanes: r.lanes,
        tollStatus: r.toll_status,
        speedLimit: r.speed_limit,
        geometry: r.geometry,
      }));
      const highways = highwaysRes.rows.map((r: { id: number; highway_code: string; name: string; start_city: string; end_city: string; length_km: unknown; surface_type: string; condition: string; geometry: unknown }) => ({
        type: "highway" as const,
        id: r.id,
        code: r.highway_code,
        name: r.name,
        startCity: r.start_city,
        endCity: r.end_city,
        lengthKm: Number(r.length_km),
        surfaceType: r.surface_type,
        condition: r.condition,
        geometry: r.geometry,
      }));

      return NextResponse.json({ motorways, highways });
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (String(message).includes("does not exist")) {
      return NextResponse.json({ motorways: [], highways: [] });
    }
    return NextResponse.json({ error: "Search failed", detail: message }, { status: 500 });
  }
}
