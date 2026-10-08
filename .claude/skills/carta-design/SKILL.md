---
name: carta-design
description: The locked design system for Carta, the European budget travel price app at carta-europetravel.com. Use this skill whenever you touch anything visual in the Carta codebase or write any Carta copy, including landing pages, marketing sections, app UI, React or HTML components, buttons, forms, cards, tables, charts, map overlays, emails, Open Graph images, favicons, icons, empty states, error states and CSS. Also use it whenever you are about to pick a colour, a font, a border radius or a shadow, or write a headline, a button label, an error message or an empty state for Carta, even if the request never mentions design at all. If a human will see the output, read this first.
---

# Carta design system

> Rewritten 2026-10-03 (T325) to match the decided state in `DESIGN.md` at the repo root and the
> typography decision of T198. The earlier body taught a cool-grey "Timetable" palette (`--signal`
> blue, Instrument Sans, IBM Plex Mono, no serif anywhere). That palette was built for the landing
> page and then reverted, and it is gone from this file. Values below are copied from the `:root` of
> `continent-app/src/styles.css`. If a value here disagrees with that file, the stylesheet ships and
> this file is wrong; fix this file. T191 (the CSS refactor) may rename tokens, so check names
> against `:root` before relying on them.

## Why this file exists

Carta once had a homepage that looked machine generated, because defaults accumulated one component
at a time. The generic look comes back the same way: in a hurry, when nobody is looking at the whole
page. The rules below are not suggestions to weigh against convenience. Deviating from them needs a
reason you could defend out loud. Read `PRODUCT.md` and `DESIGN.md` first; this file is the judgement
layer on top of them.

## What Carta is

A price transparency tool for budget travel in Europe. You give it dates and a departure airport and
it prices the whole trip for each destination: accommodation, food, local transport and the fare you
enter yourself. Then it plans the trip and each day. Carta does not price flights from a live source.
Never imply that it does.

The audience is people counting money. The only real asset is trust in the numbers, so the look
follows: warm and calm like a paper atlas, precise like an itemised receipt. When a decision is
genuinely open, ask what a good map key or a receipt would do.

## Colour

Warm alabaster ground, deep slate ink, one terracotta accent. The app is single theme: no
`prefers-color-scheme` blocks and no dark variants exist. Reference custom properties, never a hex.
The full table with the one job of each token is in `DESIGN.md`; the ones you will reach for:

| Token | Value | Only for |
|---|---|---|
| `--paper` | `#f8f6f0` | Page ground, and text on a dark fill |
| `--paper-dim` | `#efece2` | Alternating grounds, input fills |
| `--bg-card` | `#ffffff` | Card fill, the only pure white |
| `--ink` | `#0f172a` | Body text, headings, dark surfaces |
| `--ink-soft` | `#414b5e` | Secondary text |
| `--ink-mute` | `#646978` | Metadata and placeholders at 12 to 14px, never body (5.07:1 on paper) |
| `--ink-fill` | `#2b3446` | Fill behind an active control |
| `--rule`, `--rule-soft` | `#ccc7b8`, `#e2ded1` | Borders and dividers; hairlines inside a card |
| `--accent` | `#ce3823` | Terracotta: actions, alerts, live route, focus rings (4.61:1 as text on paper, 4.98:1 under white) |
| `--accent-soft`, `--accent-bg` | `#e97f6b`, `#f7dcd4` | Hover borders; tinted callouts |
| `--accent-hover`, `--accent-press` | `#b7321f`, `#8e3615` | Hover fills of an accent button and a primary cost action |
| `--rate`, `--rate-soft`, `--rate-bg` | ochre | Ratings as a measure. Never actions |
| `--green` | `#4a6a3a` | Good news in data. Never chrome, never a button |
| `--danger`, `--danger-dark` | `#b3372a`, `#96291e` | Destructive actions only |
| `--status-success` | `#10b981` | Indicator dots and ticks. Never text |
| `--gem-ink`, `--gem-bg` | teal | Hidden gems and nothing else |
| `--kind-*` | ink ramp | Place kind, metro to area: weight, not hue |

Rules that matter more than the list:

**One saturated colour.** `--accent` is the only saturated colour in normal use. If a design feels
flat, fix contrast and spacing, not the hue count.

**Ochre is a measure, teal is a gem, red is destruction.** Ratings are never terracotta, because
"Rome 9.5" in a red bubble reads as an error. `--danger` exists because terracotta cannot also mean
"this erases everything", so nothing else may use it. Teal belongs to hidden gems and nothing else.

