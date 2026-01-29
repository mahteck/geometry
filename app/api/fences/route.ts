import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { GeoJSONFeatureCollection, FenceFeature, GeoJSONGeometry } from "@/types/fence";

const SQL = `
  SELECT 
    id,
    name,
    ST_AsGeoJSON(geom)::json as geometry
  FROM cherat_fences
  WHERE geom IS NOT NULL
  ORDER BY id;
`;

interface Row {
  id: number;
  name: string | null;
  geometry: GeoJSONGeometry;
}

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query<Row>(SQL);
      const features: FenceFeature[] = rows.map((r) => ({
        type: "Feature",
        id: r.id,
        properties: { name: r.name ?? `Zone_${r.id}` },
        geometry: r.geometry,
      }));
      const fc: GeoJSONFeatureCollection<FenceFeature> = {
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
      { error: "Failed to fetch fences", detail: message },
      { status: 500 }
    );
  }
}
