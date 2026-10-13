---
name: carta-design
description: The locked design system for Carta, the European budget travel price app at carta-europetravel.com, in its "Lagoon" rendition (white surfaces on warm light grey, blue-grey ink, lagoon teal for actions and selection, one face with tabular figures). Use this skill whenever you touch anything visual in the Carta codebase or write any Carta copy, including landing pages, marketing sections, app UI, React or HTML components, buttons, forms, cards, tables, charts, map overlays, emails, Open Graph images, favicons, icons, empty states, error states and CSS. Also use it whenever you are about to pick a colour, a font, a border radius or a shadow, or write a headline, a button label, an error message or an empty state for Carta, even if the request never mentions design at all. If a human will see the output, read this first.
---

# Carta design system: Lagoon

Rewritten 2026-10-13 (T425) from the built system: the tokens in
`continent-app/src/styles/01-tokens.css` (T421), the kit in `continent-app/src/components/ui/` (T422),
the money formatter `continent-app/src/lib/money.js` (T423) and the style guide (T424). History in one
line: Carta wore a cool grey "Timetable" palette, then cream with Fraunces and terracotta (T198 to T380);
both are retired and nothing below refers to them as current.

## Where the truth lives, and what wins

- `PRODUCT.md` (repo root): who Carta is for, the voice, accessibility, the visual brand commitment.
  Read it first.
- `DESIGN.md` (repo root): every token value with its one job. `01-tokens.css` ships; DESIGN.md
  records it. If a value here disagrees with either, the stylesheet is right and this file is wrong.
- `continent-app/.impeccable/surfaces/continent-app.md`: the Lagoon direction contract.
- The live style guide: run the app and open `?styleguide`. It renders the real kit on the real tokens
  with "use for" and "not for" lines, and switches all six languages. It is the visual reference; when
  you wonder what a chip or a card looks like, look there, not at an old screenshot.
- This file is the judgement layer on top of them. CLAUDE.md says carta-design wins over every other
  design source (a sketch, a screenshot, a wireframe, a competitor). If this file does not cover a case,
  the question goes to a task or the owner; do not make the call silently.

## Why this file exists

Carta once had a homepage that looked machine generated, because defaults accumulated one component at
a time. The generic look comes back the same way: in a hurry, when nobody is looking at the whole page.
The rules below are not suggestions to weigh against convenience. Deviating from them needs a reason you
could defend out loud.

## What Carta is

A price transparency tool for budget travel in Europe. It prices the ground for every destination (bed,
food, local transport, per person per day), plans the trip city by city and each day hour by hour, and
labels every figure for where it came from. It does not price flights: the only flight figure in a total
is one the traveller typed in, labelled as theirs. Never imply otherwise. It takes no booking and no
commission; it hands the traveller to the operator.

The audience counts money: students, young workers, families on one income, retirees, and hikers first
at launch. The only real asset is trust in the numbers.

## The look in one paragraph

Owner decision 2026-10-13 (T419): Carta looks like a top-tier travel app, measured against Airbnb,
Polarsteps and Wanderlog, and their craft is the bar. Photography leads; the feel is warm, calm and
inviting. White surfaces sit on a warm light grey; ink is blue-grey and never black; one deep lagoon teal
does every action and every selection; sun yellow marks best value and nothing else. One friendly face,
Figtree, sets everything, figures included, with tabular numerals. Photos and cards have 16 px corners,
controls 10 px, chips are round pills, and soft shadow belongs to things that float. Carta's own mark on
that familiar structure is one calm price line with its source under every photo. The voice did not
move: plain, specific, honest about coverage. Only the look moved, from instrument to inviting.

## Colour

Single theme, light only: no `prefers-color-scheme` or `data-theme` blocks, `theme-color` is the page
ground. Components read roles, never primitives and never a hex. The values and contrast ratios are in
DESIGN.md; `scripts/ci/token-contrast.mjs` checks every text and fill pair.

