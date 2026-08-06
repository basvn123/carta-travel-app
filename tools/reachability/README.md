# Reachability precompute (contract D)

Builds one file per origin at `continent-app/public/reach/<ORIGIN>.json`:

```
{ "origin": "BRU", "computed_at": "2026-08-05T22:40:00Z", "minutes": { "AMS": 143, "gem:ghent": 44, ... } }
```

`minutes` maps Carta destination ids (the keys of `destinations` in
`app_data/app_data.json`, airport IATA codes and `gem:` slugs) to whole
minutes of ground travel from the origin city centre. Compact JSON, ints
only, destinations over the cap or without any itinerary are simply absent.
This feeds the "reachable in under N hours" map filter (Chunk 8).

## What the numbers mean

Door to door public transport: origin city centre to the dest's
`city_lat`/`city_lon` (fallback `lat`/`lon`), best itinerary for a fixed
Tuesday morning departure (05:00Z, 07:00 CEST), capped at 720 minutes (12h).
Because both endpoints are city centres, every value includes urban access
legs (tram, metro, walk) on both ends: expect roughly 20 to 45 minutes above
station-to-station benchmarks. Itineraries containing an AIRPLANE leg are
discarded, this is a ground transport layer.

The destination walk allowance matters: MOTIS defaults to a 15 minute
post-transit walk, which returns zero itineraries for any dest whose master
coordinate sits more than about 1 km from a stop (off-centre city coords
like Bologna, rural gems, beach dests). The builder passes
`maxPostTransitTime` (config `max_post_transit_s`, 3600 s) so those resolve;
the final walk is counted in the minutes, which errs conservative. After
changing a query parameter, requery only the affected cached entries with
`--retry-missing` (no-itinerary entries) instead of rebuilding the cache.

## Phase A: public Transitous instance (current implementation)

Data source: `api.transitous.org` (MOTIS-backed, community run, global GTFS
coverage). Probed 2026-08-05:

- `/api/v3/plan` works unauthenticated, about 1 to 1.5 s per long-distance
  query, and is what `build_reach.py` uses.
- `/api/v1/one-to-all` exists but rejects a 12h horizon from Brussels
  ("too many results: 1087158 > 524288"), so per-dest plan queries it is.

Fair use posture: at most one request per second (config
`min_request_interval_s`), exponential backoff on 429/5xx, a User-Agent that
identifies the project with a contact address, and an on-disk cache so
re-runs never re-query answered pairs. A full origin is about 1,120 queries,
roughly 35 minutes. Multi-airport cities sharing one city coordinate (Paris
CDG/ORY/BVA, London LHR/LGW/STN/LTN) are queried once and fanned out.

## Regenerating

From the repo root (plain Python 3, stdlib only):

```
python tools/reachability/build_reach.py --dry-run        # candidate counts, no requests
python tools/reachability/build_reach.py --origin BRU --limit 20   # smoke, no artifact write
python tools/reachability/build_reach.py                  # all configured origins
python tools/reachability/spot_check.py                   # benchmarks + coverage report
```

- Departure defaults to the next Tuesday 05:00Z at least 3 days out; pin one
  with `--depart 2026-09-01T05:00:00Z`.
- Cache lives at `cache/<ORIGIN>_<depart-date>.jsonl` (gitignored), keyed by
  destination coordinate. Kill and rerun at any time, it resumes. A new
  depart date starts a fresh cache file, old ones can be deleted.
- `--retry-errors` requeries entries that failed with an error last time.
- Adding an origin: append `{iata, name, lat, lon}` to `config.json`
  (use the city centre `city_lat`/`city_lon` from the dest master, not the
  airport coordinate) and rerun.

## Phase B: own MOTIS instance (not needed yet)

Only if Transitous becomes unavailable or unacceptably slow at more origins.
Sketch, kept here so the option stays cheap:

1. Run MOTIS locally (docker `ghcr.io/motis-project/motis`, or the Windows
   binary from the motis-project releases page).
2. Feeds: FlixBus GTFS `https://gtfs.gis.flix.tech/gtfs_generic_eu.zip`
   (same URL Chunk 5's `src/ingestion/bus/flixbus_gtfs.py` ingests), gtfs.de
   for Germany, plus national feeds from the european-transport-feeds
   catalogue. Note: gtfs.de split feeds (fv/rv/nv) answer 403 without an
   account-bound URL, see the comment block in `src/ingestion/naps/germany.py`,
   the full national aggregate downloads anonymously.
3. OSM: per-country Geofabrik extracts for the street/transfer graph.
4. Use MOTIS one-to-all per origin (config caps `onetoall_max_results` and
   `onetoall_max_travel_minutes` need raising for a 12h horizon), then map
   reached stops to dests by nearest stop within a few km, min duration wins.
5. Write the same contract D artifact, `spot_check.py` validates it the same
   way.

## Files

- `config.json`: origins (city centre coords), radius (1500 km), cap
  (720 min), pacing, API endpoint, User-Agent.
- `build_reach.py`: the builder, resumable, writes the artifacts.
- `spot_check.py`: known-duration checks plus coverage percentages.
- `cache/`: per-origin query cache, gitignored, safe to delete.
