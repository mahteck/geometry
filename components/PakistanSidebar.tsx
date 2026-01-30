"use client";

import { useState, useCallback, useEffect } from "react";
import PakistanStats from "./PakistanStats";
import type { PakistanStats as PakistanStatsType } from "@/types/pakistan";
import type { CityFeature } from "@/types/pakistan";

interface PakistanSidebarProps {
  showProvinces: boolean;
  showDistricts: boolean;
  showCities: boolean;
  onShowProvincesChange: (v: boolean) => void;
  onShowDistrictsChange: (v: boolean) => void;
  onShowCitiesChange: (v: boolean) => void;
  selectedProvince: string;
  onProvinceChange: (v: string) => void;
  onCitySelect?: (city: CityFeature) => void;
  provinces?: { code: string; name: string }[];
}

export default function PakistanSidebar({
  showProvinces,
  showDistricts,
  showCities,
  onShowProvincesChange,
  onShowDistrictsChange,
  onShowCitiesChange,
  selectedProvince,
  onProvinceChange,
  onCitySelect,
  provinces = [],
}: PakistanSidebarProps) {
  const [search, setSearch] = useState("");
  const [cityResults, setCityResults] = useState<CityFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState<PakistanStatsType | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/pakistan/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const searchCities = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({ search: search.trim(), limit: "20" });
      if (selectedProvince) params.set("province", selectedProvince);
      const res = await fetch(`/api/pakistan/cities?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCityResults(data.features || []);
      }
    } catch {
      setCityResults([]);
    } finally {
      setSearching(false);
    }
  }, [search, selectedProvince]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchCities();
  };

  const handleExport = async (format: "geojson" | "kml" | "csv") => {
    try {
      if (format === "geojson") {
        const [provincesRes, districtsRes, citiesRes] = await Promise.all([
          fetch("/api/pakistan/provinces"),
          fetch("/api/pakistan/districts"),
          fetch("/api/pakistan/cities?limit=5000"),
        ]);
        const [provincesData, districtsData, citiesData] = await Promise.all([
          provincesRes.json(),
          districtsRes.json(),
          citiesRes.json(),
        ]);
        const combined = {
          type: "FeatureCollection",
          features: [
            ...(provincesData.features || []),
            ...(districtsData.features || []),
            ...(citiesData.features || []),
          ],
        };
        const blob = new Blob([JSON.stringify(combined, null, 2)], {
          type: "application/geo+json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pakistan-geo.json";
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === "csv") {
        const res = await fetch("/api/pakistan/cities?limit=10000");
        const data = await res.json();
        const features = data.features || [];
        const headers = [
          "id",
          "name",
          "province",
          "district",
          "lat",
          "lng",
          "population",
        ];
        const rows = features.map(
          (f: CityFeature) =>
            `${f.id},"${(f.properties.name || "").replace(/"/g, '""')}",${f.properties.provinceCode},${f.properties.districtName},${f.geometry.coordinates[1]},${f.geometry.coordinates[0]},${f.properties.population}`
        );
        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pakistan-cities.csv";
        a.click();
        URL.revokeObjectURL(url);
      }
      // KML would need a proper conversion library - skip for now
    } catch (e) {
      console.error("Export failed:", e);
    }
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50/80 p-3">
      <h2 className="mb-3 text-lg font-semibold text-slate-800">
        Pakistan Map
      </h2>

      {/* Layer toggles */}
      <div className="mb-3">
        <p className="mb-2 text-sm font-medium text-slate-600">Layers</p>
        <label className="flex cursor-pointer items-center gap-2 py-1">
          <input
            type="checkbox"
            checked={showProvinces}
            onChange={(e) => onShowProvincesChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">Show Provinces</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 py-1">
          <input
            type="checkbox"
            checked={showDistricts}
            onChange={(e) => onShowDistrictsChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">Show Districts</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 py-1">
          <input
            type="checkbox"
            checked={showCities}
            onChange={(e) => onShowCitiesChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">Show Cities</span>
        </label>
      </div>

      {/* Province filter */}
      <div className="mb-3">
        <label className="mb-1 block text-sm font-medium text-slate-600">
          Province
        </label>
        <select
          value={selectedProvince}
          onChange={(e) => onProvinceChange(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Provinces</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* City search */}
      <form onSubmit={handleSearch} className="mb-3">
        <label className="mb-1 block text-sm font-medium text-slate-600">
          Search City
        </label>
        <div className="flex gap-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Karachi, Lahore"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {searching ? "..." : "Search"}
          </button>
        </div>
        {cityResults.length > 0 && (
          <ul className="mt-2 max-h-40 overflow-y-auto rounded border border-slate-200 bg-white text-sm">
            {cityResults.map((city) => (
              <li key={city.id}>
                <button
                  type="button"
                  onClick={() => onCitySelect?.(city)}
                  className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                >
                  {city.properties.name}
                  {city.properties.population > 0 && (
                    <span className="ml-1 text-slate-500">
                      ({city.properties.population.toLocaleString()})
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <PakistanStats stats={stats} loading={statsLoading} />

      {/* Export */}
      <div className="mt-3 border-t border-slate-200 pt-3">
        <p className="mb-2 text-sm font-medium text-slate-600">Export</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleExport("geojson")}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            GeoJSON
          </button>
          <button
            onClick={() => handleExport("csv")}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            CSV
          </button>
        </div>
      </div>
    </aside>
  );
}
