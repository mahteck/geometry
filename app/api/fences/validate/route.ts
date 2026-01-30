import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { FENCES_TABLE } from "@/app/api/fences/route";
import type { GeoJSONGeometry, GeoJSONPolygonCoords, GeoJSONMultiPolygonCoords } from "@/types/fence";

export interface ValidationIssue {
  fenceId: number;
  name: string;
  isValid: boolean;
  validReason: string | null;
  isSimple: boolean;
  hasUnclosedRing: boolean;
  hasDuplicateVertices: boolean;
}

export interface ValidateResponse {
  validCount: number;
  invalidCount: number;
  issues: ValidationIssue[];
}

interface Row {
  id: number;
  name: string | null;
  geometry: unknown;
  valid: boolean;
  valid_reason: string | null;
  simple: boolean;
}

function parseGeometry(raw: unknown): GeoJSONGeometry | null {
  if (!raw) return null;
  const g = typeof raw === "string" ? (JSON.parse(raw) as GeoJSONGeometry) : (raw as GeoJSONGeometry);
  if (!g || typeof g !== "object" || !g.type || !g.coordinates) return null;
  return g;
}

/** Check if polygon ring is unclosed (first point !== last point). */
function hasUnclosedRing(geom: GeoJSONGeometry): boolean {
  if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
    const rings = geom.coordinates as GeoJSONPolygonCoords;
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 3) continue;
      const first = ring[0] as number[];
      const last = ring[ring.length - 1] as number[];
      if (first[0] !== last[0] || first[1] !== last[1]) return true;
    }
  }
  if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
    const polys = geom.coordinates as GeoJSONMultiPolygonCoords;
    for (const poly of polys) {
      if (!Array.isArray(poly)) continue;
      for (const ring of poly) {
        if (!Array.isArray(ring) || ring.length < 3) continue;
        const first = ring[0] as number[];
        const last = ring[ring.length - 1] as number[];
        if (first[0] !== last[0] || first[1] !== last[1]) return true;
      }
    }
  }
  return false;
}

/** Check for consecutive duplicate vertices. */
function hasDuplicateVertices(geom: GeoJSONGeometry): boolean {
  function checkRing(ring: number[][]): boolean {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i] as number[];
      const b = ring[i + 1] as number[];
      if (a[0] === b[0] && a[1] === b[1]) return true;
    }
    return false;
  }
  if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
    const rings = geom.coordinates as GeoJSONPolygonCoords;
    for (const ring of rings) {
      if (Array.isArray(ring) && checkRing(ring)) return true;
    }
  }
  if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
    const polys = geom.coordinates as GeoJSONMultiPolygonCoords;
    for (const poly of polys) {
      if (!Array.isArray(poly)) continue;
      for (const ring of poly) {
        if (Array.isArray(ring) && checkRing(ring)) return true;
      }
    }
  }
  return false;
}

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      const sql = `
        SELECT
          f.id,
          f.name,
          ST_AsGeoJSON(f.geom)::json AS geometry,
          ST_IsValid(f.geom) AS valid,
          ST_IsValidReason(f.geom) AS valid_reason,
          ST_IsSimple(f.geom) AS simple
        FROM ${FENCES_TABLE} f
        WHERE f.geom IS NOT NULL
        ORDER BY f.id
      `;
      const r = await client.query<Row>(sql);
      const rows = r.rows;

      const issues: ValidationIssue[] = [];
      for (const row of rows) {
        const geometry = parseGeometry(row.geometry);
        const hasUnclosed = geometry ? hasUnclosedRing(geometry) : false;
        const hasDupVerts = geometry ? hasDuplicateVertices(geometry) : false;
        const invalid =
          !row.valid || !row.simple || hasUnclosed || hasDupVerts;

        issues.push({
          fenceId: row.id,
          name: row.name ?? `Zone_${row.id}`,
          isValid: row.valid,
          validReason: row.valid_reason,
          isSimple: row.simple,
          hasUnclosedRing: hasUnclosed,
          hasDuplicateVertices: hasDupVerts,
        });
      }

      const invalidCount = issues.filter(
        (i) => !i.isValid || !i.isSimple || i.hasUnclosedRing || i.hasDuplicateVertices
      ).length;
      const validCount = issues.length - invalidCount;

      const response: ValidateResponse = {
        validCount,
        invalidCount,
        issues,
      };
      return NextResponse.json(response);
    } finally {
      client.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Validation failed", detail: message },
      { status: 500 }
    );
  }
}