**Green is data, never chrome.** `--green` and `--status-success` appear in data and indicators. A
green button is not a thing Carta has.

**Warm neutrals are the house ground.** The old ban on cream is retired: `--paper` is the ground. What
stays banned is inventing a new warm tint beside the tokens.

**Three shadows exist, all ink at low alpha** (`--shadow-1`, `--shadow-2`, `--shadow-card`). No other
shadow. No gradients anywhere.

## Type

Three faces, each through its token and never by name. Decision recorded by T198.

```
--display  Fraunces (serif)        display headings and destination names only
--ui       Plus Jakarta Sans       everything else: body, labels, buttons, prose
--mono     JetBrains Mono          measured facts only
```

`scripts/ci/design-lint.mjs` (rule `font-literal`) fails any `font-family` outside `:root` that is not
`var(--display)`, `var(--ui)`, `var(--mono)` or `inherit`. Cormorant Garamond, Instrument Sans and IBM
Plex Mono are rejected. Fonts are self-hosted (T199); load nothing from a Google host.

**One serif, one role.** Fraunces is the only serif and appears only at display sizes (weights 400 to
700). It is never used for running text, buttons, labels or numbers. The old line "no serif anywhere"
is retired.

**The mono rule.** `--mono` carries machine readable facts and nothing else: prices, dates, times,
durations, distances, airport codes, counts, percentages, coordinates. Prose is always `--ui`. A number
inside a sentence is set in `--ui`; a number in a column, a receipt line or a pin is set in `--mono`
with `font-variant-numeric: tabular-nums`. A decorative uppercase mono eyebrow spends the signal on
nothing, so do not write one. If in doubt, use `--ui`.

Body is `--ui` at 14px, line-height 1.45, `--ink`. Two weights in normal use, 400 and 600; 500 on
button labels and table values. Never 700 outside the wordmark and Fraunces display. Format prices
through `Intl.NumberFormat` with two decimals, never raw float output.

## Layout and spacing

- Spacing: `--space-1` to `--space-8` (4, 8, 12, 16, 22, 30, 40, 56px) for new and touched rules.
  `--tap` (44px) is the floor for anything interactive, icon-only controls included. One exception
  (owner, 2026-10-07): on a fine pointer (`@media (pointer: fine)`) a compact control such as the
  small Button may be 32px high. On a coarse pointer it is always `--tap`.
- Radius: 6px on controls, 10 to 12px on cards. `999px` only on real status chips and round icon
  buttons.
- Borders: `1px solid var(--rule)` on anything a user can type into or click; `var(--rule-soft)` for
  hairlines inside an object.
- Lists get hairlines, objects get borders. Divide a run of related facts with rules; reach for a card
  only when the thing inside is a bounded object: a receipt, a plan, a destination.
