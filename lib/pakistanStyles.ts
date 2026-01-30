/**
 * Province color scheme for Pakistan map
 * Each province has a distinct color for visual differentiation
 */
export const PROVINCE_COLORS: Record<string, string> = {
  "01": "#a855f7", // Gilgit-Baltistan - Purple
  "02": "#eab308", // Balochistan - Yellow
  "03": "#f97316", // KPK - Orange
  "04": "#22c55e", // Punjab - Green
  "05": "#3b82f6", // Sindh - Blue
  "06": "#ec4899", // Azad Kashmir - Pink
  "07": "#ef4444", // Islamabad - Red
  "08": "#ef4444", // Islamabad (alt) - Red
};

export const DEFAULT_PROVINCE_COLOR = "#94a3b8";

export function getProvinceColor(code: string): string {
  return PROVINCE_COLORS[code] ?? DEFAULT_PROVINCE_COLOR;
}
