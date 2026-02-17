"use client";

/**
 * Color legend for Enterprise GIS Map – explains what each color represents.
 */

const FENCE_ACTIVE_COLOR = "#3b82f6";
const FENCE_INACTIVE_COLOR = "#94a3b8";
const ROAD_MOTORWAY_COLOR = "#dc2626";
const ROAD_TRUNK_PRIMARY_COLOR = "#ea580c";
const ROAD_SECONDARY_COLOR = "#eab308";
const REGION_BORDER_COLOR = "#a78bfa";
const CITY_COLOR = "#1f2937";
const AREA_COLOR = "#9ca3af";

export default function GisMapLegend() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2.5 text-left shadow-lg backdrop-blur">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        Map colors
      </p>

      <p className="mb-1 mt-2 text-xs font-medium text-slate-500">Fences</p>
      <ul className="space-y-1 text-sm">
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-3.5 w-3.5 shrink-0 rounded border border-slate-300"
            style={{ backgroundColor: FENCE_ACTIVE_COLOR, opacity: 0.9 }}
          />
          <span className="text-slate-700">Active</span>
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-3.5 w-3.5 shrink-0 rounded border border-slate-300"
            style={{ backgroundColor: FENCE_INACTIVE_COLOR, opacity: 0.9 }}
          />
          <span className="text-slate-700">Inactive</span>
        </li>
        <li className="text-xs text-slate-500">Thick border = big fence (&gt; 50 km²)</li>
      </ul>

      <p className="mb-1 mt-3 text-xs font-medium text-slate-500">Roads</p>
      <ul className="space-y-1 text-sm">
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-1 w-5 shrink-0 rounded"
            style={{ backgroundColor: ROAD_MOTORWAY_COLOR }}
          />
          <span className="text-slate-700">Motorway</span>
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-1 w-5 shrink-0 rounded"
            style={{ backgroundColor: ROAD_TRUNK_PRIMARY_COLOR }}
          />
          <span className="text-slate-700">Trunk / Primary</span>
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-1 w-5 shrink-0 rounded"
            style={{ backgroundColor: ROAD_SECONDARY_COLOR }}
          />
          <span className="text-slate-700">Secondary</span>
        </li>
      </ul>

      <p className="mb-1 mt-3 text-xs font-medium text-slate-500">Other layers</p>
      <ul className="space-y-1 text-sm">
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full border border-slate-300"
            style={{ backgroundColor: REGION_BORDER_COLOR, borderColor: REGION_BORDER_COLOR, borderWidth: 2 }}
          />
          <span className="text-slate-700">Regions (admin boundary)</span>
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: CITY_COLOR }}
          />
          <span className="text-slate-700">Cities / Towns</span>
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: AREA_COLOR }}
          />
          <span className="text-slate-700">Areas (suburb, locality)</span>
        </li>
      </ul>
    </div>
  );
}
