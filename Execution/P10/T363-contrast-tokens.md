# Execution Report: T363

## Task ID

T363: the contrast tokens the owner chose to darken (register row T362-a)

## Date

2026-10-07

## What changed

Three token pairs failed the 4.5:1 floor that PRODUCT.md promises: `--ink-mute` on `--paper`, `--accent` as text on `--paper`, and white (`--on-fill`) on `--accent`, which is every primary button label. On 2026-10-07 the owner chose to darken the tokens rather than change where they are used (T362, owner runbook block A). This task applied the values T362 proposed in DESIGN.md: `--ink-mute` goes from `#7d8393` to `#646978` and `--accent` from `#e05a47` to `#ce3823`, both at the same hue, only darker. The three hover fills that sit on top of the accent were stepped darker with it, so a hovered button still reads as a step below a resting one. Every screen that uses those tokens moves at once, because nothing in the app hardcodes them in CSS. On the eight screens photographed for the owner, text under AA that comes from these tokens fell from 71 runs to 3. The merge is held: the owner decides it from the side-by-side screenshots in `Execution/P10/T363-shots/` (row T363-c).

The change is one change in two repositories, which is the pair CLAUDE.md asks for ("a task that changes a token in `:root` updates `DESIGN.md` in the same commit"). The stylesheet half is app commit `43b57d9` (`src/styles/01-tokens.css`). The record half is root commit `ac75d73de` (`DESIGN.md` and the carta-design skill's colour table and `assets/tokens.css`). The app is its own git tree, so one commit cannot hold both files. The two commits are on branches with the same name and must be merged together or not at all.

How the hover values were chosen. Each old hover fill had a contrast step above the old accent (white on `--accent-hover` was 4.42:1 against 3.67:1 on `--accent`). Each new hover keeps that same step above the new accent: the old ratio under white times 4.98 / 3.67. `--accent-press` and `--accent-press-alt` keep their own hue and saturation. `--accent-hover` keeps the accent's saturation instead of its old, lower one. At the old saturation it would have come out as `#af3b2b`, 3.1 units from `--danger` (`#b3372a`) in CIELAB, which is the same colour to the eye. carta-design reserves `--danger` for destruction. At the accent's saturation it is `#b7321f`, 6.7 units from `--danger` (the old hover was 8.7). The new `--accent` itself stays as far from `--danger` as the old one did (14.2 units against 13.9).

What was not changed, and why. `--accent` as text on `--accent-bg` rises from 2.82:1 to 3.83:1 but still fails. That pairing is common: 65 CSS rules paint `--accent` text on an `--accent-bg` fill (selected chips, step numbers, the "on" state of toggles). Lightening `--accent-bg` until it passes would need `#fdf4f2`, which is lighter than `--paper`, so a selected chip would stop looking selected. The fix is a darker text step in those 65 rules (`--accent-hover` gives 4.63:1 on `--accent-bg`). That edits files outside this task's scope, so it is row T363-a. `--accent-bg`, `--accent-soft` and every other token are unchanged.

## Contrast of every changed token pair

Ratios are WCAG 2.x contrast: (L1 + 0.05) / (L2 + 0.05), where L1 is the relative luminance of the lighter colour and L2 that of the darker. Relative luminance is 0.2126 R + 0.7152 G + 0.0722 B over linearised sRGB channels (c / 12.92 at or below 0.04045, else ((c + 0.055) / 1.055) ^ 2.4). Computed with a script in the session scratchpad. Text needs 4.5:1, and a focus ring or other non-text mark needs 3:1.

| Token | Old | New | Ground | Before | After |
|---|---|---|---|---|---|
| `--ink-mute` as text | `#7d8393` | `#646978` | `--paper` `#f8f6f0` | 3.51 | 5.07 |
| `--ink-mute` as text | `#7d8393` | `#646978` | `--paper-dim` `#efece2` | 3.21 | 4.63 |
| `--ink-mute` as text | `#7d8393` | `#646978` | `--bg-card` `#ffffff` | 3.79 | 5.48 |
| `--ink-mute` as text | `#7d8393` | `#646978` | `--accent-bg` `#f7dcd4` | 2.91 | 4.21 |
| `--accent` as text | `#e05a47` | `#ce3823` | `--paper` | 3.40 | 4.61 |
| `--accent` as text | `#e05a47` | `#ce3823` | `--paper-dim` | 3.10 | 4.22 |
| `--accent` as text | `#e05a47` | `#ce3823` | `--bg-card` | 3.67 | 4.98 |
| `--accent` as text | `#e05a47` | `#ce3823` | `--accent-bg` | 2.82 | 3.83 |
| `--on-fill` `#ffffff` on `--accent` | `#e05a47` | `#ce3823` | the accent fill | 3.67 | 4.98 |
| `--accent` focus ring (non-text) | `#e05a47` | `#ce3823` | `--paper` | 3.40 | 4.61 |
| `--on-fill` on `--accent-hover` | `#cf4c3a` | `#b7321f` | the hover fill | 4.42 | 6.02 |
| `--accent-hover` as text | `#cf4c3a` | `#b7321f` | `--accent-bg` | 3.40 | 4.63 |
| `--on-fill` on `--accent-press` | `#b0431a` | `#8e3615` | the hover fill | 5.73 | 7.81 |
| `--on-fill` on `--accent-press-alt` | `#b3491b` | `#923b16` | the hover fill | 5.40 | 7.34 |

Three pairs in the table still fail as text: `--ink-mute` and `--accent` on `--accent-bg`, and `--accent` on `--paper-dim`. All three are in row T363-a.

## Files touched

App repository (`continent-app`, branch `p10-contrast-tokens`):

**Modified:**
- src/styles/01-tokens.css

Root repository (branch `p10-contrast-tokens`):

**Modified:**
- DESIGN.md (the two colour rows, the three accent-state rows, the pending paragraph rewritten as done, the sync line)
- .claude/skills/carta-design/SKILL.md (colour table: the two values, one new row for the hover fills)
- .claude/skills/carta-design/assets/tokens.css (the two values)
- Execution/_OPEN.md (T362-a closed, T363-a to T363-c added)

**Created:**
- Execution/P10/T363-contrast-tokens.md
- Execution/P10/T363-shots/ (24 PNGs: for each of explore, destination, journey and planner at 380 and 1280 px, a `-before.png`, an `-after.png` and a `-compare.png` with before on the left and after on the right)

**Deleted:**
- None

## Commands run

All in the worktrees `wt\T363` (root) and `wt\T363-app` (app), with the live Supabase variables unset in every shell.

```
git sparse-checkout add .claude                       # root worktree, to edit the skill
node node_modules/vite/bin/vite.js --port 5210 --strictPort --host 127.0.0.1   # app worktree; no predev hook
node <scratchpad>/t363-shots.mjs before <scratchpad>/shots   # on the untouched branch
# edit src/styles/01-tokens.css
node <scratchpad>/t363-shots.mjs after <scratchpad>/shots
node <scratchpad>/t363-compare.mjs <scratchpad>/shots         # the eight compare images and pixel counts
# stop the node process listening on 5210
npm run lint ; npm test ; node scripts/ci/design-lint.mjs ; npm run build
rm -rf dist dist-data
```

The shot script opens each screen in a fresh headless Chromium context with the same seeded storage as `scripts/ci/smoke.mjs` (English, guest mode, map guide dismissed), reduced motion, transitions frozen, focus blurred, scrolled to the top, and waits for every image to load. The screens are `/?tab=map` (Explore), `/#dest=LIS` (the Lisbon destination page), Destinations, then Trips, the first style and the first trip (the Donauradweg journey page), and `/?tab=trip` (the trip planner, step 1). Viewports are 380 by 800 and 1280 by 800, each a viewport-height capture.

Two checks show that each pair compares like with like. First, every screen had the same number of visible text runs before and after (28, 89, 48, 76, 39, 75, 16 and 24). Second, a pixel count of the exact token colours: the before shots hold 34,714 pixels of `#e05a47` and none of `#ce3823`, and the after shots the reverse, 34,707 and none. The difference of 7 pixels is from anti-aliasing.

## Config and secrets set

None.

## Before/after measurements

Text runs under the WCAG AA floor in the visible viewport of the eight screens. The method is the one in the T193 audit: the computed text colour against the first opaque background up the tree. The token-attributable count is the failures whose text or ground is one of the changed tokens.

| Screen | Before | After | Delta |
|---|---|---|---|
| Explore, 380 | 11 | 1 | -10 |
| Explore, 1280 | 22 | 0 | -22 |
| Destination, 380 | 16 | 11 | -5 |
| Destination, 1280 | 25 | 14 | -11 |
| Journey, 380 | 15 | 11 | -4 |
| Journey, 1280 | 48 | 45 | -3 |
| Trip planner, 380 | 5 | 1 | -4 |
| Trip planner, 1280 | 10 | 1 | -9 |
| All eight screens | 152 | 84 | -68 |
| Of which from the changed tokens | 71 | 3 | -68 |

The 81 failures left on both sides are all white text on `--paper-dim`. These are labels laid over photographs (card titles, hero credits): the audit cannot see a photo behind an absolutely placed label, so it reads the label against the page ground under the photo. No token pair is involved, and the count is the same before and after. The 3 that remain from the tokens are all on `--accent-bg` (row T363-a). The journey page has almost no accent in its first viewport, so most of its change is `--ink-mute`.

Definition of done in the app worktree: `npm run lint` 0 errors (72 warnings, all `no-unused-vars` and hook rules in JavaScript, which a CSS change cannot touch); `npm test` 212 pass, 0 fail; `node scripts/ci/design-lint.mjs` 196 violations, 196 in the baseline, 0 new; `npm run build` passes and the built CSS carries `#ce3823`; `dist/` and `dist-data/` deleted; dev server stopped.

## The seven carta-design questions

1. Any hex value outside the token file? No. The diff adds hex values only inside `:root` of `src/styles/01-tokens.css` and in the two documents that record it. The design lint reports 0 new violations.
2. Any gradient, any colour not in DESIGN.md, any second saturated hue beside `--accent`? No gradient. Every new value is written into DESIGN.md in the same change. The hue of `--accent` is unchanged (0.02 in HLS), so it is still the one saturated colour.
3. Is ochre used for anything but a rating, teal for anything but a gem, `--danger` for anything but destruction? Unchanged. The hover fill was deliberately kept away from `--danger`, as explained above.
4. Is any mono text prose, or any column number set in sans? Not touched.
5. More than one primary button in a view? Not touched. The screenshots show one primary per view, as before.
6. Does every headline contain a verb or a number, and is the diff free of em dashes and the banned words? No copy changed. The diff and this report have no em dash and no middot.
7. Remove one thing. Nothing was added to remove. The change only darkens existing values.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First screenshot runs timed out or showed the error boundary ("Failed to fetch dynamically imported module") | The dev server's first dependency scan was still running on a laptop with little free memory. The Vite dependency cache also sits in the shared `node_modules`, so a parallel dev server in another worktree can invalidate it | Warmed the server with one request per lazy module before shooting, then reran the whole set. Every one of the 16 final shots was opened and checked by eye: none is blank or half-loaded, and each pair has the same text-run count |
| Journey page at 1280 px never opened | On desktop the Trips category is already selected and its button sits in the side panel, so the phone selector found nothing to click | The script clicks Trips only when the style grid is not already on screen, through the DOM |
| The first after-run crashed midway | The session was restarted and the orchestrator stopped the server on 5210 | Deleted the partial after shots and retook the whole after set on a fresh server; the before set was complete and is proven old-token by the pixel count |
| Compare images for the phone carried a wide white margin | The capture page kept the previous, wider viewport | Reset the viewport before each composite and measure the composite itself |

## What is still open

T363-a (next task). Text on `--accent-bg` still fails AA: `--accent` at 3.83:1 in 65 rules, `--ink-mute` at 4.21:1, and `--accent` on `--paper-dim` at 4.22:1. Changing `--accent-bg` cannot fix it without making the tint lighter than the page. The fix is for those rules to take a darker text step: `--accent-hover` already gives 4.63:1 there, or a named `--accent-ink` token could be added. That edits most domain stylesheets, so it is its own task. `--accent-soft`, used for hover borders on inputs, is 2.52:1 on paper, under the 3:1 a control boundary needs. It was not part of the owner's decision and is noted here for that task.

T363-b (next task, after the merge decision). Copies of the old values still live outside the token file and did not move with it. They are the PDF palette in `src/lib/destinationPdf.js` (`mute` and `accent`), the `#e05a47` area fill in `src/map/TripMap.jsx`, the fallback values in the `token()` calls in `CyclePage.jsx`, `DestMap.jsx` and `TrailPage.jsx`, the inline `:root` in `scripts/explainer/numbers.mjs` (the /about/numbers page), and a coloured shadow `rgba(224, 90, 71, 0.32)` in `src/styles/24-destination-workspace.css`. The `token()` calls read the CSS variable at runtime, so their fallbacks only matter when the variable is missing. The PDF, the trip map fill and the numbers page will keep the old colours until that task. DESIGN.md's colours-in-JavaScript rule (one token-mirror module) is their home.

T363-c (user, before the merge). Look at the eight comparison images in `Execution/P10/T363-shots/` (`*-compare.png`, before on the left) and approve or reject the merge of `p10-contrast-tokens` in both repositories.

## Rollback procedure

Before the merge, delete the branch in both repositories: `git branch -D p10-contrast-tokens` in the root and in `continent-app`. After the merge, revert both merge commits together: `git revert -m 1 <root merge>` on `main` and `git -C continent-app revert -m 1 <app merge>` on `master`. Reverting only one would leave DESIGN.md and the stylesheet disagreeing. The register rows stay as history. No data, migration or production state was touched, and nothing was pushed or deployed.
