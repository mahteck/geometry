/**
 * GET /api/gis/fences – list fences from fences_master with filters and bbox.
 * POST /api/gis/fences – create fence in fences_master (ST_Multi, ST_MakeValid, trigger sets area_size/is_big).
 * Existing table "fence" is not modified.
 */

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  TABLE,
  parseBbox,
  bboxClause,
  buildFencesFilterClauses,
} from "@/lib/masterGis";
import type {
  GeoJSONFeatureCollection,
  GeoJSONGeometry,
  GeoJSONPolygonCoords,
  GeoJSONMultiPolygonCoords,
} from "@/types/fence";
import type { FenceMasterFeature } from "@/types/masterGis";

const FENCES = TABLE.fences_master;

interface Row {
  id: number;
  name: string | null;
  fence_type: string | null;
  route_type: string | null;
  region_name: string | null;
  status: string | null;
  area_size: number | null;
  is_big: boolean | null;
  geometry: unknown;
}

function normalizeGeometry(raw: unknown): GeoJSONGeometry | null {
  if (!raw) return null;
  const geom =
    typeof raw === "string"
      ? (JSON.parse(raw) as GeoJSONGeometry)
      : (raw as GeoJSONGeometry);
  if (!geom || typeof geom !== "object" || !geom.type || !geom.coordinates)
    return null;
  return geom;
}

/** Single fence: one row per fence (geom already MultiPolygon), no ST_Dump. */
function rowToFeature(r: Row): FenceMasterFeature | null {
  const geometry = normalizeGeometry(r.geometry);
  if (!geometry) return null;
  return {
    type: "Feature",
    id: r.id,
    properties: {
      name: r.name ?? `Zone_${r.id}`,
      fence_type: r.fence_type ?? null,
      route_type: r.route_type ?? null,
      region_name: r.region_name ?? null,
      status: r.status ?? null,
      area_size: r.area_size != null ? Number(r.area_size) : null,
      is_big: r.is_big ?? null,
    },
    geometry,
  };
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

/** GET: filters status, route_type, is_big, region_name, search (ILIKE name), bbox. Pagination via limit/offset. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const countOnly = searchParams.get("countOnly") === "1";
    const bbox = parseBbox(searchParams);
    const geomCol = "f.geom";
    const bboxWhere = bboxClause(bbox, geomCol);
    const { clauses: filterClauses, params: filterParams } =
      buildFencesFilterClauses(searchParams);

    const limit = Math.min(
      5000,
      Math.max(1, parseInt(searchParams.get("limit") ?? "1000", 10))
    );
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));

    const where = `WHERE f.geom IS NOT NULL ${bboxWhere}${filterClauses}`;
    const params = [...filterParams];

    const simplifyParam = searchParams.get("simplify");
    const tolerance = typeof simplifyParam === "string" ? parseFloat(simplifyParam) : NaN;
    const useSimplify = Number.isFinite(tolerance) && tolerance > 0 && tolerance < 1;
    if (useSimplify) params.push(tolerance);
    const geomSelectExpr =
      useSimplify && params.length > 0
        ? `ST_AsGeoJSON(ST_SimplifyPreserveTopology(f.geom, $${params.length}))::json`
        : "ST_AsGeoJSON(f.geom)::json";

    const client = await pool.connect();
    try {
      if (countOnly) {
        const r = await client.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM ${FENCES} f ${where}`,
          params
        );
        const total = parseInt(r.rows[0]?.count ?? "0", 10);
        return NextResponse.json({ total });
      }

      const sql = `
        SELECT f.id, f.name, f.fence_type, f.route_type, f.region_name, f.status, f.area_size, f.is_big,
          ${geomSelectExpr} AS geometry
        FROM ${FENCES} f
        ${where}
        ORDER BY f.id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(limit, offset);
      const result = await client.query<Row>(sql, params);
      const features = result.rows
        .map(rowToFeature)
        .filter((f): f is FenceMasterFeature => f != null);

      const fc: GeoJSONFeatureCollection<FenceMasterFeature> = {
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

/** POST: create fence. Geometry stored via ST_Multi(ST_MakeValid(ST_Force2D(...))). Trigger sets area_size, is_big. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      geometry: GeoJSONGeometry;
      fence_type?: string;
      route_type?: string;
      region_name?: string;
      status?: string;
    };
    const name =
      typeof body.name === "string" ? body.name.trim() || "New Fence" : "New Fence";
    const geometry = body.geometry;
    if (!geometry || !isValidPolygonOrMulti(geometry)) {
      return NextResponse.json(
        {
          error: "Invalid geometry",
          detail:
            "geometry must be a GeoJSON Polygon or MultiPolygon with at least 3 points",
        },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    try {
      const fenceType = body.fence_type?.trim() || null;
      const routeType = body.route_type?.trim() || null;
      const regionName = body.region_name?.trim() || null;
      const status = (body.status?.trim() || "active").toLowerCase();
      const validStatus = status === "inactive" ? "inactive" : "active";

      const dup = await client.query<{ id: number }>(
        `SELECT id FROM ${FENCES} WHERE TRIM(LOWER(name)) = TRIM(LOWER($1)) LIMIT 1`,
        [name]
      );
      if (dup.rows.length > 0) {
        return NextResponse.json(
          { error: "Duplicate fence name", detail: `A fence named "${name}" already exists.` },
          { status: 409 }
        );
      }

      const geoJson = JSON.stringify(geometry);
      const result = await client.query<{ id: number; name: string }>(
        `INSERT INTO ${FENCES} (name, fence_type, route_type, region_name, status, geom)
         VALUES ($1, $2, $3, $4, $5,
           ST_Multi(ST_Force2D(ST_MakeValid(ST_GeomFromGeoJSON($6)::geometry))))
         RETURNING id, name`,
        [name, fenceType, routeType, regionName, validStatus, geoJson]
      );
      const row = result.rows[0];
      if (!row) {
        return NextResponse.json({ error: "Insert failed" }, { status: 500 });
      }
      return NextResponse.json(
        { id: row.id, name: row.name, geometry },
        { status: 201 }
      );
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create fence", detail: message },
      { status: 500 }
    );
  }
}
