-- Enterprise GIS: cities_master (from OSM planet_osm_point)

CREATE TABLE IF NOT EXISTS cities_master (
  id SERIAL PRIMARY KEY,
  name TEXT,
  place_type TEXT,
  population TEXT,
  geom geometry(Point, 4326)
);

CREATE INDEX IF NOT EXISTS idx_cities_master_geom ON cities_master USING GIST (geom);

COMMENT ON TABLE cities_master IS 'Cities and towns from OSM (place=city, place=town).';
