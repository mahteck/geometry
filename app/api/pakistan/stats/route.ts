import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { PakistanStats } from "@/types/pakistan";

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      const [provinces, districts, cities, popByProv, totalArea] = await Promise.all([
        client.query<{ count: string }>("SELECT COUNT(*) as count FROM pakistan_provinces"),
        client.query<{ count: string }>("SELECT COUNT(*) as count FROM pakistan_districts"),
        client.query<{ count: string }>("SELECT COUNT(*) as count FROM pakistan_cities"),
        client.query<{ code: string; name: string; population: string }>(
          `SELECT code, name, COALESCE(SUM(population), 0)::bigint as population
           FROM pakistan_provinces p
           LEFT JOIN pakistan_cities c ON c.province_code = p.code
           GROUP BY p.code, p.name
           ORDER BY population DESC`
        ),
        client.query<{ area: string | null }>(
          `SELECT SUM(area_sqkm) as area FROM pakistan_provinces`
        ),
      ]);

      const stats: PakistanStats = {
        provinces: parseInt(provinces.rows[0]?.count ?? "0", 10),
        districts: parseInt(districts.rows[0]?.count ?? "0", 10),
        cities: parseInt(cities.rows[0]?.count ?? "0", 10),
        populationByProvince: popByProv.rows.map((r) => ({
          code: r.code,
          name: r.name,
          population: parseInt(r.population || "0", 10),
        })),
        totalArea: parseFloat(totalArea.rows[0]?.area ?? "0") || 0,
      };
      return NextResponse.json(stats);
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch stats", detail: message },
      { status: 500 }
    );
  }
}
