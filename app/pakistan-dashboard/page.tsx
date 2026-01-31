"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const PROVINCE_COLORS = ["#22c55e", "#3b82f6", "#f97316", "#eab308", "#a855f7", "#ec4899", "#ef4444"];
const CHART_COLORS = ["#10b981", "#3b82f6", "#6b7280"];

interface DashboardStats {
  provinces: number;
  districts: number;
  cities: number;
  totalPopulation: number;
  motorways: { count: number; lengthKm: number };
  highways: { count: number; lengthKm: number };
  totalRoadLengthKm: number;
  topCities: { name: string; province: string; population: number }[];
}

export default function PakistanDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pakistan/dashboard/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
      </div>
    );
  }

  const roadChartData = stats
    ? [
        { name: "Motorways", length: stats.motorways.lengthKm, count: stats.motorways.count },
        { name: "Highways", length: stats.highways.lengthKm, count: stats.highways.count },
      ]
    : [];

  const cityChartData = stats?.topCities?.slice(0, 15).map((c) => ({
    name: c.name.length > 12 ? c.name.slice(0, 11) + "…" : c.name,
    population: c.population / 1000,
  })) ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Pakistan Analytics Dashboard</h1>
        <Link
          href="/pakistan-map"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Open Map
        </Link>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Provinces" value={stats?.provinces ?? 0} />
        <StatCard label="Districts" value={stats?.districts ?? 0} />
        <StatCard label="Cities" value={(stats?.cities ?? 0).toLocaleString()} />
        <StatCard label="Motorways" value={stats?.motorways?.count ?? 0} sub={`${(stats?.motorways?.lengthKm ?? 0).toLocaleString()} km`} />
        <StatCard label="Highways" value={stats?.highways?.count ?? 0} sub={`${(stats?.highways?.lengthKm ?? 0).toLocaleString()} km`} />
        <StatCard label="Total Roads" value={`${(stats?.totalRoadLengthKm ?? 0).toLocaleString()} km`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Road network chart */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">Road Network by Type</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={roadChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="length" name="Length (km)" fill={CHART_COLORS[0]} />
              <Bar dataKey="count" name="Route Count" fill={CHART_COLORS[1]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top cities chart */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">Top 15 Cities by Population (thousands)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cityChartData} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={80} />
              <Tooltip formatter={(v: number) => [v.toLocaleString() + "k", "Population"]} />
              <Bar dataKey="population" fill={CHART_COLORS[2]} name="Population" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">Top Cities</h2>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 text-left font-medium">#</th>
                  <th className="py-2 text-left font-medium">City</th>
                  <th className="py-2 text-left font-medium">Province</th>
                  <th className="py-2 text-right font-medium">Population</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.topCities ?? []).slice(0, 20).map((c, i) => (
                  <tr key={c.name + i} className="border-b border-slate-100">
                    <td className="py-2">{i + 1}</td>
                    <td className="py-2">{c.name}</td>
                    <td className="py-2">{c.province}</td>
                    <td className="py-2 text-right">{c.population.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">Summary</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Total Population (cities)</dt>
              <dd className="font-medium">{(stats?.totalPopulation ?? 0).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Motorway Network</dt>
              <dd className="font-medium">{(stats?.motorways?.lengthKm ?? 0).toLocaleString()} km</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Highway Network</dt>
              <dd className="font-medium">{(stats?.highways?.lengthKm ?? 0).toLocaleString()} km</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Total Road Length</dt>
              <dd className="font-medium">{(stats?.totalRoadLengthKm ?? 0).toLocaleString()} km</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