- The content column caps at 1180px. Layout tokens: `--filter-h`, `--panel-w`, `--bottom-nav-h`.
- Responsive down to 360px with no horizontal scroll (PRODUCT.md's floor; T380 aligned this line with it).
  Phone first: below 769px the five-slot bottom nav, sheets for choices and pages for detail; from 769px the
  header carries the tabs; from 1024px map and list side by side and two-column detail pages.
- Fraunces at five sizes only: 28/40px page title (phone/desktop), 22/26px section or object name, 19px card
  name, 16px caption name, 15px receipt head. Body 14px, secondary 13px, metadata 12px, inputs 16px; mono
  15px in a receipt line, 13px on a card, 11px in a count chip.
- Elevation once per object: `--shadow-card` on a card or the receipt, `--shadow-2` on a dialog, sheet or
  popover; sticky bands use a `--rule` border, not a shadow; a border and a shadow are not stacked except on
  the receipt. Icons 20px, 1.5px stroke, `--ink-soft`, decorative ones `aria-hidden`.

## Components

**Buttons.** Height `--tap`, radius 6px, sentence case, verb first. Primary is `--accent` filled with
white text; an active toggle is `--ink-fill` with white text; secondary is transparent with a `--rule`
border. One primary per view. Two primaries mean neither is the answer.

**Inputs and the search strip.** The search strip is the most important control, modelled on an airline
booking bar: one bordered row divided into fields by hairlines, a small label above a value, the submit
button in the last cell. It collapses to a two column grid on phones with the button spanning full
width. Placeholders show a real valid example, never a repeat of the label.

**The receipt.** Carta's signature element. Use it wherever a total needs justifying: a `--paper-dim`
header with destination and route, one hairline separated line per cost component with the figure right
aligned in `--mono`, a `2px solid var(--ink)` rule above the sum, the sum in `--mono`, and an
`--accent-bg` footer showing what one changed input would do to the total. Never round line items to
look tidier. `24.99` is the point; `25` is a different product.

**Price pins.** City in `--ui`, price in `--mono`. The single cheapest pin is the one emphasised pin in
a view.

**Verdict and rating chips.** Ochre (`--rate`, `--rate-bg`). Hidden gems get the teal badge. Place kind
is the ink ramp, never a rainbow.

**Plan cards.** Equal weight. The recommended plan is marked with an `--accent` border and a badge and
keeps the same background as the other. Never dim the free plan. State limits as plain numbers.

**Cards in general.** `--bg-card` fill, `1px solid var(--rule-soft)` or `--rule`, radius 10 to 12px,
`--shadow-card` at most.

**Suitability strip.** Under a trip hero, a solid `--paper` band at full opacity, flush with the photo's bottom edge, `--rule` border, square corners where it meets the photo. No alpha, no gradient, no text over the photo. Exactly three cells in fixed order: difficulty (five squares, filled `--ink` up to the level, outlined `--ink-mute` beyond it, never `--rate` or `--accent`, plus the level as a word), style (one or two words from tags), total cost (mono face, with currency). A missing value shows a placeholder word ("Unrated", "Mixed", "Price on request") so every trip shows three cells. One row of three on a phone.

**Secondary chrome.** The desktop "Get a pass" chip and the phone's round plus button are secondaries (transparent or `--bg-card` with a `--rule` border; 6 px radius on the chip, `999px` on the round icon button, 44 px minimum target). The accent is kept for each page's one primary action.

The rules below were decided by the owner on 2026-10-07 and written down by T362.

**InfoDot.** One glossary marker for the whole product. A 6 px filled `--ink-mute` dot set after the term or figure it explains, inside a real `<button>` with a `--tap` box and an aria-label that names the term ("What measured means"). It opens a popover: `--bg-card`, `1px solid var(--rule)`, 10 px radius, `--shadow-2`, at most 280 px wide, the term in `--ui` 600 and one or two sentences in `--ui` 13 px `--ink-soft`. The text comes from the shared glossary, never written per screen. Escape, a second tap or a tap outside closes it, and focus returns to the dot. One dot per term per view, on the first occurrence. Never on a heading, a button label or a price pin, and never an "i" in a circle.

**Day track.** Day by day may run as a horizontal track. One card per day, `scroll-snap-type: x mandatory`, about 85 percent of the width on a phone so the next card shows, three cards across from 1024 px. Above the track, right aligned: the position in `--mono` ("Day 3 of 7") and two secondary buttons, Previous and Next, each `--tap`. Arrow keys move one card when the track has focus. Under the track, position dots: 6 px, `--rule`, the current one `--ink-fill`, hidden from screen readers because the counter says the same. No autoplay, no looping, no momentum tricks. Under `prefers-reduced-motion` the track jumps instead of scrolling smoothly. Every day stays reachable as a link from the page's own list or rail.

**Flashcards.** Advisory sections may run as a deck, one card visible at a time. The card is `--bg-card` with a `1px solid var(--rule)` border and square corners, which marks it as a deck card and not an object card. Under it: Previous and Next as secondary buttons and the position in `--mono` ("2 of 5"). Swiping is a shortcut for those buttons, never the only way, and arrow keys do the same. A "Show all" link turns the deck into a plain list, and printing shows the list. No flip, no 3D, no stacked-card shadows; a transform transition under 300 ms with a reduced-motion branch.

**Sticky section rail.** At most one per page, and only when the page has three or more sections. It sticks below the top chrome once the hero has scrolled away: a `--paper` band, height `--tap`, a `1px solid var(--rule)` bottom border, no shadow. Section links in `--ui` 13 px `--ink-soft`, scrolling sideways on a phone. The section in view is an `--ink-fill` pill with `--on-fill` text and a 6 px radius, never `--accent`. Each link is a real `<a>` to the section's anchor.

**Lifestyle control.** There is one Lifestyle control: the existing Lifestyle panel. A surface that lets the traveller change how they travel opens or embeds that control; it never builds a second slider. Where it is shown as a slider it is stepped, one stop per existing level, each stop labelled with its word, and the figures it drives update in place. One sentence in `--ui` under it states the trade-off in plain words with the figure.

**The cost bar.** A receipt may carry one stacked bar as a summary above its lines, never in place of them. 8 px high, the full width of the receipt, one segment per receipt line in receipt order, in the ink ramp (`--kind-*`), separated by 1 px `--paper` gaps. No `--accent`, no legend, no percentages on the bar: each receipt line already carries its figure. A line marked as an estimate keeps its marker in the receipt; the bar does not repeat it.

**No bento grid.** Detail pages do not use tiles of mixed sizes. Slot 6 of the detail skeleton is the collapsed row list (T164).

**Modal dialogs.** Every modal dialog has a scrim: `--ink` at 28 percent behind it, as `.lifestyle-scrim` draws it, and the page behind takes no clicks. This holds for the Lifestyle dialog on every tab.

**Install hint.** Carta may suggest adding the web app to the home screen in one place only: one line with a secondary button ("Add to home screen") in My trips, shown on a phone browser that is not already running the installed app, after the traveller has saved a trip. Dismissed once, it never returns. Never a modal, never on the first run, never a banner over content.

The rules below were decided by T380 (design direction v6, 2026-10-08) under the owner's delegation of
2026-10-07, from the "Needs a rule" proposals of the ten surface briefs. The reasoning and the rejected
proposals are in `docs/design-v6/DIRECTION.md` part 9; the owner may overrule any of them.

**Caption band.** Text never sits on a photograph. On a photo card, a photo hero or a photo toggle the
caption (name, figure, length, credit) sits in a solid `--paper` or `--bg-card` band flush under the
photo, as the suitability strip does; no scrim, no gradient, no alpha. The pressed or selected state is
the band turning `--ink-fill` with `--on-fill` text. On a phone the photograph takes at most a third of
a choice card's height. One aspect per row (3:2 on browse and library cards). A missing photo is the
flag-and-name placeholder on `--paper-dim`, never a grey or tinted box. Credits are text.

**Selected state.** One look for "this one is on": a selected chip, segment, tab, tile, rail row or the
section showing in the navigation is `--ink-fill` with `--on-fill` text and icon; a selected card has a
`2px solid var(--ink)` border and an ink tick. `--accent` and `--accent-bg` are never a selection colour.
The active section carries `aria-current="page"`.

**Accent marks.** An accent mark means "this one acts" (the view's one primary, a focus ring) or "this one
is live" (the live route, the chosen day on a map, the cheapest pin in view, the scrub marker on a
profile). No accent tick, stripe, dot or tint on a control that is not selected or acting; the Lifestyle
door, fold count badges, "See all" links and category tiles are secondary chrome in ink.

**Count chip.** A count beside a label, a heading or a navigation item is `--mono` 11 px `--ink` on
`--paper-dim`, `999px` radius, set after the label, never `--accent`. A state dot (a plan in progress) is
6 px `--ink-fill` with an aria-label on the item that says what it means. No badge when nothing is new.

**Close control.** Every dismissible surface (dialog, sheet, panel, popover, toast, banner) closes with
CloseIcon at 16 px inside a `--tap` box, top right (inline right on a toast), transparent ground,
`--ink-soft` glyph, translated label "Close". No letter x, no "×", no close inside a grey disc.

**Dialog family.** A modal dialog has a 12 px radius, `--shadow-2`, the one scrim (`--ink` at 28
percent, no blur), the one close control, a focus trap and Escape; it arrives in `--dur-3` and leaves in
`--dur-2`. A choice of two items opened from the bottom nav is a menu with menu semantics, not a dialog.
A sheet (a choice on a phone) rises over the same scrim with a grab handle, a `--tap` close and one
primary, caps at 80 percent of the height in landscape and scrolls inside; a sheet never holds a sheet
and a page never opens inside one. A popover (a card preview) is `--bg-card`, `1px solid var(--rule)`,
10 px radius, `--shadow-2`, at most 320 px wide, beside or over the lower half of its card, never over
the photograph, never an ink fill; it opens on hover after 150 ms, on focus after 400 ms, on Enter or tap
at once, and closes on Escape.

**Navigation.** Every element that changes the view (a tab, the brand mark, a card that opens a page, a
breadcrumb or back control) is an `<a href>` with the view's URL; a section change pushes one history
entry and the browser's Back returns to the previous section; `<button>` is for actions that change
state. The brand mark and the phone logo link to the landing page on every screen. Every detail page a
traveller can open has its own URL, a save star and a share control in its page bar (secondary chrome,
`--tap`); a page that cannot be linked is not shipped. The back control on a page names the list it
returns to, in the same form on every section. Opened by pointer, focus goes to the page heading
(tabindex -1, no visible ring); opened from the keyboard, the first control takes it; closing returns
focus to the opener.

**Settings line.** One compact line on every priced view shows every input its prices depend on: origin,
dates (or "Any dates"), party, Lifestyle (bed and vibe), language, and "Prices in EUR" as a fixed word.
Labels `--ui` 13 px `--ink-soft`, values `--ink`, figures such as dates and party size `--mono`. Each part
is a `--tap` button that opens the control that sets it (OriginPicker, DateField, a Stepper, the
Lifestyle dialog, the language list). No accent. On a phone it never wraps: it drops parts from the left
and keeps Lifestyle. A surface's own filters (a budget ceiling, a month, car-free) follow it in the same
band, in secondary styling.

**Bottom slot.** Transient messages (toasts, the site notice, the pass expiry banner) stack in one slot
above the bottom nav on a phone and bottom centre on desktop, newest on top, at most three, each with a
`--tap` close, never over the bottom nav and never over a sheet's primary action.

**Undo, not confirm.** A destructive action on the traveller's own data runs at once and shows a toast in
the bottom slot with "Undo" as a secondary button for six seconds while the app holds the object: a
stop, a file, a star, a crew name, a co-planner ask, a day plan, a saved trip. The button that started it
is `--danger`. An inline confirm is used only where nothing can be held back (deleting an account,
publishing to the gallery, withdrawing a public link): the row is replaced by one sentence and two
buttons, the safe one first and focused, Escape keeps; the erasing button is `--danger`, the publishing
one `--ink-fill`. Never a confirm modal.

**"More" menu.** When a view's footer holds more than two secondary actions, the rest go into one "More"
button (secondary, `--tap`) that opens a menu with menu semantics; a destructive item in it is `--danger`
text. A multi-step flow's fixed chrome on a phone (rail, running total, recap, footer) takes at most a
quarter of the screen together and the footer is one row.

**Cost on cards and pages.** A card or page that offers a place or a trip carries one `--mono` line with
the day cost per person at the traveller's Lifestyle (or the trip's ground total for the party; "From €N
a person" with its length on a collection card, from the cheapest member, never an average), read from
`src/lib/costIndex.js` so it agrees with Explore and the receipt to the cent. It carries its pedigree:
the tilde and "est." where estimated, the word "national" in `--ui` after a figure that includes a
country-level stand-in (with the InfoDot on the first occurrence per view), the town named when the
figure is a nearby town's (within 25 km). No figure when the data is too thin; never a flight; never a
bookable claim; never a figure stored at save time shown as current. A page shows one per person per day
figure, read from its one receipt, and every other mention of a day cost on the page is that value.

**Priced list.** At most five rows under a heading with a verb or a number, each a real link, the name in
`--ui`, the figure in `--mono` with its pedigree word, hairlines between rows, cheapest first, no badge,
no accent, no highlighted row.

**Budget ceiling.** A stepped select of fixed euro steps per person per day for the ground cost (Any, 40,
60, 80, 100, 130), labelled "Up to €N a day", never a free slider, never including a flight. It filters;
it does not re-price.

**Month.** When the traveller has a month (from the settings line's dates or a month select of the twelve
months plus "Any", in `--ui`), a card may carry one measured month fact in `--ui` with the month in
`--mono` ("Swim season includes July"); never a forecast, never without a month. The chosen month is
outlined 2 px `--ink` on every month strip in view.

**Data drawings.** One family in the ink ramp: weight is the scale (filled to the level in `--kind-*` or
`--ink`, `--ink-soft`, `--ink-mute`, `--rule`; outlined beyond it), the figure always sits beside the
drawing in `--mono` and the drawing reads the same when removed, no legend (a strip that encodes data on
a card is explained once per list as a text key at the list head, never by colour alone), and one
committed item at most in `--accent`. Members: the month strip (twelve cells, best months by weight, the
chosen month outlined, a word beside it; high, low and rain in `--mono` where the page has them; never
`--accent`, `--accent-soft` or `--rate`); the thin bar (at most 8 px, full width of its row, segments
separated by 1 px `--paper`, no figures on the bar: the cost bar, coverage rows, a pass allowance, the
day strip with stops in `--ink` and legs in `--rule` proportional to minutes); the profile (elevation on a
km axis with surface and traffic tracks under it, one `--accent` marker shared with the map and moved by
drag, tap or arrow keys); the gauge (five segments in `--ink`, the cheapest band may be `--green`); the
five squares; the receipt; and the timetable row (label over value in `--ui` 12 px `--ink-soft` and
`--mono`, hairlines between cells). A signature panel draws only measured tracks; an unmeasured one is
named once in the sources. `--climate-good` and `--climate-poor` stay only where they already are.

**Receipt, extended.** On a trip page the trip's own itemised budget is the receipt (cost bar, lines, est
marks, total a person and for the party, the one Lifestyle control under it); a receipt for a nearby town
is a labelled second view, never in its place, and never carries its own stay select. A day plan carries
one per person figure for the day from the same cost index, and a tap opens the compact receipt with its
cost bar. Where the model gives a range an estimate may show as "~ €80.00 to €95.00 est." in `--mono`,
never on a measured figure; a total that sums ranges says it sums the midpoints. A single receipt line
may appear outside a receipt only when it is read live from a receipt on the same page and set exactly
as the receipt sets it. A receipt card may be the shared element that carries into the page's receipt,
only when both show the same figures.

