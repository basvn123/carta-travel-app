# T463: The home page, told in the app's own screens

## Task ID

T463

## Date

2026-10-17

## What changed

The owner reviewed the T462 home page and did not like it. In their words: the "demo video" (a looping panel coded to look like the app) was not professional, "Pick what the trip is for" was unclear, the photos were weak, the feature rows were walls of text, and the pricing did not look like the rest of the app. They asked for a story a visitor scrolls through, the real app, personas, sliders instead of text, and a page that is clean on desktop and on an iPhone. They also asked for market research and the full impeccable workflow.

A research agent studied about twenty landing pages, among them Polarsteps, Wanderlog, Komoot, Airbnb's release pages, Tricount, Revolut, Linear and Notion. Impeccable's structure round then put three page structures in front of the owner, and the owner chose "the one closest to what most sites do": one phone stays pinned while chapters scroll past it.

The page is now the trip told in the app's own screens:

1. **The hero.** The promise, the real search, three question chips and the one primary sit beside the same priced Julian Alps trip shown twice: on a laptop with the map, and on a phone with its total.
2. **Five chapters.** Find, Price, Plan, Your days and Share. From 1024 px they scroll past a pinned phone that crossfades to the chapter in view, and a chapter bar follows. On a phone they are a swipe track with Previous and Next.
3. **Six travellers.** Hikers, families at the beach, cyclists, car-free travellers, city breaks and tight budgets, as a photo rail. Each card opens its own search and carries the true cheapest day that search returns ("From ~€60 est. a day"). Cyclists have no route price, so their card names what it opens instead.
4. **The passes.** Shown as the app's own plan cards, the recommended one with a brown edge, then what a pass adds and three plain promises.
5. **The close.** The search again.

Every screen on the page is a real capture of the running app, in all six languages. A new script, `scripts/shoot_home_screens.mjs`, takes them through ordinary links: a search, Lake Bled's page, a shared `#trip=` link and a shared `#day=` link. Nothing on the page is a coded copy of the app.

The old kind tiles, the four feature rows and the looping demo with its pause control are gone. The home page exception in DESIGN.md, carta-design and PRODUCT.md now describes the pinned phone instead of the loop.

## Files touched

**App (continent-app/, its own repository, mirrored in the root):**

Created:
- continent-app/src/browse/home/HomeStory.jsx (the five chapters, the pinned phone, the phone track)
- continent-app/src/browse/home/HomeTravellers.jsx (the six travellers rail)
- continent-app/src/browse/home/Devices.jsx (PhoneFrame, PhoneScreen, BrowserFrame)
- continent-app/src/browse/home/useHome.js (useIdle, useMedia, useReducedMotion)
- continent-app/scripts/shoot_home_screens.mjs
- continent-app/public/home/{en,nl,de,fr,es,it}/{find,place,plan,day,share,trip,desk}.webp (42 captures, about 2 MB in all, about 320 KB a language)

Modified:
- continent-app/src/browse/home/HomePage.jsx (rewritten)
- continent-app/src/lib/homeDemo.js (rewritten: CHAPTERS, PERSONAS, SEARCHES, screenSrc, searchRows, cheapestDay, personaPhotos)
- continent-app/src/styles/61-v6-home.css (rewritten)
- continent-app/src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (the home.* block: 39 keys out, 57 in, the 10 kept keys keep their translations)
- continent-app/tests/home.test.mjs (the demo tests out; chapters, screens, the "from" rule and personas in)
- continent-app/scripts/verify_home.mjs (the demo checks out; screens, chapters, pinned, tabgo, track, who, kind and reduced in)
- continent-app/.impeccable/surfaces/continent-app-src-browse-home.md (the new direction contract)

Deleted:
- continent-app/src/browse/home/HomeDemo.jsx
- continent-app/src/browse/home/useDemoClock.js

**Root:**
- DESIGN.md ("Home page exception": the pinned phone replaces the loop; the device radius)
- PRODUCT.md (the motion line)
- .claude/skills/carta-design/SKILL.md (the exception and the "Also never" line)
- docs/design-v6/OWNERSHIP.md (the home rows name the new files)
- Execution/P11/T463-home-page-2.md (this report), Execution/P11/T463-shots/ (before, after)
- Execution/_OPEN.md

## Commands run

From the repository root unless marked.

