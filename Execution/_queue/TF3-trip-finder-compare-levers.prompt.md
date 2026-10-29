# Batch TF3: compare and levers (T802 to T803)

You are running batch TF3 of the Carta trip finder plan. TF1 built the engine, `findTrips`. TF2 put it on screen as Trips for you: the loader, the priced trip cards, the live receipt, the line pickers, and "Plan this trip".

TF3 adds two things on Trips for you:

- **Compare.** The traveller ticks two to four trips and sees them side by side in one table, with the best value in each row marked.
- **Levers.** Trade-off chips for flight, food and bases. Moving a chip re-prices and re-orders the list in place, in under 100 ms.

Follow `CLAUDE.md` in batch mode: one batch branch, one commit per task (`T{n}: ...`), static checks per task, one browser round at the end, then one report and the register rows.

This is design work:

- Run **/impeccable** for both screens, in Operate mode.
- Load its craft floor before the first UI edit.
- Use the **carta-design** skill as the rule that wins.
- Read `PRODUCT.md` and `DESIGN.md` first.

## Where to run it

TF1 and TF2 live only in the worktree `.claude/worktrees/travel-app-ui-refinements-5e0525`:

- TF1 is on branch `p15-trip-finder-engine`.
- TF2 is on branch `p15-trip-finder-screens`, which builds on TF1.

Neither is merged (row T792-a). In that worktree, `continent-app/` is a plain folder of the root repo.

**Before you start,** check that TF2 is finished:

- its report `Execution/P15/T797-T801-trip-finder-screens.md` is committed
- `git status` in the worktree is clean, apart from untracked queue prompts

If either check fails, stop and say so. Never work on top of another session's open edits.

**Branch.** Run TF3 in the same worktree. Cut a new branch `p15-trip-finder-compare` from the tip of `p15-trip-finder-screens`. One branch holds the whole batch.

**Do not merge, mirror, push or deploy.** TF1 to TF3 ship together, by the owner.

## Read first

1. **The plan:** https://claude.ai/artifact/CWqb1r4aCvzrCYrjn21TUj. Read it with the Artifact tool (`action: "read"`).
   - Its "Compare" screen and the lever chips at the top of its "Results" screen are the layout to copy closely, in Carta's tokens, type and icons.
   - Then read its database collection `review` with ArtifactData (`list`). The owner's Go or Change notes for `tf3` and `plan` override this prompt wherever they differ.
2. **The reports and the contract:**
   - the TF2 report, `Execution/P15/T797-T801-trip-finder-screens.md`
   - the TF1 report, `Execution/P15/T792-T796-trip-finder-engine.md`: the T794 section (levers) and the T795 section (flight options)
   - the contract, in `Execution/_queue/TF1-trip-finder-engine.prompt.md`
3. **The owner's picks:** https://claude.ai/artifact/7WFimdaK7kRucMARKkLePr, collection `reactions`.
4. **Memory:**
   - `travel-app-help-me-choose-results`
   - `travel-app-trip-finder-tf1`
   - `mimic-references-in-carta-colours`
   - `placeholders-for-unsupported-features`
   - `escape-stack-capture-phase`
   - `travel-app-playwright-sw-route-gotcha`
5. **The existing compare.** Read `src/planner/CompareSheet.jsx` (T670, countries side by side) and `lib/countryCompare.js`.
   - TF3 copies their table pattern for trips:
     - the options are columns
     - one row per figure
     - the header row is sticky
     - two columns fit a phone
   - Roadmap row 5.13 (the vote link) will share this layout later. So keep the table's rows in a pure module it can reuse.
