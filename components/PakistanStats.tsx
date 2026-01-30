"use client";

import type { PakistanStats as PakistanStatsType } from "@/types/pakistan";

interface PakistanStatsProps {
  stats: PakistanStatsType | null;
  loading?: boolean;
}

export default function PakistanStats({ stats, loading }: PakistanStatsProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm text-slate-500">Loading statistics…</p>
      </div>
    );
  }
  if (!stats) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Statistics</h3>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Provinces</dt>
          <dd className="font-medium text-slate-800">{stats.provinces}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Districts</dt>
          <dd className="font-medium text-slate-800">{stats.districts}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Cities</dt>
          <dd className="font-medium text-slate-800">
            {stats.cities.toLocaleString()}
          </dd>
        </div>
        {stats.totalArea > 0 && (
          <div className="flex justify-between">
            <dt className="text-slate-500">Total Area</dt>
            <dd className="font-medium text-slate-800">
              {stats.totalArea.toLocaleString()} km²
            </dd>
          </div>
        )}
      </dl>
      {stats.populationByProvince.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <p className="mb-1 text-xs font-medium text-slate-500">
            Population by Province
          </p>
          <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs">
            {stats.populationByProvince.slice(0, 8).map((p) => (
              <li key={p.code} className="flex justify-between">
                <span className="text-slate-600">{p.name}</span>
                <span className="font-medium text-slate-800">
                  {(p.population / 1_000_000).toFixed(1)}M
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
