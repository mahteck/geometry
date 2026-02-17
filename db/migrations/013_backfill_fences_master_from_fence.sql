-- Backfill fences_master.route_type and fences_master.region_name from fence table (by name match).
-- Run after 012. Does not modify table "fence".
-- If "fence" has no route_type/region columns, the UPDATEs simply affect 0 rows.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fence' AND column_name = 'route_type') THEN
    UPDATE fences_master fm
    SET route_type = f.route_type
    FROM fence f
    WHERE TRIM(COALESCE(fm.name, '')) = TRIM(COALESCE(f.name, ''))
      AND f.route_type IS NOT NULL AND TRIM(f.route_type) <> '';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fence' AND column_name = 'region') THEN
    UPDATE fences_master fm
    SET region_name = f.region
    FROM fence f
    WHERE TRIM(COALESCE(fm.name, '')) = TRIM(COALESCE(f.name, ''))
      AND f.region IS NOT NULL AND TRIM(f.region) <> '';
  END IF;
END;
$$;
