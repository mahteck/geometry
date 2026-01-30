"use client";

/**
 * MapView: Leaflet map with fence polygons from DB and Leaflet.Draw.
 *
 * Edit hang fix: All fences stay in displayGroup (display only). Edit/Delete toolbar
 * uses editGroup which has 0 or 1 polygon. Click a polygon → popup "Edit shape" → that
 * polygon moves to editGroup → then click pencil and click polygon to edit (no hang).
 *
 * Flow: Polygon = draw new. Click fence → "Edit shape" | "Delete". Edit shape → click
 * pencil, then click polygon to reshape → Save/Cancel. Delete → confirm then DELETE API.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { GeoJSONFeatureCollection, FenceFeature, GeoJSONGeometry } from "@/types/fence";
import type { MeasureResult } from "@/types/leaflet-measure";
import { getStyleForFence, type FenceStyleResult } from "@/lib/fenceStyles";
import MapLegend from "./MapLegend";

/** Format number with commas (e.g. 1234.56 -> "1,234.56") */
function formatMeasureValue(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

export interface MapViewFilterParams {
  search?: string;
  region?: string;
  status?: string;
  minArea?: string;
  maxArea?: string;
}

export interface MapViewHandle {
  zoomToFeature: (feat: FenceFeature) => void;
  /** Current map bounds [minLng, minLat, maxLng, maxLat] or null */
  getBounds: () => [number, number, number, number] | null;
  /** Refetch fences from API (e.g. after validation fix) */
  refetchFences: () => void;
}

/** Validation issue summary for map popup (subset of ValidationIssue). */
export interface MapViewValidationIssue {
  validReason?: string | null;
  isSimple: boolean;
  hasUnclosedRing: boolean;
  hasDuplicateVertices: boolean;
}

export interface MapViewProps {
  filterParams?: MapViewFilterParams;
  onResultsLoaded?: (features: FenceFeature[]) => void;
  /** Fence IDs with validation issues (highlighted in red) */
  invalidFenceIds?: number[];
  /** Validation details per fence (shown in popup) */
  invalidIssueMap?: Record<number, MapViewValidationIssue>;
}

const CENTER: [number, number] = [30.3753, 69.3451];
const ZOOM = 6;
const FILL_OPACITY = 0.28;
const FILL_OPACITY_DENSE = 0.12;
const FILL_OPACITY_HOVER = 0.55;
const FILL_OPACITY_DIMMED = 0.06;
const FILL_OPACITY_HIGHLIGHT = 0.6;
const FILL_OPACITY_SELECTED = 0.5;
const STROKE_WEIGHT = 1.5;
const STROKE_WEIGHT_SELECTED = 2.5;

function esc(s: string): string {
  const el = document.createElement("div");
  el.textContent = s;
  return el.innerHTML;
}

function tooltipContent(feat: FenceFeature): string {
  const name = feat.properties?.name ?? `Zone_${feat.id ?? "?"}`;
  const id = feat.id ?? "?";
  const addr = (feat.properties?.address ?? "").toString().trim();
  const city = (feat.properties?.city ?? "").toString().trim();
  const parts: string[] = [];
  parts.push(`<span class="font-semibold">${esc(name)} (ID: ${id})</span>`);
  if (addr) parts.push(`<span>Address: ${esc(addr)}</span>`);
  if (city) parts.push(`<span>City: ${esc(city)}</span>`);
  return parts.join("<br/>");
}

/** Convert Leaflet polygon latlngs to GeoJSON Polygon coordinates (exterior ring only). */
function latLngsToPolygonCoords(latlngs: L.LatLng[][]): number[][][] | null {
  if (!latlngs?.length || !latlngs[0]?.length) return null;
  const ring = latlngs[0].map((ll) => [ll.lng, ll.lat] as [number, number]);
  if (ring.length < 3) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return [ring];
}

/** Get GeoJSON Polygon from a Leaflet polygon layer. */
function layerToGeoJSONPolygon(layer: L.Polygon): GeoJSONGeometry | null {
  const latlngs = layer.getLatLngs();
  if (!Array.isArray(latlngs)) return null;
  const coords = latLngsToPolygonCoords(latlngs as L.LatLng[][]);
  if (!coords) return null;
  return { type: "Polygon", coordinates: coords };
}

// Extend Leaflet layer type for our metadata
interface FenceLayer extends L.Polygon {
  _fenceId?: number;
  _feature?: FenceFeature;
  _lastSavedLatLngs?: L.LatLng[][];
  _baseStyle?: FenceStyleResult;
}

function getBoundsFromFeature(feat: FenceFeature, L: typeof import("leaflet")): L.LatLngBounds | null {
  const geom = feat.geometry;
  if (!geom || geom.type !== "Polygon" || !Array.isArray(geom.coordinates)) return null;
  const ring = geom.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 2) return null;
  const points = ring.map((c) => L.latLng((c as [number, number])[1], (c as [number, number])[0]));
  return L.latLngBounds(points);
}

