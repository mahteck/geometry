import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type {
  GeoJSONFeatureCollection,
  FenceFeature,
  GeoJSONGeometry,
  GeoJSONPolygonCoords,
  CreateFenceBody,
  FenceApiResponse,
} from "@/types/fence";

const _t = (process.env.FENCES_TABLE || "fence").trim();
export const FENCES_TABLE = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(_t) ? _t : "fence";

// Use ST_Dump to explode MultiPolygon rows into separate Polygon features
function sqlSimple(bboxClause: string) {
  return `
  SELECT f.id, f.name,
    ST_AsGeoJSON(d.geom)::json as geometry
  FROM ${FENCES_TABLE} f,
  LATERAL ST_Dump(f.geom) AS d
  WHERE f.geom IS NOT NULL
  ${bboxClause}
  ORDER BY f.id, d.path;
`;
}

function sqlExtended(bboxClause: string) {
  return `
  SELECT f.id, f.name, f.address, f.city,
    ST_AsGeoJSON(d.geom)::json as geometry
  FROM ${FENCES_TABLE} f,
  LATERAL ST_Dump(f.geom) AS d
  WHERE f.geom IS NOT NULL
  ${bboxClause}
  ORDER BY f.id, d.path;
`;
}

interface RowSimple {
  id: number;
  name: string | null;
  geometry: GeoJSONGeometry;
}

interface RowExtended extends RowSimple {
  address: string | null;
  city: string | null;
}

/** Normalize geometry from DB (handles string/object, driver quirks) */
function normalizeGeometry(raw: unknown): GeoJSONGeometry | null {
  if (!raw) return null;
  const geom = typeof raw === "string" ? (JSON.parse(raw) as GeoJSONGeometry) : (raw as GeoJSONGeometry);
  if (!geom || typeof geom !== "object" || !geom.type || !geom.coordinates) return null;
  return geom;
}

/** Build one Feature per FENCE (not per row) – groups ST_Dump results by fence ID */
function toFeatures(rows: RowSimple[] | RowExtended[], extended: boolean): FenceFeature[] {
  // Group rows by fence ID (ST_Dump creates multiple rows per MultiPolygon)
  const fenceMap = new Map<number, { name: string; address?: string | null; city?: string | null; geometries: GeoJSONGeometry[] }>();
  
  for (const r of rows) {
    const geometry = normalizeGeometry(r.geometry);
    if (!geometry) continue;
    
    if (!fenceMap.has(r.id)) {
      const props: { name: string; address?: string | null; city?: string | null } = {
        name: r.name ?? `Zone_${r.id}`,
      };
      if (extended && "address" in r) props.address = r.address ?? null;
      if (extended && "city" in r) props.city = r.city ?? null;
      fenceMap.set(r.id, { ...props, geometries: [] });
    }
    fenceMap.get(r.id)!.geometries.push(geometry);
  }

  // Convert to features: one feature per fence
  const features: FenceFeature[] = [];
  for (const [id, data] of fenceMap.entries()) {
    if (data.geometries.length === 0) continue;
    
    // If single polygon, use as-is; if multiple, create MultiPolygon
    let finalGeometry: GeoJSONGeometry;
    if (data.geometries.length === 1) {
      finalGeometry = data.geometries[0];
    } else {
      // Merge into MultiPolygon
      const coords: GeoJSONMultiPolygonCoords = data.geometries.map((g) => {
        if (g.type === "Polygon") return g.coordinates as GeoJSONPolygonCoords;
        // If already MultiPolygon, flatten
        if (g.type === "MultiPolygon") return (g.coordinates as GeoJSONMultiPolygonCoords).flat(1);
        return [];
      }).filter((c) => c.length > 0);
      finalGeometry = { type: "MultiPolygon", coordinates: coords };
    }

    const props: { name: string; address?: string | null; city?: string | null } = {
      name: data.name,
    };
    if (data.address !== undefined) props.address = data.address;
    if (data.city !== undefined) props.city = data.city;

    features.push({
      type: "Feature",
      id,
      properties: props,
      geometry: finalGeometry,
    });
  }
  
  return features;
}

/** Validate GeoJSON Polygon for insert/update */
function isValidPolygon(geom: GeoJSONGeometry): boolean {
  if (!geom || geom.type !== "Polygon") return false;
  const coords = geom.coordinates as GeoJSONPolygonCoords;
  if (!Array.isArray(coords) || coords.length === 0) return false;
  const ring = coords[0];
  if (!Array.isArray(ring) || ring.length < 3) return false;
  return true;
}

