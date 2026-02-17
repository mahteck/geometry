-- Copy existing data from "fence" table into "fences_master".
-- Does NOT modify or drop the "fence" table (read-only from fence).
-- Run once. If you run again you will get duplicate rows; truncate fences_master first if re-copying.

INSERT INTO fences_master (name, geom)
SELECT
  COALESCE(TRIM(f.name), 'Zone_' || f.id),
  ST_Multi(ST_Force2D(ST_MakeValid(f.geom)))
FROM fence f
WHERE f.geom IS NOT NULL;

-- Trigger on fences_master will set area_size and is_big for each inserted row.
