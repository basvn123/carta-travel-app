# T462: The home page, rebuilt (plan any trip, with honest prices)

## Task ID

T462

## Date

2026-10-17

## What changed

The home page a first visit opens on (and the Carta brand mark leads to) is no longer the T209 landing receipt, a hiker's price instrument with 22 catalogue counts, no photos and one of the app's nine capabilities on show. It is now a front page that says what Carta is for and then shows it. The first screen carries the promise ("Plan any trip in Europe, with honest prices"), one sentence under it, the real guided search one tap away, three questions that return places today (walking first), the one primary ("Plan a trip"), and a live demo built in code from the app's own parts and the catalogue's own figures: a search for lakes in the Alps in July, Lake Bled opened as Explore shows it, a three town trip (Ljubljana, Lake Bled, Lake Bohinj) drawn and priced line by line in cents, and the trip shared. Under it sit the six kinds of trip as photo tiles (a swiped rail on a phone), four rows on what Carta does with a door each, the passes, and the photo credits. Every control that goes somewhere is a real link; a question carries its facets in its address, so it also opens in a new tab. The owner allowed a home only exception to the motion and photo rules (the demo loops, sections may reveal, a label may sit on a photo in a solid pill); it is written into DESIGN.md and the carta-design skill, scoped to `src/browse/home/`, with reduced motion, a pause control, off screen and hidden tab pauses and AA contrast still binding. PRODUCT.md's positioning now leads with planning any trip. Routing is unchanged (first visit and brand mark lead home, returning visits open Destinations, no nav item). The impeccable critique rose from 22/40 to 30/40 and the audit from 11/20 to 16/20; the page carries no catalogue count, 209 words outside the demo and 13 photographs, and on a phone it is 371 px shorter.

## Files touched

**App (continent-app/, its own repository, mirrored in the root):**

Created:
- continent-app/src/browse/home/HomePage.jsx
- continent-app/src/browse/home/HomeDemo.jsx
- continent-app/src/browse/home/useDemoClock.js
- continent-app/src/lib/homeDemo.js
- continent-app/src/styles/61-v6-home.css
- continent-app/tests/home.test.mjs
- continent-app/scripts/verify_home.mjs
- continent-app/.impeccable/surfaces/continent-app-src-browse-home.md (the impeccable surface brief, Persuade mode)

