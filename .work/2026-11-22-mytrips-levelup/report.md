# Report: My trips, the visual level-up (ink and photo)

**Status: done (merged into main as `69371e6df6`, pushed and shipped live on 2026-11-23)**

**Result:** My trips is rebuilt in "ink and photo" (11 commits after `eb0b514152` on `p15-my-trips`, merged into main with the flow layout and shipped on 2026-11-23):
- photo cards with large photos;
- one head, one two-way control, one chip and one price line;
- clean bars, a compass and grade cells;
- no beige.

Every check passes. The judges failed it three times on phone and desktop alone, each time on a small cut. The last items are fixed and measured, but not re-judged.

## What the traveller gets
- **Bewaard:**
  - places as photo cards: 172 px wide on a phone (was 72), 262 at 1180 and 191 at 1440;
  - Gevolgd in ink, with no grey card;
  - framed list covers;
  - a country head with its silhouette when a country is picked;
  - chips as outlines with a tick, with no beige.
- **Reizen:**
  - Komend and In planning with 4:3 photos;
  - Today's doors as ruled rows;
  - the grade tiles without beige;
  - "Concept" as an outlined tag;
  - "Nog geen prijs" on one line.
- **Jouw Europa:**
  - the trip log is folded into Eerdere reizen (Per jaar | Op cijfer);
  - past trips as photo cards with the grade as ten cells;
  - nights and months as clean bars (owner amendment), with no helper line;
  - a drawn compass for the extremes;
  - cost bars on a baseline with the average notch.
- **Uitgaven:**
  - the same frame control;
  - food against the plan as ten tiles;
  - no grey pills.
- **The sub-tabs** carry no counts.

## Checks
See `checks.md`:
- `verify_mytrips` in six languages: 216 cells, 0 fail.
- The full grid at 390, 820, 1180 and 1440: 156 cells, 0 fail.
- `verify_spend`: 83, 0 fail.
- `css-routes` clean, lint 0 errors.
- `npm test`: failures only from "transport invoke timed out" in files this run did not touch, and the same files fail on main.

After round 3, `verify_mytrips` in de and nl at 360, 390, 1180 and 1440 gave 72 cells, 0 fail.

## Judging
| Round | Score | Result |
|---|---|---|
| 1 (`judgement-1.md`) | 4.1 | FAIL: phone and desktop 3 (German cost names, German friends line, memory row alignment) |
| 2 (`judgement-2.md`) | 4.1 | FAIL: the friends line rule lost the cascade |
| 3 (`judgement-3.md`) | 4.1 | FAIL: door values ended in an ellipsis ("Sam, Jo …", "0 Fotos, 0 No…") |

- After round 3:
  - the door values wrap;
  - Saved shows two photos a row from 1100 to 1359;
  - a scan of 60 views (de, nl, fr at 360 to 1440) finds no visible clipped text and no overflow.
- **Not re-judged:** the three loops are used.

## Merge and ship (2026-11-23)
- The owner said yes ("ja doe maar").
- `origin/main` (the home-off commit `337795134b` and N6) merged into `p15-my-trips` without a conflict (`e9b8fd6c53`).
- On the merged build:
  - `verify_mytrips` in nl and en at 360, 390, 1180 and 1440 for spend, years, lots and one: 96 cells, 0 fail;
  - `verify_spend`: 83, 0 fail;
  - `css-routes` clean, lint 0 errors.
- `npm test`: 2485 tests, 15 fail, every one on the main baseline list (`.work/2026-11-22-mytrips-wow/fails-wow-base.txt`).
  - One of them was real and came from the atlas merge of 2026-11-22: design-lint flagged `outline: 0` on `.atlas-badge`.
  - `69371e6df6` drops it, because the badge's own `:focus-visible` rule draws the ring. design-lint now finds 0 new violations.
- Main fast-forwarded to `69371e6df6` and was pushed. `node scripts/ship.mjs --live` built, ran the css proof, pushed the data to R2, deployed the preview and production, and pruned R2.

## Not verified
- The owner's own look on a real phone.
- A fourth judge after the round 3 fixes (the three loops were used).
- A full `npm test` run on an idle machine.

## Undo
`git revert` the commits. There are no data or schema changes.

## Files changed (`git diff eb0b514152..c536c2546e --stat` in the worktree)
| File | Change |
|---|---|
| `continent-app/src/auth/mytrips/atlas/Ink.jsx` | new: SectHead, Frame2, MoveInk, NoPrice, Silhouette, GradeCells, GradeEmpty |
| `continent-app/src/styles/73-mytrips-ink.css` | new: the ink and photo styles and the polish |
| `continent-app/src/auth/mytrips/*.jsx`, `atlas/*`, `spend/SpendPage.jsx`, `SavedTripsPanel.jsx` | the tabs in ink and photo |
| `continent-app/src/styles/01-tokens.css`, `70-mytrips.css`, `72-atlas.css`, `72-spend.css` | beige removed, `--text-figure-lg` |
| `continent-app/src/i18n/{nl,en,de,fr,es,it}.js` | `mt.kindAll`, `mt.showAll`, `mt.spanGroup` |
| `DESIGN.md`, `docs/HANDBOOK.md`, `ROADMAP.md`, `docs/decisions/0016-my-trips-ink-and-photo.md`, `docs/decisions/README.md` | docs |
| `.work/2026-11-22-mytrips-levelup/*` | the run folder |
