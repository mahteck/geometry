-- Enterprise GIS: regions_master (from OSM planet_osm_polygon)

CREATE TABLE IF NOT EXISTS regions_master (
  id SERIAL PRIMARY KEY,
  name TEXT,
  admin_level TEXT,
  region_type TEXT,
  geom geometry(MultiPolygon, 4326)
);

CREATE INDEX IF NOT EXISTS idx_regions_master_geom ON regions_master USING GIST (geom);

COMMENT ON TABLE regions_master IS 'Administrative boundaries from OSM (boundary=administrative).';
