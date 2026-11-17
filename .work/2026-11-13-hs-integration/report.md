# Integration lane: report (house style run, 2026-11-17)

**Run:** integration lane of the house style run (L2, crew:design run as an integration). **Branch:** `p15-housestyle` (worktree `wt/housestyle`), base `039ba738cc` (the merge of the last page lane). **ROADMAP:** G1, G3, G5, G10 (also touches G8, G9, G14). **Status:** done. One fresh judge (`judgement-1.md`): 100 of 135, FAIL because the sweep and the post-fix axe had not run yet and three defects (journey Best months twice, plan home head floating, plan.md unticked); function intact at 5. Every required fix was then applied and checked: sweep clean, axe 0 serious, journey and plan home fixed and re-shot (`shots/fix/`), plan.md ticked, full `npm test` no new failures, CI green. Not re-judged (turn budget): the orchestrator's own judges re-check before the merge to main.

## What the owner asked, and what this lane did with it
All eight page lanes were merged. This lane took every lane's foundation requests, every orchestrator judge's "Fix at integration" list and the lanes' handbook notes, put them in one list (`plan.md`, each item ticked with evidence or marked open with a reason), and built them with four parallel builders on disjoint files (K kit, T trip, P plan and i18n, B brand, outdoors and leftovers; K2 finished K's list), then fixed what verification and the judge found. Owner rules held: nothing removed or changed in behaviour (the judge read the 1963-line JS/JSX diff: criterion 11 at 5), umber kept, minimal text, motion from the kit.

