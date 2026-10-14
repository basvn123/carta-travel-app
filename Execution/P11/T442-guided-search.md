# T442: The guided search (Explore redesign, step 7 of 9)

## Task ID

T442

## Date

2026-10-14

## What changed

The owner asked for "a search people would use", free and accurate, where "you can guide the kind of questions that can be asked, but ensure the user can only ask this". Explore's free text field, which matched place names only, is replaced by a guided search. No model runs and nothing is sent anywhere. The Claude API is not involved.

**How it works.** A question is read against a closed vocabulary built from Carta's own data:
- the 20 vibes and 40 named areas from `guided.json` (T439);
- the catalogue's places, with the search index's aliases and member villages;
- the countries, the months, the budget steps, and five extras (a beach, trails or a lake close by, no car needed, not crowded).

The vocabulary holds each vibe's label in the reader's language, the English words, and the everyday words in nl, de, fr, es and it ("wandern", "strand", "randonnée").

Whatever the reader asks becomes Explore's own filters, so the chips, the filter rail, the map and a shared link all show the same thing. The three facets the filters did not have yet join the URL:
- a named area (`xa`);
- within 50 km of a place (`xn`);
- a beach, trails or a lake close by (`xd`).

**What the reader sees**
- **The door.** A field-shaped button in the header on desktop, at the top of Explore on a phone. Once a question is set it reads the question back ("Hiking base, Alps, July"), with a clear control inside its right edge.
- **The panel.** It hangs under the field on desktop and is a full-height sheet on a phone. It opens with the cursor in its one field and contains:
  - **A combobox that only offers answerable completions.** "hiking in the alps in july" reads as Hiking base, Alps, July; "beach town in portu" completes Portugal; "near rom" offers places around Rome; "rome" offers its page or the places near it.
  - **Unknown words are named, never applied.** "Carta can't search for "skiing" yet", followed by what it can search for.
  - **"Try one".** Six example questions, each shown only if it returns at least three places today.
  - **Five slots, label over value**, in the booking bar's grammar, so no sentence is built across six languages: What (20 vibe tiles with icons), Where (Anywhere, a near place, 40 areas in three groups, every country), When, Budget and Extras (switches).
  - **Clear and Show places.** "Show places" is the panel's one primary.
- **The answer.** Explore's own list, ranked for the question while the default sort holds. Around a place it is nearest first. For a vibe it is the strongest match first, then fame, then rating: fame before rating puts 48 of 66 golden-set places in the top ten, against 45 the other way (closes T439-c). Every row adds one "why" line built from the facts asked for, for example "Trails 0.7 km away, Alps, Good in July".
- **Vibe threshold.** A vibe now holds from a score of 55, the start of the text-scored tenth, instead of 80. Text-only vibes such as romantic or nightlife can answer, and the ranking puts the facts first.

**Code**
- `src/lib/guidedSearch.js` holds the pure logic: the vocabulary, the parser, completions, the shared predicates (no car, budget and quiet moved here from ExploreTab), ranking, why facts, example questions and labels.
- `src/browse/GuidedSearch.jsx` is the UI, built on the kit: Tabs, Tiles, Chips, Switch, Button, IconButton and SheetShell.
- `SheetShell` gained an optional `initialFocusRef`.
- The old field's 21 dead rules were removed from 15, 24 and 62.

## Files touched

**Created (app, mirrored in root):** continent-app/src/lib/guidedSearch.js, src/browse/GuidedSearch.jsx, scripts/verify_guided_search.mjs

**Modified (app, mirrored in root):**
- continent-app/src/browse/ExploreTab.jsx (the door in both places, the three new facets in state, URL, chips and reset, the shared predicate, the guided order, the why line)
- continent-app/src/browse/SheetShell.jsx (`initialFocusRef`)
- continent-app/src/styles/62-v6-explore.css (the T442 block; old field rules removed), 15-map-overlays.css, 24-destination-workspace.css (old field rules removed)
- continent-app/src/i18n/{en,nl,de,fr,es,it}.js (41 keys each)
- continent-app/scripts/verify_explore.mjs (a search pass), scripts/ci/design-lint.baseline.json

**Modified (root):** Execution/_OPEN.md. **Created (root):** this report.

## Commands run

