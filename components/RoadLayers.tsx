"use client";

import { useEffect, useState } from "react";
import { Polyline, Popup, Tooltip } from "react-leaflet";
import type { MotorwayFeature, HighwayFeature, RoadSelection } from "@/types/roads";

const MOTORWAY_COLOR = "#10b981";
const MOTORWAY_WEIGHT = 4;
const MOTORWAY_WEIGHT_SELECTED = 6;
const HIGHWAY_COLOR = "#3b82f6";
const HIGHWAY_WEIGHT = 3;
const HIGHWAY_WEIGHT_SELECTED = 5;
const DIM_OPACITY = 0.3;
const NORMAL_OPACITY = 0.9;
const HIGHWAY_OPACITY = 0.8;

/** Convert GeoJSON [lng, lat] to Leaflet [lat, lng] */
function toLatLngs(coords: number[][]): [number, number][] {
  return coords.map((c) => [c[1], c[0]] as [number, number]);
}

function isSelected(
  selected: RoadSelection | null,
  type: "motorway" | "highway",
  id: number
): boolean {
  if (!selected) return false;
  return selected.type === type && selected.feature.id === id;
}

interface RoadLayersProps {
  showMotorways: boolean;
  showHighways: boolean;
  selectedRoad: RoadSelection | null;
  onRoadSelect: (road: RoadSelection) => void;
}

export default function RoadLayers({
  showMotorways,
  showHighways,
  selectedRoad,
  onRoadSelect,
}: RoadLayersProps) {
  const [motorways, setMotorways] = useState<MotorwayFeature[]>([]);
  const [highways, setHighways] = useState<HighwayFeature[]>([]);

  useEffect(() => {
    if (showMotorways) {
      fetch("/api/pakistan/motorways")
        .then((r) => r.json())
        .then((data) => setMotorways(data.features || []))
        .catch(() => setMotorways([]));
    } else {
      setMotorways([]);
    }
  }, [showMotorways]);

  useEffect(() => {
    if (showHighways) {
      fetch("/api/pakistan/highways")
        .then((r) => r.json())
        .then((data) => setHighways(data.features || []))
        .catch(() => setHighways([]));
    } else {
      setHighways([]);
    }
  }, [showHighways]);

  if (!showMotorways && !showHighways) return null;

  const hasSelection = !!selectedRoad;

  return (
    <>
      {showMotorways &&
        motorways.map((feat) => {
          const coords = feat.geometry?.coordinates;
          if (!coords || coords.length < 2) return null;
          const positions = toLatLngs(coords);
          const p = feat.properties;
          const selected = isSelected(selectedRoad, "motorway", feat.id);
          const dimmed = hasSelection && !selected;
          return (
            <Polyline
              key={`m-${feat.id}`}
              positions={positions}
              pathOptions={{
                color: MOTORWAY_COLOR,
                weight: selected ? MOTORWAY_WEIGHT_SELECTED : MOTORWAY_WEIGHT,
                opacity: dimmed ? DIM_OPACITY : NORMAL_OPACITY,
                lineCap: "round" as const,
                lineJoin: "round" as const,
              }}
              eventHandlers={{
                click: () => onRoadSelect({ type: "motorway", feature: feat }),
              }}
            >
              <Tooltip
                sticky
                direction="top"
                offset={[0, -10]}
                opacity={0.95}
                className="road-tooltip"
              >
                <div className="text-center">
                  <strong>{p.motorway_code}</strong> • {p.length_km} km
                  <br />
                  {p.start_city} ↔ {p.end_city}
                  <br />
                  <span className="text-slate-500 text-xs">Click for details</span>
                </div>
              </Tooltip>
              <Popup>
                <div className="min-w-[220px]">
                  <h3 className="font-semibold text-slate-800">
                    {p.motorway_code}: {p.name}
                  </h3>
                  <p className="text-sm text-slate-600">
                    <strong>Route:</strong> {p.start_city} → {p.end_city}
                  </p>
                  <p className="text-sm text-slate-600">
                    <strong>Length:</strong> {p.length_km} km
                  </p>
                  <p className="text-sm text-slate-600">
                    <strong>Lanes:</strong> {p.lanes}
                  </p>
                  {p.speed_limit && (
                    <p className="text-sm text-slate-600">
                      <strong>Speed Limit:</strong> {p.speed_limit} km/h
                    </p>
                  )}
                  <p className="text-sm text-slate-600">
                    <strong>Toll:</strong> {p.toll_status}
                  </p>
                  <p className="text-sm text-slate-600">
                    <strong>Status:</strong> {p.status}
                  </p>
                </div>
              </Popup>
            </Polyline>
          );
        })}
      {showHighways &&
        highways.map((feat) => {
          const coords = feat.geometry?.coordinates;
          if (!coords || coords.length < 2) return null;
          const positions = toLatLngs(coords);
          const p = feat.properties;
          const selected = isSelected(selectedRoad, "highway", feat.id);
          const dimmed = hasSelection && !selected;
          return (
            <Polyline
              key={`h-${feat.id}`}
              positions={positions}
              pathOptions={{
                color: HIGHWAY_COLOR,
                weight: selected ? HIGHWAY_WEIGHT_SELECTED : HIGHWAY_WEIGHT,
                opacity: dimmed ? DIM_OPACITY : HIGHWAY_OPACITY,
                lineCap: "round" as const,
                lineJoin: "round" as const,
              }}
              eventHandlers={{
                click: () => onRoadSelect({ type: "highway", feature: feat }),
              }}
            >
              <Tooltip
                sticky
                direction="top"
                offset={[0, -10]}
                opacity={0.95}
                className="road-tooltip"
              >
                <div className="text-center">
                  <strong>{p.highway_code}</strong> • {p.length_km} km
                  <br />
                  {p.start_city} ↔ {p.end_city}
                  <br />
                  <span className="text-slate-500 text-xs">Click for details</span>
                </div>
              </Tooltip>
              <Popup>
                <div className="min-w-[220px]">
                  <h3 className="font-semibold text-slate-800">
                    {p.highway_code}: {p.name}
                  </h3>
                  <p className="text-sm text-slate-600">
                    <strong>Route:</strong> {p.start_city} → {p.end_city}
                  </p>
                  <p className="text-sm text-slate-600">
                    <strong>Length:</strong> {p.length_km} km
                  </p>
                  <p className="text-sm text-slate-600">
                    <strong>Surface:</strong> {p.surface_type}
                  </p>
                  <p className="text-sm text-slate-600">
                    <strong>Condition:</strong> {p.condition}
                  </p>
                  <p className="text-sm text-slate-600">
                    <strong>Type:</strong> {p.route_type}
                  </p>
                </div>
              </Popup>
            </Polyline>
          );
        })}
    </>
  );
}
