# T577 to T583: Explore tidy (owner request 2026-10-22, "/impeccable")

## Shared header

**Date:** 2026-10-22

**Batch:** seven tasks from one owner request about the Explore tab: From without airport codes (T577), flexible dates (T578), people with children and babies and the pricing behind it (T579), a compact Lifestyle panel (T580), Countries on the settings line (T581), a Getting there button that reprices everything (T582), and a cleaner Ask Carta chat (T583).

**Owner answers (2026-10-22, asked once before building):** the way button cycles Any way, Plane, Train, Bus, Car (no "On foot"); People is Adults, Children (2 to 11) and Babies (under 2) with the shares below; Ask Carta gives a short answer, then asks "Got one in mind?" before any trip card.

**Branches:** app repo `p11-explore-tidy` (from master 8054be7), with T580 and T583 built in their own worktrees (`wt/t580` on `p11-explore-tidy-t580`, `wt/t583` on `p11-explore-tidy-t583`) and merged into it; root repo `p11-explore-tidy` (from main ef515ec76) carries the mirror, the design rules, this report and the register.

**App commits:** 5efbaf6 (T579), 84fece0 (T582), 47d0763 (T578), 0508c85 (T577), 3cdbd51 (T581), 104f1d3 (T577 to T582 shared wiring: SettingsLine, App, ExploreTab, URL, i18n, CSS), 96664bd (T577 to T582 kit buttons), 40a5e2f (T580), a59b987 and 486ee16 (T583), merges 07f08cf and 9a61ef0. The settings line, App.jsx, ExploreTab.jsx and the i18n files carry several tasks at once, so T577, T578, T579, T581 and T582 revert together through 104f1d3 and 96664bd; their own library commits revert one by one.

