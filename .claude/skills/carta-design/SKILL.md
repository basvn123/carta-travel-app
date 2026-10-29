---
name: carta-design
description: The locked design system for Carta, the European budget travel price app at carta-europetravel.com, in its "Lagoon" structure with the brown palette (white surfaces on warm light grey, two base colours: blue-grey ink and one warm brown for actions and selection, one face with tabular figures). Use this skill whenever you touch anything visual in the Carta codebase or write any Carta copy, including landing pages, marketing sections, app UI, React or HTML components, buttons, forms, cards, tables, charts, map overlays, emails, Open Graph images, favicons, icons, empty states, error states and CSS. Also use it whenever you are about to pick a colour, a font, a border radius or a shadow, or write a headline, a button label, an error message or an empty state for Carta, even if the request never mentions design at all. If a human will see the output, read this first.
---

# Carta design system: Lagoon, in brown

Rewritten 2026-10-13 (T425) from the built system: the tokens in
`continent-app/src/styles/01-tokens.css` (T421), the kit in `continent-app/src/components/ui/` (T422),
the money formatter `continent-app/src/lib/money.js` (T423) and the style guide (T424). History in one
line: Carta wore a cool grey "Timetable" palette, then cream with Fraunces and terracotta (T198 to T380);
both are retired and nothing below refers to them as current.

Updated 2026-10-15 (T430, T431): the item page and trip page grammar, the 3D terrain map, credits under photos,
trip lists as tiles, the suitability strip retired.

Updated 2026-10-16 (T457, the owner: Destinations must line up with Explore): both browse tabs share one side
panel grammar (the same padding, 12 px section headings, kit tiles first, the country last in a fold with a
search and a flag a row) and one full-width content column. Destinations' six sections are kit tiles with tab
semantics, two across at the top of the desktop panel and the 2 x 3 grid at the top of a phone column. A
section's head carries "Highlights | Full list" where Explore's carries List | Map: the full list is one choice
from the top. The rails take Explore's tile widths and lines, and the countries track counts as one of the rails.

Updated 2026-10-24 (T689, T694, T695, the price plan): one amount and its unit, no estimate mark; per person or the whole group; the opened price with item switches.

Updated 2026-10-13 (T438) after the owner reviewed Explore: the lagoon teal became one warm brown
(umber), a rating became a star and an ink figure (the Score, T437), provenance on the page became the
estimate mark alone, and catalogue counts left the page furniture.

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

"Stop stitching trips together from five apps. Carta plans the whole trip in one place, with what each day costs." (owner, T471-b, 2026-10-21; the same sentence as PRODUCT.md). One app for planning a trip
anywhere in Europe, cutting coordination and logistics. It prices the ground for every destination (a bed
plus food and drink, per person per day; local transport is not in the day figure yet), plans the trip city
by city and each day hour by hour, and marks every estimate as an estimate. Carta never navigates: no route
guidance and no GPS, the traveller's maps app takes them there. For the flight it shows Google Flights'
price, with the airline, the times and when it was checked, so the flight, the bed and the days add up to one
total; a fare the traveller types in replaces it. The flight price is never presented as Carta's own. It
takes no booking and no commission; it hands the traveller to the operator.

The audience counts money: students, young workers, families on one income, retirees, and hikers first
at launch. The only real asset is trust in the numbers.

## The look in one paragraph

Owner decision 2026-10-13 (T419): Carta looks like a top-tier travel app, measured against Airbnb,
Polarsteps and Wanderlog, and their craft is the bar. Photography leads; the feel is warm, calm and
inviting. White surfaces sit on a warm light grey; ink is blue-grey and never black; one warm brown
does every action and every selection, so the app has two base colours, the ink and the brown (owner
decision 2026-10-13, T438); sun yellow marks best value and nothing else. One friendly face,
Figtree, sets everything, figures included, with tabular numerals. Photos and cards have 16 px corners,
controls 10 px, chips are round pills, and soft shadow belongs to things that float. Carta's own mark on
that familiar structure is one calm price line under every photo, marked as an estimate where it is one.
The voice did not move: plain, specific and short. Only the look moved, from instrument to inviting.

## Explore v6 (owner decisions 2026-10-22, T584 to T594)

The owner reviewed Explore against Komoot, Kayak, AllTrails, Airbnb, Hostelworld and Rightmove on a
reference board and decided the following. Where an older rule below disagrees, these win; the older
rules are amended in place where they are restated.

- **Explore opens as an overview** (T586): a headline with a verb, a What and Where bar (a select of
  Places, the five categories and Trip styles, a search field, a secondary Search), a quiet "Tell Carta
  what you want" door, the category pill row, then the story rails, ending with "Show all places" and the
  map toggle. No side pane and no list on the overview. Any See all, chip, search or Show all opens the
  focused view, one history step; its "Explore" link and the browser's Back return to the overview. The
  settings line's countries do not end the overview. A Where search shows as a chip.
- **The category choice is one row of pills** (kit Tiles with tab semantics, tint plus tick) at the top
  of the content on Explore and every category tab, never in a side pane.
- **The focused view's toolbar** (T588): the title with the live count under it, then pill buttons:
  Share (copies the link, "Link copied"), Sort (a menu), Filters (opens and closes the desktop pane, the
  sheet on a phone, with its count), Saved, Countries on a phone, and the view toggle last.
- **One view toggle** (T592): a secondary pill naming where it goes, "Map" or "List", never a List |
  Map Segmented. Desktop: in the toolbar, and on the outdoor tabs after Search in the What and Where bar.
  Phone: floating above the bottom nav, and in the map drawer's strip.
- **The map, the Kayak way** (T592): on a desktop a panel floats on the map's left (`--surface`,
  `--radius-sheet`, `--elev-2`, at most 400 px), listing the places on the map or holding the picked one:
  photo, name with the Score and band, region, a "Your trip" box (dates or month, nights, the way there,
  bed and food and drink for the nights, one total a person, the one primary "Open {place}"), then a
  short why-go. The camera keeps pins clear of the panel. Price pins read the figure first, then the
  name. This replaces "a map never draws a second card of its own".
- **Browse cards blend** (T590, T587): the photo with `--radius-card`, the text directly on the page
  ground under it, no white box and no border. In a focused list from 769 px the places are photo cards
  in an auto-fill grid; on a phone a horizontal card (a 112 px photo, then name, dates, prices).
- **Prices with icons** (T590): `PriceParts` shows the way there (plane, train, bus or car), the bed and
  the food and drink as 16 px icons with whole-euro figures, under one total a person a day. Dates show
  only when the traveller set them.
