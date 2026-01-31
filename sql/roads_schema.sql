-- =============================================================================
-- Pakistan Road Network - Database Schema
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- Motorways (M-1, M-2, etc.)
CREATE TABLE IF NOT EXISTS pakistan_motorways (
  id SERIAL PRIMARY KEY,
  motorway_code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(255),
  start_city VARCHAR(100),
  end_city VARCHAR(100),
  length_km DECIMAL(10, 2),
  lanes INTEGER,
  toll_status VARCHAR(20) DEFAULT 'toll',
  status VARCHAR(20) DEFAULT 'operational',
  operator VARCHAR(100),
  geom GEOMETRY(LINESTRING, 4326),
  speed_limit INTEGER,
  year_opened INTEGER,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_motorways_geom ON pakistan_motorways USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_motorways_code ON pakistan_motorways(motorway_code);
CREATE INDEX IF NOT EXISTS idx_motorways_status ON pakistan_motorways(status);

-- National/Provincial Highways (N-5, N-25, etc.)
CREATE TABLE IF NOT EXISTS pakistan_highways (
  id SERIAL PRIMARY KEY,
  highway_code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(255),
  route_type VARCHAR(50) DEFAULT 'national_highway',
  start_city VARCHAR(100),
  end_city VARCHAR(100),
  length_km DECIMAL(10, 2),
  geom GEOMETRY(LINESTRING, 4326),
  surface_type VARCHAR(50),
  condition VARCHAR(20) DEFAULT 'good',
  year_built INTEGER,
  last_maintained INTEGER,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_highways_geom ON pakistan_highways USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_highways_code ON pakistan_highways(highway_code);

-- Intercity Roads
CREATE TABLE IF NOT EXISTS pakistan_intercity_roads (
  id SERIAL PRIMARY KEY,
  road_name VARCHAR(255),
  from_city VARCHAR(100),
  to_city VARCHAR(100),
  distance_km DECIMAL(10, 2),
  road_type VARCHAR(50),
  geom GEOMETRY(LINESTRING, 4326),
  travel_time_minutes INTEGER,
  traffic_level VARCHAR(20),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intercity_roads_geom ON pakistan_intercity_roads USING GIST(geom);

-- Road Junctions
CREATE TABLE IF NOT EXISTS pakistan_road_junctions (
  id SERIAL PRIMARY KEY,
  junction_name VARCHAR(255),
  junction_type VARCHAR(50),
  connected_roads TEXT[],
  geom GEOMETRY(POINT, 4326),
  city VARCHAR(100),
  facilities TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_junctions_geom ON pakistan_road_junctions USING GIST(geom);
