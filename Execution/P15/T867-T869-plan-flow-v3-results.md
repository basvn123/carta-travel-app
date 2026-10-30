# T867 to T869: plan flow v3 Batch E, searching and results

## Shared header

**Date.** 2026-10-30 (overnight run).

**Ask.** Plan flow v3 Batch E (`Execution/P15/_BRIEF-plan-flow-v3.md`, `Execution/P15/_PLAN-plan-flow-v3.md` section E). Owner's
marks: "Searching stages" Go; "Remove the levers" Go; "Results layout" Go, "A, the gallery". The proposal's mocks (sections
`search` and `results` of the plan flow v3 artifact) were followed inside carta-design.

**Branches.** `p15-plan-flow-v3-e` in both repos, from the D heads. App: from `ebda863`, six commits, head `bfc7a0c`. Root: from
`560ecf686` (`git checkout -b`), two sync commits (`0c781f5b0` for `f69e71b`, `0045729e1` for the last card fix) and the report commit.

| App commit | Task |
|---|---|
| `e0e425e` | T869 the card (`TripCard.jsx`) |
| `da01841` | T868 Trips for you, layout A, without the levers (`TripsForYou.jsx`, new `TripsMap.jsx`, `tripSettings.js`, `tests/recommendLevers.test.mjs`, and `87-trip-finder.css`, which also holds T867's searching rules and T869's card rules) |
| `f0a50f7` | T867 searching (new `priceSlices.js`, `finderHooks.js`, `FindingTrips.jsx`, `finderText.js`, the strings of all three tasks in six languages, new `tests/finderResults.test.mjs`); `finderHooks.js` also drops `startLevers` and `useLevers` for T868, `finderText.js` also holds T868's answers line and sorts and T869's card line |
| `442addd` | T868 end check fix: the map gets the cheapest trip from the list (preloads back at 36) |
| `f69e71b` | T867 end check fixes: the stay line names its type from the first frame; a like with "and" in it joins with a comma |
| `bfc7a0c` | T869 end check fix: an over-budget trip says so on its card when its catch is another |

The files are shared across the three tasks, so the commits are by file group. Undo the batch newest first; reverting a single
task alone leaves the others without their strings or helpers.

**Root sync.** `git status --short continent-app` listed exactly the batch's 17 files (14 modified, 3 new; the untracked
`public/app_data/` stays out); the first sync commit's numstat (+1,261, -1,009) equals the app's `ebda863..f69e71b`; the second
carries `bfc7a0c`'s two files.

**Register rows taken.** T803-a, T803-b and T803-e (closed as moot: the levers are gone), T803-d (the bases lever's Any chip, moot
for the same reason), T811-b (the preview's Food chip against the toolbar's Food lever: the lever is gone), T810-b (the card no
longer carries the fork figure), T859-b (its second half: Trips for you's answers line names the places; the door half was done by
T865). T861-a (the card does not name the home airport) is not taken: the card's one line holds a reason and a catch, and adding
the airport is a design call for the trip page (Batch F); it stays open. T859-a (a named country can give few trips) stays open:
the page now counts its trips in the heading, but the pool is unchanged.

**Checks.** `npm test` 1096 of 1096 (baseline 1090 on `ebda863`; 6 new tests in `tests/finderResults.test.mjs`, the T803 test
"the settings keep the levers" replaced by "settings saved with the old levers load, without them"). ESLint on every touched
file: no error; the one warning is the older `FindingTrips.jsx` react-refresh note on its re-exports. `node scripts/ci/design-lint.mjs`:
no violation on a line this batch wrote (the one finder hit, `finderText.js` "+€24" in a comment, is an older line not in the
baseline, on `ebda863` as well). Impeccable's detector on the touched UI files: `[]`. No dashes, middots or banned words in the
diff or the new strings.

