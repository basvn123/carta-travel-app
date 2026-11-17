# Report: home lane of the house style (G1)

Status: done. Judge 1 109/135, merge no (craft 3; two CSS fixes, `judgement-1.md`), fixed in `bfc4d3f382`; judge 2 108/135, merge no (craft 3; the 820 band, the phone tour reveal, an off-scale breakpoint, `judgement-2.md`), fixed in `6dead46582`; judge 3 110/135, **merge: yes**, nothing blocking (`judgement-3.md`). Fix at integration: ship the re-recorded clips (the phone frame still plays the old recordings), merge order with the moved `p15-housestyle`, the waitlist-emphasis owner flag.
Branch: `p15-hs-home` (worktree `wt/hs-home`), base `0a5517d74c`; commits `70da1aff74`, `ff0a3c4dff`, `bfc4d3f382`, `6dead46582`. ROADMAP: G1, with G10 (three angles).

## What was done
L2 crew run (design playbook): three explorers (home code and function inventory, the foundation kit, jobs, copy and clips), three proposals (A the walk, B the receipt, C the signposts), three critics (no blockers; all three picked B's skeleton), decision `decision.md` (B, with A's hero order and route ruler and C's umber band), build by the lane orchestrator, three judges with a fix round after each of the first two. Tour clips re-recorded in six languages into `public-staging/`.

## What changed, per section (before: `before/`, `contact-before-*.png`; after: `shots/`)
| Section | Before | After | Files |
|---|---|---|---|
| Hero | centred slogan with a sun-yellow word, sparkle on Ask Carta, a long line, a cream ticket with an uppercase label | slogan at the lower left on the header's line, accent in beige, the boxed AI tag, a shorter line; the pass a paper ticket whose stub is the getting-there wagon (outlined umber pill, glyph, figure); header-on-film and one-bar rule unchanged | `HomeHero.jsx`, `61-v6-home.css` |
| The week | two umber panels led by uppercase kickers, figures lit by scroll position, a sticky receipt from 1024 only (`display:none` below), a phone run bar | one umber band: heading, two chapters (amount, one line), and the house's paper cost post on every width (the day's formation, `CostRow` lines, Rounding only when the printed lines differ, one ink total `Plate` with `Figure still`); the wagons couple in once; chapters centre against the post from 768, their amounts a step under the total | `HomeCost.jsx`, `62-home-story.css` |
| The flight's share (flight in the sweep only) | sun, umber and lagoon bars, a count-up, a sheen | the formation's colours, every figure whole from the first paint, bars draw once; door secondary | `HomeProof.jsx` |
| Tour | pill tabs with per-chapter tone grounds and a radial glow, Phosphor icons, chips for "Also in Carta" | tabs on a hairline with the umber paint bar that fills with the clip (vertical from 1024), house icons, AI tag; the clip in an ink phone on a sunken card; one quiet "Also in Carta" line | `HomeTour.jsx` |
| Try it | a slider in a card, per-card "Fits your budget" | a route ruler (umber paint to the budget, places as stop discs, best-value ring), the budget figure follows the thumb, a haptic tick on release with a new value; cards with the place's formation; over budget fades only the photo; door secondary | `HomeTry.jsx` |
| Plans | three columns, lists always open | rows on a phone with each list behind a "What is in it" fold, columns with open lists from 769, title beside them from 1024 | `HomePlans.jsx` |
| Close | a field under a title | a full-width sunken band; on a phone the field stacks over its quiet Ask; its search landmark named by the heading | `HomePage.jsx`, `HomeHero.jsx` |
| Waitlist | primary submit, no state motion | paper field, secondary submit with its loading state, a shake on every refusal, the done note on beige | `WaitlistForm.jsx`, `94-waitlist.css` |
| Footer from home | legal links 18 px tall | 44 px targets, same look | `61-v6-home.css` |
| G14 (`?home=g14`) | mist hero, uppercase kicker, umber card with lagoon bar | stone, plain kicker, paper post with the formation's colours, house arrow icons | `HomeG14.jsx`, `63-home-g14.css` |
| Motion kit | its own spring copy | the house springs (`src/lib/motionTokens.js`); punctuation after an accent no longer starts a line; reduced motion starts every arrival at its end state | `motionKit.jsx` |
| Copy (six languages) | | shorter hero line, cost, share and Try lines, waitlist lead and fine print; headings lose their full stops; new `home.planWhat`, `home.weekTotal` under `// lane:home` | `src/i18n/*.js` |
| Docs | | `references/home.md` gains "The look (house style 2026-11)" | `.claude/skills/carta-design/references/home.md` |
| Scripts | `verify_home` checks for markup removed in earlier runs (it aborted at `.hv-week`); the recorder wrote only into `public/` | `verify_home` checks the cost post, the tour tabs, try it and the plan lists (same depth); the recorder takes `--out` | `scripts/verify_home.mjs`, `scripts/record_home_clips.mjs` |

