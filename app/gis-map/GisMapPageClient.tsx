"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import GisFilterPanel, {
  DEFAULT_GIS_FILTERS,
  gisFilterStateToParams,
  paramsToGisFilterState,
  type GisFilterState,
} from "@/components/GisFilterPanel";
import GisExportPanel from "@/components/GisExportPanel";
import type { FenceMasterFeature } from "@/types/masterGis";
import type { GisMapViewHandle } from "@/components/GisMapView";

const GisMapView = dynamic(() => import("@/components/GisMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[400px] w-full items-center justify-center bg-slate-100">
      <div className="h-10 w-10 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
    </div>
  ),
});

export default function GisMapPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapRef = useRef<GisMapViewHandle | null>(null);

  const urlFilterState = paramsToGisFilterState(searchParams);
  const [layerVisibility, setLayerVisibility] = useState(urlFilterState.layers);
  const filterState: GisFilterState = useMemo(
    () => ({ ...urlFilterState, layers: layerVisibility }),
    [urlFilterState, layerVisibility]
  );
  const [results, setResults] = useState<FenceMasterFeature[]>([]);
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [selectedFenceId, setSelectedFenceId] = useState<number | null>(null);
  const [outOfBoundsFenceIds, setOutOfBoundsFenceIds] = useState<number[]>([]);

  useEffect(() => {
    fetch("/api/gis/fences/outside-pakistan")
      .then((res) => (res.ok ? res.json() : { fenceIds: [] }))
      .then((data: { fenceIds?: number[] }) => setOutOfBoundsFenceIds(Array.isArray(data?.fenceIds) ? data.fenceIds : []))
      .catch(() => setOutOfBoundsFenceIds([]));
  }, []);

  const hasActiveFilters =
    Object.keys(gisFilterStateToParams(filterState)).length > 0;

  const onFilterChange = useCallback(
    (state: GisFilterState) => {
      setLayerVisibility(state.layers);
      const params = gisFilterStateToParams(state);
      const qs = new URLSearchParams(params).toString();
      router.push(qs ? `/gis-map?${qs}` : "/gis-map");
    },
    [router]
  );

  const updateUrl = useCallback(
    (state: GisFilterState) => {
      const params = gisFilterStateToParams(state);
      const qs = new URLSearchParams(params).toString();
      router.push(qs ? `/gis-map?${qs}` : "/gis-map");
    },
    [router]
  );

  const onClearFilters = useCallback(() => {
    router.push("/gis-map");
  }, [router]);

  const filterParams = useMemo(
    () => ({
      search: filterState.search || undefined,
      region: filterState.region || undefined,
      status: filterState.status || undefined,
      bigOnly: filterState.showBigFences ? "1" : undefined,
      roadType: filterState.roadType || undefined,
    }),
    [
      filterState.search,
      filterState.region,
      filterState.status,
      filterState.showBigFences,
      filterState.roadType,
    ]
  );

  const onFencesLoaded = useCallback((features: FenceMasterFeature[]) => {
    setResults(features);
    setResultCount(features.length);
  }, []);

  /** Filter results by current search/filter so the list only shows matching fences. */
  const filteredResults = useMemo(() => {
    if (!results.length) return results;
    const search = (filterState.search ?? "").trim().toLowerCase();
    const region = (filterState.region ?? "").trim();
    const status = (filterState.status ?? "").trim().toLowerCase();
    const roadType = (filterState.roadType ?? "").trim().toLowerCase();
    const showBigOnly = filterState.showBigFences === true;
    return results.filter((f) => {
      if (search && !(f.properties?.name ?? "").toLowerCase().includes(search)) return false;
      if (region && (f.properties?.region_name ?? "").trim() !== region) return false;
      if (status && (f.properties?.status ?? "").toLowerCase().trim() !== status) return false;
      if (roadType) {
        const rt = (f.properties?.route_type ?? "").toLowerCase().trim();
        const match =
          rt === roadType ||
          (roadType === "trunk" && rt === "highway") ||
          (roadType === "primary" && rt === "highway") ||
          (roadType === "secondary" && rt === "highway");
        if (!match) return false;
      }
      if (showBigOnly && !f.properties?.is_big) return false;
      return true;
    });
  }, [results, filterState.search, filterState.region, filterState.status, filterState.roadType, filterState.showBigFences]);

  const onZoomToFeature = useCallback((feat: FenceMasterFeature) => {
    const id = feat.id != null ? Number(feat.id) : null;
    setSelectedFenceId(id);
    mapRef.current?.zoomToFeature(feat);
  }, []);

  const onClearSelection = useCallback(() => {
    setSelectedFenceId(null);
  }, []);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full flex-col overflow-hidden">
      {/* Top action bar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-800">Enterprise GIS Map</h1>
          <Link
            href="/map"
            className="text-sm font-medium text-slate-600 hover:text-blue-600"
          >
            Map (fence table)
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <GisExportPanel
            getBounds={() => mapRef.current?.getBounds() ?? null}
            filterParams={filterParams}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50/80 p-3">
          <GisFilterPanel
            filterState={filterState}
            onFilterChange={onFilterChange}
            results={filteredResults}
            resultCount={filteredResults.length}
            onZoomToFeature={onZoomToFeature}
            onClearFilters={onClearFilters}
            hasActiveFilters={hasActiveFilters}
            selectedFenceId={selectedFenceId}
            onClearSelection={onClearSelection}
          />
          <div className="mt-3">
            <p className="text-xs text-slate-500">
              Fences from <code className="rounded bg-slate-200 px-1">fences_master</code>. Roads, regions, cities, areas from OSM master tables.{" "}
              <Link href="/map" className="text-blue-600 hover:underline">Map (fence table)</Link>
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <GisMapView
            ref={mapRef}
            filterParams={filterParams}
            layerVisibility={filterState.layers}
            selectedFenceId={selectedFenceId}
            outOfBoundsFenceIds={outOfBoundsFenceIds}
            onFencesLoaded={onFencesLoaded}
            onZoomToFence={onZoomToFeature}
          />
        </main>
      </div>
    </div>
  );
}
