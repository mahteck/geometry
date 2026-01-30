"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { FenceStatsResponse } from "@/app/api/fences/stats/route";

const REFRESH_INTERVAL_MS = 30_000;
const CHART_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#8b5cf6", "#ec4899"];

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

export default function DashboardPanel() {
  const [data, setData] = useState<FenceStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/fences/stats");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail || j.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as FenceStatsResponse;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchStats]);

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-white/95 px-3 py-4 shadow-lg backdrop-blur">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
        <p className="text-sm text-slate-500">Loading stats…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
        <p className="text-sm font-medium text-slate-700">Statistics</p>
        <p className="text-xs text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => { setLoading(true); fetchStats(); }}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Retry
        </button>
      </div>
    );
  }

  const stats = data!;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Statistics</p>
        <button
          type="button"
          onClick={() => { setLoading(true); fetchStats(); }}
          disabled={loading}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          title="Refresh stats"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-slate-100 bg-slate-50/80 p-2">
          <p className="text-xs text-slate-500">Total fences</p>
          <p className="text-lg font-semibold text-slate-800">{formatNumber(stats.totalFences)}</p>
        </div>
        <div className="rounded border border-slate-100 bg-slate-50/80 p-2">
          <p className="text-xs text-slate-500">Total area</p>
          <p className="text-lg font-semibold text-slate-800">{formatNumber(stats.totalAreaSqKm)} km²</p>
        </div>
        <div className="col-span-2 rounded border border-slate-100 bg-slate-50/80 p-2">
          <p className="text-xs text-slate-500">Largest fence</p>
          <p className="truncate text-sm font-medium text-slate-800" title={stats.largestFence.name}>
            {stats.largestFence.name}
          </p>
          <p className="text-xs text-slate-600">{formatNumber(stats.largestFence.areaSqKm)} km²</p>
        </div>
        <div className="col-span-2 rounded border border-slate-100 bg-slate-50/80 p-2">
          <p className="text-xs text-slate-500">Smallest fence</p>
          <p className="truncate text-sm font-medium text-slate-800" title={stats.smallestFence.name}>
            {stats.smallestFence.name}
          </p>
          <p className="text-xs text-slate-600">{formatNumber(stats.smallestFence.areaSqKm)} km²</p>
        </div>
        <div className="col-span-2 rounded border border-slate-100 bg-slate-50/80 p-2">
          <p className="text-xs text-slate-500">Average fence size</p>
          <p className="text-lg font-semibold text-slate-800">{formatNumber(stats.averageAreaSqKm)} km²</p>
        </div>
      </div>

      {stats.byRegion.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-slate-600">Fences by region</p>
          <div className="h-40 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byRegion} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="region" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip formatter={(value: number) => [value, "Fences"]} />
                <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} name="Fences" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {stats.byStatus.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-slate-600">Active vs inactive</p>
          <div className="h-40 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.byStatus}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  label={({ status, count }) => `${status}: ${count}`}
                >
                  {stats.byStatus.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [value, "Fences"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {error && data && (
        <p className="text-xs text-amber-600">Background refresh failed: {error}</p>
      )}
    </div>
  );
}