| Role | Job | Never |
|---|---|---|
| `--surface-page` | The warm light grey ground behind everything | A card fill |
| `--surface` | Cards, sheets, bars, the white | The page ground |
| `--surface-sunken` | Input fills, quiet bands, a segmented track, loading blocks | A selected state |
| `--surface-hover` | Hover on a quiet surface | A resting fill |
| `--text` | Body text and headings (blue-grey, 13.4:1) | On a teal fill |
| `--text-2` | Secondary text, default icon colour | A heading |
| `--text-3` | Metadata at 11 to 14 px | Body copy |
| `--border`, `--border-soft` | Edges of what you click or type into; hairlines inside an object | A second elevation on a shadowed object |
| `--action` (+ `-hover`, `-press`, `-text`) | The one primary button, links, the focus ring, the live route | Decoration, a rating, a selected chip fill |
| `--action-tint` | Hover ground of a quiet button | A selection on its own |
| `--select-bg`, `--select-ink`, `--select-border` | The one selected state | A dark fill |
| `--focus` | The 2 px focus ring | Anything else |
| `--best`, `--best-bg`, `--best-ink` | Best value: a marker or fill with `--text` on it; `--best-ink` when it must be text | Text in `--best` itself; anything but best value |
| `--rate`, `--rate-bg`, `--rate-soft` | Ratings, a measure (ochre) | An action, a warning |
| `--gem-ink`, `--gem-bg` | Hidden gems (plum) | Anything else |
| `--danger`, `--danger-dark` | Destructive actions | A warning, decoration |
| `--green`, `--status-success` | Good news in data; indicator dots and ticks | Chrome, a button, text in `--status-success` |
| `--kind-*` | Place kind, metro to area, as an ink density ramp | A rainbow |
| Domain colours (`--water-*`, `--trail-*`, `--amber*`, `--ai-violet` and the rest) | One feature each, as listed in DESIGN.md | General purpose |

Rules that matter more than the table:

**One action colour.** Teal means "this acts" or "this is live" (the view's one primary, a link, the
focus ring, the live route, the chosen day on a map, the scrub marker on a profile). It is not
decoration: no teal stripe, dot or tint on something that neither acts, is live, nor is selected.

**One selected state.** A selected chip, tab, segment, tile, rail row, nav item or section link is the
light `--select-bg` tint with `--select-ink` text and icon, plus a mark so the state never rests on
colour alone: a tick on a chip, a 2 px teal underline on a tab, a lifted white thumb (`--surface`,
`--elev-1`) in a segmented control, a teal edge on a selected card, the teal icon and label in the bottom
nav. Never a dark fill, never `--action` as a fill behind a selected label. The active section carries
`aria-current="page"`.

**Each colour has one job.** Ochre is a rating, plum a hidden gem, sun yellow best value, red
destruction. A rating is never teal or red, because "Rome 9.5" in an action colour reads as a button and
in red as an error. Gems moved from teal to plum for the same reason: a gem must never read as a button.

**Ink is never black.** `--text` is a blue-grey. No `#000`, no near-black slab. The 52 ink-filled
controls that made the app read as black are gone (T421, T422); do not bring one back.

**No new tints.** Use the tokens. Inventing a warm tint, a second teal or a new grey beside them is the
same mistake as a hex in a component. A colour that is not in DESIGN.md does not exist.

**Legacy names are aliases.** `--paper`, `--paper-dim`, `--bg-card`, `--ink`, `--ink-soft`,
`--ink-mute`, `--ink-fill`, `--rule`, `--rule-soft`, `--accent*`, `--on-fill`, `--shadow-*`, `--display`
and `--mono` still resolve (to the roles above) so the old stylesheet re-skinned in one commit. New and
touched rules read the role names; the migration (T426 onward) retires the aliases file by file. Rules
carried over below are written in role names; where an old rule named `--ink-fill` or `--accent-bg` for
selection, read the one selected state.

## Type

One family, Figtree, self-hosted (latin and latin-ext woff2 in `continent-app/public/fonts`), through
`var(--font)` (alias of `--ui`). Nothing loads from a Google host. `scripts/ci/design-lint.mjs` (rule
`font-literal`) fails any `font-family` outside `:root` that is not a token or `inherit`. Fraunces,
Plus Jakarta Sans, JetBrains Mono, Cormorant Garamond, Instrument Sans and IBM Plex Mono are rejected.
The PDF export, share cards and numbers explainer still carry old faces (register T421-b); do not copy
from them.

| Step | Size | Weight | For |
|---|---|---|---|
| `--text-display` | 40 px | 700 | A destination name on a hero |
| `--text-headline` | 28 px | 700 | Page titles |
| `--text-title` | 20 px | 600 | Card, section and sheet titles |
| `--text-lead` | 16 px | 600 | Row titles, lead text, primary buttons on a phone, every input |
| `--text-body` | 14 px | 400 | Body copy and list rows |
| `--text-label` | 13 px | 500 | Labels, chips, secondary buttons |
| `--text-caption` | 12 px | 400 | Metadata; the floor for a figure or a rating |
| `--text-micro` | 11 px | 600 | The floor for any functional text: counts, badges, a caption on a pin |

