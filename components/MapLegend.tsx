"use client";

import {
  REGION_LEGEND_ITEMS,
  STATUS_LEGEND_ITEMS,
} from "@/lib/fenceStyles";

export default function MapLegend() {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Region
      </p>
      <ul className="space-y-1.5">
        {REGION_LEGEND_ITEMS.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-3.5 w-3.5 shrink-0 rounded border border-slate-300"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-slate-700">{item.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Status
      </p>
      <ul className="space-y-1.5">
        {STATUS_LEGEND_ITEMS.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-3.5 w-3.5 shrink-0 rounded border border-slate-300"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-slate-700">{item.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        <span className="font-medium text-slate-600">Area:</span> larger polygons
        appear darker.
      </p>
    </div>
  );
}
