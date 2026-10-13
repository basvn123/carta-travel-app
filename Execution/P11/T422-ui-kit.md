# T422: the component kit and the one selected state (roadmap 1.2)

## Task ID

T422

## Date

2026-10-13

## What changed

Carta has a component kit in `continent-app/src/components/ui/`: Button (primary, secondary, quiet, danger; md and sm; loading, icons, block), IconButton (a 44 px box, a required label, plain, surface and photo tones, a pressed state), Chip (filter, choice in a ChipGroup with arrow keys, count, status with six tones), Segmented (a raised white thumb on a sunken track, radio semantics), Tabs (teal underline, tablist semantics, arrow, Home and End keys), Card (row and tile layouts, fixed slots media, title, meta, price, rating, actions, one stretched opener so nothing interactive nests), Field (input, select or textarea with a required label, help and error tied by aria-describedby) and Icon (16, 20 and 24 px). Styles are `03-button.css` (rewritten on the roles) and the new `04-ui.css`, on roles and scales only. `components/Button.jsx` re-exports the kit's Button, so the 22 existing call sites keep working. The visible half: selection is now one light state across the app. 114 selected-state rules moved from the deep teal fill to the `--select-*` tint with a teal label, 27 labels inside them turned teal, 23 selected objects take a teal edge instead of an ink one, and the active bottom-nav icon and label are teal. The 15 action buttons that were painted ink (sign in, save, add, plan, publish) are now `--action` primaries, the booking hand-off button is a quiet teal-outline button because a view can hold several, and 24 small marks (numbered pins, ticks, progress, chat bubbles) stay deep teal on purpose. Selected filter and choice chips in the kit carry a tick, so the state never rests on colour alone.

## Files touched

**Created (app, mirrored in the root repo):**
- continent-app/src/components/ui/Button.jsx, IconButton.jsx, Chip.jsx, Segmented.jsx, Tabs.jsx, Card.jsx, Field.jsx, Icon.jsx, index.js
- continent-app/src/styles/04-ui.css

**Modified:**
- continent-app/src/components/Button.jsx (re-export)
- continent-app/src/styles.css (imports 04-ui.css after 03-button.css)
- continent-app/src/styles/03-button.css (rewritten)
- continent-app/src/styles/ 10 to 69 (29 files: selection tint, teal edges, action buttons)
- Execution/_OPEN.md (T421-a closed; rows T422-a to T422-c)

**Created (root):**
- Execution/P11/T422-ui-kit.md

## Commands run

```
python select_tint.py src/styles     (scratchpad: {'tint': 114, 'tint-child': 27, 'primary': 15, 'quiet': 1, 'kept': 24})
python select_border.py src/styles   (scratchpad: 23 rules)
node scripts/ci/design-lint.mjs      (141, 0 new)
node scripts/ci/token-contrast.mjs   (29 pairs, 0 under)
npx eslint src/components/ui         (0 problems)
npx vite build && npx vite preview --port 5206 --strictPort
node scripts/verify_quality_floor.mjs t422-kit-b --port=5206 --out=C:/Users/Gebruiker/Documents/Portfolio/design-1.2-baseline
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before (T421) | After | Delta |
|---|---|---|---|
| Selected-state rules painted as a solid fill | 114 | 0 | -114 |
| Selected objects edged in ink | 23 | 0 | -23 |
| Action buttons painted ink | 15 | 0 | -15 |
| Shared kit components | 1 (Button) | 8 | +7 |
| Quality floor, 107 screens | 2 phone targets under 44 px, rest passing, one primary per view | same | 0 |
| design-lint violations | 141 | 141, none new | 0 |

Buttons, cards and chips across the tabs move onto the kit in the migration (T426 onward); the count of distinct button styles is measured there.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Kit chip and tab classes would lose to legacy `.chip`, `.tab`, `.tabs` | Those legacy rules load after the kit | Kit classes take a `ui-` prefix |
| The active bottom-nav icon was white on the new tint | Its colour was set in a separate rule (`--on-fill`) | Icon and label take `--select-ink` |
| Lint: a literal inset shadow and an `outline: none` in the card | First draft | An outline for the selected card; a transparent outline on the stretched link, the card draws the ring |
| eslint: renamed JSX element props flagged unused | The config ignores capitalised vars but not args | `const Tag = as`; Icon uses createElement |

## What is still open

T422-a: the kit is not yet used by the tabs; each tab's migration (T426 onward) replaces its buttons, chips, cards and inputs with the kit and deletes the legacy rules. T422-b: the trip wizard's current step number (`.wiz-step.now .wiz-step-mark`) and a few data marks keep the dark ink; the wizard's stepper becomes one shared component in its migration. T422-c: the phone plus button in the bottom nav now draws as a tint circle; DESIGN.md (T360) wanted `--bg-card` with a border, so the shell migration settles it.

## Rollback procedure

Revert the T422 commits in both repos. The kit files are new and only Button has callers, through the re-export.