**Detail page grammar.** Decision first, then hand-off, then depth. Under the head, one open key facts
band of four to six measured facts as timetable rows (a missing value shows the strip's placeholder word;
no card, no colour), then Before you go (not-for and hazard lines as one block under one heading, safety
first, never folded, never repeated in a row), then one hand-off band holding the page's one primary and
at most four secondaries in a fixed order (the primary is the file on route pages and the priced trip to
the base on place pages), then the map and signature, then at most five folded rows, then exits, then
sources. Folds are sections under a `--rule-soft` hairline with no box and no shadow and `--ink-soft`
icons; the receipt is the page's one bordered object. Download and report sit in one row of secondary
buttons before the honest footer, never in the head. From 1024 px the first photograph may sit beside
the head, and a page with a receipt may run as a plan column and a sticky side column holding the strip
and the receipt, inside the 1180 px cap. A hero is at most 40 percent of the viewport height on a phone
and 60 percent on desktop.

**Map and list in sync.** A card or row in focus or under the pointer rings its pin with a 2 px `--ink`
ring, and a pin in focus or under the pointer outlines its card or row 2 px `--ink`; the committed
selection (the chosen day, the chosen place, the cheapest pin in view) is the one `--accent` on that map
and nothing else on it is `--accent`. On a multi-day map stops are numbered by day, the selected day's
line is `--accent` and every other day `--ink`, beds are `--paper` squares with an `--ink` border, and a
line that is not the measured path says so in one sentence under the map. On a planning map catalogue
places are ink (a dot below a zoom threshold, a `--bg-card` label above it), a picked place carries an
ink tick, and only the live route and its numbered stop pins are `--accent`. Price pins from zoom 7: at
most 30 DOM labels, name `--ui` 12 px and figure `--mono` 12 px on `--bg-card` with a `--rule` border and
6 px radius, the cheapest in view `--accent` with `--on-fill`, other pins dots, clusters `--paper-dim`
with an `--ink-mute` stroke, never `--rate`. Every pin has a 44 px hit box whatever its visual size.
While a map loads, its box shows the item's own line or point as a static ink drawing from geometry on
hand, then crossfades to the live map in `--dur-3`.