```
git -C continent-app checkout -b p11-home-page-2
git checkout -b p11-home-page-2
C:/Users/Gebruiker/.claude/skills/impeccable/scripts/impeccable context --target continent-app/src/browse/home/HomePage.jsx
C:/Users/Gebruiker/.claude/skills/impeccable/scripts/impeccable concept-seed --scope surface --mode persuade      # seed b549801d
C:/Users/Gebruiker/.claude/skills/impeccable/scripts/impeccable serve-question --start --payload <scratchpad>/decision.json
C:/Users/Gebruiker/.claude/skills/impeccable/scripts/impeccable surface-brief write continent-app/src/browse/home <scratchpad>/home-brief.md
# continent-app/: serve, then capture (never npm run dev, whose predev rewrites public/)
npx vite --port 5203 --strictPort
node scripts/shoot_home_screens.mjs --port=5203
node <scratchpad>/i18n-home2.mjs src/i18n           # the home.* swap, BOM and CRLF kept
# continent-app/: gates
npm test
npx eslint src
node scripts/ci/design-lint.mjs
node scripts/ci/token-contrast.mjs
node scripts/ci/banned-terms.mjs
node scripts/check_ownership.mjs ../docs/design-v6/OWNERSHIP.md
C:/Users/Gebruiker/.claude/skills/impeccable/scripts/impeccable detect --json src/browse/home/*.jsx src/styles/61-v6-home.css
node scripts/verify_home.mjs --port=5203 --host=localhost
npx vite build --outDir <scratchpad>/dist --emptyOutDir
```

The scratchpad scripts were not shipped:
- tour.mjs, probe-trip.mjs, probe-day.mjs and probe-share.mjs found the screens.
- shoot-home.mjs and shoot-sections.mjs took the review shots.
- words.mjs measured the page.

## Config and secrets set

None. No environment variable, flag, secret or storage key changed. The captures need the dev server's `?paymock` seam, which exists only in `vite dev` and in builds with VITE_E2E_SEAMS=1. They are made once and committed, and production serves only the WebP files.

## Before/after measurements

| Metric | Before (T462) | After | Delta |
|---|---|---|---|
| impeccable critique (Nielsen, /40), independent finish reviewer | 30 | 35 (33 first round) | +5 |
| impeccable audit (/20) | 16 | 18 (17 first round) | +2 |
| How the app is shown | a coded imitation, looping | real captures of the running app, 7 screens a language | |
| Things on the page that move by themselves | 1 (the loop) | 0 | -1 |
| Personas shown | 0 | 6, each with its own search and real cheapest day | +6 |
| Photographs (persona or kind tiles) | 6 kind tiles plus 7 in the demo | 6 persona photos | |
| Words on the page (en, 390, all visible text) | 536 (T209 page); T462 reported 209 outside its demo | 480 | |
| Page height at 390 x 844 | 2,408 px | 3,920 px | +1,512 px (two swipe rails and the chapter track) |
| Primary above the bottom nav, six languages at 360 and en and de at 390 x 664 | passes, 8 of 8 | passes, 8 of 8 | |
| Entry JS, gzip | 230.32 kB | 228.95 kB | -1.37 kB |
| Entry CSS, gzip | 141.62 kB | 141.03 kB | -0.59 kB |
| First-screen images (en, desktop) | the demo's photos on idle | desk.webp 79 KB and trip.webp 34 KB, eager | +113 KB |
| verify_home | 49 of 49 (old checks) | 44 of 44 (new checks) | |
| Unit tests | 452 of 452 | 453 of 453 (home: 16) | |
| design-lint new, token-contrast under floor, impeccable detect | 0, 0, [] | 0, 0, [] | |

The bundle sizes were measured before the last fix batch, which added about twenty lines. LCP on a throttled phone was not re-measured, so it is an open item (T463-f). The first screen now has two eager images; on a phone only the trip capture is in it.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The dev server answered nothing for minutes | Two Vite servers left over from 2026-10-16 (ports 4250 and 4260) were each spinning a core | Stopped them and restarted one server on 5203 |
| The phone page scrolled 425 px sideways | The story column was a grid item with the default minimum width, so it grew to the full width of its chapter track | `.home-story-grid > * { min-width: 0 }` |
| The French Explore and place captures were blank (2 KB) | They were shot before the page had drawn; the new size test caught it | The capture now waits until prices show and every on-screen image has loaded |
| That wait never ended on the place page | Lazy photos below the fold never finish loading | Only on-screen images count |
| The place capture showed a focus ring on Back | A page opened from a link focuses its first control | Blur focus before every capture |
| The share capture started on a clipped row | The day ends the page, so its kit heading cannot scroll to the top | Anchor 320 px of the day above the kit |
| Desktop full-page shots were distorted | Chapter heights use dvh, which grow with a tall test viewport | Desktop is reviewed section by section at 1440 x 900 |
| Reduced-motion check failed at 1e-05s | The app's global reduced-motion floor writes 0.01 ms | The check reads "under 1 ms" |
| Reviewer: the hero phone repeated chapter 1 | The phone showed Explore, not the trip on the laptop | A new phone capture of the trip (trip.webp) |
| Reviewer: the cyclists card looked like it failed to load | Cycle routes have no honest day price | A solid pill naming what the card opens ("Cycle routes") |
| Reviewer: the pinned phone was too small to read | Its width allowed for the tab bar twice | `min(340px, calc((100dvh - 210px) / 2.2))` |
| Reviewer: the hero on a phone was a busy laptop-and-phone collage | The laptop capture is noise at 0.24x | Below 769 px the hero shows the phone alone, centred |

