/**
 * Shared fence API utilities - used by route handlers.
 * Kept in lib/ so route files only export GET/POST/etc (Next.js requirement).
 */

const _t = (process.env.FENCES_TABLE || "fence").trim();
export const FENCES_TABLE = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(_t) ? _t : "fence";

export type FilterParams = {
  search?: string;
  region?: string;
  status?: string;
  minArea?: number;
  maxArea?: number;
};

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

/** Build filter WHERE clauses and params for GET /api/fences. */
export function buildFilterClauses(
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

  const region = searchParams.get("region")?.toLowerCase();
  if (region && ["lahore", "karachi", "islamabad", "other"].includes(region)) {
    if (region === "other") {
      clauses.push(
        `(f.name NOT ILIKE '%lahore%' AND f.name NOT ILIKE '%karachi%' AND f.name NOT ILIKE '%islamabad%')`
      );
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
