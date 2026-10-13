# T427: Explore, part 1: layout, cards, sections, no clutter (Explore redesign, step 4 of 9)

## Task ID

T427

## Date

2026-10-13

## What changed

Explore now follows the owner's review of 2026-10-13: full width, sections of photo tiles, every list in compact rows, and no counts or explanatory captions.

**Layout.**
- The 1180 px cap is gone on Explore. One 32 px gutter now lines up the header, the settings line, the side panel and the content on every tab.
- The top band is the title "Explore Europe" alone, with no count beside it. The List/Map kit `Segmented` and the sort sit on the right. On a phone the title is read but not drawn, so the search leads the screen.

**Sections.**
- Each section is a question with a strip of kit Card tiles: a 4:3 photograph with only the save control over it, then the name, the country, and the price beside the Score.
- The set:
  1. "Your shortlist" (only when it holds anything)
  2. "Best in October"
  3. "Under €85 a day in October"
  4. "Top rated in Europe"
  5. "Hiking bases"
  6. "Beach towns in season"
  7. "Hidden gems"
  8. "Go without a car"
  9. "Quiet in high season" (June to September only)
- Hiking bases and beach towns come from the T439 data.
- Four strips show on a desktop and three on a phone. The rest are one row of buttons.
- No subtitle, no position figure ("1 to 5 of 12") and no number in "See all".
- Tiles size from the section's own width: about 1.3 on a phone, 3.5 at 1280 px, 5 at 1440 px.

**The list.**
- Every list is compact rows, under the sections or beside the map: a 72 px photograph, the name and the Score, the country (with the hidden-gem mark when earned), and the price.
- One column on a phone, two or more from about 860 px.
- The five-bar gauge, the photo seal, the gem chip on the photo and the info button are gone. The desktop hover preview stays.
- The save control is a bookmark, like My trips in the nav, so it never sits beside the rating's star.

**Price line.** The day cost at the traveller's Lifestyle, in whole euros through `<Money>`. Only a stand-in figure carries `~€87 est.`; "national" and the gauge are gone.

**Behaviour fixes.**
- **Rails no longer vanish when the traveller sets dates.** The dates' month used to be written into the month filter, where it became a chip, and any chip hides the rails. Now it only names the month the rails speak about. This reverses the T383-a behaviour on purpose.
- **A vibe filter (`xe` in the URL).** The hiking and beach sections' "See all" open exactly the list they show, with a removable chip. T442's guided search will reuse it.

**Removed.**
- The count line, the tier legend with its counts and its "How the score works" sheet (`TierLegend.jsx` deleted), the "More ways in" fold and its count.
- 278 dead CSS rules for the old card, legend and rail, from 24, 25, 46 and 62.
- 35 unused strings in all six languages (210 lines).

**Also in this task (T439 follow-up).** The guided data no longer calls a city a hiking base for having trail ends nearby: Paris, Amsterdam and Bruges had shown up in "Hiking bases".

## Files touched

