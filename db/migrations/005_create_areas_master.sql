-- Enterprise GIS: areas_master (from OSM planet_osm_point)

CREATE TABLE IF NOT EXISTS areas_master (
  id SERIAL PRIMARY KEY,
  name TEXT,
  place_type TEXT,
  geom geometry(Point, 4326)
);

CREATE INDEX IF NOT EXISTS idx_areas_master_geom ON areas_master USING GIST (geom);

COMMENT ON TABLE areas_master IS 'Suburbs, neighbourhoods, localities from OSM.';
