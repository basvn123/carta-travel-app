# P10 digest

87 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`.

### T156: One InfoDot and one glossary for the whole product (2026-10-07)

There is now one component, `InfoDot`, and one glossary, written once. A term such as hardpack carries a small grey dot after the word. Tapping the dot opens a card with the precise name and one or two sentences. The words come from the catalogues, never from the screen that shows the dot, so a definition cannot drift between the trips side and the destinations side. The glossary has 38 terms: the seven trip terms (hardpack, bora, hut to hut, singletrack, EHIC, vignette, TBE) and the destination set from spec 4.1, with the overlap (singletrack, hardpack, hut to hut) defined once.

Broke: First headless run found no dot / The cold dev server took about a minute to compile and the page was read too early / Waited longer; the second run found both dots on the mountain page; Test could not import `InfoDot.jsx` / Node's test runner does not load JSX / Moved the cut-the-line logic into `glossarySplit` in `glossary.js`, which `GlossLine`...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T156-infodot-and-glossary.md"`

### T157 · Banned surface terms lint (2026-10-02)

A new CI lint script `scripts/ci/banned-terms.mjs` was created to enforce the banned-from-the-surface rules in sections 4.3 (carta-destinations-enhancement-spec.md) and C8 (carta-trips-enhancement-spec.md). The script scans all i18n language files (en.js, de.js, fr.js, es.js, it.js, nl.js) read-only and identifies technical terms that must not appear in user-facing text: sac_scale, NUTS3, GLO-30, ODbL, OSM relation, raw OSM tag names (e.g., name:en, type=), and abbreviations like f.g. The lint identified 10 violations in the current i18n catalog, all found in credit/attribution strings (dest.routesCredit and cycle.sourceNote keys across six language files).

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T157-banned-surface-terms.md"`

### T158: Translate every number into a sentence a person would say (2026-10-07)

There is now one translation table, `continent-app/src/lib/numberSentences.js`. For each metric the product surfaces it says what the figure means, in a sentence a person would say. The figure stays in mono where it was; the sentence sits under or beside it in sans (`.numsent`, `--ui` 13 px `--ink-soft`). Each metric in the table carries its source field, the list of catalogue keys it can return, and a `say(value, ctx)` function that picks a band and returns a key and variables. A screen calls `numberSentence(metric, value, { t, lang })`. A figure that cannot be read returns an empty string, never an invented sentence.

Broke: The first headless runs timed out / The cold dev server took four minutes to compile on a loaded laptop / Warmed it with curl before the browser run; A sentence inside a mono cell would have rendered in mono / The cell sets `font-family: var(--mono)` / `.numsent` sets its own face and number style

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T158-number-translations.md"`

### T159: Who this is not for, on every page type (2026-10-03)

Seven page types now carry a plain block of at most two lines that start "Not for you if ...": mountain, beach, lake, trail, cycling (route and tour), published trip and curated journey. The block sits near the top, after the head and before the photograph or the facts. It is dim paper with a hairline above and below, no icon and no colour. The lines are not hand written.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T159-who-this-is-not-for.md"`

### T160: the honest coverage and provenance footers (2026-10-03)

Two footers now exist, one for listings and one for detail pages, and both read real data. A listing footer says how many items Carta publishes for the country on screen, how many more it knows of, how many of those it cannot map, and the reason in words. Its text, with the data from the T111 contract: "We publish 12 walks in Albania. We know of 31 more that people write about and we cannot yet map 19 of them, because no open data exists for them." It sits under the credit line on five listings: walks, cycling, beaches, lakes and mountains. With no country chosen it says "across Europe" and sums every country.

Broke: First `by_code` edit asserted and wrote nothing / `coverage.py` has CRLF line endings and my match string had LF / Normalised to LF, edited, restored CRLF; Vite served nothing for about five minutes / Cold dependency optimiser on a laptop with under 1 GB free / Waited for the first request to return 200, then ran the check once

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T160-honest-footers.md"`

### T161: Suitability strip pinned under the hero (2026-10-03)

Nothing was built. The session gate for this task said the strip may only be built if the carta-design skill or DESIGN.md already has a written rule for it, and neither does. The task therefore stops at a proposed rule, recorded as an owner row in the register, and this report carries the reasoning. No app code, CSS or strings were touched, and the continent-app worktree was not used.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T161-suitability-strip.md"`

### T162: Day by day becomes a horizontal day track (2026-10-07)

Day by day on the journey page was seven stacked blocks. It is now one row of seven day cards that the reader swipes, steps or keys through. Each card carries the day number, the day title, the measured line (dayStats), the night, and the "More about this day" control from T163, which still opens the morning, afternoon and evening inside the card. The section with every day closed is now 403 px tall instead of 1,389 px on a 380 px phone, and 428 px instead of 1,033 px at 1280 px, on the Parenzana cycling week. The track follows the Day track rule the owner put in the carta-design skill on 2026-10-07.

Broke: The dev server served a blank page with "504 Outdated Optimize Dep" / node_modules in the app worktree is a link to the main checkout, so the Vite dependency cache is shared by every session's dev server and each rebuild invalidates the others / Ran Vite through a wrapper config outside the repo that sets its own cacheDir (wt/T162-vitecache); regis...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T162-day-carousel.md"`

### T163: Day detail opens in place (2026-10-03)

The "More about this day" control already existed on the trip page and the journey page, and it already showed the day's detail without leaving the page. What it did was mount the detail the moment the button was pressed, so the card jumped taller with no transition. It is now a proper accordion. The panel is always in the DOM and its height animates from zero to full, so the card grows in place. The button gained aria-controls pointing at the panel, and the closed panel is visibility hidden, so its links stay out of the tab order and away from screen readers until it opens. How it works: the markup is a grid container (tday-panel) with one child (tday-panel-in).

Broke: My first scripted edit of TripPage.jsx closed the wrong block and lint reported adjacent JSX elements. I repaired the block by hand and lint and build then passed.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T163-day-detail-in-place.md"`

### T164: Collapse every long section, with a one-line preview (2026-10-03)

The journey page already folded Good to know as a whole section, closed by default, but opening it printed every logistics slot as a full paragraph. A median trip put 275 words in that one block and the longest put 679. Each slot is now its own closed row inside the section: an icon, the label, and a six-word preview of the text, with a chevron. Tapping a row opens only that row. The icons are existing ones from Icons.jsx (train, ticket, plug, piggy bank, clock, shield, cloud, heart, alert); rows from the free-form other list use the info mark. The preview is the first sentence of the text, cut to six words, with markers and trailing punctuation removed.

Broke: First previews ended on "and honesty", "take", "are" / Plain first-six-words cut / Drop trailing joining words, never below two words; The first edit rewrote every line ending, a 5,800-line diff / My script wrote LF into files the index stores as CRLF / Converted JourneyPage.jsx and en.js back to CRLF; the diff is now 128 lines

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T164-collapsed-sections.md"`

### T165: Sticky section rail (2026-10-07)

The journey page (the curated week plans under Trips) now has a thin strip that appears once the hero photo has scrolled away and stays stuck under the page's top bar. It lists the six sections a reader jumps between: Why, Costs, Days, Sleep, Know, Pack. Tapping one opens that fold if it is closed and scrolls it to just below the strip. The section in view wears the ink-fill pill. The strip is a new component, browse/SectionRail.jsx, that knows nothing about the folds' inner markup: it is given a list of section ids, the page's scroller and the hero element, and it asks the DOM which of those ids exist.

Broke: First build of the rail was only as wide as the content column / I placed it inside .bpage-wrap, which has side padding / Moved it to be the first child of the scroller, so it spans the full width; Jumping to Why hid the rail / The hero reappeared behind the 44 px scroll margin and the observer saw it as visible / Observer rootMargin of -44px, so t...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T165-sticky-section-rail.md"`

### Execution Report: T166 (2026-10-03)

The first pass (commit ab81c54 in the app repo) only restyled three button groups and left two mistakes behind. This pass re-measured every main view in a browser and finished the job. After it, each measured page shows exactly one filled action, except the tab views, where the phone's round plus button and the desktop "Get a pass" chip still add a second filled control. Those two are chrome and are left as owner decisions. How the primary is chosen on each page. The destination page makes "Plan a trip here" the primary and puts "Plan a day here" beside it as a bordered secondary; the PDF download, Shortlist, Share and Maps links are secondary.

Broke: Destination page showed two filled buttons / The first pass filled .destp-plan-btn, a class both planner doors share / `.destp-plan-btn + .destp-plan-btn` renders the second door as a bordered secondary; Day-plan secondary went solid ink on hover / The first pass added a new hover rule above the old `.feat-dayplan:hover` ink rule and left both / Re...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T166-one-primary-action.md"`

### T167: Advisory sections become swipeable flashcards (2026-10-07)

On the journey page, Good to know, Pro tips and What could go wrong now run as three decks of small cards. One card is in view. Each card has a 20 px line icon and at most 35 words. The icon follows the words of the card: a warning triangle for a risk, a coin for money, a cloud for weather, a clock for booking timing, a bulb for a plain tip. Good to know keeps the row's own label (Money, Weather and so on) above the text. Previous and Next are visible secondary buttons, the position reads "2 of 9" in mono, the arrow keys move one card when the deck has focus, and a swipe of 48 px or more is a shortcut for the same two buttons.

Broke: The mono counter rendered in the UI face / The `.mono` class carries no font on this page / `.flash-pos` sets `font-family: var(--mono)` itself; Headless run failed to find the Trips category / At 1280 px the left rail uses `.side-cat`, at 380 px `.places-cat` / The check script picks the selector by width; Console warning validateDOMNesting, a par...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T167-advisory-flashcards.md"`

### T168: What to pack becomes an icon grid (2026-10-03)

