# T099: I1, price the trip on the trip page

## Task ID

T099 (mind-map number T095), branch `p6-i1-first-run` in both repos.

## Date

2026-10-07

## What changed

The destination page and the trip page now show a priced, itemised total the moment they open, before the visitor is asked anything. It is the first-run receipt that `docs/FIRST_RUN_RESULT.md` designs and the owner approved on 2026-10-07 (T362, rows T211-d and T211-a). The task text asked for flights, a cabin bag and transfers from the remembered airport; the session notes override that, because Carta prices no flights (T272, T273). So the receipt carries the lines Carta does stand behind: the stay, for every night and every person, and food and drink, each with its provenance in a second row, plus one flight line that exists only when the traveller types what they paid. The departure airport is asked in exactly one place, the "Your flight" sheet behind the "Add your fare" door under the receipt, and it is remembered through `choices.origin`, the same field the planner and the URL mirror already persist.

How it works. `src/lib/firstRun.js` prices the receipt from the existing engine: the stay through `accommodationPerPerson` (season, length-of-stay discount, cleaning, the platform fee and the stay tier, exactly as `composeTrip` prices it) and the days through `groundSpendPerPerson` (the function the Explore cards and the planner use, so a card and a receipt cannot disagree about dinner). No fare table is read. Figures keep their cents; the food line is computed from the per-day figure it prints, so "7 days x 7 x €54.67" multiplies out to the line's figure exactly. A line whose figure stands in from a national basket carries a tilde and the `est.` tag (with "estimated, not a live quote" as screen-reader text), and a total that contains one inherits it. A broken bed harvest borrows the country median from the `computeCosts` row and says so. The footer names one input that moves the total: while the dates are still Carta's, the measured stay tier that changes it most; once the dates are the visitor's own, or when no other tier is measured in the town, the week after, or four weeks after when the bed rate is flat across the month (a footer that names an input which moves nothing says nothing). `src/components/FirstRunReceipt.jsx` renders it in the order the design fixes: the orientation line, an input strip (stay tier and the two dates; the party-size cell is T100's), the card, the one primary "Set your dates" (which focuses the arrive field and opens its picker), the flight sentence with its door, and the exclusions sentence. The orientation line and the full provenance sentences appear only on the first run; `carta.firstResultSeen` is written to localStorage when the visitor changes an input or scrolls past the card, and a returning visitor gets one short fact per line instead. A typed fare is remembered per receipt (`carta.ownFares`, keyed `dest:<id>` or `journey:<id>`, newest 40 kept), so a fare typed for Trieste never appears on Lisbon. The receipt reads and writes the app's own inputs through one context, `src/lib/firstRunContext.js`, provided once in `App.jsx`, so changing the stay or the dates on a receipt changes them everywhere, the way the Lifestyle panel does.

Where it sits. On the destination page the receipt is the first thing in the grid: straight under the fact strip on a phone, at the head of the right column on a desktop with the side folds below it. On the trip page it replaces the written budget range inside "What the week costs", priced at the nearest catalogue town with a bed and a food figure within 30 km of the trip's point (the same radius T103's price row borrows within, `MAX_KM` in `src/lib/priceMonths.js`); the rail-alternative line stays under it, and a trip with no town in reach keeps its written range. While "Set your dates" shows, the page's own accent button ("Plan a trip here" on the destination page, "Price a trip to {city}" on the trip page) turns secondary, so there is never a second primary; once the dates are the visitor's own the receipt drops its primary and the page's comes back.

Default dates now come from the calendar, as the approved design asks: the first Saturday at least four weeks out, for `meta.defaults.trip_length_days` nights (`calendarDefaultWindow`, wired in `src/hooks/useAppData.js`). On 2026-10-07 that is 7 to 14 November 2026. The fare window still bounds it: when the frozen fares end before that week does, or the week books no round trip at all, the old fare-derived window stands in, so the Destinations tab's price chips never open on an empty week. `useAppData` now also returns `defaultDates`, the pair it actually applied, which is how the receipt tells Carta's dates from the visitor's.

One deliberate departure from the design document. Its key table names the ground line "Food and getting around", but the engine prices no local transport (`dest.local_transport` carries a rental day rate and a sentence, never a fare, and `composeTrip` adds nothing for it). Printing "getting around" over a food-only figure would be the kind of untraceable claim the receipt exists to avoid, so the line ships as "Food and drink" and "local transport" leads the exclusions sentence. Register row T099-d asks the owner to either accept the label or have local transport priced.

The landing page (T209, running beside this session) shows a receipt demonstration; `priceReceipt` and the `FirstRunReceipt` component are the pieces it can reuse so the landing receipt and this one cannot disagree.