- Nothing functional under 11 px; no figure and no rating under 12 px. Write the token, never a px.
- Leading: `--leading-tight` 1.2 for headings, `--leading-ui` 1.35 for controls, `--leading-body` 1.5 for
  prose. Prose caps at `--measure` (68ch).
- Headline and display may take a small negative letter-spacing (-0.01em to -0.02em). Nothing else is
  letter-spaced, and nothing is uppercase: no eyebrows, no kickers, no small caps.
- Weights 400, 500, 600 and 700 only, in the roles above. Inputs are 16 px so iOS does not zoom.

**Figures.** The separate mono face is retired (owner decision 2026-10-13, PRODUCT.md "Numbers"). `body`
sets `font-variant-numeric: tabular-nums`, so every price, date, time, distance and count lines up in a
column and settles in place in the one family. A measured fact is told apart by its position (right
aligned in a receipt line, after the label in a row, on its own line under a photo) and by its unit, not
by a costume face. Where an older rule below says "in `--mono`", it now means: in the one family, tabular,
placed as a figure. `--mono` is an alias of `--font` until the migration removes it.

## Numbers and money

Every euro the traveller reads comes from `formatMoney()` in `continent-app/src/lib/money.js`, or `<Money>`
in the kit. Two screens can never write the same figure two ways.

- **Precision by context.** Whole euros where many places are compared at once: cards, pins, lists,
  rails, filters, chips, destination facts. Cents on receipts, totals, ledgers, the planner's legs and
  extras, pass prices and exports. The context decides, never the call site's taste. A receipt never
  rounds a line to look tidier: `24.99` is the point, `25` is a different product.
- **Locale places the symbol.** `Intl.NumberFormat` in the reader's language: €87 in English, 87 € in
  German and French, digits grouped by locale.
- **No euro sign in an i18n string.** Templates take a formatted figure (`{price}`, `{eur}`); the formatter
  supplies the symbol. A `€` or `EUR` typed into JSX or a string is a bug (the `money-literal` lint rule
  (T425) catches it).
- **One estimate notation.** `~€87 est.`: the tilde joined to the figure, the language's own short word
  after (`money.est`: est., gesch., stim.). `formatEst()` for a string, `<Money est>` in JSX. Never
  "~ €87", never "est. €87", never an estimate shown by colour alone. Measured figures never carry it.
- **Ranges** go through `formatMoneyRange()`: "€40 to €60", with the language's own joiner.
- **Per unit** is one phrase per language through i18n ("a person", "a day", "a night", "for the trip").
  No `/pp`, `/p`, `/day` in JSX.
- **No figure** prints words (`money.onRequest`, "Price on request"), never a blank, a lone dash or
  "€NaN".
- **Pedigree travels with the figure.** Measured, cached and estimated figures are labelled as such,
  "national" after a figure that uses a country-level stand-in, the nearby town named when the figure is
  borrowed. Never a flight figure of Carta's, never a bookable claim, never a stored figure shown as
  current. Every external booking link warns that prices may have changed.

## Layout, spacing and shape

- **Spacing** on a 4 px grid: `--space-1` to `--space-8` (4, 8, 12, 16, 24, 32, 40, 56), `--gutter` 16 px.
  Whitespace separates groups; it is not spent making a card feel generous.
- **Touch.** `--tap` (44 px) is the floor for anything interactive, icon-only controls included. On a fine
  pointer (`@media (pointer: fine)`) a compact control such as the small Button or a chip may be 32 px; on
  a coarse pointer it is always `--tap`.
- **Radius.** `--radius-sm` 6 px for small inline marks (status chips, price pins), `--radius-control`
  10 px for buttons, inputs and segmented tracks, `--radius-card` 16 px for cards and photos,
  `--radius-sheet` 20 px for sheets and dialogs, `--radius-pill` for chips and round icon buttons. No
  other radius.
- **Elevation**, declared once per object: a border or a shadow, never both. `--elev-1` a resting
  object with no border (a segmented thumb, an icon button over a photo), `--elev-2` raised (a popover, a
  sticky bar over content), `--elev-3` an overlay (a sheet, a dialog). Cards in a list are bordered, not
  shadowed. No other shadow; no inset shadows.
- **Layers** only through `--z-base` to `--z-toast`.
- **Lists get hairlines, objects get borders.** Divide a run of facts with `--border-soft` rules; a
  bordered card is for a bounded object (a place, a trip, a receipt).
