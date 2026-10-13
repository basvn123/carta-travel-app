# T424: the style guide page (roadmap 1.2)

## Task ID

T424

## Date

2026-10-13

## What changed

The "one place" of roadmap 1.2 exists: `?styleguide` opens Carta's design system page instead of the app. It is built from the live kit and the live tokens, so it cannot drift from what ships: colour roles with their resolved values and what each is and is not for, the text pairs with their measured contrast, the primitive ramps, the type scale on real copy, spacing, radius and elevation, the four button kinds with disabled and loading states and the icon button, the four chip kinds (filters toggle, the month choice group moves with arrow keys, every status tone), the segmented control and tabs, the card anatomy as compact rows and photo tiles with real catalogue photos (Kotor, Hallstatt, Plovdiv), fields with help and error, every icon at the three sizes, the price rules with a live table and the six-language table, and the rules list. Each section says when to use it and what not to use it for. A language switch at the top previews every kit label and price in all six languages. The page is lazy-loaded with its own stylesheet (a separate 7 kB CSS chunk), so the app's first paint carries none of it; it is marked noindex and linked from nowhere.

## Files touched

**Created (app, mirrored in root):**
- continent-app/src/styleguide/StyleGuide.jsx
- continent-app/src/styleguide/styleguide.css

**Modified:**
- continent-app/src/main.jsx (renders the style guide at ?styleguide, inside the i18n provider)
- Execution/_OPEN.md (rows T424-a to T424-c)

**Created (root):**
- Execution/P11/T424-styleguide.md

## Commands run

```
npx vite build && npx vite preview --port 5206 --strictPort
node shot_sg.cjs / shot_sg2.cjs   (scratchpad: full page and per-section captures at 390 and 1440)
impeccable detect --json --viewport 390x844|1440x900 http://127.0.0.1:5206/?styleguide
node scripts/ci/design-lint.mjs   (141, 0 new)
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| A page that shows each part of the system with an example and when to use it | none | `?styleguide`, 11 sections |
| Style guide: horizontal scroll at 390 and 1440 | | none |
| Style guide: h1 count | | 1 |
| Style guide: console errors | | 0 |
| Detector on the style guide | | 3 tiny-text (the existing rating badge, at 10 px, moves onto the scale in its migration), 1 line-length, 1 monotonous-spacing, 1 em-dash finding that is a false positive (token names written with two hyphens) |
| App first-paint CSS added by the page | | 0 (separate lazy chunk) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Card titles on the page had a 30 px gap under them | The page's section-heading rule matched the cards' own h3 | Scoped to `.sg-section > h3` |
| A literal inset shadow would have failed design-lint | Swatch outlines drawn with box-shadow | Outline with a negative offset |

## What is still open

T424-a: the owner approves the style guide on a phone and on desktop; that closes the design half of roadmap 1.2 (plan checkpoint). T424-b: the existing RatingBadge still renders a 10 px label inside its chip; it becomes the kit's Score in the migration. T424-c: the page's prose is English reference text for the team, not i18n; the kit's labels and every price on it do switch language.

## Rollback procedure

Revert the T424 commits in both repos. Without the `?styleguide` parameter the app renders exactly as before.
