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
  if (!stats || !stats.motorways || !stats.highways) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm text-slate-500">Road stats unavailable</p>
      </div>
    );
  }

  const m = stats.motorways;
  const h = stats.highways;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Road Network</h3>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Motorways</dt>
          <dd className="font-medium text-slate-800">
            {m.count} routes ({(m.lengthKm ?? 0).toLocaleString()} km)
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Operational</dt>
          <dd className="font-medium text-slate-800">{m.operational ?? 0}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Highways</dt>
          <dd className="font-medium text-slate-800">
            {h.count} routes ({(h.lengthKm ?? 0).toLocaleString()} km)
          </dd>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-2">
          <dt className="text-slate-600 font-medium">Total</dt>
          <dd className="font-semibold text-slate-800">
            {(stats.totalLengthKm ?? 0).toLocaleString()} km
          </dd>
        </div>
      </dl>
    </div>
  );
}
