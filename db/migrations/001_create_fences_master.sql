-- Enterprise GIS: fences_master
-- DO NOT modify existing table "fence". This is a new table.

CREATE TABLE IF NOT EXISTS fences_master (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  fence_type TEXT,
  route_type TEXT,
  region_name TEXT,
  status TEXT DEFAULT 'active',
  area_size NUMERIC,
  is_big BOOLEAN DEFAULT false,
  geom geometry(MultiPolygon, 4326),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fences_master_geom ON fences_master USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_fences_master_name ON fences_master (name);
CREATE INDEX IF NOT EXISTS idx_fences_master_status ON fences_master (status);
CREATE INDEX IF NOT EXISTS idx_fences_master_route_type ON fences_master (route_type);
CREATE INDEX IF NOT EXISTS idx_fences_master_region_name ON fences_master (region_name);

COMMENT ON TABLE fences_master IS 'Master fence polygons; area_size in m² (geography); is_big set by trigger from config.';
