# T1152: Taste profile with validation (ROADMAP F3, round 2 session S68)

## Date

2026-11-06

## What changed

My trips, Your Europe tab, now has a "Your taste" card: the interests Carta reads from the traveller's own saves, trips and filters, mapped onto the T1149 taxonomy (five facets), as up to six chips (twelve when opened, two per facet first). Each chip says what it rests on ("2 trips, 1 saved place", then up to three names) and has a Yes and a Not me of 44 px. Yes keeps the chip first and shown while any evidence remains; Not me hides it under "Hidden (n)", from where Show again takes it back, raises the bar for its narrower nodes and becomes a negative (-3) in `tasteWeights()` for a ranker. Scoring is time-decayed weighted evidence (trip 3, save 1, filter 0.5; half life 180 days, 30 for filters) with a smoothed lift against the catalogue's base rate, so a tag most places carry (heritage on 70 percent) does not become a chip. Verdicts live on the device (`carta.taste.v1`, cleared by "Sign out and remove") and, signed in, in `account_things` under a new kind `taste`, with a `_profile` row holding the shown chips and their evidence counts, so the profile is deletable and in the GDPR export as `accountThings`. The acceptance rate is counted without cookies or ids: one integer per day per event (shown, accept, reject), facet and position bucket. Migration 072 (with a down file, never applied live) adds the kind and the counter. Before 072 the taste sync turns itself off on the first refusal and the other synced kinds are untouched. Proved by 16 node tests (two simulated devices against one stubbed account), a DOM check at 390 and 1440 px, and the RLS suite and privacy harness on a local PostgreSQL 16.

## Research

A research subagent compared scoring, correction and measurement options.

