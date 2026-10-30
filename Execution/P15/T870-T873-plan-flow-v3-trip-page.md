# T870 to T873: plan flow v3 Batch F, the trip page and after the pick

## Shared header

**Date.** 2026-10-30 (overnight run).

**Ask.** Plan flow v3 Batch F (`Execution/P15/_BRIEF-plan-flow-v3.md`, `Execution/P15/_PLAN-plan-flow-v3.md` section F). Owner's
marks: "Full trip page" Go; "Who this is for" paragraph from a template, Go "for now"; "Retire the wizard after a pick" Go; "Ready
to book in place of Review" not marked, built as proposed and registered as a `user` row (T873-a). The proposal mocks (sections
`detail` and `after` of the plan flow v3 artifact) were followed inside carta-design.

**Branches.** `p15-plan-flow-v3-f` in both repos, from the E heads. App: from `bfc7a0c`, six commits, head `7a57107`. Root: from
`0edd7b8c4` (`git checkout -b`), the sync commit `5d30b78d1` and the report commit.

| App commit | Task |
|---|---|
| `981cfab` | T871 `whoFor.js`, `tests/tripPage.test.mjs`, the strings of all four tasks in six languages, T811-d's key removals, `TogetherSheet.jsx`; the staged deletion of `TripPreview.jsx` landed in this commit |
| `fbf79f8` | T870 the trip page (`TripPage.jsx`, `FindingTrips.jsx`, `TripCard.jsx`, `TripsMap.jsx` with T871's `RouteMap`, `87-trip-finder.css`) |
| `d14caed` | T872 `TripFlow.jsx`: Plan this trip lands on the trip page |
| `413045b` | T873 `ReadyToBook.jsx`, `TripSummary.jsx`, `TripSummary.css`, `TripPlannerTab.jsx` |
| `5e24f87` | T870 fix: the price card's swap difference (`useTotalDelta`), preloads back at 36 |
| `7a57107` | T870 end check fixes: `urlState.js` keeps `#tf=`, the list's scroll is held in its own container, the cost bar's class, the fact band's alignment, the route map's padding |

Undo the batch newest first; the strings of all four tasks are in `981cfab`.

**Root sync.** `git status --short continent-app` listed exactly the batch's 21 files (16 modified, 1 deleted, 4 new; the untracked
`public/app_data/` stays out); the sync commit's numstat (1,774 added, 826 removed) equals the app's `bfc7a0c..7a57107`. DESIGN.md
(T868-d) is in the report commit.

**Register rows taken.** Closed: T811-c (T870, the photo credit), T811-d (T871), T812-c (T872, a finder trip never enters the wizard),
T802-e (T871, answered below), T868-d (T870, DESIGN.md), T861-a (T870, the price card names the home airport and the arrival
airport), T811-a and T825-a (T870, moot: the preview is gone and the page shows the four cost groups). Not taken: T855-c (Getting
there's open-jaw hint; Getting there is off the finder path now but still on the country path), T864-c (seen again in the walk: a
Lake Como trip's map draws the arrival at Bergamo while the flight lands at Malpensa; the trip page v4 map, not this batch's files).

