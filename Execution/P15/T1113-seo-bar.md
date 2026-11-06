# T1113: SEO quality bar for every page kind, trip canonicals, trail prose (K2, session S29)

## Date

2026-11-06

## What changed

Owner decision 1 (2026-11-05) keeps the place bar as written: 337 of 3,868 places indexable, so the next prerender upload drops indexed places from 3,754 to 337 and the D9 intros (T1095) lift them back later. This task adds the bars T1076 left open. Beach, lake and mountain pages need a licensed photo, 60 words of prose, a seasonal or measured fact, a parent place, a score and three links. Cycling routes need a licensed wire photo, 60 words, distance, climb, a score and three links. Trips need a stop on a destination page, a cost, a season and four links. Near-duplicate trips (same towns in one country) now share the best trip as canonical and leave the sitemap. Trail pages gain an "About this walk" paragraph written from the row's measured fields and a "Places to stay near it" list from the dossiers that link the trail. A thin page of any barred kind ships `noindex,follow` and is out of the sitemap, proved by a test. Nothing is uploaded.

## Files touched

- `continent-app/scripts/prerender/quality.mjs`: `layerBar`, `cycleBar`, `tripBar`, `canonicalTrips`, dispatch in `pageBar`.
- `continent-app/scripts/prerender/build.mjs`: trip canonical map, trail to place map, no noindex on a page whose canonical is elsewhere, headroom for cycling.
- `continent-app/scripts/prerender/pages.mjs`: `trailAbout`, trail "About this walk" and "Places to stay near it", trip canonical.
- `continent-app/scripts/prerender/sitemap.mjs`: canonical check before the bar check, floor line lists every barred kind.
- `continent-app/tests/prerenderQuality.test.mjs`: 10 new tests (33 in the file).
- `docs/HANDBOOK.md` (Deploy, SEO bullet), `ROADMAP.md` (K2 status), `Execution/_OPEN.md`.

## Commands run

```
cd continent-app && npm ci
node scripts/prerender/build.mjs --data public --out <scratch>/before   # unchanged code
node scripts/prerender/build.mjs --data public --out <scratch>/after
node --test tests/prerenderQuality.test.mjs
npm test
```

## Config and secrets set

None. New constants in `quality.mjs`: `LAYER_MIN_WORDS` 60, `LAYER_MIN_LINKS` 3, `CYCLE_MIN_WORDS` 60, `TRIP_MIN_STOPS` 1, `TRIP_MIN_LINKS` 4.

## Before/after measurements

Indexable means in the sitemap (indexable, self-canonical, above floor and bar). Measured here over this checkout's `public/`, same wire both runs, 32,160 pages.

| Kind | Pages | Indexable before | Indexable after | Delta |
|---|---|---|---|---|
| Places | 3,868 | 3,754 (production), 337 with the T1076 bar | 337 (owner decision 1) | -3,417 vs production |
| Beaches | 2,745 | 2,658 | 763 | -1,895 |
| Lakes | 1,628 | 1,628 | 930 | -698 |
| Mountains | 723 | 723 | 581 | -142 |
| Cycling routes | 508 | 0 | 0 | 0 |
| Trips | 3,949 | 3,949 | 1,155 | -2,794 (2,748 canonical to another trip, 46 thin) |
| Trails | 17,619 | 0 | 0 | 0 |
| Sitemap URLs in all | | 10,080 (this checkout) | 4,551 | |

Places could not be re-run here: `public/dest/` and `public/stays/` are not in this container, so the bed and food price test fails for every place and the local run shows 0. The 337 is T1076's figure on the owner's data; no code about places changed in this task.

Bar failures after (a page can fail several): beach prose 1,893, season 477, rating 32, parent place 4; lake prose 697, parent place 8; mountain prose 94, season 53, parent place 5; cycling photo 508, prose 320; trips with no stop on a destination page 46.

Trail prose test: failing pages fell from 17,019 to 10 of 17,619 with the new paragraph. Trails stay at 0 indexable because the wire image has no licence. With a licence 10,397 trails would pass (was 427 in T1076) and 188 cycling routes (`bar_headroom`). A caution: the new paragraph restates the facts table in sentences, so it lifts the word count more than it adds information; the owner may want a stricter prose rule before trails go live.

`npm test`: 1,385 pass, 0 fail, 12 skipped.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Old test "pageBar applies to places and trails only" failed | Beaches now have a bar | Test rewritten: hubs and costs return null |
| First trip bar asked for 2 stops and failed 1,972 trips | Many trips are one town | Bar is one stop on a destination page (the parent place) |
| Sitemap counted near-duplicate trips as "below the quality bar" | Bar check ran before the canonical check | Canonical check first; a page with a canonical elsewhere is not also noindex |

## Screens checked

No traveller screen changed. The new trail sections render through the existing prerender HTML; the end check on the preview deploy must view source on: a trail page (About this walk, Places to stay near it), a duplicate trip (canonical points to the best trip, no robots tag), a thin lake (`noindex,follow`).

## What is still open

- T1113-a (owner): upload the new prerender. Warning: indexed places drop from 3,754 to 337, and beaches, lakes, mountains and trips also drop (see table).
- T1113-b: trail photo licence still blocks every trail and cycling route (10,397 trails and 188 routes are ready behind it).
- T1113-c: the 6,798 trails no place page links stay out; the place link rule needs dossier `around.trails` to widen.
- T1113-d (owner): after the upload, confirm in Search Console that the trip canonicals are accepted (the 2,748 duplicates should read "alternate page with proper canonical").

## Owner steps (for the checklist)

- [T1113-a] Upload the new prerender | the bar drops indexed places from 3,754 to 337 and removes thin beaches, lakes, mountains and duplicate trips from the sitemap | run the prerender on the box with full data; check `_sitemap.json` shows 337 places; `node scripts/prerender/push.mjs`; deploy to preview, then main; WARNING: expect indexed places to fall to 337 and the D9 intros to lift them later | continent-app/scripts/prerender/push.mjs
- [T1113-d] Check the trip canonicals and thin pages after the upload | proves noindex,follow and canonicals are served | view source on a thin lake and a duplicate trip; confirm the x-robots-tag header; watch "alternate page with proper canonical" in Search Console | Execution/P15/_OPEN-search-console.md

## Rollback procedure

`git revert` the T1113 commit. Nothing was deployed and no data or schema changed.