## What is still open

**The owner's checks (T463-a).** Confirm the six persona photos:
- Hikers: the trail above Zermatt
- Families at the beach: Praia de Benagil
- Cyclists: Col d'Aubisque
- Car-free: the Landwasser Viaduct
- City breaks: Lisbon
- Tight budgets: Kraków

Also confirm the story: the Julian Alps trip, a day at Bled. This replaces T462-a, which is closed.

**Captures go stale (T463-b).** The captures are pictures of the app as it is today. When a captured screen or its prices change, run `node scripts/shoot_home_screens.mjs --port=<dev port>` again; the size test catches a blank one, not an out-of-date one. The figures in them are national estimates and say so (T462-b stays open).

**App copy bugs seen in the captures (T463-c).** They belong to other surfaces, so this task did not fix them:
- the day kit says "1 tips"
- a day leg reads "A long walk.Bus or tram", with a space missing

**Lint error that predates this task (T463-d).** `npx eslint src` reports 1 error, in `src/browse/ExploreMap.jsx:621` (a missing `collectKpins` dependency). This task did not touch that file.

**Reviewer's minor points (T463-e).** None was blocking:
- the chapter bar uses tab semantics for a scroll index
- the half card at the bottom of the plan capture
- whether the promise rows should shrink to one line

**Not re-measured (T463-f).** LCP and CLS on a throttled phone, now that the first screen carries an eager capture.

**Deploy (T463-g).** The deploy is the owner's, as for T462-h, which this supersedes: `npm run build:pages` with VITE_E2E_SEAMS empty, then `npx wrangler pages deploy dist --project-name carta-app --branch main`. The T462 page was never deployed.

**Unchanged from T462.** T462-c (a `cat` parameter so a Destinations kind survives a new tab; the cyclists card hits the same limit), T462-e, T462-f and T462-g. T462-d is closed: the demo it described is gone.

## Rollback procedure

There is no data, schema or storage change.
- **Before merge:** delete branch `p11-home-page-2` in both repositories.
- **After merge:** run `git -C continent-app revert -m 1 <app merge>` and `git revert -m 1 <root merge>`. That restores the T462 page (HomeDemo, useDemoClock, the kind tiles, the home.* strings, the old tests and harness) and the docs' loop wording, and removes public/home/. Routing is unaffected either way.

---

## Notes

**How impeccable was used.**
- **Context:** `context` resolved the app folder and missed the root PRODUCT.md and DESIGN.md (the known nested-repo gap), so both were read directly.
- **Structure choice:** new-work's whole-surface path ran `concept-seed --scope surface` (seed b549801d). I ranked seven grounded structures, and the roll dealt the 7th, 3rd and 1st. I scored the six catalog worlds as declined, because carta-design locks the look; their kept disciplines are in the decision payload.
- **Decision page:** it showed three wireframe cards (no image generation is available, so the build is code-led). The owner answered in chat: "the one closest to what most sites do", which is the pinned-phone chapters.
- **Build and finish:** the surface brief carries the new direction contract. I read the craft floor before the first edit. The detector returned [] on the changed files. A fresh finish reviewer, given screenshots and code, returned "fix" with six material findings. All six were applied in one batch and sent back to the same reviewer for a verdict pass, which scored all six resolved and returned "ship".

**The market research** (a research agent, about twenty pages fetched and measured in a browser) set five choices:
- the real interface as the hero
- one pinned device with verb-named chapters (Polarsteps: Plan, Track, Relive)
- personas as cards (Tricount, Revolut)
- prices stated plainly
- honesty promises instead of social proof

It ruled out three things: a coded imitation (Mindtrip's placeholder chips), tilted 3D phones (Apple's marketing guidelines) and icon-tile feature grids.

**The seven carta-design questions.**
1. There is no hex outside the tokens; design-lint reports 0 new violations.
2. There is no gradient and no colour outside DESIGN.md. The phone bezel is `--text`, a drawing of a device, not a control.
3. Brown appears only on: the one primary, the door links, the selected chapter tab and the recommended plan's edge.
4. No figure is under 12 px. Pill prices are tabular, and every euro goes through formatMoney, formatEst or formatPrice.
5. There is one primary, "Plan a trip". Text on photos is only the solid price pills the exception allows.
6. Every headline has a verb. There is no count or method line, and no dash, middot or banned word in six languages; the verify `copy` check and the unit tests both cover this.
7. Removed: the chapter position label above each title (an eyebrow), the coded demo, the kind tiles and the four feature rows.

**Scope.** These were outside the plan's named files, each for a stated reason:
- the six i18n files (the strings)
- OWNERSHIP.md (its rows name files)
- PRODUCT.md, DESIGN.md and carta-design (the exception they state changed)