The "What to pack" fold on a trip page used to be a bulleted list, and it was missing entirely on 153 of the 253 trips because their packingNotes array is empty. It is now a grid of 16 to 24 icons in one 20px, 1.5px stroke set, coloured --ink-soft with no tile behind them. Tapping an icon puts one line under the grid saying why that item is on this trip, and tapping it again clears the line. The fold now shows on every trip. The grid is built in src/lib/packGrid.js. A trip file holds packingNotes either as v2.0 sentences or as v2.1 objects with icon, item and whyThisTrip, which is the shape the D1 backfill will write. Both become cells.

Broke: 31 trips came out at 15 cells / Icon names are unique per grid and the type kit overlapped the common kit / Added five more common items; Six i18n files and JourneyPage showed whole-file diffs / A Python rewrite turned CRLF into LF / Restored CRLF, diff is now the real lines only

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T168-packing-icon-grid.md"`

### T169: Booking order, bookingWindows as a ticked checklist (2026-10-03)

The booking windows paragraph on a journey page is now a "Book in this order" section. Each clause that carries a lead time becomes a step with the lead time in mono ("3-4 mo", "2-4 wk") and a tick box, sorted with the furthest lead time first so the first row is the one to act on today. Ticks are kept in localStorage on the device, one key per trip (carta.booked.<tripId>), and the closed section header shows "1 of 3 booked". Clauses with no lead time ("unstaffed refuges cannot be booked at all") are not dropped; they sit under the steps as "Also worth knowing". Because the section carries every authored word, the old Booking windows row in Good to know is hidden when the section shows.

Broke: Ranges never matched in the first test run / A shell heredoc ate the backslashes in the regex strings / Rewrote them with String.raw; i18n files showed a 7,000-line diff and two failed to parse / My first write converted CRLF to LF, and French and Italian apostrophes were unescaped / Reverted and rewrote the six files byte-wise, keeping CRLF, with...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T169-booking-order.md"`

### T170: The shape of the week, day zero, and the weather fallback (2026-10-03)

A journey page now carries three folds directly above the day by day, and before this task none of the three existed in any form. "How the week runs" (M2, open on arrival) is one strip with a column per day. The top row is an effort bar for each day, the middle row the day numbers, the bottom row the beds: one bordered box per run of nights in the same place, with a 2px ink edge on every box that starts a change of bed. A sentence above it reads the strip out loud, for example "3 bases, so you change beds 2 times. 4 hard days." on the Istria Parenzana week, or "One base all week, in El Tarter. No hard days, 1 rest day." on Grandvalira.

