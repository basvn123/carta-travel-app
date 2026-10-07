# T372: design brief, Explore (the map tab)

## Task ID

T372 (design wave V1, session 3 of 10, raised by T369).

## Date

2026-10-08

## What changed

Explore now has a written brief that waves V3, V4 and V5 build from: `docs/design-v6/briefs/explore.md`. No app code changed. The brief walks the surface as the budget traveller in the research would, at 380 and 1280 px from a cold start and a returning visit; inventories every view, state, control and visual setting (about 60 control types, each with the file that draws it and a verdict); critiques it with impeccable's dual-agent method (23 of 40 on Nielsen's heuristics, 14 of 20 on the technical audit); states what the traveller needs first, second and third; plans three numbered build lists (12 items for V3, 7 for V4, 8 for V5) with files, command and done-check each; ends with a target-state table of every control; and proposes eight rules carta-design does not cover yet (N1 to N8) for T380 to accept or reject.

The finding that drives the plan: Explore is a price tool whose first screen shows no price. Rail cards carry name, score and country only, so the first screen at both widths holds zero euro figures, and the desktop mosaic shows about four per screen. The plan turns the page into an instrument: an input row on top (Lifestyle, a stepped budget ceiling, the month, car-free), a live count, a cost-led first rail, the price on every card with its provenance word on touch, and price pins on the map with the one cheapest pin emphasised, as carta-design already requires. It also fixes two counts that disagree on one screen (the tier key's 48 against the rail's 41, because the key counts raw destinations and the grid counts deduplicated rows), trip styles that "Clear all" does not clear, and an empty state that tells the traveller to "widen the price" on a page with no price control.

The mode is Operate: the traveller is comparing many places to make a shortlist, which is PRODUCT.md's "comparing dense pricing matrices". Impeccable's question rounds were answered from the brief and the research, as the owner instructed for this unattended run. Each choice kept Carta's palette, type and identity: no new colour, no gradient, no hero photograph, no second Lifestyle control, no fare of Carta's own. Where impeccable would have asked "which area first", the brief takes the research order (cost, month, access). Where it would have asked about tone, it keeps the instrument voice of PRODUCT.md. Where it would have asked about scope, it covers the whole surface, because the wave rules put every button in scope.

How the critique ran. Assessment A (design review) and Assessment B (detector) ran as two isolated sub-agents and met only in the brief. A read the source and the scratch screenshots without a browser, so the laptop kept to one browser at a time. B ran `impeccable detect` and the design lint read-only.

## Files touched

**Created:**
- docs/design-v6/briefs/explore.md
- Execution/P10/T372-v6-brief-explore.md

**Modified:**
- Execution/_OPEN.md (rows T372-a to T372-g appended)

Outside both repos, never committed: eight before screenshots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\explore\` (V1-grid-380, V1-grid-1280, V1-cards-380, V1-preview-1280, V1-filters-380, V1-lifestyle-380, V1-map-380, V1-map-1280, JPEG quality 80, viewport only). The rest of the walk's screenshots, the walk script and the harness output sit in the session scratchpad.

## Commands run

From the root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T372` (branch `p10-v6-brief-explore`):

```
sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target "<main checkout>/src/browse/ExploreTab.jsx"
node <scratchpad>/walk.mjs <scratchpad>/shots        # Playwright walk, 380 and 1280, against http://localhost:5199/?tab=map
```

From the app repo of the main checkout, read-only (Assessment B):

```
sh ".../impeccable" detect --json src/browse/ExploreTab.jsx src/browse/ExploreMap.jsx src/browse/ExploreRails.jsx src/browse/ExploreFilterRail.jsx src/browse/TierLegend.jsx src/browse/CategoryRail.jsx src/browse/LifestyleButton.jsx src/browse/FilterChips.jsx src/components/CostSummary.jsx src/components/FareProvenance.jsx src/components/FavStar.jsx
sh ".../impeccable" detect --json src/styles/15-map-overlays.css src/styles/26-shortlist-extras.css src/styles/25-feature-pages.css
node scripts/ci/design-lint.mjs
```

Harnesses, run with a scratch working directory so their screenshots stayed outside the repos (the scripts write to `./shots` and `./scripts/shots`):