**End check.** One NOPUBLIC build (`wt/vite.t867.mjs`) of `bfc7a0c`'s code, served with `public/` by `serve-a.mjs` on 5867,
Playwright walk `Execution/P15/T867-T869-walk/walk-e.mjs`, service workers blocked, the T795 sweep fixture on `flights/BRU.json`,
the live search failing (503), From Ghent with BRU ticked. At 1440 and 375: the searching screen read by a page-side watcher
under a 30x slowed CPU (three stages, their words, the first trips under them, no line changing), Trips for you (heading, answers
line, Edit answers with every answer, no levers, the sort, columns, full width), the card (photo, match, heart, meta, one line, the
group total equal to the trip's own, an over-budget trip saying so once, the click opening the trip, Escape), the menu (Compare on two, Compare 2, the table; Skip
and Show them again), the three sorts, the Map (a pin a trip, figure first, one best-value pin, a pin picks the card beside the
map, List back); at 800 two across; at 1440 a trip with Slovenia named and settings saved with the old levers; at 375 the sort in
German, French, Dutch, Spanish and Italian. **102 of 102 checks pass, no console errors** (`after/walk.json`; the same walk passed again on the same build). One screenshot per
screen and width in `T867-T869-walk/after/` (not committed, as in the earlier P15 walks). The searching screen stands under a second even at a 30x slowed CPU, so its
capture is timing luck: it came out in two earlier runs of the walk (looked at: the three stages, the live dot, the first cards
under them at 375 and 1440) but not in the final ones. Module preloads 36. The build folders were deleted after the walk.

**Carta-design seven questions** (the searching stages and first cards, the results head and toolbar, the gallery, the card and
its menu, the map and its pins; CSS in `87-trip-finder.css`):
1. No hex: every value is a token. 2. No gradient and no new colour; the cheapest pin is `--best` (best value, once per view), the
picked pin and the ticked card's photo edge are the one selected state (`--select-bg`, `--select-ink`, `--select-border`). 3. Brown
only for what acts, is live or is selected: the working stage's one still dot (live, no pulse: loops stay with Ask Carta and the
home page), the selected sort segment is the lifted white thumb, the Compare item ticked is the selected tint with a tick, the
In your comparison mark and The trip you planned are `--select-ink` with a tick. 4. No figure under 12 px: the card total is
`--text-lead` 700, its unit `--text-label`, pins `--text-caption` with the figure 600, all tabular; every euro through `formatMoney`
(whole euros on the cards and pins, a comparison). 5. No primary on the results page any more (the card's See the trip primary was
one a card); one per view on the failed state (Change your answers). Text on a photo: only the match pill (the T810-a exception,
unchanged) and the heart. 6. Headings carry a number or a verb ("6 trips for you", "Finding trips for the two of you"); no method
line, no count of places searched; no dashes, middots or banned words. 7. Removed: the three levers and their sheet, the
lever-miss line, the card's cost fold, three figures, budget badge, "a person" price block and See the trip button, the Compare
checkbox row and Skip button under each card (into one small menu), the floating compare tray, the second photo on a card, the
loader's answer chips and its food stage, the 1.2 s minimum stand.

**Impeccable pass** (Operate mode, inside carta-design): the page is the incumbent Lagoon card grammar at full width: the photo
leads (3:2, `--radius-card`), the words sit on the sheet's white under it with no box, one line of icon facts, one sentence pair,
one figure. The toolbar is one row (the sort left, Compare and the Map pill right); on a phone the sort takes its own row and its
segments wrap their words inside the box, one height (German "Passt am besten" on two lines). The menu is the Plan home's More
pattern (44 px items, Escape and outside tap close it, focus moves in, arrow keys move). Motion: the sort re-orders with the
existing FLIP slide (transform only, `--dur-2`), stages and early cards fade in once, the map crossfades in at `--dur-3`, all off
under reduced motion.

---

## T867: searching, stages named from the answers

### What changed

The searching screen (`finder/FindingTrips.jsx`) shows only the work the engine really does, in the traveller's words
(`finderText.stageLines`): the flights from the towns of every airport in reach (`data.meta.home_airports`, else the one origin)
and when ("Flights from Brussels, 21 Nov 2026 to 28 Nov 2026", or "in December" with months), the stays for who goes and how long
("Places of your own for 2 adults, 7 nights", one line per stay type), then matching the places to the likes. The old fourth line
("Food and getting around at your pace") ticked together with the stays from one call, so it is gone; a stage with nothing to do
has no line (no flight line without a home airport). The engine run (`finderHooks.useTripFinder`) now prices the candidates a slice
at a time (`finder/priceSlices.js`, 32 ms a slice, the same list buildTrips gives, memoised per answer set) and hands the best
three priced so far to the screen, which shows them under the stages as real cards (heart and open work); the working stage has
one still brown dot. There is no minimum stand: the list shows the moment the trips are ranked. The run's key now also holds the
ticked home airports, so ticking another airport runs the search again.

### Files touched

**Created:**
- `continent-app/src/planner/finder/priceSlices.js`
- `continent-app/tests/finderResults.test.mjs`

**Modified:**
- `continent-app/src/planner/finder/FindingTrips.jsx`, `continent-app/src/planner/finder/finderHooks.js`, `continent-app/src/planner/finder/finderText.js`
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (30 keys added, 52 removed, for the batch)
- `continent-app/src/styles/87-trip-finder.css` (in the T868 commit)