- **Density** (owner decision 2026-10-13, T421): Explore and Destinations open as compact rows (a 72 px
  rounded photo, name, rating, the price line with its source word, a save control), about ten to a
  phone screen. Large photo tiles are for rails and the home page, where inspiration leads.
- **Breakpoints.** Floor 360 px with no horizontal scroll; below 769 px the phone (five-slot bottom nav,
  sheets for choices, pages for detail); from 769 px the header carries the tabs; from 1024 px list and map
  side by side, highlighting each other, and two-column detail pages. The content column caps at 1180 px.
- **Icons** through `<Icon>`: 16 px in chips and inline, 20 px in buttons, rows and the tab bar, 24 px in
  empty states. Line icons from `Icons.jsx`, 1.5 stroke, `currentColor`, `--text-2` by default,
  decorative ones `aria-hidden`. No tile behind an icon.

## Photography

Photography leads, and every photo is real and licensed with its credit (`docs/tos/data_licenses.md`).

- **No text on a photograph.** Name, figure, length and credit sit under the photo on `--surface`, flush
  with its edge; no scrim, no gradient, no alpha band. The only things over a photo are round icon
  buttons (`IconButton tone="photo"`: a white disc with `--elev-1`), such as save.
- One aspect per row or rail: 4:3 on kit tiles, 3:2 on browse and library cards where they already use
  it. On a phone the photo takes at most a third of a choice card's height. A hero is at most 40 percent
  of the viewport height on a phone and 60 percent on desktop.
- Corners `--radius-card` on a free photo; a photo at the top of a tile takes the tile's corners.
- A missing photo is the flag-and-name placeholder on `--surface-sunken`, never a grey or tinted box.
  Credits are text.
- Never an AI-generated photograph, never stock people with laptops, never a 3D or glossy render.

## The kit

`continent-app/src/components/ui/`, styled by `03-button.css` and `04-ui.css` on roles and scales only.
Use it; a new local button, chip or card style is a regression (the migration from T426 replaces the
old ones, and the `raw-button` lint rule (T425) meters what is left; `node scripts/ci/design-lint.mjs --meter`).

- **Button**: primary (`--action` fill, `--action-text`), secondary (`--surface`, `--border` edge),
  quiet (no fill, teal label, `--action-tint` on hover: an offer inside a bar, a row or a card), danger
  (`--danger` fill). Sizes md (`--tap`) and sm (32 px on a fine pointer only). Loading keeps its width;
  disabled is a sunken ground with `--text-3`, never a paler live button. One primary per view. A link
  that only navigates is a link, not a Button.
- **IconButton**: always a 44 px box and a required label. Tones plain (bars and rows), surface (over a
  map or on a sheet), photo (over a photograph). `pressed` gives the selected tint and `aria-pressed`.
- **Chip**: filter (toggle, `aria-pressed`, tick when on), choice (radio in a ChipGroup, arrow keys),
  count (a figure beside a label, `--surface-sunken`, `--text-2`, 12 px), status (tones neutral, best,
  gem, rate, positive, danger; `--radius-sm`; not interactive).
- **Segmented**: a sunken track with a lifted white thumb, radio semantics.
- **Tabs**: a teal underline that grows in, tablist semantics, arrow, Home and End keys.
- **Card**: layouts row (the compact default) and tile (rails, home). Slots in fixed order: media, title,
  meta, rating, price, actions. The price slot takes `<Money>`. One stretched link or button on the title
  opens the card; actions sit above the stretch; nothing interactive nests. Selected is a teal edge.
- **Field**: input, select or textarea with a visible label, help and error under it tied by
  `aria-describedby`; errors in `--danger` with the field edge `--danger`. A placeholder shows a real
  example and never stands in for the label.
- **Icon** and **Money** as above.
- Kept and restyled through tokens: `SheetShell`, `Dropdown`, `DateField`, `ReceiptCard`, `StateBlocks`,
  `InfoDot`. Read shadcn for keyboard and ARIA behaviour only; ship nothing of its look.

## Component rules

Decided by the owner (T360, 2026-10-03; T362, 2026-10-07) and by T380 (design direction v6, 2026-10-08,
reasoning in `docs/design-v6/DIRECTION.md` part 9), restated in Lagoon terms.

