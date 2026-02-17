-- Populate regions_master from planet_osm_polygon (run only if osm2pgsql schema exists)

INSERT INTO regions_master (name, admin_level, region_type, geom)
SELECT
  name,
  admin_level::TEXT,
  CASE
    WHEN admin_level = '2' THEN 'country'
    WHEN admin_level IN ('3','4') THEN 'province'
    WHEN admin_level IN ('5','6') THEN 'division'
    WHEN admin_level IN ('7','8') THEN 'district'
    ELSE 'other'
  END,
  ST_Multi(ST_Force2D(ST_MakeValid(ST_Transform(way, 4326))))
FROM planet_osm_polygon
WHERE boundary = 'administrative'
  AND way IS NOT NULL;

-- To re-import: TRUNCATE regions_master; then run this script again.
