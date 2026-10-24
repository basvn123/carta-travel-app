# T731 to T735: the planner's open calls decided, and the branch made ready to merge

## Shared header

**Batch.** The owner, 2026-10-24, on the open rows of the planner rebuild (batches 1 and 2, reports `T653-T660-trip-planner-flow.md` and `T668-T677-day-planner.md`): "you make the full decision, and then finalize; the merge and deploy I will do in a separate session". So this batch decides every open planner row that was the owner's call or a data question, fixes what the decisions need, and brings master into the branch, so the owner's merge is a fast-forward. Numbers T731 to T735, after the peer reservation (PB3 to PB5 hold T699 to T730).

**Decisions taken (owner delegated, 2026-10-24).**

1. **A planned trip is the traveller's own work: a saved setting never rebuilds it (T675-a, T731).** Each saved answer says in one line what it did:
   - the party and an exact start date move the trip;
   - From prices the flights from the new place;
   - newly booked flights or stays take the traveller to the price paid;
   - a When that is not two dates keeps the trip's dates;
   - the help-me-choose answers steer Carta's suggestions only.
2. **The planner's CSS loads with the planner route (T654-b, T732),** moved by the proven `css-routes --split`.
3. **Real flight figures are checked here, not deferred to a preview (T676-b, T733).** The data host is read through Playwright, and two false claims found on the way are fixed:
   - a day nobody answered for said "No flight that day";
   - compare said "No flight found" for a month the sweep does not reach yet.
4. **The insider tip uses the dossier's rule tips; What's on stays the dossier's festivals by month (T673-a, T671-a, T734).**
   - Every dossier carries rule tips, already phrased in six languages for the destination page. The guide takes the advice kinds and leaves transport and season to their own rows.
   - What's on lists only entries with months, so a listed building no longer shows as an event.
   - Carta does not invent events. A dated events feed would be a new pipeline, not planner work, and the row keeps its placeholder where nothing is on.
5. **Master is merged into the branch now (T735),** so the merge the owner runs is a fast-forward and the conflicts are already settled.

**Branches.**
- **App:** `p15-planner-final` (worktree `wt/p15-plan-flow-app`), from `p15-day-planner` 8bddc71. It holds batches 1 and 2 and this one, with app master 6fc164e (PB1 and PB2) merged in at 0e89fc2. Head 2ba2363 is master plus 29 commits.
- **Root:** `p15-planner-final` (worktree `wt/p15-plan-flow-root`), with root main f60a60051 merged in at 5d80cf28f. Mirror 47e8e2159: its `continent-app/` matches the app head file for file, line endings aside.

Nothing pushed or deployed.

**Static checks.**
- eslint on the touched files: no new warnings.
- `npm test`, after the merge: 809 tests, 765 pass; the same 3 numbers-page tests fail in every worktree, which has no `public/boot.json`.
- Fast build: clean.
- `css-routes --check`: 4, the items-sheet four master has.
- `design-lint`: 32 findings, exactly master's 32 after PB2. Batch 2 stood at 29 against master's 29 then.

**End check.** One browser round on the merged branch, the build with the verify seams and a fake Supabase host, served by `wt/t660-serve.mjs`, Playwright with the service worker blocked:

| Script | Widths | Result |
|---|---|---|
| `t676.mjs` (session scratchpad): plan the days, AI plan, the town guide, Your days, keep and place, compare, journeys | 390, 820, 1280 | 16 of 16 each |
| `scripts/verify_plan_mocks.mjs`: upload, live flights, on a trip, the seed | 390, 820, 1280 | 16 of 16 each |
| `t733.mjs` (session scratchpad): compare with real fares, a planned trip with no live answer, From changed in the settings | 390, 1280 | 5 of 5 each |
| `t676.mjs`, the insider tip on a real day | 390 | 12 of 12 |

The data host's files were fetched by Playwright and handed to the page; only public GETs, and nothing carried the owner's address. No page error, no horizontal overflow, no raw key, no dash or middot.

**carta-design, the seven questions** (for the visible changes: the settings notice, the flight row line, the compare cell, the tip row).