## Files touched

All in the app repo (`continent-app/`, branch `p6-i1-first-run`, commit `f27c1fe0d7269f7dcdabbe8bfe0d5e13fa695eba`), plus this report and the register in the root repo.

**Modified:**
- `continent-app/src/App.jsx` (provides the first-run context; reads `defaultDates`)
- `continent-app/src/hooks/useAppData.js` (calendar default dates; returns `defaultDates`)
- `continent-app/src/browse/DestinationPage.jsx` (receipt slot in the grid; quiet "Plan a trip here" while the receipt's primary shows)
- `continent-app/src/browse/JourneyPage.jsx` (receipt in "What the week costs" at the nearest town; written range as the fallback; quiet gateway button)
- `continent-app/src/i18n/en.js`, `de.js`, `es.js`, `fr.js`, `it.js`, `nl.js` (37 `receipt.*` keys each, additions only)
- `continent-app/src/styles.css` (one `@import` line at the end)
- `Execution/_OPEN.md` (T187-c closed; T099-a to T099-e raised)

**Created:**
- `continent-app/src/lib/firstRun.js`
- `continent-app/src/lib/firstRunContext.js`
- `continent-app/src/components/FirstRunReceipt.jsx`
- `continent-app/src/styles/38-first-run.css`
- `continent-app/tests/firstRun.test.mjs` (10 tests)
- `Execution/P6/T099-price-the-trip.md`

**Deleted:** none.

`38-first-run.css` also carries one rule outside the receipt: at 720 px and below, the destination page's three head-action buttons may shrink (`min-width: 0` on the grid items). Checking the page at 380 px showed "Open in Google Maps" pushing `.destp-scroll` 62 px sideways, which was there before this task; the labels already ellipsize, so letting the items shrink is the whole fix and the page now has no horizontal scroll.

## Commands run

In `C:\Users\Gebruiker\Documents\Portfolio\wt\T099-app`, with `CARTA_SUPABASE_URL` and `CARTA_SUPABASE_SERVICE_KEY` unset in every shell:

```
node --test tests/firstRun.test.mjs
npm run lint
node scripts/ci/design-lint.mjs
npm test
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npm run build
node node_modules/vite/bin/vite.js preview --config ../T099-shots/vite.config.mjs
node ../T099-shots/shoot.mjs                      (TAG=build, then STYLE=Hiking TAG=build-hike)
node ../T099-shots/coverage.mjs <app worktree>
rm -rf dist dist-data
```

The helper scripts, the Vite config with its own `cacheDir` and port 5208, and the screenshots live outside the worktrees in `C:\Users\Gebruiker\Documents\Portfolio\wt\T099-shots\`. The i18n keys were appended by `add_keys.py` and `add_after.py` there, which keep each catalogue's BOM and CRLF line endings; `git diff --stat` on each catalogue shows 38 added lines and nothing else.

## Config and secrets set

None. Two new localStorage keys, both per-viewer conveniences that nothing depends on: `carta.firstResultSeen` ("1" once the first result has been acted on or scrolled past) and `carta.ownFares` (the typed fares, keyed per receipt). A blocked or cleared store shows the first-run form again and forgets the fare, which is the right failure.

## Before/after measurements

Coverage and time are measured on the shipped catalogue (`continent-app/public/app_data.json`, 3,868 destinations, `meta.defaults.group_size` 7) and the 253 trips in `continent-app/public/journeys/journey/`, by `T099-shots/coverage.mjs` with the default inputs (7 nights from 2026-11-07, entire place, the default lifestyle). The times are headless Chromium against `vite preview` of this branch's build, a fresh browser context each run, at 380 and 1280 px.

| Metric | Before | After | Delta |
|---|---|---|---|
| Inputs asked before the first itemised total | 5 wizard steps (the planner's Finish step was the only itemised total, FIRST_RUN_RESULT.md door table) | 0 | minus 5 |
| Destination pages with an itemised total | 0 of 3,868 (a per-day figure only) | 3,868 of 3,868 | plus 3,868 |
| Trip pages with an itemised total | 0 of 253 (a written range per person) | 246 of 253 | plus 246 |
| Receipts carrying at least one estimate line | not applicable | 3,705 of 3,868 | |
| Receipts with a measured bed line / a measured food line | not applicable | 1,000 / 381 of 3,868 | |
| Destination page opened by link to the receipt in the DOM | no receipt | 1,046 to 2,217 ms (four runs) | |
| Trip card tapped to the receipt in the DOM | no receipt | 249 to 293 ms (four runs) | |
| Default trip dates | the fare window (`bestFareWindow` over the frozen fares) | the calendar: 7 to 14 Nov 2026 on 2026-10-07 | |

The time-to-answer figure the design asks for, a stranger saying what the number is within fifteen seconds, needs people: it is the owner's five-person test, register row T187-b, which stays open and can now run on this branch's preview build. What this task can report is the machine half of it: the priced answer is on screen about a second after a destination link opens and about a quarter of a second after a trip card is tapped, with no input asked.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The footer read "A week later would be" the same total | With no other stay tier measured in the town, the footer fell back to the week after, and the bed season is read per month, so a week inside the same month changes nothing | The footer steps to four weeks later when the week after does not move the total, and names it as such (`receipt.footerMonth`) |
| The two date fields were cut off in the destination page's 380 px desktop column | A three-cell strip in a narrow column | The strip is a container; under 460 px it takes two rows, stay across and the two dates below |
| Destination page scrolled 62 px sideways at 380 px | The head-action grid items would not shrink below their labels (present before this task) | `min-width: 0` on those items at 720 px and below |
| `styles.css` showed five changed lines for a one-line import | The file mixes LF and CRLF lines, and the editor wrote the tail as CRLF | Restored the original LF endings; the commit adds exactly one line |
| Escape in the flight sheet would have closed the whole page | The page's focus trap listens on the document in the capture phase | The sheet uses the same `useFocusTrap`, so it is the newest trap and Escape closes only the sheet (checked in the browser run: sheet gone, page still open) |

## What is still open

The planner's Finish step still shows its own receipt rather than this component. The design wants the same receipt at all three doors so that a reader who has seen one can read the others; the planner's block in `TripPlannerTab.jsx` also prices transfers and drives, which this receipt does not, so moving it over is a task of its own (T099-a).

On the trip page the receipt now sits beside three figures that still come from the written budget: the suitability strip's cost cell, the "Budget" and "Per day" facts, and the cheaper-trip exits. They are per person and the receipt is for the group, but two different numbers on one page is the thing the product cannot afford. Either they read the receipt or they say they are the guide's written range. The same row covers the 7 trips with no catalogue town within 30 km, which keep only the written range (T099-b).

Hut-to-hut weeks are priced at the nearest town's beds: the Andorra High Route is priced at Andorra la Vella's entire-place rate. The orientation line says so ("at Andorra la Vella's own rates"), but a hut night is not an Airbnb night. A hut tier, or a line that says the huts are not priced, is a product and data decision for the owner (T099-c).

The ground line label: shipped as "Food and drink" where the design says "Food and getting around", for the reason under "What changed" (T099-d).

After the first run the design puts the full provenance behind the InfoDot glossary that T193 brings; there is no InfoDot component in `src` yet, so the returning visitor's second rows show the short fact only, with no way to the full sentence (T099-e).

Not raised as rows because the next task owns them: T100 adds the party-size cell to this receipt's strip and the default of two people. Today the receipt says "7 people", because `meta.defaults.group_size` is 7 in `public/app_data.json`.

Answers to the seven carta-design questions, for this diff. One, no hex outside `:root`: every colour is a token, and the scrim is ink at 28 percent as `.lifestyle-scrim` draws it. Two, no gradient and no second saturated hue: `--accent` fills the one primary and tints the footer (`--accent-bg`), nothing else. Three, no ochre, teal or `--danger`, because there is no rating, gem or deletion on the receipt. Four, mono carries the figures, the dates in the header and the strip, the per-day multiplication and the strip's micro labels; every sentence (orientation, flight, exclusions, footer, the provenance rows) is `--ui`. Five, one primary per view: "Set your dates", and the page's own accent button turns secondary while it shows; "Add your fare" and "Change your fare" are secondaries; the sheet's "Add it to the total" is the one primary of the sheet. Six, the title carries the destination with the dates, nights and people in its sub line, the buttons carry verbs, and the diff has no em dash, no middot and none of the banned words (design-lint: 0 new). Seven, the thing removed: the receipt dropped a "fare counted" sentence I first put next to "Change your fare"; the flight line in the receipt already says it.

## Rollback procedure

In the app repo, `git revert f27c1fe0d7269f7dcdabbe8bfe0d5e13fa695eba` (or, before merge, drop the branch). That restores the written budget on the trip page, the per-day-only destination page, and the fare-window default dates. In the root repo, revert this report's commit, which also reopens T187-c and removes rows T099-a to T099-e. No data, schema or migration is involved. The two localStorage keys left in visitors' browsers are read by nothing once the code is gone and can stay.
