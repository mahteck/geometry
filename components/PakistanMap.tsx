"use client";

import { useEffect, useState, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import type { ProvinceFeature, DistrictFeature, CityFeature } from "@/types/pakistan";
import { getProvinceColor } from "@/lib/pakistanStyles";

const CENTER: [number, number] = [30.3753, 69.3451];
const ZOOM = 6;
const STROKE_COLOR = "#1e40af";
const STROKE_WEIGHT = 2;
const FILL_OPACITY = 0.3;
const FILL_OPACITY_HOVER = 0.6;
const CITY_COLOR = "#ef4444";
const CITY_RADIUS_MIN = 4;
const CITY_RADIUS_MAX = 12;

/** Convert GeoJSON [lng, lat] to Leaflet [lat, lng] */
function toLatLng(coords: [number, number]): [number, number] {
  return [coords[1], coords[0]];
}

/** Convert Polygon coordinates (exterior ring) to Leaflet latlngs */
function polygonToLatLngs(coords: number[][][]): [number, number][] {
  if (!coords?.[0]) return [];
  return coords[0].map((c) => toLatLng(c as [number, number]));
}

/** Reset view to Pakistan center */
function ResetView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

/** Capture map instance for imperative zoom */
function MapController({
  mapRef,
}: {
  mapRef: React.MutableRefObject<ReturnType<typeof useMap> | null>;
}) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    return () => {
      mapRef.current = null;
    };
  }, [map, mapRef]);
  return null;
}

interface PakistanMapProps {
  showProvinces: boolean;
  showDistricts: boolean;
  showCities: boolean;
  provinceFilter: string;
}

export interface PakistanMapHandle {
  zoomToCity: (city: CityFeature) => void;
  resetView: () => void;
}

