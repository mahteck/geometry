/**
 * GET /api/gis/fences/[id] – single fence
 * PUT /api/gis/fences/[id] – update (name, geometry, status, etc.); trigger recalc area_size/is_big
 * DELETE /api/gis/fences/[id] – soft delete (set status = 'inactive')
 */

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { TABLE } from "@/lib/masterGis";
import type { GeoJSONGeometry, GeoJSONPolygonCoords, GeoJSONMultiPolygonCoords } from "@/types/fence";
import type { FenceMasterFeature } from "@/types/masterGis";

const FENCES = TABLE.fences_master;

function parseId(idParam: string): number | null {
  const n = parseInt(idParam, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isValidPolygonOrMulti(geom: GeoJSONGeometry): boolean {
  if (!geom || !geom.coordinates) return false;
  if (geom.type === "Polygon") {
    const coords = geom.coordinates as GeoJSONPolygonCoords;
    return Array.isArray(coords) && coords.length > 0 && coords[0].length >= 3;
  }
  if (geom.type === "MultiPolygon") {
    const coords = geom.coordinates as GeoJSONMultiPolygonCoords;
    return Array.isArray(coords) && coords.length > 0;
  }
  return false;
}

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
      const r = await client.query<{
        id: number;
        name: string | null;
        fence_type: string | null;
        route_type: string | null;
        region_name: string | null;
        status: string | null;
        area_size: number | null;
        is_big: boolean | null;
        geometry: unknown;
      }>(
        `SELECT id, name, fence_type, route_type, region_name, status, area_size, is_big,
          ST_AsGeoJSON(geom)::json AS geometry
         FROM ${FENCES} WHERE id = $1`,
        [id]
      );
      const row = r.rows[0];
      if (!row) {
        return NextResponse.json({ error: "Fence not found" }, { status: 404 });
      }
      const geometry =
        typeof row.geometry === "string"
          ? (JSON.parse(row.geometry) as GeoJSONGeometry)
          : (row.geometry as GeoJSONGeometry);
      const feature: FenceMasterFeature = {
        type: "Feature",
        id: row.id,
        properties: {
          name: row.name ?? `Zone_${row.id}`,
          fence_type: row.fence_type ?? null,
          route_type: row.route_type ?? null,
          region_name: row.region_name ?? null,
          status: row.status ?? null,
          area_size: row.area_size != null ? Number(row.area_size) : null,
          is_big: row.is_big ?? null,
        },
        geometry,
      };
      return NextResponse.json(feature);
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
    const body = (await request.json()) as {
      name?: string;
      geometry?: GeoJSONGeometry;
      status?: string;
      route_type?: string;
      region_name?: string;
    };

    const client = await pool.connect();
    try {
      const existing = await client.query<{ id: number }>(
        `SELECT id FROM ${FENCES} WHERE id = $1`,
        [id]
      );
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: "Fence not found" }, { status: 404 });
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 0;

      if (body.name !== undefined) {
        idx++;
        values.push(typeof body.name === "string" ? body.name.trim() : "");
        updates.push(`name = $${idx}`);
      }
      if (body.status !== undefined) {
        const s = String(body.status).toLowerCase();
        const status = s === "inactive" ? "inactive" : "active";
        idx++;
        values.push(status);
        updates.push(`status = $${idx}`);
      }
      if (body.route_type !== undefined) {
        idx++;
        values.push(body.route_type?.trim() ?? null);
        updates.push(`route_type = $${idx}`);
      }
      if (body.region_name !== undefined) {
        idx++;
        values.push(body.region_name?.trim() ?? null);
        updates.push(`region_name = $${idx}`);
      }
      if (body.geometry !== undefined) {
        if (!isValidPolygonOrMulti(body.geometry)) {
          return NextResponse.json(
            {
              error: "Invalid geometry",
              detail: "geometry must be Polygon or MultiPolygon with at least 3 points",
            },
            { status: 400 }
          );
        }
        idx++;
        values.push(JSON.stringify(body.geometry));
        updates.push(`geom = ST_Multi(ST_Force2D(ST_MakeValid(ST_GeomFromGeoJSON($${idx}::json)::geometry)))`);
      }

      if (updates.length === 0) {
        const r = await client.query<{ id: number; name: string | null; geometry: unknown }>(
          `SELECT id, name, ST_AsGeoJSON(geom)::json AS geometry FROM ${FENCES} WHERE id = $1`,
          [id]
        );
        const row = r.rows[0];
        if (!row) return NextResponse.json({ error: "Fence not found" }, { status: 404 });
        return NextResponse.json({
          id: row.id,
          name: row.name ?? `Zone_${row.id}`,
          geometry: row.geometry,
        });
      }

      idx++;
      values.push(id);
      const sql = `UPDATE ${FENCES} SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id, name, ST_AsGeoJSON(geom)::json AS geometry`;
      const r = await client.query<{ id: number; name: string | null; geometry: unknown }>(
        sql,
        values
      );
      const row = r.rows[0];
      if (!row) return NextResponse.json({ error: "Fence not found" }, { status: 404 });
      return NextResponse.json({
        id: row.id,
        name: row.name ?? `Zone_${row.id}`,
        geometry: row.geometry,
      });
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

/** Soft delete: set status = 'inactive' */
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
      const r = await client.query(
        `UPDATE ${FENCES} SET status = 'inactive', updated_at = now() WHERE id = $1 RETURNING id`,
        [id]
      );
      if (r.rowCount === 0) {
        return NextResponse.json({ error: "Fence not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, id, softDeleted: true });
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