const INVALID_FILL = "#ef4444";
const INVALID_STROKE = "#b91c1c";

function validationPopupHtml(issue: MapViewValidationIssue): string {
  const parts: string[] = [];
  if (issue.validReason) parts.push(esc(issue.validReason));
  if (!issue.isSimple) parts.push("Self-intersection");
  if (issue.hasUnclosedRing) parts.push("Unclosed polygon");
  if (issue.hasDuplicateVertices) parts.push("Duplicate vertices");
  if (parts.length === 0) return "";
  return `<div class="mt-2 border-t border-red-200 pt-2 text-xs text-red-700"><strong>Validation:</strong> ${parts.join(" · ")}</div>`;
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { filterParams, onResultsLoaded, invalidFenceIds, invalidIssueMap },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const filterParamsRef = useRef(filterParams);
  const onResultsLoadedRef = useRef(onResultsLoaded);
  const invalidFenceIdsRef = useRef<number[] | undefined>(invalidFenceIds);
  const invalidIssueMapRef = useRef<Record<number, MapViewValidationIssue> | undefined>(invalidIssueMap);
  filterParamsRef.current = filterParams;
  onResultsLoadedRef.current = onResultsLoaded;
  invalidFenceIdsRef.current = invalidFenceIds;
  invalidIssueMapRef.current = invalidIssueMap;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [showSaveCancel, setShowSaveCancel] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmCount, setDeleteConfirmCount] = useState(0);
  const [showEditPopup, setShowEditPopup] = useState(false);
  const [editHint, setEditHint] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [viewportOnly, setViewportOnly] = useState(true);
  const [highlighted, setHighlighted] = useState(false);
  const [measureResult, setMeasureResult] = useState<MeasureResult | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const measureControlRef = useRef<L.Control | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const editGroupRef = useRef<L.FeatureGroup | null>(null);
  const selectedLayerRef = useRef<FenceLayer | null>(null);
  const highlightedLayerRef = useRef<FenceLayer | null>(null);
  const setShowEditPopupRef = useRef<(v: boolean) => void>(() => {});
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const saveCancelLayersRef = useRef<FenceLayer[]>([]);
  const deleteConfirmLayersRef = useRef<FenceLayer[]>([]);
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportOnlyRef = useRef(true);
  const runFetchRef = useRef<() => void>(() => {});

  setShowEditPopupRef.current = setShowEditPopup;
  viewportOnlyRef.current = viewportOnly;

  useImperativeHandle(ref, () => ({
    zoomToFeature(feat: FenceFeature) {
      const map = mapRef.current;
      const L = leafletRef.current;
      if (!L) return;
      const bounds = getBoundsFromFeature(feat, L);
      if (map && bounds) {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
      }
    },
    getBounds() {
      const map = mapRef.current;
      if (!map) return null;
      const b = map.getBounds();
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      return [sw.lng, sw.lat, ne.lng, ne.lat];
    },
    refetchFences() {
      runFetchRef.current?.();
    },
  }), []);

  const fetchAndRenderFences = useRef<(
    map: L.Map,
    drawnItems: L.FeatureGroup,
    opts: { viewportOnly: boolean }
  ) => Promise<void>>(async () => {});

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;

    const L = require("leaflet");
    require("leaflet-draw");
    require("leaflet-measure");

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

    const drawnItems = L.featureGroup().addTo(map);
    drawnItemsRef.current = drawnItems;
    const editGroup = L.featureGroup().addTo(map);
    editGroupRef.current = editGroup;

    const baseOpacity = (featureCount: number) =>
      featureCount > 150 ? FILL_OPACITY_DENSE : FILL_OPACITY;

    const styleForFence = (feat: FenceFeature, featureCount: number) => {
      const style = getStyleForFence(feat, {
        fillOpacity: baseOpacity(featureCount),
        strokeWeight: STROKE_WEIGHT,
      });
      return () => style;
    };

    const setLayerFeature = (layer: FenceLayer, feat: FenceFeature, baseStyle: FenceStyleResult) => {
      layer._fenceId = feat.id;
      layer._feature = feat;
      layer._baseStyle = baseStyle;
      const latlngs = layer.getLatLngs() as L.LatLng[][];
      layer._lastSavedLatLngs = latlngs.map((ring) => ring.map((ll) => L.latLng(ll.lat, ll.lng)));
    };

    fetchAndRenderFences.current = async (
      mapInstance: L.Map,
      drawnItemsGroup: L.FeatureGroup,
      opts: { viewportOnly: boolean }
    ) => {
      try {
        let url = "/api/fences";
        const urlParams = new URLSearchParams();
        const fp = filterParamsRef.current;
        const hasFilters = Boolean(
          fp?.search?.trim() || fp?.region || fp?.status || fp?.minArea || fp?.maxArea
        );
        /* When user has search/filters, load all matching fences (no bbox). Otherwise use viewport. */
        if (opts.viewportOnly && !hasFilters) {
          const bounds = mapInstance.getBounds();
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          const pad = 0.02;
          const minLng = Math.max(-180, sw.lng - pad);
          const minLat = Math.max(-90, sw.lat - pad);
          const maxLng = Math.min(180, ne.lng + pad);
          const maxLat = Math.min(90, ne.lat + pad);
          urlParams.set("bbox", `${minLng},${minLat},${maxLng},${maxLat}`);
        }
        if (fp?.search?.trim()) urlParams.set("search", fp.search.trim());
        if (fp?.region) urlParams.set("region", fp.region);
        if (fp?.status) urlParams.set("status", fp.status);
        if (fp?.minArea) urlParams.set("minArea", fp.minArea);
        if (fp?.maxArea) urlParams.set("maxArea", fp.maxArea);
        const qs = urlParams.toString();
        if (qs) url += `?${qs}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as GeoJSONFeatureCollection<FenceFeature> | { error?: string; detail?: string };
        if ("error" in data && data.error) throw new Error((data as { detail?: string }).detail || data.error);
        const features = Array.isArray((data as GeoJSONFeatureCollection<FenceFeature>).features)
          ? (data as GeoJSONFeatureCollection<FenceFeature>).features
          : [];

        drawnItemsGroup.clearLayers();
        highlightedLayerRef.current = null;
        setHighlighted(false);

        features.forEach((feat) => {
          const isInvalid = invalidFenceIdsRef.current?.includes(feat.id);
          const baseStyle = isInvalid
            ? {
                fillColor: INVALID_FILL,
                fillOpacity: baseOpacity(features.length),
                color: INVALID_STROKE,
                weight: STROKE_WEIGHT,
              }
            : getStyleForFence(feat, {
                fillOpacity: baseOpacity(features.length),
                strokeWeight: STROKE_WEIGHT,
              });
          const styleFn = () => baseStyle;
          const popupHtml =
            tooltipContent(feat) +
            (invalidIssueMapRef.current?.[feat.id]
              ? validationPopupHtml(invalidIssueMapRef.current[feat.id])
              : "");
          const singleFc: GeoJSONFeatureCollection<FenceFeature> = {
            type: "FeatureCollection",
            features: [feat],
          };
          const layer = L.geoJSON(singleFc, {
            style: styleFn,
            onEachFeature(_f: unknown, geoJsonLayer: L.GeoJSON) {
              const layers = geoJsonLayer.getLayers?.() ?? [geoJsonLayer];
              layers.forEach((l) => {
                const poly = l as FenceLayer;
                setLayerFeature(poly, feat, baseStyle);
                poly.bindTooltip(popupHtml, { sticky: true, className: "fence-tooltip", offset: [0, -2] });
                poly.bindPopup(popupHtml, { maxWidth: 320 });
                poly.on({
                  mouseover(e: L.LeafletMouseEvent) {
                    const t = e.target as FenceLayer;
                    t.setStyle({
                      fillColor: t._baseStyle?.fillColor,
                      fillOpacity: FILL_OPACITY_HOVER,
                      color: t._baseStyle?.color,
                      weight: STROKE_WEIGHT_SELECTED,
                    });
                    t.bringToFront();
                  },
                  mouseout(e: L.LeafletMouseEvent) {
                    const t = e.target as FenceLayer;
                    if (highlightedLayerRef.current === t) {
                      t.setStyle({
                        fillColor: t._baseStyle?.fillColor,
                        fillOpacity: FILL_OPACITY_HIGHLIGHT,
                        color: t._baseStyle?.color,
                        weight: STROKE_WEIGHT_SELECTED,
                      });
                    } else if (t._baseStyle) {
                      t.setStyle(t._baseStyle);
                    }
                  },
                  click() {
                    const prev = selectedLayerRef.current;
                    if (prev && prev !== poly && prev._baseStyle) prev.setStyle(prev._baseStyle);
                    selectedLayerRef.current = poly;
                    if (poly._baseStyle) {
                      poly.setStyle({
                        fillColor: poly._baseStyle.fillColor,
                        fillOpacity: FILL_OPACITY_SELECTED,
                        color: poly._baseStyle.color,
                        weight: STROKE_WEIGHT_SELECTED,
                      });
                    }
                    setShowEditPopupRef.current(true);
                  },
                });
                drawnItemsGroup.addLayer(poly);
              });
            },
          });
          const layerList = layer.getLayers?.() ?? [];
          if (layerList.length === 0 && feat.geometry?.type === "Polygon") {
            const coords = (feat.geometry as { type: "Polygon"; coordinates: number[][][] }).coordinates[0];
            const latlngs = coords.map((c) => L.latLng(c[1], c[0]));
            const poly = L.polygon(latlngs, styleFn()) as FenceLayer;
            setLayerFeature(poly, feat, baseStyle);
            poly.bindTooltip(popupHtml, { sticky: true, className: "fence-tooltip", offset: [0, -2] });
            poly.bindPopup(popupHtml, { maxWidth: 320 });
            poly.on({
              mouseover(e: L.LeafletMouseEvent) {
                const t = e.target as FenceLayer;
                t.setStyle({
                  fillColor: t._baseStyle?.fillColor,
                  fillOpacity: FILL_OPACITY_HOVER,
                  color: t._baseStyle?.color,
                  weight: STROKE_WEIGHT_SELECTED,
                });
                t.bringToFront();
              },
              mouseout(e: L.LeafletMouseEvent) {
                const t = e.target as FenceLayer;
                if (highlightedLayerRef.current === t) {
                  t.setStyle({
                    fillColor: t._baseStyle?.fillColor,
                    fillOpacity: FILL_OPACITY_HIGHLIGHT,
                    color: t._baseStyle?.color,
                    weight: STROKE_WEIGHT_SELECTED,
                  });
                } else if (t._baseStyle) {
                  t.setStyle(t._baseStyle);
                }
              },
              click() {
                const prev = selectedLayerRef.current;
                if (prev && prev !== poly && prev._baseStyle) prev.setStyle(prev._baseStyle);
                selectedLayerRef.current = poly;
                if (poly._baseStyle) {
                  poly.setStyle({
                    fillColor: poly._baseStyle.fillColor,
                    fillOpacity: FILL_OPACITY_SELECTED,
                    color: poly._baseStyle.color,
                    weight: STROKE_WEIGHT_SELECTED,
                  });
                }
                setShowEditPopupRef.current(true);
              },
            });
            drawnItemsGroup.addLayer(poly);
          }
        });

        setCount(drawnItemsGroup.getLayers().length);
        onResultsLoadedRef.current?.(features);
        if (opts.viewportOnly) {
          fetch(`/api/fences?countOnly=1&${qs}`)
            .then((r) => r.ok ? r.json() : null)
            .then((j: { total?: number } | null) => j && typeof j.total === "number" && setTotalCount(j.total))
            .catch(() => {});
        } else {
          setTotalCount(drawnItemsGroup.getLayers().length);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load fences");
      } finally {
        setLoading(false);
      }
    };

    map.addControl(
      new L.Control.Draw({
        draw: {
          polygon: {
            allowIntersection: false,
            shapeOptions: { color: "#1e293b", fillColor: "#f97316", fillOpacity: FILL_OPACITY },
            showArea: true,
            metric: true,
          },
          polyline: false,
          circle: false,
          circlemarker: false,
          rectangle: false,
          marker: false,
        },
        edit: {
          featureGroup: editGroup,
          remove: true,
        },
      })
    );

    const measureControl = (L.control as unknown as { measure: (opts?: import("@/types/leaflet-measure").LeafletMeasureOptions) => L.Control }).measure({
      position: "topright",
      primaryLengthUnit: "kilometers",
      secondaryLengthUnit: "meters",
      primaryAreaUnit: "sqkm",
      secondaryAreaUnit: "sqmeters",
      decPoint: ".",
      thousandsSep: ",",
      units: {
        sqkm: { factor: 0.000001, display: "km²", decimals: 2 },
      },
    });
    measureControl.addTo(map);
    measureControlRef.current = measureControl;

    map.on("measurefinish" as keyof L.LeafletEventHandlerFnMap, (e: L.LeafletEvent & { measureResult?: MeasureResult }) => {
      const result = (e as { measureResult?: MeasureResult }).measureResult;
      if (result) setMeasureResult(result);
    });

    map.on(L.Draw.Event.CREATED, async (e: L.LeafletEvent & { layer: L.Polygon }) => {
      const layer = e.layer as FenceLayer;
      const geom = layerToGeoJSONPolygon(layer as L.Polygon);
      if (!geom || geom.type !== "Polygon") return;
      try {
        const res = await fetch("/api/fences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Fence", geometry: geom }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { detail?: string }).detail || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { id: number; name: string };
        const feat: FenceFeature = {
          type: "Feature",
          id: data.id,
          properties: { name: data.name },
          geometry: geom as GeoJSONGeometry,
        };
        const baseStyle = getStyleForFence(feat, {
          fillOpacity: FILL_OPACITY,
          strokeWeight: STROKE_WEIGHT,
        });
        setLayerFeature(layer, feat, baseStyle);
        layer.setStyle(baseStyle);
        layer.on("click", () => {
          selectedLayerRef.current = layer;
          setShowEditPopupRef.current(true);
        });
        drawnItems.addLayer(layer);
        setCount(drawnItems.getLayers().length);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save fence");
      }
    });

    map.on(L.Draw.Event.EDITED, (e: L.LeafletEvent & { layers: L.LayerGroup }) => {
      const layers: FenceLayer[] = [];
      (e.layers as L.LayerGroup).eachLayer((l) => layers.push(l as FenceLayer));
      saveCancelLayersRef.current = layers;
      setShowSaveCancel(true);
    });

    map.on(L.Draw.Event.DELETED, (e: L.LeafletEvent & { layers: L.LayerGroup }) => {
      const layers: FenceLayer[] = [];
      (e.layers as L.LayerGroup).eachLayer((l) => layers.push(l as FenceLayer));
      const withId = layers.filter((l) => l._fenceId != null);
      if (withId.length === 0) return;
      deleteConfirmLayersRef.current = withId;
      setDeleteConfirmCount(withId.length);
      setShowDeleteConfirm(true);
      withId.forEach((layer) => editGroup.addLayer(layer));
    });

    const doFetch = () => {
      fetchAndRenderFences.current(map, drawnItems, { viewportOnly: viewportOnlyRef.current });
    };
    runFetchRef.current = () => {
      if (mapRef.current && drawnItemsRef.current) {
        setLoading(true);
        fetchAndRenderFences.current(mapRef.current, drawnItemsRef.current, {
          viewportOnly: viewportOnlyRef.current,
        });
      }
    };
    doFetch();

    const onMoveEnd = () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => {
        if (viewportOnlyRef.current) doFetch();
      }, 350);
    };
    map.on("moveend", onMoveEnd);
    map.on("zoomend", onMoveEnd);

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      map.off("measurefinish" as keyof L.LeafletEventHandlerFnMap);
      map.off("moveend", onMoveEnd);
      map.off("zoomend", onMoveEnd);
      map.off();
      if (measureControlRef.current) {
        map.removeControl(measureControlRef.current);
        measureControlRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      drawnItemsRef.current = null;
      editGroupRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (filterParams == null) return;
    runFetchRef.current?.();
  }, [filterParams]);

  useEffect(() => {
    const drawnItems = drawnItemsRef.current;
    const editGroup = editGroupRef.current;
    const ids = invalidFenceIds ?? [];
    const issueMap = invalidIssueMap ?? {};
    if (!drawnItems && !editGroup) return;
    const updateLayer = (poly: FenceLayer) => {
      const feat = poly._feature;
      const fid = poly._fenceId;
      if (fid == null || !feat) return;
      const isInvalid = ids.includes(fid);
      const baseStyle = isInvalid
        ? { fillColor: INVALID_FILL, fillOpacity: FILL_OPACITY, color: INVALID_STROKE, weight: STROKE_WEIGHT }
        : poly._baseStyle;
      if (baseStyle) poly.setStyle(baseStyle);
      const popupHtml =
        tooltipContent(feat) +
        (issueMap[fid] ? validationPopupHtml(issueMap[fid]) : "");
      poly.setPopupContent(popupHtml);
      const tooltip = (poly as FenceLayer & { _tooltip?: L.Tooltip })._tooltip;
      if (tooltip?.setContent) tooltip.setContent(popupHtml);
    };
    drawnItems?.eachLayer((l) => updateLayer(l as FenceLayer));
    editGroup?.eachLayer((l) => updateLayer(l as FenceLayer));
  }, [invalidFenceIds, invalidIssueMap]);

  const handleSaveEdits = async () => {
    const layers = saveCancelLayersRef.current;
    setShowSaveCancel(false);
    saveCancelLayersRef.current = [];
    if (!layers?.length) return;
    const L = leafletRef.current;
    for (const layer of layers) {
      const id = (layer as FenceLayer)._fenceId;
      if (id == null) continue;
      const geom = layerToGeoJSONPolygon(layer as L.Polygon);
      if (!geom || geom.type !== "Polygon") continue;
      try {
        const res = await fetch(`/api/fences/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geometry: geom }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const latlngs = layer.getLatLngs() as L.LatLng[][];
        if (L) {
          (layer as FenceLayer)._lastSavedLatLngs = latlngs.map((ring) =>
            ring.map((ll) => L.latLng(ll.lat, ll.lng))
          );
        }
      } catch {
        setError("Failed to update fence");
      }
    }
    moveLayersBackToDisplay(layers);
    if (count != null && drawnItemsRef.current && editGroupRef.current) {
      setCount(drawnItemsRef.current.getLayers().length + editGroupRef.current.getLayers().length);
    }
  };

  const handleCancelEdits = () => {
    const layers = saveCancelLayersRef.current;
    setShowSaveCancel(false);
    saveCancelLayersRef.current = [];
    if (!layers?.length) return;
    layers.forEach((layer) => {
      const saved = (layer as FenceLayer)._lastSavedLatLngs;
      if (saved?.length) (layer as L.Polygon).setLatLngs(saved);
    });
    moveLayersBackToDisplay(layers);
  };

  function moveLayersBackToDisplay(layers: FenceLayer[]) {
    const d = drawnItemsRef.current;
    const e = editGroupRef.current;
    if (!d || !e) return;
    layers.forEach((layer) => {
      e.removeLayer(layer);
      d.addLayer(layer);
    });
  }

  const handleConfirmDelete = async () => {
    const layers = deleteConfirmLayersRef.current;
    setShowDeleteConfirm(false);
    deleteConfirmLayersRef.current = [];
    const e = editGroupRef.current;
    if (!layers?.length || !e) return;
    for (const layer of layers) {
      const id = (layer as FenceLayer)._fenceId;
      if (id == null) continue;
      try {
        const res = await fetch(`/api/fences/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        e.removeLayer(layer);
      } catch {
        setError("Failed to delete fence");
      }
    }
    if (drawnItemsRef.current && editGroupRef.current) {
      setCount(drawnItemsRef.current.getLayers().length + editGroupRef.current.getLayers().length);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    deleteConfirmLayersRef.current = [];
  };

  const handleHighlightThisFence = () => {
    const layer = selectedLayerRef.current;
    const d = drawnItemsRef.current;
    if (!layer || !d) return;
    d.eachLayer((l) => {
      const poly = l as FenceLayer;
      const base = poly._baseStyle;
      if (poly === layer && base) {
        poly.setStyle({
          fillColor: base.fillColor,
          fillOpacity: FILL_OPACITY_HIGHLIGHT,
          color: base.color,
          weight: STROKE_WEIGHT_SELECTED,
        });
        poly.bringToFront();
      } else if (base) {
        poly.setStyle({
          fillColor: base.fillColor,
          fillOpacity: FILL_OPACITY_DIMMED,
          color: base.color,
          weight: base.weight,
        });
      }
    });
    highlightedLayerRef.current = layer;
    setHighlighted(true);
    setShowEditPopup(false);
    selectedLayerRef.current = null;
  };

  const handleShowAllFences = () => {
    const d = drawnItemsRef.current;
    if (!d) return;
    d.eachLayer((l) => {
      const poly = l as FenceLayer;
      if (poly._baseStyle) poly.setStyle(poly._baseStyle);
    });
    highlightedLayerRef.current = null;
    setHighlighted(false);
  };

  const handleStartEdit = () => {
    const layer = selectedLayerRef.current;
    const d = drawnItemsRef.current;
    const e = editGroupRef.current;
    if (!layer || !d || !e) return;
    d.removeLayer(layer);
    e.addLayer(layer);
    setShowEditPopup(false);
    selectedLayerRef.current = null;
    setEditHint(true);
    setTimeout(() => setEditHint(false), 5000);
  };

  const handleViewportOnlyToggle = () => {
    const next = !viewportOnlyRef.current;
    viewportOnlyRef.current = next;
    setViewportOnly(next);
    setLoading(true);
    runFetchRef.current?.();
  };

  const handleClearMeasurements = () => {
    const ctrl = measureControlRef.current as (L.Control & { _layer?: L.LayerGroup }) | null;
    if (ctrl?._layer) ctrl._layer.clearLayers();
    setMeasureResult(null);
  };

  const handleDeleteFromPopup = async () => {
    const layer = selectedLayerRef.current as FenceLayer | null;
    if (!layer?._fenceId) return;
    if (!window.confirm("Delete this fence?")) return;
    try {
      const res = await fetch(`/api/fences/${layer._fenceId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      drawnItemsRef.current?.removeLayer(layer);
      editGroupRef.current?.removeLayer(layer);
      setShowEditPopup(false);
      selectedLayerRef.current = null;
      if (count != null && drawnItemsRef.current && editGroupRef.current) {
        setCount(drawnItemsRef.current.getLayers().length + editGroupRef.current.getLayers().length);
      }
    } catch {
      setError("Failed to delete fence");
    }
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {!loading && !error && (
        <>
          <div className="absolute bottom-4 right-4 top-auto z-[1000] max-h-[calc(100vh-8rem)] overflow-y-auto">
            <MapLegend />
          </div>
          <div className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-block h-3 w-3 rounded-sm border border-slate-300" style={{ backgroundColor: "#22c55e", opacity: FILL_OPACITY }} />
              <span className="font-medium text-slate-700">Fences</span>
              {count != null && (
                <span className="text-slate-500">
                  {viewportOnly && totalCount != null ? `In view: ${count} (of ${totalCount})` : count}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">Click fence → Highlight / Edit / Delete · Hover for name</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleViewportOnlyToggle}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {viewportOnly ? "Load all" : "Viewport only"}
              </button>
              {highlighted && (
                <button
                  type="button"
                  onClick={handleShowAllFences}
                  className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  Show all
                </button>
              )}
            </div>
          </div>
          {(measureResult != null && (measureResult.length > 0 || measureResult.area > 0)) && (
            <div className="rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
              <p className="text-sm font-medium text-slate-700">Measurement</p>
              <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                {measureResult.length > 0 && (
                  <p>
                    Distance: {formatMeasureValue(measureResult.length)} km
                  </p>
                )}
                {measureResult.area > 0 && (
                  <p>
                    Area: {formatMeasureValue(measureResult.area)} km²
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleClearMeasurements}
                className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Clear measurements
              </button>
            </div>
          )}
        </div>
        </>
      )}

      {showEditPopup && (
        <div className="absolute right-4 top-4 z-[1002] flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-white/95 p-3 shadow-lg backdrop-blur">
          <p className="text-sm font-medium text-slate-700">Fence options</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleHighlightThisFence}
              className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
              title="Dim others so you can see this fence clearly"
            >
              Highlight only this
            </button>
            <button
              type="button"
              onClick={handleStartEdit}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Edit shape
            </button>
            <button
              type="button"
              onClick={handleDeleteFromPopup}
              className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => {
                const layer = selectedLayerRef.current;
                if (layer?._baseStyle && layer !== highlightedLayerRef.current) layer.setStyle(layer._baseStyle);
                setShowEditPopup(false);
                selectedLayerRef.current = null;
              }}
              className="rounded bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {editHint && (
        <div className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 shadow">
          Click the <strong>pencil icon</strong> above, then click the polygon to reshape.
        </div>
      )}

      {showSaveCancel && (
        <div className="absolute right-4 top-4 z-[1000] flex gap-2 rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
          <span className="text-sm text-slate-600">Save edits to database?</span>
          <button
            type="button"
            onClick={handleSaveEdits}
            className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleCancelEdits}
            className="rounded bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300"
          >
            Cancel
          </button>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="absolute right-4 top-4 z-[1001] flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-white/95 p-3 shadow-lg backdrop-blur">
          <p className="text-sm text-slate-700">
            Delete {deleteConfirmCount} fence{deleteConfirmCount > 1 ? "s" : ""}?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={handleCancelDelete}
              className="rounded bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90">
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-4 shadow-lg">
            <div className="h-10 w-10 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
            <p className="text-slate-600 text-sm">Loading fences…</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90">
          <div className="rounded-xl border border-red-200 bg-white px-6 py-4 shadow-lg">
            <p className="font-medium text-red-700">Error loading map</p>
            <p className="mt-1 text-sm text-slate-600">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default MapView;
