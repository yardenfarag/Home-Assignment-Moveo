-- =============================================================================
-- Seed: 36 hubs (major US metros). Location = city-center point.
-- Region = official US Census Bureau region.
-- To add a hub later: insert one more row — the nightly ingest picks it up.
-- =============================================================================
insert into public.hubs (id, name, state, region, latitude, longitude, timezone) values
  -- Midwest
  ('chicago',        'Chicago',        'IL', 'Midwest',   41.87810,  -87.62980, 'America/Chicago'),
  ('detroit',        'Detroit',        'MI', 'Midwest',   42.33140,  -83.04580, 'America/Detroit'),
  ('minneapolis',    'Minneapolis',    'MN', 'Midwest',   44.97780,  -93.26500, 'America/Chicago'),
  ('indianapolis',   'Indianapolis',   'IN', 'Midwest',   39.76840,  -86.15810, 'America/Indiana/Indianapolis'),
  ('columbus',       'Columbus',       'OH', 'Midwest',   39.96120,  -82.99880, 'America/New_York'),
  ('cincinnati',     'Cincinnati',     'OH', 'Midwest',   39.10310,  -84.51200, 'America/New_York'),
  ('kansas-city',    'Kansas City',    'MO', 'Midwest',   39.09970,  -94.57860, 'America/Chicago'),
  ('st-louis',       'St. Louis',      'MO', 'Midwest',   38.62700,  -90.19940, 'America/Chicago'),
  ('milwaukee',      'Milwaukee',      'WI', 'Midwest',   43.03890,  -87.90650, 'America/Chicago'),
  ('omaha',          'Omaha',          'NE', 'Midwest',   41.25650,  -95.93450, 'America/Chicago'),
  -- South
  ('dallas',         'Dallas',         'TX', 'South',     32.77670,  -96.79700, 'America/Chicago'),
  ('houston',        'Houston',        'TX', 'South',     29.76040,  -95.36980, 'America/Chicago'),
  ('san-antonio',    'San Antonio',    'TX', 'South',     29.42410,  -98.49360, 'America/Chicago'),
  ('oklahoma-city',  'Oklahoma City',  'OK', 'South',     35.46760,  -97.51640, 'America/Chicago'),
  ('atlanta',        'Atlanta',        'GA', 'South',     33.74900,  -84.38800, 'America/New_York'),
  ('miami',          'Miami',          'FL', 'South',     25.76170,  -80.19180, 'America/New_York'),
  ('tampa',          'Tampa',          'FL', 'South',     27.95060,  -82.45720, 'America/New_York'),
  ('orlando',        'Orlando',        'FL', 'South',     28.53830,  -81.37920, 'America/New_York'),
  ('jacksonville',   'Jacksonville',   'FL', 'South',     30.33220,  -81.65570, 'America/New_York'),
  ('charlotte',      'Charlotte',      'NC', 'South',     35.22710,  -80.84310, 'America/New_York'),
  ('nashville',      'Nashville',      'TN', 'South',     36.16270,  -86.78160, 'America/Chicago'),
  ('memphis',        'Memphis',        'TN', 'South',     35.14950,  -90.04900, 'America/Chicago'),
  ('new-orleans',    'New Orleans',    'LA', 'South',     29.95110,  -90.07150, 'America/Chicago'),
  -- Northeast
  ('new-york',       'New York',       'NY', 'Northeast', 40.71280,  -74.00600, 'America/New_York'),
  ('boston',         'Boston',         'MA', 'Northeast', 42.36010,  -71.05890, 'America/New_York'),
  ('philadelphia',   'Philadelphia',   'PA', 'Northeast', 39.95260,  -75.16520, 'America/New_York'),
  ('pittsburgh',     'Pittsburgh',     'PA', 'Northeast', 40.44060,  -79.99590, 'America/New_York'),
  -- West
  ('denver',         'Denver',         'CO', 'West',      39.73920, -104.99030, 'America/Denver'),
  ('phoenix',        'Phoenix',        'AZ', 'West',      33.44840, -112.07400, 'America/Phoenix'),
  ('salt-lake-city', 'Salt Lake City', 'UT', 'West',      40.76080, -111.89100, 'America/Denver'),
  ('las-vegas',      'Las Vegas',      'NV', 'West',      36.16990, -115.13980, 'America/Los_Angeles'),
  ('albuquerque',    'Albuquerque',    'NM', 'West',      35.08440, -106.65040, 'America/Denver'),
  ('los-angeles',    'Los Angeles',    'CA', 'West',      34.05220, -118.24370, 'America/Los_Angeles'),
  ('san-francisco',  'San Francisco',  'CA', 'West',      37.77490, -122.41940, 'America/Los_Angeles'),
  ('seattle',        'Seattle',        'WA', 'West',      47.60620, -122.33210, 'America/Los_Angeles'),
  ('portland',       'Portland',       'OR', 'West',      45.51520, -122.67840, 'America/Los_Angeles');