1. Tokens only.
2. No new colour.
3. The notice's button is secondary; brown stays for the primary.
4. Body and caption sizes; no figure without the formatter.
5. One primary per view unchanged; no text on photographs.
6. Every new line is a plain sentence, with no dash or hyphen separator. Since the merge carried PB2's rule 2 (an estimate is stored, never shown), the stays notice says "Carta's price".
7. Removed: a false "No flight that day" and a false "No flight found"; a listed building under What's on.

---

## T731: what a saved setting does to a planned trip

### Task ID

T731

### Date

2026-10-24

### What changed

The trip settings sheet takes an optional `planned` flag and an `onSaved(next, prev)` that may answer one notice (`{ text, actionLabel, onAction }`), shown at the top of the sheet. The planned trip's `applySettings` (TripPlannerTab) works through the changes in order:

- party: moves the trip, as before;
- newly booked flights: "add what you paid", with Add the fare (closes the sheet, scrolls to the way there);
- newly booked stays: the same, with Go to the stays;
- From: drops the trip's own departure airport (`setAnchorOrigin(null)`, newly exported by `useTripPlanner`), so the flights are priced from the app's From;
- an exact new start: moves the trip with its nights and says the new date;
- any other When: says the trip keeps its dates;
- the guide answers: say they steer suggestions.

The guide group carries the same line under its title on a planned trip. The commit also carries `verify_plan_mocks.mjs` following the free field's countries (left out of the T676 commit).

### Files touched

**Modified:** `src/planner/TripPlannerTab.jsx`, `src/planner/flow/TripSettingsSheet.jsx`, `src/hooks/useTripPlanner.js`, `src/styles/86-plan-flow.css`, `src/i18n/*.js` (8 keys), `scripts/verify_plan_mocks.mjs`

### Commands run