6. **Open rows.** Read the `open` rows in `Execution/_OPEN.md` owned by `next task`, and any rows the TF2 report opened. Take the ones this batch covers.
7. **Task numbers.** Check them before you take any.
   - On 2026-10-28, T798 was taken twice: by TF2's trip card, and by the flight sweep's late tier (app commit 8866484, branch `p11-late-flights`).
   - Take the highest number from `git log --all --oneline` in both the root repo and `continent-app/`, from every worktree's `Execution/` folder (`git worktree list`; several live under `Portfolio/wt/`), from `wt/vite.t*.mjs`, and from ListAgents. Count up from there.
   - If T802 and T803 are taken, shift the batch up and say so in the report.
   - If no report or register row names the T798 collision yet, add one row for it, owned by `user`: a renumber is the owner's call.

## What the engine already gives you (do not change its rules)

- **Levers.** `findTrips(input, { levers })` in `src/lib/recommend/rank.js` accepts `{ flight, food, bases }`. The memoised build is reused, so a lever only re-ranks; TF1 measured about 1 ms in node.
- **Each lever maps onto an existing setting,** as the `levers` block of `config/recommend.json` says:
  - `flight`: `cheapest | quickest | times` onto `flightRank` (`price | comfort | balanced`)
  - `food`: `cook | mix | out` onto Lifestyle (`Backpacker | Easygoing | Foodie`), which are the food slot's own options
  - `bases`: `one | several` onto `guide.shapes`
- **The flight lever's gap.** On swept data alone, the `flight` lever changes nothing today. The sweep holds one fare a day, and the live options only load in the picker (T795). See the T803 rule below: never draw a lever that does nothing.
- **One trip object.** The card, the receipt and the compare table all read the same trip object, so their figures agree by construction. Keep it that way.

## Owner decisions this batch implements (2026-10-28)

- **Several trips on screen, and a compare view.** In the owner's words: "the possibility that you can see multiple trips really".
- **Trade-off levers** are part of the app. They sit on Trips for you and re-rank in place.
- **Best value per row** is marked in sun yellow, the colour's one job (carta-design: sun marks the best value, nothing else).
  - Mark exactly one cell per row.
  - Mark no cell when the row is tied, or has fewer than two figures.
- **No confidence bands, no tilde, no "est." or "live" mark** on a price (price rule 2). A missing figure draws NotYet and is never the best.
- **Not in this batch:** the share link and each person's keep or skip (TF4, decide together), and the heart (TF4, keep). Draw no control for them.

## Tasks

### T802: the compare tray and the compare table

**Files**

- New:
  - `src/lib/recommend/compare.js`: pure; the rows and the best-value pick
  - `src/planner/finder/TripCompare.jsx`
  - `tests/recommendCompare.test.mjs`
- Edit:
  - `src/planner/finder/TripCard.jsx`: the tick
  - `src/planner/finder/TripsForYou.jsx`: the tray, and opening the sheet
  - the finder style sheet TF2 created
  - the i18n files
- Do not edit `planner/CompareSheet.jsx`. Copy its pattern. Reuse its CSS classes only where they are not scoped to the country compare.

**The tick**

- Each card gets a "Compare" toggle: a real checkbox with a label, reachable by keyboard.
- At most four trips can be ticked. A fifth tick says "Compare up to 4 trips" in one line and does nothing else.
- Ticks are kept in memory for this visit, per answer set, keyed like the build memo. They clear when the answers change.

**The tray**

- It appears at the foot of Trips for you once two or more trips are ticked.
- It reads "{n} trips to compare" and has one action, "Compare".
- It sits clear of the bottom nav and the phone's safe area.
- On desktop it is a slim bar inside the plan stage, not a second primary competing with a card.

**The table: the sheet**

- It opens as a sheet on the same sheet primitive TF2's receipt uses (`SheetShell`). Add no second primitive.
- The title is "Compare trips".
- The columns are the trips, each headed by the trip's name and a small photo. No text on the photo.

**The table: rows, top to bottom**

