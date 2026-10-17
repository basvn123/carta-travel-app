# T462 critique: the home page BEFORE the rebuild

Method: single reviewer, Persuade mode (a home page for first-time visitors). Assessment A (design review) was written from the source, the screenshots and two full-page captures before the detector output was read; Assessment B (detector, live URL scans, browser probe) was run afterwards and is reported separately. No project file was edited.

Target: `continent-app/src/browse/LandingPage.jsx`, styled by `continent-app/src/styles/39-landing.css` and `continent-app/src/styles/61-v6-landing.css` (the receipt card itself is `ReceiptCard.jsx`, styled in `38-first-run.css`, out of scope here).

Evidence:
- `Execution/P11/T462-shots/before/` (en-360, en-390, en-768, en-1024, en-1440, de-360, de-1440, each with a fold shot) and `probe.json`.
- Two full-page captures taken for this review with Playwright from the dev server at http://localhost:5202/ with no `continent.homeSeen.v1` seeded: 390 x 844 (scroll container `.lp-page` is 2,779 px tall, 3.3 phone screens) and 1440 x 900 (1,780 px tall). Saved outside the repo in the session scratchpad (`critique-before/full-390.png`, `full-1440.png`, `measure.json`).
- Probe figures (en): 536 words in the probe, 613 visible words in the `.lp-page` text with the coverage table loaded, 93 numerals, 22 catalogue counts, 0 images, 1 `h1`, 1 primary, no horizontal overflow at 360, no small targets, 0 console errors.

## Verdict in one paragraph

The current home page is an honest, carefully built instrument that answers a question no first-time visitor has asked yet. It proves one thing (a receipt for one town reprices in place) with great rigour and says nothing about the other eight things the owner wants a visitor to grasp in seconds: explore and search places, beaches, lakes, summits, trails and cycling, the trip planner, the day planner, sharing with friends and export. It has no photograph at all, while DESIGN.md gives the home page the large photo tiles "where inspiration leads". Below the receipt it turns into the method appendix the owner removed from every other page on 2026-10-13 (T438): a catalogue count in the `h1`, an instrument line of coverage counts, "Three reasons to trust a figure", a coverage table of pipeline figures ("Published", "Listed", "Regions with none") and provenance sentences under each line. It is category specific (no other product would ship this page) but specific in the wrong register: a spreadsheet where the brief asks for a travel app.

## Design specificity

LLM assessment: highly product specific, not templated; nothing here is a generic SaaS hero. But the specificity is the old "instrument" world (timetable, receipt, survey table) that PRODUCT.md's visual commitment of T419 moved away from ("photography leads, the feel is warm and inviting"). The page is the last surface still speaking the pre-Lagoon voice: it reads as a proof, not as an invitation. The single biggest missed opportunity is the product's range: Carta has trail, beach, lake, summit and cycle pages with photos, a trip planner, a day planner, sharing and PDF, KML and ICS export, and the home page shows none of them.

## Nielsen heuristics (critique)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Figures settle in place when an input changes and a receipt-shaped still block holds the space while loading. The selected town's sub-label is invisible (white on the light tint), so part of the selection state is lost. |
| 2 | Match between system and real world | 2 | Pipeline language leaks to a first visitor: "National figures", "Bed measured", "national basket", "Catalogue of 7 Jun 2026", "Published", "Listed", "Regions with none", "Tap a segment for its figure". |
| 3 | User control and freedom | 3 | Every input is a select, nothing traps. Playing with People, Nights or Stay silently rewrites the app-wide choices (FirstRunContext), which a visitor cannot know. |
| 4 | Consistency and standards | 2 | The only screen with no photograph and no tile; hand-rolled toggles and 6 px corners where the kit has Chip and Segmented on 10 px; navigation rows are buttons, not links; "national" after a figure, which T438 removed everywhere else. |
| 5 | Error prevention | 3 | Selects with bounded options, tiers not measured in a town are labelled in the option, a no-demo sentence stands in when no town prices. |
| 6 | Recognition rather than recall | 2 | The product's features are not visible from the home page; a visitor has to find the trip planner, day planner, beaches or cycling through the header or bottom nav labels alone. |
| 7 | Flexibility and efficiency | 2 | One door only ("Find a town to walk from"); no search, no way in for a beach, city or cycling visitor. (Could be n/a in Persuade mode; scored because the brief asks for search.) |
| 8 | Aesthetic and minimalist design | 1 | 613 words, 93 numerals, 22 counts, four lines of fine print under the primary, the receipt's lines repeated a second time in the proof section, a five-row coverage table. 3.3 phone screens of text and figures, no image. |
| 9 | Error recovery | 2 | Coverage failure silently drops the table; a broken catalogue gets one sentence; acceptable but nothing to recover from on this page. |
| 10 | Help and documentation | 2 | "See where every number comes from" at the very bottom and the dates note; no path that explains what the app does. (Could be n/a in Persuade mode.) |
| **Total** | | **22/40** | **Acceptable (low).** With 7 and 10 scored n/a as Persuade mode allows: 18/32, 56 percent, also Acceptable. |

