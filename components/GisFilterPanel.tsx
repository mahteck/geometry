"use client";

import { useCallback } from "react";
import type { FenceMasterFeature } from "@/types/masterGis";
import type { GisMapViewLayerVisibility } from "./GisMapView";

const REGIONS = [
  { value: "", label: "All regions" },
  { value: "Punjab", label: "Punjab" },
  { value: "Sindh", label: "Sindh" },
  { value: "Khyber Pakhtunkhwa", label: "Khyber Pakhtunkhwa" },
  { value: "Balochistan", label: "Balochistan" },
  { value: "Gilgit-Baltistan", label: "Gilgit-Baltistan" },
  { value: "Azad Jammu and Kashmir", label: "Azad Jammu & Kashmir" },
  { value: "Islamabad", label: "Islamabad" },
  { value: "Other", label: "Other" },
];

const ROAD_TYPES = [
  { value: "", label: "All" },
  { value: "motorway", label: "Motorway" },
  { value: "trunk", label: "Trunk" },
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
];

export interface GisFilterState {
  search: string;
  region: string;
  status: string;
  showBigFences: boolean;
  roadType: string;
  layers: GisMapViewLayerVisibility;
}

export const DEFAULT_GIS_FILTERS: GisFilterState = {
  search: "",
  region: "",
  status: "active",
  showBigFences: false,
  roadType: "",
  layers: {
    fences: true,
    roads: true,
    regions: true,
    cities: true,
    areas: false,
  },
};

export function gisFilterStateToParams(state: GisFilterState): Record<string, string> {
  const params: Record<string, string> = {};
  if (state.search.trim()) params.search = state.search.trim();
  if (state.region) params.region = state.region;
  if (state.status) params.status = state.status;
  if (state.showBigFences) params.bigOnly = "1";
  if (state.roadType) params.roadType = state.roadType;
  return params;
}

export function paramsToGisFilterState(params: URLSearchParams, current?: GisFilterState): GisFilterState {
  const base = current ?? DEFAULT_GIS_FILTERS;
  return {
    ...base,
    search: params.get("search") ?? base.search,
    region: params.get("region") ?? base.region,
    status: params.get("status") ?? base.status,
    showBigFences: params.get("bigOnly") === "1",
    roadType: params.get("roadType") ?? base.roadType,
  };
}

export interface GisFilterPanelProps {
  filterState: GisFilterState;
  onFilterChange: (state: GisFilterState) => void;
  results: FenceMasterFeature[];
  resultCount: number | null;
  onZoomToFeature: (feat: FenceMasterFeature) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export default function GisFilterPanel({
  filterState,
  onFilterChange,
  results,
  resultCount,
  onZoomToFeature,
  onClearFilters,
  hasActiveFilters,
}: GisFilterPanelProps) {
  const set = useCallback(
    (patch: Partial<GisFilterState>) => {
      onFilterChange({ ...filterState, ...patch });
    },
    [filterState, onFilterChange]
  );

  const setLayer = useCallback(
    (key: keyof GisMapViewLayerVisibility, value: boolean) => {
      onFilterChange({
        ...filterState,
        layers: { ...filterState.layers, [key]: value },
      });
    },
    [filterState, onFilterChange]
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-slate-200/80 bg-white/95 p-3 shadow-lg backdrop-blur">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
        Search &amp; filter
      </h2>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Search by name</label>
        <input
          type="text"
          value={filterState.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="e.g. Lahore, Zone 1"
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Region</label>
        <select
          value={filterState.region}
          onChange={(e) => set({ region: e.target.value })}
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {REGIONS.map((r) => (
            <option key={r.value || "all"} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Fence status</label>
        <select
          value={filterState.status}
          onChange={(e) => set({ status: e.target.value })}
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Road type</label>
        <select
          value={filterState.roadType}
          onChange={(e) => set({ roadType: e.target.value })}
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {ROAD_TYPES.map((r) => (
            <option key={r.value || "all"} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={filterState.showBigFences}
          onChange={(e) => set({ showBigFences: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
        />
        <span className="text-sm">Show big fences only (&gt; 50 km²)</span>
      </label>

      <div className="border-t border-slate-200 pt-2">
        <p className="mb-2 text-xs font-medium text-slate-500">Layer visibility</p>
        <div className="flex flex-col gap-1.5">
          {(["fences", "roads", "regions", "cities", "areas"] as const).map((key) => (
            <label key={key} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={filterState.layers[key]}
                onChange={(e) => setLayer(key, e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm capitalize">{key}</span>
            </label>
          ))}
        </div>
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="rounded border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200"
        >
          Clear filters
        </button>
      )}

      <div className="border-t border-slate-200 pt-2">
        <p className="text-xs font-medium text-slate-600">
          {resultCount != null ? `Fences: ${resultCount}` : "Fences: —"}
        </p>
        {results.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-y-auto rounded border border-slate-200 bg-slate-50/80">
            {results.slice(0, 100).map((feat) => {
              const name = feat.properties?.name ?? `Zone_${feat.id}`;
              const routeType = feat.properties?.route_type ?? "";
              return (
                <li key={feat.id}>
                  <button
                    type="button"
                    onClick={() => onZoomToFeature(feat)}
                    className="w-full px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-blue-100 hover:text-blue-800"
                  >
                    {name}{" "}
                    <span className="text-slate-400">
                      (ID: {feat.id}
                      {routeType ? ` · ${routeType}` : ""})
                    </span>
                  </button>
                </li>
              );
            })}
            {results.length > 100 && (
              <li className="px-2.5 py-1.5 text-xs text-slate-500">+{results.length - 100} more</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
