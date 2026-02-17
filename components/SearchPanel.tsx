"use client";

import { useCallback } from "react";
import type { FenceFeature } from "@/types/fence";

/** 50 km² in m² – threshold for "big fence" filter */
export const BIG_FENCE_AREA_M2 = 50_000_000;

export interface FilterState {
  search: string;
  region: string;
  status: string;
  minArea: string;
  maxArea: string;
  showMotorways: boolean;
  showHighways: boolean;
  showIntracity: boolean;
  showOther: boolean;
  showBigFences: boolean;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  region: "",
  status: "active",
  minArea: "",
  maxArea: "",
  showMotorways: true,
  showHighways: true,
  showIntracity: true,
  showOther: false,
  showBigFences: false,
};

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

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export function filterStateToParams(state: FilterState): Record<string, string> {
  const params: Record<string, string> = {};
  if (state.search.trim()) params.search = state.search.trim();
  if (state.region) params.region = state.region;
  if (state.status) params.status = state.status;
  const routeTypes: string[] = [];
  if (state.showMotorways) routeTypes.push("motorway");
  if (state.showHighways) routeTypes.push("highway");
  if (state.showIntracity) routeTypes.push("intracity");
  if (state.showOther) routeTypes.push("other");
  if (routeTypes.length > 0) params.routeType = routeTypes.join(",");
  if (state.showBigFences) params.bigOnly = "1";
  if (state.minArea.trim() && /^\d+(\.\d+)?$/.test(state.minArea.trim()))
    params.minArea = state.minArea.trim();
  if (state.maxArea.trim() && /^\d+(\.\d+)?$/.test(state.maxArea.trim()))
    params.maxArea = state.maxArea.trim();
  return params;
}

export function paramsToFilterState(params: URLSearchParams): FilterState {
  const rt = params.get("routeType") ?? "";
  const types = rt.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const hasRouteFilter = types.length > 0;
  return {
    search: params.get("search") ?? "",
    region: params.get("region") ?? "",
    status: params.get("status") ?? DEFAULT_FILTERS.status,
    minArea: params.get("minArea") ?? "",
    maxArea: params.get("maxArea") ?? "",
    showMotorways: hasRouteFilter ? types.includes("motorway") : DEFAULT_FILTERS.showMotorways,
    showHighways: hasRouteFilter ? types.includes("highway") : DEFAULT_FILTERS.showHighways,
    showIntracity: hasRouteFilter ? types.includes("intracity") : DEFAULT_FILTERS.showIntracity,
    showOther: hasRouteFilter ? types.includes("other") : DEFAULT_FILTERS.showOther,
    showBigFences: params.get("bigOnly") === "1",
  };
}

interface SearchPanelProps {
  filterState: FilterState;
  onFilterChange: (state: FilterState) => void;
  results: FenceFeature[];
  resultCount: number | null;
  onZoomToFeature: (feat: FenceFeature) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export default function SearchPanel({
  filterState,
  onFilterChange,
  results,
  resultCount,
  onZoomToFeature,
  onClearFilters,
  hasActiveFilters,
}: SearchPanelProps) {
  const set = useCallback(
    (patch: Partial<FilterState>) => {
      onFilterChange({ ...filterState, ...patch });
    },
    [filterState, onFilterChange]
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-slate-200/80 bg-white/95 p-3 shadow-lg backdrop-blur">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
        Search &amp; filter
      </h2>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Name search</label>
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
        <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
        <select
          value={filterState.status}
          onChange={(e) => set({ status: e.target.value })}
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value || "all"} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">Road Networks</p>
        <div className="flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={filterState.showMotorways}
              onChange={(e) => set({ showMotorways: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm">Show Motorways</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={filterState.showHighways}
              onChange={(e) => set({ showHighways: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm">Show Highways</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={filterState.showIntracity}
              onChange={(e) => set({ showIntracity: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm">Show Intracity</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={filterState.showOther}
              onChange={(e) => set({ showOther: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-slate-600 focus:ring-slate-500"
            />
            <span className="text-sm">Show Other (regional)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={filterState.showBigFences}
              onChange={(e) => set({ showBigFences: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm">Show big fences (&gt; 50 km²)</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Min area (m²)</label>
          <input
            type="text"
            inputMode="decimal"
            value={filterState.minArea}
            onChange={(e) => set({ minArea: e.target.value })}
            placeholder="0"
            className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Max area (m²)</label>
          <input
            type="text"
            inputMode="decimal"
            value={filterState.maxArea}
            onChange={(e) => set({ maxArea: e.target.value })}
            placeholder="—"
            className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
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
          {resultCount != null ? (
            <>Results: {resultCount}</>
          ) : (
            <>Results: —</>
          )}
        </p>
        {results.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-y-auto rounded border border-slate-200 bg-slate-50/80">
            {results.slice(0, 100).map((feat) => {
              const name = feat.properties?.name ?? `Zone_${feat.id ?? "?"}`;
              const routeType =
                (feat.properties as { routeType?: string | null }).routeType ?? "";
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
              <li className="px-2.5 py-1.5 text-xs text-slate-500">
                +{results.length - 100} more (zoom to see)
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

export { DEFAULT_FILTERS };
