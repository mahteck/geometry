import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { GeoJSONFeatureCollection, FenceFeature, GeoJSONGeometry } from "@/types/fence";

const _t = (process.env.FENCES_TABLE || "fence").trim();
const FENCES_TABLE = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(_t) ? _t : "fence";

const sqlSimple = `
  SELECT id, name, ST_AsGeoJSON(geom)::json as geometry
  FROM ${FENCES_TABLE}
  WHERE geom IS NOT NULL
  ORDER BY id;
`;

const sqlExtended = `
  SELECT id, name, address, city, ST_AsGeoJSON(geom)::json as geometry
  FROM ${FENCES_TABLE}
  WHERE geom IS NOT NULL
  ORDER BY id;
`;

interface RowSimple {
  id: number;
  name: string | null;
  geometry: GeoJSONGeometry;
}

interface RowExtended extends RowSimple {
  address: string | null;
  city: string | null;
}

function toFeatures(rows: RowSimple[] | RowExtended[], extended: boolean): FenceFeature[] {
  return rows.map((r) => {
    const base = { type: "Feature" as const, id: r.id, geometry: r.geometry };
    const props: { name: string; address?: string | null; city?: string | null } = {
      name: r.name ?? `Zone_${r.id}`,
    };
    if (extended && "address" in r) props.address = r.address ?? null;
    if (extended && "city" in r) props.city = r.city ?? null;
    return { ...base, properties: props };
  });
}

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      let rows: RowSimple[] | RowExtended[];
      let extended = false;
      try {
        const r = await client.query<RowExtended>(sqlExtended);
        rows = r.rows;
        extended = true;
      } catch {
        const r = await client.query<RowSimple>(sqlSimple);
        rows = r.rows;
      }
      const features = toFeatures(rows, extended);
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
