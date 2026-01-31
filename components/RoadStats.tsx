"use client";

import { useEffect, useState } from "react";
import type { RoadStats as RoadStatsType } from "@/types/roads";

export default function RoadStats() {
  const [stats, setStats] = useState<RoadStatsType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pakistan/roads/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm text-slate-500">Loading road stats…</p>
      </div>
    );
  }
  if (!stats) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Road Network</h3>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Motorways</dt>
          <dd className="font-medium text-slate-800">
            {stats.motorways.count} routes ({stats.motorways.lengthKm.toLocaleString()} km)
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Operational</dt>
          <dd className="font-medium text-slate-800">{stats.motorways.operational}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Highways</dt>
          <dd className="font-medium text-slate-800">
            {stats.highways.count} routes ({stats.highways.lengthKm.toLocaleString()} km)
          </dd>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-2">
          <dt className="text-slate-600 font-medium">Total</dt>
          <dd className="font-semibold text-slate-800">
            {stats.totalLengthKm.toLocaleString()} km
          </dd>
        </div>
      </dl>
    </div>
  );
}
