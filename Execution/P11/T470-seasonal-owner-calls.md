# T470: owner calls on the T469 season plan applied

## Task ID

T470

## Date

2026-10-20

## What changed

The owner answered the five T469 calls on 2026-10-20. The answers are now written into `Roadmap/2.10-seizoen-rating-prijs.md` (its decision table became "Besluiten") and into `Roadmap/Carta roadmap.md` (rows 1.10, 2.10, 2.12, 2.13 and 4.9, the phase 2 decision line, and weeks W48 and W50).

The forecast moves to MET Norway, and Open-Meteo leaves the app. Hotel prices must be "really cheap and if possible real". That means free sources only: LiteAPI's two free endpoints with a production key, plus the free Hostelworld partner programme. The paid `/pricing/index` is dropped, so a sweep costs €0. With a month chosen, a card shows the month score and the reason. The owner left the two reviews to Claude: Claude judges the 30 rating disagreements and the 60 golden destination-months against sources, and the owner checks a sample.

While applying the MET Norway call, one more non-commercial Open-Meteo use turned up: the elevation API in `harvest_climate_power.py`. The plan now moves that to an open elevation model. No code changed.

## Files touched

**Modified:**
- Roadmap/2.10-seizoen-rating-prijs.md
- Roadmap/Carta roadmap.md
- Execution/_OPEN.md

**Created:**
- Execution/P11/T470-seasonal-owner-calls.md

**Deleted:**
- None

## Commands run

None beyond file edits and the commit.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

No issues.

## What is still open

The owner's one remaining hands-on step for 2.12 must be done before W49. Create the LiteAPI production key: card verification only, no charge, and a low-limit virtual card is advised. Apply for the Hostelworld partner programme through Partnerize, which needs the live site URL. The harvesters stay blocked until both exist; T227-c (the partner display terms) stays open alongside.

The pipeline still calls the Open-Meteo elevation API for the climate lapse correction. Task 2.11 moves it to Copernicus DEM or the Mapterhorn terrain tiles.

## Rollback procedure

`git revert` the T470 commit. Only the two roadmap files, this report and the register rows change.
