# System & Database Guide

This document explains how the Fence Map and Enterprise GIS Map application works, which database tables are used, their structure, and how data flows from the database to the map.

---

## Overview

The application has two main map experiences:

1. **Map (Fence Map)** – `/map` – Uses the **fence** table. Supports filters, validation (geometry and Pakistan boundary), export, and optional editing.
2. **Enterprise GIS Map** – `/gis-map` – Uses **fences_master** plus **roads_master**, **regions_master**, **cities_master**, **areas_master** for layered display. Fences can be highlighted in red when they are outside or extend outside Pakistan.

Fence data is stored as polygons (or multipolygons) in PostGIS. The Pakistan boundary is built from **pakistan_provinces** (GADM) and used for verification and clipping.

---

## Tables in Use

### fence (legacy / Map page)

- **Used by:** Map page (`/map`), API `/api/fences`, `/api/fences/validate`.
- **Purpose:** Primary fence table for the Fence Map. Not modified by the clip-to-Pakistan script.
- **Typical columns:** `id`, `name`, `geom` (geometry: Polygon or MultiPolygon, SRID 4326), `route_type`, `region`, `address`, `city`, `status` (if present).
- **Geometry:** Stored as PostGIS geometry; API returns GeoJSON. `ST_Dump` is used so MultiPolygons are returned as multiple Polygon features per fence when needed.
- **Config:** Table name can be overridden with `FENCES_TABLE` in `.env.local` (e.g. `fence1` on another database).

### fences_master (Enterprise GIS)

- **Used by:** GIS Map page (`/gis-map`), `/api/gis/fences`, `/api/gis/fences/outside-pakistan`, clip script `clip-fences-to-pakistan.mjs`.
- **Purpose:** Master fence table for the Enterprise GIS Map. Holds MultiPolygon geometries, area, and “big fence” flag. Can be clipped to Pakistan.
- **Columns:**

| Column        | Type               | Description |
|---------------|--------------------|-------------|
| id            | SERIAL PRIMARY KEY | Fence ID.   |
| name          | TEXT NOT NULL      | Fence name. |
| fence_type    | TEXT               | Type (e.g. custom). |
| route_type    | TEXT               | motorway, highway, intracity, other. |
| region_name   | TEXT               | Province/region (e.g. Punjab, Sindh). |
| status        | TEXT DEFAULT 'active' | active / inactive. |
| area_size     | NUMERIC            | Area in m² (set by trigger from geometry). |
| is_big        | BOOLEAN DEFAULT false | Set by trigger from `gis_config.fence_big_threshold_m2`. |
| geom          | geometry(MultiPolygon, 4326) | Fence polygon(s). |
| created_at    | TIMESTAMP          | |
| updated_at    | TIMESTAMP          | |

- **Triggers:** `tr_fences_master_set_derived` – on INSERT/UPDATE: makes geometry valid, sets `area_size` (geography area), sets `is_big` from config threshold, updates `updated_at`.
- **Source:** Populated from `fence` via migrations or sync scripts (e.g. `sync-fence-tables-to-mfm.mjs`).

### roads_master

- **Used by:** GIS Map – `/api/gis/roads`.
- **Purpose:** Major roads from OSM (motorway, trunk, primary, secondary).
- **Columns:** `id`, `name`, `highway`, `road_class`, `geom` (MultiLineString, 4326).
- **Migration:** `002_create_roads_master.sql`.

### regions_master

- **Used by:** GIS Map – `/api/gis/regions`.
- **Purpose:** Administrative boundaries from OSM (`boundary=administrative`).
- **Columns:** `id`, `name`, `admin_level`, `region_type`, `geom` (MultiPolygon, 4326).
- **Migration:** `003_create_regions_master.sql`.

### cities_master

- **Used by:** GIS Map – `/api/gis/cities`.
- **Purpose:** Cities and towns from OSM (`place=city`, `place=town`).
- **Columns:** `id`, `name`, `place_type`, `population`, `geom` (Point, 4326).
- **Migration:** `004_create_cities_master.sql`.

### areas_master

- **Used by:** GIS Map – `/api/gis/areas`.
- **Purpose:** Suburbs, neighbourhoods, localities from OSM.
- **Columns:** `id`, `name`, `place_type`, `geom` (Point, 4326).
- **Migration:** `005_create_areas_master.sql`.

### pakistan_provinces

