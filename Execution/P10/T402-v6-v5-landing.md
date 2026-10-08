# T402: harden, adapt and polish, the landing page and the first run (design wave V5)

## Task ID

T402 (design wave V5, session 2 of 10; surface key `landing`). Branch `p10-v6-polish-landing` in both repos.

## Date

2026-10-09

## What changed

The landing page and the first-run receipt are hardened. Nothing was redesigned.

Every control on both strips is now a real touch target. Before, the three landing selects were 32 px high and the first-run strip's selects and date inputs 28 px, each inside a 44 px or taller cell, so the hit area was the select and not the cell. Now the select or date input fills the whole cell (about 56 px high), and the label sits over it and lets the tap through. A tap anywhere in the cell opens the picker. WebKit also drew a grey native pill around each landing select, because it ignores a bare `border: 0` without `appearance: none`. The selects now use `appearance: none` and a chevron drawn from two borders, so Chromium and WebKit look the same and the double border is gone.

Long names no longer end in an ellipsis. The priced list's town name and the town toggle's name wrap instead, so "Apuseni (Scarisoara Ice Cave)" and "Pelister National Park" read in full at 360 px in every language.

Two edge cases that were holes are now sentences. When the catalogue is in hand but no demo town can be priced, the receipt's place carries one sentence (`landing.noDemo`) instead of the loading block for ever. When the catalogue has no count, the title reads without a number (`landing.titleNoCount`). Coverage that fails to load already left the sentences standing; that is now forced and checked.

`coverage.json` is read only when the coverage section comes within 600 px of the viewport, through an IntersectionObserver (loaded at once where it is missing). A first visit that does not scroll makes no request for it. While it loads, the table's place is held at a fixed height so the section below does not jump; on failure the hold is released.

Tokens: the scrim of the flight sheet is `color-mix(in srgb, var(--ink) 28%, transparent)`, the same expression the shell's scrims use, so no `rgba(` is left in the three surface stylesheets. The `6px` padding literals in `39-landing.css` are gone (one moved to `--space-1`, the cell's went with the restructure).

Six catalogues gained two keys each, written in de, es, fr, it and nl.

## Files touched

**Modified (app repo, `continent-app/`):**

