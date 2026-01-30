import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { CityCollection } from "@/types/pakistan";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const province = searchParams.get("province")?.trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10), 1), 500);

    const client = await pool.connect();
    try {
      const params: unknown[] = [];
      const clauses: string[] = [];
      let idx = 0;

      if (search) {
        idx++;
        params.push(`%${search}%`);
        clauses.push(`(name ILIKE $${idx} OR name_alternate ILIKE $${idx})`);
      }
      if (province) {
        idx++;
        params.push(province);
        clauses.push(`province_code = $${idx}`);
      }
      params.push(limit);
      idx++;
      const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const result = await client.query<{
        id: number;
        geonameid: number;
        name: string;
        name_alternate: string | null;
        province_code: string | null;
        district_name: string | null;
        latitude: number;
        longitude: number;
        population: number | null;
        elevation: number | null;
      }>(
        `SELECT id, geonameid, name, name_alternate, province_code, district_name,
                latitude, longitude, population, elevation
         FROM pakistan_cities
         ${whereClause}
         ORDER BY population DESC NULLS LAST
         LIMIT $${idx}`,
        params
      );

      const features = result.rows.map((row) => ({
        type: "Feature" as const,
        id: row.id,
        properties: {
          id: row.id,
          geonameid: row.geonameid,
          name: row.name,
          nameAlternate: row.name_alternate ?? "",
          provinceCode: row.province_code ?? "",
          districtName: row.district_name ?? "",
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          population: row.population != null ? Number(row.population) : 0,
          elevation: row.elevation != null ? Number(row.elevation) : 0,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [Number(row.longitude), Number(row.latitude)] as [number, number],
        },
      }));

      const fc: CityCollection = {
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
