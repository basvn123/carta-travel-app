# T211 First-run onboarding and the empty states

## Task ID

T211 (mind-map M11)

## Date

2026-10-02

## What changed

Two design documents, no code. `docs/ONBOARDING_AND_EMPTY_STATES.md` is new and designs the first ninety seconds and every empty state. `docs/FIRST_RUN_RESULT.md` (T187) is revised so the receipt it designs no longer carries a flight figure of Carta's, which closes register row T300-k.

The first ninety seconds were designed around what the app prices today rather than around the departure airport. The mind map wrote this task when the airport was the hinge; the owner decided on 2026-10-02 that Carta does not price flights (T272) and T273 took the last Carta flight figure off the screens, so the thing that makes a number personal is now the group size, the stay style and the lifestyle, all of which have defaults in `meta.defaults`. The design's one rule follows from that: a priced result before any input is asked. The Destinations tab opens on walks (hikers lead, T203 and T275) under one sentence with the catalogue count read from `meta`, every card carries the town's day price with its provenance word, the first tap lands on a page with a priced day, and the second tap opens the receipt from `docs/FIRST_RUN_RESULT.md`. The airport is asked once, inside the flight door under that receipt, in a sheet that also takes the airline, the fare and the days, and it is remembered in `choices.origin` exactly as the planner does today. Nothing on the path asks it earlier. The document carries a dead-end audit of each step, and it names the three product decisions it depends on (open on walks, default dates from the calendar instead of the fare window, the airport only in the flight door) so the owner approves them knowingly.

The empty states were inventoried in `continent-app/src` outside the admin screens: 71 distinct messages rendered on an empty, gone, not-found or no-match condition. 29 of them name what is missing and offer nothing to do; one pattern (`scope.farHead`) names the nearest alternative; none offers three across a border; none prints a coverage reason in words although the wire carries a `why` on 2,624 region rows and T111 built the seven-code contract; three say a layer "has not shipped yet" when it is a load failure; two are hardcoded English; seven keys in `en.js` are rendered by nothing. The document writes the copy for all 71 in English (42 are kept as they are, the rest rewritten), defines one coverage module (count line, reason sentence, the nearest three, one secondary button) that serves every country, region and radius state, fixes the sentence for each of spec 0.4's seven reason codes and for the three `why` values the wire carries today, and writes the country empty states for the seven microstates spec 1.6 names, from what each publishes on the wire.

The revision of `docs/FIRST_RUN_RESULT.md` removes the two flight lines, the cabin bag line and the two airport transfer lines from the receipt, replaces the flight sentence with the `trip.flightNotPriced` sentence and the `trip.addOwnFare` door T273 already put in six catalogues, adds the typed-fare line as the only flight line that can exist, moves the tilde and `est.` from the flights to the lines that stand in from the national basket, drops the airport cell from the strip, rewrites the copy table and the orientation line, and changes test question 2 from "Where would you be flying from?" to "Is your flight in it?". Everything else T187 designed (the line order, the provenance rows, the footer, the single primary "Set your dates", the first-run flag, the layout, the test protocol) is unchanged.

## Files touched

Root repo, branch `p12-onboarding-empty-states`. The app repo is untouched.

**Modified:**
- docs/FIRST_RUN_RESULT.md
- Execution/_OPEN.md (four rows appended, T300-k closed)

**Created:**
- docs/ONBOARDING_AND_EMPTY_STATES.md
- Execution/P12/T211-onboarding-and-empty-states.md

## Commands run

All reads were made in the main checkout, which holds `continent-app/` and `app_data/`; the sparse worktree holds neither.

```
python Execution/_queue/xmind_prompt.py T211
grep -rn "className=\"[a-z-]*(empty|Empty|none|gone|notfound)[a-z-]*\"" continent-app/src --include=*.jsx
grep -rhoE "t\(['\"][a-zA-Z]+\.[a-zA-Z0-9]*(none|empty|gone|notFound|noHits|noMatch|...)[a-zA-Z0-9]*['\"]" continent-app/src --include=*.jsx | sort | uniq -c
grep -nE "^\s*['\"](<the keys above>)['\"]\s*:" continent-app/src/i18n/en.js
python - # continent-app/public/coverage.json: status and why counts per layer, the microstate regions
python - # app_data/app_data.json: destinations per country, meta.defaults, meta.origins
grep -n "REASON_CODES|MICROSTATES|KNOWN_GAPS" pipeline/regions/coverage.py
```

