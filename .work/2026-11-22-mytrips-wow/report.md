# Report: My trips as an atlas (the final design pass)

**Status: done (merged into `main` as `01f395277d`, pushed and shipped live on 2026-11-22 at the owner's request)**

**Result:** The approved atlas design is built on branch `p15-my-trips` in 10 commits, phases A to I plus decision 0015.

**Judging:** three judge rounds were used, the maximum:
- Round 1: FAIL at 3.67.
- Round 2: FAIL at 3.93, on house style only.
- Round 3: FAIL at 3.93. The only open item was the 9 px stamp labels and a German stamp name crossing its ring at 1440. That item is fixed in phase I and verified by checks. **No fourth judge has re-scored it.**

## What the traveller gets
- **The journey line** on Today, on the next-trip card and on the Uitgaven page: pills as long as the nights, a bead per day, today in saffron.
- **Today:**
  - the signpost plate with the flag;
  - "Dag n van m" and "Nog n nachten";
  - "Vandaag ligt nog open" with a dotted path to Plan vandaag;
  - a planned day drawn as a route;
  - a two-column ledger on desktop;
  - the trip map drawn up to today.
- **The rating** as a map scale bar with the country's silhouette.
- **Bewaard:**
  - hatched countries for "want", with "been" kept underneath;
  - a count chip;
  - a pin plate when you hover a row;
  - compacter rows, a cover fan, and Kiezen on the tools row.
- **Jouw Europa:**
  - the map fills year by year once a session, with no count-up;
  - on desktop, Eerdere reizen sits under the map in a scroll region;
  - hovering a row lifts its route;
  - one-line costs, a compass, ink stamps for milestones and grades, and mini route tiles.
- **Uitgaven:** the spend line, a bead per day sized by your share.

## Checks (the last run)
- `verify_mytrips`, in all six languages:
  - at 360, 390 and 1440 for the variants spend, years and lots: 0 fail, max CLS 0.0119;
  - the full grid of 390, 820, 1180 and 1440 for 6 variants in en-GB: 72 cells, 0 fail;
  - past-list placement: 2 of 2;
  - the new stamp-spill check: 0.
- `verify_spend`: 83 cells, 0 fail.
- Lint: 0 errors. design-lint: 0 new. The fast build passes.
- `npm test`: 16 failures, the same 16 that fail at base `0f2ac27e10` (`fails-wow-base.txt`). The 2 failures this run caused were fixed in phase F.
- Phone heights at 390 (nl), against the base:

  | Tab | Variant | Now | Base |
  |---|---|---|---|
  | Reizen | spend | 874 | 876 |
  | Reizen | one | 1261 | 1262 |
  | Jouw Europa | years | 5010 | 5029 |
  | Jouw Europa | lots | 3260 | 3265 |

  German is a little longer. The judge said that does not matter, because the German base was never measured.

Details are in `checks.md`, `progress.md` and `judgement-1.md` to `judgement-3.md`. Screenshots are in `shots/` and `judge2-shots/`.

## Not verified
- A fourth judge on phase I.
- The mini route tile on screen: no mock past trip lacks a photo.
- Very long trips (more than 21 days) on the journey line.

## Tokens
- Added `--dur-fill-step: 240ms` and `--text-signpost`. `--dur-draw` was dropped: the draw uses `--dur-reveal` (K17).
- Both are recorded in `DESIGN.md`.

## Commits (branch `p15-my-trips`, not pushed)
| Commit | Phase |
|---|---|
| `a74f362825` | A: the journey line and Today |
| `4387b62106` | B: the next-trip card and the scale bar |
| `6ba8c3777e` | C: Bewaard |
| `0b5cb3ae91` | D: Jouw Europa |
| `43e51a0094` | E: the spend line |
| `10d98e4f26` | F: the open items and our 2 test failures |
| `0c0f860daf` | G: the round 1 fixes |
| `ccd61f0d10` | H: the round 2 fixes |
| `218d195294` | I: the round 3 fixes |
| `a5d4bc493a` | decision 0015 |

**Undo:** `git revert` the commits. There are no data or schema changes.

## Files changed (in the worktree, `git diff 0f2ac27e10..a5d4bc493a --stat`)
| File | Change |
|---|---|
| `continent-app/src/auth/mytrips/atlas/JourneyLine.jsx` | new |
| `continent-app/src/auth/mytrips/atlas/journeyLine.js` | new |
| `continent-app/src/auth/mytrips/atlas/MiniRoute.jsx` | new |
| `continent-app/src/auth/mytrips/atlas/pastBeside.js` | new: when the past list sits beside the map |
| `continent-app/src/auth/mytrips/atlas/wish.js` | new: the wish and been rule |
| `continent-app/src/styles/72-spend.css` | the spend line styles |
| `continent-app/src/auth/mytrips/TodayCard.jsx` | the Today header, the invitation, the drawn day, the ledger |
| `continent-app/src/auth/mytrips/TripCards.jsx`, `TripParts.jsx`, `MyTripsTabs.jsx` | the next-trip line, the scale bar |
| `continent-app/src/auth/mytrips/SavedTab.jsx`, `atlas/SavedPlate.jsx` | the hatch, the chip, the pin plate, the tools row |
| `continent-app/src/auth/mytrips/YourEurope.jsx`, `EuropeParts.jsx` | the fill, the past list portal, the compass, the stamps |
| `continent-app/src/auth/mytrips/atlas/AtlasPlate.jsx`, `atlas/AtlasSlot.jsx`, `atlas/layers.js` | the map layers and the slot host |
| `continent-app/src/auth/SavedTripsPanel.jsx` | the past list host |
| `continent-app/src/auth/mytrips/spend/SpendPage.jsx` | the spend line |
| `continent-app/src/styles/01-tokens.css`, `70-mytrips.css`, `72-atlas.css` | tokens and styles |
| `continent-app/src/i18n/{nl,en,de,fr,es,it}.js` | new strings; the de saved pill label fix |
| `continent-app/scripts/verify_mytrips.mjs` | the placement and stamp-spill checks |
| `continent-app/tests/journeyLine.test.mjs`, `atlasWish.test.mjs`, `atlasLayers.test.mjs` | tests |
| `DESIGN.md`, `ROADMAP.md`, `docs/HANDBOOK.md` | docs |
| `docs/decisions/0015-my-trips-journey-line.md`, `docs/decisions/README.md` | the decision record |
| `.work/2026-11-22-mytrips-wow/*` | the run folder (this report and the working files) |
| `.work/INDEX.md` | the run line |