**Modified (app, mirrored in root):**
- continent-app/src/browse/ExploreTab.jsx (row card, sections, vibe filter, month fix, top band; count and legend removed)
- continent-app/src/browse/ExploreRails.jsx (rewritten: kit tiles, buttons, no subtitles or counts)
- continent-app/src/components/CostSummary.jsx (`isNational` exported)
- continent-app/src/styles/62-v6-explore.css (the T427 block; dead rules removed), 60-v6-shell.css (one gutter), 24-destination-workspace.css, 25-feature-pages.css, 46-owner-calls.css (dead rules removed)
- continent-app/src/i18n/{en,nl,de,fr,es,it}.js (7 new keys each; 35 dead keys removed each)
- continent-app/public/search/guided.json (rebuilt with the urban rule)
- continent-app/scripts/verify_explore.mjs (the new contract), verify_quality_floor.mjs (new selectors; the kit Card's stretched opener counts as its tap box), verify_category_rail.mjs, shot_explore.mjs (selectors)

**Created (app, mirrored in root):** continent-app/src/browse/ExploreCards.jsx (DayPrice, SaveButton, PlaceTile), continent-app/src/lib/guidedData.js (loader)

**Deleted (app, mirrored in root):** continent-app/src/browse/TierLegend.jsx

**Modified (root):** pipeline/guided_search_layer.py (urban rule), Execution/_OPEN.md. **Created (root):** this report.

## Commands run

```
node <scratchpad>/t427a.cjs, t427b.cjs, t427c.cjs     (ExploreTab edits)
node <scratchpad>/cssprune.cjs <dead-class regex> 24 25 62 46   (278 rules, 6 selector lists trimmed)
python pipeline/guided_search_layer.py                (urban rule; golden set still 49 of 72)
npx vite build && npx vite preview --port 5231
node <scratchpad>/t427shots.mjs                       (1440 x 900, 1280 x 720, 390 x 844; English and German)
node scripts/verify_explore.mjs http://localhost:5231/            (73 of 73)
node scripts/verify_quality_floor.mjs t427 --port=5231 --only=explore   (8 screens, every floor check passes)
impeccable detect --json ExploreTab.jsx ExploreRails.jsx ExploreCards.jsx guidedData.js   ([])
node scripts/ci/design-lint.mjs                       (0 new); --update-baseline
node <scratchpad>/words.mjs                           (before: a build of master into the scratchpad on port 5232)
```

## Config and secrets set

None.

## Before/after measurements

Words and figures a traveller sees on the first screen of Explore (visible text in the viewport, the header and the settings line left out; the same script on a build of master before T427 and on this branch):

| First screen | Before | After |
|---|---|---|
| Desktop 1440 x 900, words | 200 | 153 (24 percent fewer) |
| Desktop, words holding a figure | 25 | 12 |
| Phone 390 x 844, words | 68 | 34 (half) |
| Phone, words holding a figure | 10 | 3 |


| Metric | Before | After |
|---|---|---|
| Count lines on Explore (title count, legend counts, rail positions, "See all N", "N more lists") | 5 kinds | 0 |
| Rail subtitles | 3 visible, 8 written | 0 |
| Things on a card photograph | seal, gem chip, star, info button | the save control only |
| Explore raw buttons (ExploreTab + ExploreRails) | 21 | 14 (the filter row and rail, T440) |
| 62-v6-explore.css meter: font sizes, radii, legacy reads | 29, 15, 93 | 25, 11, 76 |
| 25-feature-pages.css meter: font sizes, radii, legacy reads | 288, 118, 592 | 256, 111, 541 |
| verify_explore | (old contract) | 73 of 73 on the new contract |
| Quality floor, Explore (8 screens) | the run aborted on the new classes | every floor check passes |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Row photographs were broken images | A 300 px thumbnail was asked for; Wikimedia renders only fixed widths | 250 px, the smallest rendered width (2x for a 72 px photo) |
| "Hiking bases" listed Paris, Amsterdam, Bruges | Cities have trail ends nearby | The guided layer ignores trail proximity for cities |
| The phone showed a large "Explore Europe" heading above the list | The old phone rule hid a span this task removed | The title is visually hidden on a phone again |
| The tile's raw `<button>` was a new lint violation | Destination pages have no URL of their own, so no link | Tiles use the kit `Card`, whose opener is in the kit |
| Quality floor counted five card titles as 52 x 19 px targets | It measured the title, not the card the opener stretches over | The audit takes the card's box for a kit Card opener |
| The selected row used an inset shadow | My first draft | A 2 px brown outline (the skill bans inset shadows) |

## What is still open

- **T427-a.** The input row (budget, month, no car, shortlist) and the filter rail still use their old controls and hold Explore's remaining 14 raw buttons. T440 moves them onto the kit and into the rail.
- **T427-b.** A "Recently viewed" section needs a place that records views (the destination page, outside Explore). It is left for a later task.
- **T427-c.** The hover preview still shows the compact receipt from `CostSummary.jsx`, with its source words. T429 cleans the shared receipt.
- **T427-d.** The guides strip on Explore ("N guides published by travellers") is the community surface's count. It goes with the T443 sweep.
- **T427-e.** The map's own list and pins are unchanged (clusters, the dark floating switch). That is T441.

## Rollback procedure

Revert the T427 commits in both repos. `TierLegend.jsx` and the deleted CSS and strings come back with the revert; the T439 data returns to the version that counted city trail ends.
