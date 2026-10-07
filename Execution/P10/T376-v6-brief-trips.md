# T376: design brief, Trips (the journeys library and the trip page)

## Task ID

T376 (design wave V1, session 7 of 10, raised by T369).

## Date

2026-10-08

## What changed

The trips surface now has a written brief that waves V3, V4 and V5 build from: `docs/design-v6/briefs/trips.md`. No app code changed. The brief covers three parts: the library (the Trips category of Destinations, ten style cards, a style's list and its filters), the journey page (one written week, 253 of them) and the composed route page (the 2 to 14 day city routes, which the trip planner brief leaves to this surface). It walks the surface as the budget hiker in the research would, at 380 and 1280 px, cold and returning, through a hiking, a cycling, a city and a beach week; inventories every view, state, control and visual setting (about 75 control types, each with the file that draws it and a verdict); critiques it with impeccable's dual-agent method (18 of 40 on Nielsen's heuristics, 13 of 20 on the technical audit); says what the traveller needs first, second and third; plans three numbered build lists (12 items for V3, 7 for V4, 7 for V5) with files, command and done-check each; ends with a target-state table of every control; and proposes ten rules carta-design does not cover yet (R1 to R10) for T380.

The finding that drives the plan: the page's price is not the trip's price. Wherever a priced catalogue town is near, the cost fold shows the first-run receipt for that town (2 people, Entire place, Carta's default November dates, nights equal to days). On the Stubai hut circuit that reads about €712 each for an apartment in Innsbruck, beside a strip of €850 to €1,200 a person and huts priced at €90 to €160 a night. Because that branch replaces the authored budget, the cost bar and the Lifestyle slider, both built to the T362 rules, did not render on any of the four weeks walked, and the receipt's own Stay select became a second lifestyle control. The plan puts the trip's own receipt first and makes the town receipt a labelled second view for one-base weeks only.

Three more findings shape the plan. The phone's first screen holds neither a trip nor a price: the first card of a style list starts at 804 px under stacked filter buttons, and on the page the price strip starts at 900 px (907 px at 1280). A journey has no address, save or share, so a reload, a back press or Escape loses the week. And the page's generated summaries contradict its authored text ("One base all week" on a hut circuit, "Fallback for 0 of 7", 307 pack cells named "Day pack").

The mode is Operate, with Read inside it for the authored prose. Impeccable's question rounds were answered from the research and PRODUCT.md, as the owner instructed for this unattended run, and every choice kept Carta's palette, type and identity: no new colour, no gradient, no text on a photograph, no second Lifestyle control, no flight figure of Carta's. Where impeccable would have asked who the page is for, the brief takes the launch audience (the hiker, one holiday). Where it would have asked what to fix first, it takes the severity order of the critique. Where it would have asked about scope, it covers all three parts, because the planner brief handed the composed page to this surface.

How the critique ran. Assessment A (design review) and Assessment B (detector and lint) ran as two isolated sub-agents and met only in the brief. A read the source and the scratch screenshots without a browser, so the laptop kept to one browser at a time. B ran `impeccable detect` and the design lint read-only.

## Files touched

**Created:**
- docs/design-v6/briefs/trips.md
- Execution/P10/T376-v6-brief-trips.md

**Modified:**
- Execution/_OPEN.md (rows T376-a to T376-i appended)

Outside both repos, never committed: eight before screenshots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\trips\` (V1-styles-380, V1-list-380, V1-page-380, V1-days-380, V1-decks-380, V1-styles-1280, V1-page-1280, V1-receipt-1280; JPEG quality 80, viewport only). The rest of the walk's screenshots, the walk script and its JSON output sit in the session scratchpad.

## Commands run

From the root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T376` (branch `p10-v6-brief-trips`):

```
sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target src/browse/JourneyPage.jsx
```

The shared dev server on 5199 did not answer for most of the session, so a private one was started from the app repo of the main checkout, as the session notes allow, and stopped afterwards:

```
npx vite --port 5207 --strictPort
node <scratchpad>/walk/walk.mjs 380 cold                        # BASE http://localhost:5207/
BASE=http://localhost:5199/ node <scratchpad>/walk/walk.mjs 1280 cold
BASE=http://localhost:5199/ node <scratchpad>/walk/walk.mjs 380 returning
```

Assessment B, from the app repo of the main checkout, read-only:

```
sh ".../impeccable" detect --json src/browse/JourneysSection.jsx src/browse/JourneyPage.jsx src/browse/TripPage.jsx src/browse/TripPractical.jsx src/browse/TripDayPhotos.jsx src/browse/DayTrack.jsx src/browse/FlashDeck.jsx src/browse/PackGrid.jsx src/browse/WeekPlan.jsx src/browse/BookingOrder.jsx src/browse/CostBar.jsx src/browse/LifestyleSlider.jsx src/browse/SectionRail.jsx src/browse/TripFilters.jsx src/browse/LengthPicker.jsx src/browse/JourneyRoute.jsx src/components/NotFor.jsx src/components/PackIcons.jsx
sh ".../impeccable" detect --json src/styles/25-feature-pages.css src/styles/32-day-carousel.css src/styles/33-flashcards.css src/styles/34-section-rail.css src/styles/35-lifestyle-slider.css src/styles/36-cost-bar.css src/styles/43-trip-length.css
node scripts/ci/design-lint.mjs
```

Harness and a read-only count over the wire, the harness from a scratch working directory:

```
node <app scripts>/verify_pack_grid.mjs
node --input-type=module -e "<packCells over public/journeys/journey/*.json, counting 'Day pack' labels>"
```

Then one commit for the brief (the plan), and this report with the register rows in a second commit.

## Config and secrets set

None.

## Before/after measurements

This task builds nothing, so these are the "before" figures the build waves measure against. Walk figures come from the scratch walk JSON; wire figures from `public/journeys`.

| Metric | Before (V1) | Target in the brief |
|---|---|---|
| Price figures on the journey page's first screen, 380 and 1280 | 0 and 0 (only the "€€" chip) | the strip's range a person |
| Strip (price) top on the page, 380 / 1280 | 900 px / 907 px (hiking week) | 560 px or less / under 800 px |
| First trip card top in a style list at 380 x 800 | 804 px (594 px before the cost row loads) | 360 px or less |
| Euro figures on the style grid's first screen | 0 | every style card priced |
| Sections on the journey page / on the rail | 18 / 6 | 7 groups / 7 |
| Journey page length at 380 | 5,473 to 6,492 px | not set; fewer sections |
| Weeks walked where the cost bar and Lifestyle slider render | 0 of 4 | 4 of 4 |
| Journey address, save, share | none | `#journey=<id>`, star, share |
| Pack cells named "Day pack" | 307 of 4,048, repeated in 42 of 253 trips | 0 repeats within a trip |
| Derived pack cells | 3,333 of 4,048 | written items first |
| Nielsen heuristics (Assessment A) | 18/40 | not scored until V6 |
| Technical audit | 13/20 | not scored until V6 |
| Cognitive load checklist failures | 6 of 8 | not scored until V6 |
| Detector findings, 18 markup files | 0 | 0 |
| Detector findings, 7 surface stylesheets | 1 (side-tab, 25-feature-pages.css 4081, real, low) | 0 |
| Design lint | 213 violations, all baseline, 0 new | 0 new |
| verify_pack_grid | pass (253 trips, 0 bad) | pass, plus distinct labels |
| verify_journeys, verify_trip_page, verify_trips | not run (need a preview build) | all pass on a preview build |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The shared dev server on 5199 did not answer for most of the session | The laptop had about 650 MB free while several sessions and a separate `npm run dev` server ran | Started a private Vite on 5207 from the main checkout for the phone walk, stopped it, ran the desktop and returning walks on 5199 once it answered again |
| The first desktop walk stopped on a style list showing "…" | The type file took over 60 s on the loaded server, and the list has no catch on that fetch | Longer waits in the walk; the missing catch is a finding (row T376-g) |
| The returning walk showed the whole week after the short version was chosen | The walk pressed "Clear filters" after a cost band, and that also resets the length | Not a walk bug: recorded as a finding (row T376-g) |
| impeccable context reported targetExists false | The sparse root worktree holds no app tree | Read the app files from the main checkout; PRODUCT.md and DESIGN.md loaded from the worktree as intended |

## What is still open

The ten rules in part 7 of the brief need T380's decision before V3 builds the items marked with a rule (T376-a). The cost fold's town receipt against the trip's own budget is the first thing V3 must fix (T376-b). A car-free filter on the list needs the car flag on the card wire, which means a change in `pipeline/journeys/build_wire.py` shipped with the journeys wire rebuild the owner already holds as T085-a (T376-c). A compare of two or three weeks has no rule and no component, so it is left for its own task after V5 (T376-d). Giving a journey an address, a star and a share crosses the shell, Destinations and the account surface, so V2's ownership map has to grant it (T376-e). The pack grid's "Day pack" names and English-only labels are a fix for V3 (T376-f). Three bugs exist today and are listed for the V3 build: fetches with no catch, a paragraph nested in a paragraph, and Clear filters resetting the length (T376-g). The three browser harnesses need a preview-build baseline, and the composed route page a walk at both widths, before the V3 build (T376-h). Two strings need rewording: the composed door's "priced from your airport" and the level-one difficulty word, which is on the banned list (T376-i).

Known items owned elsewhere were not raised again: the comma ranges in stay prices and the shared hero photographs wait on the journeys wire rebuild (T085-a, T091-a), and the week track and GPX wait on T177-b (T206-f, T176-a).

No i18n string was written, so no native-review row is raised here. The V3 items that add strings will raise their own.

The seven carta-design questions apply to a build wave; this task changed no visual. For the brief itself: it proposes no hex and no new colour (1, 2); it moves ochre off the day number and terracotta off the fold icons, links, location pin and elevation shapes (3); it moves the day-stat words, booking count and filter labels out of mono (4); one primary per view is kept (Set your dates on the journey page, Choose this trip on the composed page) (5); the brief is free of em dashes and the banned words (6); and the things removed are the four head chips that repeat the strip and the composed door's icon tile (7).

## Rollback procedure

Docs only. On the branch, `git revert` the two T376 commits (the brief, then the report with the register rows), or before merge delete the branch `p10-v6-brief-trips`. The screenshots outside the repos can be deleted from `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\trips\`; nothing reads them but the release pairing.