/** Parse bbox query: minLng,minLat,maxLng,maxLat (WGS84). Returns null if invalid. */
export function parseBbox(searchParams: URLSearchParams): number[] | null {
  const bbox = searchParams.get("bbox");
  if (!bbox) return null;
  const parts = bbox.split(",").map((s) => parseFloat(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  return [minLng, minLat, maxLng, maxLat];
}

export type FilterParams = {
  search?: string;
  region?: string;
  status?: string;
  minArea?: number;
  maxArea?: number;
};

/** Build filter WHERE clauses and params for GET /api/fences. */
export function buildFilterClauses(searchParams: URLSearchParams): { clauses: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];
  let idx = 0;

  /* Use only f.name so search works when table has no city column (simple schema). */
  const search = searchParams.get("search")?.trim();
  if (search) {
    idx++;
    params.push(`%${search}%`);
    clauses.push(`(f.name ILIKE $${idx})`);
  }

  const region = searchParams.get("region")?.toLowerCase();
  if (region && ["lahore", "karachi", "islamabad", "other"].includes(region)) {
    if (region === "other") {
      clauses.push(`(f.name NOT ILIKE '%lahore%' AND f.name NOT ILIKE '%karachi%' AND f.name NOT ILIKE '%islamabad%')`);
    } else {
      idx++;
      params.push(`%${region}%`);
      clauses.push(`(f.name ILIKE $${idx})`);
    }
  }

  const statusParam = searchParams.get("status") ?? searchParams.get("active");
  if (statusParam !== null && statusParam !== undefined && statusParam !== "") {
    const s = String(statusParam).toLowerCase();
    if (s === "true" || s === "active") {
      idx++;
      params.push("active");
      clauses.push(`COALESCE(f.status, '') = $${idx}`);
    } else if (s === "false" || s === "inactive") {
      idx++;
      params.push("inactive");
      clauses.push(`COALESCE(f.status, '') = $${idx}`);
    }
  }

  const minArea = searchParams.get("minArea");
  if (minArea != null && minArea !== "") {
    const n = parseFloat(minArea);
    if (Number.isFinite(n) && n >= 0) {
      idx++;
      params.push(n);
      clauses.push(`ST_Area(d.geom::geography) >= $${idx}`);
    }
  }

  const maxArea = searchParams.get("maxArea");
  if (maxArea != null && maxArea !== "") {
    const n = parseFloat(maxArea);
    if (Number.isFinite(n) && n >= 0) {
      idx++;
      params.push(n);
      clauses.push(`ST_Area(d.geom::geography) <= $${idx}`);
    }
  }

  const clauseStr = clauses.length ? ` AND ${clauses.join(" AND ")}` : "";
  return { clauses: clauseStr, params };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const countOnly = searchParams.get("countOnly") === "1";
    const bbox = parseBbox(searchParams);
    const bboxClause =
      bbox == null
        ? ""
        : `AND ST_Intersects(d.geom, ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326))`;
    const { clauses: filterClauses, params: filterParams } = buildFilterClauses(searchParams);

    const client = await pool.connect();
    try {
      const whereTail = `${bboxClause}${filterClauses}`;
      if (countOnly) {
        const r = await client.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM ${FENCES_TABLE} f, LATERAL ST_Dump(f.geom) AS d WHERE f.geom IS NOT NULL ${whereTail}`,
          filterParams
        );
        const total = parseInt(r.rows[0]?.count ?? "0", 10);
        return NextResponse.json({ total });
      }
      let rows: RowSimple[] | RowExtended[];
      let extended = false;
      const sqlSimpleWithFilter = `
  SELECT f.id, f.name,
    ST_AsGeoJSON(d.geom)::json as geometry
  FROM ${FENCES_TABLE} f,
  LATERAL ST_Dump(f.geom) AS d
  WHERE f.geom IS NOT NULL
  ${whereTail}
  ORDER BY f.id, d.path;
`;
      const sqlExtendedWithFilter = `
  SELECT f.id, f.name, f.address, f.city,
    ST_AsGeoJSON(d.geom)::json as geometry
  FROM ${FENCES_TABLE} f,
  LATERAL ST_Dump(f.geom) AS d
  WHERE f.geom IS NOT NULL
  ${whereTail}
  ORDER BY f.id, d.path;
`;
      try {
        const r = await client.query<RowExtended>(sqlExtendedWithFilter, filterParams);
        rows = r.rows;
        extended = true;
      } catch {
        const r = await client.query<RowSimple>(sqlSimpleWithFilter, filterParams);
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateFenceBody;
    const name = typeof body.name === "string" ? body.name.trim() || "New Fence" : "New Fence";
    const geometry = body.geometry;
    if (!geometry || !isValidPolygon(geometry)) {
      return NextResponse.json(
        { error: "Invalid geometry", detail: "geometry must be a GeoJSON Polygon with at least 3 points" },
        { status: 400 }
      );
    }
    const client = await pool.connect();
    try {
      const geoJson = JSON.stringify(geometry);
      const result = await client.query<{ id: number; name: string }>(
        `INSERT INTO ${FENCES_TABLE} (name, geom) VALUES ($1, ST_GeomFromGeoJSON($2)::geometry(Polygon, 4326)) RETURNING id, name`,
        [name, geoJson]
      );
      const row = result.rows[0];
      if (!row) {
        return NextResponse.json({ error: "Insert failed" }, { status: 500 });
      }
      const response: FenceApiResponse = {
        id: row.id,
        name: row.name,
        geometry,
      };
      return NextResponse.json(response, { status: 201 });
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