| Option | For | Against | Source |
|---|---|---|---|
| Plain weighted counts | simple | tags every place has dominate; stale interests never fade | |
| Time-decayed counts | old interests fade | a short half life wipes out real taste, travel is rare | https://arxiv.org/pdf/2008.11432 |
| Lift against catalogue base rate | stops "city" dominating | swings on one or two items | https://journal.r-project.org/articles/RJ-2017-063.pdf |
| Smoothed (shrunk) lift | few items pull lift toward 1 | one more constant | https://cloud.r-project.org/web/packages/openEBGM/vignettes/vignette04-posteriorCalculation.html |
| Scrutable, editable profile | the model is what the user sees and fixes | needs an evidence UI | Kay and Kummerfeld (https://researchr.org/publication/Kay21), Radlinski et al. NL profiles (https://arxiv.org/pdf/2205.09403), LACE (https://arxiv.org/abs/2304.04250) |
| Correction that dampens, not bans | reversible; matches Google My Ad Center and Spotify "exclude" | the topic can still appear | https://support.google.com/My-Ad-Center-Help/answer/12155451, https://support.spotify.com/cv-en/article/exclude-playlists-or-tracks-from-your-taste-profile/ |
| Aggregate counters per day | no per-user data | position and selection bias; ePrivacy 5(3) can still apply to a ping | Joachims 2017 (https://arxiv.org/abs/1608.04468), EDPB Guidelines 2/2023 (https://edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf) |

Chosen: decayed counts plus smoothed lift (alpha 3), the subagent's starting weights and thresholds (lift 1.5, evidence 2, three items or two with a trip), six chips with two per facet, rejection as a hidden chip plus a -3 weight that raises the bar for children and never touches parents, and per-day counters split by facet and position bucket with acceptance and decision rate reported side by side. The constants are starting values to tune on acceptance data. Storage follows the brief: `account_things` (T1104). Its kind check made a migration unavoidable; the taste sync runs beside `accountSync.js`, not inside it, so a project without 072 cannot break the trips' sync (one refused row would fail the whole batch upsert there). Not chosen: a parent roll-up of evidence and a tap-to-list-all view (T1152-e), to keep the first cut small.

## Files touched

Created:
- `continent-app/src/lib/taste/profile.js` (evidence, scoring, profile, weights, snapshot), `store.js` (device verdicts and hook), `sync.js` (account merge), `counts.js` (cookieless counter), `taxonomyMap.js` (generated)
- `continent-app/scripts/taste/build_taxonomy_map.py` (writes and checks `taxonomyMap.js` from `pipeline/taxonomy/*.yaml`)
- `continent-app/src/auth/mytrips/TasteChips.jsx`, `continent-app/src/styles/71-taste.css`
- `continent-app/tests/tasteProfile.test.mjs` (16 tests), `continent-app/scripts/verify_taste_profile.mjs`
- `supabase/migrations/072_taste_profile.sql`, `supabase/migrations/072_taste_profile_down.sql`
- this report

Modified:
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (23 new `taste.profile.*` keys each, appended)
- `continent-app/src/auth/SavedTripsPanel.jsx` (mounts the card under Your Europe and hands it the saves and trips it already holds; outside the named files, the one place the card can be mounted)
- `continent-app/src/lib/deviceData.js` (`carta.taste.v1` is one of the traveller's things) and `continent-app/src/components/CookiesPage.jsx` (header comment only, which `tests/deviceData.test.mjs` ties to deviceData)
- `docs/legal/ARTICLE30.md` (row 13d, row 20 names the taste rows, section 2a lines for the two new tables; the privacy harness fails when a table has no line)
- `docs/HANDBOOK.md` (new section "Taste profile with validation"), `ROADMAP.md` (F3 status), `Execution/_OPEN.md` (rows T1152-a to T1152-g)

Not touched: `src/auth/accountSync.js`, `src/auth/AuthContext.jsx` (the export already carries every `account_things` row), `src/lib/taste.js` (the older onboarding taste), `pipeline/taxonomy/`.

## Commands run

```
git fetch origin && git checkout -b p15-s68-taste-profile origin/p15-round2
cd continent-app && npm ci
python -I scripts/taste/build_taxonomy_map.py            # writes src/lib/taste/taxonomyMap.js
node --test tests/tasteProfile.test.mjs
npx eslint src/auth/SavedTripsPanel.jsx src/auth/mytrips/TasteChips.jsx src/lib/taste/*.js src/lib/deviceData.js src/components/CookiesPage.jsx src/i18n/*.js tests/tasteProfile.test.mjs
node scripts/ci/design-lint.mjs
ruff check scripts/taste/build_taxonomy_map.py
# the dev app needs boot.json and dest/ shards, which are not in git: split public/app_data.json once
# through a copy of sync-data.mjs, restore the tracked files it rewrote, delete boot.json and dest/ afterwards
VITE_E2E_SEAMS=1 npx vite --port 5231 --strictPort
PW_CHROMIUM=/opt/pw-browsers/chromium CARTA_PORT=5231 SHOTS=../Execution/P15/T1152-shots node scripts/verify_taste_profile.mjs
npm test
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs   # and the same on origin/p15-round2 in a worktree
# local PostgreSQL 16 on port 55444
node scripts/admin/test_rls_policies.mjs ; node scripts/admin/test_privacy_gdpr.mjs     # without 072, then with
psql -f 065, 072 (x2), 072_down (x2), 072 on an empty database with auth stubs; taste_tick and admin_taste_weekly by hand; anon refused
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Interests shown to the traveller with their evidence | 0 | up to 6 chips (12 opened) on My trips, each with counts and names | new |
| Taste chip verdicts kept | none | device always; account once 072 is live | new |
| Acceptance rate measurement | none | per day, event, facet and position bucket, no ids | new |
| Taxonomy nodes the app can name | 0 | 138 (with ancestors), 44 in all six languages | +138 |
| DOM check (`verify_taste_profile.mjs`), 390 and 1440 px | n/a | 9 of 9 checks at each width (chips, evidence, 44 px targets, accept persists across reload, reject hides and lists, Show again, no sideways scroll) | new |
| `npm test` | 1692 tests (1708 minus the 16 new) | 1708: 1696 pass, 0 fail, 12 skipped | +16 |
| design-lint new violations | 0 | 0 | 0 |
| RLS suite assertions (local PG 16) | 847 of 847 | 856 of 856 | +9 (072's function and table probes) |
| Privacy harness (catalogue check against ARTICLE30 2a) | 69 of 69 | 69 of 69 | 0 |
| My trips chunk (fast build), raw / gzip | 133,908 B / 39,888 B | 166,249 B / 49,590 B | +32,341 B / +9,702 B (mostly the taxonomy map, T1152-g) |
| Main `index` chunk | 835,168 B | 835,177 B | +9 B |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The dev app showed "We couldn't load Carta's travel data" | `public/boot.json` and `public/dest/` are generated and not in git; `sync-data.mjs` reads the master from `app_data/`, and several files there are Git LFS pointers that it parses | Split once from a copy of `public/app_data.json` with a patched `readIf`; restored `public/app_data.json` and `public/app_data/why_i18n/*` (the script rewrote them) and removed the generated files after the check |
| Three wire tests failed after that | The locally generated `boot.json` and `dest/` made the wire tests run on a partial split ("rank tier check FAILED") | Removed the generated files; the tests skip without them, as in CI |
| design-lint: 6 new | Raw buttons, literal shadows and transition times, a middle dot | Kit `Button`, `--elev-1`, `--dur-1` and `--ease-out`, a left border for the facet tone, names joined with "; " |
| A diverse fixture produced no chips | With twelve equal interests and few other places, each lift was 1.33, under 1.5 | Correct behaviour; the fixture got a realistic number of plain city places. On the real catalogue beach has base rate 0.157, heritage 0.704 |
| `npm test` lost a process to the memory limit | The dev server was still running | Stopped it before the full run |
| Playwright looked for headless shell 1228 | The project pins another Playwright than the container's browser | The verify script takes `PW_CHROMIUM` (here `/opt/pw-browsers/chromium`) |

## Screens checked

My trips, Your Europe tab, with the `savedmock` seam plus three saved beach towns, at 390 x 844 and 1440 x 900 (DOM verify, and one screenshot each under `Execution/P15/T1152-shots/`, not committed). Seen: the card under the Europe map, six chips (Canals, Nightlife, City, Food and wine, Iconic, Romantic) on facet-tinted grounds with a coloured left edge, the facet as a small label, counts and names under each; Yes and Not me side by side (Not me icon only on a phone, named for screen readers); "5 more" at the foot, "Start over" only once a verdict exists. No sideways scroll. Design departures: a facet colour world per chip (lagoon for activity, umber for setting, sun for vibe), allowed as a default, not a ban; state is never colour alone (tick, "Yours", aria-pressed).

## What is still open

- T1152-a (user): paste migration 072.
- T1152-b (user): the two-device check after 072 and a deploy.
- T1152-c (next task): For you ranking reads `tasteWeights()` (rejections as negatives).
- T1152-d (next task): the admin card for the acceptance rate.
- T1152-e (next task): parent roll-up of evidence and a view listing every item behind a chip.
- T1152-f (user): legal read of the cookieless counter under EDPB 2/2023 with the other counters.
- T1152-g (next task): lazy-load the taxonomy map (about 32 KB raw in the My trips chunk).

Also noted, not rows: 94 of the 138 nodes have English labels only (already T1149-c); the evidence is today's tags mapped to nodes until the S66 tagger lands. The Claude API was not used and is not needed.

## Rollback procedure

`git revert` of the T1152 commit. If 072 was pasted, paste `supabase/migrations/072_taste_profile_down.sql`: one-way for the taste rows in `account_things` and the counts (devices keep their own verdicts in `carta.taste.v1`). The app without 072 turns the taste sync off by itself, so the order does not matter.

## Owner steps (for the checklist)

- [T1152-a] Paste migration 072 (taste profile) | taste verdicts and the profile only follow the account, and the acceptance rate is only counted, once the kind and the counter exist | in the Supabase SQL editor paste supabase/migrations/072_taste_profile.sql after 071; look for "taste profile self-check passed"; from continent-app/ run node scripts/verify_live_policies.mjs | supabase/migrations/072_taste_profile.sql
- [T1152-b] Check taste verdicts on two devices | the sync is proven against a stubbed account only | after T1152-a and a deploy, on a phone signed in open My trips, Your Europe, and say Yes to one chip and Not me to another; on a laptop signed in to the same account open the same tab: the Yes chip is first with a tick and the other is under Hidden; Show again on the laptop and reopen the phone: it is back | Execution/P15/T1152-taste-profile.md
- [T1152-f] Legal read of the taste counter | EDPB Guidelines 2/2023 say a ping from the device can fall under ePrivacy 5(3) without cookies | read docs/legal/ARTICLE30.md row 13d with rows 13 to 13c; confirm no consent is needed or tell the next task to gate taste_tick behind consent | docs/legal/ARTICLE30.md