**Rails and cuts.** A horizontal rail has a heading, "See all N", arrows on a fine pointer, arrow keys when
focused, the position in `--mono`, position dots hidden from screen readers, scroll-snap, one aspect
per rail, no autoplay or looping. At most two rails per screen on a phone; further cuts are one row of
chips applying the same filter. The first rail on a browse page may be a cost cut ("Under €N a day in
<month>") sorted by day cost with country interleave.

**Filter chips.** One row of removable chips above a filtered list, each named "Remove <filter>",
`--paper-dim` with `--ink` text and a `--rule` border, ending with "Clear all"; the same component on
every browse tab. A sticky refine row (at most one per list, under the top chrome once the list starts)
is a `--paper` band, `--rule` bottom border, `--tap` high, no shadow, holding only Filters, sort, country
and the active chips. Up to six categories on a phone are a 2 x 3 grid of equal buttons, never a sideways
strip that hides some. An index card may carry its published count in `--mono` beside the name.

**Day list.** Between two stops one `--mono` line gives minutes and km by the leg's mode; each stop
carries an arrival time; both are estimates, so the first of each per view carries the tilde, "est." and
an InfoDot; no hour grid, no end time stated as fact. Days inside one plan are switched with one control,
"Day N, weekday date" (`--ui`, the date in `--mono`) flanked by Previous and Next secondaries at `--tap`
with the day track's keyboard behaviour; adding a day lives in a menu. A planning surface puts its ways
to add in one labelled toolbar row inside the content; nothing floats over the list, and on a phone the
bottom nav's plus is the only floating control.

**Photo track.** Two or more photographs on a detail page or in a record run as one horizontal track on
the day track's mechanics (scroll-snap, Previous and Next secondaries, the position in `--mono`, arrow
keys, no autoplay), labelled by caption, each frame keeping its credit; no tab roles.

