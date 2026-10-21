# Design direction v6

> **Superseded in part by Lagoon (2026-10-13, T419 to T425).** The look is now Lagoon: white on warm light grey, blue-grey ink, lagoon teal for actions, selection as a light tint (never `--ink-fill`), one typeface (Figtree) with tabular figures and no separate mono face, plum for hidden gems. Where this file and DESIGN.md or the carta-design skill disagree on colour, type, selection, radius or elevation, those win. The structural rules here (motion, the receipt, detail page grammar, the phone, the planning journey) still hold unless DESIGN.md says otherwise. Live reference: `/?styleguide`.

Written by T380 (design wave V2, 2026-10-08) from the ten surface briefs in `docs/design-v6/briefs/`, the research in `TRIP-PLANNING-RESEARCH.md`, PRODUCT.md, DESIGN.md and the carta-design skill. The owner delegated the design calls in this pass to this session on 2026-10-07, inside the locked palette and type; every call below is recorded so the owner can overrule it later. Precedence stays as the waves state it: carta-design and DESIGN.md win over this file, this file wins over impeccable, the research and taste. A pattern this file does not cover is not built; it becomes a register row for the next wave.

This file was committed first as the plan for T380 and then carried out. Part 10 lists what the plan changes in which file.

## 1. Thesis

The owner asked for Carta to be more modern, more visual, more professional and above all more dynamic, with the same colours and styling. Inside the locked palette and type, those four words mean exactly this:

More modern means fewer things on the screen, each one earning its place: one primary per view, one selected state, one close control, one scrim, one count chip, one way to update a figure. The accent is spent on the single action or the single live thing in a view and on nothing decorative. Chrome recedes; the page's content, the prices and the places, is what the eye lands on.

More visual means real photographs of real places with their captions under them, maps that show the thing the page is about, and one family of small data drawings (month strips, bars, profiles, the cost bar, the receipt) in the ink ramp, so that a traveller reads a place at a glance before reading a sentence about it. Never text on a photograph, never a gradient, never an illustration standing in for content.

More professional means the instrument voice carried through: measured figures in mono with their pedigree, estimates marked in text, labels in sentence case, hairlines between facts and borders only around bounded objects, type set to a scale rather than per screen, and every control reaching the tap floor.

More dynamic means motion that explains state and relationship and nothing else: figures that settle in place when an input changes, a list item that becomes its page, a sheet that rises from where it was asked for, a map camera that moves to the thing the traveller chose, a route that draws itself once. Motion has tokens, every motion has a reduced-motion branch, and nothing moves because the page scrolled.

The order of work inside the thesis is the traveller's order (research section 2 and the shell brief's part 5b): can I afford it, is it good in my month, what is there for me, can I get there and around without a car, and then keep it. Every surface puts those answers first, in that order, and the shell shows the inputs the answers depend on.

## 2. Motion

### 2.1 Tokens

Added to `src/styles/01-tokens.css` by T380 and recorded in DESIGN.md in the same pass.

| Token | Value | Use |
|---|---|---|
| `--dur-1` | `120ms` | Immediate feedback: a press, a chip toggling, a hover tint, a check appearing |
| `--dur-2` | `200ms` | A routine state change: a fold opening, a figure settling in place, a chip entering or leaving, a tab's content arriving, a row sliding to its new place |
| `--dur-3` | `320ms` | A surface arriving or leaving: a sheet, a panel, a dialog, a shared element becoming its page, the grid to map crossfade |
| `--dur-4` | `480ms` | One authored moment that moves distance: a map camera move, one leg of the route reveal |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Arrivals and settles: anything that appears or lands |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Movement between two on-screen positions: a reorder, the active marker sliding, a scrub marker |

Exits are faster than entrances: a surface leaves in `--dur-2` with `--ease-in-out`. Nothing uses an overshooting or elastic curve; the two overshoot curves in the stylesheet today (`14-filters-panels.css` price pill, `20-day-planner-flow.css` flash) are retired by their owners. JavaScript that needs a duration reads the token through `durationMs()` in `src/lib/motion.js` rather than repeating the number.

### 2.2 What the carta-design motion rule becomes

The rule in carta-design and DESIGN.md read "transitions under 300 ms on transform and opacity only". T380 relaxes it to this, with the same reduced-motion requirement on every branch:

Routine motion uses `--dur-1` or `--dur-2` and animates `transform` and `opacity`. A press, a hover or a selection may also animate `background-color`, `border-color` and `color` at `--dur-1` and no longer. A surface arriving or leaving, a shared-element transition and the grid to map crossfade may take `--dur-3`. A map camera move and the one-time route reveal may take `--dur-4` per movement, and the route reveal is capped at 900 ms in all. A reveal may animate `clip-path`, `mask-position` or `stroke-dashoffset`. Nothing animates `width`, `height`, `top`, `left`, `margin`, `padding`, `grid-template-*`, `box-shadow`, `filter` or `backdrop-filter`, and `transition: all` is never written. Durations and easings come from the tokens; a literal duration in a v6 stylesheet is a lint finding for the build wave that writes it.

### 2.3 What moves, and its reduced-motion branch