- **Used by:** Pakistan boundary union for validation and clipping; region classification scripts.
- **Purpose:** Province/territory boundaries (GADM). Union of `geom` = Pakistan boundary.
- **Columns:** `id`, `code`, `name`, `name_urdu`, `geom` (Polygon, 4326), `area_sqkm`, `population`, `capital_city`, etc.
- **Population:** `import-pakistan-geoboundaries.mjs` (GADM ADM1).

### pakistan_districts

- **Purpose:** District boundaries (GADM ADM2). Optional for finer-grained analysis.
- **Population:** `import-pakistan-geoboundaries.mjs`.

### gis_config

- **Purpose:** Key-value config. Used by `fences_master` trigger for `fence_big_threshold_m2` (m² above which a fence is “big”).
- **Migration:** `006_fences_master_triggers_config.sql`.

---

## Data Flow

- **Map page:**  
  URL params → `SearchPanel` → `filterParams` → GET `/api/fences` (bbox, filters) → **fence** table → GeoJSON FeatureCollection → **MapView** (draws polygons).  
  Validation: GET `/api/fences/validate` → **fence** + **pakistan_provinces** (union) → invalid + outside-Pakistan IDs → red highlight and ValidationPanel.

- **GIS Map page:**  
  URL params → `GisFilterPanel` → `filterParams` → GET `/api/gis/fences` (and roads/regions/cities/areas) → **fences_master** (+ other masters) → **GisMapView** (layers).  
  Out-of-bounds: GET `/api/gis/fences/outside-pakistan` → **fences_master** vs Pakistan boundary → red highlight for listed IDs.

- **Scripts:**
  - **sync-fence-tables-to-mfm.mjs:** Copies from source DB (e.g. vehicle_tracking) to target (e.g. mfm_db): fence → fence1, fences_master, pakistan_provinces, etc.
  - **clip-fences-to-pakistan.mjs:** Clips **fences_master** to Pakistan (ST_Intersection with union of pakistan_provinces); sets geom = NULL and region_name = 'Outside Pakistan' for fences entirely outside.
  - **import-pakistan-geoboundaries.mjs:** Fetches GADM GeoJSON, updates **pakistan_provinces** and **pakistan_districts**.

---

## Table vs Page / API

| Table / boundary      | Map page | GIS Map page | APIs |
|-----------------------|----------|--------------|------|
| fence                 | ✓        | —            | /api/fences, /api/fences/validate |
| fences_master         | —        | ✓            | /api/gis/fences, /api/gis/fences/outside-pakistan |
| roads_master          | —        | ✓            | /api/gis/roads |
| regions_master        | —        | ✓            | /api/gis/regions |
| cities_master         | —        | ✓            | /api/gis/cities |
| areas_master          | —        | ✓            | /api/gis/areas |
| pakistan_provinces    | (validation) | (outside-pakistan) | — |
| gis_config            | —        | (trigger)    | — |

---

## Glossary

- **geom:** PostGIS geometry column (e.g. Polygon, MultiPolygon, Point). Stored in SRID 4326 (WGS84).
- **MultiPolygon:** Geometry type for one or more polygons (e.g. one fence with multiple parts).
- **SRID 4326:** WGS84 geographic coordinates (lon/lat).
- **ST_Within(A, B):** True if geometry A is entirely inside B.
- **ST_Intersects(A, B):** True if A and B touch or overlap.
- **ST_Union:** Aggregates geometries into one (e.g. union of all province polygons = Pakistan boundary).
- **ST_SimplifyPreserveTopology(geom, tolerance):** Reduces vertices while keeping topology (Douglas–Peucker style). Optional `simplify` query param on fence APIs uses this for display.
- **ST_NPoints(geom):** Number of vertices; exposed as `pointCount` in validation.

---

## Migrations (source of truth)

Table structures are defined in `db/migrations/`:

- `001_create_fences_master.sql` – fences_master
- `002_create_roads_master.sql` – roads_master
- `003_create_regions_master.sql` – regions_master
- `004_create_cities_master.sql` – cities_master
- `005_create_areas_master.sql` – areas_master
- `006_fences_master_triggers_config.sql` – gis_config, fences_master triggers
- `007_fences_master_audit.sql` – audit table (if present)
- Later migrations (e.g. 012, 013, 014) – copy/backfill and clip-related changes

The **fence** table is not created in these migrations; it is the legacy table in the source database (e.g. vehicle_tracking).
