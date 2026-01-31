"use client";

import { useState, useCallback } from "react";
import type { RoadSelection } from "@/types/roads";

interface SearchResult {
  type: "motorway";
  id: number;
  code: string;
  name: string;
  startCity: string;
  endCity: string;
  lengthKm: number;
  lanes?: number;
  tollStatus?: string;
  status?: string;
  speedLimit?: number | null;
}

interface HighwayResult {
  type: "highway";
  id: number;
  code: string;
  name: string;
  startCity: string;
  endCity: string;
  lengthKm: number;
  routeType?: string;
  condition?: string;
}

export default function RoadSearch({ onRoadSelect }: { onRoadSelect: (road: RoadSelection) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ motorways: SearchResult[]; highways: HighwayResult[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingFeature, setLoadingFeature] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/pakistan/roads/search?q=${encodeURIComponent(query.trim())}&limit=15`);
      const data = await res.json();
      setResults({ motorways: data.motorways || [], highways: data.highways || [] });
    } catch {
      setResults({ motorways: [], highways: [] });
    } finally {
      setSearching(false);
    }
  }, [query]);

  const selectMotorway = useCallback(
    async (m: SearchResult) => {
      setLoadingFeature(true);
      try {
        const res = await fetch(`/api/pakistan/motorways?id=${m.id}`);
        const data = await res.json();
        const feat = data.features?.[0];
        if (feat) onRoadSelect({ type: "motorway", feature: feat });
      } finally {
        setLoadingFeature(false);
      }
    },
    [onRoadSelect]
  );

  const selectHighway = useCallback(
    async (h: HighwayResult) => {
      setLoadingFeature(true);
      try {
        const res = await fetch(`/api/pakistan/highways?id=${h.id}`);
        const data = await res.json();
        const feat = data.features?.[0];
        if (feat) onRoadSelect({ type: "highway", feature: feat });
      } finally {
        setLoadingFeature(false);
      }
    },
    [onRoadSelect]
  );

  const hasResults = results && (results.motorways.length > 0 || results.highways.length > 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Search Roads</h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="e.g. M-2, N-5, Lahore Islamabad"
          className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button
          onClick={search}
          disabled={searching || !query.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {searching ? "…" : "Search"}
        </button>
      </div>
      {results && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded border border-slate-200">
          {!hasResults && (
            <p className="p-2 text-sm text-slate-500">No roads found for &quot;{query}&quot;</p>
          )}
          {results.motorways.length > 0 && (
            <div className="border-b border-slate-100 p-2">
              <p className="text-xs font-medium text-slate-500">Motorways</p>
              {results.motorways.map((m) => (
                <button
                  key={`m-${m.id}`}
                  onClick={() => selectMotorway(m)}
                  className="mt-1 block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium">{m.code}:</span> {m.name}
                  <span className="ml-1 text-slate-500">({m.lengthKm} km)</span>
                </button>
              ))}
            </div>
          )}
          {results.highways.length > 0 && (
            <div className="p-2">
              <p className="text-xs font-medium text-slate-500">Highways</p>
              {results.highways.map((h) => (
                <button
                  key={`h-${h.id}`}
                  onClick={() => selectHighway(h)}
                  className="mt-1 block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium">{h.code}:</span> {h.name}
                  <span className="ml-1 text-slate-500">({h.lengthKm} km)</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
