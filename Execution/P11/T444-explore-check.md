# T444: The full Explore check, and its fixes (Explore redesign, check after step 7)

## Task ID

T444

## Date

2026-10-14

## What changed

The owner asked for a full check of Explore with impeccable, on desktop and iPhone, against everything in the original brief (2026-10-13), before the work is pushed. The check ran as impeccable's critique specifies, as two independent reviews.

**Assessment A, the design review.** A director's review with screenshots on desktop (1440 x 900), an iPhone 13 (390 x 844, touch) and German at 360 px.
- Heuristic score: 24 of 40.
- The brief: counts, full width and the two base colours met; the rest met or partly met.
- Priority issues:
  - the destination door was a button with no address, so Back left Carta;
  - the search refused "cheap";
  - Sort said "Rating" over a list ordered by match;
  - map labels stayed stale for 3 to 6 seconds after a clear;
  - keyboard cost in the rails;
  - phone chrome over content.

**Assessment B, the detector and the browser.**
- `impeccable detect` found nothing in the Explore files or the kit (verified against a planted file).
- No text below 4.5:1, no horizontal overflow, no unnamed control, no console error, no catalogue count left on screen.
- The live overlay's flags were mostly false positives, each verified: the card's stretched link reads as covering text; rails start flush with the content column on purpose.
- Real items: on a short phone the floating switch rests over the first card; the filter rail's headings are mixed.

**Fixed in this task**
- **Back and the address.** Opening a place is one history step, with the place in the address (`#dest=ID`, the deep link the app already reads at boot).
  - Back, and a phone's swipe back, close the page onto the list.
  - Closing by the page's own controls steps back over that entry.
  - A shared or reloaded link opens the place.
  - Rows and rail tiles are real links: a modifier click opens a new tab.
  - The settings sync (`persistState`) and Explore's filter sync now keep the place hash and the history step instead of wiping them.
- **The search speaks the audience's words.**
  - "cheap", "budget", "affordable" and their nl, de, fr, es and it equivalents read as "Cheapest first" (the price sort). "cheap beach in greece" now answers.
  - The Budget slot gains the same switch.
  - A place alias completes only when typed whole, so "porto" offers Porto, Portofino and Porto Santo, not Hydra.
  - On a phone the five slots wrap to two rows; Budget and Extras were cut off.
- **The page says what is true.**
  - While a question orders the list, the sort reads "Best match"; "Rating" stays a choice and turns the match order off.
  - Map labels follow a filter change on the next frame and a camera move when it ends, instead of waiting for every tile.
  - The month chip reads "Good in July", not "Good in Jul".
- **Phone chrome.**
  - On touch, the card a pin raises docks at the bottom of the map, clear of the floating switch, with a close control. A tap on the open map puts it away.
  - The sort row waits while the sections lead (it does not order them).
  - The tab bar's hover colour is limited to devices that hover: after a tap on touch, two tabs looked active.
- **Names.**
  - Country names are in the reader's language on the rows, the rail tiles, the map tip and card, and the filter rail's country list, which is also sorted in that language. A shared helper, `src/lib/countryName.js`, does this (closes T442-e).
  - Every save control names its place ("Add Verona to shortlist").
- **One "Clear all".** The chips row above the list keeps it; the rail's second one pushed the rail down as it appeared.
- **Search field focus.** One ring instead of two.

## Files touched

**Modified (app, mirrored in root):**
- continent-app/src/App.jsx (history step on open, step back on close, a history step reopens the place it names)
- continent-app/src/lib/dossier.js (`destFromHash`)
- continent-app/src/lib/urlState.js (keeps `#dest=` and the history state)
- continent-app/src/lib/guidedSearch.js (budget words, alias completion)
- continent-app/src/browse/ExploreTab.jsx (row link, "Best match", cheapest, month chip, one Clear all, `is-rails`, country names, named save)
- continent-app/src/browse/ExploreCards.jsx (tile link, named save, country names)
- continent-app/src/browse/ExploreMap.jsx (docked peek card, labels on filter change and move end, country names, kit Score in the card)
- continent-app/src/browse/ExploreFilterRail.jsx (localized country list)
- continent-app/src/browse/GuidedSearch.jsx (Cheapest first)
- continent-app/src/styles/62-v6-explore.css (the T444 block; phone slot tabs; focus ring), 24-destination-workspace.css (the hover guard)
- continent-app/src/i18n/{en,nl,de,fr,es,it}.js (4 keys each)
- continent-app/scripts/verify_explore.mjs, verify_category_rail.mjs, verify_guided_search.mjs, scripts/ci/design-lint.baseline.json

