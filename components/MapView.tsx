"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONFeatureCollection, FenceFeature } from "@/types/fence";

const CENTER: [number, number] = [30.3753, 69.3451];
const ZOOM = 6;
const FILL = "#3388ff";
const FILL_OPACITY = 0.3;
const FILL_OPACITY_HOVER = 0.6;
const STROKE = "#ff0000";
const STROKE_WEIGHT = 2;

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;

    const L = require("leaflet");
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });

    const map = L.map(containerRef.current).setView(CENTER, ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const run = async () => {
      try {
        const res = await fetch("/api/fences");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const fc = (await res.json()) as GeoJSONFeatureCollection<FenceFeature>;

        setCount(fc.features.length);

        L.geoJSON(fc, {
          style: () => ({
            fillColor: FILL,
            fillOpacity: FILL_OPACITY,
            color: STROKE,
            weight: STROKE_WEIGHT,
          }),
          onEachFeature(f: unknown, layer: { bindTooltip: (s: string, o?: object) => void; bindPopup: (s: string) => void; on: (e: object) => void }) {
            const feat = f as FenceFeature;
            const name = feat.properties?.name ?? `Zone_${feat.id ?? "?"}`;
            const id = feat.id ?? "?";
            const label = `${name} (ID: ${id})`;

            layer.bindTooltip(label, {
              sticky: true,
              className: "fence-tooltip",
              offset: [0, -2],
            });
            layer.bindPopup(label);

            layer.on({
              mouseover(e: { target: { setStyle: (s: object) => void; bringToFront: () => void } }) {
                e.target.setStyle({ fillOpacity: FILL_OPACITY_HOVER });
                e.target.bringToFront();
              },
              mouseout(e: { target: { setStyle: (s: object) => void } }) {
                e.target.setStyle({ fillOpacity: FILL_OPACITY });
              },
            });
          },
        }).addTo(map);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load fences");
      } finally {
        setLoading(false);
      }
    };

    run();

    return () => {
      map.remove();
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {!loading && !error && (
        <div className="absolute bottom-4 left-4 z-[1000] rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-slate-300"
              style={{ backgroundColor: FILL, opacity: FILL_OPACITY }}
            />
            <span className="font-medium text-slate-700">Fences</span>
            {count != null && <span className="text-slate-500">({count})</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">Hover for name · Click for details</p>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90">
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-4 shadow-lg">
            <div className="h-10 w-10 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
            <p className="text-slate-600 text-sm">Loading fences…</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90">
          <div className="rounded-xl border border-red-200 bg-white px-6 py-4 shadow-lg">
            <p className="font-medium text-red-700">Error loading map</p>
            <p className="mt-1 text-sm text-slate-600">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