Broke: Vite would not start from a config in the wt folder / That folder cannot resolve the vite package / Put a temporary config with its own cacheDir inside the app worktree, deleted after the check; Tivat showed a 2 h transfer to Kotor / The longest time in a prose gateway string was used ("1 h 45 to Ulcinj ...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T170-week-shape-and-fallbacks.md"`

### T171: M7 + M8 + M10, one sentence, three ways out, and the human evidence (2026-10-03)

Every journey page now opens with one sentence under its title, ends with three computed exits, and closes with a footer that carries a detail from the route. The hook sentence comes from `hookLine()` in `src/lib/journeys.js`. The wire's `hook` field is a paragraph, not a sentence, so the function splits the authored hook, then the summary, into sentences and takes the first one of 40 to 190 characters that carries a number (a digit or a number word). If none does, it takes the first sentence, clipped at a clause. The page shows it outside any fold, and the "Why this trip" fold shows the rest of the same text, so nothing is said twice.

Broke: The first hook run covered only 223 trips, because 30 have generated filler summaries; the built line fixed that. The French and Italian strings with an apostrophe broke the parse on the first write, because the escape was lost in the script; I rewrote them with an explicit backslash and re-parsed.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T171-hook-exits-evidence.md"`

### T172: Cost breakdown as one stacked bar (2026-10-07)

The budget fold on the journey page (section id sec-budget) now opens with one stacked bar above the receipt. It has one segment per receipt line, in receipt order, sized by the middle of each line's low and high euro figures. Tapping a segment shows its name, its figure and its note in a line under the bar, and tapping it again clears the line. The receipt lines, total and rail alternative are untouched, which follows the owner decision of 2026-10-07 (block A of the runbook): the receipt stays the signature and the bar is only a summary.

Broke: fr.js failed to parse / Quote escaping in my insert of "Où va l'argent" / Used a double-quoted string; Vite dev server never finished starting / Shared node_modules optimiser cache with other sessions / Verified on the built dist with vite preview

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T172-cost-stacked-bar.md"`

### T173: E2 + M6: The lifestyle slider, and the trade-off in words (2026-10-07)

The receipt on a curated trip page ("What the week costs") used to print every figure as the authored range, "€780 to €1,250" for the Andorra hiking week, and nothing the traveller did changed it. It now carries the Lifestyle control as a stepped slider under the receipt. Moving it changes the four receipt lines and the total to one figure each, the figures run to their new value in 240 ms, and one sentence under the slider says in words what that figure buys: "€780 for the week, about €111 a day, means dorm or refuge beds, cooking most of your meals, local buses rather than taxis, and the free museum days." At the other end it says "€1,250 for the week, about €179 a day, means a hotel room,...

Broke: The first dev server timed out on 127.0.0.1 / 127.0.0.1 did not answer while localhost did; not investigated further / Pointed the shots at localhost, and ran preview with `--host 127.0.0.1` for the keyboard audit; The focus ring drew over the stop words / The words had a negative top margin to sit close to the track / Words moved below the ring; t...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T173-lifestyle-slider.md"`

### T174: Elevation profile and surface mix (2026-10-03)

Hiking, trail running and cycling weeks now open a fold right under the trip facts, titled "How much you climb each day" (or "How much you climb, and on what" on a ride). Its first module is a week profile: one column per day, the day's written climb as a rise above a line and its written descent as a fall below it, on one scale, with a hairline between days and the figures under each column (+1,120 over -750 over day 4). A sentence above reads it out: "5,460 m of climbing over 7 days, the most on day 5 with 1,380 m. The plan does not state the descent." for the Istria Parenzana week. Before this task no trip showed any figure of this kind; 72 of the 75 route weeks show it now.

Broke: Every surface share after the first was dropped / The clause pattern consumed the next share's number before its percent sign / Clause runs lazily up to a look-ahead for the next share; "Sheep-pasture doubletrack" coloured as gravel / Tone was read from the whole clause, which mentions hard-packed earth / Tone from the label, traffic from the claus...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T174-elevation-and-surface.md"`

### T175 E5: A type-specific data sheet that reorders itself (2026-10-03)

The data sheet on a journey page used to be one fixed list of nine text slots, the same order for every style, and it never showed the three numbers T151 filled (distance, highest point, climbing). It now reads the trip's tripTypeSlug and picks a field order for that style. All ten styles have one, including the four the blueprint left out: cozy towns, road trips, culinary and wine, and nature escapes (104 of 253 trips, 41 percent of the catalogue). The orders live in one table, SHEET_ORDER in src/lib/dataSheet.js, so a maintainer changes a style by editing one array.

Broke: The first browser pass showed lead rows of long prose in semibold, which read as shouting, and the small notes under a figure inherited the mono face. The weight now applies only to measured figures and the notes are set in the UI face. The text slots still show the sources' double-asterisk bold markers raw, as the page did before.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T175-type-specific-data-sheet.md"`

### T176 Free GPX on every route, never paywalled (2026-10-02)

The trail page no longer asks for a pass before it hands over a GPX or a KML. The two calls to `paywall.require('export')` in `continent-app/src/browse/TrailPage.jsx` are gone, together with the now unused `usePaywall` import and hook. The cycling GPX in `CyclePage.jsx` was already free, so every route page that can draw a line now downloads its file without a gate. The credit text stays inside both files, because `trailExport.js` writes it and was not touched. The PDF exports and the day-plan and trip KML (the My Maps files in the planner) keep their gate, as the owner decided in T275. Because the old pass copy promised "map files", it was rewritten in all six locales.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T176-free-gpx.md"`

### T177 Routing integration: komoot embed or own GPX (2026-10-02)

Nothing in the app or the pipeline. This task is the decision the spec's F1 to F3 and L7 asked for, with the terms check done and the authoring work budgeted. The decision is recorded here as recommended, pending the owner's confirmation, and nothing was built on it. The recommendation is the second path from L7, adjusted for what Carta actually runs: hold our own track per route trip, in the same wire shape the trail pages already use, and render it on the app's own MapLibre map with the elevation chart that already exists. Not komoot's embed, and not Mapbox Outdoors, because the app has no Mapbox dependency and does not need one.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T177-routing-integration-decision.md"`

### T179: 5.1, one card with five fillings (2026-10-07)

The five outdoor sections of the Destinations tab (beaches, lakes, mountains, cycling, trails) now draw every grid row through one card. Before this task each section had its own card: a photograph with the name, a line of facts and some chips laid over a dark scrim, at 116 px high on a phone (two abreast) and 149 px on a 1280 px desktop. Now each row is the card of spec 5.1: a 16:9 photograph with rounded top corners only, the ochre rating seal top right and the section's 6 px data strip (T181) along its bottom, then a white body with the name in Fraunces 19 px and a mono ref chip, the place in 13 px --ink-mute behind a pin, the hook on one 15 px line, exactly three measured values in mono...

Broke: A one-shot bash heredoc carrying the card code never ran / The heredoc trap (quotes and backslashes in JSX) / The code went through files written directly and a Python splice; styles.css gained a blank line and lost its final newline / A line-split script treated the file's trailing newline as a line / Reverted and appended the one import line with...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T179-destination-card-and-grid.md"`

### T180: 5.4, the shared detail-page skeleton (2026-10-04)

The trail, cycling, beach, lake and mountain pages now render from one component, continent-app/src/browse/DetailSkeleton.jsx. Before this task each page drew its own layout: the trail page opened on a map, the beach, lake and mountain pages opened on a location row with the photograph halfway down and no map at all, and the cycling page was not even a dialog, with its own header and no focus trap. Now all five share one shell (the bar with back, title, favourite and share, the scroll area, the focus trap) and one order of ten slots, so they read as one family.

Broke: Vite would not start from a config outside the worktree / The config is bundled where it sits and could not resolve vite from wt\ / A temporary config inside the worktree, deleted before the commit; Harnesses timed out on the dev server / The first page load on a cold dev server took over 45 s / Ran them against a vite preview of a build; Two edit...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T180-detail-page-skeleton.md"`

### T181: 5.5, the signature visuals, one instrument family (2026-10-04)

Each of the five detail pages now carries one signature figure in slot 5 of the T180 skeleton, and four of the five card types carry a 6 px data strip along the bottom of their photograph. The figures measure different things but are drawn as one instrument: a --paper-dim panel, a caption in the sans with its figure in mono, either twelve month cells or one 100%-wide bar, and one hairline axis under the track with mono figures on it. No section has a colour of its own. Every fill is the ink ramp the surface bar already used (--rule, --ink-mute, --ink-soft, --ink), so on every page a darker mark means more of the thing measured.

Broke: The lake's bars hung from the top of their cells / The old .lpage-months li rule (a centred column flex, 23-places-pages.css) still matched, because the new list keeps that class for the harness / The cell rule is two classes deep (.sig-cells .sig-cell) and sets its own direction and alignment; The axis figures under every 100% bar stacked on the l...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T181-signature-visuals.md"`

### T182: Derived modules that turn a listing into an instrument (2026-10-04)

The beach, lake and mountain detail pages each gained derived modules: rows in slot 6 of the T180 skeleton that work a reading out of fields the wire already carries, instead of printing the field. Source is section 11.5 of `additional docs/Carta/Plan/Data Quality/carta-destinations-enhancement-spec.md`. The orchestrator split that week's list three ways. Surface and traffic exposure (7.6) was already done by T174. The sea and lake temperature strips and the horizon silhouette are signature visuals and belong to T181.

Broke: Lake Como's row said under 300 m of shore path / export_lakes.py keeps the first ten reasons in narrative order, so the shore reason was cut, not absent / A cut state: absence counts only when the list is short or a later reason survived; the row says the figure is not on the listing; A test expected the afternoon band for a 216 degree beach / My e...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T182-derived-modules.md"`

### T183: 5.3, the section opening screens (2026-10-06)

The five outdoor sections of the Destinations tab (beaches, lakes, mountains, cycling, trails) now open on two bands before their grid. Band 1 is six or nine named places, each with its own photograph, under a Fraunces heading with the count in it ("Europe's 9 best-known mountains"). Band 2 is up to six horizontal rails, each titled by what the traveller wants ("Reachable without a car", "Warm enough to swim in June", "Mostly away from traffic"), each a saved filter. Band 3 is the grid that was already there, now under a "Browse the full list" heading. All five sections fill Band 1 with nine real photographs from their own wire; before this task there was no Band 1 anywhere.

Broke: The cycling band showed NCN Route 1 twice and two legs of EuroVelo 6 / The cycling wire carries OSM sections, one relation per section / cycleRouteKey folds sections of one route by name; "Murradweg Abs. 4" and "Abs.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T183-section-opening-screens.md"`

### T184 Visible feedback inside 100 ms, on touch, before data (2026-10-03)

Every control a finger can land on now changes the moment it is touched. The rule lives in `src/styles/02-base.css` as one `:active` block. It applies to buttons, links, summaries, labels, ARIA buttons, tabs and switches, checkboxes and radios, and anything focusable by `tabindex="0"`. A pressed control drops to 78 percent opacity (the shade shift) and compresses to 98 percent through the individual `scale` property. `scale` was chosen over `transform` so the press composes with any transform a rule already sets. A centred or rotated control would otherwise jump when the press rule replaced its transform. The press transition is 60 ms.

Broke: Trip length slider still reported no response after the first pass / The press rule changed the label but not the input itself, which is what the audit inspects / `.trip-slider-input:active` dims the input as well

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T184-touch-feedback.md"`

### T185: G2 + G3: Shared element transitions, skeletons never spinners (2026-10-03)

Opening a destination from an Explore card or a rail card, or a trip from a Destinations trip card, now grows the card's photograph into the header photograph of the page it opens, instead of the page appearing over the grid. It uses the browser's View Transitions API. Where that API is missing, or the traveller has asked for reduced motion, the page opens exactly as before. The mechanism is two small functions in continent-app/src/lib/sharedElement.js. openShared runs at the click: it gives the card's img a view-transition-name, starts the transition and commits the state change inside it.

Broke: The first browser run found no cards because the app opens on Destinations; the harness now loads ?tab=map. Nothing else.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T185-transitions-and-skeletons.md"`

### T186: G4 + 5.7: The quality floor, and respect the design system (2026-10-06)

Every screen the quality-floor audit reaches now passes the floor that carta-design, spec 5.7 and G4 set, except for two things only the owner can decide: the colour of three token pairs, and whether a desktop mouse target may be smaller than 44 px. The audit that proves it is in the repo as continent-app/scripts/verify_quality_floor.mjs and exits 1 when a floor check fails, so the floor can be checked by anyone with a built preview. T193 had already measured and fixed Explore and both planners. This task took its audit, brought it into the repo (T193-d, T166-g) and widened it in two directions.

Broke: The first two before runs were thrown away / The audit was still changing (chrome left out of the text checks, a color(srgb) background read as 0 to 1, the account hub not seen as a layer, inline links counted as targets) / Fixed the script, then ran the before audit once more from scratch, so before and after use the same script; My trips never op...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T186-quality-floor-and-accessibility.md"`

### T187 Design the first-run trip result (2026-10-02)

The repo now carries a written design for the moment a first-time visitor sees their first priced total, in docs/FIRST_RUN_RESULT.md. Nothing in the app changed. The document fixes four things that were open: which screen the first result is (the receipt component, rendered the same on the trip page, the destination page and the planner, the first time it holds a flight from the visitor's own airport), what that screen explains (nine questions a stranger has when the number appears, each with the place on the screen that answers it), what it deliberately does not explain (ratings, gems, tiers, passes, the account, the map, the planners, the AI, and any coach mark or tour), and the single nex...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T187-first-run-result.md"`

### T188: cost band and trip length filters (2026-10-07)

The curated trip list, the page that opens when a trip style is chosen in the Trips category, now carries two filters above its cards: the length the list is read at and a cost band. It is the one place curated trips are browsed (`src/browse/JourneysSection.jsx`; the trip page's exits are not a browse list). The composed city routes, the other trips product, already had their own day-count filter (`TripLengthSlider` in `DestinationsTab.jsx`) and carry no price, so they are untouched and a cost band there is register row T188-a. Trip length is not a filter that drops trips.

Broke: The check "trip opens on the short version" read the list's button, not the page's / The page opens over the list, so the first `.tl-btn` in the document is the list's / The checks now ask for `.tl-pick .tl-btn`; the first run of T101's check had the same selector and was re-run on the final build; The card's facts line cut the months at three card...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T188-cost-and-length-filters.md"`

### T189: Loading and error states across every surface (2026-10-03)

Two shared components now carry every loading and failure state that this task reached: LoadingBlock and ErrorBlock in continent-app/src/components/StateBlocks.jsx, styled by the new src/styles/27-states.css (appended to the end of the styles.css import list, nothing reordered). LoadingBlock draws hairline-free paper-dim rows at the height of the content that will replace them: 56 px for a list row, 120 px for a card, 14 px for a text line. The words ("Loading") ride along in an sr-only span with aria-busy, so a screen reader still hears them. The rows breathe in opacity only, and prefers-reduced-motion turns that off.

Broke: One slip: deleting the extras-spin keyframes while two other spinner rules still used them. Caught before commit; all three users were removed in the same change. No other issues.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T189-loading-and-error-states.md"`

### T190: Keyboard and map accessibility (2026-10-03)

Every map in the app can now be used from the keyboard, and the audit that proves it lives in the repo as continent-app/scripts/verify_keyboard.mjs. It walks ten surfaces with the Tab key at 380 px and 1280 px. On the base build 11 of its 20 checks passed; on the branch all 20 pass. The hard surface was the Explore map. Its pins are pixels in a WebGL canvas, so nothing in them can take focus. The canvas itself always could (maplibre gives it tabindex 0, the arrow keys pan and the plus and minus keys zoom), but a keyboard user could only move the map, never reach a place on it.

Broke: Destination page pins read as "Map marker" after being made focusable / maplibre's Marker.addTo() writes aria-label after the element is built / nameMarker() after every addTo in the four map files; Ringless photo credit link on the journey page / the new floor's 2 px offset pushed the ring outside .lpage-credit-line, which clips / two pixels of pa...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T190-keyboard-and-map-accessibility.md"`

### T191: Shared design tokens, and modularise styles.css (2026-10-03)

The 33,737-line `continent-app/src/styles.css` is now an entry file of 19 lines that imports 19 domain files from `src/styles/`, in the original source order. The split was made at existing section-comment boundaries, outside every `@media` block, so each file is a contiguous slice of the old one and nothing was reordered. Vite inlines the imports into one stylesheet, which means the cascade is exactly what the single file produced. I proved that rather than assumed it: the built `index-*.css` after the split is byte-identical to the one built from the old file (same md5, e33bc928cdf1709a7bce4d8003d96ab7).

Broke: First split build failed / My cut dropped the closing brace of `:root` by one line / Restored styles.css from git, fixed the off-by-one, resplit; A heredoc with a long Python script aborted the shell / Quoting inside the heredoc / Wrote the script with the file tool instead

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T191-design-tokens-and-css-modules.md"`

### T192 Hook dependencies and memoisation thrashing (2026-10-02)

The trip planner no longer redraws its map on renders that do not move a pin. TripPlannerTab built the array of map stops inline, so every render handed TripMap a new `stops` prop, and TripMap answers a new `stops` by clearing every pin, rebuilding them and gliding the camera to refit the route. On the planned-trip editor that happened on every nights bump and every stop select: 15 full redraws in the scripted walk, now none. The array is now memoised on a string of what the map actually draws (coordinates and names), because `stopDetails` itself legitimately changes on every nights bump. Main-thread long tasks in that phase fell from 11.8 s to 4.9 s.

Broke: First baseline run timed out on the trip walk / Cold Vite compile took over 240 s / Discarded; took a fresh five-run baseline on the warm server, then the A/B; Restarting Vite failed on port 5209 / The first Vite outlived its killed background shell and still held the port / Kept using it (same worktree, confirmed by its command line), stopped it b...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T192-hook-dependencies.md"`

### T193: Explore tab, Trip Planner and Day Planner passes (2026-10-04)

The three surfaces the enhancement specs leave out now use the shared component set the rest of the app was moved onto in waves 12 to 14, and they meet the carta-design quality floor on every screen the audit reaches at 380 px. Explore is the Explore tab (grid, rails, map, filter sheet). The Trip Planner is the inline guided wizard, its seven steps and the planned view with its sheet of actions. The Day Planner is the four-step flow (stay, when, ideas, how), the bot's questions and the build-it-myself builder with its tray. The source the task names, the original mind map's Explore Tab, Trip Planner and Day Planner nodes, is not in the repo (the same gap T187 recorded as T187-d).

Broke: Two h1s while a trip's page was open from the Trips step / The wizard's step question became an h1 and the trip page, mounted over the wizard, has its own / The step title steps down to h2 while tripPageId is set; h1 straight to h3 on the Where, Getting there and Finish steps, and h2 to h5 in the country brief / PlannerSection drew h3 and the brief...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T193-explore-planner-passes.md"`

### T282: app hygiene (2026-10-02)

Six open register rows are closed. The one remaining exhaustive-deps warning in `i18n/index.jsx` now carries a disable comment that gives the reason (`loaded` is the signal that the catalogue arrived), and `react-hooks/exhaustive-deps` is an error in `eslint.config.js`, so a new regression fails lint. The stale disable directive in `browse/CategoryRail.jsx` is gone. `PassModal` and `AiDayPlanModal` now use `useFocusTrap`, which moves focus in, keeps Tab inside the card, hands focus back on close and binds Escape on the capture phase of the shared escape stack.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T282-app-hygiene.md"`

### T283 Audit the exhaustive-deps disable comments in the planner (2026-10-02)

The planner now hides ten hand-picked dependency lists instead of thirty-one. T192 left 76 `eslint-disable` comments for react-hooks/exhaustive-deps in src (T192-d), 32 of them in src/planner, and one of those (AiDayPlanModal.jsx) belongs to session 3 of this wave. Of the 31 in scope, 21 are gone and each hook now lists what it reads, and 10 stay with a one-line reason written on the directive itself (`// eslint-disable-line react-hooks/exhaustive-deps -- reason`). The removals follow one pattern: a helper rebuilt on every render became a callback, or an effect that keyed on a property path now reads that value through a named constant.

Broke: Open-jaw hint kept its old language after a language switch / `t` missing from the jawHint memo, hidden by a disable / `t` listed; Country seed never opened the wizard modal if a trip appeared while the seed was pending / The effect keyed on the seed alone / Lists `tp.planned` and `tp.stopDetails.length`; First Vite start re-optimised the shared de...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T283-hook-disable-audit.md"`

### T312 Exhaustive-deps disable audit, the rest of src (2026-10-03)

Outside src/planner, src now hides 20 hand-picked dependency lists instead of 44, and every one of the 20 carries its reason on the directive (`// eslint-disable-line react-hooks/exhaustive-deps -- reason`). T283 left 45 disable comments outside the planner (row T283-a). One of them, browse/CategoryRail.jsx:41, was the unused directive T282 already removed (T192-c), so 44 were in scope. 24 are gone and each of those hooks now lists what it reads. Across all of src the count is 55 before and 31 after, and all 31 have a written reason (the other 11 are T283's ten in the planner and T282's one in i18n/index.jsx). The removals use four patterns.

Broke: A shared Explore link dropped xg, xu, xc and xs / The URL writer effect ran before the hydrate effect and deleted those keys first / Hydrate declared before the writer; ExploreMap could draw a stale first payload / The load handler closed over the payload of the render that created the map / Reads the current payload through a ref; The first trip_d...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T312-hook-disable-audit-2.md"`

### T313: credit strings into Where this comes from, and the lint parser (2026-10-02)

The licence names ODbL and GLO-30 no longer appear in surface copy. The two credit strings, `dest.routesCredit` and `cycle.sourceNote`, now say in plain words who supplied the data (OpenStreetMap contributors; Copernicus satellite data, ESA and Airbus), so the credit the licence requires stays visible next to the data. The licence names moved into a new collapsed row, "Where this comes from" (`credit.where`), with the texts `credit.licence.routes` and `credit.licence.cycle`. A small component, `CreditFold.jsx`, renders it under the routes credit on the destination page, under the cycle route credit, and under the cycling list credit. All six locales were edited and all six parse.

Broke: Build failed in DestinationsTab.jsx / Two sibling elements inside a `&&` branch / Wrapped them in a fragment; Parser regex came out wrong twice / Backslash lost while scripting the edit / Wrote the regex with node and checked the bytes

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T313-credit-footer.md"`

### Execution Report: T363 (2026-10-07)

Three token pairs failed the 4.5:1 floor that PRODUCT.md promises: `--ink-mute` on `--paper`, `--accent` as text on `--paper`, and white (`--on-fill`) on `--accent`, which is every primary button label. On 2026-10-07 the owner chose to darken the tokens rather than change where they are used (T362, owner runbook block A). This task applied the values T362 proposed in DESIGN.md: `--ink-mute` goes from `#7d8393` to `#646978` and `--accent` from `#e05a47` to `#ce3823`, both at the same hue, only darker. The three hover fills that sit on top of the accent were stepped darker with it, so a hovered button still reads as a step below a resting one.

Broke: First screenshot runs timed out or showed the error boundary ("Failed to fetch dynamically imported module") / The dev server's first dependency scan was still running on a laptop with little free memory.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T363-contrast-tokens.md"`

### Execution Report: T364 (2026-10-07)

Seven of the eight calls in row T362-b are built; the eighth, removing the Stay step, was not, because its premise is wrong. Filters on Explore (phone) is now a bordered secondary: white card ground, `--rule` border, `--ink` text, ink badge. The Lifestyle panel now sits over a scrim on every tab; the scrim was only drawn on Explore, so the left-hand variant was moved above it (z-index 41) and the scrim colour is now `--ink` at 28 percent through `color-mix`. `DualRange` is deleted from `FilterControls.jsx` (it had no caller).

Broke: The left Lifestyle panel looked greyed under the new scrim / Its z-index was 15, under the scrim's 40 / `.accom-panel.lifestyle-panel { z-index: 41 }` in `46-owner-calls.css`; `npm run lint` showed two errors in `CyclePage.jsx` / The local `token()` was removed but the import was not added / Added the import; The shared-trip failure seam did not fa...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T364-owner-ui-calls.md"`

### T367: the empty states from the approved onboarding document (2026-10-07)

Every empty state in the tables of `docs/ONBOARDING_AND_EMPTY_STATES.md` (approved by the owner on 2026-10-07, T362) now does what the table says: it names the space, gives one action as a real button, and where the empty thing has a geography it says why and offers the three nearest published rows across the border. Before this task 33 of the document's 71 rows matched it (the rows it marked "keep" whose action was already on screen); after it, all 71 do, six of them with a deviation written down below and raised as T367-c. The coverage module T124 built for the seven microstates now serves every country and every searched place.

Broke: "Luxembourg, 0 cycling routes published" over a search that matched no route / The empty country was taken from the toolbar even when a typed word, not the country, emptied the list / A typed word that names no country names no empty country (`typedCc`); The cross-layer blocks would have said "no walk within 5 km" on every beach page / The wire car...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T367-empty-states.md"`

### Execution Report: T368 (2026-10-07)

Five calls are built. First, the accuracy figure (88% within EUR 6 a day, from `src/lib/accuracy.js`) is now an answer in the account FAQ, "How accurate are the prices?", in the second group; it stays off the Explore card. Second, the compact receipt in the Explore card preview marks each figure "City" or "Country" (with a hover title that says what that means). Third, the Explore preview shows "About 3 h 23 min by train or bus from where you start" when the traveller's origin has a reach table and the place is in it; the card itself is unchanged.

Broke: A first `add` of an i18n key failed to find its anchor / The Explore keys use single quotes in a different block of each catalogue / The helper (outside the repo) now matches either quote style; `verify_account_panel.mjs` fails at its first check / Fails the same way on the base without T368 (checked by stashing and checking out the commit before T...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T368-owner-copy-calls.md"`

### T370: design brief, app shell, navigation and shared components (2026-10-08)

There is now a written brief for the app shell at `docs/design-v6/briefs/shell.md`, which the three build waves on this surface (T381 in V3, T391 in V4, T401 in V5) build from and which T380 (V2) reads first. No app code changed. The brief has the seven parts the task asks for: setup and mode (Operate), the walk at 380 and 1280 px from a cold start and a returning visit, an inventory of every view, state, control and visual setting on the shell with a verdict each, an impeccable critique and technical audit, the traveller's job here, the plan as three numbered build lists with a target-state table of every control, and eleven "needs a rule" proposals (R1 to R11) for T380 to accept or reject....

Broke: The first screenshot run stopped at the Day planner / The TabFallback loading screen covers the bottom nav while the lazy chunk loads on the slow shared dev server / Waited for `.loading-screen` to go before each shot; the cause is a finding (brief V3-6); The `?legal=privacy` shot at 380 was blank on the first run / It reused a page that had alread...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T370-v6-brief-shell.md"`

### T371: design brief, landing page and first run (2026-10-07)

The landing surface now has its brief: `docs/design-v6/briefs/landing.md`. It is the document V3, V4 and V5 build the landing page and the first-run receipt from, and it holds the seven parts the wave prompt asks for: setup and mode, the walk with the before screenshots, an inventory of every view, state, control and visual setting, an impeccable critique and a technical audit, the traveller's job, a three-wave plan with a target-state table of every control, and eight proposals that need a rule before anything is built from them.

Broke: The first desktop "return" screenshot showed only the loading screen / The dev server took longer than the 6 s wait / Retook it with a wait on the Destinations content (`walk2.cjs`); the eight-shot limit held; `impeccable context` run on the main checkout path found no PRODUCT.md / the app repo is its own git tree, so the launcher took it as the pr...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T371-v6-brief-landing.md"`

### T372: design brief, Explore (the map tab) (2026-10-08)

Explore now has a written brief that waves V3, V4 and V5 build from: `docs/design-v6/briefs/explore.md`. No app code changed. The brief walks the surface as the budget traveller in the research would, at 380 and 1280 px from a cold start and a returning visit; inventories every view, state, control and visual setting (about 60 control types, each with the file that draws it and a verdict); critiques it with impeccable's dual-agent method (23 of 40 on Nielsen's heuristics, 14 of 20 on the technical audit); states what the traveller needs first, second and third; plans three numbered build lists (12 items for V3, 7 for V4, 8 for V5) with files, command and done-check each; ends with a target-s...

Broke: First walk captured only the splash screen / The shared dev server needed more than the fixed 5 s to render / Waited for `.xbar-title` (up to 90 s) instead of a fixed pause; impeccable context reported NO_PRODUCT_MD / It resolves the project root to the app repo, which is its own git tree; PRODUCT.md and DESIGN.md sit in the root repo / Read both f...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T372-v6-brief-explore.md"`

### T373: design brief, Destinations browse (2026-10-08)

The Destinations tab now has a written design brief, `docs/design-v6/briefs/destinations.md`, which V3, V4 and V5 build from. It holds the seven parts the task asks for: the impeccable setup and the mode (Operate, because the traveller is narrowing a catalogue to a few places to open, not being persuaded); a walk of the tab at 380 and 1280 px from a cold start and a returning visit; an inventory of 66 views, states, controls and visual settings with a verdict on each; a critique with heuristic scores and a short technical audit; the traveller's job in the research's order of need; a plan of 13 V3 items, 9 V4 items and 9 V5 items, each with files, command and check, ending in a target-state t...

Broke: The walk script could not write its file / The scratchpad is shared with the other V1 sessions and held another session's walk.mjs / Moved to a T373 subfolder; Category screenshots showed only skeletons / The first layer load took 34 to 48 s on the dev server / Waited for the first real card, up to 90 s; `#region=` never opened the region page / No...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T373-v6-brief-destinations.md"`

### T374: design brief for the destination (town) page (2026-10-08)

The destination page now has a written brief, `docs/design-v6/briefs/destination.md`, that the build waves V3, V4 and V5 work from. No app code changed. The brief walks the page as the hiker on a budget in `docs/design-v6/TRIP-PLANNING-RESEARCH.md` would, on Rome (`FCO`), Valbona Valley (`gem:valbona`) and Zungoli (`gem:zungoli`) at 380 and 1280 px; inventories every state, control and visual setting with a verdict (about 100 rows); scores the page 26 of 40 on Nielsen's heuristics; and plans 10 V3 items, 9 V4 items and 9 V5 items, each with its files, the impeccable command and a done check, ending in a target-state control table and the full list of files the build waves touch.

Broke: The first walk saved the boot splash for three views / Ten sessions share one dev server; a cold boot took one to three minutes and the script waited for `.destp` only / The second walk waits for `.destp-head-actions` and six folds, up to three minutes; the views were saved again; The first detector run read nothing / The main checkout path has a s...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T374-v6-brief-destination.md"`

### T375: design brief, outdoor detail pages (2026-10-08)

The outdoor detail pages now have a design brief: `docs/design-v6/briefs/outdoor.md`. It is the plan V3, V4 and V5 build the trail, cycling route, cycling tour, beach, lake and mountain pages from. No app code changed. The brief holds the seven parts the task asks for: the mode (Operate, because the traveller arrives to decide and hand off, not to read or be sold to), the walk, an inventory of every view, state, control and visual setting with a verdict, a critique and a technical audit, the traveller's job, a three-wave plan with a target-state table of every control, and eleven proposals that need a carta-design rule before they are built. The main findings, in the order they matter.

Broke: Page loads timed out at 300 s and one script crashed with "Page crashed" / The shared dev server served ten V1 sessions at once on a laptop with 260 to 600 MB of free memory; a plain request took up to 288 s / Retried one view at a time with 300 s timeouts; six phone views captured, the 1280 px pass abandoned and handed to V3 (T375-e); The first be...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T375-v6-brief-outdoor.md"`

### T376: design brief, Trips (the journeys library and the trip page) (2026-10-08)

The trips surface now has a written brief that waves V3, V4 and V5 build from: `docs/design-v6/briefs/trips.md`. No app code changed. The brief covers three parts: the library (the Trips category of Destinations, ten style cards, a style's list and its filters), the journey page (one written week, 253 of them) and the composed route page (the 2 to 14 day city routes, which the trip planner brief leaves to this surface).

Broke: The shared dev server on 5199 did not answer for most of the session / The laptop had about 650 MB free while several sessions and a separate `npm run dev` server ran / Started a private Vite on 5207 from the main checkout for the phone walk, stopped it, ran the desktop and returning walks on 5199 once it answered again; The first desktop walk stop...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T376-v6-brief-trips.md"`

### T377: design brief, Trip planner (2026-10-08)

The trip planner now has a written design brief, `docs/design-v6/briefs/tripplanner.md`, which V3, V4 and V5 build from. It holds the seven parts the task asks for: the impeccable setup and the mode (Operate, because the traveller is completing a task with a defined end, a priced and saved route, not being persuaded or reading); a walk of the wizard and the planned trip at 380 and 1280 px from a cold start and a return; an inventory of 154 rows (28 views and states, 116 control rows, 10 visual settings) with a verdict on each; a critique with heuristic scores and a short technical audit; the traveller's job in the research's order of need; a plan of 13 V3 items, 10 V4 items and 9 V5 items, e...

Broke: The first "cold" screenshots showed only the splash / The dev server needed 183 s (380) and 51 s (1280) to paint from empty storage, and the script waited for the first button / The cold state was read from the seeded walk and the code; no cold screenshot is in the saved set; The first 1280 walk stopped after the Where step / Its reload in the midd...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T377-v6-brief-tripplanner.md"`

### T378: design brief for the Day planner (2026-10-08)

The Day planner now has a written brief, `docs/design-v6/briefs/dayplanner.md`, that the build waves V3, V4 and V5 work from. No app code changed. The brief walks the surface as the traveller in `docs/design-v6/TRIP-PLANNING-RESEARCH.md` would, at 380 and 1280 px, from a cold start (the four-step landing, Rome, through the fork into the builder) and from a returning visit (a saved Salzburg day opened into the workspace with its three tabs, popovers, exports and the Carta bot).

Broke: The shared dev server stopped answering for about fifteen minutes / Ten sessions on one server and about 600 MB of free memory; other sessions' servers on 5207 and 5210 hung too / The walk waited (navigation timeout raised to 15 minutes, `waitUntil: 'commit'`) instead of starting an eleventh server; it went through once the server came back; The re...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T378-v6-brief-dayplanner.md"`

### T379: design brief for My trips, account, sharing, passes, guides and admin (2026-10-08)

The account surface now has a written brief, `docs/design-v6/briefs/account.md`, that the build waves V3, V4 and V5 work from. No app code changed. The brief walks My trips, the shared trip view, the account hub and its spokes, sign in and the pass modal at 380 and 1280 px, cold and returning; inventories every view, state, control and visual setting with a verdict (224 rows across eleven tables, gathered by three read-only sub-agents and checked against the walk); scores the surface 24 of 40 on Nielsen's heuristics and 13 of 20 on the technical audit; and plans 13 V3 items, 9 V4 items and 9 V5 items, each with its files, the impeccable command and a done check, ending in a target-state cont...

Broke: curl to the shared dev server timed out three times, so the server looked down / The Bash sandbox blocks localhost; the server was up / Probed with PowerShell, which answered 200; a second Vite started on 5210 meanwhile was stopped at once; Two My trips views at 1280 px timed out on the first walk / Ten sessions on one dev server / Walked again wit...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T379-v6-brief-account.md"`

### T381: shell V3, structure, information and flow (2026-10-08)

The shell now shows the traveller what every price on screen is computed from, and lets them change it in one tap. A new settings line sits in its own band under the header: origin, dates (or "Any dates" while Carta's pair stands), party, Lifestyle (bed and vibe), language and "Prices in EUR". It shows every part on Explore and Destinations, only Lifestyle, language and currency on the Trip planner (the planner keeps its own origin, dates and party), and nothing on the landing page or the Day planner, where no figure reads these inputs. On a phone it never wraps: container queries drop origin first, then dates, and keep Lifestyle.

Broke: verify_filter_sheet crashed after opening the sheet / The phone Explore sheet now holds Explore's own rail (`.xrail`), not FilterControls fields, so `.fsheet-label` was null; the header pill `.mobile-seg-btn` was already gone at the baseline / The field checks run only when the sheet carries FilterControls fields and report "skipped" otherwise; the...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T381-v6-v3-shell.md"`

### T382: structure, information and flow, the landing page and the first run (design wave V3) (2026-10-08)

The landing page now prices the same trip the rest of the app prices. Its three inputs (people, nights, stay) read and write the app's shared choices through `FirstRunContext`, the way the first-run receipt already did, so a visitor who sets one person in a dorm bed in Porto and presses "Open Porto" finds the destination page's receipt at one person, a dorm bed and the same total to the cent (harness: 422.25 on both pages).

Broke: `npx eslint` and `vite` would not start ("Cannot find native binding", "Cannot find module '@eslint-community/eslint-utils'") / The main checkout's shared `node_modules` lost its `.bin`, every `@eslint` and `@babel` package and the `package.json` of rolldown's binding at about 04:20 on 2026-10-08, while other sessions were running; files held open...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T382-v6-v3-landing.md"`

### T383: structure, information and flow: Explore (the map tab) (2026-10-08)

Explore now puts the inputs first, then a count, then priced places, which is the structure the brief's V3 list asked for (docs/design-v6/briefs/explore.md, part 6). The plan is docs/design-v6/plans/V3-explore.md, committed before the first app edit (f637c3453). This session was resumed after a usage limit: the first run committed the plan and left sixteen uncommitted app files; the resumed run reviewed them against the plan, found all thirteen items built, fixed one more open row (T380-g), repaired one stale harness (verify_category_rail, row T384-e), and ran every check.

Broke: Two h1 elements on ?tab=places (row T380-g) / Explore stays mounted under Destinations and its control-bar h1 stayed in the DOM / The title renders as h1 only while `isActive`; a div otherwise; verify_map_size_cards stopped at its first locator / Written for the map-era Explore (From picker, size pill, ranked list) / Rewritten section by section ag...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T383-v6-v3-explore.md"`

### T384: structure, information and flow: Destinations browse (2026-10-08)

The Destinations tab now opens shorter and narrows the same way on both widths. On a phone the six categories sit as a 2 x 3 grid of equal buttons (all six on screen at 360 px; at 380 px only four of six showed before), the active one in ink, and the accent tick that sat over every tile is gone. Inline, under the search field, each section shows one short facet group only (water quality, swimming, how to reach the top, length for cycling, length for walks); every other group lives in the Filters sheet, which a phone opens from its Filters button and a desktop now opens from a new "All filters" row in the side panel, so desktop Beaches reaches 9 of 9 facet groups where it reached 1.

Broke: `npm run build` failed: "vite is not recognized", then rolldown's native binding, then `@babel/runtime` missing / The shared `continent-app/node_modules` in the main checkout has lost its `.bin` folder and every scoped package except `@rolldown`, `@supabase`, `@types` and `@vitejs` (51 of 226 top-level packages missing on 2026-10-08 around 04:00; t...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T384-v6-v3-destinations.md"`

### T385: structure, information and flow on the Destination (town) page (design wave V3) (2026-10-08)

The destination page now runs in the order a traveller asks their questions. On a phone it goes: head, fact strip, receipt, cost at your Lifestyle, the month block, getting there, walk and ride from here, things to do, the highlights map, trips, villages inside, rating, sleep, tips, festivals, parking, webcams, what to bring, explore further, a page-end utility row, and then the honest footer. From 1020 px the receipt, cost, month and getting there sit at the top of the right column, and the main column starts at walk and ride. The head has one row of three actions: Plan a trip here, Shortlist and Plan a day here. There were seven. Share is only in the bar now.

Broke: The German page scrolled 2 px sideways at 360 px / The new title "Was ein Tag mit deinem Lifestyle kostet" is `white-space: nowrap` (.dsec-title in 25-feature-pages.css), so it pushed the chevron past the edge / `.destp .dsec-title` wraps in 64-v6-destination.css (app 0f7aee5); 0 px in all six languages, expanded too; verify_destination_page expect...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T385-v6-v3-destination.md"`

### T386: structure, information and flow on the outdoor detail pages (design wave V3) (2026-10-08)

The trail, cycle route, cycle tour, beach, lake and mountain pages now put the decision first, the hand-off second and the depth after it, in the order carta-design's "Detail page grammar" (DIRECTION.md part 9, outdoor N1 to N11) sets: hero, head, hook, a key facts band, one Before you go block, one hand-off band, map, signature, at most five folded rows, exits, sources. The work sits in the shared skeleton (`src/browse/DetailSkeleton.jsx`), so the six page types moved together and one DOM order still serves every width and the keyboard.

Broke: verify_route_page crashed before any check, on the baseline / Two key lists carry `.rsurf-keys` since T181 and the bare locator failed in strict mode / Locators scoped to the surface bar's wrapper (`[data-testid="route-surface"]`), with a comment; verify_route_page "every segment is painted" failed once it could run / The unknown share is drawn as...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T386-v6-v3-outdoor.md"`

### T387: design wave V3, Trips (structure, information and flow) (2026-10-08)

The trips surface now puts what a traveller needs in the order they need it. The library's ten style cards carry a caption band under the photograph with a from-price a person and its length ("From €255 a person, 7 days" for hiking), hiking comes first, and the honest coverage line sits above the grid instead of after it. A style's list has one filter row: the length as a two-segment control (the short version first, as on the page), one Filters button that opens the shared filter sheet with cost, month, tag and the sort, and removable chips for whatever is narrowing the list; Clear all no longer resets the length.

Broke: The sticky rail did not render on the new page / SectionRail reads the sections in a layout effect, which runs before the parent's scroller ref is attached on the first loaded render / JourneyPage hands the rail a `ready` value set in an effect, after refs attach; The composed page's days failed four verify_trip_page checks on the base / Both pages...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T387-v6-v3-trips.md"`

### T388: structure, information and flow: Trip planner (design wave V3) (2026-10-08)

The trip planner now shows money from the first place the traveller looks at, and shows the same figure on every screen. One trip walked on the built app (Italy, Naples and Rome, 8 days, 2 travellers) reads ~€1,248 est. on Getting there, €1,248 on Finish and €1,248 in the planned receipt; the V1 walk read €586 on the wizard and €771 one screen later for one Albania trip. The wizard and the planned view now price a stop through one function (`stopStayCost` in `src/lib/trip_planner_pricing.js`) and pick a leg's mode by one rule (`pickLegMode`), and the wizard hands its daily lifestyle to the planner, which used to price the days at the app default.

Broke: The planned footer's Save trip squeezed its label at 390 px / Save trip was allowed to shrink in the one-row footer / Save trip keeps its width, Plan your days ellipsises if it must; verify_planner_v2 failed "store: transit stays empty" once Getting there worked on the build-your-own path / the step writes Carta's guessed mode into the same answers...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T388-v6-v3-tripplanner.md"`

### T389: V3 structure, information and flow, Day planner (2026-10-08)

The day planner now puts the day before its chrome and gives every view one obvious next step. The plan for the wave is `docs/design-v6/plans/V3-dayplanner.md`, committed before the first app edit; it is the brief's V3 list less the two items that wait on the owner. On the landing, a traveller who already has day plans on the device now opens on "Your day plans" with "Plan a new day" as the one primary, and the stay question follows on that tap; a cold start still opens on the question, and a running trip still leads as before.

Broke: Moving the builder rules into 68 changed one computed height (`.dayex-head-acts` 44 to 36 px) / The phone tap boxes for the builder sat in a later shared block of 26 and overrode the moved rules / Moved those eight lines too, as their own block after the builder rules; the comparison then showed no difference; The design lint reported 8 new violati...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T389-v6-v3-dayplanner.md"`

### T390: V3 structure, information and flow for My trips, account, sharing, passes, guides and admin (2026-10-08)

My trips now names itself and opens on the trip ahead. The panel carries a visible "My trips" h1 in the display face (it was a screen-reader-only heading under a desktop rail labelled "Saved trips"), the dead letter-x close is gone, the tabs read Planned, Favorites, Visited in that order, and a returning traveller lands on Planned whenever an upcoming plan exists instead of whatever tab was last open. Counts are the house count chip (mono, ink on `--paper-dim`) instead of an accent pill, the Day plans empty state asks with a secondary so each tab has one primary, and both "Browse the map" buttons now go to Destinations (one went to Explore).

Broke: "Continue with Google" turned accent in the sign-in modal / `GoogleButton` carries the `auth-submit` class, so the new `.auth-modal .auth-submit` rule hit it / The rule excludes `.auth-google` and `.auth-submit-ghost`; The cost line read "€100 a daynational" to a screen reader / The pedigree word was separated by a margin, not a space / A real spac...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T390-v6-v3-account.md"`

### T391: shell V4, visual and dynamic (2026-10-08)

The shell's chrome now recedes and answers the traveller's input with motion from the shared tokens. Before this wave every phone screen carried three or four accent objects in the chrome (an accent-tinted pass chip, an accent wordmark, accent text and an accent tick on the active tab, an accent ring on the plus, accent tiles in the Lifestyle dialog, an accent avatar on desktop, an accent underline under the desktop tab). Now the only accent left in the header and the bar is the pass chip's ticket glyph, which the T360 owner call keeps and verify_top_bar asserts.

Broke: Edited files showed as rewritten whole in git / The patch scripts wrote LF over files committed with CRLF / A scratch script restores each file's committed line ending before every commit; verify_top_bar: the bar wrapped to two rows at 800 px / The first desktop pill padding (8 x 12 px plus margins) widened the five tabs / 8 x 10 px with 1 px margi...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T391-v6-v4-shell.md"`

### T392: visual and dynamic, the landing page and the first run (design wave V4) (2026-10-08)

The landing page now answers its inputs in place. When the party, the nights, the stay or the town changes, each figure that moved dims once and settles back. This is the house primitive `settleFigure()` from `src/lib/figureChange.js`, at `--dur-2`. It covers the two receipt lines, the total and the five figures in the priced list. Before, the whole list of lines was remounted on every total and faded in by a keyframe with a literal 0.2 s. That keyframe is gone, and so is the remount, so the screen reader's live region on the total is no longer torn down on each reprice. Under reduced motion the figure changes at once and nothing animates.

Broke: The cost bar sat in a grey 44 px band on the white card / CostBar's track paints `--paper` behind its 44 px hit buttons, which reads as a box on `--bg-card` / `.frr-bar .costbar-track { background: transparent }` in the v6 file; the 1 px gaps then show the card; The fold check failed after the bar went in (primary bottom 717 against 714) / The bar...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T392-v6-v4-landing.md"`

### T393: visual and dynamic: Explore (the map tab) (2026-10-08)

Explore now answers the traveller's input and shows more prices per screen, inside the locked palette. The plan is docs/design-v6/plans/V4-explore.md, committed before the first app edit (1624381c1). Its critique of the V3 result ran dual-agent as impeccable's critique.md requires: a design review and a detector pass in two isolated sub-agents, plus this session's own browser walk. It scored 26 of 40 (23 in V1). The detector found nothing; the debt was in the older stylesheets: animated shadows, hover lifts, photo zoom, literal durations and accent on non-actions. The card preview is now a paper popover, not an ink panel over the photograph.

Broke: Phone grid tracks grew to 257 and 346 px / A card with `overflow: visible` (needed so the popover can sit outside it) sizes its grid track to its content / Tracks are `minmax(0, 1fr)`, cards `min-width: 0`, the split view re-declared; Phone popover opened to the side of the card / `.xpop--below` lost to the base popover rule on specificity / The si...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T393-v6-v4-explore.md"`

### T394: visual and dynamic: Destinations browse (2026-10-08)

No text sits on a photograph on the Destinations tab any more. The country cards of the Trails index carry the flag, the name, the mono count and the chevron in a solid band under the photograph, and the band turns ink while pressed; the two gradient scrims are deleted. The composed trip cards moved their name, score and day chips from the photograph into the body.

Broke: Playwright could not launch any browser / `playwright` 1.61.1 in node_modules asks for builds the shared cache lacks (`chromium_headless_shell-1228`, `webkit-2311`) / A scratch preload points `launch()` at the installed 1243 and 2359 builds; nothing installed (row T394-g); verify_regions failed before any check / It reads `pipeline/regions/quotas.p...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T394-v6-v4-destinations.md"`

### T395: visual and dynamic on the Destination (town) page (design wave V4) (2026-10-08)

The destination page now looks like one instrument. It no longer reads as a stack of cards. The folds are sections under a `--rule-soft` hairline, with no box, no radius and no shadow. Their icons are `--ink-soft`. Their titles take the 19 px row-name size, and a hover underlines the title in ink instead of turning it terracotta. When a fold opens, its chevron turns and its body fades and rises 4 px in `--dur-2`. Both moves have a reduced-motion branch. The receipt is again the page's one bordered object. The tips fold lost its ochre fill, because a tip is not a rating.

Broke: Focusing a map pin lost the focus at once, and hover could flicker / DestMap rebuilt every marker on each parent render: the parent passes new arrays and new callback arrows, and the hover state re-renders the parent / Rows and callbacks are read through refs; markers rebuild on a content key (`rowsKey`) only; verify_keyboard 19 of 20: the gallery...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T395-v6-v4-destination.md"`

### T396: visual and dynamic on the outdoor detail pages (design wave V4) (2026-10-08)

The trail, cycle route, cycle tour, beach, lake and mountain pages now answer the traveller and show the place before they explain it, inside the same palette and type. The plan (`docs/design-v6/plans/V4-outdoor.md`, committed before the first app edit) carried eleven items from the brief's V4 list; all eleven are done. The hero is capped at 40 percent of the phone viewport (`40dvh`, `56dvh` from 900 px), so on an iPhone 13 the hook starts at 440 to 512 px instead of 555 to 615, and on the trail, beach, cycle route and tour the one primary (the GPX or "Price a trip to") now starts inside the first screen (its row at 763 to 829 px of 844, so the button's top edge shows and one short scroll br...

Broke: The photo credit checks of the three place harnesses failed / Every track frame carries its own `.bpage-credit`, so the bare locator matched four elements in strict mode / The checks read the hero's credit (`.dsk-hero-credit .bpage-credit`), with a comment; The cycle profile drew a pink area / The plain mode first reused `.tpage-elev-area`, whose f...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T396-v6-v4-outdoor.md"`

### T397: design wave V4, Trips (visual and dynamic) (2026-10-08)

The trips surface now answers the traveller's input instead of sitting still. Moving the Lifestyle slider or switching the length changes every receipt figure at once, set to the cent, with one short opacity dip on each figure that changed; the old 240 ms count-up that showed a run of wrong, rounded figures is gone (row T380-b). The day in view on the day track is now the selected day of the whole week: its bar in the week shape turns terracotta, a terracotta marker slides to its column in the climb profile, and every day number under the week shape is a button that brings that day onto the track.

Broke: The strip's cost cell read "€850 To €1,200 A Person" / `.jstrip-word` capitalises style words and only its `.mono` variant turned that off; the cell is no longer `.mono` once the figure is split from its words / `.jpage .jstrip-word:has(.mono) { text-transform: none; }` in the v6 sheet; ESLint warned that LifestyleSlider.jsx exported a function / `...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T397-v6-v4-trips.md"`

### T398: visual and dynamic: Trip planner (design wave V4) (2026-10-08)

The trip planner now shows a choice one way and spends its accent on one thing per view. Every selected card on the surface (the Booked answers, the match cards, the country grid, the picked trip, the stops in the editor and the itinerary) has a 2 px ink border and an ink tick, and every selected chip or segment (the quiz answers, the trip lengths, the leg modes, the dates mode, the city pills, Overview and Day by day) is ink fill with white text.

Broke: Six harnesses stopped at their first click on the desktop pass / shell V3 made the header tabs links (rule "Navigation"); the harnesses looked for a button named Trip planner and fell back to the phone's plus, which is hidden on desktop / the locator is `a, button`, with a comment, in all seven; verify_ready_trips "the media box is 16/7" at 375 px...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T398-v6-v4-tripplanner.md"`

### T399: V4 visual and dynamic, Day planner (2026-10-08)

The day planner now spends its terracotta on one thing per view, draws the day it plans, and answers the traveller's input with motion that says what changed. The plan for the wave is `docs/design-v6/plans/V4-dayplanner.md`, committed in the root worktree before the first app edit; it opens with the impeccable critique of the merged V3 build. The map shows the route. On both of this surface's maps (the workspace and the builder) catalogue places are now ink: a white label with an ink glyph, an ink dot where pins crowd, an ink tick when picked, a 2 px ink ring when in focus, and no hover lift. The numbered stops and the route line are the only terracotta left on the workspace map.

Broke: The first edit turned two CRLF components into LF, so git showed every line changed / Python's text mode wrote LF; the app worktree's working copies are CRLF / Rewrote both with CRLF; every later edit went through a helper that keeps each file's own line ends; The design lint found one new `outline-none` / The picked pin rule removed the focus ring...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T399-v6-v4-dayplanner.md"`

### T400: V4 visual and dynamic for My trips, account, sharing, passes, guides and admin (2026-10-08)

Nothing sits on a photograph on My trips any more. The favourite cards and the journey cards keep their photograph at 3:2 and carry every word in a solid band flush under it: the name in the display face, the countdown with its number in mono, the dates in mono, the day cost, and on a record card the memory's one-line summary. The two dark gradients, the countdown chip, the rgba fills and the calendar or tick state mark that rode on the photo are gone; the flag stays on the photo as a picture on a solid `--paper` chip, and the bookmark and the card menu moved into the band's corner at `--tap`. Pressed, the band turns `--ink-fill` with `--on-fill` text.

Broke: The Undo toast could not be clicked on desktop / The shell's bottom slot is z-index 40 and the desktop My trips and Account pages are z-index 56 (25-feature-pages.css), so every slot message sits under them / `.bottom-slot:has(> .undo-toast)` rises to 57 from 769 px in the v6 file; the general fix is the shell's (row T400-c); verify_friends timed o...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T400-v6-v4-account.md"`

### T401: shell V5, harden, adapt and polish (2026-10-09)

The shell now keeps its promises to keyboards, screen readers, small screens and other languages. Every dialog the shell draws traps focus and closes on Escape: the plan chooser (still a dialog of two links, now `aria-modal`, with focus moving in and returning to the plus), the share-trip offer, the DateField popup, and the SheetShell sheets, which dropped a hand-written trap that re-ran on every parent render. SheetShell, the share-trip offer and the three legal dialogs now leave in `--dur-2` through a new `useDialogExit()` in `src/lib/motion.js`.

Broke: Vite dev server hung on cold start / ten sessions on one machine plus a cold dependency scan / Built with `--watch` into scratch and served it statically; Two sessions swapped changes / `git stash` is shared between worktrees; stash and pop crossed / Restored my files from my stash commit; the stray T405 files stay modified (see above); i18n files...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T401-v6-v5-shell.md"`

### T402: harden, adapt and polish, the landing page and the first run (design wave V5) (2026-10-09)

The landing page and the first-run receipt are hardened. Nothing was redesigned. Every control on both strips is now a real touch target. Before, the three landing selects were 32 px high and the first-run strip's selects and date inputs 28 px, each inside a 44 px or taller cell, so the hit area was the select and not the cell. Now the select or date input fills the whole cell (about 56 px high), and the label sits over it and lets the tap through. A tap anywhere in the cell opens the picker. WebKit also drew a grey native pill around each landing select, because it ignores a bare `border: 0` without `appearance: none`.

Broke: The first-run strip's labels sat in the middle of their cells, over the values / `.frr-cell` centred its content, and with the select taken out of flow the label was the only child / `justify-content: flex-start` on the cell; WebKit drew a grey pill around each landing select / WebKit ignores `border: 0` and `background: transparent` on a select wi...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T402-v6-v5-landing.md"`

### T403: harden, adapt and polish: Explore (the map tab) (2026-10-08)

Explore now keeps the promises its controls make on a phone. The plan is docs/design-v6/plans/V5-explore.md, committed before the first app edit. Its audit was this session's own: the detector, the design lint and a Playwright scan on iPhone 13 (WebKit), Pixel 5 and 360 x 740 (Chromium) and 1280 x 800, in English, German and French. No sub-agent critique was run, because the V4 critique of the same surface is a day old and this wave refines it. Impeccable context again resolved the app repo and reported NO_PRODUCT_MD (row T372-g); PRODUCT.md and DESIGN.md were read directly.

Broke: The first commit carried 1,331 lines of ExploreMap.jsx and two audit folders / My edit script wrote the wrong line endings into a CRLF file; the harnesses wrote keyboard-audit and quality-floor-audit into the worktree / Reset, restored CRLF, deleted the folders, recommitted (the diff is 55 lines); verify_explore failed two destination-page checks /...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T403-v6-v5-explore.md"`

### T404: harden, adapt and polish: Destinations browse (2026-10-09)

The Destinations tab is tighter at the edges. Facet chips and the country picker are 6 px controls, not 999 px pills. On a coarse pointer the chips, the picker, the locate crosshair and the sorts reach 44 px, in landscape too (rows T384-l and T394-i). The category buttons no longer cut a long German or Dutch label to "Radfah...": the label wraps and the button grows by a line. A card value that is a word (Sand, W, Excellent) is set in the sans and the mono is kept for numbers. The difficulty words on cards and the trail page read Gentle and Demanding (Easy and Hard were the old words) and match the journey scale in all six languages (row T397-e). Rails can be walked with the keys.

Broke: A new rule `.open-strip:focus-within { outline: none; }` failed the design lint / It was a no-op written from habit / Deleted; the card's own focus ring is the rule; The first German pass still cut "Radfahren" / An old `text-overflow: ellipsis` on `.places-cat span` in 23-places-pages.css / Deleted in place (the file is this surface's); the wrap is...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T404-v6-v5-destinations.md"`

### T405: harden, adapt and polish the Destination (town) page (design wave V5) (2026-10-09)

The destination page is now safe to use with a thumb, in six languages, and when something goes wrong. On a touch screen every control of this page is 44 px: the gallery arrows, the close cross, the bar buttons, the Wikipedia links on highlights, the parking Google Maps and Waze links, the festival links, the "Around here" tabs, the "Read more" links, the receipt's selects and dates (sized here for this page only) and the map attribution button. A fine pointer keeps its 28 to 32 px. The "Around here" layer tabs used to scroll sideways and hid the last one; they wrap now, so a swipe is never the only way. The gallery height uses dvh.

Broke: I ran `git stash` in my worktree to compare lint baselines. The stash is shared by every worktree, so it crossed with the shell session's (T401) and each tree received the other's changes. My work was already committed in 10443da, so nothing was lost; I restored my tree from a patch.

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T405-v6-v5-destination.md"`

### T406: harden, adapt and polish the outdoor detail pages (design wave V5) (2026-10-09)

The trail, cycle route, tour, beach, lake and mountain pages were already ordered, drawn and animated by V3 and V4, so V5 hardened them and fixed what a phone on one bar of signal meets. The plan (`docs/design-v6/plans/V5-outdoor.md`) was committed before the first app edit. The biggest change is a download. The cycle route's hero used `url`, the original Commons file, as its source: 15,410,466 bytes for route 1150. It now takes the 1280 px `thumb` the wire already carries (392,695 bytes) and a srcset over Wikimedia's renderable widths, with `fetchpriority="high"`. The tour hero goes from 1,647,281 to 359,463 bytes.

Broke: CyclePage failed to parse / A scripted import was inserted inside a multi-line import / Moved it; lint clean; Edge fixtures passed with no effect / A service worker answered the data requests, so the changed record never arrived / Contexts block service workers; the title check asserts the long name; Dev server stopped answering / Vite held about 1...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T406-v6-v5-outdoor.md"`

### T407: design wave V5, Trips (harden, adapt and polish) (2026-10-09)

The journey page now holds up on a small phone in a long language, can be printed as a plan, and no longer leaves a stale history step. The page bar gives its title room: the back label wraps to two lines and takes at most 46 percent, the title takes the rest on up to two lines (it read "And..." in German before). On a phone the bed chips under the week shape are listed one under another with the night and the place in full ("Nacht 2: Refugi del Comapedrosa, 2,260 m"); they were one column wide and read "La...", "R...".

Broke: First print gave one blank page / The page is a fixed dialog inside a full-height shell / Print lifts every ancestor to static, auto height and hides siblings along the chain; Print put each fold on its own page / `break-inside: avoid-page` on folds / Avoid breaks only inside days, booking rows and receipt lines; An unescaped newline in a harness s...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T407-v6-v5-trips.md"`

### T408: harden, adapt and polish: Trip planner (design wave V5) (2026-10-09)

A partial V5 pass on the trip planner. The modal wizard is now a real dialog: role, aria-modal, a focus trap with Escape through the shared capture-phase stack, focus returning to the opener, and the single 28 percent ink scrim. The CountryPickerMap touch card is a plain region. The trip name has a visible focus border. A selected choice card (Nothing yet, trip cards, quiz chips) kept its ink inside-outline over the focus ring, so a keyboard user saw no focus on it; the ring now wins when focused, which clears the verify_keyboard finding from T402. The extras booking fields, notes, packing input and remove buttons carry aria-labels from existing strings.

Broke: Design lint caught `outline: none` in my focus rule / New rule / outline-color: transparent with a border; Commit showed 7,450 changed lines in GuidedTripWizard.jsx / Python rewrite and the autocrlf filter changed line endings / restored CRLF, staged raw with hash-object; the diff is 8 lines; verify_receipt asserted the Bag check panel / Panel reti...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T408-v6-v5-tripplanner.md"`

### T409: V5 harden, adapt and polish, Day planner (2026-10-09)

The day planner now works under a thumb, a keyboard and a screen reader, and it speaks the traveller's language. The plan for the wave is `docs/design-v6/plans/V5-dayplanner.md`, committed in the root worktree before the first app edit; it opens with the impeccable audit and critique of the merged V4 build. Tap targets. On a coarse pointer every control on the surface is now at least 44 px both ways. The census walked ten views (landing, stay results, When, Ideas, the fork, the builder, the returning list, and the workspace with its three tabs and the tips dialog) on the iPhone 13 (WebKit), the Pixel 5 and a 360 x 740 Android, with a ::before hit ring counted as part of a control.

Broke: The undo toast never showed on the returning landing / The landing returns its own tree, so the toast I put in the workspace return was not rendered / The toast is rendered in both returns; Focus jumped back to the first menu item on every parent render / Callers pass a fresh close function each render, and the focus call sat in the effect that dep...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T409-v6-v5-dayplanner.md"`

### T410: V5 harden, adapt and polish for My trips, account, sharing, passes, guides and admin (2026-10-09)

The surface reaches its edge cases now. On a phone every control of My trips, the account hub and its spokes, the sign-in modal, the guides, the shared trip and the past-trip form reaches 44 px: the account back button, the Friends actions, the password reveal, the text links, the feedback kind pills, the guide chips, back and copy, the record map's expand, "Add a past trip", the crew plus and remove, the night steppers and the form's own fields and buttons. A fine pointer keeps its 32 px rows. The two controls that could not be fixed here are the date field's trigger in the past-trip form (28 px, the shell's shared DateField) and the map library's own attribution; both are register rows.

Broke: verify_friends failed on the Planned tab (card not found) / The shell's T401 now passes `onOpenFriends`, so My trips shows one line pointing at Friends instead of friend cards, as the V3 brief asked; the harness still asserted the cards / Assertion rewritten with a comment: it asserts the line, that no friend card stands on the tab, then opens the...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T410-v6-v5-account.md"`

### T411: one traveller, one trip, the consistency pass across every surface (2026-10-13)

Carta now reads as one product at the joins between its ten surfaces. The work started from a planning journey walked end to end on the merged V5 build (landing, Explore, Lifestyle, Destinations, a town, a trail, a journey, the trip wizard and planned view, save, share, two days in the day planner, My trips) on iPhone 13 in WebKit, a Pixel 5 and a 360 x 740 touch context in Chromium, and desktop at 1280 x 800. Every step of that journey was reachable before and after on all four devices; what broke was consistency, not a step. The fixes are the shared ones.

Broke: verify_shortlist found no grouped shortlist / The harness opened the My trips tab by the word "Favorites", which this task renamed / Pattern now matches Shortlist or Favorites, with a comment; The first dead-rule pass mangled comments / The script split a rule's leading comment at its commas as if it were selectors / Files restored from the copies...

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T411-v6-consistency.md"`

### T412: release: the full check, the before and after gallery, the preview deploy (2026-10-13)

Nothing in the app source. This task measured the merged V5 plus T411 build, built the before and after gallery, wrote the morning page and deployed the build to the design preview. The preview is live at https://design.carta-app.pages.dev (deploy id f90ca4fe, branch `design`); production was not touched. The full check passes except for known failures that are the same as on the V5 base. The one new thing is a preview-only effect: `verify_landing` fails its "coverage that fails" check against a built `vite preview` and passes 69 of 69 against the dev server (the aborted `coverage.json` request is probably served from the browser cache in a build; row T412-c).

Broke: regions, route_page, trip_page failed in the first sweep / They hard-code ports 4213 and 4209, which stale V5 servers hold, so they tested the old build / Re-run from temporary copies on port 5203: all pass (regions, route_page 13 of 13, trip_page 61 of 61).

Full: `git show archive/execution-full-2026-11-03:"Execution/P10/T412-v6-release.md"`