| Moment | How it moves | Under `prefers-reduced-motion: reduce` |
|---|---|---|
| A figure updates in place (receipt total, day cost, count, leg price, estimate band) | Tabular mono, the box keeps its width; the figure's container dips to 0.35 opacity and back over `--dur-2` with `--ease-out`; a delta in words may appear beside it for three seconds; no count-up, no scale bump, no sweep. Shared primitive: `settleFigure()` and `useSettledFigure()` in `src/lib/figureChange.js` | The figure changes at once; no dip, no delta motion (the delta text still appears) |
| List to detail (card to page) | The card's photograph grows into the page's header photograph through `src/lib/sharedElement.js`; a receipt card may carry into the page's receipt when both show the same figures. `--dur-3` | The page opens as it always did |
| Sheets, panels, dialogs | Rise from the bottom (phone) or fade and rise 8 px (desktop) in `--dur-3` `--ease-out` over the one scrim; leave in `--dur-2`. The scrim fades with them | Appear and disappear at once |
| Tab change | The new tab's content fades in and rises 8 px in `--dur-2`; the outgoing tab does not move; the active marker slides between items with a transform | Content appears at once; the marker jumps |
| Map camera | MapLibre `easeTo` and `flyTo` with `durationMs('--dur-4')`; the camera moves to the thing chosen, never on scroll | MapLibre reads the preference itself and jumps |
| Reordering (stops, cities) | The moved row slides to its place with a transform in `--dur-2` `--ease-in-out` (FLIP); other rows shift the same way | Rows jump |
| Press and selection | `:active` scale 0.97 and opacity in `--dur-1` (the touch feedback already shipped); a selected chip's fill changes in `--dur-1` | No scale; fill changes at once |
| Chips entering and leaving a filter row | Opacity and scale from 0.9 in `--dur-1` | At once |
| Grid to map switch | The map frame crossfades from its still placeholder to the canvas in `--dur-3` | Swap |
| Route reveal (planned trip first opens) | Leg by leg with `stroke-dashoffset`, at most `--dur-4` per leg and 900 ms in all, once per open, never on scroll | The whole route is on the first frame |
| Loading | A still `--paper-dim` block of the final height; no shimmer, no spinner, "Loading" for screen readers. The existing skeleton pulse stays where it is until its owner retires it | Already still |

What never moves: anything because the page scrolled (no parallax, no scroll-triggered reveal, no counters), decorative hover lifts on cards, a flip or 3D turn, text, a photograph that is not a shared element, the bottom nav, and any figure that has not changed. Numbers never jitter and never count up: a count-up shows the traveller forty wrong figures on the way to the right one (PRODUCT.md, "Numbers must line up in columns and must not jitter when they change").

The global reduced-motion floor in `02-base.css` (every duration to 0.01 ms) stays as the safety net; every rule a build wave writes still carries its own branch so that the branch reads at the rule.

## 3. Imagery

Photographs are real, licensed and credited, from the photo contract the pipeline already enforces; never generated, never stock illustration (carta-design never-list, items 7 and 8). Maps are MapLibre on the house tiles. There is no other kind of picture in the product: no icon tiles, no decorative SVG scenes, no gradient grounds.

Crops and ratios. One aspect per row: 3:2 on browse and library cards, 16:10 only on the two-up phone grid where 3:2 would leave the card too short, 1:1 for thumbnails at 44 px. A hero is at most 40 percent of the viewport height on a phone and 60 percent on desktop, so the first figure is above the fold. From 1024 px a detail page's first photograph may sit beside the head instead of above it. A missing photograph shows the existing flag-and-name placeholder on `--paper-dim`, never a grey or tinted box.

Text never sits on a photograph. The caption (name, figure, length, credit) sits in a solid `--paper` or `--bg-card` band flush under the photo, as the suitability strip does. This retires every gradient scrim on a photo card (the country cards, the trip style cards, the favourite and journey cards, the wizard's country cards). The pressed state of a photo card is the band turning `--ink-fill`, so it reads in greyscale.

Credits are text, never hidden in a `title`: author and licence in `--ui` 12 px `--ink-mute` under the photo or in the sources fold, with the licence linked where the contract requires it.

The landing page carries no photograph in its hero: the receipt is its picture. Photographs appear further down only where they stand for a place the visitor can open.

## 4. Data visualisation

One family, in the ink ramp, so that every small drawing on every surface reads as the same instrument. Nothing in this family uses `--accent` except the single selected or live item, and nothing uses a hue as its only carrier.

The grammar:

- Weight is the scale. Comfort, share, density and level are drawn as ink weight (`--kind-metro` to `--kind-area`, or `--ink`, `--ink-soft`, `--ink-mute`, `--rule`), filled up to the level and outlined beyond it. The suitability strip's five squares are the pattern.
- The figure is always beside the drawing. A bar, a strip or a profile never replaces the number; the number sits in `--mono` next to it with its unit and its pedigree word, and the drawing reads the same when removed.
- No legend. The axis is the row's own labels (month initials, the receipt's line names, km along a route). Where a strip encodes data on a card, one text key at the list head explains it, never colour alone.
- Selection is one item in `--accent`: the chosen month outlined in `--ink` and the live day's route in `--accent` on a map, the scrub marker in `--accent` on a profile. Everything else is ink.
- Good news in data may use `--green` as text or as the cheapest band of a gauge, with the words that say so. Cautions use the amber tokens. Never `--danger`, never `--rate`, never a second saturated hue.

The members and their rule of thumb:

| Instrument | Shape | Where |
|---|---|---|
| Month strip | Twelve cells, best months filled by weight, the traveller's month outlined 2 px `--ink`, a word beside it ("Best Apr to Jun; quiet"); high, low and rain in `--mono` above and below where the page has them | Destination page, journey page, mountain page, Explore preview, country brief |
| Thin bar | At most 8 px high, the full width of its row, segments in the ink ramp separated by 1 px `--paper`, no figures on the bar | Cost bar above a receipt, coverage rows, pass allowance, day strip |
| Profile | Elevation on a km axis, surface and traffic as tracks under it on the same axis, one `--accent` marker shared with the map | Trail, cycle route, tour, journey route |
| Gauge | Five segments in `--ink`, the cheapest band may be `--green` | Explore cards |
| Squares | Five squares filled to the level | Suitability strip, key facts band |
| The receipt | `--paper-dim` head, hairline lines with the figure right aligned in `--mono`, 2 px `--ink` rule, the sum, the `--accent-bg` footer with the one-input counterfactual; the cost bar may sit above its lines | Every surface that justifies a total |
| Timetable row | Label over value in `--ui` 12 px `--ink-soft` and `--mono`, hairlines between cells | Key facts band, settings line, getting-there block |

## 5. Layout rhythm, type scale, elevation, icons

Rhythm. New and touched rules take the spacing scale: `--space-2` inside a control, `--space-3` between a label and its value, `--space-4` between rows, `--space-6` between sections on a phone and `--space-7` on desktop, more space above a heading than below it. The content column caps at 1180 px. Lists get hairlines (`--rule-soft`), objects get borders (`--rule`); on a detail page the receipt is the one bordered object and the folds are sections under hairlines. No bento, no nested cards, no card inside a fold.

The type scale. Fraunces appears at five sizes and no others, all weight 600 unless noted:

| Role | Phone | Desktop | Where |
|---|---|---|---|
| Page title (one `h1` per view) | 28 px | 40 px | Landing title, the destination's name, a trip's name, My trips |
| Section or object name | 22 px | 26 px | A fold's `h2`, a style card's name, the next trip card |
| Card or row name | 19 px | 19 px | Browse cards, rail cards, pins' name tips (weight 500) |
| Caption name | 16 px | 16 px | Caption bands, saved rows |
| Receipt head | 15 px | 15 px | The receipt's destination line |

Everything else is `--ui`: 14 px body at 1.45, 13 px secondary, 12 px metadata in `--ink-mute` (never body), 16 px on an input so iOS does not zoom it. Measured facts are `--mono` with `tabular-nums`: 15 px in a receipt line, 13 px on a card, 11 px in a count chip. Fraunces is never used for a number, a label or running text, and no uppercase eyebrow exists anywhere.

Elevation. The three shadows and no other: `--shadow-card` on a card or the receipt, `--shadow-2` on a dialog, sheet or popover, `--shadow-1` on a sticky band only if it must separate from content scrolling under it (the section rail and the refine row have none; they use the `--rule` border). A border and a shadow are not stacked on the same object except the receipt.

