/**
 * Dynamic polygon styling for fences based on name/region, area, and status.
 */

import type { FenceFeature, GeoJSONGeometry } from "@/types/fence";

/** Region-based colors (by fence name or city) */
export const REGION_COLORS = {
  lahore: "#22c55e",
  karachi: "#3b82f6",
  islamabad: "#a855f7",
  other: "#f97316",
} as const;

/** Status-based overrides */
export const STATUS_COLORS = {
  active: "#22c55e",
  inactive: "#94a3b8",
} as const;

export type RegionKey = keyof typeof REGION_COLORS;

/** Determine region from fence name or city (case-insensitive match). */
export function getRegionFromFence(feat: FenceFeature): RegionKey {
  const name = (feat.properties?.name ?? "").toString().toLowerCase();
  const city = (feat.properties?.city ?? "").toString().toLowerCase();
  const combined = `${name} ${city}`;
  if (/\blahore\b/.test(combined)) return "lahore";
  if (/\bkarachi\b/.test(combined)) return "karachi";
  if (/\bislamabad\b/.test(combined)) return "islamabad";
  return "other";
}

/** Get base fill color by region. */
export function getColorByRegion(feat: FenceFeature): string {
  return REGION_COLORS[getRegionFromFence(feat)];
}

/** Get status from properties (active | inactive | undefined). */
export function getStatusFromFence(feat: FenceFeature): "active" | "inactive" | undefined {
  const s = (feat.properties as { status?: string } | undefined)?.status;
  if (s == null || s === "") return undefined;
  const lower = String(s).toLowerCase().trim();
  if (lower === "active") return "active";
  if (lower === "inactive") return "inactive";
  return undefined;
}

/** Approximate polygon area (squared degrees, for relative comparison). Uses shoelace on first ring. */
export function polygonAreaApprox(geom: GeoJSONGeometry): number {
  if (!geom || geom.type !== "Polygon" || !Array.isArray(geom.coordinates)) return 0;
  const ring = geom.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [x1, y1] = ring[i] as [number, number];
    const [x2, y2] = ring[j] as [number, number];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/** Darken a hex color by a factor 0–1 (0 = no change, 1 = black). */
export function darkenHex(hex: string, factor: number): string {
  const n = hex.replace(/^#/, "");
  if (n.length !== 6) return hex;
  const r = Math.max(0, Math.round(parseInt(n.slice(0, 2), 16) * (1 - factor)));
  const g = Math.max(0, Math.round(parseInt(n.slice(2, 4), 16) * (1 - factor)));
  const b = Math.max(0, Math.round(parseInt(n.slice(4, 6), 16) * (1 - factor)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Area to darken factor: larger area = darker. Uses log scale so huge polygons don't go black. */
function areaToDarkenFactor(areaSqDeg: number): number {
  if (areaSqDeg <= 0) return 0;
  const logArea = Math.log10(1 + areaSqDeg);
  const maxLog = 4;
  const t = Math.min(1, logArea / maxLog);
  return t * 0.35;
}

export interface FenceStyleOptions {
  fillOpacity: number;
  strokeWeight?: number;
  strokeColor?: string;
}

export interface FenceStyleResult {
  fillColor: string;
  fillOpacity: number;
  color: string;
  weight: number;
}

/**
 * Compute style for a fence: region color, optionally overridden by status,
 * then darkened by area (larger = darker).
 */
export function getStyleForFence(
  feat: FenceFeature,
  options: FenceStyleOptions
): FenceStyleResult {
  const { fillOpacity, strokeWeight = 1.5, strokeColor = "#1e293b" } = options;
  let fillColor: string;

  const status = getStatusFromFence(feat);
  if (status !== undefined) {
    fillColor = STATUS_COLORS[status];
  } else {
    fillColor = getColorByRegion(feat);
    const area = polygonAreaApprox(feat.geometry);
    const darken = areaToDarkenFactor(area);
    if (darken > 0) fillColor = darkenHex(fillColor, darken);
  }

  return {
    fillColor,
    fillOpacity,
    color: strokeColor,
    weight: strokeWeight,
  };
}

/** Legend items for region colors (for MapLegend). */
export const REGION_LEGEND_ITEMS: { key: RegionKey; label: string; color: string }[] = [
  { key: "lahore", label: "Lahore", color: REGION_COLORS.lahore },
  { key: "karachi", label: "Karachi", color: REGION_COLORS.karachi },
  { key: "islamabad", label: "Islamabad", color: REGION_COLORS.islamabad },
  { key: "other", label: "Other", color: REGION_COLORS.other },
];

export const STATUS_LEGEND_ITEMS: { key: "active" | "inactive"; label: string; color: string }[] = [
  { key: "active", label: "Active", color: STATUS_COLORS.active },
  { key: "inactive", label: "Inactive", color: STATUS_COLORS.inactive },
];