Static checks; `t733.mjs` F (From changed on a planned trip).

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| From changed on a planned trip: flights priced from it | no (the trip's own airport held) | yes (AMS file read, row re-priced) | fixed |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A From change in the sheet would not move a planned trip's flights | the trip keeps its own `anchorOrigin` | cleared on a From change |

### What is still open

None.

### Rollback procedure

`git revert 4424393 1e376c4` in the app.

---

## T732: the planner's CSS out of the first paint

### Task ID

T732

### Date

2026-10-24

### What changed

`node scripts/css-routes.mjs --split` on a fresh build moved 240 rules (27 KB) of `86-plan-flow.css` into `planners/86-plan-flow.css`, imported by `planners.css`, which the planner's lazy entries already import. The 1,209 rules that could lose the cascade stay global (8.9 KB). It touched no other file. `--check` on the next build holds at the same 4 findings.

### Files touched

**Modified:** `src/styles/86-plan-flow.css`, `src/styles/planners.css`
**Created:** `src/styles/planners/86-plan-flow.css`

### Commands run

`PF_OUT=<dir> npx vite build --config ../vite.t653.mjs`, `node scripts/css-routes.mjs --split <dir>/assets`, rebuild, `--check`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| First-paint stylesheet (`index-*.css`), raw | 814,222 B | 790,604 B | -23,618 B |
| Same, gzip | 131,916 B | 128,826 B | -3,090 B |
| css-routes findings | 4 | 4 | 0 |

### What broke and how it was fixed

No issues.

### What is still open

None.

### Rollback procedure

`git revert ec6fcd8` in the app.

---

## T733: real flight figures, and two false claims

### Task ID

T733

### Date

2026-10-24

### What changed

The flight files on the data host cover 24 Oct to 11 Dec 2026, 15 swept dates per airport. Read through Playwright (`route.fetch`, CORS added for the page), the check found:

- **Compare works with real fares:** November from Brussels shows Portugal €106 (FAO), Spain €75 (BCN), Italy €50 (LIN).
- **A planned day the sweep never covered said "No flight that day" once the 20-second live wait gave up.** Carta did not know. Such a day is now `unknown`: "No fare found for that day yet. Add yours, or look on Google Flights." "No flight that day" stays for a day known to have none. This covers TripItinerary, TravelLegsSection and the FlightRow text.
- **For a month past the sweep's last day, compare said "No flight found".** It now says "Fares this far ahead are not out yet". `sweepEnd(file)` is new, with its test.

The live search was not run against the real host (it answers on the deployed domain); its path is proven with the mock in `verify_plan_mocks.mjs`.

### Files touched

**Modified:** `src/planner/TripItinerary.jsx`, `src/planner/TravelLegsSection.jsx`, `src/components/flights/Flights.jsx`, `src/lib/countryCompare.js`, `src/planner/CompareSheet.jsx`, `tests/countryCompare.test.mjs`, `src/i18n/*.js` (2 keys)

### Commands run

`node t733.mjs <out> 1280` and `390`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Real flight figures checked | 0 | compare and planned trip, 2 widths | +5 checks |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `VITE_DATA_BASE=/r2data` did not route the flight files | the flights host reads the data host directly | fetched by Playwright instead |
| "No flight that day" for an unanswered day | `undefined` (unknown) fell into the `none` state after the wait | an `unknown` state |

### What is still open

None.

### Rollback procedure

`git revert 0beb209` in the app.

---

## T734: the insider tip, and What's on

### Task ID

T734

### Date

2026-10-24

### What changed

- **The insider tip.** `townGuide` takes the dossier's rule tips of the advice kinds (`INSIDER_TIPS`: hidden gem, time it with, shoulder beats peak, half a day, two days, pair with, crowds, the listed centre, free parking, beach days, gateway, warm winter), up to three, in that order. DayTownGuide phrases them with the destination page's `tipText`.
- **What's on** lists only entries with months.
- **Data.** In a sample of 400 of the 3,869 dossiers, every one carries tips. Douro now reads: "Still under the radar. Weekdays feel local." and two more.

### Files touched

**Modified:** `src/planner/days/townGuide.js`, `src/planner/days/DayTownGuide.jsx`, `tests/townGuide.test.mjs`

### Commands run

Static checks; `t676.mjs` D at 390 with the tip check.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Town guide's insider tip row filled (sampled dossiers) | 0 of 400 | 400 of 400 carry tips; the advice kinds fill it | +400 |

### What broke and how it was fixed

No issues.

### What is still open

One dossier (`gem-douro`) holds a time-it-with name that is a sentence ("Join the vindima harvest"), so the tip reads "Time it with Join the vindima harvest in Sep". The destination page shows the same; it needs a pipeline fix (T734-a).

### Rollback procedure

`git revert 9a375cb` in the app.

---

## T735: master merged in, ready to merge

### Task ID

T735

### Date

2026-10-24

### What changed

- **App master merged in** (6fc164e, PB1 and PB2): no textual conflict. The merged rules apply as they are; PB2 already dropped the estimate mark inside `formatEst` and `Money`, so every planner figure follows. One string of this branch named provenance on the page ("Carta's estimate"); it now says "Carta's price", in six languages.
- **Root main merged in:** the register's two appended blocks are kept whole.
- **Mirror:** the app's T731 to T735 applied as a patch under `continent-app/`, then compared file by file with the app head: no difference but line endings.

### Files touched

**App:** the merge commit 0e89fc2; `src/i18n/*.js` (1 key replaced). **Root:** the merge commit 5d80cf28f (`Execution/_OPEN.md` resolved), mirror 47e8e2159.

### Commands run

`git merge --no-ff --no-commit master` (app), `git merge --no-ff --no-commit main` (root), `git diff --binary 8bddc71 9a375cb` and `0e89fc2 2ba2363` applied with `git apply --directory=continent-app`, the whole end check.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Commits on master missing from the branch (app) | 22 | 0 | -22 |
| node tests | 769 (725 pass) | 809 (765 pass) | +40, from master |
| design-lint findings | 29 (master 29) | 32 (master 32, the same findings) | as master |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `_OPEN.md` conflict | both sides appended rows at the end | both blocks kept |
| "Carta's estimate" on the page | PB2's rule 2 arrived with the merge | "Carta's price" |

### What is still open

The owner merges and deploys (T735-a). If master moves before then, merge it into `p15-planner-final` once more and rerun the three end-check scripts.

### Rollback procedure

App: `git reset --hard 9a375cb` on `p15-planner-final` drops the merge (or delete the branch: `p15-day-planner` still holds batches 1 and 2). Root: `git reset --hard 232e69f27` likewise. Nothing reached master, main or production.

---

## Register rows

Closed:
- T654-b by T732;
- T671-a and T673-a by T734;
- T675-a by T731;
- T676-b by T733;
- T660-a and T676-a by T735, folded into T735-a.

Raised: T734-a, T735-a.