- src/browse/LandingPage.jsx
- src/styles/38-first-run.css (the cell's box rules moved to the v6 file; the scrim token)
- src/styles/39-landing.css (the strip's rules moved to the v6 file; table padding token)
- src/styles/61-v6-landing.css
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (`landing.noDemo`, `landing.titleNoCount`)
- scripts/verify_landing.mjs

**Created (root repo):**

- docs/design-v6/plans/V5-landing.md (the audit and the plan, committed before the first app edit)
- Execution/P10/T402-v6-v5-landing.md (this report)

**Modified (root repo):** Execution/_OPEN.md

**Deleted:** none.

## Commands run

Planning, from the root worktree: `impeccable context --target ../T402-app/src/browse/LandingPage.jsx` (it reports no PRODUCT.md in the app repo and allows narrow refinement, as in V3 and V4), then the detector on the six surface files (0 findings). The audit and critique were done by this session from measurements, not by subagents: Playwright on an iPhone 13 (WebKit), a Pixel 5, 360 x 740 and 1280 x 800, then 360 x 740 in de, fr, nl, es and it.

The shared Playwright is 1.61.1 and its browser builds are not installed, so every browser run went through a scratch preload (`wt/_scratch/T402/patch.mjs`) that points the launcher at the installed chromium-1243 and webkit-2359. Nothing was installed.

In the app worktree:

    node node_modules/vite/bin/vite.js --port 5202 --strictPort --host 127.0.0.1
    node --import file:///.../_scratch/T402/patch.mjs scripts/verify_landing.mjs --port=5202   # 69 of 69
    node --test --test-concurrency=1 "tests/*.test.mjs"                                     # 368 of 368
    node node_modules/eslint/bin/eslint.js src                                              # 0 errors
    node scripts/ci/design-lint.mjs                                                         # 166 in the baseline, 0 new
    sh ".../impeccable" detect --json <changed src files and verify_landing.mjs>            # []
    for l in en de es fr it nl; do node --input-type=module -e "await import('./src/i18n/$l.js')"; done
    node scripts/verify_keyboard.mjs --port 5202                                            # 16 of 20, none on this surface
    node scripts/verify_quality_floor.mjs t402 --port=5202 --only=pages
    node node_modules/vite/bin/vite.js build                                                # built in 2 m 6 s
    rm -rf dist dist-data

`npm run build` was not used because its `prebuild` rewrites `public/` from root data the sparse worktree does not hold; `vite build` builds the same bundle. The Vite server and the preview that verify_receipt started were stopped.

## Config and secrets set

None.

## Before/after measurements

"Before" is the branch base (app master 592db0d) on the dev server, English unless stated.

| Metric | Before | After | Delta |
|---|---|---|---|
| Landing strip selects, height on every device | 32 px | 55 px (whole cell is the target) | +23 px |
| First-run strip selects and date inputs | 28 px | 55 to 56 px | +27 px |
| Controls under 44 x 44 on `.lp-page` (iPhone, Pixel 5, 360, desktop) | 3 per device | 0 | -3 |
| Quality floor, phone targets under 44 px | 11 (T392) | 7, none on landing or the first-run strip | -4 |
| Texts cut with an ellipsis at 360 in six languages | 2 to 3 per language (walk list) | 0 | -3 |
| Requests for `coverage.json` on a first visit that does not scroll | 1 | 0 | -1 |
| Horizontal scroll, 4 devices, 6 languages | 0 | 0 | 0 |
| `rgba(` in the three surface stylesheets | 1 | 0 | -1 |
| `verify_landing` checks | 45 (T392) | 69 | +24 |
| impeccable detect findings, changed files | 0 | 0 | 0 |
| Design lint new violations | 0 | 0 | 0 |
| Lint errors | 0 | 0 | 0 |
| Unit tests | 367 | 368 | other sessions' tests |
| i18n keys added per catalogue | | 2 | +2 |

The fold on a phone is unchanged in English: at 360 x 740 the primary's bottom is 721 against a nav top of 654 (before 721), iPhone 13 sum 619 and primary 707 against a nav top of 578 (before 621 and 709). The cell is 2 px shorter than before (min height `--tap` plus `--space-3`, 56 px).

In de, es, fr and nl the longer labels wrap onto more lines, so at 360 x 740 the primary ends at 816, 816, 847 and 866 (it: 733) against a nav top of 654. This is reported, not fixed: it needs the same direction call as T392-b.

Phone checks of the design wave rules (iPhone 13 on WebKit, Pixel 5 and 360 x 740 on Chromium):

| Check | Result |
|---|---|
| Landscape (iPhone 13, 844 x 390) | Title, towns and strip fit; the receipt starts under the nav as before (T382-c, the shell's bar). The shot is saved. |
| Tap only | Hover rules stay in `@media (hover: hover)`. The cell's tap opens the picker; nothing needs hover. |
| On-screen keyboard | The landing has no text field. On the destination page's first-run date inputs, with the viewport cut to 60 percent, the field is 380 to 436 and the nav top is 350: when the layout viewport itself shrinks, the nav sits over the field. Chrome and Safari by default keep the layout viewport (the keyboard overlays, `interactive-widget` is the default), so the nav stays under the keyboard. A `scroll-margin` fix was tried and removed, because the browser does not scroll a field that is technically visible. This needs a real phone (owner row). Hiding the nav while a field has focus is the shell's. |
| Safe areas | The wrap keeps `env(safe-area-inset-bottom)`; unchanged. |
| Height | The page is a scroller between the bars (`position: absolute` with `top` and `bottom` tokens), not a `100vh` layout. |
| Thumb reach | The primary sits at 665 to 709 on the tall phones; unchanged. |
| Tap targets | See the table. The cost bar's segments are 44 high; their width follows the data (shell). |
| Swipe | No swipe on the surface. |
| 360 to 1440, touch and mouse | 360, 380, 390, 393 and 1280 checked; no horizontal scroll. |
| Keyboard and screen reader | Each select is still inside its `label`, so its name is the label plus the value; the chevron is a pseudo-element and the cell's label has `pointer-events: none` only. The cell's focus ring is unchanged. |
| Layout shift from motion | No new motion. The coverage table's hold keeps its place. |
| LCP and INP | LCP is the title or the receipt, not touched; the only change on the first paint is one request fewer. `scripts/perf/baseline_vitals.mjs` does not cover the home page, so no number was taken. |

After screenshots (JPEG, quality 80, viewport only, ten) are in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\landing\`: `V5-home-iphone`, `V5-home-android`, `V5-home360-android`, `V5-home360de-android`, `V5-home-desktop`, `V5-landscape-iphone`, `V5-list-android`, `V5-firstresult-iphone`, `V5-firstresult-desktop` and `V5-proof-desktop`.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first-run strip's labels sat in the middle of their cells, over the values | `.frr-cell` centred its content, and with the select taken out of flow the label was the only child | `justify-content: flex-start` on the cell |
| WebKit drew a grey pill around each landing select | WebKit ignores `border: 0` and `background: transparent` on a select without `appearance: none` | `appearance: none` and a drawn chevron |
| The first `verify_landing` coverage check would fail | It waited 3 s and counted the table, which assumed the eager load | It scrolls to the section first and asserts both the empty request log before and the table after (comment in the file) |
| An SSR render of the page for the no-demo case timed out | Vite's module runner hung in this worktree | Not used; the case is covered by the pure-function checks, and the sentence was read in the source |
| verify_receipt stopped at a pass dialog | The same planner screens as T392 (T382-g) | Not rerun; the harness's preview was stopped |

## What is still open

The prerender of the home page (brief V5-6, T209-c) is not built. `scripts/prerender/pages.mjs` and `html.mjs` are not files OWNERSHIP.md gives to the landing surface and the session's scope did not name them, so the register row stays open with the exact hand-off (T402-a). `verify_prerender` was not run, because it needs a `build:pages` prerender build and nothing here touches the prerender.

Rule R3, the iPhone fold, and the Explore-bed comparison (T392-a, T392-b, T392-c) are unchanged. The long-language fold is new: de, es, fr and nl push the primary 100 to 200 px under the nav at 360 x 740 (T402-b), and belongs with T392-b.

The no-demo sentence has no UI check, because no catalogue forces it in a browser (the rank file always prices through the national fallback); the unit cases cover the function and the sentence is a single paragraph (T402-c).

On the keyboard and the nav: the nav can sit over a focused date field when the layout viewport shrinks, and hiding the nav on focus is the shell's (T402-d). The destination page's first-run strip is landing's, so its 28 px targets (T385-h, first half) are fixed here and the row stays open for its other half; the other half of that row (the cost fold's Change and the tips contrast) stays with its owners.

verify_keyboard is 16 of 20. The four failures are the journey's length control (T392-d, trips) and the trip planner's "Nothing yet" button, at both widths; none is on this surface, and the landing and destination pages pass. verify_trip_landing and verify_receipt stop at the planner's pass dialog (T382-g); they were not completed.

New strings need a native read (T402-e), and a real phone has to prove the cell tap, the keyboard and nav, VoiceOver on the strip, and iOS date inputs (T402-f).

**Impeccable's decisions** (it would have asked; each keeps the palette, type and identity): the touch fix makes the cell the control rather than enlarging the select's own box, because the label stays where the eye expects it; the chevron is drawn from two borders in `--ink-soft`, not an image, so there is no hex or gradient; the no-demo state is a sentence in the receipt's place, not a retry button, because nothing the visitor can do changes the catalogue.

**carta-design's seven questions, answered on the diff:**

1. Hex outside `:root`? No. Tokens and one `color-mix` of `--ink`.
2. Gradient, a colour outside DESIGN.md, a second saturated hue? No.
3. Ochre, teal or `--danger`? None.
4. Mono for figures only? Yes. The date inputs stay mono as before; the new sentence and the labels are `--ui`.
5. One primary per view? Yes; the harness counts one on both widths.
6. Headings carry a verb or a number, no em dash, middot or banned word? No heading was added; the two strings were grepped.
7. What was removed? The ellipsis on names, the select's 32 px and 28 px boxes, the literal scrim colour, the grey WebKit pill, the eager `coverage.json` request and the `6px` literals.

**Register rows raised:** T402-a to T402-f. **Closed by this task:** T382-d.

## Rollback procedure

Before the merge, deleting the branch `p10-v6-polish-landing` in both repos undoes everything.

After the merge: in the app repo revert the T402 commit (one commit; it touches only the files listed above). Reverting restores the 32 px and 28 px selects, the ellipsis, the eager coverage request and the literal scrim, and removes the two catalogue keys. In the root repo revert the plan commit and the report commit; reverting the register change reopens T382-d. No data, migration or deploy is involved.
