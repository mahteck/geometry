-- =============================================================================
-- Pakistan Geolocation Database Setup
-- =============================================================================
-- Data source: PK/ folder (GeoNames format - see PK/readme.txt)
-- Run: psql -U <user> -d vehicle_tracking -f sql/setup_pakistan_geo.sql
-- Or execute via Node script: npm run import:pakistan
-- =============================================================================

-- Enable PostGIS if not already
CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================================================================
-- 1. PROVINCES TABLE
-- =============================================================================
DROP TABLE IF EXISTS pakistan_provinces CASCADE;
CREATE TABLE pakistan_provinces (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  name_urdu VARCHAR(100),
  geom GEOMETRY(POLYGON, 4326),
  area_sqkm DECIMAL(12, 2),
  population BIGINT,
  capital_city VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE pakistan_provinces IS 'Pakistan provinces/territories - 7 total (Punjab, Sindh, KPK, Balochistan, Gilgit-Baltistan, AJK, Islamabad)';

-- =============================================================================
-- 2. DISTRICTS TABLE
-- =============================================================================
DROP TABLE IF EXISTS pakistan_districts CASCADE;
CREATE TABLE pakistan_districts (
  id SERIAL PRIMARY KEY,
  geonameid INTEGER UNIQUE,
  name VARCHAR(150) NOT NULL,
  province_code VARCHAR(10) NOT NULL,
  geom GEOMETRY(POLYGON, 4326),
  area_sqkm DECIMAL(12, 2),
  population BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_province FOREIGN KEY (province_code) REFERENCES pakistan_provinces(code) ON DELETE CASCADE
);

COMMENT ON TABLE pakistan_districts IS 'Pakistan districts - populated from GeoNames ADM2 records and city convex hulls';

-- =============================================================================
-- 3. CITIES TABLE
-- =============================================================================
DROP TABLE IF EXISTS pakistan_cities CASCADE;
CREATE TABLE pakistan_cities (
  id SERIAL PRIMARY KEY,
  geonameid INTEGER UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  name_alternate VARCHAR(500),
  province_code VARCHAR(10),
  district_name VARCHAR(150),
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  population BIGINT DEFAULT 0,
  elevation INTEGER,
  geom GEOMETRY(POINT, 4326),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE pakistan_cities IS 'Pakistan cities/villages from GeoNames PK.txt (feature_class P)';

-- =============================================================================
-- 4. PROVINCE CODE MAPPING (for reference - Pakistan admin1 FIPS codes)
-- =============================================================================
-- 01: Gilgit-Baltistan (Northern Areas)
-- 02: Balochistan
-- 03: Khyber Pakhtunkhwa
-- 04: Punjab
-- 05: Sindh
-- 06: Azad Jammu and Kashmir
-- 07: Islamabad (ICT) - sometimes 08 in older data
-- 08: Islamabad/FATA - varies by GeoNames version

-- Insert province master data (codes and names - geometry filled by import script)
INSERT INTO pakistan_provinces (code, name, name_urdu, area_sqkm, population, capital_city) VALUES
  ('01', 'Gilgit-Baltistan', 'گلگت بلتستان', 72971, 1500000, 'Gilgit'),
  ('02', 'Balochistan', 'بلوچستان', 347190, 12344000, 'Quetta'),
  ('03', 'Khyber Pakhtunkhwa', 'خیبر پختونخوا', 101741, 35523000, 'Peshawar'),
  ('04', 'Punjab', 'پنجاب', 205344, 110012442, 'Lahore'),
  ('05', 'Sindh', 'سندھ', 140914, 47886000, 'Karachi'),
  ('06', 'Azad Jammu and Kashmir', 'آزاد کشمیر', 13297, 4045366, 'Muzaffarabad'),
  ('07', 'Islamabad', 'اسلام آباد', 906, 1009832, 'Islamabad'),
  ('08', 'Islamabad', 'اسلام آباد', 906, 1009832, 'Islamabad')
;

-- =============================================================================
-- 5. SPATIAL INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_provinces_geom ON pakistan_provinces USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_provinces_name ON pakistan_provinces (name);
CREATE INDEX IF NOT EXISTS idx_provinces_code ON pakistan_provinces (code);

CREATE INDEX IF NOT EXISTS idx_districts_geom ON pakistan_districts USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_districts_name ON pakistan_districts (name);
CREATE INDEX IF NOT EXISTS idx_districts_province ON pakistan_districts (province_code);

CREATE INDEX IF NOT EXISTS idx_cities_geom ON pakistan_cities USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_cities_name ON pakistan_cities (name);
CREATE INDEX IF NOT EXISTS idx_cities_province ON pakistan_cities (province_code);
CREATE INDEX IF NOT EXISTS idx_cities_geonameid ON pakistan_cities (geonameid);
CREATE INDEX IF NOT EXISTS idx_cities_population ON pakistan_cities (population DESC) WHERE population > 0;

-- =============================================================================
-- 6. SAMPLE VERIFICATION QUERIES
-- =============================================================================
-- Run these after import to verify:
--
-- SELECT code, name, ST_AsText(ST_Centroid(geom)) as center FROM pakistan_provinces;
-- SELECT province_code, COUNT(*) FROM pakistan_cities GROUP BY province_code;
-- SELECT * FROM pakistan_cities WHERE population > 100000 ORDER BY population DESC LIMIT 10;
-- SELECT COUNT(*), SUM(population) FROM pakistan_cities;
