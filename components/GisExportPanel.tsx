"use client";

import { useState } from "react";
import type { GisMapViewFilterParams } from "./GisMapView";

type ExportFormat = "geojson" | "kml" | "csv";

function buildGisExportUrl(
  format: ExportFormat,
  options: { bbox: [number, number, number, number] | null; filterParams?: GisMapViewFilterParams }
): string {
  const params = new URLSearchParams();
  params.set("format", format);
  if (options.bbox) params.set("bbox", options.bbox.join(","));
  const fp = options.filterParams;
  if (fp?.search?.trim()) params.set("search", fp.search.trim());
  if (fp?.region) params.set("region_name", fp.region);
  if (fp?.region_name) params.set("region_name", fp.region_name);
  if (fp?.status) params.set("status", fp.status);
  if (fp?.route_type) params.set("route_type", fp.route_type);
  if (fp?.routeType) params.set("route_type", fp.routeType);
  if (fp?.bigOnly === "1" || fp?.is_big === "1") params.set("is_big", "1");
  return `/api/gis/fences/export?${params.toString()}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface GisExportPanelProps {
  getBounds?: () => [number, number, number, number] | null;
  filterParams?: GisMapViewFilterParams;
}

export default function GisExportPanel({ getBounds, filterParams }: GisExportPanelProps) {
  const [visibleOnly, setVisibleOnly] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setError(null);
    setExporting(format);
    try {
      const bbox = visibleOnly && getBounds ? getBounds() : null;
      const url = buildGisExportUrl(format, { bbox, filterParams });
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail || (data as { error?: string }).error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      let filename = `fences_${Date.now()}.${format === "geojson" ? "geojson" : format}`;
      const match = disposition?.match(/filename="?([^";\n]+)"?/);
      if (match) filename = match[1];
      triggerDownload(blob, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-white/95 p-3 shadow backdrop-blur">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Export</h2>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={visibleOnly}
          onChange={(e) => setVisibleOnly(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm">Current map view only</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {(["geojson", "kml", "csv"] as const).map((fmt) => (
          <button
            key={fmt}
            type="button"
            disabled={exporting !== null}
            onClick={() => handleExport(fmt)}
            className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting === fmt ? "…" : fmt.toUpperCase()}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
