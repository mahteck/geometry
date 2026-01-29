/**
 * GeoJSON types for PostGIS fence polygons (cherat_fences)
 */

export type GeoJSONPoint = number[];
export type GeoJSONLinearRing = GeoJSONPoint[];
export type GeoJSONPolygonCoords = GeoJSONLinearRing[];
export type GeoJSONMultiPolygonCoords = GeoJSONPolygonCoords[];

export interface GeoJSONGeometry {
  type: "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon";
  coordinates: number[] | number[][] | GeoJSONPolygonCoords | GeoJSONMultiPolygonCoords;
}

export interface GeoJSONFeature<G = GeoJSONGeometry, P = GeoJSONFeatureProperties> {
  type: "Feature";
  id?: number;
  properties: P;
  geometry: G;
}

export interface GeoJSONFeatureProperties {
  name?: string;
  [key: string]: unknown;
}

export interface GeoJSONFeatureCollection<F = GeoJSONFeature> {
  type: "FeatureCollection";
  features: F[];
}

export interface FenceFeature extends GeoJSONFeature {
  id: number;
  properties: {
    name: string;
    address?: string | null;
    city?: string | null;
  };
}