Every changed file: `git diff --stat 0a5517d74c..p15-hs-home` (25 files). `homeIcons.jsx` deleted (unused).

## Files changed
| File | What changed and why |
|---|---|
| `continent-app/src/browse/home/HomeHero.jsx` | House icons, the boxed AI tag on Ask Carta, the pass stub as the getting-there wagon; `AskField` takes `labelledBy` to name the closing search landmark |
| `continent-app/src/browse/home/HomePage.jsx` | The closing Ask wrapped for the full-width band and named by its heading |
| `continent-app/src/browse/home/HomeCost.jsx` | The umber band with two chapters and the paper cost post (Formation, CostRows, Rounding, total Plate); scroll-tied light-up and run bar retired |
| `continent-app/src/browse/home/HomeProof.jsx` | Count-up replaced by still figures, formation colours, house icons, secondary door |
| `continent-app/src/browse/home/HomeStory.jsx` | Stops passing the unused `place` prop to HomeProof |
| `continent-app/src/browse/home/HomeTour.jsx` | House icons and the AI tag, no kicker, tone classes removed, house springs, tall Reveal arrives at a tenth in view |
| `continent-app/src/browse/home/HomeTry.jsx` | Route ruler, still budget Figure, haptic tick on release, cards with the place formation, secondary door, reduced-motion end state |
| `continent-app/src/browse/home/HomePlans.jsx` | Plan lists behind a named fold on a phone, open from 769; house check icon |
| `continent-app/src/browse/home/HomeG14.jsx` | House arrow icon in the G14 doors |
| `continent-app/src/browse/home/motionKit.jsx` | Re-exports the house springs; Reveal takes `amount` and starts at its end state under reduced motion; punctuation after an accent stays on its word |
| `continent-app/src/browse/home/homeIcons.jsx` | Deleted: the Phosphor icons gave way to HouseIcon |
| `continent-app/src/components/WaitlistForm.jsx` | Secondary submit with its loading state, shake on every refusal, done note arrives with hs-reveal |
| `continent-app/src/styles/61-v6-home.css` | Rewritten in the house style: hero, pass, Ask field, plans, close band, footer legal tap targets, reduced motion |
| `continent-app/src/styles/62-home-story.css` | Rewritten: umber band and cost post, share bars, tour tabs and phone, route ruler and cards, tablet and desktop layouts |
| `continent-app/src/styles/63-home-g14.css` | G14 on stone with the paper post and formation colours; breakpoints on the scale |
| `continent-app/src/styles/94-waitlist.css` | Paper field, states, house tokens |
| `continent-app/src/i18n/en.js` | Shorter home and waitlist strings; new `home.planWhat`, `home.weekTotal` under the lane marker |
| `continent-app/src/i18n/nl.js` | The same changes in Dutch |
| `continent-app/src/i18n/de.js` | The same changes in German |
| `continent-app/src/i18n/fr.js` | The same changes in French |
| `continent-app/src/i18n/es.js` | The same changes in Spanish |
| `continent-app/src/i18n/it.js` | The same changes in Italian |
| `continent-app/scripts/verify_home.mjs` | Stale week, voices, story, route and why checks replaced by week, story, tabs, try and plans checks |
| `continent-app/scripts/record_home_clips.mjs` | New `--out` option so clips can be staged outside the protected public/ |
| `.claude/skills/carta-design/references/home.md` | New "The look (house style 2026-11)" section |