**T802-e answered.** The sweep files carry no flight duration: `workers/flight-sweep/src/publish.mjs` writes `[price, airline, dep,
arr, stops, checkedMinute]` a day (docs/SCHEMA.md "Flight prices"). Only the live day search has minutes. The fact band's Door to
door therefore uses `thereMinutes` (the flight's minutes where present, else its clock times plus the gateway transfer); the time
zone caveat stays in T868-b.

**Checks.** `npm test` 1101 of 1101 (baseline 1096 on `bfc7a0c`; 5 new tests in `tests/tripPage.test.mjs`). ESLint on every touched
file: no error; warnings are the older `FindingTrips.jsx` react-refresh note, `TripSummary.jsx`'s chip `Icon` and the same
`Icon`-in-JSX false positive in `TripPage.jsx`'s fact band. `node scripts/ci/design-lint.mjs`: no violation on a line this batch
wrote (the `TripSummary.css`/`.jsx` hits it lists are older lines). Impeccable's detector on the touched UI files: `[]`. No dashes,
middots or banned words in the diff or the new strings (the test checks every paragraph combination in six languages).

**End check.** One NOPUBLIC build (`wt/vite.t870.mjs`, about 4 s) of `7a57107`'s code, served with `public/` by `serve-a.mjs` on 5870,
Playwright walk `Execution/P15/T870-T873-walk/walk-f.mjs`, service workers blocked, the T795 sweep fixture on `flights/BRU.json`, the
live search failing (503), From Ghent with BRU ticked. At 1440 and 375: Trips for you, a card to the trip page (address, heading and
focus, bar, gallery and credit, head, who it is for, fact band, route map and stops, what you would do, why it fits, alternatives, the
price card against the card's total, the cost bar's four colours, one primary, sticky at 1440, after the fact band at 375), Back,
Forward, the page's own back, a line's picker and Escape, an alternative opened in place, a reload on `#tf=`, Plan this trip to the
trip page v4 (no wizard element, the same total), Ready to book (rows, links, Add what you paid typed in), then the page in Dutch at
1440. **85 of 85 checks pass, no console errors** (`after/walk.json`). One screenshot per screen and width in
`T870-T873-walk/after/` (not committed). Module preloads 36. The build folders were deleted after the walk.

**Carta-design seven questions** (the trip page, its price card, fact band, route map and pins, the Ready to book list and the car
row; CSS in `87-trip-finder.css` and `TripSummary.css`):
1. No hex: every value is a token (the route line reads `--ink` through `tokenColour`). 2. No gradient and no new colour; the four
cost colours only on the bar's segments and the 8 px dots before each line's name, never on text. 3. Brown only for what acts: the
one primary (Plan this trip on the page, Plan your days on the trip page), links and the picker; the route map's stops and line are
ink (nothing on it is live or picked); the Booked chip is the kit's positive status. 4. No figure under 12 px (stop numbers and pins
`--text-caption` 700, tabular); every euro through `formatMoney` or `<Money>`; cents on the price card and Ready to book (receipts),
whole euros on the cards. 5. One primary per view; text on a photograph only the existing match pill and heart on a card. 6.
Headings carry a verb or name a section ("Who this trip is for", "What you would do", "Ready to book", "Your route"); no count, no
method line; the one line under Ready to book is the required "prices may have changed". 7. Removed: the preview dialog (scrim,
sheet, handle, tabs, its Cost tab's info buttons and Food and Stay chips, the pinned foot), Review's car block (one row now), and the
weather and crowds section (the fact band holds them).

**Impeccable pass** (Operate mode, inside carta-design; `impeccable context` and `detect`, craft floor read): the page follows the
detail page grammar (gallery, head, facts, the price card as the one bordered object, sections on the sheet's white with no cards in
cards). One batched inspection round at 1440 and 375 found four defects, all fixed in `7a57107`: the cost bar took the page bar's
class and stood 44 px high; a two-line fact label lifted its value off the row; the route map cut the last stop's name on a phone;
the list's place was not held (it scrolls in the planner's container, not the window). The confirming round passed.

---

## T870: the trip page in place of the preview

### What changed