1. **Total a person,** in whole euros.
2. **Flight.**
3. **Stay.**
4. **Days:** food plus getting around.
5. **Match:** the % only where `match.pct` is set.
6. **Door to door:** the flight's duration plus the gateway transfer, from the trip's facts. NotYet when either is missing.
7. **Weather:** the month's day highs for the trip's places, from the same climate source `reasons.js` reads.
8. **Crowds:** the month's crowd level, from the same source `fit()` uses for a quiet traveller.
9. **Budget:** the ruler's "under" or "over" when there is a budget. Hide the row when there is none.

`compare.js` builds every row from the trip objects. The component computes no figure.

**The table: best value**

For each row that has a "better" direction, mark the one best cell in sun yellow:

- lowest, for money and time
- highest, for match
- closest to the weather answer, for weather
- quietest, for crowds

Use the existing best-value chip and the `--sun-*` tokens. Add no new colour.

**The table: layout and actions**

- Two columns fit a 390 px phone.
- Three or four columns scroll sideways inside the sheet, with the row labels sticky. The page itself never scrolls sideways.
- Each column's foot has "Open" (the receipt) and "Plan this trip" (TF2's hand-off).
  - Only one primary is visible at a time: the column in focus.
  - The other columns' buttons are quiet.
- Removing a trip from the table unticks it on its card.

**Focus and Escape**

- Closing the table returns focus to the tray.
- A receipt opened from the table returns to the table. Mind the gotcha `escape-stack-capture-phase`.

**Tests:** `tests/recommendCompare.test.mjs` pins:

- the row order
- one best per row
- no best on a tie or with one figure
- NotYet is never the best
- the budget row is hidden with no budget
- every money cell equals the trip's own slot or total, to the euro

### T803: the trade-off levers

**Files**

- Edit:
  - `src/planner/finder/TripsForYou.jsx`
  - `src/planner/finder/finderHooks.js`
  - the finder style sheet
  - the i18n files
- Edit `src/lib/recommend/rank.js` and `adapters/flight.js` only for the flight-lever rule below. That change gets its own commit and is named in "What broke".
- New: `tests/recommendLevers.test.mjs`

**The chips**

- One row of lever chips under the answers bar, in three groups. Each group is a single choice:
  - Flight: Cheapest flight, Quickest, Best times
  - Food: Cook some, A mix, Eat out
  - Bases: One base, Several bases
- Brown marks only the selected chip in each group.
- Each group starts from the traveller's own answers and settings:
  - flight: the setup's priority
  - food: Lifestyle
  - bases: the shape answer

**Moving a lever**

- It calls `findTrips` with the new `levers`.
- The list re-orders in place. Cards move to their new place with a short motion. Under `prefers-reduced-motion` they jump.
- The totals and the three figures update on every card.
- The answers bar is untouched.
- A ticked compare trip stays ticked if it is still in the list.

**The flight lever must do something real on the cards**

Pick the smallest honest rule, and say in the report which one you picked:

- **(a) Re-rank by the swept facts.** "Quickest" orders by stops, then door to door. "Best times" orders by `rankFlights` comfort on the swept departure and arrival times. Prices don't change until the picker's live options exist for that trip.
- **(b) Prefetch live options for the visible six.** When the lever first moves, prefetch `optionsFor` for the six visible trips through the existing `/api/flights` cache, and swap the pick where a live option exists.

Choose (a), unless the TF2 report shows the live list is already cached for those trips.

- Under (b) the card's figure can move, and the receipt and the compare must move with it.
- Either way, the chip's helper says nothing about method.

**Bases**

- When `bases` leaves no trips, say so in one line, with one action back to "Several bases" (or "One base").
- The list is never left empty.

**Remembered**

- The levers are kept in `settings.guide.levers`, so going back to a question and returning keeps them.
- "Plan this trip" never writes the levers into the planner. The trip carries its own picks, as in T801.

**Measure**

- Measure the time from a lever tap to the re-ordered list being painted:
  - at 390 px, with 4x CPU throttling in Playwright, for 24 trips
  - the median and the worst of 20 taps per lever
