/**
 * Enterprise GIS: master table names and filter utilities.
 * APIs use fences_master, roads_master, regions_master, cities_master, areas_master.
 * Existing table "fence" is never modified.
 */

export const TABLE = {
  fences_master: "fences_master",
  roads_master: "roads_master",
  regions_master: "regions_master",
  cities_master: "cities_master",
  areas_master: "areas_master",
} as const;

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

/** Build WHERE clause for bbox using ST_Intersects (geom column name passed in). */
export function bboxClause(bbox: number[] | null, geomColumn: string): string {
  if (!bbox || bbox.length !== 4) return "";
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return ` AND ST_Intersects(${geomColumn}, ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))`;
}

/** Build filter WHERE clauses and params for GET /api/fences (fences_master). */
export function buildFencesFilterClauses(
  searchParams: URLSearchParams
): { clauses: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];
  let idx = 0;

  const search = searchParams.get("search")?.trim();
  if (search) {
    idx++;
    params.push(`%${search}%`);
    clauses.push(`(f.name ILIKE $${idx})`);
  }

  const status = searchParams.get("status")?.trim();
  if (status && status.length > 0) {
    const s = status.toLowerCase();
    if (s === "active" || s === "inactive") {
      idx++;
      params.push(s);
      clauses.push(`(LOWER(TRIM(COALESCE(f.status, ''))) = LOWER($${idx}))`);
    }
  }

  const routeType = searchParams.get("route_type") ?? searchParams.get("routeType");
  if (routeType?.trim()) {
    const types = routeType
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => ["motorway", "highway", "intracity", "other"].includes(s));
    if (types.length > 0) {
      idx++;
      params.push(types);
      clauses.push(`(LOWER(COALESCE(f.route_type, '')) = ANY($${idx}::text[]))`);
    }
  }

  const regionName = (searchParams.get("region_name") ?? searchParams.get("region"))?.trim();
  if (regionName) {
    idx++;
    params.push(regionName);
    clauses.push(`(LOWER(TRIM(COALESCE(f.region_name, ''))) = LOWER(TRIM($${idx})))`);
  }

  const isBig = searchParams.get("is_big") ?? searchParams.get("bigOnly");
  if (isBig === "1" || isBig === "true") {
    clauses.push("(f.is_big = true)");
  }

  const clauseStr = clauses.length ? ` AND ${clauses.join(" AND ")}` : "";
  return { clauses: clauseStr, params };
}
