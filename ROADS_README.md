# Pakistan Road Network

Road network visualization for the Pakistan Map application.

## Setup

1. **Create road tables and load sample data:**
   ```bash
   npm run setup:roads
   ```

2. **Verify setup:**
   - Visit `/pakistan-map` - motorways and highways should appear (green and blue lines)
   - Visit `/pakistan-dashboard` - road statistics should display

## Data

### Motorways (9 routes)
- M-1: Peshawar-Islamabad (155 km)
- M-2: Lahore-Islamabad (367 km)
- M-3: Pindi Bhattian-Faisalabad (55 km)
- M-4: Faisalabad-Multan (233 km)
- M-5: Multan-Sukkur (392 km)
- M-6: Sukkur-Hyderabad (306 km)
- M-8: Gwadar-Ratodero - CPEC (892 km)
- M-9: Karachi-Hyderabad (136 km)
- M-11: Lahore-Sialkot (91 km)

### National Highways (6 routes)
- N-5: Grand Trunk Road (1,819 km)
- N-25: RCD Highway (850 km)
- N-55: Indus Highway (1,264 km)
- N-70: Quetta-Taftan (625 km)
- N-85: Karakoram Highway (806 km)
- N-10: Makran Coastal Highway (653 km)

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| GET /api/pakistan/motorways | GeoJSON of motorways. Params: ?status=operational&code=M-2 |
| GET /api/pakistan/highways | GeoJSON of highways. Params: ?type=national_highway |
| GET /api/pakistan/roads/stats | Road network statistics |

## Adding More Roads

Edit `sql/roads_sample_data.sql` and add INSERT statements. For geometry, use `ST_GeomFromText('LINESTRING(lng1 lat1, lng2 lat2, ...)', 4326)` with WGS84 coordinates.

Example:
```sql
INSERT INTO pakistan_motorways (motorway_code, name, start_city, end_city, length_km, lanes, status, geom)
VALUES ('M-12', 'New Motorway', 'CityA', 'CityB', 100, 4, 'operational',
  ST_GeomFromText('LINESTRING(73.0 31.5, 72.5 32.0)', 4326))
ON CONFLICT (motorway_code) DO NOTHING;
```

## Map Layers

- **Motorways**: Green (#10b981), 4px width
- **Highways**: Blue (#3b82f6), 3px width
- Toggle in sidebar under "Road Networks"