**Created (app, mirrored in root):** continent-app/src/lib/countryName.js

**Modified (root):** Execution/_OPEN.md. **Created (root):** this report.

## Commands run

```
Assessment A: a design-review sub-agent (read-only; screenshots in <scratchpad>/critA)
Assessment B: a detector sub-agent: impeccable detect --json (13 files + the kit), impeccable live-server + detect.js injected in 5 states, contrast, targets, overflow, names, headings, console (<scratchpad>/critB)
npx vite build && npx vite preview --port 5231
node scripts/verify_explore.mjs http://localhost:5231/        (103 of 103)
node scripts/verify_category_rail.mjs http://localhost:5231   (21 of 21)
node scripts/verify_guided_search.mjs                         (24 of 24)
node scripts/verify_quality_floor.mjs t444 --port=5231 --only=explore   (every floor check passes)
impeccable detect --json (the changed files)                  ([])
node scripts/ci/design-lint.mjs (0 new); --update-baseline
<scratchpad>/showshots.mjs before 5234 / after 5231           (the owner's showcase: the T426 build against this one)
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Back after opening a place | left Carta (about:blank) | closes the page onto the list |
| A place's address | none | `#dest=ID`, opens on reload or when shared |
| "cheap beach in greece" | "Carta can't search for "cheap" yet" | Beach town, Greece, Cheapest first |
| Sort label while a question orders the list | "Rating" | "Best match" |
| Map labels after clearing a search | stale for 3 to 6 s | the next frame |
| Phone peek card | under the floating switch, no close | docked above it, with a close |
| Country names on Explore in German | English ("Germany") | German ("Deutschland") |
| "Clear all" buttons on desktop | 2 | 1 |
| Raw buttons in ExploreTab | 1 | 0 |
| verify_explore checks | 96 | 103 |
| verify_guided_search checks | 21 | 24 |
| Lint baseline total | 9,791 | 9,790 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Opening a place pushed a step, but the address lost `#dest=` and the step's marker | `persistState` and Explore's filter sync rewrote the URL with a null state and no hash | Both keep the place hash and the current state |
| The close-by-arrow probe timed out on desktop | The page's back arrow is a phone control | The desktop probe closes with Escape (the same close path) |
| A `sed` edit turned App.jsx to LF | The known Git Bash gotcha | Restored CRLF; later edits went through node |

## What is still open

- **T444-a, owner.** The review found two taxonomies for "what kind of place": Trip type (9 tiles in the rail) and the vibes (20, in the search). Merging Trip type into the vibes would give one vocabulary for both doors. It is a product call; the plan kept both.
- **T444-b, owner.** Rail choices the review raised:
  - a "Within 3 hours of Charleroi" rail, built from the reach times Carta already has, which no competitor can build;
  - opening Explore on a hiking cut for the launch audience.
- **T444-c.** Keyboard cost (WCAG 2.4.1). Each rail strip is about 24 tab stops, and four strips stand before "All places". Fix with a roving tabindex per strip and a skip link to the list.
- **T444-d.** Rails repeat each other:
  - "Top rated in Europe" repeats the first rows of "All places";
  - Seville and Ferrara appear in the first two rails.
  De-duplicate across sections.
- **T444-e.** Jargon without a key in the filter rail's folds: the role chips (Base, Basecamp, Day trip, Stop) and the size glyph ramp. Filled and outlined stars also have no key.
- **T444-f.** On a phone the settings line drops the "Lifestyle" label, so "Entire place" reads like a filter for the type of stay.
- **T444-g.** The search's field reads back only what the search sets. A trip type or rating set in the rail shows as a chip, not in the field.

Already covered elsewhere:
- The hover preview's receipt is dense and its total drops the estimate mark, and the destination page shows "€87" where the card shows "~€87 est.". Both belong to the destination page task (T429, rows T427-c and T374-d).

Closed by this task: T442-e.

## Rollback procedure

Revert the T444 commits in both repos. Opening a place stops writing history, and the address stops naming it. The search no longer reads "cheap", the sort label and the peek card return to their T442 state, and country names return to English. No data, schema or config changed.
