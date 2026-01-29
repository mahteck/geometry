import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Fence Map
        </h1>
        <p className="mt-3 text-slate-600">
          View and explore PostGIS fence polygons from{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm">
            cherat_fences
          </code>{" "}
          on an interactive map. Hover over a fence for its name, or click to see
          area, perimeter, and other details.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/map"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            Open map
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