- The target is under 100 ms.
- The report gives the build and re-rank split.

**Tests:** `tests/recommendLevers.test.mjs` pins:

- each lever value maps to its setting
- the food lever's totals equal a fresh `quoteTrip` at that Lifestyle
- the flight lever changes the order under rule (a), or the pick under (b)
- the same answers plus the same levers always give the same order
- an empty `bases` result falls back as above

## Checks

**Per task:**
- lint the touched files
- `npm test` from `continent-app/`: no new failures. The two T792-b failures predate TF1.
- `node scripts/ci/design-lint.mjs`

**End of batch: the build.** Run the fast NOPUBLIC build (`wt/vite.t474.mjs` pattern).
- The Plan tab's first-load JS and preload count must not grow.
- Report the finder chunk's size before and after.

**End of batch: one browser round** at 390 px and 1440 px. Use Playwright with `serviceWorkers: 'block'`, with `/api/flights` routed to the T795 fixtures. Run the DOM checks first, then take one screenshot per screen and width:

1. Tick two, three and four trips. A fifth tick is refused. The tray shows.
2. The table with two trips fits a phone. The table with four scrolls sideways inside the sheet, with sticky labels and no page scroll.
3. One sun-yellow best per row. None on a tie. NotYet is never the best. The budget row is hidden without a budget.
4. "Open" and "Plan this trip" work from a column. Escape and focus come back.
5. Each lever value: the cards re-order and re-price. Check reduced motion too.
6. The bases fallback when no trips are left.
7. Set a lever, go back to a question and forward again: the levers are kept.
8. Set a lever, then "Plan this trip": the Finish total equals the card total.

**End of batch: keyboard and screen reader.**
- Every new control has a name.
- Focus returns after each sheet.
- No console errors.

**Baseline.** Extend `scripts/trip_finder_baseline.mjs` so it prints:

| Metric | Before (TF2) | After |
|---|---|---|
| Trips the traveller can see side by side | 1 (one receipt at a time) | up to 4 |
| Lever tap to re-ordered list (24 trips, 390 px, 4x throttle) | no levers | median and worst; target under 100 ms |
| Compare cells equal to the trip's own figures | n/a | all |
| Plan tab first-load JS | from TF2 | no growth |

## Done when

- Two to four trips compare in one table, with exactly one best value per decidable row, in sun yellow.
- Every figure in the table equals the trip's own figure.
- Each lever, the flight lever included, re-prices and re-orders the list in place in under 100 ms.
- "Plan this trip", from the table or after a lever, carries the same total into the planner.
- Every screen passes the carta-design seven questions, written per task in the report.
- `npm test` has no new failures.
- The report `Execution/P15/T802-T803-trip-finder-compare-levers.md` and the register rows are committed together.

## Never

- **No Anthropic or Claude API.** No SDK, no key, no call to `api.anthropic.com`.
- **No em dashes, en dashes or middle dots,** anywhere: code, strings, docs or the report.
- **No banned words:** seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.
- **Prices:**
  - no figure shown as Carta's when it is Google Flights'
  - no tilde, "est." or "live" mark on a price
  - no confidence band
  - no price computed in a component
- **Colour:** sun yellow only for the best value, brown only for action and selection, no new tokens.
- **TF4 controls:** no share link, vote, keep or heart drawn as a placeholder.
- **Scope:** no files outside the scope above. If a refactor elsewhere would help, write it as a register row instead.
- **Git:**
  - no `git stash` while worktrees are in use
  - no merge, push or deploy
  - never work on top of another session's uncommitted edits

## Rollback

Every task is its own commit, so `git revert` any one of them.

- **Reverting T803** removes the chips. The list keeps TF2's order.
- **Reverting T802** removes the ticks, the tray and the table.
- The two tasks are independent, so either can be reverted alone.
- There is no data, schema or config migration.