No build, no data write, no migration.

## Config and secrets set

None.

## Before/after measurements

"After" is the state the design specifies; the code moves when T211-b and T099 implement it.

| Metric | Before | After | Delta |
|---|---|---|---|
| Distinct empty states rendered outside admin (`continent-app/src`) | 71 | 71, each with written copy | 0 |
| Empty states that name what is missing and offer nothing to do | 29 | 0 | -29 |
| Empty states that offer the three nearest alternatives | 0 | 14 | +14 |
| Empty states that print a coverage reason in words | 0 | 7 | +7 |
| Empty states whose copy is stale ("layer has not shipped yet") | 3 | 0 | -3 |
| Empty states hardcoded in English outside the catalogues | 2 (`Dropdown.jsx` 136, `GuidedTripWizard.jsx` 3156) | 0 | -2 |
| Empty-state keys in `en.js` rendered by nothing | 7 | 0 | -7 |
| Reason codes with a fixed sentence | 0 | 7 of 7 (`REASON_CODES`, `pipeline/regions/coverage.py` line 515) | +7 |
| Microstates with a written country empty state (spec 1.6 names 7) | 0 | 7 | +7 |
| Receipt lines in `docs/FIRST_RUN_RESULT.md` carrying a Carta flight figure or depending on one | 5 (flight out, cabin bags, airport to city, city to airport, flight home) | 0 | -5 |
| Questions asked before the first priced total on the first-run path | the planner's wizard steps, or a tab switch for a per-day figure | 0 | |
| Taps from first paint to an itemised total | behind the wizard | 2 | |

Coverage facts the design rests on, from `continent-app/public/coverage.json` (`coverage_v1`, generated 2026-09-04, 2,077 regions): `why` is set on 700 beach rows (`no_coast_or_large_lakes`), 641 lake rows (`no_lakes_over_5ha`) and 1,283 mountain rows (`relief_below_250m`); no region carries a `code` and there is no `contract` block, so T111's output has not reached the wire.

## What broke and how it was fixed

No code ran. Two things found and recorded rather than fixed, because they are outside this task's files.

| What | Cause | Fix |
|---|---|---|
| `docs/FIRST_RUN_RESULT.md` was approved (T272) on the same day its premise was banned (T272) | The owner approved the T187 text and decided on flights in one sitting | Revised here; T211-d asks for the approval again |
| `public/coverage.json` has no reason codes although T111 wrote them | The coverage audit is a data-lane run that has not been made since T111 | T211-c, owner-started data lane |

## What is still open

The owner approves `docs/ONBOARDING_AND_EMPTY_STATES.md`, and with it the three decisions it depends on: the Destinations tab opens on walks instead of journey styles, the default dates come from the calendar and not from the frozen fare window, and the departure airport is asked only inside the flight door. T211-a.

The empty states are implemented from the document's tables: the coverage module with its reason sentences and nearest three, the 29 rewritten states, the two hardcoded strings moved into keys, the three stale layer sentences turned into load-failed states, the seven dead keys deleted, and the five detail-page sections that vanish given their one line, all in six catalogues. T211-b, after T211-a.

The reason codes reach the wire. `pipeline/regions/coverage.py` (T111) writes a `code` on every non-ok region and a `contract` block, but the `public/coverage.json` in the main checkout predates that run. Until it is rerun in the data lane the module keys on `status` and `why`, which the document maps; the seven code sentences wait for the field. T211-c, owner-started, before T211-b.

The owner approves the revised `docs/FIRST_RUN_RESULT.md` before T099 builds it. The T272 approval covered the T187 text, which priced flights. T211-d, before T099. This closes T300-k.

## Rollback procedure

`git revert` the T211 commit on `p12-onboarding-empty-states`, or delete `docs/ONBOARDING_AND_EMPTY_STATES.md` and this report, `git checkout c90ca440c -- docs/FIRST_RUN_RESULT.md`, and remove the four T211 rows from `Execution/_OPEN.md` while setting T300-k back to `open`. No app, pipeline or data file changed.
