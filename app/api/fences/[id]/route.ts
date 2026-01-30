import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type {
  GeoJSONGeometry,
  GeoJSONPolygonCoords,
  UpdateFenceBody,
  FenceApiResponse,
} from "@/types/fence";

const _t = (process.env.FENCES_TABLE || "fence").trim();
const FENCES_TABLE = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(_t) ? _t : "fence";

function isValidPolygon(geom: GeoJSONGeometry): boolean {
  if (!geom || geom.type !== "Polygon") return false;
  const coords = geom.coordinates as GeoJSONPolygonCoords;
  if (!Array.isArray(coords) || coords.length === 0) return false;
  const ring = coords[0];
  if (!Array.isArray(ring) || ring.length < 3) return false;
  return true;
}

function parseId(idParam: string): number | null {
  const n = parseInt(idParam, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** GET /api/fences/[id] – fetch single fence */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = parseId(idParam);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const client = await pool.connect();
    try {
      const result = await client.query<{
        id: number;
        name: string | null;
        geometry: unknown;
      }>(
        `SELECT id, name, ST_AsGeoJSON(geom)::json as geometry FROM ${FENCES_TABLE} WHERE id = $1`,
        [id]
      );
      const row = result.rows[0];
      if (!row) {
        return NextResponse.json({ error: "Fence not found" }, { status: 404 });
      }
      const geometry =
        typeof row.geometry === "string"
          ? (JSON.parse(row.geometry) as GeoJSONGeometry)
          : (row.geometry as GeoJSONGeometry);
      const response: FenceApiResponse = {
        id: row.id,
        name: row.name ?? `Zone_${row.id}`,
        geometry,
      };
      return NextResponse.json(response);
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch fence", detail: message },
      { status: 500 }
    );
  }
}

/** PUT /api/fences/[id] – update fence */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = parseId(idParam);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = (await request.json()) as UpdateFenceBody;
    const geometry = body.geometry;
    if (!geometry || !isValidPolygon(geometry)) {
      return NextResponse.json(
        {
          error: "Invalid geometry",
          detail: "geometry must be a GeoJSON Polygon with at least 3 points",
        },
        { status: 400 }
      );
    }
    const client = await pool.connect();
    try {
      const geoJson = JSON.stringify(geometry);
      const name =
        typeof body.name === "string" ? body.name.trim() : undefined;
      if (name !== undefined) {
        await client.query(
          `UPDATE ${FENCES_TABLE} SET name = $1, geom = ST_GeomFromGeoJSON($2)::geometry(Polygon, 4326) WHERE id = $3`,
          [name, geoJson, id]
        );
      } else {
        await client.query(
          `UPDATE ${FENCES_TABLE} SET geom = ST_GeomFromGeoJSON($1)::geometry(Polygon, 4326) WHERE id = $2`,
          [geoJson, id]
        );
      }
      const check = await client.query<{ id: number; name: string | null }>(
        `SELECT id, name FROM ${FENCES_TABLE} WHERE id = $1`,
        [id]
      );
      const row = check.rows[0];
      if (!row) {
        return NextResponse.json({ error: "Fence not found" }, { status: 404 });
      }
      const response: FenceApiResponse = {
        id: row.id,
        name: row.name ?? `Zone_${row.id}`,
        geometry,
      };
      return NextResponse.json(response);
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update fence", detail: message },
      { status: 500 }
    );
  }
}

/** DELETE /api/fences/[id] – delete fence */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = parseId(idParam);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const client = await pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM ${FENCES_TABLE} WHERE id = $1 RETURNING id`,
        [id]
      );
      if (result.rowCount === 0) {
        return NextResponse.json({ error: "Fence not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, id });
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to delete fence", detail: message },
      { status: 500 }
    );
  }
}
