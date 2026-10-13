# T421: Lagoon tokens, the whole app re-skinned (roadmap 1.2)

## Task ID

T421

## Date

2026-10-13

## What changed

Every tab of the app now wears the Lagoon direction chosen in T419, from one token file. `continent-app/src/styles/01-tokens.css` is rebuilt in three layers: primitives (neutral, lagoon and sun scales), roles (`--surface*`, `--text*`, `--border*`, `--action*`, `--select-*`, `--focus`, `--best*`) and the legacy names, each now an alias of a role, so the 9,800 existing `var(--...)` uses re-skinned without touching a component. Figtree replaces Fraunces, Plus Jakarta Sans and JetBrains Mono as the one family; figures are tabular app-wide through `body`. New scales exist for type (eight steps, 11 px floor), radius, elevation and layers, and `--space-5` and `--space-6` moved onto the 4 px grid. The 52 control declarations that painted a selected chip or a button in solid `--ink` (the "looks black" cause) now take `--ink-fill`, a deep teal, until T422 turns selection into a tint; data drawings and toasts keep the ink. Every rule under 10 px was raised to the 11 px floor, rating chips to 12 px, and old cream, ink and terracotta `rgba()` literals were moved onto the Lagoon values. Hidden gems moved from teal to plum, because teal is now the action colour. The browser's own surfaces (selection, caret, native checks, scrollbars) take the palette. A new check, `scripts/ci/token-contrast.mjs`, verifies 29 text and fill pairs; all pass, including teal text on its own tint (4.67:1, the 3.8:1 failure of the baseline). DESIGN.md records the new tokens in the same commit, as CLAUDE.md requires. The owner also chose compact rows by default on Explore and Destinations (closes T420-a), recorded in PRODUCT.md and the direction contract.

## Files touched

**Modified (app, mirrored in the root repo):**
- continent-app/src/styles/01-tokens.css (rewritten)
- continent-app/src/styles/02-base.css (tabular figures, browser surfaces)
- continent-app/src/styles/ 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 68 (font-size floor, ink-filled controls, rgba literals)
- continent-app/src/map/tokenColors.js (mirror values)
- continent-app/index.html (Figtree @font-face and preload, theme-color)
- continent-app/public/manifest.webmanifest (colours)
- continent-app/scripts/ci/design-lint.mjs (mirror check follows var(); var(--font) allowed)
- continent-app/scripts/ci/design-lint.baseline.json (regenerated: 141, no rule rose)
- continent-app/.impeccable/surfaces/continent-app.md (first viewport: compact rows)

**Created:**
- continent-app/public/fonts/Figtree-latin.woff2, Figtree-latin-ext.woff2 (fontsource variable build, SIL OFL)
- continent-app/scripts/ci/token-contrast.mjs
- Execution/P11/T421-lagoon-tokens.md

**Deleted:**
- continent-app/public/fonts/Fraunces-latin(-ext).woff2, JetBrainsMono-latin(-ext).woff2, PlusJakartaSans-latin(-ext).woff2 (the TTF files the PDF export uses stay)

**Modified (root):**
- DESIGN.md (Colour, Type, Spacing, Layout, Interaction, Before you ship)
- PRODUCT.md (density decision)
- Execution/_OPEN.md (T420-a closed; rows T421-a to T421-f)

## Commands run

```
node scripts/ci/token-contrast.mjs --all
node scripts/ci/design-lint.mjs --update-baseline
npx vite build
npx vite preview --port 5206 --strictPort
node scripts/verify_quality_floor.mjs t421-lagoon --port=5206 --out=C:/Users/Gebruiker/Documents/Portfolio/design-1.2-baseline
impeccable detect --json --viewport 390x844|1440x900 <the same 11 routes as T418>
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before (T418) | After | Delta |
|---|---|---|---|
| Detector: low-contrast renders | 144 | 0 | -144 |
| Detector: functional text under 11 px | 2,128 | 316 | -1,812 |
| Detector: cream palette | 22 | 0 | -22 |
| Detector: overused font | 22 | 0 | -22 |
| Token contrast pairs under 4.5:1 | not checked (3 known) | 0 of 29 | |
| Typefaces shipped | 3 | 1 | -2 |
| Font files preloaded for first paint | 2 | 1 | -1 |
| Controls filled with solid ink | 52 | 0 | -52 |
| Rules under 10 px | 39 | 1 (SVG text inside a scaled drawing) | -38 |
| Quality floor (107 screens) | 2 phone targets under 44 px, everything else passing | same | 0 |
| Walker: bare figures without tabular numerals | 167 | 89 | -78 |
| design-lint violations | 150 (baseline) | 141, none new | -9 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| design-lint flagged `--font` as a font literal | The rule allows a typeface name only in `--display`, `--ui` or `--mono` | The face lives in `--ui`; `--font` aliases it; the rule accepts `var(--font)` |
| token-mirror-drift would fail on every aliased name | The mirror check compared the raw declaration (`var(--x)`) | The check follows the var() chain to its value |
| 22 baselined shadow-literal lines reported as new | The baseline keys on line text and their rgba colours changed | Regenerated; totals per rule did not rise (shadow-literal 89 to 88) |
| A shell heredoc broke on quoting while editing DESIGN.md | Mixed quotes in a long heredoc | Wrote the edit as a script file |

## What is still open

T421-a: selection is still a deep teal fill (`--ink-fill`); T422 builds the kit and moves every chip, tab and segment onto the `--select-*` tint. T421-b: three outputs still carry the old fonts and colours: the destination PDF (`src/lib/destinationPdf.js` embeds Plus Jakarta Sans and JetBrains Mono TTFs), the share cards (`scripts/og/render.mjs`, Fraunces) and the numbers explainer (`scripts/explainer/numbers.mjs`, Google-hosted fonts and the old tokens). T421-c: the brand mark (the compass in the header, favicon and app icons) still has the old red needle and ink; regenerating it with `scripts/og` is a brand call. T421-d: `scripts/verify_quality_floor.mjs` still tests for Fraunces and JetBrains Mono (serif size, prose in mono, bare figures); its type checks need rewriting for one family. T421-e: 316 detector hits remain for text at 10 to 10.5 px, which the migration moves onto the scale. T421-f: the owner looks at every tab on a phone, as the plan's T421 checkpoint asks.

## Rollback procedure

Revert the T421 commits in both repos. The old font files come back with the revert of their deletion; nothing else depends on the new tokens yet.
