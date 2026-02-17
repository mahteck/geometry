## Enterprise GIS – Handover Guide

Ye document is project ka **high-level handover** hai, takay koi bhi senior / new developer asaani se setup, data import, aur map pages samajh kar kaam continue kar sakay.

---

### 1. Project overview

- **Tech stack**: Next.js (React), PostgreSQL + PostGIS, Leaflet (map), Node.js scripts.
- **Main map pages**:
  - `/map` – **old map**, directly legacy `fence` table use karta hai.
  - `/gis-map` – **Enterprise GIS map**, nayi master tables use karta hai:
    - `fences_master`
    - `roads_master`
    - `regions_master`
    - `cities_master`
    - `areas_master`
- **Important rule**: Existing table `fence` **ko modify / drop nahi karna**. Naya kaam sirf `*_master` tables par hota hai.

---

### 2. Local setup (code + env)

- Repo clone karein (ya provided zip extract karein) – root folder: `geometry`.
- Node 18+ / npm installed honi chahiye.
- Root mein `.env` file banayen (actual credentials ke sath):

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=geometry
DB_USER=postgres
DB_PASSWORD=******
```

- Dependencies install:

```bash
npm install
```

---

### 3. PostgreSQL / PostGIS setup

1. PostgreSQL database create karein (agar already nahi hai):

```sql
CREATE DATABASE geometry;
```

2. Us DB par PostGIS enable karein:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

3. `.env` mein DB ka naam / user / password theek rakhein (Section 2).

---

### 4. Migrations aur schema

Sab SQL migrations `db/migrations` mein hain. Inhein run karne ke liye:

```bash
npm run db:migrate
```

Ye commands sequentially:

- `fences_master`, `roads_master`, `regions_master`, `cities_master`, `areas_master` create karte hain.
- `fences_master` ke triggers, audit, indexes set karte hain.
- `012_copy_fence_to_fences_master.sql` – **legacy** `fence` table se data copy karta hai (sirf name + geom).
- `013_backfill_fences_master_from_fence.sql` – agar `fence` table mein `route_type` / `region` columns hain to unhe `fences_master.route_type` / `region_name` mein copy karta hai.
- `014_fence_type_default_and_clip_to_pakistan.sql` – `fence_type` ko default `'custom'` set karta hai jahan NULL / blank ho.

Detail explanation ke liye `db/README.md` dekhein.

---

### 5. Pakistan data import (roads / cities / areas / boundaries)

#### 5.1 Base OSM-derived tables

Project `docs/OSM_IMPORT_PAKISTAN.md` mein detailed instructions hain. Current setup:

- **Pakistan master data scripts**:

```bash
npm run setup:pakistan          # support tables (pakistan_provinces, pakistan_districts, pakistan_cities, etc.)
npm run import:pakistan         # main Pakistan data load (roads, cities, areas support)
npm run import:pakistan:boundaries  # provinces/districts ke accurate polygons (GADM se)
```

- `pakistan_provinces.geom` ka use:
  - `fences_master.region_name` classify karne ke liye.
  - Fences ko Pakistan boundary par **clip** karne ke liye (Afghanistan / Srinagar side kaatne).

#### 5.2 PBF direct import (without osm2pgsql)

Is project mein ek script bhi hai jo Pakistan `.osm.pbf` file se directly master tables fill karta hai:

```bash
npm run pbf:import
```

Ye script:

- `pakistan-260215.osm.pbf` (root) ko read karta hai.
- Roads, cities, areas ko `roads_master`, `cities_master`, `areas_master` mein store karta hai.

---

### 6. Fence data cleaning (route_type, region_name, clipping)

#### 6.1 Region classification (`fences_master.region_name`)

- Script:

```bash
npm run classify:fences-master:region
```

- Logic:
  - Har fence ka centroid `pakistan_provinces.geom` ke against `ST_Contains` se match hota hai.
  - `region_name` = actual province name (Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan, Gilgit-Baltistan, Azad Jammu and Kashmir, Islamabad).
  - Jo centroid kisi province mein nahi aata unka `region_name = 'Other'`.

#### 6.2 Route type classification (`fences_master.route_type`)

- Script:

```bash
npm run classify:fences-master:route-type
```

- Logic (name-based heuristics, details `docs/FENCE_ROUTE_TYPE_PLAN.md` mein):
  - `motorway` – names containing Motorway, M-1, M-2, ….
  - `highway` – names containing Highway, National Highway, N-xx, GT Road, etc.
  - `intracity` – shehar ke andar chhote areas (city/town/mandi/sector, area ≤ ~20 km²).
  - `other` – sirf regional/boundary polygons (e.g. Sindh–Punjab boundary).
  - Baaki sab **unclassified (NULL)** rehte hain, jinhein baad mein manually ya new rules se handle kiya ja sakta hai.

#### 6.3 Pakistan boundary clipping (Srinagar / Afghanistan issue)

- Script:

```bash
npm run clip:fences:pakistan
```

- Requirements: `pakistan_provinces` with `geom` (see Section 5).
- Behavior:
  - Jo fences Pakistan se bahar extend kar rahe the unko Pakistan boundary par **clip** karta hai (`ST_Intersection`).
  - Jo fences poori tarah Pakistan se bahar hain:
    - `geom = NULL`
    - `region_name = 'Outside Pakistan'`

---

### 7. Frontend – map pages

- `/gis-map` (Enterprise GIS map):
  - Fences from `fences_master`.
  - Roads, regions, cities, areas from respective master tables.
  - Filters:
    - Search by name.
    - Region dropdown (province name) – `region_name` par filter.
    - Route type filter – `route_type` par.
    - Status (active / inactive).
    - Layer checkboxes: Fences, Roads, Regions, Cities, Areas.
  - Export options:
    - `/api/gis/fences/export?format=geojson|csv|kml`.

- `/map` (legacy map):
  - Directly `fence` table + purane APIs use karta hai.
  - New work ke liye recommend: `/gis-map`.

---

### 8. APIs (quick reference)

Backend APIs Next.js App Router ke andar `app/api/gis/...` folders mein hain. Key endpoints:

- **Fences (master)**  
  - `GET /api/gis/fences` – list + filters (search, region, route_type, status, bbox, limit).  
  - `POST /api/gis/fences` – naya fence create (GeoJSON body).  
  - `GET /api/gis/fences/[id]` – single fence.  
  - `PUT /api/gis/fences/[id]` – update fence.  
  - `DELETE /api/gis/fences/[id]` – soft delete (status change).  
  - `GET /api/gis/fences/export` – export current filter as GeoJSON/CSV/KML.  
  - `GET /api/gis/fences/overlaps` – overlap analysis.

- **Roads / Regions / Cities / Areas (master)**  
  - `GET /api/gis/roads?bbox=...&type=motorway|highway|intracity`  
  - `GET /api/gis/regions?bbox=...`  
  - `GET /api/gis/cities?bbox=...`  
  - `GET /api/gis/areas?bbox=...&limit=2000`

Implementation details ke liye:

- Shared helpers: `lib/masterGis.ts`, `types/masterGis.ts`.
- Map components: `app/gis-map/GisMapPageClient.tsx`, `components/GisMapView.tsx`, `components/GisFilterPanel.tsx`, `components/GisMapLegend.tsx`, `components/GisExportPanel.tsx`.

---

### 9. Data export for sharing with other teams

Agar aapko sirf DB tables + code share karna ho:

- **Code**: poora repo zip karein (without `node_modules`, `.next`, `.env`) – e.g. `geometry-code.zip`.
- **DB dump** (recommended):

```bash
pg_dump -h <DB_HOST> -p <DB_PORT> -U <DB_USER> -d <DB_NAME> ^
  -t fences_master -t roads_master -t regions_master -t cities_master -t areas_master -t pakistan_provinces ^
  -F p -f geometry_master_tables.sql
```

- Receiver simple command se import kar sakta hai:

```bash
psql -h <DB_HOST> -p <DB_PORT> -U <DB_USER> -d <DB_NAME> -f geometry_master_tables.sql
```

CSV export / Excel view ke liye DBeaver / pgAdmin se tables export kiye ja sakte hain.

---

### 10. Next steps / open items

- `regions_master` currently empty unless osm2pgsql imports (migrations 008–011) run kiye gaye hon. Isko future mein Pakistan ADM boundaries se fill kiya ja sakta hai.
- `fence_type` ab default `'custom'` hai – agar business ne specific categories define karni hon (e.g. `geo_fence`, `poi_cluster`, `city_zone`, etc.) to woh enum / controlled values ke sath extend kar sakte hain.
- Route/region classification heuristics improve ki ja sakti hain by:
  - Names clean karna.
  - Naye patterns add karna (`Expressway`, `Ring Road`, etc.).

Is README ko handover package mein include karein takay koi bhi developer quick overview se project samajh sake.