**The receipt.** Carta's signature object, wherever a total needs justifying: a `--surface-sunken` head with destination and route, one hairline separated line per cost component with the figure right aligned in cents, a `2px solid var(--text)` rule above the sum, the sum, and a tinted footer showing what one changed input would do to the total. It is the page's one bordered object and may carry `--elev-1` instead of its border, not both. On a trip page the trip's own budget is the receipt (cost bar, lines, est marks, total a person and for the party, the one Lifestyle control under it); a nearby town's receipt is a labelled second view and carries no stay select of its own. A day plan carries one per person figure for the day from the same cost index; a tap opens the compact receipt. A receipt line may appear outside the receipt only when read live from it and set exactly as it sets it.

**The cost bar.** At most one stacked bar above a receipt's lines, never instead of them: 8 px, full width, one segment per line in receipt order in the `--kind-*` ramp, 1 px `--surface` gaps, no teal, no legend, no percentages.

**Cost on cards and pages.** A card or page that offers a place or a trip carries one price line: the day cost per person at the traveller's Lifestyle ("From {price} a person" with its length on a collection card, from the cheapest member, never an average), read from `src/lib/costIndex.js` so it agrees with Explore and the receipt. It carries its pedigree (the estimate notation, "national" with an InfoDot on the first occurrence per view, the borrowed town named). No figure when the data is too thin. A page shows one per person per day figure and every other mention on the page is that value.

**Best value.** The cheapest item in a comparison (the cheapest pin in view, a "Best value" status chip) is marked in `--best` with `--text` on it, once per view. It is a marker, not a selection and not an action.

**Price pins.** From zoom 7, at most 30 DOM labels: name 12 px, figure 12 px semibold on `--surface` with a `--border` edge and `--radius-sm`; the cheapest in view takes the best-value marker; other pins are dots; clusters `--surface-sunken` with a `--text-3` stroke, never `--rate`. Every pin has a 44 px hit box.

**Map and list in sync.** A card under the pointer or in focus rings its pin 2 px `--text`, and a pin under the pointer outlines its card 2 px `--text`. The committed selection (the chosen day, the chosen place) is the one teal item on that map. On a multi-day map stops are numbered by day, the selected day's line is `--action` and every other day `--text`, beds are `--surface` squares with a `--text` border, and a line that is not the measured path says so under the map. On a planning map catalogue places are ink, a picked place carries a tick, and only the live route and its numbered stops are teal. While a map loads its box shows the geometry on hand as a still ink drawing, then crossfades in `--dur-3`.

**Ratings.** Ochre chips (`--rate`, `--rate-bg`), 12 px minimum; the star colour itself is roadmap 1.8. Hidden gems take the plum chip. Place kind is the ink ramp.

**Plan cards.** Equal weight; the recommended plan is marked with a teal border and a "Recommended" chip and keeps the same ground. Never dim the free plan. State limits as plain numbers.

**Suitability strip.** Under a trip hero, a solid `--surface` band flush with the photo's bottom edge, square corners where it meets the photo. Exactly three cells in fixed order: difficulty (five squares filled `--text` to the level, outlined `--text-3` beyond, never `--rate` or `--action`, plus the word), style (one or two words from tags), total cost (with currency). A missing value shows a placeholder word ("Unrated", "Mixed", "Price on request"). One row of three on a phone.

**Detail page grammar.** Decision first, then hand-off, then depth. Under the head, a key facts band of four to six measured facts as label-over-value rows (label 12 px `--text-2`, value tabular; no card, no colour); then Before you go (not-for and hazard lines, safety first, never folded); then one hand-off band with the page's one primary and at most four secondaries; then map and signature; at most five folded rows (sections under a `--border-soft` hairline, no box, no shadow); then exits; then sources. Download and report sit in one row of secondaries before the honest footer. From 1024 px the first photo may sit beside the head and a receipt page may run a sticky side column, inside the 1180 px cap. No bento grid: no tiles of mixed sizes.

**Data drawings.** One family on the ink ramp: weight is the scale (filled to the level, outlined beyond), the figure always sits beside the drawing, the drawing reads the same when removed, no legend (a strip on a card is explained once per list as a text key), at most one committed item in teal. Members: the month strip (twelve cells, the chosen month outlined 2 px `--text`, never `--action` or `--rate`), the thin bar (at most 8 px, segments separated by 1 px `--surface`), the profile (elevation on a km axis, one teal marker shared with the map, moved by drag, tap or arrow keys), the gauge (five segments, the cheapest band may be `--green`), the five squares, the receipt, and the label-over-value row. `--climate-good` and `--climate-poor` stay only where they already are.