A card on Trips for you (and an early card on the searching screen, a map pin's card, an alternative) opens `finder/TripPage.jsx`,
a page in the plan sheet, in place of the T811 `TripPreview` dialog (deleted). It has its own address, `#tf=<trip id>`, pushed as
one history step: the browser's Back and the page's "Trips for you" return to the list, which stays mounted (hidden) under the page
so its sort, map view and place hold, and focus goes back to the card. Another trip opened from the page replaces the step. A reload
or a new tab on the address opens the trips with that page (TripFlow reads the hash on mount; `lib/urlState.js` persistState keeps
`#tf=` as it keeps `#journey=` and `#dest=`). The card's name is now a link to the address (a modified click opens a new tab).
Top to bottom: the gallery across the width (the places' photos then up to two sights a place, with the place, the author and licence
from the Commons credits file and the position on the caption line, row T811-c), the head (the name as the h1, country, dates or
month, nights, bases, match), then in a 1180 px column the lead (who it is for, the fact band), the price card and the main
sections (T871). The price card: "What it costs", the group total in cents, "for 2, all in", the cost bar in `--cost-travel`,
`--cost-around`, `--cost-stay`, `--cost-food`, the four lines with their dots (Flights with "BRU to MUC, KLM, 14:55 to 19:15", Stay,
Food, Getting around), a line with choices opening its picker in the page (Escape returns), what a swap did to the total for three
seconds, save and Plan this trip. Sticky beside the main column from 1024 px; on a phone after the fact band, in the content.

### Files touched

**Created:** `continent-app/src/planner/finder/TripPage.jsx`
**Modified:** `continent-app/src/planner/finder/FindingTrips.jsx`, `TripCard.jsx`, `continent-app/src/styles/87-trip-finder.css`
(the page; the dialog's rules removed), `continent-app/src/lib/urlState.js`
**Deleted:** `continent-app/src/planner/finder/TripPreview.jsx`

`urlState.js` is outside the named files: without it the app's first URL write dropped the address, so it is the page's own path.

### Commands run

```
npm test ; npx eslint <touched files> ; node scripts/ci/design-lint.mjs ; impeccable detect --json <touched UI files>
PF_OUT=C:/Users/Gebruiker/Documents/Portfolio/wt/dist-t870 node node_modules/vite/bin/vite.js build --config ../../wt/vite.t870.mjs
node Execution/P15/T840-T843-walk/serve-a.mjs <dist> continent-app/public 5870
node Execution/P15/T870-T873-walk/walk-f.mjs 5870 after
```

### Measurements

| Metric | Before | After |
|---|---|---|
| What a card opens | a dialog (sheet on a phone), no address | a page at `#tf=<id>`, Back returns to the list |
| Price card total against the card (walk) | | 1,983.00 against 1,983, at 1440 and 375 |
| Cost colours on the trip's cost | none (the preview drew no bar) | four groups, four colours |
| Module preloads | 36 | 36 (37 on the first builds, see What broke) |
| Preview file | 505 lines | page 498 lines |

### What broke

The first builds had 37 module preloads: the preview imported `planHooks.js` and the page did not, and the bundler split `SheetShell`
into a preloaded chunk (found by building `bfc7a0c`'s files beside it and bisecting the imports); a `lib/waterFacts.js` import had the
same effect earlier. The page now uses `useTotalDelta` from `planHooks` for the swap difference, as the preview did, and reads
`climate.water_c` itself. The end check found the four defects listed under the impeccable pass and the reload losing the address;
fixed in `7a57107`.

### What is still open

- T870-a (user): calls made without the owner (pickers kept, sights in the gallery, the alternatives' order, cents on the page, no share control).

### Rollback

`git -C continent-app revert 7a57107 5e24f87 fbf79f8`, then sync the root mirror; with T871's commit reverted too the preview returns.

---

## T871: the rest of the page

### What changed

`finder/whoFor.js` writes "Who this trip is for" from a template over the trip's facts, up to five sentences each from one fact and
each in its own shape: who and what they like (the party's kind and the strongest two likes the trip matches at 50 per cent or more,
else the nights), the route (one base "so you unpack once", two with the nights in each and the way between them from the trip's
quote, three or more first, middle, last), the month (a weather word from the day highs and the highs), the crowds, and a car
sentence when a place needs one and the trip does not drive. A fact the data does not hold drops its sentence. 41 `tf.who.*` keys in
six languages, the result through `stripDashes`; the like phrases avoid an inner "and" so a list never reads "and and". Walk: "For two
people who like walking and good food. You start with 4 nights in Hallstatt, then go on to Salzburg by train for 3 nights. In
November it is cool there, with highs of 8 to 10 °C. There are visitors, but rarely a crowd. Some of the best spots are hard to reach
without a car." The fact band: door to door (T802-e, above), the weather that month, the sea that month (where the wire carries
`climate.water_c`, T871-a), crowds, getting around, the arrival airport. The route: `RouteMap` (in the `TripsMap` chunk, so no chunk is
added), numbered ink stops and a dashed ink line, then the stops with their nights. What you would do: each place's best sights. Why
it fits (a bar a like, then the reasons) beside the catch. Not quite right?: up to three alternatives as cards. T811-d: `tf.rc.close`,
`tf.rc.whyPrice`, `tf.rc.whyMatch` removed (Decide together closes with a new `tf.tog.close`), with the dialog's own `tf.pv.*` keys and
`tf.lever.food`.

### Files touched

**Created:** `continent-app/src/planner/finder/whoFor.js`, `continent-app/tests/tripPage.test.mjs`
**Modified:** `continent-app/src/planner/finder/TripsMap.jsx` (`RouteMap`), `TogetherSheet.jsx`, `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (69 keys added, 15 removed each, all four tasks)

### Commands run

As T870; `node --test tests/tripPage.test.mjs`.

### Measurements

| Metric | Before | After |
|---|---|---|
| "Who this trip is for" | none | one paragraph, every combination of party, way and band tested in six languages |
| Fact band cells shown (walk) | weather and crowds in a section | 5 (door to door 4 h 20 min, weather, crowds, getting around, airport) |
| Photo credit | the place's name (the catalogue's page title) | author and licence, or a link to the file page |
| npm test | 1096 | 1101 |

### What broke

Nothing in the end check after the T870 fixes.

### What is still open

- T871-a: no sea temperature on the destination wire, so the Sea cell never shows yet.
- T871-b (user): the template's words and thresholds, made without the owner.
- T871-c: `whyLine` and its `tf.why.*` keys are unused since the preview's Cost tab went.

### Rollback

`git -C continent-app revert 981cfab` after the T870 commits, then sync the root mirror.

---

## T872: Plan this trip lands on the trip page

### What changed

`flow/TripFlow.jsx`: Help me choose's Plan this trip (the page and the compare table) and a kept trip planned from My trips go through
`landPlan` (`selectionOfPlan`, the planner's `loadFromWizard`) like Find my flight first, I know where and I've booked part of it,
straight onto the trip page v4 with the finder's flight held each way. The wizard's Getting there and Review and its stepper are
retired on every door's path; `startEngine` no longer takes a finder plan and `draftFor` is not called. The wizard code stays for the
one path that still needs it, a country page's Plan a trip here (T872-b). The trip page's address leaves with the plan.

### Files touched

**Modified:** `continent-app/src/planner/flow/TripFlow.jsx`

### Commands run

As T870.

### Measurements

| Metric | Before | After |
|---|---|---|
| Steps between Plan this trip and the trip page (Help me choose) | the wizard's Getting there, Review, Finish | 0 |
| Doors that land straight on the trip page | 3 of 4 | 4 of 4 |
| Trip page total against the finder page (walk, Lake Como) | | equal within the cent |

### What broke

Nothing in the end check.

### What is still open

- T872-a (user): Plan this trip keeps the trip in progress, it does not press Save.
- T872-b: the wizard's finder branch is unreachable; remove it or move Plan a trip here onto I know where.

### Rollback

`git -C continent-app revert d14caed`, then sync the root mirror (Plan this trip opens the wizard again).

---

## T873: Ready to book

### What changed

`planner/trip/ReadyToBook.jsx` on the trip page's Overview, after the route: the flight there, each stay, each hop by train, bus,
ferry or plane, the flight home, in booking order. Each row: the route's 40 px marker (the airline's mark on a flight), the part and
its nights, when and what (codes, day, airline and times; the stay type and dates), its figure (cents, "yours" when typed), one link out
in a new tab (Google Flights for a flight, the stay type's book site, the hop's ticket site) and Add what you paid, which writes the
same fields as the Itinerary (`setTravelPaid`, `setOwnStay`, `setOwnLeg`). A booked part carries the Booked chip and no link. One line
under the list: "Prices may have changed, confirm on the booking site." The car advice (`carAdvice`, Review's block before) is one
row on the route, before the way home: the verdict and the places hard to see without a car, not when the trip drives or hires one.

### Files touched

**Created:** `continent-app/src/planner/trip/ReadyToBook.jsx`
**Modified:** `continent-app/src/planner/TripSummary.jsx`, `TripSummary.css`, `TripPlannerTab.jsx`

### Commands run

As T870.

### Measurements

| Metric | Before | After |
|---|---|---|
| Bookable parts with a link and Add what you paid on the Overview | 0 (in the Itinerary's rows and tools) | 3 in the walk (flight there, stay, flight home) |
| Car advice | a block under Review's receipt | one row on the route |

### What broke

Nothing in the end check (a stay price of 321 typed in Ready to book showed as the traveller's own).

### What is still open

- T873-a (user): built as proposed without the owner's mark.
- T873-b: `carAdvice`'s reasons are English sentences, so only the verdict and the places show.

### Rollback

`git -C continent-app revert 413045b`, then sync the root mirror.
