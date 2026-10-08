# T380: design direction v6, the new rules, motion tokens and file ownership

## Task ID

T380 (design wave V2, the one session of the wave).

## Date

2026-10-08

## What changed

The ten V1 briefs are now one direction the build waves can follow without asking anyone. `docs/design-v6/DIRECTION.md` says what "more modern, more visual, more professional, more dynamic" means for Carta inside the locked palette and type, and gives one section each to motion, imagery, data visualisation, layout rhythm and type scale, density per mode, the phone, and the planning journey across surfaces. Its part 9 decides all 96 "Needs a rule" proposals from the briefs: 94 accepted (6 of them as amended, where two briefs proposed the same thing differently) and 2 rejected (landing R2, a photograph on each town toggle, and landing R5, a sticky phone primary), each with its reason. The accepted rules are written into the carta-design skill under Components and Interaction and into DESIGN.md, so the build waves build from written rules rather than from the briefs' proposals.

Six motion tokens exist in `src/styles/01-tokens.css` and DESIGN.md: `--dur-1` 120 ms, `--dur-2` 200 ms, `--dur-3` 320 ms, `--dur-4` 480 ms, `--ease-out` and `--ease-in-out`. The carta-design motion rule, which read "under 300 ms, transform and opacity only", is relaxed by DIRECTION.md part 2.2 and the skill's Interaction section: routine motion stays on transform and opacity at `--dur-1` and `--dur-2`, colour may move at `--dur-1` for a press or a selection, a surface arriving may take `--dur-3`, a map camera or one leg of the route reveal `--dur-4`, a reveal may animate `clip-path`, `mask-position` or `stroke-dashoffset`, and every branch keeps its reduced-motion rule. One shared primitive was added because seven briefs asked for the same in-place figure: `settleFigure()` and `useSettledFigure()` in `src/lib/figureChange.js` (an opacity dip through the Web Animations API, no count-up, no keyframe in any stylesheet), with `durationMs()` in `src/lib/motion.js` to read a token from script.

The ten v6 stylesheets `60-v6-shell.css` to `69-v6-account.css` exist with a header comment and nothing else, imported at the end of `src/styles.css` after `46-owner-calls.css`, so a build session overrides an older rule from its own file. `docs/design-v6/OWNERSHIP.md` assigns every file under `src/` (461 on disk) to exactly one of the ten surfaces, lists the i18n prefixes each surface may write under, records the hand-offs the briefs asked for, and settles the files briefs named that live elsewhere (the register rows T373-j, T374-b, T375-f, T377-h, T377-i, T378-b and T379-b). `scripts/check_ownership.mjs` in the app repo proves the assignment: 461 on disk, 461 assigned, 0 missing, 0 doubled. Each brief gained a short "Direction check" section saying what the direction changes in its plan.

Nothing a traveller sees changed. The ten stylesheets are empty and the tokens are unused until V3, so no "after" screenshot set was saved for V2; V3 saves its set against V1's "before". A phone smoke check on the dev server confirmed the app boots with the ten imports and the tokens resolve on iPhone 13 (WebKit), Pixel 5 (Chromium), the 360x740 Android floor, iPhone landscape and desktop; the figures are in the measurements table.

