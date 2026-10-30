# T878: the persona question redesigned under the owner's design freedom, ten personas, deployed

## Task ID

T878

## Date

2026-10-30

## What changed

The owner did not like the T877 persona screen (a place photograph per row) and asked for something cleaner and more professional: a general statement first, a button that shows the whole persona, and no place photos. The focus was to be where people stay and what they visit, with enough personas that every traveller fits. A first redesign (line-icon rows, then ink tiles) was "not modern enough". The owner then lifted the carta look rules ("Ignore carta constraints", "give impeccable more freedom, less constraints") and asked for that decision to be written into the design docs.

**The design docs.**
- carta-design SKILL.md gains a first section, "Owner decision 2026-10-30: design freedom". The look rules are now defaults, not bans: colour worlds, gradients, illustration and diagrams, richer motion and bolder type are allowed where they make a screen better.
- Still binding: contrast, 44 px targets, reduced motion, honest numbers, the copy rules and licensed photography.
- Its seven ship questions now gate only on figures, money, copy and contrast.
- The same decision is written into CLAUDE.md, PRODUCT.md (Visual brand commitment), DESIGN.md (Overview) and the impeccable surface brief (`continent-app/.impeccable/surfaces/src.md`).

**Ten personas.** Two traveller types were missing:
- **By the sea** (`coast`): a new `coast` feature (beach and islands values, or the coast tag).
- **One base, slow days** (`slow`): base and quiet weighted.

Each has its profile, default shapes and an honest reason ("By the sea in Dubrovnik"; "Biarritz, a base to settle into", which needs a single base).

**The screen** (`PersonaScreen`, new `PersonaMark.jsx`):
- Each persona is a tile in its own colour world: a soft gradient in its tint, with its mark drawn in the deep shade. The mark is a small diagram of how that traveller moves, and the filled dot is always where they stay: city blocks linked for Big cities, spokes from a base for day trips, a hollow hub with a small base beside it for Near the hubs.
- Under the mark sit the name, a short tagline and Details. Two columns on a phone, five from 769 px.
- Choosing a tile adds a ring and a check badge in the persona's ink, and the mark draws its lines once (stroke-dashoffset; off under reduced motion).
- Details opens a sheet: the mark large on its colour world, the general statement as a headline, then where you stay, what you visit, getting between places and examples (as words), then Choose this style. The tile and Details are sibling controls.
- Every Details label holds 5.3 to 7.3:1 on its tint, measured on the preview.

## Files touched

**Created:** `continent-app/src/planner/flow/PersonaMark.jsx`; `Execution/P15/T878-persona-design-freedom.md`

**Modified (app, commits 45045af and f9231bf, mirrored in the root repo):**
- `continent-app/config/recommend.json` (ten ids, coast and slow profiles, shapes and reason facts; the photos map removed)
- `continent-app/src/lib/recommend/persona.js` (coast feature, coast and slow reasons)
- `continent-app/src/planner/flow/setupScreens.jsx` (PersonaScreen and PersonaSheet), `questions.js` (icons, ten options)
- `continent-app/src/styles/86-plan-flow.css` (the persona block)
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (statements, taglines, the sheet's four facts per persona, labels, two reasons)
- `continent-app/tests/persona.test.mjs`
- `continent-app/.impeccable/surfaces/src.md`

**Modified (root):** `.claude/skills/carta-design/SKILL.md`, `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, `Execution/_OPEN.md`

## Commands run

1. `npm test` (1122 of 1122), eslint on the touched files, `impeccable detect` (none).
2. `VITE_E2E_SEAMS= npm run build:pages` (PASS, 280 files) and `css-routes --check`. Two rounds found new same-weight selectors in the route sheets (`.pf-persona-fact dt svg` against day-planner rules); the rule was removed, since the icon takes the label's colour through currentColor. Back to the 1 known problem (T833-a).
3. Preview deploys and screenshots on preview.carta-app.pages.dev at 375 and 1440 px (the dev server had stalled under memory pressure), each round fixed in one batch: colours not applying, the mark's class colliding with the step dots, desktop sizing.
4. `npx wrangler pages deploy dist --project-name carta-app --branch preview` (1bf4a8d4), then a smoke walk; `--branch main` (632ec87f), then the same walk on www.carta-europetravel.com.

## Config and secrets set

`config/recommend.json` `persona`: ids gain `coast` and `slow`; `profiles.coast`, `profiles.slow`, `shapes.coast`, `shapes.slow`, `reasonFacts.coast`, `reasonFacts.base`; `photos` removed. No secrets.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Personas | 8 | 10 |
| Place photos on the persona screen | 8 | 0 (10 drawn marks) |
| Details label contrast on its tint | n/a | 5.3 to 7.3:1 |
| `npm test` | 1121 | 1122 |
| Search stand, production walk | 3,969 ms | 3,978 ms |
| Live entry | `index-TNJzLCFj.js` (Pages d831a0a4) | `index-CKuy4JqC.js` (Pages 632ec87f) |

## What broke and how it was fixed

- Every tile showed the same neutral colours: the fallback `.pf-persona-item[data-p]` outranked the per-persona `[data-p="cities"]` rules. The fallback is now `[data-p]`, declared first.
- The marks sat on white pills with a border: the class `.pf-mark` was already the header's step dots. Renamed to `.pf-pmark`; the old rule no longer touches the step dots either.
- The dev server stalled (machine short on memory, an old server still holding the port), so the visual checks moved to preview deploys.
- The route check flagged the sheet's icon rule twice; it was dropped.

## What is still open

- `scripts/ci/design-lint.mjs` still enforces the old bans and flags the persona block (12 hex colours for the colour worlds, 2 gradients, 3 shadows), all deliberate under the owner's decision. Update the lint (and token-contrast) to match the design-freedom rules (T878-a).
- The ten colour worlds are screen-scoped values in `86-plan-flow.css`. If another screen reuses them, move them into `01-tokens.css` and DESIGN.md (T878-b).
- Croatia's catalogue is small, so several personas lead with the same places there (Dubrovnik, Split). More places in small countries would sharpen the persona (T878-c).

## Rollback procedure

- **Production:** roll back to d831a0a4 (T877) in the Pages dashboard.
- **Code:** `git -C continent-app revert f9231bf 45045af` and revert the root sync. Saved trips with `coast` or `slow` normalise to no persona on the older code.
- **Docs:** reverting the root sync commit restores the earlier design rules.

## Notes on filling this template

One task: the redesign, the two new personas and the docs change were asked for in one message and ship together.