## Function parity
No control, door, handler, show/hide condition or data field removed (both judges: criterion 11 at 5). Presentation-only changes: the scroll-tied chapter light-up and the phone run bar (their figures are all in the post from the first paint), kickers and `home.proofNote` no longer rendered (keys kept in the catalogues by decision, listed in `handbook-notes.md`), the per-card "Fits your budget" line (the foot says how many fit), the count-up (still figures), the Proof, Try and waitlist buttons from primary to secondary (one primary; owner note), the chapter facts pills (their figures are the post's line subs).

## Checks
See `checks.md` (at `6dead46582`): `npm test` equals the 25-failure sparse baseline; lint 0 errors; design-lint 0 new (16 fewer); token-contrast 0 under; css-routes ok; verify_home 65 PASS; verify_home_g14, verify_language_urls, verify_url_scheme pass; verify_prerender not applicable (content pages only); axe home 390/820/1440 0 violations, G14 and flight state 0 serious; sweep 360 to 1920 clean in EN and DE (v3) and DE (G14); impeccable detect `[]` (`impeccable.json`); docs checks OK apart from the baseline SCHEMA drift.

## Screenshots
`shots/home-<w>.png` and `home-<w>-s<n>.png` at 360, 390, 820, 1180, 1440, 1920; `g14-<w>*.png` at 390, 820, 1440; flight states `flight-*.png` (dev build, `?tab=home&o=BRU&flightmock`); German 360 in `shots/de/` and G14 at 390, 820, 1024, 1440 (retaken on the final build); sweeps `shots/sweep-*.json`. Contact sheets `contact-*.png`.

## Recordings
54 clips (9 chapters by 6 languages, mp4 plus webp poster) in `public-staging/home/clips/<lang>/`, 27 MB (the shipped set is 32 MB); frame strips in `strips/` (`sheet-en.png`, `sheet-de.png`). Recorded against the lane's dev-mode build (the recorder's seams need DEV); they show explore, place and trip in the house style and plan, My trips and Together as they were at the lane's base. Copying into `continent-app/public/home/clips/` is the orchestrator's or owner's step (protected path); a final re-record after all lanes merge is advised.

## Departures from the house style
- Try it's cards use the formation and house radius on their own `.hm-card` instead of the kit `RailCard`, which always renders a link (FR 3).
- The cost post's wagons couple in through a scoped rule on `.hs-wagon` (the kit's own keyframes), as the trip lane did.
- From home the shared footer's legal links get 44 px targets (scoped to `.hv-page`).

