"use client";

import { useState } from "react";

export interface ExportPanelFilterParams {
  search?: string;
  region?: string;
  status?: string;
  minArea?: string;
  maxArea?: string;
}

export interface ExportPanelProps {
  /** Returns current map bounds [minLng, minLat, maxLng, maxLat] or null */
  getBounds?: () => [number, number, number, number] | null;
  /** Current filters to apply to export (same as map filters) */
  filterParams?: ExportPanelFilterParams;
}

type ExportFormat = "geojson" | "kml" | "csv";

function buildExportUrl(
  format: ExportFormat,
  options: { bbox: [number, number, number, number] | null; filterParams?: ExportPanelFilterParams }
): string {
  const params = new URLSearchParams();
  params.set("format", format);
  if (options.bbox) {
    params.set("bbox", options.bbox.join(","));
  }
  const fp = options.filterParams;
  if (fp?.search?.trim()) params.set("search", fp.search.trim());
  if (fp?.region) params.set("region", fp.region);
  if (fp?.status) params.set("status", fp.status);
  if (fp?.minArea) params.set("minArea", fp.minArea);
  if (fp?.maxArea) params.set("maxArea", fp.maxArea);
  return `/api/fences/export?${params.toString()}`;
}

function timestampFilename(ext: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `fences_${y}-${m}-${d}_${h}-${min}-${s}.${ext}`;
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

export default function ExportPanel({ getBounds, filterParams }: ExportPanelProps) {
  const [visibleOnly, setVisibleOnly] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setError(null);
    setExporting(format);
    try {
      const bbox = visibleOnly && getBounds ? getBounds() : null;
      const url = buildExportUrl(format, { bbox, filterParams });
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail || data.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      let filename = timestampFilename(format === "geojson" ? "geojson" : format === "kml" ? "kml" : "csv");
      if (disposition) {
        const match = /filename="?([^";\n]+)"?/.exec(disposition);
        if (match?.[1]) filename = match[1].trim();
      }
      triggerDownload(blob, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <p className="text-sm font-medium text-slate-700">Export</p>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={visibleOnly}
          onChange={(e) => setVisibleOnly(e.target.checked)}
          className="rounded border-slate-300"
        />
        Export visible fences only
      </label>
      {visibleOnly && !getBounds && (
        <p className="text-xs text-amber-600">Map not ready — export will include all matching fences.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleExport("geojson")}
          disabled={!!exporting}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {exporting === "geojson" ? "…" : "GeoJSON"}
        </button>
        <button
          type="button"
          onClick={() => handleExport("kml")}
          disabled={!!exporting}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {exporting === "kml" ? "…" : "KML"}
        </button>
        <button
          type="button"
          onClick={() => handleExport("csv")}
          disabled={!!exporting}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {exporting === "csv" ? "…" : "CSV"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
