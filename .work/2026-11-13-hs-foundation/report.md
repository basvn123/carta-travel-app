# Report: foundation lane of the house style (G1)

Status: done (fix round 1 from the orchestrator's judges complete)
Branch: `p15-housestyle` (worktree `wt/housestyle`), base `143daa19a4`, 14 commits from `ff6f9a4b10` to `8921c470df`. ROADMAP: G1, with G2, G5, G10, G11.

The shared layer of the house style is in the app: new tokens (stone ground, green-black ink, umber as the paint, beige tints, a rounder radius scale), Overpass and Sofia Sans Extra Condensed self-hosted, the kit restyled, the house parts (blaze, signpost plate, Score plate, price formation, rails, relief from real peaks, states, rolling figures), an interaction kit with springs, primitives and haptics, a shell that fits at every angle, map colours, a rebuilt style guide, new contrast and relief checks, one vocabulary in six languages, and DESIGN.md, PRODUCT.md, the carta-design skill, the craft guide and decision 0012. Every screen wears the new style through the re-pointed tokens today; page lanes now rebuild their layouts on it. The second foundation judge scored 107 of 135 with ten of eleven criteria passing; the one short (every function intact, pass at 5) was short on verify evidence, which this report now closes (below).

## What changed, by area

| Area | Before | After | Files |
|---|---|---|---|
| Tokens | Lagoon: warm grey ground, Figtree, 10/16/20 px radii, card shadows | One `:root`: stone `#eef0ea`, ink `#1e2421`, umber 600 as action, selected, route and pin; beige wash; plate, formation, kind, relief and map roles; radii 6/8/12/16/pill; one float shadow; type that grows at 769 and 1024; spring easings; every legacy name re-pointed | `continent-app/src/styles/01-tokens.css`, `continent-app/src/map/tokenColors.js` |
| Type | Figtree | Overpass (all words and figures, tabular figures checked in the file) and Sofia Sans Extra Condensed (plate names), self-hosted woff2, preloaded; OFL credits | `continent-app/src/assets/fonts/Overpass-latin.woff2`, `Overpass-latin-ext.woff2`, `Overpass-OFL.txt`, `SofiaSansExtraCondensed-latin.woff2`, `SofiaSansExtraCondensed-latin-ext.woff2`, `SofiaSansExtraCondensed-OFL.txt`, `continent-app/src/styles/00-fonts.css`, `continent-app/index.html`, `continent-app/tests/pwa.test.mjs`, `docs/tos/fonts.md` |
| Kit | Lagoon controls, 2 px focus | Press, select and toggle on springs, 3 px focus, chips and segments as pills, the tab paint bar, edges at 3:1, receipt leaders; selected follows one rule per kind of choice; Button takes `haptic="confirm"` | `continent-app/src/styles/02-base.css`, `03-button.css`, `04-ui.css`, `continent-app/src/components/ui/Button.jsx`, `Chip.jsx`, `Segmented.jsx`, `Switch.jsx`, `index.js` |
| House parts | none | Blaze, Plate (place, leg, total, mark), ScorePlate, Formation, Rail, RailCard, ReliefBand, StateBlock, Skeleton, NotYet, WorldTile, Figure; primitive classes (pop, leave, reveal, sheet, dialog, route, shake, settle, couple, paint); house icons (58, 24 grid, 1.75 stroke) | `continent-app/src/styles/05-house.css`, `continent-app/src/styles.css`, `continent-app/src/components/ui/Blaze.jsx`, `Plate.jsx`, `Formation.jsx`, `Rail.jsx`, `Relief.jsx`, `StateBlock.jsx`, `Figure.jsx`, `continent-app/src/components/HouseIcons.jsx`, `continent-app/src/lib/relief.js` |
| Icons in use | a sparkle for AI (5 uses), a globe for countries and language (22 uses), a compass logo | `SparkIcon` draws the boxed AI mark, `GlobeIcon` the borders glyph, so every caller changed at once; the wordmark slot is a blaze | `continent-app/src/components/Icons.jsx`, `continent-app/src/components/AppHeader.jsx` |
| Interaction | `touchFeedback.js` vibrated on pointerdown (a scroll start buzzed) | Springs in one source with generated CSS easings; haptics tick, confirm, warn on a touch commit only, 50 ms gap, "Vibrate on tap" in Settings laid out as a Settings row | `continent-app/src/lib/motionTokens.js`, `continent-app/src/lib/haptics.js`, `continent-app/src/lib/touchFeedback.js`, `continent-app/scripts/ci/spring-easings.mjs`, `continent-app/src/components/HapticsSetting.jsx`, `continent-app/src/auth/account/TravelView.jsx`, `continent-app/tests/hs-foundation-haptics.test.mjs` |
| Shell | Header label cut to "Cho..."; at 390 the account door 9 px off-screen; the door's name did not contain its words | Wordmark slot; house nav icons; the umber paint bar glides under the current place and a blaze over the phone's current icon; the phone row fits at 360; tablet stacks icon over word; the door's name is its visible words; on the home film the door is a paper icon (phone, tablet) or an ink pill (desktop); `theme-color` the stone ground | `continent-app/src/components/AppHeader.jsx`, `continent-app/src/components/StyleDoor.jsx`, `continent-app/src/styles/60-v6-shell.css`, `continent-app/index.html` |
| Background graphics | none | The relief from a place's real peaks with printed heights, its rulebook in DESIGN.md, checked in the browser | `continent-app/src/lib/relief.js`, `continent-app/src/components/ui/Relief.jsx`, `continent-app/scripts/verify_relief.mjs` |
| Map | stock Voyager colours, a beige picked pin | Land, water and borders repainted in the house colours on every map; tier greys moved; the picked Explore pin is the umber mark | `continent-app/src/map/houseBasemap.js`, `continent-app/src/map/tokenColors.js`, `continent-app/src/browse/ExploreMap.jsx`, `DestMap.jsx`, `CyclePage.jsx`, `TripDayMap.jsx`, `TrailPage.jsx`, `continent-app/src/map/TripMap.jsx`, `DayExploreMap.jsx`, `continent-app/src/planner/finder/TripsMap.jsx`, `continent-app/src/styles/62-v6-explore.css` (the picked-pin rule only) |
| Flags | Slovenia drew as Russia at 15 px | A shield that survives at 15 px | `continent-app/src/components/CountryFlag.jsx` |
| Style guide | Lagoon tokens and parts | Every token with live contrast, type, shape, kit, house parts, a relief from Aosta's real dossier, states, live interaction and primitive demos, icons | `continent-app/src/styleguide/StyleGuide.jsx`, `styleguide.css` |
| CI | 31 text, 11 mark pairs; gradient rule; Windows reported 32 false "new" lint hits | 45 text, 22 mark pairs (0 under); `--plate-face` allowed; gradient rule dropped (G11); the comment check strips a CR first (0 new on Windows and Linux); baseline regenerated once (4,595 to 4,409) | `continent-app/scripts/ci/token-contrast.mjs`, `continent-app/scripts/ci/design-lint.mjs`, `continent-app/scripts/ci/design-lint.baseline.json` |
| Verify scripts | `verify_bottom_nav` walked a "Start planning, Continue" flow gone since before the base; console CORS noise failed the shell checks | `verify_bottom_nav` asserts the shell's job (Plan opens, marked, addressed); CORS from the live data host is filtered as environment noise; `verify_desktop_shell`'s ground colour is the stone | `continent-app/scripts/verify_bottom_nav.mjs`, `verify_top_bar.mjs`, `verify_desktop_shell.mjs` |
| Vocabulary | three to five names per object | Saved, My trips, Upcoming and Planning, Ready-made trips, Places, Not yet (values only, six languages); lane markers; one new key `settings.haptics` | `continent-app/src/i18n/en.js`, `nl.js`, `de.js`, `fr.js`, `es.js`, `it.js`, `continent-app/tests/priceNotes.test.mjs` (its copy pin follows "Not yet") |
| Docs | Lagoon DESIGN.md, PRODUCT.md and skill | DESIGN.md rewritten (frontmatter generated from the tokens); PRODUCT.md rewritten name-free with the vocabulary, the interaction promise and the three angles; the skill rewritten with nine pre-ship questions; references split per lane with a split log; the craft guide; decision 0012; direction.md a pointer; 0006 superseded in part; CLAUDE.md design lines | `DESIGN.md`, `PRODUCT.md`, `CLAUDE.md`, `.claude/skills/carta-design/SKILL.md`, `.claude/skills/carta-design/assets/tokens.css`, `.claude/skills/carta-design/references/account.md`, `brand.md`, `explore.md`, `home.md`, `outdoors.md`, `place.md`, `plan.md`, `trip.md`, `shared-product-rules.md`, `_split-log.md`, `app-rules.md` (now a pointer), `docs/design/craft-guide.md`, `docs/design/direction.md`, `docs/decisions/0012-house-style.md`, `docs/decisions/0006-design-rules-are-defaults.md`, `docs/decisions/README.md`, `docs/tos/fonts.md` |

All 90 changed files: `changed-files.txt` in this folder.

## The final tokens (summary; DESIGN.md has all)
Ground `#eef0ea`, band `#e3e7df`, paper `#ffffff`, ink `#1e2421` / `#465049` / `#59625c`, rule `#cfd5cc`, edge `#7a847d`, umber `#faf6f1` `#f6e7d3` `#e7d3bc` `#d4b48f` `#a8733f` `#8c5a2b` `#744820` `#5a3716`, plate `#1e2421`, kinds `#2f7a45` `#0e7c86` `#2b5fa8` `#6248a8` `#b02a63`, danger `#a12a1c`, map land `#f8f9f5`, water `#d3dfe2`. Radii 6, 8, 12, 16, pill. Type Overpass 12 to 54 px (title 24/30/36, total 40/48/54). Motion: press 80 ms, tick 300 ms, pop 550 ms, settle 400 ms, sheet 420 ms.

## How it was run
- Explore, diverge, propose, critique and the owner's pick happened upstream (`.work/2026-11-13-house-style/`, `decision.md`); this lane started from that decision.
- Hybrid prototype (`hybrid/`, a builder subagent): judge 1 FAIL 94 of 130 (`judgement-hybrid.md`); fix round; judge 2 105 of 130, only accessibility short (`judgement-hybrid-2.md`); I fixed the five small targets it named (sweep clean, axe 0). No third hybrid judge (hard stop of three loops counted across the lane).
- Departure from the brief's order: tokens and kit went into the app while the hybrid's fix rounds ran; those rounds did not change any token value.
- Foundation judges: judge 1 FAIL 87 of 135 (`judgement-foundation.md`; part of it scored screens page lanes rebuild later); fix round; judge 2 107 of 135, ten of eleven criteria at their pass mark, criterion 11 at 4 for missing verify evidence (`judgement-foundation-2.md`). After it: the keyboard check proven identical to the base, both shell checks refreshed and green, axe re-run, the reduced-motion exit defect and the Remove demo fixed, the baseline regenerated. No third judge was spent; the orchestrator's own judges score the branch next.
- Subagents: hybrid builder, craft-guide writer, app-rules splitter, four judges.

## Checks (final, at `8921c470df`)
| Check | Result |
|---|---|
| `npm test` | 2,110 tests, 23 fail, all in the 24-test sparse-checkout baseline taken before any change (`baseline-fails.txt` vs `fails-run4.txt`); no new failure; one baseline failure now passes (design-lint "no new motion-literal") |
| `npm run lint` | 0 errors, 13 warnings (unchanged from the base) |
| Fast build | ok |
| `node scripts/ci/design-lint.mjs` | 4,409 found, 4,409 in the baseline, 0 new |
| `node scripts/ci/token-contrast.mjs` | 45 text pairs, 22 marks, 0 under the floor |
| `node scripts/ci/spring-easings.mjs --check` | in step |
| `node scripts/verify_axe.mjs` (home, Explore list, Explore map, place, plan start, trip at 390 and 1280) | 0 violations on all 12, every Tab stop with a ring (`verify/axe.txt`) |
| Width sweep, 10 screens x 10 widths (`shots/sweep.json`) | no horizontal page scroll; one item: Explore's "Countries" toolbar button runs past the edge inside its toolbar row at 360 (explore lane, must-fix 6) |
| `verify_relief.mjs` on the style guide at 390, 820, 1440 | all pass (it caught a clear-zone overlap first, fixed) |
| `verify_bottom_nav.mjs`, `verify_top_bar.mjs` | 0 failed checks, 0 errors each (`verify/bottom_nav.txt`, `verify/top_bar.txt`) |
| `verify_focus_trap.mjs` | all pass |
| `verify_keyboard.mjs` | 6 of 22 surfaces pass, identical surface by surface to a build of the base `143daa19a4` run the same way (`verify/kb-base-sum.txt` vs `verify/kb-lane-sum.txt`): the 16 failures are selectors the app no longer has, not this lane |
| `verify_phone_chrome.mjs` | 42 runs (`verify/phone_chrome-report.json`): 27 clean; 9 time out on flows that `verify_keyboard` also cannot reach at the base (plan chooser, lifestyle, trip walk); 3 hit a full disk (the machine's, not the app); 3 "trip-planned" runs flag the Book buttons as touching the bottom bar (their bottom equals the bar's top, trip lane to look at) |
| `verify_desktop_shell.mjs` | stale: walks the retired Destinations panel (absent at the base); its ground assertion updated to the stone colour |
| `verify_viewport_catalogue.mjs` | skipped: needs a `VITE_CATALOGUE=viewport` build |
| `verify_pwa`, `verify_csp`, `verify_quality_floor` | not run (they start their own servers on fixed ports); `tests/pwa.test.mjs` and `tests/cspHashes.test.mjs` pass in `npm test` apart from one baseline path failure |
| impeccable detector on the touched CSS and JSX | `[]` |
| `python -I scripts/docs/check_entry_points.py` | ok, 300 paths |
| `python -I scripts/docs/drift.py` | 1 drift: `docs/SCHEMA.md` wire table, present before the lane |

Motion was checked in code and on the style guide's demos, not watched on a phone (not verified on a device; haptics cannot be felt headless).

## Screenshots
`shots/` (not committed): `home`, `explore`, `explore-list`, `explore-map`, `place`, `trip`, `day-planner`, `mytrips`, `account`, `settings`, `styleguide` at `-390`, `-820`, `-1440` (and `-1180` for home, Explore list and map, place, trip), with `-full.png` versions and `sweep.json`. Home, Explore map, settings and the style guide were reshot after the fix round. The hybrid prototype's shots: `hybrid/shots/`.

## What departed from the house style, and why
- Tablet shell: the hybrid's 80 px side rail was not built; the app's screens position against the full width, so a rail would shift every absolutely positioned map and panel. Tablets get their own header layout instead (places stacked icon over word, the door as its icon).
- The relief cut is a 1.5 px umber line, not 3 px: the hybrid's judges counted a 3 px bar as a side stripe.
- Selected has two looks by design, written as one rule: the wash for an item chosen among many, the paint for the one option of a single control.
- PDFs, share images and social cards still use Figtree (brand-surfaces lane).

## Fix round 1 (orchestrator's judges, 2026-11-16)
The orchestrator's two judges scored the foundation 102 and 103 of 135, FAIL, with eight blocking items (`foundation-fixes-r1.md`). All eight are fixed in `5c8d20594e`:

| # | Item | What changed |
|---|---|---|
| 1 | Rail parity with StoryRail | `continent-app/src/components/ui/Rail.jsx`: the section is labelled by its heading; the arrows carry `explore.railPrev` and `explore.railNext` and are disabled at the ends through the strip-position logic, now shared in `continent-app/src/lib/useStripPosition.js` (`StoryRail.jsx` untouched); ArrowLeft and ArrowRight move focus card to card and bring it into view; "See all" is a `Button` (a link only with an href). Recorded in DESIGN.md "Rail and RailCard". |
| 2 | Figure announces | `continent-app/src/components/ui/Figure.jsx`: one polite, atomic live region with the full value (and its label) after the traveller's own change; `still` for refreshes and co-planners' edits; `DUR_NOTE_MS` named after `--dur-note`; the unbuilt "while the page scrolls" claim removed. |
| 3 | Ticks on non-kit toggles | `continent-app/src/lib/touchFeedback.js`: one delegated `click` listener (never pointerdown) ticks `[aria-pressed]`, switches and checkboxes outside the kit; folds (`aria-expanded`) stay silent; the setting, touch-only rule, reduced motion and 50 ms gap apply through `haptic()`. Test: `continent-app/tests/hs-foundation-haptics.test.mjs` (8 of 8). |
| 4 | Docs agree | `references/shared-product-rules.md`: the 12 px floor, the formation as the price row, the estimate line dropped, the PRODUCT.md summary; one unit string, "A day, a person", in PRODUCT.md and DESIGN.md; references name-free in prose; `references/home.md` regains T1128-b. |
| 5 | Photo scrim | `--photo-scrim` token at ink 78 %: white text measures 7.7:1 even over a pure white photo (it was 3.65:1 at 55 %); DESIGN.md "Photography" and the CSS comment say so. |
| 6 | Price row overlap | `.hs-formation` wraps (row gap 6 px) with the train keeping its content width; the rail card link has a `minmax(0, 1fr)` track (the `auto` track was what let the row run past the card); four rail columns only while each keeps 256 px; a longest-figures demo card (a four-figure fare, a long German name); the sweep now fails on a day figure touching a wagon or a row passing its card. |
| 7 | No yellow | `--best` is beige (umber 200), `--best-bg` umber 50, `--best-ink` umber 800, always with its word; contrast and distinctness pairs pass; the `--sun-*` primitives stay only for the share images' `SHARE_TOKENS` and the cost-card test, recorded in the token file and DESIGN.md. |
| 8 | Reshoot and checks | explore, explore-list, explore-map, place, trip, day-planner, mytrips, account and the style guide at 390, 820, 1180 and 1440 in `shots/`; checks below. |

Cheap non-blocking items done in the same commit, and the rest left for integration, are listed in `handbook-notes.md` ("Fix round 1").

Checks after the round (at `5c8d20594e`): `npm test` 2,111 tests, 23 failures all in the sparse baseline, none new; `npm run lint` 0 errors; fast build ok; design-lint 0 new; token-contrast 45 text pairs, 22 marks, 0 under; springs in step; width sweep 100 runs (10 screens, 360 to 1920) with the new overlap check: no formation overlap, no page scroll, only Explore's toolbar button at 360 (explore lane); axe 0 on home, Explore list and map, place, plan start and trip at 390 and 1280; `verify_bottom_nav`, `verify_top_bar`, `verify_focus_trap`, `verify_relief` all pass; docs checks ok apart from the pre-existing SCHEMA drift.

## Open items
- `foundation-requests.md`: none (this is the foundation).
- `handbook-notes.md`: ROADMAP lines (G1, G5, G10, G11), the project-map lines (craft guide, design files), the Handbook lines (Vibrate on tap, the vocabulary), the staged manifest colours (protected `public/`, owner step), home-lane icon swaps in `HomeTour.jsx`, two keys to retire, the stale `verify_desktop_shell`, one lesson for `docs/lessons.md`.
- Page-lane items found on the way (in `judgement-foundation-2.md`): Explore rows and rails onto the parts, the duplicate "Places in Europe", the Map float over a price, the Countries button at 360, names cut in the map list at 820; home's sun-yellow headline text and the Phosphor sparkle; the place cost slab onto the total plate and the tab pills onto the kit; the trip journey line, relief and photo scrim, and the Book buttons touching the bar; "Your day" wrapping in the day planner at 1440.

## How to undo
`git revert` the lane's commits on `p15-housestyle` (`ff6f9a4b10` to `8921c470df`, newest first). No data, schema or contract change; the old tokens, fonts and docs come back with the revert, and `src/assets/fonts/` goes with it. The design-lint baseline returns to its old counts with its commit.
