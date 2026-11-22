# Run report: Explore map view (G12)

- **Status:** done; judge 1 FAIL, judge 2 FAIL (tap card), judge 3 PASS; one owner fix after (heart disc on the map); merged to main at the owner's request (not yet deployed)
- **Date:** 2026-11-20 · L2 · crew:design, the session orchestrated only
- **Proposal approved:** https://claude.ai/artifact/6br7WvCRq4GmXom3RJ5LGg v1 with the defaults (Protomaps on Carta's R2 in house colours, tabs leave the phone map view, count bubbles)
- **Branch:** `p15-map-view` from main 0ee7d6fd00
- **Undo:** `git revert` the run's commits (b1e8ca3ed6 to the report commit). The basemap on R2 (`data/maps/`) is add-only and harmless if unused; the box timer `carta-basemap.timer` can be disabled with `systemctl --user disable --now carta-basemap.timer`.

## Summary
The Explore map is now Carta's own: a Protomaps basemap (Europe PMTiles on R2, house palette, few labels, © OpenStreetMap) with CARTO only as a fallback, refreshed monthly from the Hetzner box. Pins are MapLibre layers: white price pills in the price basis, a saffron dot on the best value in view, the picked pin umber with its name, count bubbles for crowds, small dots with a 44 px tap; none under the floating chrome, and settings or filters never move the camera. Phone: a full map with the floating search, Ask and one chip row led by Filters; tabs, band, heart disc, Map corner and zoom hidden; "List of {n}" pill; a three-stop sheet with flick; a compact tap card (names wrap, never cut; the picked pin stays above it). Tablet and desktop: a 400 px card column with hover both ways, zoom bottom right, the heart disc inside the map's bottom-left corner.

## Checks
- verify_map.mjs 116/116 after the last fix (126/126 with the six-language tap card pass: 48 card cases, 12 sheet rows).
- Pan at CPU 4x: phone 2 of 433 frames over 50 ms, desktop 0 of 440 (was 19 and 15).
- Judge 3 own checks: tap card 36/36, sheets 24/24, not-yet rows 48/48; receipt opens from the card; no page errors.
- npm test: the 16 known Windows failures only (`final-npm-test.txt`).

## Open
- A not-yet place shows "Not yet" in a filled figure block that reads like a price (owner offered a plain label).
- "Picos de Europa, Spagna" takes three lines in the narrow phone sheet.
- A receipt opened from a `?xi=` link shows the default map behind it, not the place.
- Owner: the 13 GB local PMTiles copy in scratch can be deleted; check `~/logs/basemap.log` on the box after 2026-12-09 (`docs/owner/maps-refresh.md`).
