# T437: the Score, Switch and Tile in the kit (Explore redesign, step 1 of 9)

## Task ID

T437

## Date

2026-10-13

## What changed

Ratings no longer draw as filled ochre chips. Every rating in the app (cards, rows, pins, page heads, the map card, the day planner pins, the rating breakdown) is now the Score: a drawn star and the figure in ink, tabular, at 12 px or more, on no fill. The star carries the tier: filled from the second tier up and outlined below, so the band reads without a word. Where a page has room, an opt-in `band` prop adds the band word through i18n: "Exceptional", "Excellent" and "Very good" in six languages.

This came first in the plan for a reason. Without it, the brown palette (T438) would have turned every top-tier chip into a lookalike primary button, because ochre and the new brown are almost the same colour.

`RatingBadge.jsx` was rewritten in place with the same exports (`ScoreChip`, `RatingBadge`, `HiddenGemTag`, `tierClass`) and the same class name, so its 22 callers and the verify scripts did not change.

The English tier labels that the data carries ("Worth the journey") no longer reach the screen. They were removed from the destination head, the rating fold summary, the rating breakdown and the Explore card seal, and from every `aria-label`. The spoken score is now "Rated 9.8 out of 10" in each language.

The kit gained two pieces, each with a style guide entry:

- **Switch:** a `role="switch"` row. Off is an outlined track with a dark thumb, which passes 3:1 without a fill. On is the action colour with the thumb moved across. It is `--tap` high on touch.
- **Tile:** an icon over its word in an even grid, as a toggle or a radio choice with arrow keys. Selected is the tint plus a tick.

Dead rules for the old chip were deleted: the scrim overrides in 24, the pick-row rule in 18, and the tooltip score in 15.

## Files touched

**Modified (app, mirrored in root):**
- continent-app/src/components/RatingBadge.jsx (the Score)
- continent-app/src/components/ui/index.js (Switch, Tile, TileGroup)
- continent-app/src/browse/DestinationPage.jsx (band word in the head and fold, tier from the score when the dossier has none)
- continent-app/src/browse/RatingBreakdown.jsx (Score in the head, band words from i18n)
- continent-app/src/browse/ExploreMap.jsx (map card score drawn as the Score)
- continent-app/src/browse/ExploreTab.jsx (card seal reads the band word, not the English label)
- continent-app/src/styleguide/StyleGuide.jsx, styleguide.css (Score, Switches and tiles sections)
- continent-app/src/styles/04-ui.css (Switch and Tile appended; nothing above them changed)
- continent-app/src/styles/19-guide-ratings.css (the rating block replaced; day planner pin score in ink)
- continent-app/src/styles/25-feature-pages.css (breakdown head and marker, map card score)
- continent-app/src/styles/15-map-overlays.css, 18-detail-panel.css, 24-destination-workspace.css (dead chip rules deleted)
- continent-app/src/i18n/{en,nl,de,fr,es,it}.js (`score.band1` to `score.band3`, `score.aria`)
- continent-app/scripts/ci/design-lint.baseline.json (shrunk)

**Created (app, mirrored in root):**
- continent-app/src/components/ui/Switch.jsx
- continent-app/src/components/ui/Tile.jsx

**Modified (root):** Execution/_OPEN.md. **Created (root):** this report.

## Commands run

```
node scripts/ci/design-lint.mjs --meter <file>     (before and after)
npx vite build
npx vite preview --port 5231 --strictPort
node <scratchpad>/t437.mjs                         (390 x 844 touch and 1440 x 900, English and German: style guide Score and Switches and tiles, Explore, Rome head, Rome rating fold)
node scripts/verify_destination_page.mjs           (all checks passed)
node scripts/verify_beaches.mjs http://localhost:5231/   (all checks passed)
impeccable detect --json RatingBadge.jsx Switch.jsx Tile.jsx 04-ui.css   ([])
node scripts/ci/design-lint.mjs                    (0 new)
node scripts/ci/design-lint.mjs --update-baseline
node scripts/ci/token-contrast.mjs                 (29 pairs, 0 under)
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Filled rating shapes (chip, map card, pin, breakdown, tooltip) | 5 kinds, ochre fills | 0 | -5 |
| English rating labels on screen in non-English languages | 5 sites (head, fold, breakdown, seal, aria) | 0 | -5 |
| Rating figures under 12 px | day planner pin at 11 px | 0 | -1 |
| `19-guide-ratings.css` meter: font sizes, radii, legacy reads | 144, 76, 344 | 140, 70, 334 | -4, -6, -10 |
| Lint baseline total | 10,198 | 10,160 | -38 |
| Kit components | 9 | 11 (Switch, Tile) | +2 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The day planner pin score drew at 11 px with an inset ring | Old rule, and my first rewrite used an inset shadow | 12 px, a 1 px border, no inset shadow (the skill bans inset shadows) |
| The switch focus ring sat on the track with `outline: none` on the row | The lint's outline rule would flag it | The row takes the standard 2 px focus ring |

## What is still open

- **T437-a, owner.** A native review of the four new strings in nl, de, fr, es and it (`score.band1` to `score.band3`, `score.aria`).
- **T437-b.** The rating breakdown's band strip and legend, and every non-rating use of `--rate-bg` and `--rate-soft` (tips tint, festival tags, the travel-day number, password strength), still read the ochre tints. T438 repoints them when ratings join the brown family.
- **T437-c.** The `rating.tier1` to `rating.tier3` keys and `meta.rating_model.tier_labels` still feed the tier legend and the "How good" filter. T427 (legend) and T440 (filter) retire them.

## Rollback procedure

Revert the T437 commits in both repos (app repo `master`, root `main`). No data, schema or config changed.
