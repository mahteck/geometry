/**
 * Types for Enterprise GIS master tables (fences_master, roads, regions, cities, areas).
 */

import type { GeoJSONGeometry, GeoJSONFeatureCollection } from "./fence";

/** Fence feature from fences_master – compatible with FenceFeature (region_name → region, route_type → routeType). */
export interface FenceMasterFeature {
  type: "Feature";
  id: number;
  properties: {
    name: string;
    fence_type?: string | null;
    route_type?: string | null;
    region_name?: string | null;
    status?: string | null;
    area_size?: number | null;
    is_big?: boolean | null;
  };
  geometry: GeoJSONGeometry;
}

/** Road feature from roads_master */
export interface RoadFeature {
  type: "Feature";
  id: number;
  properties: {
    name?: string | null;
    highway?: string | null;
    road_class?: string | null;
  };
  geometry: GeoJSONGeometry;
}

/** Region feature from regions_master */
export interface RegionFeature {
  type: "Feature";
  id: number;
  properties: {
    name?: string | null;
    admin_level?: string | null;
    region_type?: string | null;
  };
  geometry: GeoJSONGeometry;
}

/** City feature from cities_master */
export interface CityFeature {
  type: "Feature";
  id: number;
  properties: {
    name?: string | null;
    place_type?: string | null;
    population?: string | null;
  };
  geometry: GeoJSONGeometry;
}

/** Area feature from areas_master */
export interface AreaFeature {
  type: "Feature";
  id: number;
  properties: {
    name?: string | null;
    place_type?: string | null;
  };
  geometry: GeoJSONGeometry;
}

export type RoadsFeatureCollection = GeoJSONFeatureCollection<RoadFeature>;
export type RegionsFeatureCollection = GeoJSONFeatureCollection<RegionFeature>;
export type CitiesFeatureCollection = GeoJSONFeatureCollection<CityFeature>;
export type AreasFeatureCollection = GeoJSONFeatureCollection<AreaFeature>;