**Checks (static, per task):** eslint on every touched file, 0 errors; `npm test` in the main checkout 648 of 648 pass (646 before T583's 2 new tests, 638 before the batch); `scripts/ci/design-lint.mjs`: 5 new `raw-button` findings, all list rows in the new pickers (row T577-a), the rest as at baseline.

**End check (browser, once, on the merged batch):** dev server on 5181, Playwright at 1440x900 and 390x844 (the shared Chrome of the DevTools tool was held by another session). Looked at: the settings line and each popover (From, When with Dates, Month and Any time, People, Countries in both modes, Getting there through all five ways), a filtered list in train mode with a family party, Lifestyle open on both widths, the phone settings sheet and the Countries sheet, Ask Carta's "Cheap places in November" with "Not yet". No horizontal scroll at 390 px. Screenshots in `C:/Users/Gebruiker/Documents/Portfolio/wt/t577/` (`n-*.png`, `e-*.png`, `p-*.png`).

**Rollback for the batch:** `git -C continent-app reset --hard 8054be7` and `git reset --hard ef515ec76` on the two branches, or `git revert` of the commits above. No data, schema or server state changed, except T583's writer prompt version (see T583).

---

## T577: From is a town, not an airport

### What changed
The settings line's first part reads "From Brussels", never "Brussels BRU". Its popover (`FromPicker.jsx`) is one search field with no placeholder (named "Search a town or country" for screen readers), a quiet "Use my location" (the device's position, named through OpenStreetMap's reverse lookup), and the countries; a country opens its towns, and typing shows matching countries and towns plus one row, "Search all of Europe for ...", that looks the words up on OpenStreetMap on press only (the explicit-action rule). A pick becomes the start of every road and rail way (`choices.drive_home`), and the flight leaves from the priced airport nearest it (`nearestOrigin` in `lib/origins.js`). On a phone the settings sheet shows the town as one row that opens the same panel. `driveOrigin` now falls back to the home town in every mode, so the car no longer waits for a separate "where do you drive from" answer.

### Files touched
Created: `continent-app/src/components/FromPicker.jsx`. Modified: `continent-app/src/lib/origins.js`, `continent-app/src/App.jsx` (setFrom), `continent-app/src/lib/runtime_pricing.js` (driveOrigin, needsDriveHome), `continent-app/src/components/SettingsLine.jsx`, `continent-app/src/styles/77-settings-v2.css` (new), i18n `from.*` keys in six languages.

### Commands run
`npx eslint` on the files; `npm test`.

### Config and secrets set
None.

### Before/after measurements
Not measured (no figure promised).

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| The phone sheet's From row and the way button were raw buttons (design-lint) | Written before checking the kit | Moved onto `Button` and `IconButton` (96664bd) |

### What is still open
The list rows in the From and Countries panels are raw buttons because the kit has no list row (T577-a). The planners' own OriginPicker (trip wizard, flight sheet) still shows airport codes; it was outside this request (T577-b).

### Screens for the end check
Desktop From popover (countries, a country's towns, a typed search, the Europe row), phone settings sheet From row. Done.

---

## T578: When is dates, a month or any time

### What changed
The When popover opens on Dates, Month or Any time over the Nights stepper; "Carta picked these dates." and the "Suggested dates" label are gone. Month shows the next twelve months as choice chips (the year on January) and moves the dates into that month, so every screen that needs a pair still has one. Explore then prices the month's cheapest return flight and the month's beds; Any time prices the cheapest return over every swept month (`cheapestReturnAnyMonth`, new) and the year's average bed. The line reads "November, 7 nights" or "Any time, 7 nights". The choice rides in the address (`df=m` or `df=a`).

### Files touched
Modified: `continent-app/src/lib/flights/flights.js`, `continent-app/src/App.jsx` (dateFlex, travelMonth, the cost index), `continent-app/src/lib/urlState.js`, `continent-app/src/browse/ExploreTab.jsx`, `continent-app/src/components/SettingsLine.jsx`, i18n `dates.*`.

### Commands run
As T577.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
No issues.

### What is still open
The destination page, trip page and the planners still read the dates as exact; a month moves the trip to the first day of the month there (T578-a).

### Screens for the end check
When popover in all three modes on desktop, the phone sheet with Month. Done.

---

## T579: People as adults, children and babies, and the price follows

### What changed
People is three rows, Adults, Children (2 to 11) and Babies (under 2), each label left and a stepper right in a popover no wider than its rows (the owner's screenshot showed a lone stepper in white space; the stepper buttons go to 36 px on a fine pointer, 44 on touch). The seats stay `group_size` (adults plus children), so every existing price reads them; children and babies are new choices (`gc`, `gb` in the address). The shares, Carta estimates, live in `lib/party.js`:

| Who | Plane | Train or bus | Bed | Food and drink |
|---|---|---|---|---|
| Adult | a seat | full ticket | a share | a day |
| Child 2 to 11 | a seat (low-cost rule) | half ticket | a share | 60 percent of a day |
| Baby under 2 | on a lap, about 30 a leg | free | none | 15 percent of a day |

A bigger party already paid less each for a shared home and a shared car (stayAtTier and carsForGroup by seats); that now holds for the new ways too. The day price on every Explore card is the party's average a seat.

### Files touched
Modified: `continent-app/src/lib/party.js`, `continent-app/src/lib/costIndex.js`, `continent-app/src/App.jsx` (setPartyParts), `continent-app/src/lib/urlState.js`, `continent-app/src/components/SettingsLine.jsx`, i18n `party.*`. Created: `continent-app/tests/travelWay.test.mjs` (with T582).

### Commands run
As T577.

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Rome, 2 adults vs 2 adults, 1 child, 1 baby, a day a person (Explore, dev data) | ~€154 | ~€131 | -€23 |

### What broke and how it was fixed
No issues.

### What is still open
The trip page, destination page and planners price with `priceTrip` (tripTotal.js), which reads its own party and not children or babies yet (T579-a). The shares are estimates the owner may want to set differently (T579-b). With a baby, the flight caption folds the lap fee into Google's price, so it is no longer purely Google's figure (T579-c).

### Screens for the end check
People popover desktop, People rows in the phone sheet, a list with a family party. Done.

---

## T580: the Lifestyle panel fits without scrolling

### What changed
The panel head is one title line ("How you'll spend") beside the close; the "Lifestyle" eyebrow, "Two answers set what a day costs...", the stay note and the trade-off sentence at the foot are gone, and the foot is Done alone. Tiles went from 74 px to 44 px on desktop (icon beside the word, three across) and 56 px on a phone (icon over word), with a tick on the selected one; "Fine tune the counts" is a quiet disclosure row. Seven keys left all six languages: `lifestyle.sub`, `lifestyle.stayNote`, `lifestyle.tag`, `lifestyle.tradeLessIn`, `lifestyle.tradeMoreIn`, `lifestyle.tradeLessMedian`, `lifestyle.tradeMoreMedian`.

### Files touched
Modified: `continent-app/src/browse/LifestylePanel.jsx`, `continent-app/src/styles/14-filters-panels.css`, `continent-app/src/styles/60-v6-shell.css`, the six i18n files. Design rule: `.claude/skills/carta-design/SKILL.md` "Lifestyle control" (no sentences in the panel).

### Commands run
eslint, `npm test` in the worktree (594 of 638 with 3 environment failures in numbersPage, no public data in a worktree; 648 of 648 in the main checkout after the merge), design-lint.

### Config and secrets set
None.

### Before/after measurements
| Viewport | Before | After |
|---|---|---|
| 1440x900 | content 746 px, just fit | 498 px, no scroll |
| 1280x720 | overflowed by 146 px | 498 px in a 531 px body, no scroll |
| 390x844 sheet | overflowed by 73 px | 563 px, no scroll |

### What broke and how it was fixed
No issues.

### What is still open
App.jsx still passes the now ignored `destination` prop, and `scripts/verify_lifestyle.mjs` expects 10 tiles where there have been 9 since T535 (T580-a).

### Screens for the end check
Lifestyle open at 1440x900 and on a phone. Done.

---

## T581: Countries on the settings line, in or out

### What changed
The desktop settings line has a Countries part ("All of Europe", "France, Italy", "4 countries", "Not France", "All but 2"). Its popover is Only these or All but these over a search and a list of tick rows, with Clear; every change applies at once. On a phone Countries is a door beside Ask Carta and Filters, opening the same panel as a sheet with Done. The one country list now reads either way (`countryNot`, in the filter state and the address as `cn` and `xo`); Explore's chips say "Not Albania", and the single-country links (the country page, the category doors) only offer themselves in Only these mode.

### Files touched
Created: `continent-app/src/components/CountriesControl.jsx`. Modified: `continent-app/src/hooks/useFilterState.js`, `continent-app/src/hooks/useExploreCatalog.js`, `continent-app/src/hooks/useDestinationSearch.js`, `continent-app/src/browse/ExploreTab.jsx`, `continent-app/src/App.jsx`, `continent-app/src/lib/urlState.js`, `continent-app/src/components/SettingsLine.jsx`, i18n `settings.countr*`.

### Commands run
As T577.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
No issues.

### What is still open
Nothing beyond T577-a (the list rows).

### Screens for the end check
Countries popover in both modes with chips, the phone door and sheet. Done.

---

## T582: Getting there, one button, every price follows

### What changed
The last part of the settings line (an icon button on a phone) steps through Any way (a pin), Plane, Train, Bus and Car. Any way is the new default. `lib/travelWay.js` prices a train, coach or car return from the From point to every place through the trip planner's own leg estimator (transport.js: the per-country fares, the landmass rule, fuel and tolls), split by the party; a place a ground way cannot reach (an island, no railway, over 20 hours one way) leaves Explore's list in that mode, and Any way takes the cheapest of the flight and the three ground ways. Every card's caption under the day price reads the way ("Train from ~€297 est.", "Bus from ~€45 est.", "Drive from ~€212 est.", or the flight with its airline as before), and so does the hover receipt. `composeTrip` takes the same ground pricer (`opts.ground`) and prices train, bus and Any way, so the Destinations figures follow too. Ask Carta's rows show the same caption, since they draw the same overview.

### Files touched
Created: `continent-app/src/lib/travelWay.js`, `continent-app/tests/travelWay.test.mjs` (8 tests). Modified: `continent-app/src/lib/runtime_pricing.js`, `continent-app/src/hooks/useDestinationSearch.js`, `continent-app/src/browse/ExploreTab.jsx`, `continent-app/src/browse/ExploreCards.jsx`, `continent-app/src/components/CostSummary.jsx`, `continent-app/src/App.jsx`, `continent-app/src/lib/urlState.js`, `continent-app/src/components/SettingsLine.jsx`, i18n `way.*`.

### Commands run
As T577; plus a timing run of `wayFor` over the catalogue from node.

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After |
|---|---|---|
| Ways Explore can price | plane (car only on the old path) | plane, train, bus, car, any |
| `wayFor` over 3,868 places, Brussels, 2 adults 1 child 1 baby | n/a | 128 ms (memoised per change) |
| Cheapest way for that party, Any way, no flight file | n/a | car 2,395, bus 547, train 156, none 770 |

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| 20 tests failed after the composeTrip change | A new `groundTotal` helper redeclared the existing on-the-ground total | Renamed to `wayTotal`, the field to `way_total` |

### What is still open
The destination page, trip page and planners price their own transport (`priceTrip`) and ignore the way button (T582-a). Links without `t` used to mean plane and now mean Any way (T582-b). Ask Carta's trip card still prices the flight only (T582-c).

### Screens for the end check
The way button through all five on desktop, captions in a filtered list, the phone icon. Done.

---

## T583: Ask Carta, a short answer and then a question

### What changed
A list answer is two or three human sentences, three compact place rows and one "More places" that adds three more ("Show all places" is gone), then a separate Carta bubble, "Got one in mind?", with the top places and "Not yet" as quick replies. A pick (a reply, a row) shows "Here's what a trip to X looks like." with the trip card; "Not yet" answers "No rush. What matters most to you?" with Warmer, Cheaper and Quieter. "Too few places matched everything...", the match count line, "In short" and the per-answer AI meta lines are gone; the one disclaimer under the field stays. The chat sits on the warm page ground with `--surface` bubbles for Carta and a `--select-bg` bubble for the traveller. A typing bubble shows for the real wait (at least 750 ms; past 2.5 s the steps replace it), then the words reveal (about 30 ms a word, under 1.5 s); reduced motion and reopened chats show at once. The writer prompt (`src/lib/ask/context.js`, version 3) asks for two or three short warm sentences, no counts, no repeated phrases.

### Files touched
Modified: `continent-app/src/browse/ask/AskTurn.jsx`, `continent-app/src/browse/ask/AskChat.jsx`, `continent-app/src/browse/AskSearchFull.jsx`, `continent-app/src/lib/ask/compose.js`, `continent-app/src/lib/ask/context.js`, `continent-app/src/styles/76-ask-chat.css`, `continent-app/tests/askChat.test.mjs`, the six i18n files. Created: `continent-app/src/lib/ask/reply.js`. Design rules: carta-design "Typing, then the words" and the answer shape, DESIGN.md Ask Carta exception.

### Commands run
eslint, `npm test`, design-lint, banned-terms, a browser run in the worktree and in the end check.

### Config and secrets set
`PROMPT_VERSION` 2 to 3 in `src/lib/ask/context.js`, which `functions/api/ask/answer.js` imports: the app and the server must ship in one release.

### Before/after measurements
| Metric | Before | After |
|---|---|---|
| A "Cheap places in November" answer, phone 390x844 | scrolled past one screen | 566 px, fits with "Not yet" |

### What broke and how it was fixed
No issues.

### What is still open
The prompt change ships with the app in one release and its answers were not seen with the live writer (T583-a, owner). "More places" stops at 6 (T583-b). The budget answer's line by line receipt is gone from the chat; only the group total shows on the row (T583-c). `AskSearchFull.jsx`'s default export is dead (with T574-b, T583-d). The off, cap and error lines still show on compare, when and about answers (T583-e). Warmer, Cheaper and Quieter were tried in English only (T583-f).

### Screens for the end check
Ask Carta on phone and desktop: typing, the answer, More places, Got one in mind, Not yet. Done; the writer was unreachable locally, so the answer seen is the local fallback line.

---

## Design: the seven questions
1. No hex outside the tokens (design-lint). 2. No gradient, no new colour. 3. Brown only on the selected tiles, chips, rows and the primary; the way button and Countries are neutral. 4. No figure under 12 px; every price through `formatMoney` or `formatEst`. 5. One primary per view (Done in a sheet, Plan this trip in the chat); no text on photos. 6. No counts or method lines added; the batch removed eleven sentences; no dashes or banned words. 7. Removed: the Countries door's selected tint, which carried nothing the label did not.
