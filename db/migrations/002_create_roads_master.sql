-- Enterprise GIS: roads_master (from OSM planet_osm_line)

CREATE TABLE IF NOT EXISTS roads_master (
  id SERIAL PRIMARY KEY,
  name TEXT,
  highway TEXT,
  road_class TEXT,
  geom geometry(MultiLineString, 4326)
);

CREATE INDEX IF NOT EXISTS idx_roads_master_geom ON roads_master USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_roads_master_highway ON roads_master (highway);

COMMENT ON TABLE roads_master IS 'Major roads from OSM: motorway, trunk, primary, secondary.';