**Status, not green.** A positive verdict or a confirmation ("You can swim here", "Profile updated.") is
`--ink` text with a 6 px `--status-success` dot before it, on paper or `--bg-card`; never a green
container, never green text, never a green tick on chrome. The amber tokens stay for warnings; `--green`
stays for good news in data and may mark a "since you saved" drop ("€4.20 less a day than on 3 Oct";
`--ink` when higher, never `--accent` or `--danger`).

**Small text rules.** A label above a group of controls is `--ui` 12 px weight 600 `--ink-soft`, sentence
case, no letter-spacing. A toggle may carry one line of metadata under its label in `--ui` 12 px
`--ink-soft` (`--on-fill` when pressed); the button stays `--tap` and the label stays the accessible name
with the metadata appended. Difficulty is one five-step scale in one i18n group with no banned word, read
by every surface. A password meter is three steps in `--kind-village`, `--kind-city`, `--ink` with the
word beside it. Earned milestones are `--ink`, locked ones `--ink-mute` outline, and "New" is a `--rule`
outline chip in `--ink`; `--rate` stays for ratings.

**Derived copy stays silent.** A sentence generated from data (a summary, a count, a "one base" claim)
shows only when the authored text agrees with it; where the data is thin or contradicts the text the
module shows nothing or the authored words, never "0 of N".