**InfoDot.** One glossary marker: a 6 px `--text-3` dot after the term, inside a real `<button>` with a `--tap` box and an aria-label naming the term. It opens a popover (`--surface`, `--elev-2`, `--radius-control`, at most 280 px, the term in 600 and one or two sentences 13 px `--text-2`) from the shared glossary. Escape, a second tap or a tap outside closes it and returns focus. One per term per view, on the first occurrence; never on a heading, a button label or a pin; never an "i" in a circle.

**Dialog family.** One scrim (`--text` at 28 percent, no blur), one close control, a focus trap through `useFocusTrap`, Escape. A dialog is `--surface`, `--radius-sheet`, `--elev-3`, arrives in `--dur-3` and leaves in `--dur-2`; never a confirm modal. A sheet (a choice on a phone) rises over the same scrim with a grab handle, a `--tap` close and one primary, caps at 80 percent of the height in landscape and scrolls inside; a sheet never holds a sheet and a page never opens inside one. A popover (a card preview) is `--surface`, `--elev-2`, `--radius-control`, at most 320 px, never over the photo; it opens on hover after 150 ms, on focus after 400 ms, on Enter or tap at once. A choice of two from the bottom nav is a menu.

**Close control.** CloseIcon at 16 px in a `--tap` IconButton, top right (inline right on a toast), plain tone, label "Close" translated. No letter x, no multiplication sign, no grey disc.

**Navigation.** Anything that changes the view (a tab, the brand mark, a card that opens a page, a back control) is an `<a href>` with the view's URL; a section change pushes one history entry; `<button>` is for actions. Every detail page has its own URL, a save control and a share control in its page bar. The back control names the list it returns to. Opened by pointer, focus goes to the page heading (tabindex -1); from the keyboard, the first control; closing returns focus to the opener.

**Settings line.** One compact line on every priced view shows every input its prices depend on: origin, dates (or "Any dates"), party, Lifestyle, language and "Prices in EUR". Labels 13 px `--text-2`, values `--text`. Each part is a `--tap` button that opens its control. No teal. On a phone it never wraps: it drops parts from the left and keeps Lifestyle. A surface's own filters follow in the same band as secondaries.

**Lifestyle control.** There is one: the Lifestyle panel. A surface that changes how the traveller travels opens or embeds it and never builds a second slider. Shown as a slider it is stepped, one labelled stop per level, the figures update in place, and one sentence under it states the trade-off with the figure.

**Filters.** Removable filter chips in one row above a filtered list, each named "Remove <filter>", ending in "Clear all", the same on every browse tab. At most one sticky refine row per list (`--surface`, `--border` bottom edge, `--tap` high, no shadow) holding Filters, sort, country and the active chips. Up to six categories on a phone are a 2 x 3 grid of equal buttons. The budget ceiling is a stepped select (Any, 40, 60, 80, 100, 130 a person a day, ground only, "Up to {price} a day"), never a free slider; it filters and does not re-price. A month select holds the twelve months plus "Any"; with a month, a card may carry one measured month fact ("Swim season includes July"), never a forecast.

**Rails and cuts.** A rail has a heading, "See all N", arrows on a fine pointer, arrow keys when focused, the position as a figure, dots hidden from screen readers, scroll-snap, one aspect, no autoplay or loop. At most two rails per phone screen; further cuts are one row of chips. The first browse rail may be a cost cut ("Under {price} a day in <month>") sorted by day cost with countries interleaved.

**Tracks.** The day track, flashcards and the photo track share mechanics: one card per stop of `scroll-snap-type: x mandatory`, about 85 percent wide on a phone so the next shows, three across from 1024 px for days; Previous and Next secondaries at `--tap` and the position ("Day 3 of 7", "2 of 5") above or under it; arrow keys move one; position dots 6 px `--border`, the current one `--select-border`, hidden from screen readers. Swiping is a shortcut, never the only way. No autoplay, no looping, no flip, no 3D, no stacked shadows. Flashcards have a "Show all" link that turns the deck into a list, and print as the list. Every day stays reachable as a link from the page's own list.

**Day list.** Between two stops one line gives minutes and km by the leg's mode; each stop carries an arrival time; both are estimates, so the first of each per view carries the tilde, "est." and an InfoDot. No hour grid, no end time stated as fact. Days are switched with one control, "Day N, weekday date", flanked by Previous and Next. Ways to add live in one labelled toolbar row inside the content; nothing floats over the list, and on a phone the bottom nav's plus is the only floating control.

**Sticky section rail.** At most one per page, only with three or more sections: a `--surface` band, `--tap` high, `--border` bottom edge, no shadow, links 13 px `--text-2` scrolling sideways on a phone; the section in view takes the selected state. Each link is a real `<a>` to its anchor.

