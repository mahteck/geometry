"use client";

import type { RoadSelection } from "@/types/roads";

interface RoadDetailsModalProps {
  road: RoadSelection | null;
  onClose: () => void;
}

export default function RoadDetailsModal({ road, onClose }: RoadDetailsModalProps) {
  if (!road) return null;

  const isMotorway = road.type === "motorway";
  const p = road.feature.properties;
  const code = isMotorway ? (p as { motorway_code: string }).motorway_code : (p as { highway_code: string }).highway_code;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-800">
            🛣️ {code}: {p.name}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4 text-sm">
          <section className="mb-4">
            <h3 className="mb-2 font-semibold text-slate-700">Overview</h3>
            <dl className="space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-slate-500">Type</dt>
                <dd>{isMotorway ? "Access-controlled Motorway" : "National Highway"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Length</dt>
                <dd>{p.length_km} km</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Route</dt>
                <dd>{p.start_city} ↔ {p.end_city}</dd>
              </div>
              {isMotorway && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Lanes</dt>
                    <dd>{(p as { lanes: number }).lanes} (both directions)</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Speed Limit</dt>
                    <dd>{(p as { speed_limit: number | null }).speed_limit ?? "—"} km/h</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Toll</dt>
                    <dd>{(p as { toll_status: string }).toll_status}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Status</dt>
                    <dd>{(p as { status: string }).status}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Operator</dt>
                    <dd>{(p as { operator: string }).operator || "NHA"}</dd>
                  </div>
                </>
              )}
              {!isMotorway && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Surface</dt>
                    <dd>{(p as { surface_type: string }).surface_type}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Condition</dt>
                    <dd>{(p as { condition: string }).condition}</dd>
                  </div>
                </>
              )}
            </dl>
          </section>

          <section className="mb-4">
            <h3 className="mb-2 font-semibold text-slate-700">Travel Info</h3>
            <p className="text-slate-600">
              Estimated travel time: ~{Math.round(p.length_km / 80)}–{Math.round(p.length_km / 60)} hours
              (at 60–80 km/h average)
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