## Commits (`git log --oneline 039ba738cc..HEAD`)
| Commit | What |
|---|---|
| fd65d50a25 | Trip: head gap 820 to 1440, Still to book cards whole, journey line names read by screen readers, phone head spacing, day map stay pin and boat leg, crew and flight sheet lists on paper panels, credit chip off amber, old auth colours re-pointed |
| 1705ec635a | Brand and leftovers: PDF ellipsis and page labels, Best months once on the trip PDF, blog euros through formatMoney with a scrollable named table and font licences, trail km and climb locale-formatted, AI tag for Ask, blaze wordmark on maintenance and footer, `BordersIcon`, settings switch aligned |
| ac8937c3c2 | Plan: plan home house head, Ready-made unit once and rail-card grammar, wizard step settle, More glide, pick tick only after a pick; `ox.seasonEst` keeps its basis |
| 4ef8b93da0 | `SparkIcon` (the boxed AI mark) only where the thing is AI (13 files took a fitting glyph); the trip cost post's Flights row says the same "Not yet" as its wagon; wizard step bar in the paint |
| 9fc16116c9 | Docs pass 1: references, PRODUCT.md, SKILL.md agree with what shipped |
| 7dffe85366 | Handbook: Vibrate on tap, the 404 view |
| 052773538c | The kit absorbs the lanes' requests (ScorePlate rating, Formation est/dayWrap/around/extras/figure, RailCard slots and price row outside the link, PlateGroup and ChipGroup on one roving radio group, DialogSheet motion and exit, IconButton haptic, AiTag in the kit, HeroImage WorldTile, NotYet one look, StepMini paint, CostRow leaders and spaces); one facts board for place, journey and outdoor pages; disabled primary legible; relief cut blaze unclipped and cut line on umber; eight unread home tokens retired; css-routes `--hold` (32 selectors) |
| d6d95a23ac | Docs pass 2: DESIGN.md (print faces, sun/cost/violet readers, rail widths, list row, AI mark rule, relief places, Home page section, one-second mine window); place card mine window 1000 ms |
| 7664ba1f80 | design-lint baseline regenerated once (3940 to 3920) |
| 4766cb7649 | Verify fixes: Ask buttons keep the AI glyph so their names match (WCAG 2.5.3), cost row label and sub spaced, plan home head at the top below 1024 |
| 6187f30736 | Judge fixes: journey Best months once (on the board), plan home head at the top at every width, cost arc duration token (CI's Linux motion-literal), unused `.pf-open-accent` gone |
| d8dfc49fa8 | `.pt-title` breaks a very long word inside the column (T1089; verify_lakes' long-name check passes) |

102 files, +1171 / -894, in 12 commits.

## Per screen, before and after
- **Trip page:** before, a 70 px empty band beside the photo at 820 to 1440, a third Still to book card cut mid-button, the phone journey line mute for screen readers, "Not available yet" beside a "Not yet" wagon. After: photo as tall as the name block, two whole cards from 600, names visually hidden but read, one "Not yet" (`shots/fix/trip-1440.png`, `shots/trip-390.png`).
- **Day planner:** the stay is the house pin with its label clear; a boat leg is umber dashed (`T/after/day-390.png`).
- **Place page:** facts on the outdoor board (one paper panel, hairline cells); the leg plates are a real radio group (`PlateGroup`), the post's day slot omitted by the kit (`figure={false}`), leaders in the kit; the place card's figure rolls within 1 s of the traveller's change as DESIGN.md says.
- **Journey page:** the same facts board; Best months once.
- **Outdoor pages:** board in the shared sheet; trail km "102,2 km" in German, climbs "4,409 m" on every page (`shots/trail-390.png`).
- **Plan home:** before, a centred hero with about 180 px of bare ground above it on a phone; after, the house head "Plan a trip" leads at the top at every width with the collection under it (`shots/fix/plan-home-390.png`, `-1180`, `-1440`).
- **Ready-made, wizard, flow:** the unit said once beside the first section title; cards on the rail-card grammar; the step body settles in on a step change; a pick ticks only after the traveller's own pick; the disabled Continue reads as disabled (band fill, `--text-3`).
- **Explore, Ask, home hero, start dialog, search dock:** the boxed AI mark; Explore rails keep their price row outside the card link.
- **Everywhere:** non-AI things no longer wear the "AI" box (a festival, a recommended train, a vibe, a tip, a must-see suggestion).
- **Account and Together:** settings switch on the value column; reset password, shared trip view, maintenance card and footer carry the blaze wordmark; Together's vote tint confirmed as the vote share.
- **Brand surfaces:** PDF captions and plate names end in an ellipsis when cut, page labels measured for the real total; blog money in euros with the symbol, the table a named scroll region with a sticky first column and a fade.

Screenshots: `shots/<screen>-<width>.png` for every main screen at 390, 820 and 1440, and the main screens at 1180 (home, explore, place, trip, day planner per the shot script); re-shots after fixes in `shots/fix/`. Builders' own before/after: `T/before`, `T/after`, `K/`, `P/shots/`, `B/`.

## Checks
- `npm test` on 6187f30736: 2141 tests, 23 fail, every one already failing at the run's start (`baseline-fails.txt`: Windows short paths, the sparse checkout without `public/`, two design-lint Windows path bugs). No new failures (`test-run2.txt`).
- CI on GitHub (Linux, full checkout): **ci green on 6187f30736 and on the final d8dfc49fa8** (run on the previous push 4766cb7649 failed on one motion-literal the Windows lint cannot see; fixed). ai-guard and ask-eval green.
- `npm run lint` 0 errors (13 old warnings). design-lint 0 new (baseline regenerated once, 3920). token-contrast 0 under. css-routes `--check` clean (920) after `--hold`; css-breakpoints off-scale 560 and 900 (both from before). Docs: `check_entry_points` OK; `drift.py` 1 drift, the SCHEMA wire table (also in the start baseline; a sparse-checkout artefact, green in CI).
- `verify_axe` on the final build: **all screens pass the serious gate** (28 runs, 390 and 1280; `axe-fix.txt`). The first run found 7 serious `label-content-name-mismatch` (the AI tag's letters inside two aria-labelled Ask buttons, a cost row's label and sub run together): fixed in 4766cb7649.
- Width sweep 360 to 1920 over 21 screens (210 runs, `sweep.txt`, `shots/sweep.json`): no horizontal scroll anywhere; 5 flags, all chips scrolled out of view inside the trail list's one-swipe quick row (`.qfbar-row`, `overflow-x: auto`, owner T1038): by design.
- Verify scripts against the integration build: see "Verify scripts" below.
- impeccable detector on every changed JSX and CSS file: 2 warnings, both lines from before this lane (`TripSummary.css:1406` a bar width transition from 2026-11-02; `:1811` the route's 2 px footpath line, not a card tab).

## Verify scripts
Against the integration build (dev mode with the E2E seams, `serve_lane.mjs` on 5319, main checkout's data). Outputs in `verify/`.

| Script | Result | Note |
|---|---|---|
| verify_explore | 104 / 104 pass | |
| verify_rating_words | pass | |
| verify_relief | pass | |
| verify_trip_page | 60 / 60 checks pass | exits 1 on the blocked data-host request in the console (same as the trip lane) |
| verify_when_step | 13 / 13 pass | exits 1 on the same console noise |
| verify_plan_short | pass (a priced trip in 5 screens) | |
| verify_core_flow | pass | |
| verify_home | 64 / 65 | the desktop header check reads the header's background mid-fade (alpha 0.78, then 0.996 on a rerun; it wants exactly 1): a timing check; this lane did not touch the header |
| verify_destination_page | stale | waits for Explore's old `a.card-open[href^="#dest="]` cards; Explore rows are `.xrow-hit` since the explore lane (builder K2 saw the same) |
| verify_beaches | stale | waits for a `.bpage` root that `origin/main` no longer renders either |
| verify_lakes | long-name check passes after d8dfc49fa8 (T1089 fixed) | the wire check needs `public/` (sparse worktree) |
| verify_trail_page, verify_mountains, verify_journeys, verify_regions | environment | read `public/trails`, `public/mountains`, the journey wire or Commons photos the sparse worktree lacks (regions: 27 of 29 photos, the same on the lanes' base builds) |
| verify_day_workspace | not run here | it starts its own `vite preview` |
CI on Linux with the full `public/` is green on d8dfc49fa8.

## Departures from the house style, and why
- The two aria-labelled Ask buttons draw `SparkIcon` (the boxed AI mark as an SVG) instead of the `AiTag` letters: the letters as text break WCAG 2.5.3 there. Same look.
- The kit `DialogSheet` scales in from 700 px (where `38-first-run.css` already centres a dialog), not 769: changing both together is a later kit item.
- `RowFormation` stays Explore's own (its `pparts-*` markup and `data-part` hooks are read by harnesses).

## Open items (not done, with the reason)
Engineering follow-ups for ROADMAP G1 (the orchestrator writes them):
- Explore list rows still nest the `PriceItems` button in the row link (pre-existing since before the run): split the row grid at four container widths, then axe the list, map column and drawer.
- Trip `CostTrain` and the found trip's cost bar onto the kit `Formation` (`extras`, `around`, `figure={false}`); found trip facts onto the shared board.
- Trip sheets (`SheetShell`) already animate with the sheet tokens; moving them onto `DialogSheet` is optional.
- `verify_plan_mocks` U and N: the walk's tail still expects the old "Create trip" path; `verify_journeys` needs selector waits; `verify_bottom_nav` and `verify_desktop_shell` are stale (foundation notes).
- `69-v6-account.css` 505 to 659 (old reading-page rules overridden by `brand-pages.css`): delete with before/after shots of the legal pages.
- `.hs-ruled` kit utility, Tabs with a count, StepRail answers (optional kit items).
- Unused i18n key `jx.bestIn` (no reader after the journey fix): retire in six catalogues.
- Trip page counts: the head says "0 of 5 booked" while Still to book says "0 of 7" (`TripSummary.jsx:429` vs `BookPasses.jsx:82`): pre-existing, a logic decision.
- The trip total prints cents (€2,293.39) while other figures are whole euros: a decision for the owner (the engine's own total).
- The two Windows-only test failures in design-lint (`motion-literal` self-test, the smooth-scroll check) come from backslash paths; they pass on Linux.

Owner steps (not this lane's, per the brief; `docs/owner/`):
- Copy the brand lane's staged icons and manifest (`wt/hs-brand/.work/2026-11-13-hs-brand/public-staging/`) into `continent-app/public/` (owner said "public ok"; orchestrator step), regenerate `public/og/site.png`, re-record the home clips.
- Apply the brand lane's two CSP-hashed style patches with `node scripts/csp-hashes.mjs --write`, keeping the old prerender hash until R2 is re-uploaded.
- Owner calls carried from the lanes: phone rail card width (T968 two across vs DESIGN.md 76 %), a relief on mountain pages, the footer tagline (T596), the compass icon decision of 2026-10-21, Score plates on share cards without "of 10".
- `@phosphor-icons/react` has no reader left: remove it from `package.json` with a lock-file update (orchestrator, needs `npm install`).
- `index.html` `<title>Carta</title>` vs `scripts/og/check.mjs` expecting "{title} | Carta": change one of them.

## For the orchestrator: ROADMAP status lines
- **G1** (house style): all eight lanes merged and integrated on `p15-housestyle` (the kit absorbs the lanes' requests; one facts board; the AI mark only for AI; docs agree). Status: done, ready to merge into main. Follow-ups: the open items above.
- **G2**: no change in this lane (T1039-a one shared OutdoorWhen still open).
- **G3** (one cost card look): the place post and the trip cost post share the kit's leaders, CostRow and "Not yet"; the trip `CostTrain` onto the kit Formation is open.
- **G5** (motion): DialogSheet enter and exit in the kit; PlateGroup and ChipGroup tick; wizard step settle, More glide, pick tick gated; mine windows 1 s everywhere (DESIGN.md).
- **G8** (never a grey tile): `HeroImage` without a photo is a `WorldTile` app-wide.
- **G9** (trust visible): no change beyond the lanes'.
- **G10** (accessibility and three angles): axe serious 0 on every audited screen at 390 and 1280; journey names read on a phone; one tab stop per radio group even when nothing is picked; sweep 360 to 1920 clean.
- **G14**: no change in this lane.

## For the orchestrator: project-map lines
- Docs table: `docs/design/craft-guide.md`: "General practice for any visual design task (process, identity, background graphics, clarity, three angles, interaction, accessibility, AI-slop catalogue, judging); this product's choices as worked examples."
- Design area: `continent-app/src/styles/05-house.css` (the house parts: blaze, plates, formation, rails, relief, motion classes); `src/components/ui/` gains `AiTag.jsx`, `radioGroup.js` (roving radio for `ChipGroup` and `PlateGroup`), `PlateGroup` in `Plate.jsx`; `src/components/AiTag.jsx` is a re-export.
- Plus the lanes' own lines in their `handbook-notes.md` (explore `PlaceRow.jsx`, `HouseParts.jsx`; trip `JourneyLine.jsx`, `DayHouse.css`; outdoors `89-outdoor-page.css`; brand `print-fonts`, `brand-pages.css`, `NotFoundPage.jsx`, `notFound.js`; account `references/account.md`).

## Docs changed
`DESIGN.md`, `PRODUCT.md`, `.claude/skills/carta-design/SKILL.md`, `assets/tokens.css`, `references/{explore,home,place,plan,shared-product-rules,trip}.md`, `docs/HANDBOOK.md` (two lines). Decision record: none new (decision 0012 holds; this lane's choices are in `decision.md`).

## Lessons (for `docs/lessons.md`)
- 2026-11-17 · The design-lint `motion-literal` rule and the smooth-scroll check do not fire on Windows (backslash paths), so a design-lint baseline regenerated on Windows can drop entries Linux still finds · regenerate the baseline on Linux (CI) or fix the flagged lines rather than trusting a Windows regen.
- 2026-11-17 · An icon-like part that renders letters (`AiTag`) inside an `aria-label`led button breaks WCAG 2.5.3 (label-content-name-mismatch), where an SVG of the same mark does not · inside labelled controls use the SVG.

## How to undo
Every change is a normal commit on `p15-housestyle`: `git revert <sha>` for one batch, or `git revert 039ba738cc..d8dfc49fa8` for the whole lane. No data migration, no schema change, no flag flipped.

## Files changed
`git diff --stat 039ba738cc..HEAD` (102 files): app code under `continent-app/src/` (components/ui, browse, planner, auth, lib, map, styles, i18n), `continent-app/scripts/` (blog build, verify_plan_mocks, design-lint baseline), `continent-app/tests/` (`hs-integration-kit`, `hs-plan-integration`, `blog`), the docs listed above.
