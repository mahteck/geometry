/**
 * TypeScript interfaces for Pakistan geolocation system.
 * Matches GeoJSON FeatureCollection structure from API responses.
 */

// ─── Province ───────────────────────────────────────────────────────────────

export interface Province {
  id: number;
  code: string;
  name: string;
  nameUrdu: string;
  area: number;
  population: number;
  capital: string;
}

export interface ProvinceFeature {
  type: "Feature";
  id: number;
  properties: Province;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface ProvinceCollection {
  type: "FeatureCollection";
  features: ProvinceFeature[];
}

// ─── District ───────────────────────────────────────────────────────────────

export interface District {
  id: number;
  name: string;
  provinceCode: string;
  area: number;
  population: number;
}

export interface DistrictFeature {
  type: "Feature";
  id: number;
  properties: District;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface DistrictCollection {
  type: "FeatureCollection";
  features: DistrictFeature[];
}

// ─── City ───────────────────────────────────────────────────────────────────

export interface City {
  id: number;
  geonameid: number;
  name: string;
  nameAlternate: string;
  provinceCode: string;
  districtName: string;
  latitude: number;
  longitude: number;
  population: number;
  elevation: number;
}

export interface CityFeature {
  type: "Feature";
  id: number;
  properties: City;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
}

export interface CityCollection {
  type: "FeatureCollection";
  features: CityFeature[];
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export interface PakistanStats {
  provinces: number;
  districts: number;
  cities: number;
  populationByProvince: { code: string; name: string; population: number }[];
  totalArea: number;
}
