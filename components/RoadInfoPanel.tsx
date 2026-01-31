"use client";

import type { RoadSelection } from "@/types/roads";

interface RoadInfoPanelProps {
  road: RoadSelection | null;
  onClose: () => void;
  onViewDetails: (road: RoadSelection) => void;
}

export default function RoadInfoPanel({ road, onClose, onViewDetails }: RoadInfoPanelProps) {
  if (!road) return null;

  const isMotorway = road.type === "motorway";
  const p = road.feature.properties;

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h3 className="font-semibold text-slate-800">📍 Road Information</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto p-3 text-sm">
        <h4 className="mb-2 text-base font-semibold text-slate-800">
          {isMotorway ? (p as { motorway_code: string; name: string }).motorway_code : (p as { highway_code: string; name: string }).highway_code}: {p.name}
        </h4>

        <dl className="space-y-1.5">
          <div className="flex gap-2">
            <dt className="text-slate-500 w-24 shrink-0">Type:</dt>
            <dd className="font-medium">{isMotorway ? "Motorway" : "National Highway"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500 w-24 shrink-0">Length:</dt>
            <dd>{p.length_km} km</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500 w-24 shrink-0">Route:</dt>
            <dd>{p.start_city} → {p.end_city}</dd>
          </div>

          {isMotorway && (
            <>
              <div className="flex gap-2">
                <dt className="text-slate-500 w-24 shrink-0">Lanes:</dt>
                <dd>{(p as { lanes: number }).lanes}</dd>
              </div>
              {(p as { speed_limit: number | null }).speed_limit && (
                <div className="flex gap-2">
                  <dt className="text-slate-500 w-24 shrink-0">Speed:</dt>
                  <dd>{(p as { speed_limit: number }).speed_limit} km/h</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-slate-500 w-24 shrink-0">Toll:</dt>
                <dd>{(p as { toll_status: string }).toll_status}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500 w-24 shrink-0">Status:</dt>
                <dd>{(p as { status: string }).status}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500 w-24 shrink-0">Operator:</dt>
                <dd>{(p as { operator: string }).operator || "NHA"}</dd>
              </div>
            </>
          )}

          {!isMotorway && (
            <>
              <div className="flex gap-2">
                <dt className="text-slate-500 w-24 shrink-0">Surface:</dt>
                <dd>{(p as { surface_type: string }).surface_type}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500 w-24 shrink-0">Condition:</dt>
                <dd>{(p as { condition: string }).condition}</dd>
              </div>
            </>
          )}
        </dl>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => onViewDetails(road)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}
