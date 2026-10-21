-- flight-sweep D1 schema (T514). Apply once:
--   npx wrangler d1 execute carta_flights --remote --file workers/flight-sweep/schema.sql

-- The cheapest flight per route and day; price NULL = searched, no flight.
CREATE TABLE IF NOT EXISTS fares (
  origin TEXT NOT NULL,
  dest TEXT NOT NULL,
  date TEXT NOT NULL,
  price INTEGER,
  airline TEXT,
  flight_no TEXT,
  dep TEXT,
  arr TEXT,
  stops INTEGER,
  checked INTEGER NOT NULL,
  PRIMARY KEY (origin, dest, date)
);
CREATE INDEX IF NOT EXISTS fares_checked ON fares (checked);

-- Checks in a row with no direct flight; at 6 the route is dormant.
CREATE TABLE IF NOT EXISTS misses (
  origin TEXT NOT NULL,
  dest TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (origin, dest)
);

-- Routes the find tier discovered that Eurostat's list does not have.
CREATE TABLE IF NOT EXISTS found (
  origin TEXT NOT NULL,
  dest TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  PRIMARY KEY (origin, dest)
);

-- One row per sweep minute, kept a week, for GET /status.
CREATE TABLE IF NOT EXISTS runs (
  minute INTEGER PRIMARY KEY,
  jobs INTEGER, ok INTEGER, empty INTEGER, failed INTEGER, blocked INTEGER
);

CREATE TABLE IF NOT EXISTS state (k TEXT PRIMARY KEY, v TEXT);

-- Airlines seen in results (T516): name from Google; logo 1 = copied to R2
-- data/airlines/{code}.png, 0 = Google has none, NULL = not tried yet.
CREATE TABLE IF NOT EXISTS airlines (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo INTEGER
);