### Cognitive load

Checklist failures: single focus (fails: receipt, town switch, three selects, primary, four notes, priced list all in the first column), chunking (fails: the hero holds 11 interactive or reading units), visual hierarchy (passes on desktop, the `h1` and the total lead), one thing at a time (fails), minimal choices (fails at the hero: 3 towns, 3 selects, Open town, the primary, 5 priced rows = 13 options), working memory (passes), progressive disclosure (fails: method and coverage detail are shown, not disclosed). 5 of 8 failed: high cognitive load.

### Emotional journey

The peak comes too early and is a large bill: the first figure a budget traveller sees is `~€2,556.58` and `~€182.61 a person a day` for an entire place in Edinburgh for seven nights. The page then flattens into fine print and ends on a coverage table and a footnote link, so the end of the peak-end pair is the dullest moment. There is no reassuring, inviting moment (a place, a photo, a cheap good week) anywhere.

## Audit (technical, /20)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | The selected town's sub-label is white (`--on-fill`) on `--select-bg` `#f6e7d3`, about 1.2:1, measured in the browser (`rgb(255,255,255)` on `rgb(246,231,211)`). Walk rows navigate but are `<button>`, not `<a href>`; their accessible name reads "~€35.61 est. estimated, not a live quote national". Headings, landmarks, labels on selects, focus rings and 44 px targets are otherwise good. |
| 2 | Performance | 3 | No images to load (a strength here, a problem elsewhere); coverage.json is read only when its section nears the viewport. The page sits in its own absolute scroll container, so browser scroll restoration and full-page capture do not work on it. |
| 3 | Responsive design | 3 | No horizontal scroll at 360, targets at least 44 px, strip cells are whole-cell targets. In German at 360 the primary falls below the bottom nav (`primaryAboveNav: false` in probe.json); at 390 the priced list starts at y 896, under the fold. |
| 4 | Theming | 2 | No hex and no gradient, but the files still read legacy aliases (`--paper`, `--ink`, `--ink-soft`, `--rule`, `--accent`, `--bg-card`, `--on-fill`, `--display`, `--mono`), px font sizes (28, 40, 22, 26, 16, 15, 14, 13, 12 px), 6 px corners on controls where `--radius-control` is 10 px, an `h1` at weight 600 where `--text-display` is 700, and a literal 340 px still block. |
| 5 | Implementation integrity | 1 | The page contradicts three standing owner rules at once (no catalogue counts, no method sentences, home page uses photo tiles), duplicates receipt lines in the proof section, and hand-rolls a toggle row and a link list instead of the kit's Chip, Card and link. |
| **Total** | | **11/20** | **Acceptable (low): significant work needed.** |

### Audit issues by severity

P0
- **[P0] The page does not tell a visitor what Carta does.** Location: whole `LandingPage.jsx`. Category: Implementation integrity. Of the nine capabilities in the owner's brief (explore and search, beaches, lakes, mountains, trails, cycling, real day costs, trip planner, day planner, sharing, export) only day costs is shown; walks appear as a list; beaches, lakes, summits and cycling appear only as row labels of a coverage table; the trip planner, day planner, sharing and export are absent. Against the brief this blocks the page's one job. Command: $impeccable shape, then $impeccable layout.