## Open items
`foundation-requests.md` (4: home-only tokens, a compact formation, a static RailCard, the Phosphor dependency), `handbook-notes.md` (ROADMAP and project-map lines, the clips step, owner suggestions: waitlist emphasis, the footer tagline conflict). Integration: `p15-housestyle` has moved on since the base (outdoors lane): merge normally. Unused home keys (`home.*Kick`, `home.tryFits`, `home.proofNote`, `home.nightPrice`, `home.dayPrice`, `home.nNights`, `home.nDays`, `home.soFar`) are kept by decision (no test churn; a later copy pass may retire them with `home.test.mjs`'s retired list).

## How to undo
`git revert 6dead46582 bfc4d3f382 ff0a3c4dff 70da1aff74`. No data, schema or storage change.

## Judge 3's optional items (not built)
The ruler's thumb half covers the stop disc at the budget's own value (1024+); the chapters could take a larger step at 1440+; the "See Trip Pass prices" door sits under the Free column from 1024. Listed in `handbook-notes.md`.

## Fix round 1 (from the orchestrator's judges)
Judges `judgement-orch-home-1.md` (111, merge yes) and `judgement-orch-home-2.md` (99, merge no: craft, clarity, motion, ownability under threshold); instructions `home-fixes-r1.md`. Merged the current `p15-housestyle` first (`6aeef5693e`, clean), then `1771c71d1e`.

| Blocker | What changed | Files |
|---|---|---|
| Motion at full voice | The band builds in order: from 768 each chapter lights up and paints its post line (a 2 px umber stroke) as it reaches the middle of the view, on a phone the lines paint one beat apart when the post comes in; the wagons couple in; the plate settles once both are painted (no figure moves, the total is printed from the first paint). The blaze paints on the chosen tour tab. A Try card that comes within the budget lifts once on the tick spring. Sections rise 24 px again. Reduced motion: every line painted, every chapter lit, no lift. Scroll-linked parallax (judge 2's optional 3c) not built: the home rules forbid parallax. The shared-element pass-to-post move (3a) not built: the pass and the post are on screen together far apart; the chapter-to-line link (3b) is the connected moment. | `HomeCost.jsx`, `HomeTour.jsx`, `HomeTry.jsx`, `motionKit.jsx`, `62-home-story.css` |
| House signatures | The kit `ReliefBand` of Lake Bled's real peaks (Triglav 2,864 m, Grintovec 2,558 m, read from its dossier, heights in the page language) on the band's head: a strip above the title on a phone, beside it after the cut from 768. The blaze on the chosen tour tab and on the best-value Try card. The chapter glyphs are the post's own `CostRow` glyphs. | `HomeCost.jsx`, `HomeTour.jsx`, `HomeTry.jsx`, `62-home-story.css` |
| Each figure once | The chapters lose their amounts (they tell the story in words); the post's bed and food lines lose their "7 at" subs (the formation prints the night and day prices); the formation loses its getting-there wagon (the Flight line prints the fare). | `HomeCost.jsx` |
| Craft | The tour's floating notes hug the phone (104 px, 160 px from 1440) and never grow wider than their side: measured at least 12 px clear of the stage at 1024, 1180, 1280, 1440 in EN and DE. The disc under the ruler thumb steps aside. The plans door sits under the plans title from 1024. | `62-home-story.css`, `HomeTry.jsx`, `61-v6-home.css` |
| Copy | `waitlist.lead` says "planning features" again, six languages. | `src/i18n/*.js` |
| Docs | `references/home.md` "The look" updated for all of the above. | `.claude/skills/carta-design/references/home.md` |
| Clips | Not re-recorded (the account lane has not merged). The recorder issue (Together and My trips froze on one frame: the glide scrolls the window, not the new inner scroll container) and its fix are in `handbook-notes.md`. | |

Checks at `1771c71d1e` plus the docs commit: `npm test` 2,122 tests, 25 fail, the sparse baseline (`fails-run6.txt`); lint 0 errors; design-lint 0 new; token-contrast 0 under; css-routes ok; verify_home 65 PASS; verify_home_g14, verify_language_urls pass; axe home 390/820/1440 0 violations; sweep 360 to 1920 clean in EN and DE. `verify_relief.mjs --pages /` passes but samples before the lazy section has fetched the dossier (about 2 s), so it saw no relief; a direct probe after the fetch counts 6 contour paths and both height tags on the flat-free zone (`r1/relief-1440.png`, `r1/relief-390.png`). Shots: `shots/home-<w>*.png` at 360, 390, 820, 1180, 1440, 1920 retaken; motion frames in `shots/motion/` (band arriving, each line painting, plate settled; tour blaze; Try lift). Undo: `git revert 1771c71d1e` (and the docs commit after it).
