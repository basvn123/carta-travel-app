# T857 to T859: plan flow v3 Batch B, Tell Carta

## Shared header

**Date.** 2026-10-30 (overnight run).

**Ask.** Plan flow v3 Batch B (`Execution/P15/_BRIEF-plan-flow-v3.md`, `Execution/P15/_PLAN-plan-flow-v3.md` section B).
The owner's mark on this item: "make sure this is top notch".

**Branches.** `p15-plan-flow-v3-b` in both repos, from the A heads. App: from `a46b6db`, five commits, head
`5dffb44`. Root: from `8edead415`, the sync commit `ccb0463d9` and the report commit.

| App commit | Task |
|---|---|
| `857dfd0` | T857 one trip parser, every answer with its source |
| `2a49974` | T858 the chips, the popovers, the step marks |
| `1de49e0` | T859 the named places carry through |
| `0367417` | T857 end check fix: a town in the traveller's own spelling; no dash literal in the source |
| `5dffb44` | T858 end check fix: a group budget is split over the party a popover set |

**Root sync.** `git status --short continent-app` listed exactly the batch's 23 files; the sync commit carries
them and nothing else (its numstat equals the app's `a46b6db..5dffb44`).

**Checks.** `npm test` 1065 of 1065 (baseline 1039 on `a46b6db`; 26 new tests in `parseTrip.test.mjs`,
`tellChips.test.mjs`, `namedPlaces.test.mjs`). ESLint clean on every touched file. `node scripts/ci/design-lint.mjs`:
no violation on a touched file (one em dash literal in a regex was caught and replaced by its escape in
`0367417`); the rest of its list is the files this batch did not touch. Impeccable's detector on the touched UI
files: no findings. No dashes, middots or banned words in the diff or the new strings. `css-routes --check`: 1
problem, the same as before (row T833-a).

**End check.** One NOPUBLIC build (`wt/vite.t857.mjs`, about 9 s) of `5dffb44`'s code, served with `public/` by
`serve-a.mjs` on 5857, Playwright walk `Execution/P15/T857-T859-walk/walk-b.mjs`, service workers blocked, the T795
sweep fixture on `flights/BRU.json`. At 1440 and 375: Plan home, Start planning, the kind sheet, Tell Carta with
"A week in Portugal with my partner in May, beaches and good food, from Ghent, around 1,500 euro" typed key by
key, the chips, a chip's popover (Who, changed to the family), more words (", in a hostel"), Continue to Booked
and What matters most, Create, the trip page, Start planning, Guide me, Help me choose, Trips for you, Plan this
trip; then a Dutch sentence at 1440. **38 of 38 checks pass, no console errors** (`after/walk.json`). One
screenshot per screen and width in `T857-T859-walk/after/` (not committed, as in the earlier P15 walks). Module
preloads 36, the same as Batch A's build. The build folder was deleted after the walk.

**Carta-design seven questions** (the new chips, the popover, the step marks, the CSS in `86-plan-flow.css`):
1. No hex: every value is a token. 2. No gradient and no new colour; the dashed chip is `--border` dashed on a
transparent ground with `--text-2`. 3. Brown only for what is selected: the answered chips are the kit chip's
selected state (the `--select-bg` tint, `--select-ink` and a tick), the step being asked is the brown ring, the
answered marks the tint with a tick; nothing brown is decoration; no yellow, no danger. 4. No figure under 12 px
(chips are `--text-label` 13 px, the marks carry no figure); money only through `formatMoney`, whole euros in a
chip. 5. One primary (Continue); the popover's Save is the popover's own primary, as in the settings sheet; no
text on a photograph. 6. The heading is the existing "Tell Carta about your trip"; the new label "Carta
understood" and the line "3 questions left. Tap a chip to change it." carry no count of the catalogue and no
method; no dashes, middots or banned words in six languages. 7. The one candidate to remove was the "Carta understood" label over the chips; it stays because it names the
chip list for a screen reader (the list is labelled by it) and says the chips are Carta's reading, not a filter.

**Impeccable pass** (Operate mode, inside carta-design): the chips sit on the page ground under the field, not
in a box of their own (no card in a card); one chip arrives in `--dur-2` (opacity and a 2 px rise) as its words
are typed, none under reduced motion; every chip is a real button with `aria-haspopup="dialog"` and
`aria-expanded`, 32 px on a fine pointer and `--tap` on touch (the kit's rule); the line under the chips is
`aria-live` and describes the field; the popover is the shared `SheetShell` (focus trap, Escape, anchored to the
chip from a pointer screen, a bottom sheet on a phone); a long chip label ellipses inside the 375 px column (no
sideways scroll at 375).

---

## T857: one trip parser, every answer with its source

### What changed

`src/lib/plan/parseTrip.js` reads one sentence into the planner's answers, on the device, with no model and no
network: places (countries in six languages and every catalogue town, through Ask Carta's vocabulary built on the
planner's own catalogue plus the search index's aliases and the lexicon's exonyms, so "Lisbonne", "Praag", "Wien"
and "Roma" are towns and "Italië" a country), the dates ("3 to 10 July", "July 3 to 10", "du 1er au 8 mai", "van 3
tot 10 augustus", ISO days; a past day rolls to next year) or the months and seasons, the nights ("a week", "10
nachten", "deux semaines", "5 days" is 4 nights, "a long weekend"), adults, children and babies ("my wife and two
kids", "family of five", "met z'n vieren", "un bébé", "a toddler"), likes, leaving from (an origin word then a
catalogue town or an airport town: "vanuit Gent", "au départ de Bruxelles", "ab Düsseldorf"), the budget (Ask's
money reader, then a person, the group, a day: "around 1,500 euro" is for the group, "300 each" a person, "150 a
day per person"), what is booked ("flights booked", "vluchten zijn geboekt", "vol déjà réservé", "nothing booked"),
the stay type (hostel, private room, room in a home, apartment or holiday home, hotel with its stars), the way of
travel, what matters most and the weather. Guards keep words from firing as other words: "I may go" is no month,
a day number is not money, "150 a day" is not one night, "Skiën" is skiing and not Skien in Norway, a lower case
"are" is not Åre. Every field is `{ value, from: 'words', said }`, `said` the traveller's own words. The trip
settings keep `sources` by question id ('words' or 'screen'; a missing entry is a screen's, as every answer was
before) and the named `places`; `markAnswered(s, id, from)` records it, `screenGiven(s)` lists a screen's answers,
and a screen's answer always overrides the words' source (row T856-c). `prefill.js` is a thin wrapper over the
parser (its `screenAnswered` reads the sources, and for a draft saved before T857 still reads the note again).

### Files touched

**Created:**
- `continent-app/src/lib/plan/parseTrip.js` (parseTrip, tripVocab, applyTrip, answeredBy, placeCountries)
- `continent-app/tests/parseTrip.test.mjs` (11 tests: the corpus of 81 sentences, sources, places)

**Modified:**
- `continent-app/src/planner/flow/tripSettings.js` (`places`, `sources`, markAnswered's source, screenGiven)
- `continent-app/src/planner/flow/prefill.js` (a thin wrapper)
- `continent-app/tests/planPrefill.test.mjs` (likes said in the words now answer the likes question too)

`lib/ask/intent.js` is not changed: parseTrip calls its `parseIntent` and `buildAskVocab`.

### Commands run

```
node --test tests/parseTrip.test.mjs tests/planPrefill.test.mjs tests/planFlowFresh.test.mjs
npx eslint <touched files>
npm test
```

### Measurements

| Metric | Before | After |
|---|---|---|
| Corpus sentences read with every named field right | prefill.js: no corpus, no places by town, no origin, no budget, no dates | 81 of 81 (24 en, 21 nl, 20 fr; 6 de, 5 es, 5 it), 300+ fields |
| Fields read | who, priority, booked, months, nights, likes, country names | + towns, dates, babies, leaving from, budget a person or group or day, stay type, way, weather |
| Vocabulary build on the full catalogue (node) | | 19 ms, 48 ms with the index and lexicon |
| One parse | | 3.9 ms |

### What broke

Nothing in the end check. The end check found the Dutch chip reading "Vanuit Ghent" (the catalogue's English
name); a town now keeps the traveller's spelling (`0367417`).

### What is still open

- T857-a: regions and areas ("Tuscany", "the Algarve", "Scotland") are not read as places; only countries and
  catalogue towns. The guided search's areas (`search/guided.json`) would give them.
- T857-b (user): calls made without the owner: a trip budget said with no "a person" or "for us" is read as for
  the group (a day budget as a person's); "with 4 friends" is five people, "we are 3 friends" three.

### Rollback

`git -C continent-app revert 0367417 857dfd0` (after reverting T858 and T859, which read the parser), then sync the
root mirror. Settings with `places` and `sources` load fine in older code (unknown keys are dropped).

---

## T858: the chips

### What changed

Tell Carta reads the words a beat after the last key (250 ms) and shows what it understood under the field:
every answer as a selected chip (the places, the dates or months, the nights, the people, each like, From the
town, the budget as said, the stay type, the way, what is booked, what matters most, the weather), every setup
question still open as a dashed chip with a plus ("Booked anything?", "Who is going?", "Where to sleep?", "What
matters most?", "When?", "Leaving from?"), and one line: "3 questions left. Tap a chip to change it." A tap on any
chip opens that question in a popover (the shared SheetShell, anchored to the chip on a pointer screen, a sheet on
a phone) with the same body the settings sheet uses and Save; the places chip opens the named places as toggles.
What is saved there is the traveller's own (`overrides`, source 'screen'): the words keep reading as they type
but never replace it, and a group budget is split over the party it set. Words that no longer say something take
their answer back (deleting "in July" opens When again); a screen's answer stays. Continue saves the trip with the
sources, writes the words' stay type and way of travel to the app's choices, sets the Where step's countries from
the named places (words typed again replace them) and asks only the questions still open. The step head now draws
one mark a screen: a tick in the selected tint for each one answered (by the words or a screen), the brown ring on
the one asked now, so a skipped screen shows as done instead of the count jumping; Help me choose's head does the
same. 24 new strings in six languages.

### Files touched

**Created:**
- `continent-app/src/planner/flow/tellChips.js` (tellSettings, tellChips, openSetup)
- `continent-app/tests/tellChips.test.mjs` (7 tests)

**Modified:**
- `continent-app/src/planner/flow/QuestionScreen.jsx` (TellBody, PlacesBody)
- `continent-app/src/planner/flow/PlanStage.jsx` (SheetHead `marks`)
- `continent-app/src/planner/flow/PlanFlow.jsx`, `continent-app/src/planner/flow/TripFlow.jsx` (pass the marks)
- `continent-app/src/styles/86-plan-flow.css` (the main sheet: `.pf-read*`, `.pf-mark*`)
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (`pf.tell.understood`, `pf.tell.left*`, `pf.chip.*`, `pf.places.*`)

### Commands run

```
node --test tests/tellChips.test.mjs ; npm test ; npx eslint <touched files>
PF_OUT=C:/Users/Gebruiker/Documents/Portfolio/wt/dist-t857-after node node_modules/vite/bin/vite.js build --config ../../wt/vite.t857.mjs
node Execution/P15/T840-T843-walk/serve-a.mjs <dist> continent-app/public 5857
node Execution/P15/T857-T859-walk/walk-b.mjs 5857 after
node scripts/ci/design-lint.mjs ; impeccable detect --json <touched UI files> ; node scripts/css-routes.mjs --check <dist>/assets
```

### Measurements

The walk's sentence, at 1440 and 375: before Batch B the words filled who, when and likes silently and the
counter jumped from 1 of 8 to the next open screen; after, 8 answers shown as chips, 3 dashed, Continue opens
Booked with 5 of 8 marks ticked, then What matters most, then Create. Module preloads 36 before and after.

### What broke

The end check found that after a popover set a family of four, "around 1,500 euro" was still split over the
words' couple (750 a person while the chip read "1,500 for 4"); fixed in `5dffb44` (the popovers' answers apply
before the words are read).

### What is still open

- T858-a (user): calls made without the owner: the six dashed chips show before anything is typed (they tell
  what Carta wants to know); a stay type or way of travel in the words is written to the app-wide choices on
  Continue, and when the Where to sleep chip is opened.
- T858-b: the stay and way chips open the whole Lifestyle step (the Where to sleep screen); once T862 rebuilds the
  stay types, a stay chip should open the stay tiles alone.

### Rollback

`git -C continent-app revert 5dffb44 2a49974`, then sync the root mirror. The strings stay harmless if left.

---

## T859: the place carries through

### What changed

The named places are the trip finder's only places: `candidates.js` `namedPool` builds each named town's trips
from that town first (the other named towns of its country next, then the country's best places, so a few-towns
trip can start there) and each named country's trips from its best places (the Help me choose match where it
ranked the country, else its best rated places with a photograph, so a country with no likes still gives trips).
Two or more names are a shortlist: "Portugal or Spain" gives trips in both and in no other country; "Lisbon or
Porto" gives trips starting in each. Help me choose skips the questions that choose where (weather and how far;
with a town named also what they like); how the trip moves, what to avoid, the budget and what Carta picks stay.
`draftFor` keeps the countries already picked after the trip's own (three at most) instead of overwriting them,
and the finder's run key includes the places, so changing them reruns the search.

### Files touched

**Modified:**
- `continent-app/src/lib/recommend/candidates.js` (namedPool, buildCandidates)
- `continent-app/src/planner/flow/flowGraph.js` (guideScreens, WHERE_QUESTIONS)
- `continent-app/src/planner/finder/handoff.js` (draftFor keeps)
- `continent-app/src/planner/flow/TripFlow.jsx` (passes the picked countries to draftFor)
- `continent-app/src/planner/finder/finderHooks.js` (the run key)

**Created:**
- `continent-app/tests/namedPlaces.test.mjs` (8 tests)

### Commands run

As T858 (one build and walk for the batch); `node --test tests/namedPlaces.test.mjs`.

### Measurements

Walk, "A week in Portugal ...": Help me choose asked What kind of trip, Anything to avoid and What should Carta
pick (no weather, reach or likes); Trips for you held 3 trips, all in Portugal; Plan this trip left
`wizard.countries` as ["Portugal"]. Node (`namedPlaces.test.mjs`): Portugal and Spain named give trips in exactly
ES and PT; Lisbon and Prague each start their own country's trips.

### What broke

Nothing found.

### What is still open

- T859-a: one named country can give fewer trips than the finder's minimum (3 trips in the walk against
  `candidates.min` 6), and two named towns of one country further apart than `towns.maxKm` (Lisbon and Porto) never
  share a trip; widen the named pool (more of the country's places, the road shape's reach) or say so on the page.
- T859-b: Trips for you's answers line does not name the places, and the I know where door does not preselect named
  towns on its Where step (T865 builds that door).
- T859-c (user): call made without the owner: named places skip weather and how far; a named town also skips what
  they like. Overturn if the likes should still rank the towns.

### Rollback

`git -C continent-app revert 1de49e0`, then sync the root mirror. With no places named every path is as before.
