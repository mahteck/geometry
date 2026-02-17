import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { FENCES_TABLE } from "@/lib/fenceApi";
import type { GeoJSONGeometry, GeoJSONPolygonCoords, GeoJSONMultiPolygonCoords } from "@/types/fence";

export interface ValidationIssue {
  fenceId: number;
  name: string;
  isValid: boolean;
  validReason: string | null;
  isSimple: boolean;
  hasUnclosedRing: boolean;
  hasDuplicateVertices: boolean;
  /** True when this fence shares geometry with at least one other fence (after normalization). */
  isDuplicate: boolean;
  /** Canonical fence id for this geometry group (null when this fence is itself canonical or group size = 1). */
  duplicateOfId: number | null;
  /** Total fences in this normalized-geometry group (including canonical). */
  duplicateGroupSize: number;
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
  duplicate_group_size: number | null;
  canonical_id: number | null;
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
        WITH norm AS (
          SELECT
            f.id,
            f.name,
            ST_AsGeoJSON(f.geom)::json AS geometry,
            ST_IsValid(f.geom) AS valid,
            ST_IsValidReason(f.geom) AS valid_reason,
            ST_IsSimple(f.geom) AS simple,
            -- Normalize geometry so duplicates can be detected robustly
            ST_Normalize(
              ST_SnapToGrid(
                ST_MakeValid(f.geom),
                0.000001
              )
            ) AS norm_geom
          FROM ${FENCES_TABLE} f
          WHERE f.geom IS NOT NULL
        ),
        groups AS (
          SELECT
            md5(ST_AsBinary(norm_geom)) AS geom_key,
            MIN(id) AS canonical_id,
            COUNT(*) AS group_size
          FROM norm
          GROUP BY md5(ST_AsBinary(norm_geom))
        )
        SELECT
          n.id,
          n.name,
          n.geometry,
          n.valid,
          n.valid_reason,
          n.simple,
          COALESCE(g.group_size, 1) AS duplicate_group_size,
          g.canonical_id
        FROM norm n
        LEFT JOIN groups g
          ON md5(ST_AsBinary(n.norm_geom)) = g.geom_key
        ORDER BY n.id
      `;
      const r = await client.query<Row>(sql);
      const rows = r.rows;

      const issues: ValidationIssue[] = [];
      for (const row of rows) {
        const geometry = parseGeometry(row.geometry);
        const hasUnclosed = geometry ? hasUnclosedRing(geometry) : false;
        const hasDupVerts = geometry ? hasDuplicateVertices(geometry) : false;
        const groupSize = row.duplicate_group_size ?? 1;
        const canonicalId = row.canonical_id ?? row.id;
        const isDuplicate = groupSize > 1;
        const isCanonical = row.id === canonicalId;
        const duplicateOfId = isDuplicate && !isCanonical ? canonicalId : null;
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
          isDuplicate,
          duplicateOfId,
          duplicateGroupSize: groupSize,
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