```
node scripts/verify_guided_search.mjs --list       (21 of 21: 15 typed questions in en, de, nl, fr; 5 behaviours; the golden set)
npx vite build && npx vite preview --port 5231
node scripts/verify_explore.mjs http://localhost:5231/   (96 of 96, 12 of them the search)
node scripts/verify_quality_floor.mjs t442 --port=5231 --only=explore   (every floor check passes)
impeccable detect --json GuidedSearch.jsx guidedSearch.js ExploreTab.jsx 62-v6-explore.css   ([])
node scripts/ci/design-lint.mjs (0 new); --update-baseline
<scratchpad>/t442shots.mjs   (1440 x 900 and 390 x 844, English and German: closed, open, typed, partial, unknown word, applied, Where, results)
```

## Config and secrets set

None. No API, no key, no network call beyond the two static files the app already serves (`search/guided.json`, `search_index.json`).

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| What the search understands | place names and aliases, 27 region boxes | 20 vibes, 40 areas, every place and country, "near" a place, 12 months, budget steps, 5 extras, in 6 languages |
| A question that cannot be answered | an empty list, or "did you mean" place names | the unknown word named, the rest still applied |
| Golden set: expected places in the top ten | not answerable (no vibe search) | 48 of 66 (fame tie-break; 45 of 66 rating first) |
| Typed questions read correctly (verify_guided_search) | n/a | 15 of 15, in en, de, nl and fr |
| Why a result is there | not shown | one line on every row while a guided facet is on |
| Raw buttons in ExploreTab | 2 | 1 (the row opener, which carries the hover preview) |
| 62-v6-explore.css meter: font sizes, radii, legacy reads | 16, 5, 36 | 15, 3, 34 |
| Lint baseline total | 9,813 | 9,791 |
| verify_explore checks | 84 | 96 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| "rome" could not complete to "romantic" | A finished word was parsed, not completed | While typing, the last one to three words are a fragment whenever a phrase starts with them |
| "quiet village" lost "quiet" | One vibe slot; the later word won | "Quiet" beside another vibe becomes the not crowded extra |
| "wandern" and "strand" were unknown | Only the vibe labels and English words were in the vocabulary | Everyday words per language |
| "near rom" offered "Romantic" first | Places ranked below vibes | After "near", only places |
| A full question showed the slot word of its last part | The option label took the last entry's slot | A question of two or more parts reads "Search" |
| "Trails 0 km away" | 0.04 km rounded down | Distances read at least 0.1 |
| The phone door cut the question to two words | The clear control sat beside the field | It sits inside the field's right edge |
| The first prune of the old field's CSS also removed a day planner rule (`.day-explore-search-text`) | The pattern matched inside another class name | Reverted; re-run with the exact class pattern; diffs reviewed |
| The lint flagged the euro sign in the parser's regex | A literal sign outside the formatter | Built from its code point |

## What is still open

- **T442-a, owner.** A native review of the 41 new strings and of the everyday vibe words (`VIBE_WORDS_I18N` in guidedSearch.js) in nl, de, fr, es and it.
- **T442-b.** The App's free text `locationQuery` is no longer set by any control. The catalogue hook's text filter and Explore's empty-state branches for it are now dead. Remove them, or give the state to another tab.
- **T442-c.** The golden set misses are data, not ranking:
  - "quiet in the Alps" misses Hallstatt and Alpbach;
  - "romantic in France" misses Annecy and Colmar;
  - "islands in Greece" ranks Naxos, Paros and Milos below the top ten;
  - "lakes in Italy" misses Riva del Garda.
  These are vibe scores, so they belong in the T439 layer, measured on the same set with the expectations unchanged.
- **T442-d.** When is one month. "Summer" or "spring" is not understood (it is named as unknown). A season would need a month range in the filter.
- **T442-e.** Explore rows and rails print the catalogue's English country name in every language ("Germany" on a German screen). Destinations and the planner already use `Intl.DisplayNames`; a shared helper would fix every surface.

T439-c is closed (fame breaks the tie, measured). T440-c is closed: the search clear and the floating switch are on the kit, and the one raw button left, the row opener, is deliberate.

## Rollback procedure

Revert the T442 commits in both repos. The free text field and its CSS come back. A link carrying `xa`, `xn` or `xd` then loses those facets, and its other filters still apply. No data, schema or config changed.
