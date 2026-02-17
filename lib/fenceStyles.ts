/**
 * Dynamic polygon styling for fences based on name/region, area, and status.
 */

import type { FenceFeature, GeoJSONGeometry } from "@/types/fence";

/** Region = actual province name (from lat/long). Colors per province. Lahore/Karachi = legacy name-based. */
export const REGION_COLORS: Record<string, string> = {
  Punjab: "#22c55e",
  Sindh: "#3b82f6",
  "Khyber Pakhtunkhwa": "#d97706",
  Balochistan: "#059669",
  "Gilgit-Baltistan": "#0ea5e9",
  "Azad Jammu and Kashmir": "#7c3aed",
  Islamabad: "#a855f7",
  Other: "#64748b",
  Lahore: "#22c55e",
  Karachi: "#3b82f6",
};

export type RegionKey = string;

/** Map DB region string to color (exact name or normalized). */
function getRegionColor(regionName: string): string {
  const key = regionName?.trim() || "Other";
  return REGION_COLORS[key] ?? REGION_COLORS["Other"] ?? "#64748b";
}

/** Status-based overrides */
export const STATUS_COLORS = {
  active: "#22c55e",
  inactive: "#94a3b8",
} as const;

/** Determine region key (for color) from properties.region (actual province name from lat/long). */
export function getRegionFromFence(feat: FenceFeature): RegionKey {
  const region = (feat.properties as { region?: string | null } | undefined)?.region;
  return (region && String(region).trim()) || "Other";
}

/** Get base fill color by region. */
export function getColorByRegion(feat: FenceFeature): string {
  return getRegionColor(getRegionFromFence(feat));
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
  /** When true, route-type polygons use higher opacity and thicker stroke for clarity */
  emphasizeRouteType?: boolean;
}

export interface FenceStyleResult {
  fillColor: string;
  fillOpacity: number;
  color: string;
  weight: number;
}

/** Route-type colors – vivid and distinct for clarity when overlapping */
export const ROUTE_TYPE_COLORS = {
  motorway: "#059669",
  highway: "#2563eb",
  intracity: "#7c3aed",
  other: "#b45309",
} as const;

export type RouteTypeKey = keyof typeof ROUTE_TYPE_COLORS;

export function getRouteTypeFromFence(
  feat: FenceFeature
): RouteTypeKey | undefined {
  const rt = (feat.properties as { routeType?: string | null } | undefined)
    ?.routeType;
  if (!rt) return undefined;
  const lower = String(rt).toLowerCase().trim();
  if (lower === "motorway") return "motorway";
  if (lower === "highway") return "highway";
  if (lower === "intracity") return "intracity";
  if (lower === "other") return "other";
  return undefined;
}

/**
 * Compute style for a fence: region color, optionally overridden by status,
 * then darkened by area (larger = darker).
 */
export function getStyleForFence(
  feat: FenceFeature,
  options: FenceStyleOptions
): FenceStyleResult {
  const { fillOpacity, strokeWeight = 1.5, strokeColor = "#1e293b", emphasizeRouteType = true } = options;
  let fillColor: string;
  let color = strokeColor;
  let weight = strokeWeight;

  const status = getStatusFromFence(feat);
  const routeType = getRouteTypeFromFence(feat);

  if (routeType !== undefined) {
    fillColor = ROUTE_TYPE_COLORS[routeType];
    color = darkenHex(fillColor, routeType === "other" ? 0.25 : 0.15);
    if (emphasizeRouteType) weight = Math.max(weight, 2);
  } else if (status !== undefined) {
    fillColor = STATUS_COLORS[status];
  } else {
    fillColor = getColorByRegion(feat);
    const area = polygonAreaApprox(feat.geometry);
    const darken = areaToDarkenFactor(area);
    if (darken > 0) fillColor = darkenHex(fillColor, darken);
  }

  const effectiveOpacity =
    routeType !== undefined && emphasizeRouteType
      ? Math.max(fillOpacity, routeType === "other" ? 0.28 : 0.42)
      : fillOpacity;

  return {
    fillColor,
    fillOpacity: effectiveOpacity,
    color,
    weight,
  };
}

/** Legend items for region colors (for MapLegend) – actual province names. */
export const REGION_LEGEND_ITEMS: { key: string; label: string; color: string }[] = [
  { key: "Punjab", label: "Punjab", color: REGION_COLORS.Punjab },
  { key: "Sindh", label: "Sindh", color: REGION_COLORS.Sindh },
  { key: "Khyber Pakhtunkhwa", label: "Khyber Pakhtunkhwa", color: REGION_COLORS["Khyber Pakhtunkhwa"] },
  { key: "Balochistan", label: "Balochistan", color: REGION_COLORS.Balochistan },
  { key: "Gilgit-Baltistan", label: "Gilgit-Baltistan", color: REGION_COLORS["Gilgit-Baltistan"] },
  { key: "Azad Jammu and Kashmir", label: "Azad Jammu & Kashmir", color: REGION_COLORS["Azad Jammu and Kashmir"] },
  { key: "Islamabad", label: "Islamabad", color: REGION_COLORS.Islamabad },
  { key: "Other", label: "Other", color: REGION_COLORS.Other },
];

export const STATUS_LEGEND_ITEMS: { key: "active" | "inactive"; label: string; color: string }[] = [
  { key: "active", label: "Active", color: STATUS_COLORS.active },
  { key: "inactive", label: "Inactive", color: STATUS_COLORS.inactive },
];

export const ROUTE_TYPE_LEGEND_ITEMS: { key: RouteTypeKey; label: string; color: string }[] = [
  { key: "motorway", label: "Motorway", color: ROUTE_TYPE_COLORS.motorway },
  { key: "highway", label: "Highway", color: ROUTE_TYPE_COLORS.highway },
  { key: "intracity", label: "Intracity", color: ROUTE_TYPE_COLORS.intracity },
  { key: "other", label: "Other (regional)", color: ROUTE_TYPE_COLORS.other },
];
