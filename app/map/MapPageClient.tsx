"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import SearchPanel, {
  filterStateToParams,
  paramsToFilterState,
  type FilterState,
} from "@/components/SearchPanel";
import ExportPanel from "@/components/ExportPanel";
import DashboardPanel from "@/components/DashboardPanel";
import ValidationPanel from "@/components/ValidationPanel";
import type { ValidateResponse } from "@/app/api/fences/validate/route";
import type { FenceFeature } from "@/types/fence";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[400px] w-full items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
        <p className="text-slate-600 text-sm">Loading map…</p>
      </div>
    </div>
  ),
});

export default function MapPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapRef = useRef<{ zoomToFeature: (feat: FenceFeature) => void; refetchFences: () => void } | null>(null);

  const filterState: FilterState = paramsToFilterState(searchParams);
  const [results, setResults] = useState<FenceFeature[]>([]);
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [validationResult, setValidationResult] = useState<ValidateResponse | null>(null);

  const hasActiveFilters =
    Object.keys(filterStateToParams(filterState)).length > 0;

  const updateUrl = useCallback(
    (state: FilterState) => {
      const params = filterStateToParams(state);
      const qs = new URLSearchParams(params).toString();
      const path = qs ? `/map?${qs}` : "/map";
      router.push(path);
    },
    [router]
  );

  const onClearFilters = useCallback(() => {
    router.push("/map");
  }, [router]);

  const filterParams = {
    search: filterState.search || undefined,
    region: filterState.region || undefined,
    status: filterState.status || undefined,
    minArea: filterState.minArea || undefined,
    maxArea: filterState.maxArea || undefined,
  };

  const onResultsLoaded = useCallback((features: FenceFeature[]) => {
    setResults(features);
    setResultCount(features.length);
  }, []);

  const onZoomToFeature = useCallback((feat: FenceFeature) => {
    mapRef.current?.zoomToFeature(feat);
  }, []);

const invalidFenceIds = useMemo(
    () =>
      validationResult?.issues
        .filter((i) => !i.isValid || !i.isSimple || i.hasUnclosedRing || i.hasDuplicateVertices)
        .map((i) => i.fenceId) ?? [],
    [validationResult]
  );
  const invalidIssueMap = useMemo(
    () =>
      validationResult
        ? Object.fromEntries(
            validationResult.issues
              .filter((i) => !i.isValid || !i.isSimple || i.hasUnclosedRing || i.hasDuplicateVertices)
              .map((i) => [
                i.fenceId,
                {
                  validReason: i.validReason,
                  isSimple: i.isSimple,
                  hasUnclosedRing: i.hasUnclosedRing,
                  hasDuplicateVertices: i.hasDuplicateVertices,
                },
              ])
          )
        : undefined,
    [validationResult]
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50/80 p-3">
        <SearchPanel
          filterState={filterState}
          onFilterChange={updateUrl}
          results={results}
          resultCount={resultCount}
          onZoomToFeature={onZoomToFeature}
          onClearFilters={onClearFilters}
          hasActiveFilters={hasActiveFilters}
        />
        <div className="mt-3">
          <ExportPanel
            getBounds={() => mapRef.current?.getBounds() ?? null}
            filterParams={filterParams}
          />
        </div>
        <div className="mt-3">
          <DashboardPanel />
        </div>
        <div className="mt-3">
          <ValidationPanel
            validationResult={validationResult}
            onValidationLoaded={setValidationResult}
            onFencesRefreshed={() => mapRef.current?.refetchFences?.()}
          />
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <MapView
          ref={mapRef}
          filterParams={filterParams}
          onResultsLoaded={onResultsLoaded}
          invalidFenceIds={invalidFenceIds}
          invalidIssueMap={invalidIssueMap}
        />
      </main>
    </div>
  );
}