P1
- **[P1] Catalogue counts and method furniture.** `h1` "in 3,868 places" (line 320), the instrument line (414 to 419), the coverage section and table (466 to 516), stay provenance "Bed price from 3,768 stays in Edinburgh, captured June 2026" and "national basket, est." inside the receipt, the word "national" after each priced row (442). Violates PRODUCT.md "Say less", DESIGN.md Don'ts and the brief ("no catalogue counts, no filler text"). Command: $impeccable distill.
- **[P1] No photography.** 0 `<img>` on the page. DESIGN.md: "Sections (rails) and the home page use large photo tiles, where inspiration leads." Command: $impeccable bolder (via the kit's tile Card).
- **[P1] Invisible selected sub-label.** `61-v6-landing.css` line 60, `.lp-town[aria-pressed="true"] .lp-town-meta { color: var(--on-fill); }`, a leftover from the dark-fill selection retired in T422. About 1.2:1, WCAG 1.4.3 fail; visible in every screenshot ("Bed measured" under Edinburgh is unreadable). Command: $impeccable harden.
- **[P1] Wall of text.** 613 words and 93 numerals; under the primary four notes of fine print; the proof section re-renders three receipt lines the visitor just read; the page is 2,779 px tall at 390. Command: $impeccable distill.
- **[P1] The first figure is aimed at the wrong traveller.** Default stay tier "Entire place" for a party of two for seven nights in Edinburgh gives `~€182.61 a person a day` as the headline promise of a budget app; the cheap list (`~€35.61`) is below the fold on a phone and every one of its five rows is a national estimate. Command: $impeccable clarify.

P2
- **[P2] Navigation as buttons.** Walk rows and "Open Edinburgh" change the view but are `<button>` with `onClick`, not `<a href>` (carta-design "Navigation"). Command: $impeccable harden.
- **[P2] Garbled accessible names on priced rows.** The visible "est." plus the screen-reader-only "estimated, not a live quote" plus "national" read as one run-on name. Command: $impeccable clarify.
- **[P2] German phone fold.** At 360 in German the primary sits under the bottom nav. Command: $impeccable adapt.
- **[P2] Kit drift.** `.lp-town` is a hand-rolled toggle (kit: Chip choice in a ChipGroup with arrow keys and a tick); `.lp-walk-row` is a hand-rolled list (kit: Card row with photo); 6 px radius on toggles and strip; `h1` weight 600; `.mono` class and `--mono` font on figures (retired face, alias only). Command: $impeccable polish.
- **[P2] Hidden global side effect.** Changing the demo inputs writes `group_size`, `stay_tier` and the trip dates app-wide with no word to the visitor. Command: $impeccable clarify.

P3
- **[P3] Legacy aliases and px sizes throughout both CSS files.** Command: $impeccable polish.
- **[P3] Estimate word at 11 px inside the receipt.** At the micro floor, legal, but it is the mark that carries trust and sits beside a 40 px total. Command: $impeccable typeset.
- **[P3] Absolute scroll container.** `.lp-page` scrolls inside itself (`position: absolute; overflow-y: auto`), so the document never scrolls: scroll restoration, full-page screenshots and some assistive scroll features see a one-screen page. Command: $impeccable adapt.

### Positive findings

- One `h1`, headings in order, labelled groups, a real `<table>` with caption and scoped headers, bars hidden from screen readers with the figure in words beside them.
- Whole-cell touch targets on the strip, no horizontal scroll at 360 in either language, focus rings on every control, reduced-motion branches on every transition.
- Honest figures: the tilde and "est." are always in text, the receipt agrees to the cent with the destination page, coverage.json loads lazily.
- One primary, placed in the content and in the thumb zone on a phone.

## Personas

**First-time budget traveller on a phone (390 x 844, a student with €40 a day in mind).** Lands on "What a day costs, per person, in 3,868 places": the number means nothing to them and the sentence names no place, no activity and no Europe. Three grey boxes (Edinburgh, Chamonix, Porto) with sub-labels "Bed measured", "National figures", "All measured", the first of which they cannot read. Three selects they did not ask for. Then the first price they see is `~€2,556.58` and `~€182.61 a person a day`: Carta looks expensive in its first two seconds. The one button says "Find a town to walk from"; they wanted a cheap city break or a beach, so there is no door for them. Scrolling, they get four lines of fine print, then the cheap list they would have loved (`~€35.61`) but each row says "est. national", then "Three reasons to trust a figure", then a coverage table. No photo anywhere, so nothing makes them want to go. They never learn that a trip planner, a day planner or sharing with friends exists. Likely to leave after one screen.

**Hiker on desktop (1440 x 900, planning a walking weekend).** The primary speaks to them, and the right-hand list "Where a walking day costs least" is the best moment on the page. But the five rows are a name, a country and a price: no photo, no trail, no distance, no climb, and all five are national estimates, which undercuts the trust argument the page spends its lower half making. They cannot see that Carta has 17,000 walks with pages, elevation profiles, a 3D terrain map, a day planner that builds the walking day, or GPX, KML, PDF and ICS export; the only mention of walks below is "Walks 17,554 / 51 / 684 of 2,077" in a pipeline table. A receipt for a week in an Edinburgh flat is irrelevant to them. They will click the primary, which is fine, but they arrive in Destinations without having understood why Carta is better than Komoot plus a booking site, which is the positioning PRODUCT.md wants said.

## Owner brief check (2026-10-17)

| Brief asks | Current page |
|---|---|
| Understood within seconds: plans any trip in Europe | No. The `h1` is a count and a cost claim; "Europe", "trip" and "plan" do not appear above the fold. |
| Explore and search places | No search, Explore not named. |
| Beaches, lakes, mountains, trails, cycling | Walks only, as a price list; the rest only as coverage table rows. |
| Real day costs | Yes, strongly, through the live receipt. |
| Trip planner, day planner | Absent (the day planner is named once inside a proof paragraph). |
| Sharing with friends, export | Absent. |
| Dynamic | Partly: the receipt reprices in place; nothing else moves or changes (no season, no rails, no photos). |
| Clean, compact | No: 3.3 phone screens, 613 words, duplicated lines. |
| Human | No: pipeline vocabulary and an instrument voice. |
| No catalogue counts | Fails: 22 counts, one in the `h1`. |
| No filler text | Fails: four fine-print notes, three proof paragraphs, coverage prose, a method link. |

Score against the brief: 1.5 of 9 capabilities shown, 0 of 4 tone goals met.

## Detector findings (Assessment B)

Source scan, as instructed, from the repo root:
`impeccable detect --json continent-app/src/browse/LandingPage.jsx continent-app/src/styles/39-landing.css continent-app/src/styles/61-v6-landing.css`
Result: `[]`, exit 0. Repeated with `--no-config` (no DESIGN.md context, no ignores): `[]`, exit 0. The source is clean of the detector's pattern rules (no gradient, no hex, no glass, no bounce, no em dash). Every problem in this report is semantic or visual (scope, counts, missing photography, a contrast pair built from two valid tokens), which the static rules cannot see; the detector and the review do not overlap here, they do not conflict.

Live URL scans (`detect --json --viewport 390x844` and `--viewport 1440x900` on http://localhost:5202/, first visit so the home page shows): exit 2, 5 warnings, the same at both widths.
- `clipped-overflow-container` x2 (`div` and `div.app` clip a positioned child): app shell, not this page. False positive for the landing surface, real but out of scope.
- `tiny-text` x2 (11 px): verified in the browser. The 11 px text is the bottom nav labels (shell) and, inside the page, the receipt's "est." word and its screen-reader-only twin. The bottom nav is out of scope; "est." at 11 px is at the micro floor and is logged above as P3.
- `layout-transition` (`transition: height`): no element in the rendered landing page carries a height transition at rest (checked every element); it comes from a shell or hidden tab component. Out of scope for this page.

Browser overlay injection was not attempted (no browser tool with mutable injection in this session); the URL scans above stand in for it.

## Top 8 problems, in priority order

1. **[P0] It shows one feature of nine.** A visitor cannot tell that Carta plans any trip in Europe: no explore or search, no beaches, lakes, summits or cycling, no trip planner, no day planner, no sharing, no export. The receipt demo stands in for the whole product.
2. **[P1] Catalogue counts and method text are the page's furniture.** "3,868 places" in the `h1`, the instrument line of coverage counts, the provenance sentences, "national" after figures, "Three reasons to trust a figure" and the coverage table with its pipeline columns. All against T438 and the brief.
3. **[P1] No photography at all.** Zero images on the one surface DESIGN.md reserves for large photo tiles; the page cannot inspire, and it looks unlike every other Lagoon screen.
4. **[P1] Too long and too dense.** 613 words, 93 numerals, 2,779 px at 390 (3.3 screens), four fine-print notes under the primary, three receipt lines shown twice. Not compact, not clean.
5. **[P1] The first price misaims the audience.** A budget app opens on `~€182.61 a person a day` for an entire place in Edinburgh; the cheap list sits below the phone fold and is all national estimates.
6. **[P1] The selected town's sub-label is unreadable.** White on the light brown tint, about 1.2:1 (`61-v6-landing.css` line 60), a leftover of the retired dark selection.
7. **[P2] It speaks pipeline, not people.** "Bed measured", "National figures", "national basket", "Catalogue of 7 Jun 2026", "Published", "Listed", "Regions with none", "Tap a segment for its figure"; one door only, for hikers; nothing dynamic beyond the receipt.
8. **[P2] It drifts from the kit and the navigation rules.** Hand-rolled toggles and rows instead of Chip and Card, 6 px corners, px font sizes, legacy aliases and the retired mono face, navigation as `<button>` instead of `<a href>`, run-on accessible names on priced rows, and the German phone fold pushing the primary under the nav.

## Scores, for the after comparison

- Nielsen (critique): **22/40** (18/32 with 7 and 10 n/a)
- Audit: **11/20** (A11y 2, Performance 3, Responsive 3, Theming 2, Integrity 1)
- Detector, source: 0 findings. Detector, live URL: 5 warnings, all shell level or at the floor.
- Page measures (en, 390): 613 words, 93 numerals, 22 counts, 0 images, 2,779 px tall, 1 primary, 1 `h1`.
- Brief coverage: 1.5 of 9 capabilities, 0 of 4 tone goals.
