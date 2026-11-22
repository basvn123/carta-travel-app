# Run report: Explore map view round 2 and Explore main page clean (G12)

- **Status:** done. The owner asked to stop after judge 10. That judge gave a FAIL with one serious and one small finding, both about icon alignment. One short fix round K closed both, and no judge checked that round. Not merged and not deployed.
- **Date:** 2026-11-20 to 2026-11-22 · L2 · crew:design, impeccable. This session only orchestrated.
- **Proposal approved:** https://claude.ai/artifact/QHo6fy57FeZeUiNRBxx5w7 v1, with the defaults:
  - 1A: photo pins carry the figure.
  - 2A: quick filters on the map.
  - 3A: 112 x 96 photos in the rows.

  The owner added two conditions, both in `decision.md`:
  - The style chip and the settings chips keep their own row on the phone map.
  - "Don't stop until Explore and the map page are really clean."
- **Branch:** `p15-map-view-2` from main 8ab55e1959, 29 commits, 829a46425a to dc5d839ec4 plus this report. Lane B (`p15-explore-clean`) is merged in.
- **Undo:** `git revert` the run's commits. There is no data or schema change.

## Summary
**Map**
- Photo pins carry the figure. From zoom 4.5 a photo pin is named, and below that count bubbles show.
- The tap card has a way back to "List of {n}".
- The list sheet has rows with a 112 x 96 photo, a short basis line, and a scope switch In view | All. It sorts by rating, price, match and distance.
- Quick filters sit on the map. The Filters sheet shows live counts in the local number format.
- On the phone, the style chip and the settings chips keep their own row, with the quick filters on a row below.
- The match is a saffron mark. Tapping it opens bars whose points add up to the %.
- Desktop has a card column, and the anchored card stays inside the map.
- The best value is chosen only from places in view.

**Explore main page**
- Each rail card holds the figure and its basis together.
- The price chain has no "+" and no "excl. flight". It falls back from the dated fare to the typical fare to a ground estimate, else shows the stay alone.
- The water badge is a house icon.
- Active chips are whole, and Clear all sits after them.

**Across both pages**
- The category tabs really scroll from 769 px.
- The disc foot band applies only from 769 to 1023 px. From 1024 px the disc floats.
- No text is cut in six languages from 360 to 1440 px.
- Every icon beside a word sits on the word's capitals (owner request). The method is `text-box: trim-both cap alphabetic` in `03-button.css`.

## Judging
Judges 4 to 9 gave a FAIL, and each finding was fixed in the next round (`judgement-4.md` to `judgement-9.md`).

Judge 10 gave a FAIL on the look only.
- **What it passed:**
  - The owner's phone-map condition held in 48 of 48 states.
  - The cut-text probe found nothing in 168 boots.
  - verify_rail_cards 157/157.
  - verify_explore 114/114.
- **What failed:**
  - Icons outside the chips sat 1.5 to 2 px low: Settings, the List/Map switch, the tabs, the header nav and Together.
  - Clear all sat 2.3 px above the chips beside it.

Round K fixed both: the worst icon offset went from 2.0 to 0.4 px, 0 of 930 measurements are over 1 px, and 0 of 612 rows changed height. A judge has not checked round K.

## Checks on the final head (dc5d839ec4)
| Check | Result |
|---|---|
| verify_map `--layout-only` | 851/851 |
| verify_map `--g-only` / `--e-only` | 280/280 / 291/291 |
| verify_band / six languages | 102/102 / 612/612 |
| verify_active_chips | 24/24 |
| verify_explore | 114/114 |
| verify_rail_cards (round I build) | 466/466 |
| Unit tests of this run | 20/20 (51/51 in round I) |
| eslint / design-lint | 0 errors, 14 warnings, the same as before / 0 new |

## Open
- **Not run on the final head:** verify_filters, verify_smooth, verify_map `--perf-only` and the full `npm test`. Other sessions were loading the machine.
  - verify_filters passed in round I and verify_smooth passed 134/134 there.
  - The full `npm test` had 14 failures under judge 10. The two that were checked fail the same way on main (a Windows path bug in the tests). The other 12 were not checked.
- **Smoothness is not measured cleanly.** Pan runs on the loaded machine gave 3 to 26 frames over 50 ms out of about 370 to 440. Judge 8, on a quieter machine, measured 3 of 429. Measure on a quiet machine or a real phone before deploying.
- Place names are not localised ("Rome" in German). This is a data issue and out of scope.
- **Owner:**
  - Add the `*.pages.dev`, 5174 and 127.0.0.1 origins to R2 CORS. Until then, photo pins elsewhere fall back to the Commons thumb.
  - Delete the 13 GB PMTiles copy in scratch.
  - Check `~/logs/basemap.log` on the box after 2026-12-09.
- Map view rounds 1 and 2 are not deployed.
