# Review app: the publish gate for staged trips

A local-only admin app for deciding what leaves staging. Everything upstream
of it is automated (ingest, elevation, validation, portal crosscheck,
popularity, descriptions) and none of it can promote content: `status =
approved` is reachable only by a person clicking Approve here, and approval
publishes nothing by itself. The export step picks approved rows up later.

Local by construction:

- the API binds 127.0.0.1 and refuses to start against a non-local DB host,
  outright if the host looks like Supabase,
- the Vite dev server binds 127.0.0.1 and proxies `/api`, so the browser
  never makes a cross-origin request and the API opens no CORS,
- writes are rejected when they carry an `Origin` header from anywhere but
  this dev server, which is what stops a random page in the same browser from
  approving trips in the background,
- nothing in here talks to the live Supabase project.

## Run it

Two processes, from the repo root, with the lab DB up
(`cd tools/trailslab && docker compose up -d`):

    python tools/trailslab/review/api/server.py

    cd tools/trailslab/review && npm install && npm run dev

Then open http://127.0.0.1:5174/. The API answers on 127.0.0.1:8011; check it
with `curl http://127.0.0.1:8011/api/health`.

`npm` needs node on PATH on this machine: run it from PowerShell with
`$env:PATH = "C:\Program Files\nodejs;$env:PATH"` if `npm` reports that
`node` is not recognised.

## What the queue shows

Filter by status (needs_review first), country, category and free text, sorted
by curation rank (popularity.py), quality score, distance, recency or title.
Each row carries its measured facts: distance, ascent, quality score, whether
the portal crosscheck confirmed it, whether it has a description.

Opening a trip shows, in the order a curator asks for them:

1. **Geometry** on the app's own basemap, with two on-demand overlays: the
   gap-repaired line from repair.py, and the official national portal geometry
   the crosscheck compared it against. Coordinates pass through
   `src/coords.js` first, the same contract as `continent-app/src/map/coords.js`:
   a NaN vertex in a staging row is dropped and counted, never handed to
   MapLibre, where it would throw and blank the page.
2. **Elevation profile** from the stored Copernicus GLO-30 sampling, with a
   crosshair readout, the range, the max grade and the duration rule used.
3. **Metrics against source tags**: computed distance, ascent, descent and
   duration next to the OSM tags that claim them, with the difference.
4. **Validation**: every check's newest verdict, score and full details jsonb.
5. **Portal agreement**: coverage, median distance, name similarity and the
   closest official name.
6. **Gap repair** and **source tags**, verbatim.
7. **Description**, editable. This is the text that ships, so the rule is that
   anything it claims has to be visible somewhere else on the page.

## Decisions

`Approve`, `Reject` and `Reopen` all write the new status and append a
`trip_reviews` row (action, reviewer, note, which fields were edited, the
score at the time). Unsaved description edits travel with the decision, so
Approve commits what is on screen. Published trips are refused: those are
demoted by the validation regression path, not from here.

`Save edits` writes the description without touching the status.

## Verify

With both processes up:

    node tools/trailslab/review/scripts/verify_review.mjs --no-approve

It drives the real UI in headless Chromium: loads the queue, opens the first
trip, waits for the map and the profile, toggles the portal overlay, saves an
edit, and reports console errors, with screenshots under `scripts/shots/`.
Drop `--no-approve` to run the full acceptance path and flip a status.

## Schema

The API applies `initdb/03_trip_descriptions.sql` and
`initdb/04_trip_reviews.sql` at startup, because initdb scripts only run
against an empty volume and an older lab has neither the description columns
nor the review ledger. Both files are idempotent.