**Bottom slot and undo.** Toasts, the site notice and the pass expiry banner stack in one slot above the bottom nav on a phone and bottom centre on desktop, newest on top, at most three, each with a close, never over the nav or a sheet's primary. A destructive action on the traveller's own data runs at once and shows "Undo" as a secondary for six seconds; the button that started it is `--danger`. An inline confirm only where nothing can be held back (deleting an account, publishing to the gallery, withdrawing a public link): one sentence and two buttons, the safe one first and focused, Escape keeps; the erasing one is `--danger`, the publishing one primary.

**"More" menu.** More than two secondary actions in a footer: the rest go into one "More" button with menu semantics; a destructive item in it is `--danger` text. A multi-step flow's fixed chrome on a phone takes at most a quarter of the screen together, and its footer is one row.

**Status, not green.** A positive verdict or confirmation ("You can swim here", "Profile updated.") is `--text` with a 6 px `--status-success` dot before it; never a green container, never green text in a sentence. `--green` stays for good news in data and may mark a "since you saved" drop ("{price} less a day than on 3 Oct"; `--text` when higher). The kit's positive status chip is a short data label with its word, not a sentence.

**Small text.** A label above a group of controls is 12 px weight 600 `--text-2`, sentence case, no letter-spacing. A toggle may carry one line of 12 px metadata under its label. Difficulty is one five-step scale in one i18n group. Earned milestones are `--text`, locked ones `--text-3` outline, "New" is a `--border` outline chip.

**Smaller rules still in force.** The comparison table puts items as columns, one row per attribute, sticky headers, two columns visible on a phone. On a list of dated plans the first upcoming one may be one size larger (a focal card), never a bento. Derived sentences show only when the authored text agrees with the data, never "0 of N". A view may restore the last category, country or open folds from browser storage in try/catch, correct without it. The secondary chrome ("Get a pass", the phone plus) is never filled in teal. The install hint is one line with a secondary "Add to home screen" in My trips, on a phone browser not running the installed app, after a saved trip, dismissed for good; never a modal or banner. Every modal has the scrim and the page behind takes no clicks.