**Comparison table.** Items as columns, one row per attribute, figures in `--mono`, the recommended
column marked only by the card's existing accent border above it, sticky headers, two columns visible on
a phone with the table scrolling inside itself.

**Focal card.** On a list of dated plans the first upcoming plan may be drawn one size larger than the rest
(photo, caption band, countdown, figure, two secondaries) and the rest are rows. One size step; not a
bento.

**Remembered state.** A view may restore the viewer's last category, country, near place or open folds
from browser storage as a per-viewer convenience: every read and write in try/catch, the view correct
without it, folds within one session only, and never opening what the traveller did not.

**Loading.** A region waiting for data holds its final height as a still `--paper-dim` block, no shimmer
and no spinner, with "Loading" for screen readers only; the header and the bottom nav stay usable while
a tab loads.

## Interaction

Focus: `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible`. Inputs may swap the
outline for `border-color: var(--accent)`; never ship `outline: none` without one of the two.

Motion (rewritten by T380, design direction v6; the tokens live in `src/styles/01-tokens.css` and
DESIGN.md). Durations and easings come from the tokens, never from a literal: `--dur-1` 120 ms for
immediate feedback (a press, a chip, a hover tint), `--dur-2` 200 ms for a routine state change (a fold,
a figure settling in place, a chip entering, a row sliding to its place, a tab's content arriving),
`--dur-3` 320 ms for a surface arriving (a sheet, a dialog, a popover, a shared element becoming its
page, the grid to map crossfade), `--dur-4` 480 ms for one authored movement over distance (the map
camera, one leg of the route reveal, capped at 900 ms in all); `--ease-out` for arrivals and settles,
`--ease-in-out` for movement between two on-screen positions. Exits take `--dur-2`. Routine motion
animates `transform` and `opacity`; a press, hover or selection may also animate `background-color`,
`border-color` and `color` at `--dur-1`; a reveal may animate `clip-path`, `mask-position` or
`stroke-dashoffset`. Nothing animates `width`, `height`, `top`, `left`, margins, padding,
`grid-template-*`, `box-shadow`, `filter` or `backdrop-filter`; `transition: all` is never written; no
overshoot, bounce or elastic curve. A figure that changes updates in place in tabular mono inside a box
that keeps its width, with one opacity dip through `settleFigure()` in `src/lib/figureChange.js`; no
count-up, no scale bump, no sweep. Nothing moves because the page scrolled, nothing loops, and the
bottom nav never moves. Every transition and animation has a `prefers-reduced-motion: reduce` branch
that sets it to `none` (the figure still changes, the surface still appears, the route is whole on the
first frame); scripted motion asks `prefersReducedMotion()` or `durationMs()` in `src/lib/motion.js`.

Phone first. The phone layout is designed first; the small floor is 360 px with no horizontal scroll.
Every fixed or sticky bar reads `env(safe-area-inset-*)`; full-height layouts use `100dvh`, never
`100vh`. On a tall phone the one primary sits in the lower half of the screen inside the content, never
sticky over it and never in the top bar. Gestures are shortcuts: a swipe, drag or long press always has a
visible button doing the same; `:hover` rules sit inside `@media (hover: hover)`. Inputs are 16 px so iOS
does not zoom, the submit sits directly under the last field, and the bottom nav hides while an input in
a sheet or page has focus. `--tap` on a coarse pointer, 32 px only under `pointer: fine`. From 1024 px
desktop adds side by side map and list, hover detail, keyboard shortcuts on the map layer and two-column
detail pages; it never removes a phone path.

## Copy

- Every headline carries a verb the user recognises or a number. "What the whole trip actually costs"
  works. "Everything the price tag usually hides" could sit on any product.
- Prefer the specific figure to the claim.
- **No em dashes, ever.** Use a comma, a colon, or two sentences. No middot or bullet separators.
- Banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.
- Sentence case everywhere. No terminal punctuation on labels, buttons or headings. Body copy and helper
  text take full stops.
- Active voice, verb first. A button that says "Save trip" produces "Trip saved."
- Errors say what happened and what to do, in one sentence, with no apology and no "Error:" prefix.
- Empty states are an invitation, not an apology. Name the space and give the action.
- Be honest about coverage in the product's own voice. Carta does not price flights; the fare is the
  traveller's own entry. State limits plainly: that is what makes the accurate numbers believable.

## Never do this

1. Pastel rounded squares behind line icons. Icons are 20px, 1.5px stroke, `--ink-soft`, no tile.
2. A row of three stat counters as a hero device. Put the number in a sentence that says why it matters.
3. Gradients of any kind, especially dark navy to plum on a call to action. Flat `--ink` instead.
4. Decorative uppercase mono eyebrows. See the mono rule.
5. Numbered markers `01 / 02 / 03` unless the order carries information the reader needs.
6. Scroll triggered counters, marquees, parallax, or fade-in-on-scroll on every section.
7. AI generated photographs of European cities. The claim is accuracy; license photography or use real
   map tiles.
8. Stock illustration of people with laptops, and any 3D or glossy icon.
9. Fabricated social proof. Data freshness is the proof Carta has.
10. A hardcoded hex, font name or pixel spacing in a component when a token exists; a second saturated
    hue beside `--accent`; any colour not in `DESIGN.md`.

## Quality floor

- Responsive down to 360px with no horizontal scroll (T380 lowered the floor from 380 to match PRODUCT.md).
- Visible keyboard focus (see Interaction).
- `prefers-reduced-motion: reduce` respected on every transition.
- Motion from the tokens only; no literal duration or easing in a v6 stylesheet.
- Headings in order, one `h1`, real `<a>` for navigation and real `<button>` for actions.
- Text contrast at least 4.5:1. `--ink-mute` is for metadata at 12 to 14px, never body copy.
- Tap targets at least `--tap` (32px allowed on a fine pointer only, see Layout).

## Before you ship

Read the diff and answer these seven questions (the same seven are at the end of `DESIGN.md`):

1. Any hex value outside the `:root` of `styles.css`?
2. Any gradient, any colour not in `DESIGN.md`, any second saturated hue beside `--accent`?
3. Is ochre used for anything but a rating, teal for anything but a gem, `--danger` for anything but
   destruction?
4. Is any mono text prose rather than a measured fact, or any column number set in sans?
5. More than one primary button in a view?
6. Does every headline contain a verb or a number, and is the diff free of em dashes and the banned
   words?
7. Remove one thing. There is almost always one decoration that is carrying nothing.
