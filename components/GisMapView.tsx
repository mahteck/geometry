"use client";

/**
 * Enterprise GIS Map: Leaflet with layers for Regions, Cities, Areas, Roads, Fences.
 * Fetches from /api/gis/*. Fences: active=blue, inactive=grey, big=thicker border.
 * Roads: motorway=red, trunk/primary=orange, secondary=yellow.
 * Regions: light purple border. Cities: black circle. Areas: grey marker.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { FenceMasterFeature } from "@/types/masterGis";
import type { RoadFeature, RegionFeature, CityFeature, AreaFeature } from "@/types/masterGis";
import type { GeoJSONFeatureCollection, GeoJSONGeometry } from "@/types/fence";
import {
  getFenceStyleForGisMap,
  getRoadStyleForGisMap,
  REGION_STYLE,
  CITY_MARKER_OPTIONS,
  AREA_MARKER_OPTIONS,
} from "@/lib/gisMapStyles";
import GisMapLegend from "./GisMapLegend";

const CENTER: [number, number] = [30.3753, 69.3451];
const ZOOM = 6;
const FENCE_BASE_OPACITY = 0.35;

export interface GisMapViewFilterParams {
  search?: string;
  region?: string;
  region_name?: string;
  status?: string;
  route_type?: string;
  routeType?: string;
  is_big?: string;
  bigOnly?: string;
  roadType?: string;
}

export interface GisMapViewLayerVisibility {
  fences: boolean;
  roads: boolean;
  regions: boolean;
  cities: boolean;
  areas: boolean;
}

export interface GisMapViewHandle {
  zoomToFeature: (feat: FenceMasterFeature) => void;
  getBounds: () => [number, number, number, number] | null;
  refetch: () => void;
}

export interface GisMapViewProps {
  filterParams?: GisMapViewFilterParams;
  layerVisibility?: GisMapViewLayerVisibility;
  onFencesLoaded?: (features: FenceMasterFeature[]) => void;
  onZoomToFence?: (feat: FenceMasterFeature) => void;
}

function esc(s: string): string {
  const el = document.createElement("div");
  el.textContent = s;
  return el.innerHTML;
}

function fencePopupHtml(f: FenceMasterFeature): string {
  const name = f.properties?.name ?? `Zone_${f.id}`;
  const status = f.properties?.status ?? "—";
  const routeType = f.properties?.route_type ?? "—";
  const area = f.properties?.area_size != null ? `${(Number(f.properties.area_size) / 1e6).toFixed(2)} km²` : "—";
  return [
    `<div class="text-sm">`,
    `<strong>${esc(name)}</strong><br/>`,
    `Status: ${esc(String(status))}<br/>`,
    `Route type: ${esc(String(routeType))}<br/>`,
    `Area: ${area}`,
    `</div>`,
  ].join("");
}

function roadPopupHtml(r: RoadFeature): string {
  const name = r.properties?.name ?? "—";
  const highway = r.properties?.highway ?? r.properties?.road_class ?? "—";
  return `<div class="text-sm"><strong>${esc(String(name))}</strong><br/>Highway: ${esc(String(highway))}</div>`;
}

function getBoundsFromFeature(feat: FenceMasterFeature, L: typeof import("leaflet")): L.LatLngBounds | null {
  const geom = feat.geometry;
  if (!geom || !geom.coordinates) return null;
  let coords: [number, number][] = [];
  if (geom.type === "Polygon" && Array.isArray(geom.coordinates[0])) {
    coords = (geom.coordinates[0] as [number, number][]).map((c) => [c[1], c[0]] as [number, number]);
  } else if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
    const first = (geom.coordinates as number[][][][])[0]?.[0];
    if (first) coords = first.map((c) => [c[1], c[0]] as [number, number]);
  }
  if (coords.length < 2) return null;
  return L.latLngBounds(coords.map(([lat, lng]) => L.latLng(lat, lng)));
}

const GisMapView = forwardRef<GisMapViewHandle, GisMapViewProps>(function GisMapView(
  { filterParams, layerVisibility, onFencesLoaded, onZoomToFence },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const layersRef = useRef<{
    fences: L.GeoJSON | null;
    roads: L.GeoJSON | null;
    regions: L.GeoJSON | null;
    cities: L.LayerGroup | null;
    areas: L.LayerGroup | null;
  }>({ fences: null, roads: null, regions: null, cities: null, areas: null });
  const layersForCleanupRef = useRef<typeof layersRef.current>({ fences: null, roads: null, regions: null, cities: null, areas: null });
  const filterParamsRef = useRef(filterParams);
  const layerVisibilityRef = useRef(layerVisibility);
  const onFencesLoadedRef = useRef(onFencesLoaded);
  const onZoomToFenceRef = useRef(onZoomToFence);
  filterParamsRef.current = filterParams;
  layerVisibilityRef.current = layerVisibility;
  onFencesLoadedRef.current = onFencesLoaded;
  onZoomToFenceRef.current = onZoomToFence;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fenceCount, setFenceCount] = useState(0);

  const refetch = useRef<() => void>(() => {});

  useImperativeHandle(
    ref,
    () => ({
      zoomToFeature(feat: FenceMasterFeature) {
        const map = mapRef.current;
        const L = leafletRef.current;
        if (!L || !map) return;
        const bounds = getBoundsFromFeature(feat, L);
        if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
      },
      getBounds() {
        const map = mapRef.current;
        if (!map) return null;
        const b = map.getBounds();
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        return [sw.lng, sw.lat, ne.lng, ne.lat];
      },
      refetch() {
        refetch.current?.();
      },
    }),
    []
  );

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;

    const L = require("leaflet");
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });

    leafletRef.current = L;
    const map = L.map(containerRef.current).setView(CENTER, ZOOM);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const visibility = layerVisibilityRef.current ?? {
      fences: true,
      roads: true,
      regions: true,
      cities: true,
      areas: false,
    };

    const addFences = (features: FenceMasterFeature[]) => {
      const prev = layersRef.current.fences;
      if (prev && map.hasLayer(prev)) map.removeLayer(prev);
      const fc: GeoJSONFeatureCollection<FenceMasterFeature> = { type: "FeatureCollection", features };
      const layer = L.geoJSON(fc, {
        style: (f?: unknown) => {
          const feat: FenceMasterFeature =
            (f as FenceMasterFeature)?.properties != null
              ? (f as FenceMasterFeature)
              : {
                  type: "Feature",
                  id: 0,
                  properties: { name: "Unknown" },
                  geometry: { type: "Polygon", coordinates: [] },
                };
          return getFenceStyleForGisMap(feat, { fillOpacity: FENCE_BASE_OPACITY });
        },
        onEachFeature(f: FenceMasterFeature, layer: L.GeoJSON) {
          const l = layer as unknown as L.Polygon;
          l.bindPopup(fencePopupHtml(f), { maxWidth: 320 });
          l.on("click", () => onZoomToFenceRef.current?.(f));
        },
      });
      layersRef.current.fences = layer;
      layersForCleanupRef.current.fences = layer;
      if (visibility.fences) layer.addTo(map);
      setFenceCount(features.length);
      onFencesLoadedRef.current?.(features);
    };

    const addRoads = (features: RoadFeature[]) => {
      const prev = layersRef.current.roads;
      if (prev && map.hasLayer(prev)) map.removeLayer(prev);
      const fc = { type: "FeatureCollection" as const, features };
      const layer = L.geoJSON(fc, {
        style: (f?: unknown) => getRoadStyleForGisMap(f as RoadFeature),
        onEachFeature(f: RoadFeature, layer: L.GeoJSON) {
          (layer as unknown as L.Polyline).bindPopup(roadPopupHtml(f), { maxWidth: 280 });
        },
      });
      layersRef.current.roads = layer;
      layersForCleanupRef.current.roads = layer;
      if (visibility.roads) layer.addTo(map);
    };

    const addRegions = (features: RegionFeature[]) => {
      const prev = layersRef.current.regions;
      if (prev && map.hasLayer(prev)) map.removeLayer(prev);
      const fc = { type: "FeatureCollection" as const, features };
      const layer = L.geoJSON(fc, { style: () => REGION_STYLE });
      layersRef.current.regions = layer;
      layersForCleanupRef.current.regions = layer;
      if (visibility.regions) layer.addTo(map);
    };

    const addCities = (features: CityFeature[]) => {
      const prev = layersRef.current.cities;
      if (prev && map.hasLayer(prev)) map.removeLayer(prev);
      const group = L.layerGroup();
      const LRef = L;
      features.forEach((f) => {
        const coord = f.geometry?.type === "Point" && f.geometry.coordinates;
        if (!coord || !Array.isArray(coord)) return;
        const [lng, lat] = coord as number[];
        const circle = LRef.circleMarker([lat, lng], CITY_MARKER_OPTIONS);
        const name = f.properties?.name ?? "—";
        circle.bindPopup(`<div class="text-sm"><strong>${esc(String(name))}</strong><br/>City/Town</div>`, { maxWidth: 260 });
        group.addLayer(circle);
      });
      layersRef.current.cities = group;
      layersForCleanupRef.current.cities = group;
      if (visibility.cities) group.addTo(map);
    };

    const addAreas = (features: AreaFeature[]) => {
      const prev = layersRef.current.areas;
      if (prev && map.hasLayer(prev)) map.removeLayer(prev);
      const group = L.layerGroup();
      const LRef = L;
      features.forEach((f) => {
        const coord = f.geometry?.type === "Point" && f.geometry.coordinates;
        if (!coord || !Array.isArray(coord)) return;
        const [lng, lat] = coord as number[];
        const circle = LRef.circleMarker([lat, lng], AREA_MARKER_OPTIONS);
        const name = f.properties?.name ?? "—";
        circle.bindPopup(`<div class="text-sm"><strong>${esc(String(name))}</strong><br/>${esc(String(f.properties?.place_type ?? ""))}</div>`, { maxWidth: 260 });
        group.addLayer(circle);
      });
      layersRef.current.areas = group;
      layersForCleanupRef.current.areas = group;
      if (visibility.areas) group.addTo(map);
    };

    const loadAll = async () => {
      setError(null);
      setLoading(true);
      const fp = filterParamsRef.current;
      const vis = layerVisibilityRef.current ?? { fences: true, roads: true, regions: true, cities: true, areas: false };

      try {
        const bbox = map.getBounds();
        const sw = bbox.getSouthWest();
        const ne = bbox.getNorthEast();
        const pad = 0.05;
        const bboxStr = `${sw.lng - pad},${sw.lat - pad},${ne.lng + pad},${ne.lat + pad}`;

        const params = new URLSearchParams();
        params.set("bbox", bboxStr);
        if (fp?.search?.trim()) params.set("search", fp.search.trim());
        if (fp?.region) params.set("region_name", fp.region);
        if (fp?.region_name) params.set("region_name", fp.region_name);
        if (fp?.status) params.set("status", fp.status);
        if (fp?.route_type) params.set("route_type", fp.route_type);
        if (fp?.routeType) params.set("route_type", fp.routeType);
        if (fp?.bigOnly === "1" || fp?.is_big === "1") params.set("is_big", "1");

        const base = "/api/gis";
        const [fencesRes, roadsRes, regionsRes, citiesRes, areasRes] = await Promise.all([
          fetch(`${base}/fences?${params.toString()}&limit=2000`),
          vis.roads ? fetch(`${base}/roads?bbox=${bboxStr}${fp?.roadType ? `&type=${fp.roadType}` : ""}`) : Promise.resolve(null),
          vis.regions ? fetch(`${base}/regions?bbox=${bboxStr}`) : Promise.resolve(null),
          vis.cities ? fetch(`${base}/cities?bbox=${bboxStr}`) : Promise.resolve(null),
          vis.areas ? fetch(`${base}/areas?bbox=${bboxStr}&limit=1500`) : Promise.resolve(null),
        ]);

        if (fencesRes?.ok) {
          const data = (await fencesRes.json()) as GeoJSONFeatureCollection<FenceMasterFeature>;
          const features = Array.isArray(data?.features) ? data.features : [];
          addFences(features);
        } else {
          addFences([]);
        }
        if (roadsRes?.ok) {
          const data = (await roadsRes.json()) as { features?: RoadFeature[] };
          addRoads(Array.isArray(data?.features) ? data.features : []);
        } else {
          addRoads([]);
        }
        if (regionsRes?.ok) {
          const data = (await regionsRes.json()) as { features?: RegionFeature[] };
          addRegions(Array.isArray(data?.features) ? data.features : []);
        } else {
          addRegions([]);
        }
        if (citiesRes?.ok) {
          const data = (await citiesRes.json()) as { features?: CityFeature[] };
          addCities(Array.isArray(data?.features) ? data.features : []);
        } else {
          addCities([]);
        }
        if (areasRes?.ok) {
          const data = (await areasRes.json()) as { features?: AreaFeature[] };
          addAreas(Array.isArray(data?.features) ? data.features : []);
        } else {
          addAreas([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load layers");
      } finally {
        setLoading(false);
      }
    };

    refetch.current = loadAll;
    loadAll();

    const onMoveEnd = () => {
      refetch.current?.();
    };
    map.on("moveend", onMoveEnd);
    map.on("zoomend", onMoveEnd);

    return () => {
      map.off("moveend", onMoveEnd);
      map.off("zoomend", onMoveEnd);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- layers ref is updated async; read at cleanup
      const layers = layersForCleanupRef.current;
      Object.values(layers).forEach((layer) => {
        if (layer && map.hasLayer(layer as L.Layer)) map.removeLayer(layer as L.Layer);
      });
      map.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const vis = layerVisibility ?? { fences: true, roads: true, regions: true, cities: true, areas: false };
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map) return;
    if (layers.fences && map.hasLayer(layers.fences) !== vis.fences) {
      vis.fences ? map.addLayer(layers.fences) : map.removeLayer(layers.fences);
    }
    if (layers.roads && map.hasLayer(layers.roads) !== vis.roads) {
      vis.roads ? map.addLayer(layers.roads) : map.removeLayer(layers.roads);
    }
    if (layers.regions && map.hasLayer(layers.regions) !== vis.regions) {
      vis.regions ? map.addLayer(layers.regions) : map.removeLayer(layers.regions);
    }
    if (layers.cities && map.hasLayer(layers.cities!) !== vis.cities) {
      vis.cities ? map.addLayer(layers.cities!) : map.removeLayer(layers.cities!);
    }
    if (layers.areas && map.hasLayer(layers.areas!) !== vis.areas) {
      vis.areas ? map.addLayer(layers.areas!) : map.removeLayer(layers.areas!);
    }
  }, [layerVisibility]);

  useEffect(() => {
    refetch.current?.();
  }, [filterParams]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/70">
          <div className="h-10 w-10 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute bottom-4 left-4 right-4 rounded bg-red-100 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <div className="absolute bottom-4 left-4 z-[1000]">
        <GisMapLegend />
      </div>
      <div className="absolute bottom-4 right-4 rounded bg-white/90 px-2 py-1 text-xs text-slate-600 shadow">
        Fences: {fenceCount}
      </div>
    </div>
  );
});

export default GisMapView;
