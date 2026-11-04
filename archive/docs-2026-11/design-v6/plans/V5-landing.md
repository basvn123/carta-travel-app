# V5 plan: the landing page and the first run (surface key `landing`, T402)

Written 2026-10-08 by T402, design wave V5, in planning mode before any app edit. It carries out the V5 list of `docs/design-v6/briefs/landing.md` (part 6) as amended by its Direction check, on the surface as merged after V4 (root `main` c82229448, app `master` 592db0d). Where this plan and the brief disagree, this plan says why.

## Audit and critique of the V4 result

Method: impeccable's audit, harden, adapt and optimize references read; the detector run on the six surface files (0 findings); the page measured with Playwright on an iPhone 13 (WebKit), a Pixel 5, 360 x 740 and 1280 x 800, in English and then in de, fr, nl, es and it at 360 x 740. The owner told every session to proceed without asking (2026-10-07), so impeccable's interview and decision steps were skipped; each call it would have asked about takes the option that keeps Carta's palette, type and identity.

Verdict: the page is specific to Carta (a receipt where a hero would be) and V4 made it answer its inputs. What is left is hardening, not design. Findings, measured before any edit:

| Finding | Measured | Severity |
|---|---|---|
| The three strip selects are 32 px high inside 44 px (58 px) cells; the hit area is the select, not the cell | 32 px on every device | P1, a touch target under `--tap` |
| The first-run strip's selects and date inputs are 28 px inside the cell | 28 px (quality floor counts 8) | P1, same cause |
| A long town name in the priced list is cut with an ellipsis | "Apuseni (Scarisoara ...)" on iPhone and 360, "Pelister National Pa..." in de, fr, nl and es | P2, the name is the link |
| `coverage.json` is requested on first paint although the table is below the fold | 1 request before any scroll | P2, optimize |
| In de, fr, nl and es at 360 x 740 the total and the primary sit under the bottom nav (sum 730 to 760, nav 654) | wrapping of longer labels, not an overflow | P3, noted, no lever with a written rule |
| No demo town priceable: the page shows the loading block for ever (aria-busy, "Loading") | by reading the code | P1, a hole, never a sentence |
| A catalogue count of 0 reads "in 0 places" | by reading the code | P3 |
| A literal `rgba(15, 23, 42, 0.28)` scrim in `38-first-run.css`; `6px` literals in `39-landing.css` | grep | P3, tokens |
| Horizontal scroll | 0 on every device and language | pass |

Heuristics unchanged from V4 except error prevention, which this wave lifts (the empty-catalogue case) and consistency (one hit-area rule on both strips).

## The changes, in order

1. Touch targets (brief V5-1, `adapt`). Each strip cell becomes one control: the select (or date input) fills the whole cell, positioned over it, and the label sits above it with `pointer-events: none`, so a tap anywhere in the 58 px cell opens the picker and no hit area is under `--tap`. Both strips: the landing's `.lp-field` and the first-run's `.frr-cell`. The 32 px compact size is not used. Files: `61-v6-landing.css`; the old cell rules in `38-first-run.css` and `39-landing.css` are edited in place where a rule is replaced (this surface owns both). Check: on a coarse pointer every control in `.lp-page` and `.frr` measures at least 44 by 44 (harness, three devices).

2. Long words and narrow screens (brief V5-2, `harden`). The priced list's name wraps (`overflow-wrap: anywhere`) instead of ending in an ellipsis; the town toggle's name wraps; the metadata line already wraps. Check: Playwright at 360 x 740 in six languages finds no horizontal overflow and no ellipsis-clipped text on the surface (harness).

3. Edge cases (brief V5-3, `harden`). No demo town priceable gives one sentence under the strip, not the loading block (new `landing.noDemo`); a catalogue count of 0 gives a title without a number (new `landing.titleNoCount`); coverage that fails leaves the table out and the sentences stand (forced in the harness by aborting `coverage.json`); one person, 14 nights, a tier fallback and a partial catalogue are checked on the pure functions and on a server render of the page. The brief names `tests/landing.test.mjs`; this session's scope is the surface's files and its harnesses, so the checks go into `scripts/verify_landing.mjs` as logic checks, as T392 did. Files: `LandingPage.jsx`, six catalogues (two keys), `scripts/verify_landing.mjs`.

4. Load what is seen (brief V5-4, `optimize`). `coverage.json` loads when the coverage section is within 400 px of the viewport (IntersectionObserver; loaded at once where it does not exist), with a reserved block height so the table does not shift the page when it arrives. Check: a first visit that does not scroll makes no request for `coverage.json`; scrolling to the section renders the table (harness, network log).

5. Tokens only (brief V5-5, `polish`). The scrim becomes `color-mix(in srgb, var(--ink) 28%, transparent)` as the shell's scrims draw it (DESIGN.md, T362); the `6px` padding literals in `39-landing.css` move to `--space-*` or leave with the restructured cell. Check: `node scripts/ci/design-lint.mjs` 0 new, no `rgba(` in the surface's three stylesheets.

6. Prerendered home (brief V5-6, register row T209-c). Not built: `scripts/prerender/pages.mjs` and `html.mjs` are not files OWNERSHIP.md or this session's scope gives to the landing surface, and a prerender touches the shell's prerender shell. Written up as a register row with the exact hand-off. `verify_prerender.mjs` is run as the harness list says, and its result is reported.

7. The finish (brief V5-7, `polish`). Phone checks of the design wave rules on iPhone 13 and Pixel 5 (landscape, tap only, the keyboard on the first-run date inputs at 60 percent height, safe areas, dvh, thumb reach, tap targets, no swipe), 360 to 1440 px, keyboard and screen reader names, no layout shift from motion, LCP and INP not worse (baseline_vitals where it covers the home page). Detector on every changed file, design lint, lint, `npm test`, build then delete `dist/` and `dist-data/`, `verify_landing`, `verify_receipt`, `verify_trip_landing`, `verify_prerender`, `verify_keyboard` (20 of 20) and `verify_quality_floor` where they can run. Carta-design's seven questions in the report. After screenshots under the V3 view names with the V5 prefix, at most ten.

## What this plan does not do

Rule R3 (the receipt carrying into the destination page) waits on the shell's `sharedElement.js` (T392-a). The iPhone fold (T392-b, T382-b) needs a direction call or the shell's nav height. The Explore-bed comparison (T392-c) needs a data decision. Each stays open and is carried forward in the register, not worked around.
