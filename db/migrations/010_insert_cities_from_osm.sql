-- Populate cities_master from planet_osm_point (run only if osm2pgsql schema exists)

INSERT INTO cities_master (name, place_type, population, geom)
SELECT
  name,
  place,
  population::TEXT,
  ST_Transform(way, 4326)
FROM planet_osm_point
WHERE place IN ('city', 'town')
  AND way IS NOT NULL;

-- To re-import: TRUNCATE cities_master; then run this script again.
