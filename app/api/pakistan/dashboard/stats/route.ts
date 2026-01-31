import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      const [provinces, districts, cities, motorways, highways, topCities] = await Promise.all([
        client.query("SELECT COUNT(*) FROM pakistan_provinces"),
        client.query("SELECT COUNT(*) FROM pakistan_districts"),
        client.query("SELECT COUNT(*) as cnt, COALESCE(SUM(population), 0)::bigint as pop FROM pakistan_cities"),
        client.query("SELECT COUNT(*) as cnt, COALESCE(SUM(length_km), 0)::float as len FROM pakistan_motorways"),
        client.query("SELECT COUNT(*) as cnt, COALESCE(SUM(length_km), 0)::float as len FROM pakistan_highways"),
        client.query(`
          SELECT name, province_code, population FROM pakistan_cities
          WHERE population > 0 ORDER BY population DESC LIMIT 20
        `),
      ]);

      const p = provinces.rows[0] as { count: string } | undefined;
      const d = districts.rows[0] as { count: string } | undefined;
      const c = cities.rows[0] as { cnt: string; pop: string } | undefined;
      const m = motorways.rows[0] as { cnt: string; len: string } | undefined;
      const h = highways.rows[0] as { cnt: string; len: string } | undefined;

      const totalPop = parseInt(c?.pop ?? "0", 10);
      const mLength = parseFloat(m?.len ?? "0");
      const hLength = parseFloat(h?.len ?? "0");

      return NextResponse.json({
        provinces: parseInt(p?.count ?? "0", 10),
        districts: parseInt(d?.count ?? "0", 10),
        cities: parseInt(c?.cnt ?? "0", 10),
        totalPopulation: totalPop,
        motorways: { count: parseInt(m?.cnt ?? "0", 10), lengthKm: mLength },
        highways: { count: parseInt(h?.cnt ?? "0", 10), lengthKm: hLength },
        totalRoadLengthKm: mLength + hLength,
        topCities: topCities.rows.map((r: { name: string; province_code: string; population: string }) => ({
          name: r.name,
          province: r.province_code,
          population: parseInt(r.population ?? "0", 10),
        })),
      });
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "Failed to fetch dashboard stats", detail: message }, { status: 500 });
  }
}
