import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim().toLowerCase();
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);

    if (!q || q.length < 2) {
      return NextResponse.json({ motorways: [], highways: [] });
    }

    const client = await pool.connect();
    try {
      const pattern = `%${q}%`;
      const [motorwaysRes, highwaysRes] = await Promise.all([
        client.query(
          `SELECT id, motorway_code, name, start_city, end_city, length_km, lanes, toll_status, status, speed_limit
           FROM pakistan_motorways
           WHERE LOWER(motorway_code) LIKE $1 OR LOWER(name) LIKE $1
              OR LOWER(start_city) LIKE $1 OR LOWER(end_city) LIKE $1
           ORDER BY motorway_code LIMIT $2`,
          [pattern, limit]
        ),
        client.query(
          `SELECT id, highway_code, name, start_city, end_city, length_km, route_type, condition
           FROM pakistan_highways
           WHERE LOWER(highway_code) LIKE $1 OR LOWER(name) LIKE $1
              OR LOWER(start_city) LIKE $1 OR LOWER(end_city) LIKE $1
           ORDER BY highway_code LIMIT $2`,
          [pattern, limit]
        ),
      ]);

      return NextResponse.json({
        motorways: motorwaysRes.rows.map((r: { id: number; motorway_code: string; name: string; start_city: string; end_city: string; length_km: unknown; lanes: number; toll_status: string; status: string; speed_limit: number | null }) => ({
          id: r.id,
          type: "motorway" as const,
          code: r.motorway_code,
          name: r.name,
          startCity: r.start_city,
          endCity: r.end_city,
          lengthKm: Number(r.length_km),
          lanes: r.lanes,
          tollStatus: r.toll_status,
          status: r.status,
          speedLimit: r.speed_limit,
        })),
        highways: highwaysRes.rows.map((r: { id: number; highway_code: string; name: string; start_city: string; end_city: string; length_km: unknown; route_type: string; condition: string }) => ({
          id: r.id,
          type: "highway" as const,
          code: r.highway_code,
          name: r.name,
          startCity: r.start_city,
          endCity: r.end_city,
          lengthKm: Number(r.length_km),
          routeType: r.route_type,
          condition: r.condition,
        })),
      });
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