Icons. One set, `src/components/Icons.jsx`, drawn at 20 px with a 1.5 px stroke in `--ink-soft` (the Glyph helper's 1.6 moves to 1.5; shell V4 does it), decorative ones `aria-hidden`, labelled ones with a translated label. No tile behind an icon, no filled or 3D icon, no emoji or Unicode glyph standing in for one ("×", "x", "→" are retired; CloseIcon and the arrow icons replace them). The glossary marker is the InfoDot, never an "i" in a circle.

## 6. Density per mode

Operate (Explore, Destinations, the Trip planner, the Day planner, My trips, Account): dense by design. Forty prices on one phone screen must still be told apart (PRODUCT.md). The inputs the figures depend on are visible at the top, the count of what is shown is visible, every card carries a figure, controls are secondary unless they are the view's one primary, and whitespace separates groups rather than padding cards. A phone screen of a browse tab shows its first priced card within 300 px of the top (Explore target) and its first trip card within 360 px (Trips target).

Read (the destination page, the outdoor pages, the trip page, the shared trip view, the legal pages): one column of sections in the traveller's order, folds under hairlines, a section rail once there are three or more sections, prose at 14 px in a 45 to 75 character measure, figures in timetable rows. The receipt and the key facts band come before any prose.

Persuade (the landing page): one claim with a verb, the receipt as proof, one primary, the running instrument line from `meta`, then the priced list for the undecided. No stat counters, no testimonials, no hero photograph. Persuasion is the live reprice.

The admin page is Operate and only follows consistency rules; nothing in it is redesigned.

## 7. The phone (T414)

Phone first everywhere. The phone layout is designed first and the desktop adds to it; a desktop layout is never shrunk to fit.

Breakpoints and what each adds. The small floor is 360 px: every view holds there with no horizontal scroll, labels shrink before they truncate (the bottom nav's pattern). Below 769 px is the phone: the five-slot bottom nav, sheets for choices, pages for detail, one column. From 769 px the header carries the tabs and the bottom nav is gone; the detail panel takes `--panel-w`; two columns where the content has two jobs (list and map, plan and receipt). From 1024 px: map and list side by side on Explore and the destination page, the two-column detail page (plan column, sticky side column with the strip and the receipt), the hero beside the head, hover detail, and three day-track cards across. 1180 px caps the column. The stylesheet's 768/769 pair stays the phone edge; 720 and 700 are legacy edges that the v6 sheets do not add to.

Safe areas and viewport height. Every fixed or sticky bar reads `env(safe-area-inset-*)`: the bottom nav and the bottom slot add `env(safe-area-inset-bottom)` to their padding, the header adds the top inset, full-screen pages and sheets add the left and right insets in landscape. Full-height layouts use `100dvh`, never `100vh` (12 rules say `100vh` today and 3 say `100dvh`; each owner replaces its own in V5), so a collapsing address bar never hides a bar or a button. `--bottom-nav-h` stays the one source for the nav's height and is `0px` where the nav is hidden.

The thumb zone. On a tall phone the one primary action sits in the lower half of the screen, inside the content and above the bottom nav: at the end of the receipt, in the hand-off band, in the wizard footer. Nothing primary sits in the top bar. A sticky primary over content is not a pattern Carta uses (landing R5 rejected): the page is ordered so the primary arrives within the first screen, and if it cannot, the content above it is shortened.

Sheets versus pages. A choice opens a sheet (filters, Lifestyle, the plan chooser as a menu, a town's compact receipt, the "Which day" picker): it rises over a scrim, keeps the page behind it, has a grab handle, a `--tap` close and one primary, and never covers its own primary with the bottom nav. A thing with an address opens a page (a destination, a trail, a trip, a journey, a region, My trips, Account): full screen on a phone with one back control that names what it returns to, its own URL, and the browser's Back closing it. A page never opens inside a sheet and a sheet never holds a second sheet.

Gestures are shortcuts only. Swiping a track, a deck or a sheet does what a visible button also does (Previous, Next, Close); dragging a stop does what the up and down buttons do; pull to dismiss closes what the cross closes. Nothing is reachable only by swipe, long press or hover, and `:hover` rules are wrapped in `@media (hover: hover)` so that a tap never leaves a hover state behind.

Landscape (844 x 390). The bottom nav stays; the header shrinks to one row; a sheet caps at 80 percent of the height and scrolls inside; a map view gives the map the width and puts the list in the bottom drawer; nothing depends on the viewport being taller than it is wide.

The on-screen keyboard. When an input takes focus the field and its submit stay visible with the viewport 40 percent shorter: forms place the submit directly under the last field, never in a footer pinned to the bottom, and the bottom nav hides while an input inside a sheet or full-screen page has focus (`:focus-within` on the sheet sets `--bottom-nav-h: 0px`), so the nav never rides up over the field. Inputs are 16 px so iOS Safari does not zoom.

Tap targets. `--tap` on a coarse pointer, 32 px allowed under `@media (pointer: fine)` only. Map pins carry a 44 px hit box whatever their visual size. Icon-only controls get the box even where the glyph is 15 px.

What desktop adds beyond a wider phone: side by side map and list with hover and focus linking the two (a 2 px `--ink` ring on the pin, a 2 px `--ink` outline on the card), the hover preview popover after 150 ms, keyboard shortcuts on the map layer (the 30-stop pin layer), arrow keys on rails, tracks and decks, two-column detail pages with a sticky receipt, the header tabs as real links, and `pointer: fine` compact controls.

What only a real phone can prove goes into one owner row per build session, listed: haptics (`navigator.vibrate`), the install prompt, the real keyboard's height and its effect on `dvh`, scroll momentum and rubber-banding on a snap track, and iOS Safari's bottom bar collapse on landscape. WebKit on Windows is close, not the same.

## 8. The planning journey across surfaces

One traveller, one holiday, five steps, each with one owning surface and a hand-off that carries the inputs forward. The shell shows the inputs on every priced view (the settings line) so they are never asked twice.

| Step | What the traveller is doing | Owning surface | What it hands on |
|---|---|---|---|
| Dream | No destination yet (59 percent start that way); a budget, a month, maybe a region | Landing (first visit), then Explore | People, nights, stay tier into the shared choices; a priced list of places to open; the budget ceiling and month into Explore's input row |
| Choose | Comparing many places on one screen; shortlisting two to four | Explore (towns, price first) and Destinations (outdoor places and trips, fit first); the outdoor pages and the trip library for depth | A destination opened from a card with its figure already shown; a shortlist in My trips; the chosen month outlined on every strip |
| Budget | One place, one receipt: what a day costs here for us, from where, in which month | Destination page (the receipt is the focal object) and the trip page (the trip's own receipt) | "Plan a trip here" or "Choose this trip" with the destination, the dates, the party and the lifestyle already set |
| Plan | Towns in order, nights per town, legs priced by mode; then each day hour by hour | Trip planner (the wizard, then the planned view) and the Day planner (the workspace) | The planned trip's days into the Day planner one by one; the saved trip into My trips; exports (PDF, KML, ICS, GPX) for the pocket |
| Keep | Saving, sharing, returning, and after the trip the record | My trips and Account | What changed since you saved (a later wave), the share link, the record |

The hand-offs are the places where the figures must agree to the cent: the Explore card, the destination receipt, the journey receipt, the planner's estimate band and total, the day's cost line and the saved card all read `src/lib/costIndex.js` at the same lifestyle. A figure that reaches a screen by another path is a bug, not a design choice.

What the shell owes every step: the settings line (origin, dates or "Any dates", party, Lifestyle, language, "Prices in EUR"), every tab and page as a link with history, the one scrim, the one close, the bottom slot for toasts and notices, and the My trips count.

## 9. The rule table

Every "Needs a rule" proposal from the ten briefs, accepted or rejected with the reason. "Accepted" means the rule is now in the carta-design skill (Components or Interaction) and in DESIGN.md; "as amended" means the house rule differs from the proposal in the way the row says. A rejected rule is not built; a build item that depended on it drops or follows the fallback the brief named. Where several briefs proposed the same thing the house rule is written once and the rows point to it.

| Brief and ID | Proposal | Decision | House rule or reason |
|---|---|---|---|
| shell R1 | Landing page is home; brand and logo link to it, no nav slot | Accepted | Navigation: the brand mark and the phone logo are links to the landing page on every screen. Which visit opens where stays the owner's (T194-a) |
| shell R2 | The settings line | Accepted | Settings line (new rule): one line on every priced view with origin, dates or "Any dates", party, Lifestyle, language and "Prices in EUR"; `--ui` 13 px `--ink-soft` labels, values in `--ink`, figures in `--mono`; each part a `--tap` button opening the control that sets it; no accent; on a phone one line, dropping parts from the left and keeping Lifestyle |
| shell R3 | Badges on navigation | Accepted | Count chip (new rule, shared with account 5): `--mono` 11 px `--ink` on `--paper-dim`, 999 px, after the label, never `--accent`; a state dot is 6 px `--ink-fill` with an aria-label; no badge when nothing is new |
| shell R4 | Active section is an `--ink-fill` pill on both widths | Accepted | Selected state (new rule, shared with shell R8, destinations N9, tripplanner N6, account 6) |
| shell R5 | Section change motion | Accepted | Motion table, "Tab change", with `--dur-2` |
| shell R6 | The bottom slot | Accepted | Bottom slot (new rule): transient messages stack in one slot above the bottom nav (phone) or bottom centre (desktop), newest on top, at most three, each with a `--tap` close, never over the nav or a sheet's primary |
| shell R7 | One close control | Accepted | Close control (new rule): CloseIcon at 16 px in a `--tap` box, top right (inline right on a toast), transparent, `--ink-soft`, translated "Close"; no letter x, no "×" |
| shell R8 | Selected tiles and chips in `--ink-fill` | Accepted | Selected state |
| shell R9 | Navigation is a link and leaves history | Accepted | Navigation (new rule, shared with trips R4): every element that changes the view is an `<a href>` with the view's URL, a section change pushes one history entry, Back returns to the previous section, `<button>` is for actions; every detail page has a URL, a save star and a share in its bar |
| shell R10 | Dialog family | Accepted | Dialog (new rule): one radius (12 px), `--shadow-2`, the one scrim (`--ink` at 28 percent, no blur), the one close, focus trapped, Escape closes; a choice of two items from the bottom nav is a menu, not a dialog |
| shell R11 | No decorative accent marks | Accepted | Accent (new rule): an accent mark means "this one acts" or "this one is live"; no accent tick, stripe or dot on an unselected or inert control |
| landing R1 | A short priced list on the landing page | Accepted | Priced list (new rule): at most five rows under a heading with a verb or a number, each a real link, name `--ui`, figure `--mono` with its pedigree word and tilde, hairlines, cheapest first, no badge or accent, the same functions as Explore so figures agree to the cent |
| landing R2 | A photograph on a toggle | Rejected | The landing's phone fold (brief V3-5) is the hardest target on the surface and three photographs above the receipt push the receipt off the first screen and become the LCP. The landing's picture is the receipt (part 3). Toggles stay words with the R7 metadata line. The owner may overrule; register row |
| landing R3 | Shared element for a non-image element | Accepted | Motion table, "List to detail": a receipt card may carry into the page's receipt only when both show the same figures |
| landing R4 | Bars in a coverage table | Accepted | Thin bar (part 4): at most 8 px, ink ramp, under the numbers, never replacing them |
| landing R5 | A sticky primary on a phone | Rejected | Part 7, the thumb zone: Carta puts the primary in the page order within the first screen; a sticky band competes with the bottom nav and the bottom slot (R6) and is the pattern every booking site uses. Fallback: shorten what sits above the primary |
| landing R6 | Motion tokens for a reprice | Accepted | Figure in place (new rule, shared with tripplanner N2): the motion table's first row |
| landing R7 | A toggle with a metadata line | Accepted | Toggle metadata (new rule): one line under the label in `--ui` 12 px `--ink-soft`, `--on-fill` when pressed; the button stays `--tap`; the label stays the accessible name with the metadata appended |
| landing R8 | A receipt fragment used to illustrate a claim | Accepted | Receipt (extended): a single receipt line may appear outside a receipt only when read live from a receipt on the same page and set exactly as the receipt sets it |
| explore N1 | Input row on a browse page | Accepted as amended | It is the shell's settings line followed by the surface's own filters (ceiling, month, car-free) in one band; the Lifestyle door loses its `--accent-bg` tint (shell R11) and is secondary chrome like the rest of the line |
| explore N2 | Budget ceiling | Accepted | Budget ceiling (new rule): a stepped select of fixed euro steps per person per day for the ground cost (Any, 40, 60, 80, 100, 130), "Up to €N a day", never a free slider, never including a flight; it filters, it does not re-price |
| explore N3 | Stand-in figure on a card | Accepted | Pedigree word (new rule): a figure that includes a country-level stand-in carries the word "national" in `--ui` after it, InfoDot on first occurrence per view; an estimate keeps the tilde and "est."; a town-measured figure carries no word |
| explore N4 | Price pin labels on a WebGL map | Accepted | Price pins (extended): from zoom 7 at most 30 DOM labels, name `--ui` 12 px and figure `--mono` 12 px on `--bg-card` with a `--rule` border and 6 px radius; the cheapest in view is `--accent` with `--on-fill`; other pins stay dots; clusters `--paper-dim` with an `--ink-mute` stroke, never `--rate` |
| explore N5 | List to map highlight in ink | Accepted | Map and list in sync (new rule, shared with destination 6, trips R9, dayplanner N5): hover or focus rings the pin 2 px `--ink` and outlines the card 2 px `--ink`; the committed selection (the chosen day, the chosen place, the cheapest pin) is the one `--accent` on the map; nothing else on that map is `--accent` |
| explore N6 | Card preview popover | Accepted | Popover (new rule): `--bg-card`, `1px solid var(--rule)`, 10 px radius, `--shadow-2`, at most 320 px wide, beside or over the lower half of the card, never over the photograph, never an ink fill; opens on hover after 150 ms, on focus after 400 ms, on Enter or tap at once; closes on Escape; `--dur-1` opacity and 4 px rise |
| explore N7 | Cost gauge colours | Accepted | Part 4, gauge |
| explore N8 | Cost-led rail | Accepted | Rails (new rule, shared with destinations N4): the first rail on a browse page may be a cost cut sorted by day cost with country interleave; it follows the rail grammar |
| destinations N1 | Cost line on an outdoor card | Accepted | Cost on cards (new rule, shared with tripplanner N1, outdoor N3, account 3, trips R1): a card or page that offers a place or a trip carries one `--mono` line with the day cost per person at the traveller's Lifestyle (or the trip's ground total for the party) from `costIndex.js`, with the pedigree word, the tilde and "est." where estimated, the town named when the figure is a nearby town's (within 25 km), and no figure when the data is too thin; never a flight, never a bookable claim |
| destinations N2 | Month fact on a card | Accepted | Month (new rule, shared with trips R5): when the traveller has a month (from the settings line's dates or a month select), a card may carry one measured month fact in `--ui` with the month in `--mono`; a month select is twelve months plus "Any" in `--ui`; the chosen month is outlined on every strip in view; never a forecast, never without a month |
| destinations N3 | Sticky refine row | Accepted | Sticky band (extends the section rail rule): at most one sticky band per list under the top chrome, `--paper`, `--rule` bottom border, `--tap` high, no shadow, holding only Filters, sort, country and the active chips |
| destinations N4 | Rails and cut chips | Accepted | Rails (new rule): heading, "See all N", arrows on a fine pointer, arrow keys when focused, position in `--mono`, dots hidden from screen readers, scroll-snap, no autoplay or looping; at most two rails per screen on a phone, further cuts as one row of chips applying the same filter; one aspect per rail |
| destinations N5 | Photo captions | Accepted | Caption band (new rule, shared with trips R2, tripplanner N5, account 4): part 3 |
| destinations N6 | Active filter chips | Accepted | Filter chips (new rule): one row of removable chips above a filtered list, each named "Remove <filter>", `--paper-dim` with `--ink` text and a `--rule` border, ending with "Clear all"; one component on Explore and Destinations |
| destinations N7 | Coverage count on an index card | Accepted | Index cards carry their published count in `--mono` beside the name |
| destinations N8 | Data strip key | Accepted | Part 4, "No legend": one text key per list head |
| destinations N9 | 2 x 3 categories on a phone | Accepted | Up to six categories as a 2 x 3 grid of equal buttons on a phone, never a sideways strip that hides some; the active one is the selected state |
| destinations N10 | Remembered browse state | Accepted | Remembered state (new rule, shared with destination 8): a view may restore the viewer's last category, country, near place or open folds from browser storage as a per-viewer convenience, every read and write in try/catch, the view correct without it; folds within a session only; never opening what the traveller did not |
| destination 1 | Month colours in the ink ramp | Accepted | Part 4, month strip; `--climate-good` and `--climate-poor` stay only where the trip pages already use them until their owner retires them |
| destination 2 | One day figure per page | Accepted | One figure (new rule): a page shows one per person per day figure read from its one receipt; every other mention of a day cost on the page is that value |
| destination 3 | Estimates as ranges | Accepted | Estimate (extended): where the model gives a range the estimate may show as "~ €80.00 to €95.00 est." in `--mono`; never on a measured figure; a total that sums ranges says it sums the midpoints |
| destination 4 | Page-end utility row | Accepted | Download and report sit in one row of secondary buttons before the honest footer, never in the head |
| destination 5 | Folds without card chrome | Accepted | Part 5, rhythm: on a detail page a fold is a section under a `--rule-soft` hairline, no box, no shadow, icons `--ink-soft`; the receipt is the one bordered object |
| destination 6 | Map and list in sync, selected row `--accent-bg` | Accepted as amended | The list side uses ink (2 px `--ink` outline), not `--accent-bg`, so that `--accent-bg` is never a selection colour (tripplanner N6); the map side is `--accent` as proposed |
| destination 7 | Still loading placeholder | Accepted | Motion table, "Loading" |
| destination 8 | Remembered folds | Accepted | Remembered state |
| destination 9 | Hero beside the head from 1024 px | Accepted | Part 3 |
| destination 10 | Initial focus on a full-screen page | Accepted | Focus (new rule): opened by pointer, focus goes to the page heading (tabindex -1, no visible ring); opened from the keyboard, the first control takes it; closing returns focus to the opener |
| outdoor N1 | Key facts band | Accepted | Key facts band (new rule): one open band of four to six measured facts under the head, timetable rows (part 4), a missing value shows the strip's placeholder word; no card, no colour |
| outdoor N2 | Hand-off band | Accepted | Hand-off band (new rule): every detail page has one band after the key facts and Before you go, holding its one primary and at most four secondaries in a fixed order; the primary is the file on route pages and the priced trip to the base on place pages |
| outdoor N3 | Cost line on an outdoor page | Accepted | Cost on cards |
| outdoor N4 | Before you go as one block | Accepted | Not-for and hazard lines render as one block under one heading, safety first, never folded, never repeated |
| outdoor N5 | Signature honesty | Accepted | A signature panel draws only measured tracks; an unmeasured one is named once in the sources; empty tracks stay allowed inside a folded row |
| outdoor N6 | Status containers never tinted green | Accepted | Status (new rule, shared with account 7): a positive verdict or confirmation is `--ink` text with a 6 px `--status-success` dot, on paper or `--bg-card`, never a green container or green text; the amber tokens stay for warnings; `--green` stays for good news in data |
| outdoor N7 | Photo track | Accepted | Photo track (new rule, shared with account 9): two or more photographs run as one horizontal track on the day-track mechanics (snap, Previous and Next secondaries, position in `--mono`, arrow keys, no autoplay, no tab roles), each frame with its credit, labelled by caption |
| outdoor N8 | Map placeholder as a static ink drawing | Accepted | Motion table, "Grid to map switch", and part 4: while a map loads its box shows the item's own line or point in ink from geometry on hand, then crossfades in `--dur-3` |
| outdoor N9 | Back label names the list | Accepted | Part 7, pages: one back control that names what it returns to |
| outdoor N10 | Rows cap at five | Accepted | A detail page shows at most five folded rows; more content is grouped into them |
| outdoor N11 | Linked figure and map share one `--accent` marker | Accepted | Part 4, profile, and the map-sync rule |
| trips R1 | Price on a collection card | Accepted | Cost on cards: "From €N a person" with the length it is priced at, from the cheapest member, never an average |
| trips R2 | Caption band, not text on a photograph | Accepted | Caption band |
| trips R3 | The trip receipt | Accepted | Receipt (extended): on a trip page the trip's own itemised budget is the receipt; a receipt for a nearby town is a labelled second view and never carries its own stay select |
| trips R4 | Addressable detail pages | Accepted | Navigation |
| trips R5 | Month as a filter on a list | Accepted | Month |
| trips R6 | Section header icons `--ink-soft` | Accepted | Part 5, icons |
| trips R7 | Derived summaries stay silent | Accepted | Derived copy (new rule): a sentence generated from data is shown only when the authored text agrees with it; thin or contradicting data shows nothing or the authored words, never "0 of N" |
| trips R8 | Two-column detail page on desktop | Accepted | Part 7, from 1024 px |
| trips R9 | Map of a multi-day plan | Accepted | Map and list in sync: stops numbered by day, the selected day `--accent`, the rest `--ink`, beds as `--paper` squares with an `--ink` border, selection shared with the day track, and one sentence under the map when the line is not the measured path |
| trips R10 | One five-step difficulty scale | Accepted | One i18n group for the five difficulty words, no banned word, every surface reads it |
| tripplanner N1 | Cost on choice cards | Accepted | Cost on cards |
| tripplanner N2 | Reprice motion | Accepted | Figure in place: `--dur-2` opacity dip (the proposal's 150 ms rounds to the token), the delta in words for three seconds, no count-up, none under reduced motion |
| tripplanner N3 | Route reveal | Accepted | Motion table, "Route reveal": `--dur-4` per leg, 900 ms in all, once |
| tripplanner N4 | Month strip in the ink ramp | Accepted | Part 4, month strip |
| tripplanner N5 | Captions under photographs; photo at most a third of the card on a phone | Accepted | Caption band |
| tripplanner N6 | One selected state | Accepted | Selected state: a chip, segment, tab or rail row is `--ink-fill` with `--on-fill`; a selected card has a `2px solid var(--ink)` border and an ink tick; `--accent-bg` is never a selected state |
| tripplanner N7 | Wizard chrome on a phone at most 200 px of 800 | Accepted | Part 7: fixed chrome of a multi-step flow (rail, running total, recap, footer) at most a quarter of the screen, the footer one row |
| tripplanner N8 | "More" menu for secondary actions | Accepted | Menu (new rule): more than two secondary actions in a footer go into one "More" button (secondary, `--tap`) opening a menu with menu semantics; a destructive item in it is `--danger` text |
| dayplanner N1 | The day's receipt | Accepted | Receipt (extended): a day plan carries one per person figure for the day from `costIndex.js` at the Lifestyle; a tap opens the compact receipt with its cost bar; never an unmeasured entry price, never a flight |
| dayplanner N2 | Legs and arrival times in a day list | Accepted | Day list (new rule): between two stops one `--mono` line gives minutes and km by the leg's mode; each stop carries an arrival time; both are estimates, so the first of each per view carries the tilde, "est." and an InfoDot; no hour grid. The build waits on the owner's answer to T378-e, which reverses the August rebuild |
| dayplanner N3 | No floating action button | Accepted | A planning surface puts its ways to add in one labelled toolbar row inside the content; the bottom nav's plus is the only floating control on a phone |
| dayplanner N4 | Day strip | Accepted | Part 4, thin bar: one segment per stop (`--ink`) and leg (`--rule`), widths proportional to minutes, the selected stop outlined 2 px `--ink` |
| dayplanner N5 | Map pins on a planning map | Accepted | Map and list in sync, with the 44 px hit box from part 7 |
| dayplanner N6 | Undo instead of confirm | Accepted as amended | Undo (new rule, shared with account 1 and 2): a destructive action on the traveller's own data runs at once and shows a toast with "Undo" for six seconds while the app holds the object; this covers a stop, a file, a star, a crew name, a co-planner ask, a day plan and a saved trip. An inline confirm (the row replaced by one sentence and two buttons, the safe one first and focused, Escape keeps, no modal) is used only where nothing can be held back: deleting an account, publishing to the gallery, withdrawing a public link. The erasing button is `--danger`, the publishing one `--ink-fill` |
| dayplanner N7 | Day switcher | Accepted | One control "Day N, weekday date" (`--ui`, the date in `--mono`) flanked by Previous and Next secondaries at `--tap`, following the day track's keyboard behaviour; adding a day lives in a menu |
| account 1 | Undo line for low-risk removals only | Accepted as amended | Undo: the scope is wider than proposed (see dayplanner N6); the look is as proposed |
| account 2 | Inline confirm, no modal | Accepted | Undo rule, the confirm half |
| account 3 | Price on a saved card | Accepted | Cost on cards: never a figure stored at save time shown as current; a "since you saved" delta is a second line in words and figures, `--green` when lower, `--ink` when higher |
| account 4 | Caption band under a photograph | Accepted | Caption band |
| account 5 | Count chip in `--ui` 12 px with a `--rule` outline | Accepted as amended | Count chip takes shell R3's form (`--mono` 11 px on `--paper-dim`): a count is a measured number and reads in mono like every other count |
| account 6 | Selected tab and rail row | Accepted | Selected state |
| account 7 | Success line | Accepted | Status |
| account 8 | Plan comparison table | Accepted | Comparison (new rule): a comparison table has items as columns and one row per attribute, figures in `--mono`, the recommended column marked only by the card's existing accent border above it, sticky headers, two columns on a phone with the table scrolling inside itself |
| account 9 | Photo track | Accepted | Photo track |
| account 10 | Password strength in the ink ramp | Accepted | Three steps in `--kind-village`, `--kind-city`, `--ink` with the word beside them; never `--danger`, `--rate` or `--green` |
| account 11 | Milestones and "New" | Accepted | Earned badges `--ink`, locked ones `--ink-mute` outline, "New" a `--rule` outline chip in `--ink`; `--rate` stays for ratings |
| account 12 | Section label | Accepted | A label above a group of controls is `--ui` 12 px weight 600 `--ink-soft`, sentence case, no letter-spacing |
| account 13 | Next trip card | Accepted | On a list of dated plans the first upcoming plan may be one focal card (photo, caption band, countdown, figure, two secondaries) and the rest rows; one size step, not a bento |

Count: 96 proposals, 94 accepted (6 of them as amended), 2 rejected (landing R2, landing R5).

Cross-surface conflicts this table settled, so no build wave has to: the count chip's face (mono), the selection colour (ink, never `--accent-bg`), undo versus confirm (undo wherever the object can be held), the Lifestyle door's tint (none), and the map's accent (one committed item only, the list side in ink).

## 10. What this plan changes, by file

Root repo (branch `p11-v6-direction`): this file; `.claude/skills/carta-design/SKILL.md` (Components and Interaction gain the accepted rules; the motion rule is rewritten per part 2.2; the never list is unchanged); `DESIGN.md` (Motion tokens under a new Motion heading, the Interaction motion line rewritten, the Components section pointing at the skill for the v6 rules, the sync date); `docs/design-v6/OWNERSHIP.md` (new); a "Direction check" section at the end of each of the ten briefs; `Execution/P11/T380-v6-direction.md` and the register rows.

App repo (branch `p11-v6-direction`): `src/styles/01-tokens.css` (six motion tokens); `src/lib/motion.js` (`durationMs()`); `src/lib/figureChange.js` (new: `settleFigure()` and `useSettledFigure()`); `src/styles/60-v6-shell.css` to `69-v6-account.css` (new, header comment only); `src/styles.css` (ten `@import` lines appended after `46-owner-calls.css`); `scripts/check_ownership.mjs` (new: proves every file in `src/` is owned once).

Nothing a traveller sees changes in this task: the ten stylesheets are empty and the tokens are unused until V3. No screenshot set is saved for V2 for that reason; V3 saves its "after" set against V1's "before".

## 11. Open design choices decided (roadmap 1.8, owner, 21 October 2026)

The owner answered these four in the owner calls sheet (T509). They hold on every screen until a later decision replaces them.

| Choice | Decision |
| --- | --- |
| Which price a screen leads with | The price a person a day, on every card, list row, map card and trip card. The group total appears only in budget search (as the headline, with the day price a person under it, T475-c) and on the receipt. |
| Whole euros or cents | Whole euros everywhere, the receipt included. The one open exception is the pass price itself (T503-b). |
| The colour of the save star | Unchanged. |
| The first category of Destinations | Places: Explore always opens on Places (T489-h). |