Design calls made without asking, as the owner delegated on 2026-10-07, so the owner can overrule them: the two rejections above; the count chip is mono (shell R3's form wins over account 5's sans outline chip); selection is ink everywhere and `--accent-bg` is never a selection colour (tripplanner N6 wins over destination 6's accent-bg row); undo covers every destructive action on the traveller's own data the app can hold for six seconds, including a day plan and a saved trip, and the inline confirm stays only for the account, publishing and a public link (dayplanner N6 wins over account 1's narrower scope); the Lifestyle door loses its accent tint (shell R11 over explore N1); the map's one accent is the committed item and the list side is ink; the responsive floor in the carta-design skill reads 360 px, as PRODUCT.md has it, where the skill said 380; Fraunces is capped to five display sizes (28/40, 22/26, 19, 16, 15 px) where the stylesheet uses fifteen today; and the sticky section rail and refine row carry a `--rule` border, never a shadow. Impeccable's interview and decision page were not opened (the owner's "proceed" instruction is its AUTONOMY_DIRECTIVE_CHECK's proceed case); "Refinement preserves" applied throughout, and no direction roll was run because this is refinement inside an established world (new-work.md section 1, "Established world: inherit it").

## Files touched

**Created (root repo, branch `p11-v6-direction`):**
- docs/design-v6/DIRECTION.md
- docs/design-v6/OWNERSHIP.md
- Execution/P11/T380-v6-direction.md

**Modified (root repo):**
- .claude/skills/carta-design/SKILL.md (Components: the v6 rules; Interaction: the motion rule and phone-first; Layout and spacing: the 360 px floor, breakpoints, the display scale, elevation and icons; Quality floor: the tokens-only motion line)
- DESIGN.md (Layout: breakpoints; a new Motion heading with the six tokens; Interaction: the motion line; Components: the T380 rule set by name; the sync date)
- docs/design-v6/briefs/shell.md, landing.md, explore.md, destinations.md, destination.md, outdoor.md, trips.md, tripplanner.md, dayplanner.md, account.md (a "Direction check (T380, V2)" section appended to each; nothing above it rewritten)
- Execution/_OPEN.md (rows T380-a to T380-g appended; rows T370-b, T373-b, T373-j, T374-b, T375-f, T377-b, T377-h, T377-i, T378-b, T379-a and T379-b marked closed by T380)

**Created (app repo, branch `p11-v6-direction`):**
- src/lib/figureChange.js
- src/styles/60-v6-shell.css, 61-v6-landing.css, 62-v6-explore.css, 63-v6-destinations.css, 64-v6-destination.css, 65-v6-outdoor.css, 66-v6-trips.css, 67-v6-tripplanner.css, 68-v6-dayplanner.css, 69-v6-account.css
- scripts/check_ownership.mjs

**Modified (app repo):**
- src/styles/01-tokens.css (six motion tokens)
- src/styles.css (ten `@import` lines appended after 46-owner-calls.css)
- src/lib/motion.js (`durationMs()`)

Outside both repos, never committed: the scratch scripts `gen_ownership.mjs` (generated the OWNERSHIP.md tables from the file list) and `smoke_v6.mjs` (the phone smoke check) in the session's scratchpad.

## Commands run

From the root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T380` (sparse; `.claude/` added first):

    git sparse-checkout add .claude
    sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target continent-app/src/styles/01-tokens.css
    git add docs/design-v6/DIRECTION.md; git commit   (the plan, committed before any other edit)
    git add DESIGN.md .claude/skills/carta-design/SKILL.md; git commit
    git add docs/design-v6/OWNERSHIP.md docs/design-v6/briefs/*.md; git commit
    git add Execution/P11/T380-v6-direction.md Execution/_OPEN.md; git commit

From the app worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T380-app`:

    node scripts/check_ownership.mjs "C:/Users/Gebruiker/Documents/Portfolio/wt/T380/docs/design-v6/OWNERSHIP.md"
    npm run lint
    node scripts/ci/design-lint.mjs
    npm test
    npm run build; rm -rf dist dist-data
    sh ".../impeccable/scripts/impeccable" detect --json src/styles/01-tokens.css src/styles.css src/lib/motion.js src/lib/figureChange.js src/styles/6?-v6-*.css
    npx vite --port 5201 --strictPort   (read-only dev server for the smoke check; never npm run dev)
    git add -A src/styles src/styles.css src/lib/motion.js src/lib/figureChange.js scripts/check_ownership.mjs; git commit

From the scratchpad: `node smoke_v6.mjs` (Playwright from the app's node_modules; WebKit iPhone 13 and iPhone 13 landscape, Chromium Pixel 5, Chromium 360x740 with isMobile and hasTouch, Chromium 1280x800; reads `--dur-2`, `--ease-out` and `--bottom-nav-h` from `:root`, `scrollWidth` against `innerWidth`, and the bottom nav's box).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Source |
|---|---|---|---|
| "Needs a rule" proposals decided | 0 of 96 | 96 of 96 (94 accepted, 6 as amended, 2 rejected) | DIRECTION.md part 9 |
| Motion tokens in `01-tokens.css` | 0 | 6 | `grep -c "^  --dur-\|^  --ease-" src/styles/01-tokens.css` |
| Literal easings in `src/styles` (distinct `cubic-bezier` values) | 10, 3 of them overshooting | 10 (unchanged; retired by their owners in V4 and V5) | `grep -rhoE "cubic-bezier\([^)]*\)" src/styles \| sort -u` |
| `transition: all` in `src/styles` | 7 | 7 (unchanged; the shell's four and the map overlays' three go in V5) | `grep -rn "transition: *all" src/styles` |
| `100vh` against `100dvh` in `src/styles` | 12 against 3 | 12 against 3 (each owner replaces its own in V5) | grep |
| Fraunces display sizes in use | 15 distinct `font-size` values next to `var(--display)` | 15 (the scale of five is now the rule; V4 sessions move to it) | grep |
| v6 stylesheets imported | 0 | 10, after `46-owner-calls.css` | `grep -c "^@import" src/styles.css`: 40 to 50 |
| Files under `src/` owned by one surface | 0 of 450 | 461 of 461 (shell 112, landing 8, explore 18, destinations 21, destination 24, outdoor 43, trips 37, tripplanner 55, dayplanner 40, account 103) | `node scripts/check_ownership.mjs` |
| Shared motion primitives | 3 files (motion.js, sharedElement.js, touchFeedback.js) | 4 (figureChange.js added; motion.js gained `durationMs`) | `ls src/lib` |
| Design lint | 213 found, 213 baselined, 0 new | 213 found, 213 baselined, 0 new | `node scripts/ci/design-lint.mjs` |
| `npm run lint` | 0 errors, 70 warnings | 0 errors, 70 warnings | eslint |
| `npm test` | 341 pass | 341 pass, 0 fail | node --test |
| `npm run build` | passes | passes (exit 0); dist and dist-data deleted after | build log |
| Impeccable detector on the 14 changed app files | not run | 0 findings (`[]`) | `impeccable detect --json` |
| Phone smoke (see below) | not run | app boots on all five contexts; tokens resolve | smoke_v6.mjs |

Phone smoke results (dev server, first load, so slow): on all five contexts `--dur-2` read `200ms` and `--ease-out` read `cubic-bezier(0.16, 1, 0.3, 1)` from `:root`, so the tokens ship; `--bottom-nav-h` read `86px` on the four phone contexts and `0px` on desktop; `scrollWidth` equalled `innerWidth` on every context (390, 750 in landscape, 393, 360 and 1280), so no horizontal scroll; no page error on any context. Two things the smoke read that are not this task's to fix: the script's bottom-nav selector matched the header's `nav[aria-label]` instead of the bottom bar, so the bar's box was not measured (the `--bottom-nav-h` readout stands in), and `?tab=places` carries two `h1` elements at every width (row T380-g). Landscape at 844x390 (WebKit reports 750x342 inside the descriptor's chrome) loaded with the same tokens and no overflow; the on-screen keyboard, safe areas and `dvh` were not exercised because no screen changed in this task, and they are V3's checks.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Two Edit calls on `01-tokens.css` and `motion.js` were refused | The files had been read through Bash `cat`, not the Read tool | Read them with the tool and re-applied the edits |
| Appending the ten "Direction check" sections with ten heredocs in one Bash call failed with "unexpected EOF" before anything was written | The shell rejected the compound command (a quoting edge in one of the ten bodies) | Wrote the ten bodies to a JSON file and appended them with a 6-line Node script, which also kept each brief's own line endings |
| The Playwright smoke script failed on import | A Windows absolute path in an ESM `import` is not a URL | `createRequire(import.meta.url)` against the app's `node_modules/playwright` |
| The smoke check ran past the 7-minute foreground limit | First loads on the Vite dev server take minutes per context (the V1 shell brief measured the same) | Left it in the background and read its output when it finished |

## What is still open

The owner may want to overrule the design calls recorded in "What changed" and in DIRECTION.md part 9, in particular the two rejections (landing R2 and R5) and the three "as amended" conflicts; nothing waits on that answer (row T380-a, owner). `MovingEur` in `src/browse/LifestyleSlider.jsx` counts a figure up over 240 ms and rounds it to whole euros, which the direction and PRODUCT.md rule out; T397 (trips V4) replaces it with `settleFigure()` and the two-decimal figure (row T380-b). The design lint has no rule for a literal duration or easing in a v6 stylesheet, although the direction forbids one; a `motion-literal` rule scoped to `src/styles/6?-v6-*.css` belongs to the next lint task or T401 (row T380-c). `scripts/check_ownership.mjs` is not run by any gate; the orchestrator's wave gate or `npm run ci` should run it so a V3 session that adds a file without an OWNERSHIP.md row is held (row T380-d). Three V3 items depend on the shell's settings line (T381) landing in the same wave: Explore's input row (N1), the destinations month fact (N2) and the destination page's month input; if T381 is held, those sessions build against the planned props and keep their own month select, and the orchestrator should merge T381 first (row T380-e). What only a real phone can prove was not exercised this session because no screen changed; the first build wave (V3) raises the per-session owner row for haptics, the install prompt, the real keyboard and scroll momentum (row T380-f, owner, carried as a reminder). The smoke read found two `h1` elements on the Destinations tab at every width; verify_quality_floor should confirm it and the owning surface (destinations, or shell if the second is the chrome's) fixes it in V3 (row T380-g).

## Rollback procedure

Root repo: `git revert` the four T380 commits on `p11-v6-direction` in reverse order (the report and register, OWNERSHIP.md and the briefs, DESIGN.md and the skill, DIRECTION.md), or do not merge the branch. Reverting the skill and DESIGN.md commit without reverting the app's token commit leaves DESIGN.md disagreeing with `01-tokens.css`, so revert both or neither.

App repo: `git revert` the one T380 commit on `p11-v6-direction` (it removes the six tokens, `durationMs`, `figureChange.js`, the ten stylesheets, the ten imports and `check_ownership.mjs`); nothing else imports any of them yet, so the revert is clean. `npm run build` and `node scripts/ci/design-lint.mjs` pass before and after.
