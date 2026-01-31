/**
 * Road network types for Pakistan Map
 */

export interface Motorway {
  id: number;
  motorway_code: string;
  name: string;
  start_city: string;
  end_city: string;
  length_km: number;
  lanes: number;
  toll_status: string;
  status: string;
  operator: string;
  speed_limit: number | null;
}

export interface MotorwayFeature {
  type: "Feature";
  id: number;
  properties: Motorway;
  geometry: { type: "LineString"; coordinates: number[][] };
}

export interface MotorwayCollection {
  type: "FeatureCollection";
  features: MotorwayFeature[];
}

export interface Highway {
  id: number;
  highway_code: string;
  name: string;
  route_type: string;
  start_city: string;
  end_city: string;
  length_km: number;
  surface_type: string;
  condition: string;
}

export interface HighwayFeature {
  type: "Feature";
  id: number;
  properties: Highway;
  geometry: { type: "LineString"; coordinates: number[][] };
}

export interface HighwayCollection {
  type: "FeatureCollection";
  features: HighwayFeature[];
}

export interface Junction {
  id: number;
  junction_name: string;
  junction_type: string;
  connected_roads: string[];
  city: string | null;
  facilities: string[];
}

export interface JunctionFeature {
  type: "Feature";
  id: number;
  properties: Junction;
  geometry: { type: "Point"; coordinates: [number, number] };
}

export interface RoadStats {
  motorways: { count: number; lengthKm: number; operational: number };
  highways: { count: number; lengthKm: number };
  totalLengthKm: number;
}

/** Unified road for selection (motorway or highway) */
export type RoadSelection =
  | { type: "motorway"; feature: MotorwayFeature }
  | { type: "highway"; feature: HighwayFeature };
