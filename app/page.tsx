import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Fence Map
        </h1>
        <p className="mt-3 text-slate-600">
          View and explore PostGIS fence polygons on an interactive map.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/map"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            Map (fence table)
          </Link>
          <Link
            href="/gis-map"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Enterprise GIS Map (fences_master + roads, regions, cities)
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          <strong>Map</strong> uses the existing <code className="rounded bg-slate-100 px-1 font-mono">fence</code> table.{" "}
          <strong>Enterprise GIS Map</strong> uses <code className="rounded bg-slate-100 px-1 font-mono">fences_master</code>, roads, regions, cities, areas (separate page).
        </p>
      </div>
    </div>
  );
}
