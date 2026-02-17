-- Populate areas_master from planet_osm_point (run only if osm2pgsql schema exists)

INSERT INTO areas_master (name, place_type, geom)
SELECT
  name,
  place,
  ST_Transform(way, 4326)
FROM planet_osm_point
WHERE place IN ('suburb', 'neighbourhood', 'locality')
  AND way IS NOT NULL;

-- To re-import: TRUNCATE areas_master; then run this script again.