const PakistanMap = forwardRef<PakistanMapHandle, PakistanMapProps>(function PakistanMap({
  showProvinces,
  showDistricts,
  showCities,
  provinceFilter,
}, ref) {
  const [provinces, setProvinces] = useState<ProvinceFeature[]>([]);
  const [districts, setDistricts] = useState<DistrictFeature[]>([]);
  const [cities, setCities] = useState<CityFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredProvince, setHoveredProvince] = useState<number | null>(null);
  const [hoveredDistrict, setHoveredDistrict] = useState<number | null>(null);
  const mapRef = useRef<ReturnType<typeof useMap> | null>(null);

  useImperativeHandle(ref, () => ({
    zoomToCity(city: CityFeature) {
      const [lng, lat] = city.geometry.coordinates;
      mapRef.current?.setView([lat, lng], 12);
    },
    resetView() {
      mapRef.current?.setView(CENTER, ZOOM);
    },
  }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [provincesRes, districtsRes, citiesRes] = await Promise.all([
        fetch("/api/pakistan/provinces"),
        fetch(
          provinceFilter
            ? `/api/pakistan/districts?province=${encodeURIComponent(provinceFilter)}`
            : "/api/pakistan/districts"
        ),
        fetch(
          provinceFilter
            ? `/api/pakistan/cities?province=${encodeURIComponent(provinceFilter)}&limit=500`
            : "/api/pakistan/cities?limit=500"
        ),
      ]);
      if (!provincesRes.ok || !districtsRes.ok || !citiesRes.ok) {
        throw new Error("Failed to fetch data");
      }
      const [provincesData, districtsData, citiesData] = await Promise.all([
        provincesRes.json(),
        districtsRes.json(),
        citiesRes.json(),
      ]);
      setProvinces(provincesData.features || []);
      setDistricts(districtsData.features || []);
      setCities(citiesData.features || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load map data");
    } finally {
      setLoading(false);
    }
  }, [provinceFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] w-full items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
          <p className="text-sm text-slate-600">Loading map…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[400px] w-full items-center justify-center bg-slate-100">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-sm font-medium text-red-800">{error}</p>
          <button
            onClick={fetchData}
            className="mt-2 rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const filteredProvinces = provinceFilter
    ? provinces.filter((p) => p.properties.code === provinceFilter)
    : provinces;

  const cityRadius = (pop: number) => {
    if (pop <= 0) return CITY_RADIUS_MIN;
    const logPop = Math.log10(Math.max(1, pop));
    return Math.min(
      CITY_RADIUS_MAX,
      CITY_RADIUS_MIN + (logPop - 2) * 2
    );
  };

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={CENTER}
        zoom={ZOOM}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ResetView center={CENTER} zoom={ZOOM} />
        <MapController mapRef={mapRef} />

        {/* Each province = separate Polygon */}
        {showProvinces &&
          filteredProvinces.map((feat) => {
            const geom = feat.geometry;
            if (geom.type !== "Polygon" || !geom.coordinates) return null;
            const latlngs = polygonToLatLngs(geom.coordinates);
            if (latlngs.length < 3) return null;
            const fillColor = getProvinceColor(feat.properties.code);
            const isHovered = hoveredProvince === feat.id;
            return (
              <Polygon
                key={`prov-${feat.id}`}
                positions={latlngs}
                pathOptions={{
                  fillColor,
                  fillOpacity: isHovered ? FILL_OPACITY_HOVER : FILL_OPACITY,
                  color: STROKE_COLOR,
                  weight: STROKE_WEIGHT,
                }}
                eventHandlers={{
                  mouseover: () => setHoveredProvince(feat.id),
                  mouseout: () => setHoveredProvince(null),
                }}
              >
                <Popup>
                  <div className="min-w-[200px]">
                    <h3 className="text-base font-semibold text-slate-800">
                      {feat.properties.name}{" "}
                      {feat.properties.nameUrdu && (
                        <span className="text-slate-500">
                          ({feat.properties.nameUrdu})
                        </span>
                      )}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Capital: {feat.properties.capital || "—"}
                    </p>
                    <p className="text-sm text-slate-600">
                      Area: {feat.properties.area?.toLocaleString() ?? "—"} km²
                    </p>
                    <p className="text-sm text-slate-600">
                      Population:{" "}
                      {feat.properties.population?.toLocaleString() ?? "—"}
                    </p>
                  </div>
                </Popup>
              </Polygon>
            );
          })}

        {/* Each district = separate Polygon */}
        {showDistricts &&
          districts.map((feat) => {
            const geom = feat.geometry;
            if (geom.type !== "Polygon" || !geom.coordinates) return null;
            const latlngs = polygonToLatLngs(geom.coordinates);
            if (latlngs.length < 3) return null;
            const fillColor = getProvinceColor(feat.properties.provinceCode);
            const isHovered = hoveredDistrict === feat.id;
            return (
              <Polygon
                key={`dist-${feat.id}`}
                positions={latlngs}
                pathOptions={{
                  fillColor,
                  fillOpacity: isHovered ? 0.5 : 0.2,
                  color: "#1e40af",
                  weight: 1,
                }}
                eventHandlers={{
                  mouseover: () => setHoveredDistrict(feat.id),
                  mouseout: () => setHoveredDistrict(null),
                }}
              >
                <Popup>
                  <div className="min-w-[180px]">
                    <h3 className="text-base font-semibold text-slate-800">
                      {feat.properties.name}
                    </h3>
                    <p className="text-sm text-slate-600">
                      Province: {feat.properties.provinceCode}
                    </p>
                    {feat.properties.population > 0 && (
                      <p className="text-sm text-slate-600">
                        Population:{" "}
                        {feat.properties.population.toLocaleString()}
                      </p>
                    )}
                  </div>
                </Popup>
              </Polygon>
            );
          })}

        {/* Cities as CircleMarkers */}
        {showCities &&
          cities.map((feat) => {
            const [lng, lat] = feat.geometry.coordinates;
            const pos: [number, number] = [lat, lng];
            const radius = cityRadius(feat.properties.population);
            return (
              <CircleMarker
                key={`city-${feat.id}`}
                center={pos}
                radius={radius}
                pathOptions={{
                  fillColor: CITY_COLOR,
                  color: "#b91c1c",
                  weight: 1,
                  fillOpacity: 0.8,
                }}
              >
                <Popup>
                  <div className="min-w-[180px]">
                    <h3 className="text-base font-semibold text-slate-800">
                      {feat.properties.name}
                    </h3>
                    <p className="text-sm text-slate-600">
                      Province: {feat.properties.provinceCode}
                    </p>
                    {feat.properties.districtName && (
                      <p className="text-sm text-slate-600">
                        District: {feat.properties.districtName}
                      </p>
                    )}
                    <p className="text-sm text-slate-600">
                      Population:{" "}
                      {feat.properties.population?.toLocaleString() ?? "—"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {lat.toFixed(4)}, {lng.toFixed(4)}
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
      </MapContainer>
    </div>
  );
});

export default PakistanMap;
