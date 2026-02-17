/**
 * Styling for Enterprise GIS map layers.
 * Fences: Active = Blue, Inactive = Grey, Big = thicker border.
 * Roads: Motorway = Red, Trunk/Primary = Orange, Secondary = Yellow.
 * Regions: Light purple border. Cities: Black circle. Areas: Grey marker.
 */

import type { FenceMasterFeature } from "@/types/masterGis";
import type { RoadFeature, RegionFeature } from "@/types/masterGis";

export const FENCE_STROKE_WEIGHT = 1.5;
export const FENCE_STROKE_WEIGHT_BIG = 3;

export function getFenceStyleForGisMap(
  feat: FenceMasterFeature,
  opts?: { fillOpacity?: number }
): { fillColor: string; fillOpacity: number; color: string; weight: number } {
  const status = (feat.properties?.status ?? "active").toString().toLowerCase();
  const isBig = feat.properties?.is_big === true;
  const fillOpacity = opts?.fillOpacity ?? 0.35;
  if (status === "inactive") {
    return {
      fillColor: "#94a3b8",
      fillOpacity,
      color: "#64748b",
      weight: isBig ? FENCE_STROKE_WEIGHT_BIG : FENCE_STROKE_WEIGHT,
    };
  }
  return {
    fillColor: "#3b82f6",
    fillOpacity,
    color: "#1d4ed8",
    weight: isBig ? FENCE_STROKE_WEIGHT_BIG : FENCE_STROKE_WEIGHT,
  };
}

const ROAD_COLORS: Record<string, string> = {
  motorway: "#dc2626",
  trunk: "#ea580c",
  primary: "#ea580c",
  secondary: "#eab308",
};

export function getRoadStyleForGisMap(feat: RoadFeature): { color: string; weight: number } {
  const highway = (feat.properties?.highway ?? feat.properties?.road_class ?? "secondary")
    .toString()
    .toLowerCase();
  const color = ROAD_COLORS[highway] ?? "#eab308";
  const weight = highway === "motorway" ? 4 : highway === "trunk" || highway === "primary" ? 3 : 2;
  return { color, weight };
}

export const REGION_STYLE = {
  color: "#a78bfa",
  weight: 1.5,
  fillColor: "transparent",
  fillOpacity: 0,
};

export const CITY_MARKER_OPTIONS = {
  radius: 6,
  fillColor: "#1f2937",
  color: "#111827",
  weight: 1,
  fillOpacity: 0.9,
};

export const AREA_MARKER_OPTIONS = {
  radius: 3,
  fillColor: "#9ca3af",
  color: "#6b7280",
  weight: 1,
  fillOpacity: 0.8,
};
