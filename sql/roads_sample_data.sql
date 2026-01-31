-- =============================================================================
-- Pakistan Road Network - Sample Data
-- Motorways and Major National Highways with approximate coordinates
-- =============================================================================

-- Motorways (approximate center-line coordinates)
INSERT INTO pakistan_motorways (motorway_code, name, start_city, end_city, length_km, lanes, toll_status, status, operator, geom, speed_limit) VALUES
('M-1', 'Peshawar-Islamabad Motorway', 'Peshawar', 'Islamabad', 155, 6, 'toll', 'operational', 'NHA',
 ST_GeomFromText('LINESTRING(71.5578 33.9851, 72.0677 33.6427, 72.7699 33.6844)', 4326), 120),
('M-2', 'Lahore-Islamabad Motorway', 'Lahore', 'Islamabad', 367, 6, 'toll', 'operational', 'NHA',
 ST_GeomFromText('LINESTRING(74.3587 31.5204, 73.7191 32.0752, 73.0479 33.6844)', 4326), 120),
('M-3', 'Pindi Bhattian-Faisalabad Motorway', 'Pindi Bhattian', 'Faisalabad', 55, 4, 'toll', 'operational', 'NHA',
 ST_GeomFromText('LINESTRING(72.7699 31.8974, 73.0895 31.4167)', 4326), 120),
('M-4', 'Faisalabad-Multan Motorway', 'Faisalabad', 'Multan', 233, 4, 'toll', 'operational', 'NHA',
 ST_GeomFromText('LINESTRING(73.0895 31.4167, 71.4782 30.1985)', 4326), 120),
('M-5', 'Multan-Sukkur Motorway', 'Multan', 'Sukkur', 392, 6, 'toll', 'operational', 'NHA',
 ST_GeomFromText('LINESTRING(71.4782 30.1985, 68.8484 27.7032)', 4326), 120),
('M-6', 'Sukkur-Hyderabad Motorway', 'Sukkur', 'Hyderabad', 306, 6, 'toll', 'operational', 'NHA',
 ST_GeomFromText('LINESTRING(68.8484 27.7032, 68.3578 25.3960)', 4326), 120),
('M-8', 'Gwadar-Ratodero Motorway', 'Gwadar', 'Ratodero', 892, 4, 'free', 'operational', 'NHA',
 ST_GeomFromText('LINESTRING(62.3292 25.1216, 64.3657 28.2608, 68.2511 28.0337)', 4326), 100),
('M-9', 'Karachi-Hyderabad Motorway', 'Karachi', 'Hyderabad', 136, 6, 'toll', 'operational', 'NHA',
 ST_GeomFromText('LINESTRING(67.0822 24.8607, 68.3578 25.3960)', 4326), 120),
('M-11', 'Lahore-Sialkot Motorway', 'Lahore', 'Sialkot', 91, 4, 'toll', 'operational', 'NHA',
 ST_GeomFromText('LINESTRING(74.3587 31.5204, 74.5682 32.4433)', 4326), 120)
ON CONFLICT (motorway_code) DO NOTHING;

-- National Highways
INSERT INTO pakistan_highways (highway_code, name, route_type, start_city, end_city, length_km, geom, surface_type, condition) VALUES
('N-5', 'Grand Trunk Road', 'national_highway', 'Karachi', 'Torkham', 1819,
 ST_GeomFromText('LINESTRING(67.0822 24.8607, 68.3578 25.3960, 68.8484 27.7032, 71.4782 30.1985, 74.3587 31.5204, 71.5578 33.9851)', 4326), 'paved', 'good'),
('N-25', 'RCD Highway', 'national_highway', 'Karachi', 'Chaman', 850,
 ST_GeomFromText('LINESTRING(67.0822 24.8607, 66.7620 30.1746, 66.3195 31.0115)', 4326), 'paved', 'fair'),
('N-55', 'Indus Highway', 'national_highway', 'Peshawar', 'Karachi', 1264,
 ST_GeomFromText('LINESTRING(71.5578 33.9851, 72.0677 33.6427, 71.4782 30.1985, 67.0822 24.8607)', 4326), 'paved', 'fair'),
('N-70', 'Quetta-Taftan Highway', 'national_highway', 'Quetta', 'Taftan', 625,
 ST_GeomFromText('LINESTRING(66.7620 30.1746, 64.3657 29.5570)', 4326), 'paved', 'fair'),
('N-85', 'Karakoram Highway', 'national_highway', 'Hasan Abdal', 'Khunjerab', 806,
 ST_GeomFromText('LINESTRING(72.6844 33.8181, 73.0479 33.6844, 73.1094 34.7500)', 4326), 'paved', 'good'),
('N-10', 'Makran Coastal Highway', 'national_highway', 'Karachi', 'Gwadar', 653,
 ST_GeomFromText('LINESTRING(67.0822 24.8607, 64.3657 28.2608, 62.3292 25.1216)', 4326), 'paved', 'good')
ON CONFLICT (highway_code) DO NOTHING;
