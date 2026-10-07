# T371: design brief, landing page and first run

## Task ID

T371 (design wave V1, session 2 of 10; set up by T369). Branch `p10-v6-brief-landing`, root repo only. No app code changed.

## Date

2026-10-07

## What changed

The landing surface now has its brief: `docs/design-v6/briefs/landing.md`. It is the document V3, V4 and V5 build the landing page and the first-run receipt from, and it holds the seven parts the wave prompt asks for: setup and mode, the walk with the before screenshots, an inventory of every view, state, control and visual setting, an impeccable critique and a technical audit, the traveller's job, a three-wave plan with a target-state table of every control, and eight proposals that need a rule before anything is built from them.

The mode is Persuade for the landing page (a tool's landing page, where the visitor decides whether to trust Carta and then acts) with Operate's discipline inside the live receipt, and Operate for the first-run receipt, which lives inside the destination and trip pages. Where impeccable would have asked the owner (its interview in shape, its closing questions in critique) the brief took the reading that keeps Carta's palette, type and identity, as the owner instructed for this run, and says so at each point.

The walk found the page in good order on its own terms: no horizontal scroll at 380 or 1280 px, one visible `h1`, the detector clean, the design lint with no entry in the surface's files, and the 25 unit tests that cover the surface passing. It also found what the build waves should fix. The landing page's three inputs are local state, so the visitor's choices are lost on the next tap and the destination page prices a different party from the one on the landing page (`src/browse/LandingPage.jsx` lines 70 to 74 against `src/components/FirstRunReceipt.jsx` 276 to 284). The first-run receipt says "at Edinburgh's own rates" over a national food basket and prints "€1,278.29 each" without the tilde under an estimated total. On a phone the receipt's footer line ends under the bottom nav and the one primary starts 973 px down. And the landing page and the first-run receipt draw two receipts that have drifted apart in five visible ways. The plan's V3 list takes each of these; its V4 list adds the motion, the cost bar, live specimens in the proof section and, subject to rules, photographs, a shared-element open and coverage bars.

The three harnesses the wave prompt names for this surface (`verify_receipt`, `verify_trip_landing`, `verify_prerender`) test the planner receipt, the trip planner's first step and the prerender build, not the landing page or the first-run receipt. The plan adds `scripts/verify_landing.mjs` in V3.

## Files touched

Created:
- docs/design-v6/briefs/landing.md
- Execution/P10/T371-v6-brief-landing.md

Modified:
- Execution/_OPEN.md (five rows appended, T371-a to T371-e)

Outside both repos (never committed): eight before screenshots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\landing\`: `V1-home-380.jpg`, `V1-home-1280.jpg`, `V1-proof-380.jpg`, `V1-proof-1280.jpg`, `V1-firstresult-380.jpg`, `V1-firstresult-1280.jpg`, `V1-return-380.jpg`, `V1-return-1280.jpg`.

## Commands run

From the root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T371`:

```
sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target <the app repo folder>/src/browse/LandingPage.jsx (relative to the root worktree)
sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" detect --json <main checkout app repo>/src/browse/LandingPage.jsx <main checkout app repo>/src/components/FirstRunReceipt.jsx
```

Read-only in the main checkout's app repo (nothing written there):

```
node --test --test-concurrency=1 tests/landing.test.mjs tests/firstRun.test.mjs tests/homeVisit.test.mjs
node scripts/ci/design-lint.mjs
```

Playwright walks from scratch scripts in the session scratchpad (`walk.cjs`, `walk2.cjs`, `walk3.cjs`) against the shared dev server at `http://localhost:5199`, one browser at a time. `verify_trip_landing.mjs` was run from a scratch copy (so its `shots/` went to the scratchpad, not the main checkout) against the same server.

## Config and secrets set

None.

## Before/after measurements

V1 measures the before state only; the after column belongs to V5, which saves its screenshots under the same eight view names.

| Metric | Before (this task) | Source |
|---|---|---|
| Views and states inventoried | 15 | brief, Part 3 |
| Controls inventoried (groups) | 23 | brief, Part 3 |
| Visual settings inventoried | 10 | brief, Part 3 |
| Primaries in the landing view | 1 | `LandingPage.jsx` 243 |
| Visible `h1` on the landing view | 1 at both widths | walk3 |
| Horizontal scroll | none at 380 and 1280 | walk |
| Top of the primary, 380x800 | 973 px (fold at 714 px, the bottom nav's top) | walk |
| Bottom of the receipt footer line, 380x800 | 726 px, under the bottom nav | walk3 |
| Strip select height | 32 px at both widths | walk |
| Impeccable detector findings | 0 (two JSX files) | detect --json |
| Design lint, new violations | 0 (213 of 213 in the baseline, none in the surface's files) | design-lint.mjs |
| Unit tests for the surface | 25 of 25 pass | node --test |
| Heuristic score | 25/40, Acceptable | brief, Part 4 |
| Audit score | 14/20, Good | brief, Part 4 |
| Proposals needing a rule | 8 (R1 to R8) | brief, Part 7 |

The time to the first receipt on the shared dev server (43.8 s at 380, 40.4 s at 1280) is a dev build on a machine short of RAM, so it is recorded only as the reason the harness must wait on a selector, not as a product figure.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first desktop "return" screenshot showed only the loading screen | The dev server took longer than the 6 s wait | Retook it with a wait on the Destinations content (`walk2.cjs`); the eight-shot limit held |
| `impeccable context` run on the main checkout path found no PRODUCT.md | the app repo is its own git tree, so the launcher took it as the project root | Ran it with a relative target from the root worktree, which loaded PRODUCT.md and DESIGN.md |
| `verify_trip_landing.mjs` timed out before its first check | It waits 3 s after load; the shared dev server needed about 40 s | Not fixed here (V1 changes no scripts); recorded in register row T371-d |

## What is still open

The eight proposals in Part 7 of the brief (R1 to R8) need T380 to accept or reject them before V3 and V4 build anything from them: a short priced list on the landing page, a photograph on a toggle, a shared-element open for a receipt, bars in the coverage table, a sticky phone primary as a fallback, motion tokens for a reprice, a toggle with a metadata line, and a receipt line used to illustrate a claim (T371-a).

Two honesty slips in the first-run receipt belong to the V3 landing build: the orientation line claims the town's own rates when a line is the national figure, and the per-person line drops the tilde under an estimated total (T371-b).

The landing page's inputs do not reach the rest of the app, so the next screen prices a different party and stay from the one the visitor set (T371-c).

No harness tests this surface, and the one the prompt names for a "trip landing" times out on the shared dev server; V3 adds `scripts/verify_landing.mjs` (T371-d).

The phone's "Get a pass" chip in the top bar is accent-washed and 38 px high, against the secondary chrome rule and the `--tap` floor; it is the shell surface's file, `src/styles/10-shell.css`, so it is raised for that surface rather than planned here (T371-e).

Rows that this brief plans against but does not close: T209-a (one receipt card, V3 item 2), T209-c (prerendered home, V5 item 6), T194-d (the onboarding document, V3 item 13), T099-e (glossary entries for the InfoDot). Rows that stay with the owner and that the plan deliberately does not build around: T194-a (which visits open on the home page, the brand mark, a nav entry) and T209-e (the demo towns).

No new strings were written, so no native-review row is raised; the V3 session that adds the strings raises it.

## Carta-design's seven questions

This task changed no shipped file, so the answers describe the brief's plan. 1: the plan adds no hex; it names one literal colour to remove (the scrim). 2: no gradient, no new colour, no second saturated hue; the cost bar and the proposed coverage bars use the ink ramp. 3: no ochre, teal or `--danger` is proposed. 4: the plan moves the strip labels out of mono, because a label is not a measured fact. 5: one primary per view is kept, and "Open {city}" stays a secondary. 6: the brief's headings are not shipped copy; the brief is free of em dashes and banned words (grep). 7: removed in the plan: the separate orientation paragraph on the landing page, folded into the receipt's sub line.

## Rollback procedure

The work is two commits on `p10-v6-brief-landing` in the root repo and touches no app file. Before the merge, delete the branch. After the merge, `git revert` the two T371 commits on `main`; that removes the brief and the report and takes the five T371 rows back out of `Execution/_OPEN.md`. The screenshots sit outside both repos and can be deleted with the folder `design-v6-shots\landing`.
