# Pakistan Map - Geolocation System

A complete Pakistan administrative boundaries and cities visualization system built with Next.js, PostgreSQL/PostGIS, and Leaflet.

## Features

- **Provinces**: 7 provinces with polygon boundaries and distinct colors
- **Districts**: ~150 districts with polygon boundaries
- **Cities**: ~150,000+ populated places (cities, villages) as point markers
- **Interactive Map**: Province/district polygons with popups, city search, layer toggles
- **Export**: GeoJSON and CSV export

## Data Source

- **Location**: `PK1/` (updated) or `PK/` folder in project root
- **Format**: GeoNames tab-delimited (see `PK/readme.txt`)
- **Files**: `PK1/PK.txt` (preferred) or `PK/PK.txt` - Pakistan country extract from GeoNames
- **No download needed** - use local data only

## Setup

### 1. Database Setup

Ensure PostgreSQL 16+ with PostGIS 3.4+ is running. Create tables and province seed data:

```bash
# Using psql (adjust -U and -d for your setup)
psql -U grafana_user -d vehicle_tracking -f sql/setup_pakistan_geo.sql
```

Or with connection string:

```bash
psql postgresql://user:pass@host:port/vehicle_tracking -f sql/setup_pakistan_geo.sql
```

### 2. Environment

Ensure `.env.local` has database connection (copy from `.env.local.example`):

```
DB_HOST=...
DB_PORT=5432
DB_NAME=vehicle_tracking
DB_USER=...
DB_PASSWORD=...
```

### 3. Import Data

**Option A – Recommended (accurate coordinates):**
```bash
npm run import:pakistan:boundaries   # GADM provinces & districts
npm run import:pakistan:osm          # OSM cities (Overpass API)
```

**Option B – GeoNames (max coverage, with Pakistan bbox filter):**
```bash
# Place PK1/PK.txt or PK/PK.txt first
npm run import:pakistan
```

GeoNames import now excludes points outside Pakistan (60.87–77.84°E, 23.69–37.08°N). For accurate boundaries, run `import:pakistan:boundaries` after to overlay GADM polygons.

### 4. Run Application

```bash
npm run dev
```

Navigate to **http://localhost:3000/pakistan-map**

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pakistan/provinces` | GET | GeoJSON FeatureCollection of provinces |
| `/api/pakistan/districts` | GET | GeoJSON FeatureCollection of districts. Query: `?province=04` |
| `/api/pakistan/cities` | GET | GeoJSON FeatureCollection of cities. Query: `?search=Karachi&province=05&limit=100` |
| `/api/pakistan/stats` | GET | Statistics: counts, population by province |

### Example Usage

```bash
# All provinces
curl http://localhost:3000/api/pakistan/provinces

# Districts in Punjab (code 04)
curl "http://localhost:3000/api/pakistan/districts?province=04"

# Search cities
curl "http://localhost:3000/api/pakistan/cities?search=Karachi&limit=20"
```

## Component Documentation

### PakistanMap
Main map component. Renders provinces, districts, and cities as separate Leaflet layers.
- Each province = separate `<Polygon>`
- Each district = separate `<Polygon>`
- Cities = `<CircleMarker>` (size by population)

### PakistanSidebar
Left panel with layer toggles, province filter, city search, stats, and export.

### PakistanStats
Displays total provinces, districts, cities, and population by province.

### PakistanLegend
Color legend for provinces.

## Database Schema

### pakistan_provinces
| Column | Type |
|--------|------|
| id | SERIAL PRIMARY KEY |
| code | VARCHAR (e.g. '04' Punjab) |
| name | VARCHAR |
| name_urdu | VARCHAR |
| geom | GEOMETRY(POLYGON, 4326) |
| area_sqkm | DECIMAL |
| population | BIGINT |
| capital_city | VARCHAR |

### pakistan_districts
| Column | Type |
|--------|------|
| id | SERIAL PRIMARY KEY |
| name | VARCHAR |
| province_code | VARCHAR (FK) |
| geom | GEOMETRY(POLYGON, 4326) |
| area_sqkm | DECIMAL |
| population | BIGINT |

### pakistan_cities
| Column | Type |
|--------|------|
| id | SERIAL PRIMARY KEY |
| geonameid | INTEGER UNIQUE |
| name | VARCHAR |
| province_code | VARCHAR |
| district_name | VARCHAR |
| latitude, longitude | DECIMAL |
| population | BIGINT |
| geom | GEOMETRY(POINT, 4326) |

## Province Color Scheme

| Code | Province | Color |
|------|----------|-------|
| 01 | Gilgit-Baltistan | Purple |
| 02 | Balochistan | Yellow |
| 03 | Khyber Pakhtunkhwa | Orange |
| 04 | Punjab | Green |
| 05 | Sindh | Blue |
| 06 | Azad Kashmir | Pink |
| 07 | Islamabad | Red |

## Troubleshooting

### "Database tables not found"
Run the SQL setup first: `psql -d vehicle_tracking -f sql/setup_pakistan_geo.sql`

### "Data file not found"
Ensure `PK1/PK.txt` or `PK/PK.txt` exists (GeoNames Pakistan dump). PK1 is preferred for updated data.

### No province polygons displayed
The import script builds polygons from city convex hulls. Ensure cities were imported successfully. Check: `SELECT COUNT(*) FROM pakistan_cities;`

### Empty map
1. Verify API responses: `curl http://localhost:3000/api/pakistan/provinces`
2. Check browser console for errors
3. Ensure PostGIS is enabled: `SELECT PostGIS_Version();`

### Import takes long
The PK.txt has ~230k records. Import typically takes 1-3 minutes. Progress is logged to console.
