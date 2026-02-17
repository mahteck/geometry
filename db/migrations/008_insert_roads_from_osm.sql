-- Populate roads_master from planet_osm_line (run only if osm2pgsql schema exists)

INSERT INTO roads_master (name, highway, road_class, geom)
SELECT
  name,
  highway,
  highway AS road_class,
  ST_Multi(ST_Force2D(ST_MakeValid(ST_Transform(way, 4326)))) AS geom
FROM planet_osm_line
WHERE highway IN ('motorway', 'trunk', 'primary', 'secondary')
  AND way IS NOT NULL;

-- To re-import: TRUNCATE roads_master; then run this script again.
