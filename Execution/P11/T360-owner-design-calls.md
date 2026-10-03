# Execution Report: T360

## Task ID

T360: owner design calls from waves 11 and 12, and the strip they unlock

## Date

2026-10-03

## What changed

On 2026-10-03 the owner told the orchestrator to settle five open owner rows. The orchestrator decided them as below. The owner can overrule any of them; each is a small, separate change.

1. T161-a accepted as T161 proposed it. The rule is now written into DESIGN.md (new Components section) and into the carta-design skill, in the same commit. T161-b is built: the journey page shows a solid --paper strip flush under the hero with exactly three cells (difficulty as five squares plus the level word, style as one or two words from tags, total cost in mono). Placeholder words ("Unrated", "Mixed", "Price on request") keep three cells on every trip. No new token was needed.
2. T166-a decided: the desktop "Get a pass" chip is now a secondary (transparent, --rule border, 6px radius) and the phone's round plus button is a secondary round icon button (--bg-card, --rule border, 999px radius, 58px box so the tap target stays above 44px). The Button component was not used: both are bespoke classes, so the change is CSS only.
3. T166-b confirmed as chosen. Record only.
4. T159-c confirmed as written in src/lib/notFor.js. Record only.
5. T160-b confirmed as classed in src/lib/footers.js. Record only.

## Files touched

**Modified (app repo, branch p11-owner-design-calls):**
- src/browse/JourneyPage.jsx (strip helper, component, placement inside the hero figure)
- src/styles/25-feature-pages.css (.jstrip rules)
- src/styles/10-shell.css (.bottom-nav-plus)
- src/styles/24-destination-workspace.css (desktop .header-pricing-btn)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (four keys each: journey.stripUnrated, stripMixed, stripPrice, stripAria)

**Modified (root repo, same branch name):**
- DESIGN.md, .claude/skills/carta-design/SKILL.md (the rules)
- Execution/_OPEN.md (six rows closed, one raised)
- Execution/P11/T360-owner-design-calls.md (this report)

**Created / deleted:** none committed. Throwaway Playwright scripts lived in the app worktree and were deleted.

## Commands run

Vite on port 5213 only, one server, stopped afterwards. A Playwright script counted accent-filled visible controls per view at 380 and 1280 pixels, using the T166 method (visible, element at its centre point is itself, computed background equals --accent, --accent-hover, --accent-press or --accent-soft). The "before" run used the two chrome CSS files restored from HEAD, the "after" run the new ones. Then:

```
node scripts/ci/design-lint.mjs
npx eslint src/browse/JourneyPage.jsx
npm test
npm run build      (dist/ and dist-data/ deleted afterwards)
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
```

## Config and secrets set

None.

## Before/after measurements

Accent-filled visible controls per view, identical at 380 and 1280 unless two numbers are shown (380 / 1280). Counts come from the Playwright run described above.

| View | Before | After |
|---|---|---|
| Destinations tab | 1 (plus button) / 1 (Get a pass) | 0 / 0 |
| Explore tab | 2 (Filters, plus button) / 1 (Get a pass) | 1 (Filters) / 0 |
| My trips, empty state | 2 (plus button, Open the Day planner) / 2 (Get a pass, Open the Day planner) | 1 / 1 |
| Destination, beach, lake, mountain, journey, hike trail, city-day trail, trip page | 1 each | 1 each |

Every measured view now shows at most one. No view scrolled horizontally (scrollWidth equal to clientWidth everywhere measured). The journey page shows 1 (Price a trip to ...) with the strip added.

Strip coverage, counted by running journeyStripCells over the journeys wire (all 253 files in public/journeys/journey, read through the dev server): 253 of 253 trips return exactly three cells in the order diff, style, cost. Placeholders in use: 21 Unrated, 30 Mixed, 0 Price on request. Rendered at 380px the strip is 52px high with no cell overflow; at 1280px it is 40px high.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| French string broke the file | An apostrophe in a single-quoted string | Reworded to "Le voyage en bref" |
| Large whole-file diffs after edits | Windows text mode and sed rewrote line endings against the index's endings | Restored each file to its index endings; the commit shows 138 insertions and 19 deletions |
| First count showed 0 on the journey page | The journey page has no deep link, so the script never opened it | Script now clicks Trips, a style card, then the first journey |

## What is still open

T360-a (register): the style cell reads the first one or two word tag, and some tags are place names ("comapedrosa"), so a curated style word per trip would read better. Existing rows T166-c, T166-d, T166-e, T166-f and T166-g are untouched; T166-g (the audit script is not in the repo) is still the reason the count above was a throwaway script. The phone "Passes" chip in the top bar uses a --accent-bg wash with an accent border and was not counted as filled; it was left as is because the prompt names only the plus button on phones.

## Rollback procedure

In the app repo, revert the single T360 commit (42f59cb). In the root repo, revert the report commit. No data, schema or config changed.
