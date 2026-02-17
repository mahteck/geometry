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
    /** lahore | karachi | islamabad | other – from DB or derived from name/city */
    region?: string | null;
    /** active | inactive – used for styling (green vs gray) */
    status?: string | null;
    /** motorway | highway | intracity | other – used for route-type styling and filters */
    routeType?: string | null;
    [key: string]: unknown;
  };
}

/** Request body for creating a fence (POST /api/fences) */
export interface CreateFenceBody {
  name?: string;
  geometry: GeoJSONGeometry;
}

/** Request body for updating a fence (PUT /api/fences/[id]) */
export interface UpdateFenceBody {
  name?: string;
  geometry: GeoJSONGeometry;
}

/** API response for single fence create/update */
export interface FenceApiResponse {
  id: number;
  name: string;
  geometry: GeoJSONGeometry;
}