```
node <app scripts>/verify_explore.mjs "http://localhost:5199/?tab=map"
node <app scripts>/verify_keyboard.mjs --port 5199 --only explore-grid,explore-map --out <scratchpad>/harness/kb
node <app scripts>/verify_shortlist.mjs http://localhost:5199/
```

Then `git add docs/design-v6/briefs/explore.md` and one commit (the plan), and this report with the register rows in a second commit.

## Config and secrets set

None.

## Before/after measurements

This task builds nothing, so these are the "before" figures the build waves measure against.

| Metric | Before (V1) | Target in the brief |
|---|---|---|
| Euro figures on the first screen, 380 and 1280 | 0 and 0 | every visible card priced |
| Priced cards above the fold of the desktop grid | about 4 | 8 or more |
| First card top at 380 x 800 | 490 px | 300 px or less |
| Visible interactive elements under 44 px at 380 (idle grid) | 51 of 159 | 0 inside the Explore column |
| Live result count on the page | absent (sheet button only) | in the title line, both widths |
| Tier 3 count, key against rail | 48 against 41 | one figure |
| Nielsen heuristics (Assessment A) | 23/40 | not scored until V6 |
| Technical audit | 14/20 | not scored until V6 |
| Cognitive load checklist failures | 4 of 8 | not scored until V6 |
| Detector findings, Explore markup | 0 | 0 |
| Detector findings, three Explore CSS files | 1 (false positive) | 0 new |
| Design lint | 213 violations, all baseline, 0 new | 0 new |
| verify_explore (shared dev server) | 58 of 67 | all pass on a preview build |
| verify_keyboard explore-grid and explore-map | 3 of 4 | 4 of 4, and 20 of 20 overall |

The control counts come from the scratch Playwright walk. The "about 4" is counted on the grid-deep-1280 screenshot.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First walk captured only the splash screen | The shared dev server needed more than the fixed 5 s to render | Waited for `.xbar-title` (up to 90 s) instead of a fixed pause |
| impeccable context reported NO_PRODUCT_MD | It resolves the project root to the app repo, which is its own git tree; PRODUCT.md and DESIGN.md sit in the root repo | Read both files directly; did not run init (row T372-g) |
| verify_explore failed 9 of 67, verify_keyboard 1 of 4, verify_shortlist did not finish | Timeouts on the shared dev server loaded by ten sessions; the harnesses are written for a preview build | Recorded as the before state; row T372-d asks for a clean baseline on a preview build before V3 |

## What is still open

The eight rules in part 7 of the brief need T380's decision before V3 builds the items marked with a rule (T372-a). The Lifestyle panel's own problems seen from Explore belong to the Lifestyle surface's owner (T372-b). Those problems are two terracotta selections at once, a letter "x" close, the last row under the phone nav, and no trade-off sentence. A compare tray of up to four places is the research's strongest missing feature, but it has no rule and no component, so it is left for its own task after V5 (T372-c). The Explore harnesses need a clean run against a preview build before the V3 build starts, because the shared dev server timed them out (T372-d). Whole-euro card figures against PRODUCT.md's two-decimal rule is a product decision for the owner (T372-e). The phone top bar's accent-filled "Get a pass" chip breaks the T360 secondary-chrome rule but belongs to the shell (T372-f). The impeccable context path artefact is noted for later waves (T372-g).

No i18n string was written, so no native-review row is raised here. The V3 items that add strings will raise their own.

The seven carta-design questions apply to a build wave; this task changed no visual. For the brief itself: it proposes no hex and no new colour (1, 2); it moves ochre off the map clusters and terracotta off the gauge, the chips and the kind ticks (3); mono stays on figures only (4); one primary per view is kept (5); the brief is free of em dashes and the banned words (6); and the thing removed is the decorative accent tick on the phone's trip-style tiles (7).

## Rollback procedure

Docs only. On the branch, `git revert` the two T372 commits (the brief, then the report with the register rows), or before merge delete the branch `p10-v6-brief-explore`. The screenshots outside the repos can be deleted from `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\explore\`; nothing reads them but the release pairing.
