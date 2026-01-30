/**
 * Type declarations for leaflet-measure (L.control.measure)
 */
/// <reference types="leaflet" />

export interface MeasureResult {
  area: number;
  areaDisplay: string;
  length: number;
  lengthDisplay: string;
  lastCoord: unknown;
  pointCount: number;
  points: L.LatLng[];
}

export interface LeafletMeasureOptions {
  position?: L.ControlPosition;
  primaryLengthUnit?: "feet" | "meters" | "miles" | "kilometers";
  secondaryLengthUnit?: "feet" | "meters" | "miles" | "kilometers";
  primaryAreaUnit?: "acres" | "hectares" | "sqfeet" | "sqmeters" | "sqmiles" | string;
  secondaryAreaUnit?: "acres" | "hectares" | "sqfeet" | "sqmeters" | "sqmiles" | string;
  activeColor?: string;
  completedColor?: string;
  popupOptions?: L.PopupOptions;
  captureZIndex?: number;
  decPoint?: string;
  thousandsSep?: string;
  units?: Record<string, { factor: number; display: string; decimals?: number }>;
}

declare module "leaflet" {
  namespace control {
    function measure(options?: LeafletMeasureOptions): L.Control;
  }
}