Modified:
- continent-app/src/App.jsx (HomePage replaces LandingPage; `pendingExploreSeed` and `openExploreSearch` hand a search to Explore)
- continent-app/src/browse/ExploreTab.jsx (`seed` and `onSeedConsumed` props)
- continent-app/src/browse/GuidedSearch.jsx (`requestOpen` and `onOpenRequested` props; outside the plan's named files, added because the hero's search must open the real panel, see Notes)
- continent-app/src/styles.css (39-landing.css out, 61-v6-home.css in after 61-v6-landing.css)
- continent-app/src/styles/61-v6-landing.css (the `.lp-*` rules out; the first-run receipt's `.frr-*` rules stay)
- continent-app/src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (42 `landing.*` keys out, 39 `home.*` keys in, in all six)

Deleted:
- continent-app/src/browse/LandingPage.jsx
- continent-app/src/lib/landing.js
- continent-app/src/styles/39-landing.css
- continent-app/scripts/verify_landing.mjs
- continent-app/tests/landing.test.mjs

**Root:**
- PRODUCT.md (positioning line; motion pointer to the exception)
- DESIGN.md ("Home page exception (T462)" under Motion; the caption Do)
- .claude/skills/carta-design/SKILL.md (the exception in Photography and Interaction and motion; Never #4 and the Also never line)
- docs/design-v6/OWNERSHIP.md (landing surface rows now name the home files; `home` prefix)
- docs/ONBOARDING_AND_EMPTY_STATES.md (one reconciling paragraph, closes T194-d)
- Execution/P11/T462-home-page.md (this report), Execution/P11/T462-shots/ (before, after-r1, after), Execution/P11/T462-critique/ (before.md, after-a.md, after-b.md, after-confirm.md)
- Execution/_OPEN.md

## Commands run

From the repository root unless marked.

```
git -C continent-app checkout -b p11-home-page
git checkout -b p11-home-page
C:/Users/Gebruiker/.claude/skills/impeccable/scripts/impeccable context --target continent-app/src/browse/LandingPage.jsx
# continent-app/: serve for checks (never npm run dev, whose predev rewrites public/)
npx vite --port 5202 --strictPort
# i18n swap by key prefix, CRLF and BOM kept, key sets diffed before and after
node <scratchpad>/i18n-home.mjs continent-app/src/i18n
C:/Users/Gebruiker/.claude/skills/impeccable/scripts/impeccable surface-brief write continent-app/src/browse/home <scratchpad>/home-brief.md
# continent-app/: gates
npm test
npx eslint src
node scripts/ci/design-lint.mjs
node scripts/ci/token-contrast.mjs
node scripts/ci/banned-terms.mjs
node scripts/check_ownership.mjs ../docs/design-v6/OWNERSHIP.md
C:/Users/Gebruiker/.claude/skills/impeccable/scripts/impeccable detect --json src/browse/home/HomePage.jsx src/browse/home/HomeDemo.jsx src/styles/61-v6-home.css
node scripts/verify_home.mjs --port=5202
npx vite build --outDir <scratchpad>/dist-final --emptyOutDir
npx vite preview --outDir <scratchpad>/dist-final --port 4173 --strictPort
node scripts/verify_tab_switching.mjs
node scripts/verify_bottom_nav.mjs
node scripts/smoke-nav.mjs
```

Measurement scripts (scratchpad, not shipped): shoot-home.mjs (five widths, en and de, probe), scenes.mjs (each demo scene), vitals.mjs and vitals-all.mjs (LCP and CLS, 390 x 844, 4x CPU slowdown, 1.6 Mbps, 150 ms latency, median of 3), h1dom.mjs (when the headline enters the DOM and paints), cpuprof.mjs.

## Config and secrets set

None. No environment variable, flag, secret or storage key changed; `continent.homeSeen.v1` is untouched, so every harness that seeds it still boots on Destinations.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| impeccable critique (Nielsen, /40) | 22 | 30 (28 first round) | +8 |
| impeccable audit (/20) | 11 | 16 | +5 |
| Catalogue counts on the page | 22 | 0 | -22 |
| Capabilities of the brief shown (of 9) | 1.5 | 9 (day planner and export as text) | +7.5 |
| Photographs | 0 | 13 | +13 |
| Words outside the demo (en, 390) | 536 (whole page) | 209 | -327 |
| Page height at 390 x 844 | 2,779 px | 2,408 px | -371 px |
| Primary above the bottom nav, 360 x 740 in six languages and 390 x 664 | fails (de 360; iPhone 13, T392-b) | passes, all 8 | fixed |
| LCP, cold first visit, throttled phone (median) | 9.26 s (lp-title) | 9.9 s (home-title) | +0.6 s, within the run spread (8.97 to 11.2 s before, 9.57 to 11.18 s after) |
| CLS | 0 | 0 | 0 |
| Entry JS, gzip | 229.12 kB | 230.32 kB | +1.20 kB |
| Entry CSS, gzip | 140.40 kB | 141.62 kB | +1.22 kB |
| verify_home (new) | n/a | 49 of 49 | |
| Unit tests | 451 of 451 | 452 of 452 | landing tests out, 15 home tests in |
| design-lint new violations, token-contrast pairs under the floor, impeccable detect | 0, 0, [] | 0, 0, [] | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Picking a demo scene from its tab showed a blank scene | the pause froze the scene's entrance animation at frame zero | two kinds of stop: Pause, off screen, hidden tab and a page over it freeze the motion; hover, focus and a picked tab only stop the turning |
| Play did not restart the demo | the pointer and focus that pressed Play stayed on it and counted as "inside the demo" | Play clears focus and hover and holds hover off until the pointer leaves |
| The trip route was a flat line with names on it | Annecy, Chamonix and Zermatt lie east and west of each other | a story with a real triangle, bowed legs, and names placed away from the route's middle, flipped or nudged inside the box |
| The demo opened on a snowy prefecture for "Lakes in the Alps in July", then on the dearest town of the page | the story towns were chosen before their photos and prices were looked at | story moved to Slovenia: Lake Bled at about 77 a day, under the hero's own budget question |
| Two scenes' words on top of each other for 320 ms | a plain crossfade | the old scene leaves at --dur-2, the new one arrives after it |
| The Share scene and the German Place scene overflowed at 360 | grid children with an unwrapped minimum width | minmax(0, 1fr) columns, min-width 0, wrapping labels |
| Icons spoiled link names ("Active Mountains", "Search Search by vibe") | the shared glyphs are named images | every icon on the page is wrapped aria-hidden |
| A question opened in a new tab lost its question | chips pointed at a bare ?tab=map | exploreHref() writes xe, xa, xc, xm, xb, xp |
| Explore showed an empty list for a moment after a tap on a phone | the guided vocabulary loaded on hover, which a tap does not have | it loads once the home page is idle (70 kB gzip), and on pointer down |
| LCP jumped to 16.7 s | the demo's place photo appeared five seconds in and was larger than the headline; the photos also competed with the catalogue on a slow line | the place photo sits beside its lines (at most 240 px wide), and the demo and kind photos wait for an idle browser |
| The headline still painted about 2.5 s late | HomePage was a lazy chunk: React suspends and renders the shell twice | HomePage is in the entry bundle (+1.2 kB gzip); measured by a throwaway static build first |
| design-lint flagged the 1.25x display headline | a computed font size is not a token | the headline stays at --text-display |

## What is still open

The owner confirms the demo story (Lake Bled, Lake Bohinj and Zell am See for the search; Ljubljana, Lake Bled and Lake Bohinj for the trip) and the six kind photos (Landwasser Viaduct, the trail above Zermatt, Punta rata, Lake Como, the Dolomites at Cortina, Col d'Aubisque) (T462-a). Every figure in the demo is a national estimate, because no town in the story's region is measured at city level yet; the demo says so with the tilde and the estimate word, and the owner decides whether that stands or the story moves when measured towns exist (T462-b). The kind tiles link to a bare ?tab=places, because Destinations keeps its category in state and not in the address; a new tab opens Destinations on its default kind (T462-c, needs a `cat` parameter in lib/urlState.js). The confirming review's remaining P2 and P3 items (a blank band under the shorter demo scenes, the scene door changing a moment before its scene, the receipt's total label wrapping at 1440) are listed in T462-critique/after-confirm.md (T462-d). Three things failed before this task and still fail, identically on the old build: verify_tab_switching 5 of 75 (the header search slot on Destinations, a scroll position 800 to 740) (T462-e), check_ownership on two stale rows for files deleted earlier (src/browse/TierLegend.jsx, src/planner/dayPlanPdf.js) (T462-f), and the design-lint baseline still lists entries for the deleted landing files, which match nothing and are harmless until the baseline is next regenerated (T462-g). The page is still client rendered, so T209-c, T402-a and T221-c stay open. The production deploy is the owner's: `npm run build:pages` with VITE_E2E_SEAMS empty, then `npx wrangler pages deploy dist --project-name carta-app --branch main` (T462-h).

## Rollback procedure

No data, schema or storage change. Before merge: delete branch `p11-home-page` in both repositories. After merge: `git -C continent-app revert -m 1 <app merge>` and `git revert -m 1 <root merge>`; that restores LandingPage, landing.js, the landing CSS, the `landing.*` keys, verify_landing and landing.test together, and the docs' exception text. Visitors' routing is unaffected either way.

---

## Notes

**How each tool the owner installed was used.** impeccable: context (it resolved continent-app as the root and missed PRODUCT.md and DESIGN.md, the known nested-repo gap, so both were read directly), the shape discovery as the owner's three answers, the craft floor before every UI edit, new-work's extension path (no concept round inside an established world), the surface brief, the detector (three runs, all `[]`), and three review rounds by independent sub-agents (critique and audit before; critique A with screenshots and personas and audit B with the live detector, the keyboard walk and code reading after; one confirming round), with one fix batch between them and a last small batch after the confirm, then stop. frontend-design: the direction (one memorable element, everything else quiet; per-section fade-ups dropped as a generated tell). taste-skill: its tells list, applied by reviewer B. web-design-guidelines: the live Vercel rules, fetched and applied by reviewer B. Playwright (the CLI was installed this session; the harness and probes use the Playwright library the repo already ships). Chrome DevTools: the MCP server was added after this session started, so its tools were not loaded; the same measurements (LCP, CLS, CPU profile, network throttling) were taken through the DevTools protocol from Playwright. Not used: Context7 (needs the owner's sign-in, and nothing here needed library docs), Figma (no file), image-to-code and the image generation skills (no image generation in Claude Code), awesome-design-md (the Lagoon world already takes Airbnb as its reference).

**The seven carta-design questions.** 1. No hex outside the tokens (design-lint 0 new). 2. No gradient, no colour outside DESIGN.md. 3. Brown only on what acts (the primary, links, the selected tint in the demo, the live route, the progress line of the live demo). 4. No figure under 12 px or functional text under 11 px; figures tabular; every euro through formatMoney, formatPrice or Money. 5. One primary ("Plan a trip"); text on a photo only as the solid kind pills the exception allows. 6. Every headline has a verb or names a section; no count, no method line (the "Lines join the towns" note was removed); no dash, middot or banned word (tested in six languages). 7. Removed: the proof column, the photo zoom, the price pill on the demo photo, the per-section reveals.

**Scope.** GuidedSearch.jsx was not named in the plan; it needed one prop so the hero's search opens the real panel instead of a copy of it. The approved plan also named `useReveal.js`; it was not built, because section reveals were cut as decoration.
