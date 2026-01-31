import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { RoadStats } from "@/types/roads";

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      const [motorwaysRes, highwaysRes] = await Promise.all([
        client.query(`
          SELECT COUNT(*) as count, COALESCE(SUM(length_km), 0) as length,
                 COUNT(*) FILTER (WHERE status = 'operational') as operational
          FROM pakistan_motorways
        `),
        client.query(`
          SELECT COUNT(*) as count, COALESCE(SUM(length_km), 0) as length
          FROM pakistan_highways
        `),
      ]);

      const m = motorwaysRes.rows[0];
      const h = highwaysRes.rows[0];
      const motorwaysLength = parseFloat(m?.length ?? "0");
      const highwaysLength = parseFloat(h?.length ?? "0");

      const stats: RoadStats = {
        motorways: {
          count: parseInt(m?.count ?? "0", 10),
          lengthKm: motorwaysLength,
          operational: parseInt(m?.operational ?? "0", 10),
        },
        highways: {
          count: parseInt(h?.count ?? "0", 10),
          lengthKm: highwaysLength,
        },
        totalLengthKm: motorwaysLength + highwaysLength,
      };
      return NextResponse.json(stats);
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (String(message).includes("does not exist")) {
      return NextResponse.json({
        motorways: { count: 0, lengthKm: 0, operational: 0 },
        highways: { count: 0, lengthKm: 0 },
        totalLengthKm: 0,
      });
    }
    return NextResponse.json({ error: "Failed to fetch road stats", detail: message }, { status: 500 });
  }
}