### Commands run

```
node --test tests/finderResults.test.mjs ; npm test ; npx eslint <touched files> ; node scripts/ci/design-lint.mjs
impeccable detect --json <touched UI files>
PF_OUT=C:/Users/Gebruiker/Documents/Portfolio/wt/dist-t867 node node_modules/vite/bin/vite.js build --config ../../wt/vite.t867.mjs
node Execution/P15/T840-T843-walk/serve-a.mjs <dist> continent-app/public 5867
node Execution/P15/T867-T869-walk/walk-e.mjs 5867 after
```

### Measurements

| Metric | Before | After |
|---|---|---|
| Stages shown | 4 (food ticked with stays, a fake split) | 3, each real work |
| Minimum stand of the loader | 1,200 ms | 0 (as long as the work) |
| Trips shown while pricing | none | the best 3 priced so far (walk, CPU 30x: 3 cards at 1440, 2 at 375) |
| Flight stage names | the origin's town | every ticked airport's town and the dates or months |
| npm test | 1090 | 1096 |

### What broke

In the end check the stays line read its stay type from the run's input, so it changed type when the files arrived (first frame
"Guesthouse rooms", then "Places of your own"); the hook now hands the type over before the run. "hiking and food and wine": a like
whose label holds an "and" now joins with a comma.

### What is still open

- T867-a (user): call made without the owner: no minimum stand; on a fast device or with the answers seen before the stages show
  for a moment or not at all, and the first trips show under them only when pricing takes more than one 32 ms slice.

### Rollback

`git -C continent-app revert bfc7a0c f69e71b 442addd f0a50f7 da01841 e0e425e` (the whole batch; the files are shared), then sync the root
mirror.

---

## T868: Trips for you, layout A, without the levers

### What changed

`finder/TripsForYou.jsx` is the gallery: the white sheet takes the full width of the Plan page from 769 px; "6 trips for you"
(the count in the heading) with the answers in one line under it, the named places first (closes the second half of T859-b), then
from, when, who goes and each like, "+5 more", and Edit answers, which lists every answer including who goes and the named places
(a place reopens Tell Carta). One row: Sort as a kit Segmented (Best match, the engine's order; Cheapest, the group total with a
total that leaves the flight out after the whole ones; Shortest trip there, door to door where the flight has its minutes, else its
clock times plus the transfer, unknown last), Compare N once two trips are ticked (opens the existing compare table), and the Map
pill naming where it goes. The gallery is one card on a phone, two from 600 px, three from 1024 px, six at a time. Map
(`finder/TripsMap.jsx`, its own lazy chunk with maplibre): a price pin a trip at its first place, the group total first and the
town after it, the cheapest whole total the best-value pin, the picked pin the selected state; a pin picks the trip and its card
shows beside the map (under it on a phone); the card opens the trip. The sort and the view hold for the visit per answer set. The
Flight, Food and Bases levers are gone: `LEVER_GROUPS`, `LeverControl`, the Adjust sheet, the lever-miss line, `startLevers` and
`useLevers` (`finderHooks.js`), `settings.guide.levers` and `LEVER_VALUES` (`tripSettings.js`), and 27 `tf.lever.*` strings (the
preview keeps `tf.lever.food` as its Food label). Old saved settings with levers load; normalizeSettings drops them. The engine's
own lever code in `rank.js` (LEVERS, applyLevers, flightPull, FLIGHT_PULL) and `config/recommend.json` levers stay, used by tests
only (row T868-c).

### Files touched

**Created:**
- `continent-app/src/planner/finder/TripsMap.jsx`

**Modified:**
- `continent-app/src/planner/finder/TripsForYou.jsx`, `continent-app/src/planner/flow/tripSettings.js`, `continent-app/src/styles/87-trip-finder.css`
- `continent-app/tests/recommendLevers.test.mjs`
- (`finderHooks.js`, `finderText.js` answersLine, placeChips, partyChip, sortTrips, thereMinutes: in the T867 commit)

### Commands run

As T867 (one build and walk for the batch). The preload count was bisected by building `ebda863`'s versions of the touched files
beside the batch (`git checkout ebda863 -- <files>`, build, `git checkout HEAD -- <files>`).

### Measurements

