# Database migrations – Enterprise GIS

**Important:** Do not modify or drop the existing table `fence`. All new objects use separate tables.

## Data sources (data kahan se aata hai)

| Layer | Source | Notes |
|-------|--------|--------|
| **Fences** (`fences_master`) | Your existing **`fence`** table (migration 012 copies once) | Geofences/zones OSM mein nahi hote – ye aapka business data hai. Pakistan OSM file se fences nahi aate. |
| **Roads, regions, cities, areas** | **OpenStreetMap** – [Pakistan extract](https://download.geofabrik.de/asia/pakistan.html) (`pakistan-latest.osm.pbf`) | Pehle is PBF ko **osm2pgsql** se DB mein import karein → `planet_osm_line`, `planet_osm_point`, `planet_osm_polygon` banenge. Phir migrations **008–011** chalane se `roads_master`, `regions_master`, `cities_master`, `areas_master` bharenge. |

**Summary:** Fences = aapki existing `fence` table (012 copy). Roads/regions/cities/areas = Pakistan OSM (Geofabrik PBF → osm2pgsql → 008–011).

## Order of execution

Run in numeric order (001 → 011):

1. **001_create_fences_master.sql** – Fence polygons (MultiPolygon, area_size, is_big, indexes).
2. **002_create_roads_master.sql** – Roads from OSM (MultiLineString).
3. **003_create_regions_master.sql** – Administrative boundaries (MultiPolygon).
4. **004_create_cities_master.sql** – Cities/towns (Point).
5. **005_create_areas_master.sql** – Suburbs/neighbourhoods/localities (Point).
6. **006_fences_master_triggers_config.sql** – `gis_config` table, trigger to set `area_size`, `is_big`, `updated_at`.
7. **007_fences_master_audit.sql** – Audit table and trigger for fence changes.
8. **012_copy_fence_to_fences_master.sql** – One-time copy from existing `fence` table into `fences_master` (so GIS map has data). Does not modify `fence`. Run once; if re-running, truncate `fences_master` first.
9. **008–011** – Optional: populate master tables from OSM (`planet_osm_line`, `planet_osm_polygon`, `planet_osm_point`). Run only if you have osm2pgsql schema. To re-import, truncate the target table first.

## Big-fence threshold

Default: 50 km² (50_000_000 m²). Stored in `gis_config`:

```sql
UPDATE gis_config SET value = 50000000 WHERE key = 'fence_big_threshold_m2';
```

## APIs

- **Fences:** `GET/POST /api/gis/fences`, `GET/PUT/DELETE /api/gis/fences/[id]`, `GET /api/gis/fences/export?format=geojson|csv|kml`, `GET /api/gis/fences/overlaps`
- **Roads:** `GET /api/gis/roads?type=motorway&bbox=...`
- **Regions:** `GET /api/gis/regions?bbox=...`
- **Cities:** `GET /api/gis/cities?bbox=...`
- **Areas:** `GET /api/gis/areas?bbox=...&limit=2000`

## Frontend

- **Full GIS map:** `/gis-map` – Fences (blue/grey, big=thick), roads (red/orange/yellow), regions (purple border), cities (black circle), areas (grey marker). Filters, export, layer toggles.
