-- Config for big-fence threshold (m²). Default 50 km² = 50_000_000
CREATE TABLE IF NOT EXISTS gis_config (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL
);
INSERT INTO gis_config (key, value) VALUES ('fence_big_threshold_m2', 50000000)
ON CONFLICT (key) DO NOTHING;

-- Auto-set area_size, is_big, updated_at on insert/update
CREATE OR REPLACE FUNCTION fences_master_set_derived()
RETURNS TRIGGER AS $$
DECLARE
  area_m2 NUMERIC;
  thresh NUMERIC;
BEGIN
  IF NEW.geom IS NOT NULL THEN
    NEW.geom := ST_Force2D(ST_MakeValid(ST_Multi(NEW.geom)));
    SELECT ST_Area(NEW.geom::geography) INTO area_m2;
    NEW.area_size := area_m2;
    SELECT COALESCE((SELECT value FROM gis_config WHERE key = 'fence_big_threshold_m2'), 50000000) INTO thresh;
    NEW.is_big := (area_m2 IS NOT NULL AND area_m2 > thresh);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_fences_master_set_derived ON fences_master;
CREATE TRIGGER tr_fences_master_set_derived
  BEFORE INSERT OR UPDATE ON fences_master
  FOR EACH ROW EXECUTE PROCEDURE fences_master_set_derived();