- **Story rails** (T587, the owner's Komoot reference, "for every tab"): a lead card on
  `--surface-sunken`, tilted -2deg, holding the rail's heading, one line, at most three icon facts from
  its rows (no catalogue counts) and See all; then 4:5 photo cards. On those photos only, a status pill
  (top left: "Good in Nov", a difficulty) and the Score pill (top right) in solid `--surface` with
  `--elev-1`; the title stays under the photo. A card's pill never repeats the rail's heading. The rails
  name the month the settings line shows. Class prefix `.storyr` (`.srail` is the sticky section rail).
- **Motion on browse surfaces** (owner: "I want more dynamics"): cards lift -4px on hover at `--dur-2`,
  the lead card straightens on hover, rail cards arrive once with a stagger of at most 40 ms each (240 ms
  cap) when a rail enters view, the overview and the focused view crossfade at `--dur-3`. Transform and
  opacity only, motion tokens, no bounce, no loop, nothing tied to scroll, none under reduced motion.
- **The filter pane** (T589, the owner's Hostelworld reference): a head with the live count and Clear
  all; Kind of place as small chips with icons; Good for (A base for the week, A day trip, A stop on the
  way) high and never folded, with one help line; Budget a day as a stepped two-thumb range (0 to 160 and
  Any, a floor and a ceiling, filters only); the month as twelve letter chips plus Any; Size in plain
  words (Big city, City, Town, Village, Countryside), no glyphs; Rating, Flight up to and Max travel time
  as short Segmented controls (up to five options), Any first; Good to know as icon, word and Switch
  rows. Country, Browse and the shortlist are not in the pane. The desktop pane is 320 px wide.
- **The outdoor tabs** (T593): a What and Where bar on `--surface` with `--radius-card` and `--border`;
  a quick filter row ("All filters" and at most four dropdown chips); Trails and Cycling maps draw each
  route as its line (`--surface` casing, `--trail-pin` line, the hovered one `--action`) with a length
  pill at its start. Those map-drawn pills use the basemap's fonts (Montserrat, Open Sans), the one
  exception to Figtree-only, because the map's glyph server has no Figtree.
- **The start dialog** (T585): from 1024 px, once per device on the first Explore visit, never over a
  link that carries a view: "What matters most on this trip?", a labelled field that goes to Ask Carta,
  From, Where to, When and Who rows that open the settings line's parts, one primary "Show places".
- **The site footer** (T594) ends every page-like tab's scroll on `--surface-sunken`: the mark, the
  positioning sentence, Explore, Plan, Carta and Legal link columns, the year. No controls, no store
  badges, absent in map views.
- **Ask Carta** (T584): the chat's head and foot stand on the panel's warm ground; a hairline shows only
  where the conversation runs on under them. The field is the one white object at the foot.
- **The preview** (T591): the card's hover preview holds the hook line, one month verdict chip, one plan
  sentence ("2 days, about {price} a person") and "Open {place}". It opens on hover, and on a keyboard
  focus only where there is hover.

### Explore v7 (owner review 2026-10-22, T595 to T600)

- **The overview's top is one compact block** (T595): "Where to next?"; Ask Carta as a field-like door
  with an example question (the chat's one door: none in the header, none on Plan); one bar of What,
  Where (it works for every kind: Places searches places, a category opens its tab with the text, a
  country name on Trails or Cycling picks that country), Search and the Map toggle; then one row of the
  category pills and the quick chips (the rails' doors, Countries on a phone, All filters, Show all
  places). Nothing waits at the foot of the overview; rails draw no doors of their own.
- **The focused head is one row** (T598): a round arrow back and the title (`--text-title`) on the left,
  the pills on the right; under it the quick filter chips (Kind of place, Budget, Month, Good for,
  Rating, Flight time), each a popover on the pane's own state, then the active chips. No count line.
  The desktop map fills the screen under the chips. On a phone the arrow and the title share a row and
  the pills scroll under it.
- **Every outdoor tab has a map** (T600): Beaches, Lakes, Mountains and Cycling Europe-wide, Trails with
  each country's best walks until a country is picked. The head is the pill row, one What and Where row
  with the Map or List pill, the quick chips, then the content, `--space-3` apart; the quick chips show
  on every width and the desktop pane keeps every group. Beach, lake and mountain pins carry the Score;
  routes carry their length.
- **Lead cards show what the rail holds** (T599): title, an optional short line, a fanned stack of the
  rail's first three photographs (decorative, `--surface` edge), one large figure, at most two small icon
  facts, See all. A rail line shows only where it says something the heading does not.
- **Lifestyle holds Getting there** (T597): the five ways as tiles bound to the same setting as the
  settings line; with Plane chosen only flights are priced, and a place with no flight shows no total.
- **Fewer words** (T596): no place counts on screen (they stay for screen readers), no help line under
  Good for, no positioning sentence in the footer.

### Explore v8 (owner review 2026-10-22, T601 to T604)

- **The overview hero** (T601): one licensed Commons photograph as a band across the content width
  (the first place of the month's or the top-rated rail), a solid `--surface` panel over its lower edge
  (`--radius-sheet`, `--elev-2`, at most 1040 px) holding "Where to next?", a small secondary Ask Carta
  pill (no example caption) and one joined search field (What | Where | Search, Search the overview's
  one primary; it rises 2 px on focus), the Map pill after it; the photo credit under the band. No text
  on the photograph itself.
- **Three levels under it:** the categories as kit Tabs (icon and word, the brown underline on the
  current one, on a hairline) on every browse tab, then quiet 32 px quick chips.
- **No permanent left panel on any browse tab** (T601, T602): filters live on top (quick chips, All
  filters or Filters, Sort); on a desktop the 320 px filter pane slides in only when Filters is pressed,
  closed by default, on a phone the sheet. Country is never a filter control: it comes from the settings
  line's Countries (one country in Only these) or from a country typed in Where, and shows as the band
  and a removable chip.
- **Chips and pane are one control** (T604): each quick chip's popover draws the pane's own section;
  a set chip shows its value in the selected tint with a tick. Action pills (icon first, 600) and filter
  chips (chevron last, 500) share one 36 px height.
- **No count on the map panel** (T603).

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
| `--text` | Body text and headings (blue-grey, 13.4:1) | On a brown fill |
| `--text-2` | Secondary text, default icon colour | A heading |
| `--text-3` | Metadata at 11 to 14 px | Body copy |
| `--border`, `--border-soft` | Edges of what you click or type into; hairlines inside an object | A second elevation on a shadowed object |
| `--action` (+ `-hover`, `-press`, `-text`) | The one primary button, links, the focus ring, the live route | Decoration, a rating, a selected chip fill |
| `--action-tint` | Hover ground of a quiet button | A selection on its own |
| `--select-bg`, `--select-ink`, `--select-border` | The one selected state | A dark fill |
| `--focus` | The 2 px focus ring | Anything else |
| `--best`, `--best-bg`, `--best-ink` | Best value: a marker or fill with `--text` on it; `--best-ink` when it must be text | Text in `--best` itself; anything but best value |
| `--rate` | The star of the Score (umber 700); `--rate-bg` and `--rate-soft` are neutral since T438 | A fill behind a rating, an action, a warning |
| `--gem-ink`, `--gem-bg` | Hidden gems: the diamond and its word in umber 700 on a neutral ground | Anything else |
| `--danger`, `--danger-dark` | Destructive actions | A warning, decoration |
| `--green`, `--status-success` | Good news in data; indicator dots and ticks | Chrome, a button, text in `--status-success` |
| `--kind-*` | Place kind, metro to area, as an ink density ramp | A rainbow |
| `--amber-ink` | Warning text, in rust (T438) so it never reads as the brown | An action |
| Domain colours (`--water-*`, `--trail-*`, `--amber`, `--ai-violet` and the rest) | One feature each, as listed in DESIGN.md | General purpose |

Rules that matter more than the table:

**One action colour.** Brown means "this acts", "this is live" or "this is selected" (the view's one
primary, a link, the focus ring, the live route, the chosen day on a map, the scrub marker on a profile,
the selected tint). It is not decoration: no brown stripe, dot or tint on something that neither acts,
is live, nor is selected. The rating star and the gem diamond are the two small marks it lends out.

**One selected state.** A selected chip, tab, segment, tile, rail row, nav item or section link is the
light `--select-bg` tint with `--select-ink` text and icon, plus a mark so the state never rests on
colour alone: a tick on a chip, a 2 px brown underline on a tab, a lifted white thumb (`--surface`,
`--elev-1`) in a segmented control, a brown edge on a selected card, the brown icon and label in the bottom
nav. Never a dark fill, never `--action` as a fill behind a selected label. The active section carries
`aria-current="page"`.

**Two base colours, each mark with one job.** Ink and brown carry the app. A rating is the Score, an
ink figure with a small brown star, never a filled chip, because "Rome 9.5" on a brown fill reads as a
button and in red as an error. A hidden gem is a small brown diamond with its word. Sun yellow is best
value and nothing else, red is destruction, rust (`--amber-ink`) is a warning. `token-contrast.mjs`
keeps the warning, best value and quiet tints visibly apart from the brown (delta E).

**Ink is never black.** `--text` is a blue-grey. No `#000`, no near-black slab. The 52 ink-filled
controls that made the app read as black are gone (T421, T422); do not bring one back.

**No new tints.** Use the tokens. Inventing a warm tint, a second brown or a new grey beside them is the
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
  letter-spaced, and nothing is uppercase: no eyebrows, no kickers, no small caps. The home page alone
  sets its slogan in `--text-hero` with `--tracking-hero` (-0.035em) and its section titles in
  `--text-showcase` at -0.03em (T606, owner D6: one face, a larger size, no second typeface).
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
- **One amount and its unit** (owner 2026-10-24, price plan rule 2, replacing T590's tilde). An
  estimate is written like any figure: no tilde, no "est.", no "live", no assumption line, and a screen
  reader hears the figure itself. Whether a price is measured, live or an estimate is stored by the
  price engine (`src/lib/price/`) and shown only in the admin page's Prices view. `formatEst()` and
  `<Money est>` stay for their callers and draw the plain figure; never a mark of your own instead.
- **Per person or the whole group** (T694, plan rule 4). One Segmented control under People in the
  settings line; every day figure, pin, filter stop and chip draws through `useDayView()`, the total
  being the figure times seats and nights ("for 2 people, 7 nights"). Nothing builds its own total.
- **The opened price** (T695, plan rule 9). The amount on a card and on the destination header opens,
  on a tap, the InfoDot popover listing the items in it (bed, food and drink, local transport, car hire
  when going by car, activities, events, the way there) with their amounts and a kit Switch each;
  switching one off is a setting and applies everywhere. An item without data shows `NotYet`, never a
  zero and never a switch. `components/PriceItems.jsx` is the one component.
- **Ranges** go through `formatMoneyRange()`: "€40 to €60", with the language's own joiner.
- **Per unit** is one phrase per language through i18n ("a person", "a day", "a night", "for the trip").
  No `/pp`, `/p`, `/day` in JSX. When two units apply the order is one: "a person a day" (T474); a
  person's share is "a person", never "each"; a unit is never a suffix glued to a figure.
- **No figure** prints words (`money.onRequest`, "Price on request"), never a blank, a lone dash or
  "€NaN".
- **The amount is the whole pedigree on the page** (owner decisions 2026-10-13, T438, and 2026-10-24). No method
  sentences ("measured from N stays", "the national basket", "N of M figures measured"), no "national"
  word after a figure, no source footers. Never a flight figure presented as Carta's own, never a bookable
  claim, never a stored figure shown as current. Every external booking link warns that prices may have changed.
- **Flights** (T511 to T518, 2026-10-21). A flight figure is Google Flights' price, not Carta's estimate,
  It always travels with the airline mark and the departure and arrival times. Owner decision
  2026-10-29 (T840): the "Google Flights, checked {time}" line is no longer required on screen, and
  Change flight shows none; where a link out to Google Flights is offered it still says "prices may
  have changed".
  The airline mark is the airline's own logo in a white square, never recoloured, tinted or redrawn. A
  fare the traveller typed in replaces it and is labelled as theirs. A swept price older than its sweep
  cycle is not shown (5 days for the next two weeks, 16 days beyond, T780; config `flights.max_age_days`). Bag fees (10 kg cabin, 20 kg
  checked) are Carta's estimates; the traveller's bag is priced on every flight (T691).
  Cents on receipts, whole euros on cards, like every other figure.
- **One day-cost basis.** The traveller's Lifestyle prices the day everywhere: the card, the pin and the
  page show the same figure (owner decision 2026-10-13, T374-d).

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
- **Density** (owner decisions 2026-10-13, T421 and T438): a filtered or searched list on Explore and
  Destinations is compact rows (a 72 px rounded photo, name, the Score, the price line, a save control),
  about ten to a phone screen. Sections (rails) and the home page use large photo tiles, where
  inspiration leads. A trip style's list is tiles too (owner 2026-10-15, T431): a week is chosen on its
  photographs and the places it visits, so each trip is a tile with a 3:2 photo, the full title, the
  places visited, the best months and the price.
- **Breakpoints.** Floor 360 px with no horizontal scroll; below 769 px the phone (four-slot bottom nav,
  sheets for choices, pages for detail); from 769 px the header carries the tabs; from 1024 px list and map
  side by side, highlighting each other, and two-column detail pages. Reading pages (a destination, a
  trip, an item page) cap their content column at 1180 px; browse surfaces (Explore, Destinations) use
  the full width with one gutter shared by the header, the settings line and the content (T438).
- **Icons** through `<Icon>`: 16 px in chips and inline, 20 px in buttons, rows and the tab bar, 24 px in
  empty states. Line icons from `Icons.jsx`, 1.5 stroke, `currentColor`, `--text-2` by default,
  decorative ones `aria-hidden`. No tile behind an icon.

## Photography

Photography leads, and every photo is real and licensed with its credit (`docs/tos/data_licenses.md`).

- **No text on a photograph.** Name, figure, length and credit sit under the photo on `--surface`, flush
  with its edge; no scrim, no gradient, no alpha band. The only things over a photo are round icon
  buttons (`IconButton tone="photo"`: a white disc with `--elev-1`), such as save.
- **The home page exception (T462, owner 2026-10-17; T606 and T620, 2026-10-23).** On the home page
  only (`src/browse/home/`), a short label or a price may sit on a photograph inside a solid `--surface`
  pill with `--elev-1` (the route card's towns and total). The hero film is the one photograph that
  carries words (T620, owner after Mindtrip and Komoot): one even tint over the whole film
  (`--home-film-tint`, never a gradient), and on it the slogan, one line and Ask Carta's field, whose
  "Ask Carta" is the page's one primary (T621), in white with a soft shadow under the words; on a wider
  screen the app header lies on the film, white on one flat `--home-film-bar` (T623), until the film has scrolled by (T621).
  The film's clips carry no credit on the page (owner, T621; the Pexels License asks for none). No other
  scrim, no gradient, no alpha band; every other credit on the caption line under its picture.
  Everywhere else the rule above holds.
- One aspect per row or rail: 4:3 on kit tiles, 3:2 on browse and library cards where they already use
  it. On a phone the photo takes at most a third of a choice card's height. A hero is at most 40 percent
  of the viewport height on a phone and 60 percent on desktop (the home page's hero film, which fills
  the first screen, is the one exception, T620).
- Corners `--radius-card` on a free photo; a photo at the top of a tile takes the tile's corners.
- A missing photo is the flag-and-name placeholder on `--surface-sunken`, never a grey or tinted box.
  Credits are text.
- A photo's credit sits under that photo, on its caption line, small and in `--text-3` (owner
  2026-10-15). Item pages keep no "Where this comes from" fold: the data sources are one line of links at
  the foot of the page.
- A gallery may run on a list tile (owner 2026-10-15): up to four photos that swipe inside the tile's
  media, the first loaded at once and the rest on first touch, arrows only on hover, the tile still one
  link. Not on the compact rows of a filtered list.
- Never an AI-generated photograph, never stock people with laptops, never a 3D or glossy render.

## The kit

`continent-app/src/components/ui/`, styled by `03-button.css` and `04-ui.css` on roles and scales only.
Use it; a new local button, chip or card style is a regression (the migration from T426 replaces the
old ones, and the `raw-button` lint rule (T425) meters what is left; `node scripts/ci/design-lint.mjs --meter`).

- **Button**: primary (`--action` fill, `--action-text`), secondary (`--surface`, `--border` edge),
  quiet (no fill, brown label, `--action-tint` on hover: an offer inside a bar, a row or a card), danger
  (`--danger` fill). Sizes md (`--tap`) and sm (32 px on a fine pointer only). Loading keeps its width;
  disabled is a sunken ground with `--text-3`, never a paler live button. One primary per view. A link
  that only navigates is a link, not a Button.
- **IconButton**: always a 44 px box and a required label. Tones plain (bars and rows), surface (over a
  map or on a sheet), photo (over a photograph). `pressed` gives the selected tint and `aria-pressed`.
- **Chip**: filter (toggle, `aria-pressed`, tick when on), choice (radio in a ChipGroup, arrow keys),
  count (a figure beside a label, `--surface-sunken`, `--text-2`, 12 px), status (tones neutral, best,
  gem, rate, positive, danger; `--radius-sm`; not interactive).
- **Segmented**: a sunken track with a lifted white thumb, radio semantics.
- **Tabs**: a brown underline that grows in, tablist semantics, arrow, Home and End keys.
- **Card**: layouts row (the compact default) and tile (rails, home). Slots in fixed order: media, title,
  meta, rating, price, actions. The price slot takes `<Money>`. One stretched link or button on the title
  opens the card; actions sit above the stretch; nothing interactive nests. Selected is a brown edge.
- **Field**: input, select or textarea with a visible label, help and error under it tied by
  `aria-describedby`; errors in `--danger` with the field edge `--danger`. A placeholder is optional
  (owner 2026-10-22, T569): the label names the field, so an empty field may stay empty, and a
  placeholder, when there is one, never stands in for the label. Ask Carta's chat field has none;
  while empty it types its suggested questions instead (see Interaction and motion).
- **Icon** and **Money** as above.
- **Score** (`RatingBadge.jsx`, T437): a drawn star in `--rate` and the figure in `--text`, tabular,
  12 px or more, no fill; the star is always filled (owner, 2026-10-14, T447: an outlined star read as
  "not rated"), and below the first band it is `--text-3` instead of `--rate`. `band` adds the
  band word (Exceptional, Excellent, Very good) through i18n, on a page head or a preview.
- **Switch** (T437): `role="switch"`, the whole row is the hit area; off is an outlined track with a
  dark thumb, on is the brown track with the thumb moved across.
- **Tile** (T437): an icon over its word in an even grid, as a toggle or a choice; selected is the tint
  plus a tick.
- Kept and restyled through tokens: `SheetShell`, `Dropdown`, `DateField`, `ReceiptCard`, `StateBlocks`,
  `InfoDot`. Read shadcn for keyboard and ARIA behaviour only; ship nothing of its look.

## Component rules

Decided by the owner (T360, 2026-10-03; T362, 2026-10-07) and by T380 (design direction v6, 2026-10-08,
reasoning in `docs/design-v6/DIRECTION.md` part 9), restated in Lagoon terms and, since T438, in brown.

**Places (T496, owner 2026-10-21).** Explore (Destinations folded in as six category tiles: Places, Trails, Beaches, Lakes, Mountains, Cycling; the trip library is a "Trip styles" row, never a tile), Plan (trip and day in one place; with nothing in progress a "Plan something new" page with two tiles, Trip and One day), My trips (star count only) and an account icon. Home is behind the logo on desktop and a "How Carta works" row in Account on a phone. Language and currency live in Account, not in the settings line.

**The free sentence.** "Planning is free. A Trip Pass adds exports, more saved trips and more AI plans." One key (`pass.freeSentence`), in exactly six places: home, the FAQ, the pass sheet, Account's Your plan, /pricing and its meta text. Never "100% free".

**Workspace (T500, T501).** Desktop: list left, map right, a fixed total bar at the foot that reads only `priceTrip()`, opens the receipt and never holds the primary; inside a trip it shows the trip first, then the day. Phone: the map fills the screen under one MapDrawer with three states (a `--drawer-strip` strip, half, up to under the header); the amount is always in the strip; the handle is a `--tap-main` button, so dragging is never required; the bottom nav hides when the drawer is full. Picked countries on a map are `--select-bg` with a `--text` edge.

**Explore: one overview per place (T504, roadmap 1.5).** A place says the same thing in the list and on the map, because both draw `browse/PlaceOverview.jsx` and read `lib/placeOverview.js`: a 72 px photo, the name with the Score, the flag with the region and country ("Tuscany, Italy", else the country), one reason (a guided answer, else the month's own sentence, else "Good in October", else "Best in May to Sep"; never two), the price a person a day in whole euros through `<Money est>`, and the save control outside the link. With a month the Score is the month's score once the wire carries it, else the base Score. A pin picks, it does not open: the picked pin is the one selected state on the map (`--select-bg` label with the `--select-border` edge, the dot ringed in the action brown), the picked row has the brown edge, and the overview opens the place. List | Map changes the view only; filters, sort and the pick stay (`xi=`). Desktop docks the picked overview at the foot of the map with a close; a phone's map lies under the MapDrawer, whose strip holds List | Map and the handle and whose body lists the places on the map as the same overview rows, the picked one first. A map never draws a second card of its own for a place (superseded 2026-10-22 by the floating place panel, T592: see Explore v6 above).

**Day detail (T501, owner T492-c).** The traveller picks how detailed a day is with one quiet Detail control: List (default), Parts of the day (Morning, Afternoon, Evening heads, 12 px 600 `--text-2`, not cards; Lunch and Dinner rows without amounts) or By the hour. Adding never reorders the day; "Best route" asks first. A ticket counts per person only where its price is known, else "Ticket, price not known" and no figure.

**The day sentence.** What a day price includes is built from a list of parts, one key per part ("A bed plus food and drink."), so a transport estimate is one more part later (owner T491-h). The destination page tabs (Overview, Nearby, When to go, Practical) stick under the PageBar by the sticky-rail rule and change the URL without a history step.

**The receipt.** Carta's signature object, wherever a total needs justifying: a `--surface-sunken` head with destination and route, one hairline separated line per cost component with the figure right aligned in cents, a `2px solid var(--text)` rule above the sum, the sum, and a tinted footer showing what one changed input would do to the total. It is the page's one bordered object and may carry `--elev-1` instead of its border, not both. On a trip page the trip's own budget is the receipt (cost bar, lines, est marks, total a person and for the party, the one Lifestyle control under it); a nearby town's receipt is a labelled second view and carries no stay select of its own. A day plan carries one per person figure for the day from the same cost index; a tap opens the compact receipt. A receipt line may appear outside the receipt only when read live from it and set exactly as it sets it.

**Budget search (T506, roadmap 1.19).** One bordered band at the top of Explore (not on Home; the owner places Home): "How much do you have?" first, the only required field, whole euros; under it one sentence states every other input ("2 people, 5 days in October, from Brussels by train or bus") with one quiet Change that opens Who, How long, When, From where and how, and Buffer in place. The search button is a secondary (the one primary belongs in the lower half). Every figure comes from `priceTrip()` through `lib/budgetSearch.js`; no second formula. The answer is "Places that fit {price}", then two groups only, Fits (the total with the buffer is within the budget) and Tight (it fits only by spending the buffer), as compact rows: the total for the group as the headline price, the day price a person under it (bed plus food, no buffer, the card's own basis), then what is left; too dear is one sentence ("3 places are a little over. With {price} more, they fit."), never a list, and no counts beside the headings. Its receipt is the receipt above in whole euros (owner 1.8): Bed, Food and drink, "Buffer, 10%" as its own line (on by default, T475-d), the total, then a "Not in the total yet" head with getting there (named by the chosen way), local transport and tickets, each reading "Not priced yet" in `--text-2` with no amount, tilde or dash, never summed. Inline under its row on a phone, a sticky column beside the list from 1024 px.

**The cost bar.** At most one stacked bar above a receipt's lines, never instead of them: 8 px, full width, one segment per line in receipt order in the `--kind-*` ramp, 1 px `--surface` gaps, no brown, no legend, no percentages.

**Cost on cards and pages.** A card or page that offers a place or a trip carries one price line: the day cost per person at the traveller's Lifestyle ("From {price} a person" with its length on a collection card, from the cheapest member, never an average; in a trip list whose length control already states the days, the card carries no length, owner 2026-10-15), read from `src/lib/costIndex.js` so it agrees with Explore and the receipt. It carries nothing about its source (T438; the estimate mark left on 2026-10-24). No figure when the data is too thin. A page shows one per person per day figure and every other mention on the page is that value.

**Best value.** The cheapest item in a comparison (the cheapest pin in view, a "Best value" status chip) is marked in `--best` with `--text` on it, once per view. It is a marker, not a selection and not an action.

**Price pins.** From zoom 4, at most 30 DOM labels, the best rated in view: name 12 px, figure 12 px semibold on `--surface` with a `--border` edge and `--radius-sm`; the cheapest in view takes the best-value marker; every other place is an ink dot sized by place kind, drawn from the first frame. No number clusters (T438). Every pin has a 44 px hit box.

**Map and list in sync.** A card under the pointer or in focus rings its pin 2 px `--text`, and a pin under the pointer outlines its card 2 px `--text`. The committed selection (the chosen day, the chosen place) is the one brown item on that map. On a multi-day map stops are numbered by day, the selected day's line is `--action` and every other day `--text`, beds are `--surface` squares with a `--text` border, and a line that is not the measured path says so under the map. On a planning map catalogue places are ink, a picked place carries a tick, and only the live route and its numbered stops are brown. While a map loads its box shows the geometry on hand as a still ink drawing, then crossfades in `--dur-3`.

**Ratings.** The Score: a star and the figure in ink, 12 px minimum, no fill (T437). A page head adds the band word. Hidden gems are a brown diamond with the word. Place kind is the ink ramp. Tier names such as "Worth the journey" never appear on screen.

**Plan cards.** Equal weight; the recommended plan is marked with a brown border and a "Recommended" chip and keeps the same ground. Never dim the free plan. State limits as plain numbers.

**My trips, Account and the pass screens (T503).** A trip on My trips carries one price: what it costs a person a day, in whole euros (owner 1.8); the party's total belongs to the receipt in Plan. A trip kept without an account says where it is ("Saved on this device") in one 13 px `--text-2` line under its card, with "Sign in" as a quiet small button, offered only as the way to have it on a second device, never as a condition. The Visited band carries the countries (the figure, the flags, Edit or Add in the same cell, the names as a list for screen readers); there is no second list of countries, and with nothing on the record the band is that one cell and its Add, never a row of zeros. "See all prices" is a quiet link (13 px 600 `--action`, underlined, `--tap` high) to `/pricing` at the foot of Account's Your plan and of the pass sheet, never a second primary; following it from the sheet closes the sheet first. Where the numbers come from (`/about/numbers`) is a link row in Account's help menu and desktop rail; the method and the counts live on that page and nowhere else. The pass price itself stays in cents, the amount charged.

**Suitability strip (retired 2026-10-15, T431).** The three-cell band under a trip hero is gone: the trip page carries a fact band (days, distance, climb, highest point, where you sleep, start) and the difficulty as a status chip in the head (five squares filled `--text` to the level, outlined `--text-3` beyond, plus the word, with an InfoDot). The five squares stay the one difficulty drawing everywhere.

**Detail page grammar** (owner decision 2026-10-15, T430 and T431: show first what makes the traveller want to go, then what decides it). Item pages (trail, beach, lake, mountain, cycle route and tour), top to bottom: the page bar (back naming the list, save, share); the photo gallery; the head (full name, the Score with its band, where, one hook line that sells the place, never a statistic about it); a fact band of four to six measured facts as label-over-value rows with a 16 px icon each (label 12 px `--text-2`, value tabular; no card, no colour; a missing fact is left out, never "Not recorded"); Why go, a photo track of highlights; the map with the climb drawn under it on routes; Before you go (at most four short icon rows, safety first, never folded); one hand-off row with the page's one primary and at most four secondaries (Download PDF is one of them, the page's only PDF door); getting there; at most three folded rows; Not quite right? (alternatives as large photo cards); nearby; one line of sources. The trip page: gallery, head, fact band, Why this trip, the price card (a sticky side column from 1024 px), Is this week for you, Not quite right? straight after it, the week day by day, getting there, before you go. From 1024 px a receipt page may run a sticky side column, inside the 1180 px cap. No bento grid: no tiles of mixed sizes.
Exception (owner decision 2026-10-23, T630 to T632): the fields of the explore-completeness spec keep their slot on the Explore detail sheets even with no data, and show the shared placeholder `components/NotYet.jsx` ("Not available yet"). For those fields "a missing fact is left out" and "Say less" do not apply. The fact band itself (KeyFacts) still leaves a missing cell out; the slots live in the Facts rows and sections. See DESIGN.md "Fields with no data yet".

**Data drawings.** One family on the ink ramp: weight is the scale (filled to the level, outlined beyond), the figure always sits beside the drawing, the drawing reads the same when removed, no legend (a strip on a card is explained once per list as a text key), at most one committed item in brown. Members: the month strip (twelve cells, the chosen month outlined 2 px `--text`, never `--action` or `--rate`), the thin bar (at most 8 px, segments separated by 1 px `--surface`), the profile (elevation on a km axis, one brown marker shared with the map, moved by drag, tap or arrow keys), the gauge (five segments, the cheapest band may be `--green`), the five squares, the receipt, and the label-over-value row. `--climate-good` and `--climate-poor` stay only where they already are.

**InfoDot.** One glossary marker: a 6 px `--text-3` dot after the term, inside a real `<button>` with a `--tap` box and an aria-label naming the term. It opens a popover (`--surface`, `--elev-2`, `--radius-control`, at most 280 px, the term in 600 and one or two sentences 13 px `--text-2`) from the shared glossary. Escape, a second tap or a tap outside closes it and returns focus. One per term per view, on the first occurrence; never on a heading, a button label or a pin; never an "i" in a circle.

**Dialog family.** One scrim (`--text` at 28 percent, no blur), one close control, a focus trap through `useFocusTrap`, Escape. A dialog is `--surface`, `--radius-sheet`, `--elev-3`, arrives in `--dur-3` and leaves in `--dur-2`; never a confirm modal. A sheet (a choice on a phone) rises over the same scrim with a grab handle, a `--tap` close and one primary, caps at 80 percent of the height in landscape and scrolls inside; a sheet never holds a sheet and a page never opens inside one. A popover (a card preview) is `--surface`, `--elev-2`, `--radius-control`, at most 320 px, never over the photo; it opens on hover after 150 ms, on focus after 400 ms, on Enter or tap at once. A choice of two from the bottom nav is a menu.

**Close control.** CloseIcon at 16 px in a `--tap` IconButton, top right (inline right on a toast), plain tone, label "Close" translated. No letter x, no multiplication sign, no grey disc.

**Navigation.** Anything that changes the view (a tab, the brand mark, a card that opens a page, a back control) is an `<a href>` with the view's URL; a section change pushes one history entry; `<button>` is for actions. Every detail page has its own URL, a save control and a share control in its page bar. The back control names the list it returns to, on a phone and a desktop alike: every full-screen page wears the one page bar, `PageBar.jsx` (back, the name once the heading has gone, save, share; T474). Opened by pointer or a link, focus goes to the page heading (tabindex -1); from the keyboard, the first control (`usePageArrival.js`); closing returns focus to the opener.

**Settings line.** A full-width band on every priced view, under the header and on the same gutter as the content, shows every input its prices depend on, like a booking bar (T577 to T582, owner 2026-10-22): From, When, People, Lifestyle, Countries and Getting there as equal segments, label (12 px `--text-2`) over value (`--text`), hairlines between them. Each part is a `--tap` button that opens its control; Getting there is one button that steps through Any way (a pin), Plane, Train, Bus and Car, each with its icon, and every price under it follows. No brown fill. From names a town, never an airport or an airport code: one search field without a placeholder, "Use my location", the countries that open their towns, and a search of all of Europe on press; the flight leaves from the priced airport nearest the town. When is Dates, Month or Any time over a Nights stepper, with no note about who picked the dates. People is three rows, Adults, Children (2 to 11) and Babies (under 2), each with its stepper and nothing else. Countries is Only these or All but these over a searchable list of tick rows; its chips read "Not France" in the second mode. On a phone the line is one sentence (the dates or month and a head count, never the nights), the bed and the way icon, and Countries is a door beside Filters.

**Lifestyle control.** There is one: the Lifestyle panel. A surface that changes how the traveller travels opens or embeds it and never builds a second slider. Shown as a slider it is stepped, one labelled stop per level, and the figures update in place. The panel carries no sentences of its own (owner 2026-10-22, T580): a one-line title, the tiles, the fold and Done, and it fits a desktop screen without scrolling.

**Filters.** Removable filter chips in one row above a filtered list, each named "Remove <filter>", ending in "Clear all", the same on every browse tab. At most one sticky refine row per list (`--surface`, `--border` bottom edge, `--tap` high, no shadow) holding Filters, sort, country and the active chips. Up to six categories on a phone are a 2 x 3 grid of equal buttons. The budget is a stepped two-thumb range (owner 2026-10-22, T589: a floor and a ceiling on 0, 20, 40, 60, 80, 100, 130, 160 and Any a person a day, ground only), never a free slider; it filters and does not re-price. A month select holds the twelve months plus "Any"; with a month, a card may carry one measured month fact ("Swim season includes July"), never a forecast.

**Rails and cuts.** A rail has a heading (a figure, a verb, or a plain section name such as "Hidden gems"), "See all" without a number, arrows on a fine pointer, arrow keys when focused, dots hidden from screen readers, scroll-snap, one aspect, no autoplay or loop; no subtitle and no position figure (T438). Desktop shows at most four rails and a phone three (a countries track counts as one); further cuts are one row of door buttons (secondary, small) right over the list they narrow (T457, Explore's doors). The first browse rail may be a cost cut ("Under {price} a day in <month>") sorted by day cost with countries interleaved.

**Tracks.** The day track, flashcards and the photo track share mechanics: one card per stop of `scroll-snap-type: x mandatory`, about 85 percent wide on a phone so the next shows, three across from 1024 px for days; Previous and Next secondaries at `--tap` and the position ("Day 3 of 7", "2 of 5") above or under it; arrow keys move one; position dots 6 px `--border`, the current one `--select-border`, hidden from screen readers. Swiping is a shortcut, never the only way. No autoplay, no looping, no flip, no 3D, no stacked shadows. Flashcards have a "Show all" link that turns the deck into a list, and print as the list. Every day stays reachable as a link from the page's own list.

**3D terrain map** (owner decision 2026-10-15, T430). A map on an item page or a trip day may offer a 2D / 3D Segmented control in a toolbar row under it, never over it. 3D drapes the route and pins on real terrain (the Mapterhorn elevation tiles through `src/lib/terrainSource.js`) with a hillshade in token colours; it is off by default, tilts and rotates only under the traveller's hand, eases its camera within `--dur-4` and never moves by itself (no orbit, no fly-through). Charts, profiles and photographs stay flat: "no 3D" still holds for them. Maps on a page never ask for Ctrl or Cmd: a two-finger trackpad swipe pans, a pinch zooms, a mouse wheel zooms, and on a phone the map in the page flow stays still until the traveller expands it.

**Day list.** Between two stops one line gives minutes and km by the leg's mode; each stop carries an arrival time; both are estimates, so the first of each per view carries the tilde, "est." and an InfoDot. No hour grid, no end time stated as fact. Days are switched with one control, "Day N, weekday date", flanked by Previous and Next. Ways to add live in one labelled toolbar row inside the content; nothing floats over the list.

**Sticky section rail.** At most one per page, only with three or more sections: a `--surface` band, `--tap` high, `--border` bottom edge, no shadow, links 13 px `--text-2` scrolling sideways on a phone; the section in view takes the selected state. Each link is a real `<a>` to its anchor.

**Bottom slot and undo.** Toasts, the site notice and the pass expiry banner stack in one slot above the bottom nav on a phone and bottom centre on desktop, newest on top, at most three, each with a close, never over the nav or a sheet's primary. A destructive action on the traveller's own data runs at once and shows "Undo" as a secondary for six seconds; the button that started it is `--danger`. An inline confirm only where nothing can be held back (deleting an account, publishing to the gallery, withdrawing a public link): one sentence and two buttons, the safe one first and focused, Escape keeps; the erasing one is `--danger`, the publishing one primary.

**"More" menu.** More than two secondary actions in a footer: the rest go into one "More" button with menu semantics; a destructive item in it is `--danger` text. A multi-step flow's fixed chrome on a phone takes at most a quarter of the screen together, and its footer is one row.

**Status, not green.** A positive verdict or confirmation ("You can swim here", "Profile updated.") is `--text` with a 6 px `--status-success` dot before it; never a green container, never green text in a sentence. `--green` stays for good news in data and may mark a "since you saved" drop ("{price} less a day than on 3 Oct"; `--text` when higher). The kit's positive status chip follows the same rule (owner, 2026-10-13): `--text` on `--surface-sunken` with the dot, a short label with its word.

**Small text.** A label above a group of controls is 12 px weight 600 `--text-2`, sentence case, no letter-spacing. A toggle may carry one line of 12 px metadata under its label. Difficulty is one five-step scale in one i18n group. Earned milestones are `--text`, locked ones `--text-3` outline, "New" is a `--border` outline chip.

**Smaller rules still in force.** The comparison table puts items as columns, one row per attribute, sticky headers, two columns visible on a phone. On a list of dated plans the first upcoming one may be one size larger (a focal card), never a bento. Derived sentences show only when the authored text agrees with the data, never "0 of N". A view may restore the last category, country or open folds from browser storage in try/catch, correct without it. The pass is never in the header or the bottom nav; it appears only at the moment something paid is tapped, in Account and on /pricing, with the Trip Pass listed first and preselected (T488, T497). The install hint is one line with a secondary "Add to home screen" in My trips, on a phone browser not running the installed app, after a saved trip, dismissed for good; never a modal or banner. Every modal has the scrim and the page behind takes no clicks.

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
page scrolled, nothing loops (outside the home page and Ask Carta exceptions below), the bottom nav
never moves. Every transition has a
`prefers-reduced-motion: reduce` branch that sets it to `none`; scripted motion asks
`prefersReducedMotion()` or `durationMs()` in `src/lib/motion.js`.

The home page exception v2 (T462, owner 2026-10-17: "allow it"; widened by the owner on 2026-10-23 when
the page was rebuilt from scratch, T606, decisions D2 to D6 in `Execution/P15/T605-home-research.md`).
The home page (`src/browse/home/`) is the one surface that persuades rather than operates, so it may move
on its own, within these limits (values and tokens in DESIGN.md "Home page exception v2"):

- **A film, not a carousel of claims.** The hero is a film of real places that fills the first screen
  and the window's whole width at every size, under the app header (T621), one shot each
  `--dur-film`, crossfading as one continuous cut: no progress bars, no pills, no control on it. Each shot
  is a licensed clip (T618), its credit kept in `homeDemo.js`, a still only as fallback. It moves only on screen and in a visible
  tab; reduced motion stands it still. The owner chose no pause control (T620, 2026-10-23), which leaves
  WCAG 2.2.2 open (register T620-a).
- **The app is shown by recordings of the app.** Each story panel plays a clip from
  `scripts/record_home_clips.mjs` (the running app through real links, recorded in all six languages) in
  a straight phone frame, never a coded copy of the app and never a click that did not happen. A clip
  plays only in view, one at a time, and moves the story on when it ends.
- **Tabs may move on by themselves** until the first touch, click or focus, with a neutral line filling
  under the row; the question in a voices tab types itself out (Ask Carta's typing).
- **One drawing that means something:** the story's trip drawn on its country, the line drawing itself
  once by `stroke-dashoffset` in `--dur-draw`, the towns and the total arriving after it.
- **Coloured grounds** behind the panels from the `--home-ground-*` tokens (existing umber and lagoon
  primitives), never two alike in a row.
- **Sections arrive once** as they enter the viewport (opacity and a short rise in `--dur-reveal`), below
  the first viewport only, never before the observer exists, and never left waiting after a long jump.
- **Labels on photographs** in a solid pill, and the hero film's words under one tint (see Photography).

Still binding on the home page: motion tokens for every transition; transform, opacity, clip-path and
stroke-dashoffset only (and a panel's background colour); nothing tied to the scroll position; no
overshoot or bounce, no parallax, no count-up, no marquee, no gradient or scrim (the hero film's one even tint aside), one primary, 44 px
targets. No other surface takes this exception.

The Ask Carta exception (T569, owner 2026-10-22: "I like some animation"; T570 moved it into the
chat). Ask Carta is a chat (`src/browse/ask/`): one "Ask Carta" door (since T595, 2026-10-22: a field-like door in Explore's
overview, and nowhere else) opens a panel docked right under the settings line on desktop, the list
making room beside it, and a full-screen sheet on a phone. A chat may show that it is working and
what to ask by moving:

- **Typed suggestions.** While the chat's field is empty, it types out its suggested questions one at
  a time in `--text-3`, holds each, erases it and types the next, around and around. Typing and
  erasing are timed per letter (about 45 ms and 18 ms), the hold about 1.8 s. A drawn 2 px caret
  blinks (1 s, stepped) only while the field has no focus; with focus the browser's own caret stands
  in. It stops at once on a typed letter, pauses while the tab is hidden or the field is out of view,
  is `aria-hidden`, and under `prefers-reduced-motion: reduce` does not run at all.
- **The work as steps.** While an answer is made, its real stages show as a short list (reading the
  question, looking through the places, checking flights from the home airport, writing the answer):
  each step fades in at `--dur-2`, done steps take a tick in `--text-3`, the working step has one 8 px
  `--action` dot that pulses (opacity and scale, 1.2 s) because it is live. Steps name real work,
  never a made-up delay.
- **Typing, then the words** (T583, owner 2026-10-22). While Carta makes an answer, a typing bubble
  shows: three 6 px `--text-3` dots in a `--surface` bubble, pulsing opacity in turn (1.2 s, staggered
  0.2 s), `aria-hidden`, with "Carta is writing" for screen readers. It lasts the real wait, at least
  750 ms, so a cached answer never snaps in; past 2.5 s the real steps replace it, never both. The
  answer then appears word by word (about 30 ms a word, always under 1.5 s), the words to come holding
  their place unseen so the bubble never grows. Under reduced motion, or in a chat reopened from the
  list, nothing waits and the text shows at once.
- **Arrivals.** The panel slides in once (`--dur-3`, a short translate), a question and each part of
  its answer fade in at `--dur-2`, and suggestions arrive with a stagger of at most 120 ms.

One answer is at most three short sentences in a warm, plain voice, three places as compact rows with
one "More places", and one question ("Got one in mind?") with the places and "Not yet" as quick
replies. The trip card waits for the traveller's pick. No counts of matches, no "In short", no method
line per answer: the one disclaimer under the field is the whole pedigree. The chat sits on
`--surface-page`; Carta's turns are `--surface` bubbles, the traveller's are `--select-bg`.

These are the only loops outside the home page. Everything else in this section still binds the chat:
motion tokens for transitions, transform and opacity only, no overshoot or bounce, no marquee, one
primary per view (in a chat, only the newest answer's Plan this trip). A loop on any other surface is
a defect.

Phone first. Design the phone layout first, at 360 px. Every fixed or sticky bar reads
`env(safe-area-inset-*)`; full-height layouts use `100dvh`. The one primary sits in the lower half of the
screen inside the content, never sticky over it and never in the top bar. A swipe, drag or long press
always has a visible button doing the same; `:hover` rules sit inside `@media (hover: hover)`. The submit
sits under the last field, and the bottom nav hides while an input in a sheet or page has focus. Desktop
adds side by side map and list, hover detail and keyboard shortcuts; it never removes a phone path.

## Copy

The voice did not change with the look. Carta sounds like an instrument, not a brochure.

- Every headline carries a verb the traveller recognises or a number. "What the whole trip actually
  costs" works; "Everything the price tag usually hides" could sit on any product. A browse section title
  may be a plain noun phrase ("Hidden gems").
- Say less (owner, 2026-10-13). Every sentence on a page earns its place for the traveller. Method notes,
  coverage statements and catalogue counts ("3,855 places", "253 trips in 39 countries") are not page
  furniture; a figure the traveller needs (a price, a distance, their own shortlist) is.
- No em dashes and no en dashes, anywhere: a comma, a colon or two sentences. `stripDashes()` in
  `src/lib/format.js` enforces it on shipped strings; the rule holds for source, docs and reports too. No
  middot or bullet characters as separators. Ranges use the word "to".
- Banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.
- Sentence case everywhere. No terminal punctuation on labels, buttons or headings; body and helper text
  take full stops. Contractions are fine.
- Active voice, verb first. A button that says "Save trip" produces "Trip saved."
- Errors say what happened and what to do in one sentence, with no apology and no "Error:" prefix.
- Empty states are an invitation, not an apology: name the space and give the action.
- A hand-over names the thing and the app: "Open Day 2 in Google Maps", "Open this ride in Google Maps".
  Never "Navigate", "Start route" or "Directions", because Carta does not navigate.
- Honest in the product's own voice. A flight price is never presented as Carta's own estimate (the
  checked line is optional since T840); a fare the traveller typed is labelled as theirs. When the AI is off, say it is off. An empty result says so in one line.
- Strings go through i18n keys in all six languages, never concatenation; test labels at the longest
  translation (usually German).

## Never do this

1. A dark-filled selected state: a chip, tab, segment or row painted ink or deep brown with white text.
   Selection is the light tint plus a mark.
2. A second primary in a view, or brown spent on decoration (a stripe, a dot, a tinted badge on something
   that neither acts nor is live nor is selected).
3. Gradients of any kind, a scrim over a photo, glassy blur as decoration, an inset or stacked shadow, or
   a border and a shadow on the same object.
4. Text on a photograph. The caption sits under it on `--surface`. (The home page's solid pill labels
   and its hero film's words under one tint are the exceptions; see Photography.)
5. Uppercase eyebrows or kickers, letter-spaced labels, a costume face for numbers, or any face but
   Figtree.
6. Fabricated social proof: testimonials, user counts, press, partner logos, "popular" badges without a
   measure. Data freshness is the proof Carta has.
7. AI-generated photographs of places, stock people with laptops, 3D or glossy icons, pastel tiles behind
   line icons.
8. A hex, font name, px font size, radius or spacing in a component when a token exists; any colour not in
   DESIGN.md; black (`#000`) as ink. Hex lives only in `:root` and the token mirror `src/map/tokenColors.js`.
9. A euro sign or "EUR" in an i18n string or JSX, `toFixed` on a price, a rounded receipt line, or any
   mark of provenance on a price: a tilde, "est.", "live", a method line (2026-10-24, price plan rule 2).
10. Functional text under 11 px, a figure or rating under 12 px, or a touch target under 44 px on a coarse
    pointer.

Also never: catalogue counts, method sentences or coverage notes as page furniture; a filled rating chip;
a row of three stat counters as a hero device, numbered markers `01 / 02 / 03` unless order
matters, scroll-triggered counters, marquees, parallax or fade-in on every section. (The home page may
let its sections arrive once and play its film and its recorded clips; see Interaction and motion.)

## Quality floor

- 360 px wide with no horizontal scroll; one `h1` per view, headings in order.
- Real `<a>` for navigation, real `<button>` for actions; visible focus on every interactive element.
- Every text pair 4.5:1 or better (`node scripts/ci/token-contrast.mjs`); `--text-3` never for body copy.
- Colour is never the only carrier: selection carries a mark, place kind survives
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
3. Is brown used only for what acts, is live or is selected (plus the rating star and the gem diamond),
   sun yellow only for best value, `--danger` only for destruction, and is every selected state the light
   tint with a mark?
4. Is any rating or figure under 12 px, any functional text under 11 px, any column of figures without
   tabular numerals, any euro not from `formatMoney`?
5. More than one primary button in a view, or text on a photograph?
6. Does every headline contain a verb or a number (or name a browse section), is there no count, method
   line or coverage sentence that could go, and is the diff free of em and en dashes, middots and the
   banned words?
7. Remove one thing. There is almost always one decoration that is carrying nothing.
