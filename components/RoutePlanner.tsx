"use client";

import { useState, useCallback } from "react";
import type { CityFeature } from "@/types/pakistan";

interface RoadBetweenResult {
  type: "motorway" | "highway";
  id: number;
  code: string;
  name: string;
  startCity: string;
  endCity: string;
  lengthKm: number;
  geometry?: unknown;
}

interface RoutePlannerProps {
  onRouteSelect?: (from: string, to: string) => void;
  onCitySelect?: (city: CityFeature) => void;
  onRoadFound?: (road: RoadBetweenResult) => void;
}

export default function RoutePlanner({ onRouteSelect, onCitySelect, onRoadFound }: RoutePlannerProps) {
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const [fromResults, setFromResults] = useState<CityFeature[]>([]);
  const [toResults, setToResults] = useState<CityFeature[]>([]);
  const [searching, setSearching] = useState<"from" | "to" | null>(null);
  const [fromCity, setFromCity] = useState<CityFeature | null>(null);
  const [toCity, setToCity] = useState<CityFeature | null>(null);
  const [roadResults, setRoadResults] = useState<RoadBetweenResult[]>([]);
  const [findingRoad, setFindingRoad] = useState(false);

  const searchCities = useCallback(async (query: string, type: "from" | "to") => {
    if (!query.trim()) return;
    setSearching(type);
    try {
      const params = new URLSearchParams({ search: query.trim(), limit: "10" });
      const res = await fetch(`/api/pakistan/cities?${params}`);
      const data = await res.json();
      const features = data.features || [];
      if (type === "from") setFromResults(features);
      else setToResults(features);
    } catch {
      if (type === "from") setFromResults([]);
      else setToResults([]);
    } finally {
      setSearching(null);
    }
  }, []);

  const selectFrom = (city: CityFeature) => {
    setFromCity(city);
    setFromSearch(city.properties.name);
    setFromResults([]);
    onCitySelect?.(city);
  };

  const selectTo = (city: CityFeature) => {
    setToCity(city);
    setToSearch(city.properties.name);
    setToResults([]);
    onCitySelect?.(city);
  };

  const handleCalculate = async () => {
    if (!fromCity || !toCity) return;
    setFindingRoad(true);
    setRoadResults([]);
    try {
      const res = await fetch(
        `/api/pakistan/roads/between?from=${encodeURIComponent(fromCity.properties.name)}&to=${encodeURIComponent(toCity.properties.name)}`
      );
      const data = await res.json();
      const all = [...(data.motorways || []), ...(data.highways || [])];
      setRoadResults(all);
      if (all.length > 0 && onRoadFound) {
        onRoadFound(all[0]);
      }
      onRouteSelect?.(fromCity.properties.name, toCity.properties.name);
    } catch {
      setRoadResults([]);
    } finally {
      setFindingRoad(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Route Planner</h3>
      <div className="space-y-2">
        <div>
          <label className="mb-0.5 block text-xs text-slate-500">From</label>
          <input
            type="text"
            value={fromSearch}
            onChange={(e) => {
              setFromSearch(e.target.value);
              if (e.target.value.length >= 2) searchCities(e.target.value, "from");
              else setFromResults([]);
            }}
            onFocus={() => fromSearch.length >= 2 && searchCities(fromSearch, "from")}
            placeholder="e.g. Lahore"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          {fromResults.length > 0 && (
            <ul className="mt-1 max-h-24 overflow-y-auto rounded border bg-white text-sm">
              {fromResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectFrom(c)}
                    className="w-full px-2 py-1 text-left hover:bg-slate-50"
                  >
                    {c.properties.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-slate-500">To</label>
          <input
            type="text"
            value={toSearch}
            onChange={(e) => {
              setToSearch(e.target.value);
              if (e.target.value.length >= 2) searchCities(e.target.value, "to");
              else setToResults([]);
            }}
            onFocus={() => toSearch.length >= 2 && searchCities(toSearch, "to")}
            placeholder="e.g. Karachi"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          {toResults.length > 0 && (
            <ul className="mt-1 max-h-24 overflow-y-auto rounded border bg-white text-sm">
              {toResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectTo(c)}
                    className="w-full px-2 py-1 text-left hover:bg-slate-50"
                  >
                    {c.properties.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={handleCalculate}
          disabled={!fromCity || !toCity || findingRoad}
          className="w-full rounded bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {findingRoad ? "Finding…" : "Find Road"}
        </button>
        {roadResults.length > 0 && (
          <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
            <p className="font-medium text-slate-700">Routes found (click to highlight):</p>
            {roadResults.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                onClick={() => onRoadFound?.(r)}
                className="mt-1 block w-full rounded px-2 py-1 text-left hover:bg-slate-200"
              >
                {r.code}: {r.name} ({r.lengthKm} km)
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