| Metric | Before | After |
|---|---|---|
| Levers on Trips for you | 3 (Flight, Food, Bases) and an Adjust sheet | 0 |
| Columns at 375 / 800 / 1440 | 1 / 1 / 1 (T825's Booking list, 960 px) | 1 / 2 / 3, full width (1,392 px sheet at 1440) |
| Ways to order | levers | Best match, Cheapest, Shortest trip there |
| Map | none | price pins, a pin picks the card |
| Module preloads | 36 | 36 (37 on the first build, see What broke) |
| `en.js` (git blob) | 451,230 B | 450,299 B |
| TripsMap chunk | | 2,919 B (maplibre loads only with the map) |

### What broke

The first build had 37 module preloads: `TripsMap.jsx` imported `finderText.js`, so its lazy chunk reached lib/recommend and
rolldown split the Lifestyle presets into a preloaded chunk of their own. Found by building `ebda863`'s files beside it and diffing
the preload lists; fixed by handing the map the cheapest trip from the list (`442addd`).

### What is still open

- T868-a (user): calls made without the owner: Best match is the engine's order without the priority's flight pull (the old start
  lever; the priority still picks each trip's flight); the sort and the Map view hold for the visit only, not stored; Compare moved
  from the floating tray into the toolbar row as a secondary "Compare 2"; who goes and the named places joined Edit answers.
- T868-b: Shortest trip there falls back to the flight's clock times when it carries no minutes (the T795 fixture never does), so a
  time zone crossed counts an hour off; a trip by train or car with no transfer minutes sorts last.
- T868-c: `rank.js` keeps LEVERS, applyLevers, flightPull and FLIGHT_PULL and `config/recommend.json` keeps `levers`, now called only
  by tests and `scripts/trip_finder_baseline.mjs`; remove them with their tests, or keep them for a later sort.
- T868-d: DESIGN.md's "Priced trip card (T798)" paragraph still describes the old card (three figures, cost bar, inclusions,
  budget ruler, reasons list, group total in the foot, the list from 769 px); rewrite it to the T869 card and the layout A gallery.
- T868-e: the map view does not ring a pin when its card is hovered (the list and map sync rule): only the picked trip's card shows
  beside the map, and two trips whose first place is the same town draw their pins on top of each other.

### Rollback

As T867 (the batch reverts together). Settings saved by this batch carry no levers; older code reads them without levers (every
lever starts from the answers).

---

## T869: the card

### What changed

`finder/TripCard.jsx`: the trip's first photo (3:2, one photo, the country's best known one when the places have none), the match
pill and the heart on it; the name (the stretched way in) with a small menu beside it (a 44 px More button: Compare as a
menuitemcheckbox, up to four, with "Compare up to 4 trips" when full, and Skip for these answers); country with its flag, nights and
bases as one line of icon facts; the strongest reason and the catch as one line of two sentences (the catch in `--text`); the trip's
total for the group in whole euros through `formatMoney` ("€1,983 for 2, all in", "for 2, without the flight", "for you" alone).
A ticked trip shows "In your comparison" and the selected edge round its photo. The whole card opens the trip through today's
TripPreview (Batch F replaces it with a page). The cost fold, the three figures (closes T810-b), the budget badge, the "a person"
price block and See the trip are gone from the card; a trip over the budget says so once, in its catch or, when the catch names a busy
month, a car or the heat, in one quiet line in the warning ink ("{eur} over budget"); the group total equals the trip's
own (walk: 1,983 against 1,983).

### Files touched

**Modified:**
- `continent-app/src/planner/finder/TripCard.jsx`
- `continent-app/src/styles/87-trip-finder.css` (`.tff-card-over`, in `bfc7a0c`; the rest of the card's CSS is in the T868 commit)
- (`finderText.js` cardLine, groupHead and the card's strings: in the T867 commit)

### Commands run

As T867.

### Measurements

| Metric | Before | After |
|---|---|---|
| Card figure | the total a person, the group's under it | the group total ("for 2"), whole euros |
| Controls on a card | heart, name, cost fold, See the trip (a primary), Compare checkbox, Skip | heart, name, one More menu |
| Photos a card | up to 2 | 1 |

### What broke

With the budget badge gone, an over-budget trip whose catch was a busy month, a car or the heat said nothing of the budget (the
catch puts those first); the card now adds one quiet line then (`bfc7a0c`). In the walk the one trip over the budget said so in its
catch, so the quiet line itself was not seen in a browser.

### What is still open

- T869-a (user): calls made without the owner: the card shows the group total (with "for you" for one), not the price a person; the
  budget badge left the card (over the budget is said once, in the catch or one quiet line); a ticked trip's photo takes the selected edge.

### Rollback

As T867.