**Loading.** A waiting region holds its final height as a still `--surface-sunken` block, no shimmer, no spinner (a Button's own loading spinner excepted), "Loading" for screen readers only. Header and bottom nav stay usable while a tab loads.

## Interaction and motion

Focus: `outline: 2px solid var(--focus); outline-offset: 2px` on `:focus-visible`. Inputs add
`border-color: var(--action)`. Never ship `outline: none` without a replacement. The browser's own
surfaces take the palette: text selection `--select-bg`, caret and native checks `--action`.

Motion tokens (T380), never a literal: `--dur-1` 120 ms for immediate feedback (a press, a chip, a hover
tint), `--dur-2` 200 ms for a routine state change and every exit (a fold, a figure settling, a tab
underline growing), `--dur-3` 320 ms for a surface arriving (sheet, dialog, popover, shared element, grid
to map crossfade), `--dur-4` 480 ms for one authored movement over distance (the map camera, one leg of
the route reveal, 900 ms in all at most). `--ease-out` for arrivals and settles, `--ease-in-out` between
two on-screen positions. No overshoot, bounce or elastic curve.

Routine motion animates `transform` and `opacity`; a press, hover or selection may animate
`background-color`, `border-color` and `color` at `--dur-1`; a reveal may animate `clip-path`,
`mask-position` or `stroke-dashoffset`. Nothing animates `width`, `height`, `top`, `left`, margins,
padding, `grid-template-*`, `box-shadow`, `filter` or `backdrop-filter`; `transition: all` is never
written. A changing figure updates in place, tabular, in a box that keeps its width, with one opacity dip
through `settleFigure()` (`src/lib/figureChange.js`); no count-up, no scale bump. Nothing moves because the
page scrolled, nothing loops, the bottom nav never moves. Every transition has a
`prefers-reduced-motion: reduce` branch that sets it to `none`; scripted motion asks
`prefersReducedMotion()` or `durationMs()` in `src/lib/motion.js`.

Phone first. Design the phone layout first, at 360 px. Every fixed or sticky bar reads
`env(safe-area-inset-*)`; full-height layouts use `100dvh`. The one primary sits in the lower half of the
screen inside the content, never sticky over it and never in the top bar. A swipe, drag or long press
always has a visible button doing the same; `:hover` rules sit inside `@media (hover: hover)`. The submit
sits under the last field, and the bottom nav hides while an input in a sheet or page has focus. Desktop
adds side by side map and list, hover detail and keyboard shortcuts; it never removes a phone path.

## Copy

The voice did not change with the look. Carta sounds like an instrument, not a brochure.

- Every headline carries a verb the traveller recognises or a number. "What the whole trip actually
  costs" works; "Everything the price tag usually hides" could sit on any product.
- Prefer the figure to the claim. "Bed prices measured in N of M destinations, refreshed 2 hours ago"
  beats any adjective.
- No em dashes and no en dashes, anywhere: a comma, a colon or two sentences. `stripDashes()` in
  `src/lib/format.js` enforces it on shipped strings; the rule holds for source, docs and reports too. No
  middot or bullet characters as separators. Ranges use the word "to".
- Banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.
- Sentence case everywhere. No terminal punctuation on labels, buttons or headings; body and helper text
  take full stops. Contractions are fine.
- Active voice, verb first. A button that says "Save trip" produces "Trip saved."
- Errors say what happened and what to do in one sentence, with no apology and no "Error:" prefix.
- Empty states are an invitation, not an apology: name the space and give the action.
- Honest about coverage in the product's own voice. Carta does not price flights; the fare is the
  traveller's own entry. When the AI is off, say it is off. State limits plainly.
- Strings go through i18n keys in all six languages, never concatenation; test labels at the longest
  translation (usually German).

## Never do this

1. A dark-filled selected state: a chip, tab, segment or row painted ink or deep teal with white text.
   Selection is the light tint plus a mark.
2. A second primary in a view, or teal spent on decoration (a stripe, a dot, a tinted badge on something
   that neither acts nor is live nor is selected).
3. Gradients of any kind, a scrim over a photo, glassy blur as decoration, an inset or stacked shadow, or
   a border and a shadow on the same object.
4. Text on a photograph. The caption sits under it on `--surface`.
5. Uppercase eyebrows or kickers, letter-spaced labels, a costume face for numbers, or any face but
   Figtree.
6. Fabricated social proof: testimonials, user counts, press, partner logos, "popular" badges without a
   measure. Data freshness is the proof Carta has.
7. AI-generated photographs of places, stock people with laptops, 3D or glossy icons, pastel tiles behind
   line icons.
8. A hex, font name, px font size, radius or spacing in a component when a token exists; any colour not in
   DESIGN.md; black (`#000`) as ink. Hex lives only in `:root` and the token mirror `src/map/tokenColors.js`.
9. A euro sign or "EUR" in an i18n string or JSX, `toFixed` on a price, a rounded receipt line, or an
   estimate without its tilde and word.
10. Functional text under 11 px, a figure or rating under 12 px, or a touch target under 44 px on a coarse
    pointer.

Also never: a row of three stat counters as a hero device, numbered markers `01 / 02 / 03` unless order
matters, scroll-triggered counters, marquees, parallax or fade-in on every section.

## Quality floor

- 360 px wide with no horizontal scroll; one `h1` per view, headings in order.
- Real `<a>` for navigation, real `<button>` for actions; visible focus on every interactive element.
- Every text pair 4.5:1 or better (`node scripts/ci/token-contrast.mjs`); `--text-3` never for body copy.
- Colour is never the only carrier: estimates carry text, selection carries a mark, place kind survives
  greyscale, `--green` and `--danger` come with words.
- `prefers-reduced-motion: reduce` on every transition; motion from tokens only.
- Every `aria-modal` overlay traps focus and closes on Escape.
- `node scripts/ci/design-lint.mjs` reports no new violations against its baseline.
- Run the app (`npm run dev` in `continent-app/`) and look at every screen the diff touches on a phone
  width and a desktop width, and compare against `?styleguide`.

## Before you ship

Read the diff and answer these seven questions (DESIGN.md carries the same seven):

1. Any hex value outside `src/styles/01-tokens.css` (and the token mirror)? `design-lint.mjs` checks this.
2. Any gradient, any colour not in DESIGN.md, any saturated hue beside `--action` outside its one job?
3. Is ochre used for anything but a rating, plum for anything but a gem, sun yellow for anything but best
   value, `--danger` for anything but destruction, and is every selected state the light tint with a mark?
4. Is any rating or figure under 12 px, any functional text under 11 px, any column of figures without
   tabular numerals, any euro not from `formatMoney`?
5. More than one primary button in a view, or text on a photograph?
6. Does every headline contain a verb or a number, and is the diff free of em and en dashes, middots and
   the banned words?
7. Remove one thing. There is almost always one decoration that is carrying nothing.
