# T1122: The umber cost card as signature (flagged variant)

Roadmap item **G3** (session S38). Gated: the owner has not approved the T1111 design direction (`docs/design/direction.md`, row T1111-a), so this task does only the ungated half.

## Date

2026-11-06

## What changed

The plan tab's cost card (`planner/trip/CostCard.jsx`) has a second look, the umber signature card from direction section 3, built behind a flag that is OFF: `COST_CARD_UMBER = false` in `planner/trip/costCardVariant.js`. With the flag off, travellers see today's arc card, unchanged (DOM check in the tests and in the browser). With `?cc=umber` in the address (kept for the tab's session, `?cc=arc` to go back) the card draws in bands: the deep umber ground (`--home-ground-deep`), the stage radius (28 px), the soft umber shadow, the total on `--text-total` (capped at 13 percent of the card's width) in weight 800 with tabular figures, its unit, a per person line under a group total, the budget line, a cost bar on a cream track, the four rows on a lighter umber band (`--umber-700`) and a foot strip with one primary action (Costs, cream on umber) and the quiet "Add what you paid". The arc is not drawn in the variant. The bar uses the cost colours: flight `--sun-400` (with a 1.5 px `--umber-600` keyline, because saffron on cream is 1.7:1), getting around `--sun-800` (the flight's family; the direction names only three colours), bed `--action`, food `--lagoon-600`. Segments sit 3 px apart. A share is printed inside a segment when it is 14 percent or more. A group with no figure yet is drawn as a dashed `--umber-500` mark at the end. The mark is not a figure. The bar is `aria-hidden`; every figure is in the rows. Motion: segments grow from the left, 140 ms apart (`--dur-4`, `--ease-out`). The total settles in place (opacity and 4 px rise over `--dur-3`, keyed on the figure) when it changes, and never counts up (Operate). With reduced motion, everything is in its end state at once. Dark surroundings: the app has no dark theme yet, so under `prefers-color-scheme: dark` the shadow is swapped for a cream hairline (one elevation still). Forced colours give the card, the track and each segment a `CanvasText` edge. No token was added or changed. No `:root` motion token was touched (S40 owns those).

## Files touched

- `continent-app/src/planner/trip/CostCard.jsx` (variant branch, `CostBar`; arc path unchanged apart from sharing the unit string)
- `continent-app/src/planner/trip/costCardVariant.js` (new: the flag, `costCardVariant()`, `rememberCostCardPreview()`, `barSegments()`)
- `continent-app/src/styles/92-cost-card.css` (new `.is-umber` section at the end; nothing above it changed)
- `continent-app/src/main.jsx` (one side-effect import, see What broke)
- `continent-app/tests/costCardUmber.test.mjs` (new, 7 tests)
- `docs/HANDBOOK.md` (trip page section, point 2), `ROADMAP.md` (G3 status), `Execution/_OPEN.md` (rows T1122-a to c)

## Commands run

```
cd continent-app && npm ci
node scripts/sync-data.mjs --split-only        # gitignored boot.json and dest/ for the dev server; the master is not in the container
npx eslint src/planner/trip/CostCard.jsx src/planner/trip/costCardVariant.js src/main.jsx tests/costCardUmber.test.mjs
node scripts/ci/token-contrast.mjs
npm test
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
bash ../.claude/skills/impeccable/scripts/impeccable detect --json src/planner/trip/CostCard.jsx src/styles/92-cost-card.css
npx vite --port 5210 --strictPort   # plus a Playwright look script in the session scratchpad
```

## Config and secrets set

None. `COST_CARD_UMBER` stays `false`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Default card (flag off), phone 390 px, height | 507 px | 507 px | 0 (unchanged) |
| Default card (flag off), desktop 1440 px, height | 515 px | 515 px | 0 (unchanged) |
| Umber variant, phone 390 px, height | n/a | 601 px | +94 px vs arc |
| Umber variant, desktop 1440 px, height | n/a | 593 px | +78 px vs arc |
| Total figure size, phone / desktop | 30 px / 30 px | 40 px / 64 px (variant) | direction's `--text-total` |
| token-contrast.mjs | 0 under the floor | 0 under the floor | 0 |
| npm test | pass | 1564 tests, 0 fail | +7 tests |

The variant is taller than the arc card, mainly because of the 40 to 64 px total and the foot strip. That cost belongs in the owner's review of open decision (c) in direction section 7.

Contrast (from the tokens, in the test): cream on the ground 9.8:1, on the band 7.3:1; the quiet text 4.5:1 or more on both; the primary label on cream 9.8:1; share labels 5.4 to 5.8:1 on their segments. Marks against the cream track: getting around, bed and food 5.1:1 or more, the flight keyline 5.4:1 (and 3.1:1 against saffron), the dashed mark 3:1 or more.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `?cc=umber` did nothing in the browser | The app's state writer rewrites the address on boot, before the lazily loaded cost card mounts | `costCardVariant.js` records the preview in sessionStorage when it loads; `main.jsx` imports it first thing (one line). This is the only touch outside the cost card's files |
| The dev server showed "couldn't load Carta's travel data" | `public/boot.json` and `public/dest/` are generated and gitignored; the master `app_data/app_data.json` is not in the container | `node scripts/sync-data.mjs --split-only` built them from the shipped `public/app_data.json`; nothing tracked changed |
| Flight and photo hosts unreachable | Container network | The look script answered the data host with an empty airline index and 404s, and aborted Wikimedia; the trip priced from the share hash's typed fare (EUR 240) |
| Lint warning on the component file | Pure helpers exported beside components | Moved the flag and helpers to `costCardVariant.js` |

## Screens checked

Plan tab trip page (share hash, two stops BGY and VCE, two people, typed fare EUR 240), 390 x 844 and 1440 x 900, `npm run dev`-equivalent vite server:
- Without a query: the arc card, 20 px radius, no `.is-umber`, as before.
- With `?cc=umber`: the umber card, 28 px radius, four segments (flight 13 percent without a label, stay 50 percent, food 33 percent), rows on the band, Costs as the cream primary (full width on the phone, right on desktop), no sideways scroll, no page errors.
- `?cc=umber` with reduced motion: segments and total in their end state at first paint.
Screenshots: `Execution/P15/T1122-shots/` (gitignored).

**Preview note for the owner.** Open any trip's page on the dev server or a preview deploy, twice:
- old: `http://localhost:5173/?cc=arc` (or the trip's own address with `cc=arc` added)
- new: `http://localhost:5173/?cc=umber`
The choice is kept for the browser tab, so open the trip after loading the address. Use `?cc=arc` to go back.

## What is still open

- T1122-a (user): approve T1111, then flip `COST_CARD_UMBER` to true. Until then nothing a traveller sees changes.
- T1122-b (next task): G3 says one component in four places. This task built the plan tab's card only. The place page (`DestPriceCard`), the Plan receipt and Explore card detail still need it, and so does retiring `CostArc` and closing T1026-c. All of that waits on the approval.
- T1122-c (user): a look on a real phone with the dark setting and reduced motion. The container has only headless Chromium.
- Departures from the defaults, for the review: getting around uses `--sun-800`, because the direction names three cost colours and the card has four groups. The flight segment carries a keyline so it meets 3:1 on the cream track. The primary is cream, not the brown `--action`, because brown on deep umber is 1.8:1.

## Rollback procedure

`git revert` the T1122 commit. Nothing is one-way. With the flag off, the shipped look does not depend on the variant.

## Owner steps (for the checklist)

- [T1122-a] Approve the design direction, then switch on the umber cost card | G3's card is built and waits only on the T1111 sign-off | read docs/design/direction.md and answer row T1111-a; compare a trip page with ?cc=arc and ?cc=umber at phone and desktop width; if approved, set COST_CARD_UMBER = true in continent-app/src/planner/trip/costCardVariant.js (or ask a session to) | continent-app/src/planner/trip/costCardVariant.js
- [T1122-c] Look at the umber card on a real phone | the container has no real device, dark system setting or Safari | on iOS Safari and Android Chrome open a trip page with ?cc=umber; turn on dark mode and reduce motion in the phone settings and reload; check the bar, the total and the Costs button | Execution/P15/T1122-cost-card.md
