---
version: alpha
name: "Viantra house style"
description: "The furniture of a European footpath, made for prices. A pale stone ground, green-black ink and terracotta as the one accent: the main action, links and every chosen thing. Warnings, delete and best value are ink. The blaze, the signpost plate, the relief drawn from real peaks and the price formation are its signature parts."
colors:
  primary: "#a54a26"
  on-primary: "#ffffff"
  primary-hover: "#8e3f20"
  primary-press: "#73321a"
  brand-mark: "#b5532c"
  surface-page: "#eef0ea"
  surface: "#ffffff"
  surface-sunken: "#e3e7df"
  surface-hover: "#e6e9e2"
  text: "#1e2421"
  text-2: "#465049"
  text-3: "#59625c"
  border: "#cfd5cc"
  border-soft: "#dde2da"
  edge: "#7a847d"
  action: "#a54a26"
  action-hover: "#8e3f20"
  action-text: "#ffffff"
  plate: "#1e2421"
  on-plate: "#ffffff"
  wagon-go-ink: "#73321a"
  wagon-bed: "#a54a26"
  wagon-bed-ink: "#ffffff"
  wagon-food: "#e9ece5"
  wagon-food-ink: "#73321a"
  kind-places: "#a54a26"
  kind-trails: "#2f7a45"
  kind-beaches: "#0e7c86"
  kind-lakes: "#2b5fa8"
  kind-mountains: "#6248a8"
  kind-cycling: "#b02a63"
  map-route: "#a54a26"
  danger: "#1e2421"
  owe: "#1e2421"
  warn-ink: "#1e2421"
  best: "#1e2421"
typography:
  display:
    fontFamily: "Overpass, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "tnum, lnum"
  headline:
    fontFamily: "Overpass, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.018em"
    fontFeature: "tnum, lnum"
  signpost:
    fontFamily: "Sofia Sans Extra Condensed, Overpass, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.05
    fontFeature: "tnum, lnum"
  title:
    fontFamily: "Overpass, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    lineHeight: 1.2
    fontFeature: "tnum, lnum"
  plate:
    fontFamily: "Sofia Sans Extra Condensed, Overpass, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.05
    fontFeature: "tnum, lnum"
  figure-lg:
    fontFamily: "Overpass, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum, lnum"
  figure:
    fontFamily: "Overpass, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum, lnum"
  lead:
    fontFamily: "Overpass, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum, lnum"
  body:
    fontFamily: "Overpass, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.35
    fontFeature: "tnum, lnum"
  button:
    fontFamily: "Overpass, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum, lnum"
  label:
    fontFamily: "Overpass, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.35
    fontFeature: "tnum, lnum"
  micro:
    fontFamily: "Overpass, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.35
    fontFeature: "tnum, lnum"
rounded:
  sm: "6px"
  control: "8px"
  panel: "12px"
  card: "16px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "40px"
  "8": "56px"
  "9": "64px"
  tap: "44px"
  tap-main: "48px"
motion:
  press:
    duration: "80ms"
    timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)"
  tick:
    duration: "300ms"
    timingFunction: "linear(0, 0.2921, 0.7046, 0.9515, 1.0381, 1.0422, 1.0232, 1.0072, 0.9997, 1)"
  pop:
    duration: "550ms"
    timingFunction: "linear(0, 0.1639, 0.4885, 0.7967, 1.0067, 1.1073, 1.125, 1.0971, 1.0551, 1.0184, 0.9951, 0.9852, 0.9847, 0.9889, 0.9942, 0.9985, 1.001, 1)"
  settle:
    duration: "400ms"
    timingFunction: "linear(0, 0.2175, 0.5207, 0.7361, 0.8631, 0.9317, 0.9668, 0.9842, 0.9926, 0.9966, 0.9984, 0.9993, 1)"
  paint:
    duration: "220ms"
    timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)"
  sheet:
    duration: "420ms"
    timingFunction: "cubic-bezier(0.32, 0.72, 0, 1)"
  fast:
    duration: "120ms"
    timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)"
  base:
    duration: "200ms"
    timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)"
  surface:
    duration: "320ms"
    timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)"
  slow:
    duration: "480ms"
    timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-main:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-primary-press:
    backgroundColor: "{colors.primary-press}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-quiet:
    textColor: "{colors.action-hover}"
    rounded: "{rounded.control}"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    height: "44px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "36px"
  segmented-selected:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.pill}"
    height: "44px"
  header-door:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.pill}"
    size: "44px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.lead}"
    rounded: "{rounded.control}"
    height: "44px"
  plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.on-plate}"
    typography: "{typography.plate}"
    rounded: "{rounded.sm}"
    padding: "6px 26px 6px 12px"
    height: "52px"
  plate-mark:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.sm}"
    height: "28px"
  score-plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.on-plate}"
    rounded: "{rounded.sm}"
    height: "24px"
  wagon-go:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.wagon-go-ink}"
    rounded: "{rounded.pill}"
    height: "24px"
  wagon-bed:
    backgroundColor: "{colors.wagon-bed}"
    textColor: "{colors.wagon-bed-ink}"
    rounded: "{rounded.pill}"
    height: "24px"
  wagon-food:
    backgroundColor: "{colors.wagon-food}"
    textColor: "{colors.wagon-food-ink}"
    rounded: "{rounded.pill}"
    height: "24px"
  warn-line:
    textColor: "{colors.warn-ink}"
    typography: "{typography.label}"
  page:
    backgroundColor: "{colors.surface-page}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
  band:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text-2}"
  row-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.text}"
  meta-text:
    textColor: "{colors.text-3}"
    typography: "{typography.label}"
  hairline:
    backgroundColor: "{colors.border}"
    height: "1px"
  hairline-soft:
    backgroundColor: "{colors.border-soft}"
    height: "1px"
  control-edge:
    backgroundColor: "{colors.edge}"
    width: "1.5px"
  logo:
    textColor: "{colors.brand-mark}"
  route:
    backgroundColor: "{colors.map-route}"
    height: "3px"
  best-tag:
    textColor: "{colors.best}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  owe-figure:
    textColor: "{colors.owe}"
    typography: "{typography.figure}"
  kind-tab-places:
    textColor: "{colors.kind-places}"
  kind-tab-trails:
    textColor: "{colors.kind-trails}"
  kind-tab-beaches:
    textColor: "{colors.kind-beaches}"
  kind-tab-lakes:
    textColor: "{colors.kind-lakes}"
  kind-tab-mountains:
    textColor: "{colors.kind-mountains}"
  kind-tab-cycling:
    textColor: "{colors.kind-cycling}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
  sheet-close:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    size: "44px"
  receipt-total:
    textColor: "{colors.text}"
    typography: "{typography.lead}"
---
# Viantra house style

The visual layer, for any agent that builds a screen. The tokens above are generated from `continent-app/src/styles/01-tokens.css` (`node scripts/ci/design-md-tokens.mjs`; never edit them here). Who and why: `PRODUCT.md`. Promise and tone: `BRAND.md`. How to build: `CLAUDE.md`. Part specs, read only for the part you build: `@docs/design/components.md`. Every part, live: `/?styleguide`.

## Overview

**The furniture of a European footpath, made for prices.** A walker reads a painted waymark, a signpost with a place, a time on foot and a distance, and the shape of the ground. The app gives prices the same furniture, on a pale stone ground with green-black ink and one accent, terracotta. It is a tool to compare honest numbers, not a brochure: dense, calm and exact, warm through its one colour and its photographs.

**Quick start for an agent:**
- One accent: {colors.primary} for the main action, links and every chosen thing. Everything else is stone ({colors.surface-page}), paper ({colors.surface}) and ink ({colors.text}).
- Overpass for every word and figure, with tabular figures; the plate face only for place names on plates.
- Radius {rounded.control} for controls, {rounded.card} for photos and cards, pills for chips.
- The figure is the loudest thing in its row. One solid main button per screen.
- Use the kit in `src/components/ui/`; never a local style.

**Fixed rules.** These hold whatever the look:
1. **Accessible:** 44 px targets ({spacing.tap}), WCAG AA contrast (4.5 text, 3 marks, `scripts/ci/token-contrast.mjs`), a visible focus ring, full keyboard use, a 12 px floor, colour never alone, reduced motion shows the end state, real links and buttons, one `h1` per view, modals that trap focus and close on Escape, every string through i18n.
2. **Honest numbers:** every figure from the price engine through `formatMoney()`, "Not yet" for a missing one, the engine's own total, no price moving unless the traveller changed it.
3. **Copy:** the mechanics and vocabulary in `PRODUCT.md`, the tone in `BRAND.md`.
4. **Every function stays:** restyle, never remove.
5. **Tokens and kit only:** no hex outside `01-tokens.css` (the map mirror and flags excepted), no literal sizes, durations or easings, no local restyle of a kit class (`scripts/ci/design-lint.mjs`). This is what keeps the look changeable.
6. **One main action per screen.**
7. **Three angles:** phone, tablet and desktop each deliberate; no horizontal scroll from 360 px.
8. **Photos:** licensed and credited; no text on a photo outside `.hs-photo-scrim`.
9. **Logo:** Gate V only (`BRAND.md`); the blaze is never the logo.
10. **Light only**, until a theme is decided as its own feature.
11. **One accent:** terracotta is the only colour on a page; warnings, delete, best value and money owed are ink.

**Free to change:** every value (as long as contrast passes and the page keeps one accent), the faces, durations and springs, and the anatomy of every part, the signature parts included. They are today's identity: keep the job each does, change how it looks. Everything below this section and in `components.md` is the current default, a record of what is built, not a law.

## Colors

Stone and ink are calm; terracotta is the one accent.

- **Primary** {colors.primary}: the main action, links, focus, every chosen thing (a chip, a segment, a tab bar, the chosen pin), the route and the header doors. White on it 5.82:1; on stone 5.07:1. Hover {colors.primary-hover}, pressed {colors.primary-press}. Never decoration, never a second accent beside it.
- **Brand mark** {colors.brand-mark}: the Gate V arch only; never text, never a fill.
- **Ground:** {colors.surface-page} stone behind everything, {colors.surface} paper for sheets, cards, fields and bars, {colors.surface-sunken} for quiet bands and wells, {colors.surface-hover} on hover.
- **Ink:** {colors.text} for main text (never #000), {colors.text-2} for second lines and every 12 px line, {colors.text-3} for third text at 13 px and up. Hairlines {colors.border} and {colors.border-soft}; control edges {colors.edge} (a mark, never text).
- **Plates:** {colors.plate} with {colors.on-plate} for the signpost and Score plates.
- **Ink, not colour:** {colors.danger}, {colors.warn-ink}, {colors.best} and {colors.owe} are all ink. Delete, errors, warnings, best value and money owed say what they are by a word, an icon, an outline or a sign; no tinted boxes.
- **Kinds:** places, trails, beaches, lakes, mountains and cycling each have a paint ({colors.kind-trails} and the rest) for their pictogram, swatch and tab underline only, always with the pictogram and the word.
- **Map:** land, water, borders and the route ({colors.map-route}), mirrored in `src/map/tokenColors.js`.
- **Retiring:** the saffron `--sun-*` marks and a few single-job domain colours keep their last readers (`@docs/design/components.md#colours-being-retired`); no new readers.

The `--umber-*` names in the code hold the terracotta scale, and `--umber-50` and `--umber-100` hold quiet stone shades; the names stay because hundreds of rules read them.

## Typography

**Overpass** (SIL OFL 1.1) sets every word and figure, variable 100 to 900, with tabular lining figures on `body`. **Sofia Sans Extra Condensed** sets plate names only, 19 px and up. The wordmark is Fraunces drawn as outlined paths, so it loads no font. Self-hosted woff2 in `src/assets/fonts/`; checked glyphs Č, Š, ť, ü, ñ, œ, Ž, ł, ő, Ě, €.

| Token | Phone | Tablet 769 up | Desktop 1024 up | Use |
|---|---|---|---|---|
| {typography.display} | 40 | 48 | 54 | A total figure |
| {typography.headline} | 24 | 30 | 36 | A page title |
| {typography.signpost} | 32 | 38 | 44 | The one signpost title (capitals, plate face) |
| {typography.title} | 19 | 21 | 22 | A section |
| {typography.plate} | 21 | 22 | 22 | A plate name |
| {typography.figure-lg} | 28 | 28 | 28 | A followed price on its tile |
| {typography.figure} | 18 | 18 | 19 | A row's day figure |
| {typography.lead} | 16 | 16 | 16 | Reading text and fields (16 so iOS never zooms) |
| {typography.body} | 14 | 14 | 14 | Rows, controls, lists |
| {typography.label} | 13 | 13 | 13 | Labels |
| {typography.micro} | 12 | 12 | 12 | The floor |

Sentence case; no uppercase transforms, no eyebrow kickers. Headings balance. Plate names wrap with `hyphens: auto` and the document `lang`; names truncate only as a last resort. The figure is always the loudest thing in its row or card.

## Layout

- **Space** on a 4 px grid ({spacing.1} to {spacing.9}: 4, 8, 12, 16, 24, 32, 40, 56, 64).
- **Gutter** `--page-gutter`: 16 on a phone, 24 from 769, 32 from 1024, 48 from 1440. **Caps:** browse 1440, one place or trip 1240, hubs 1120, forms and reading 720. Every grid track is `minmax(0, …)`.
- **Targets:** {spacing.tap} floor; {spacing.tap-main} for a place's main action and the bottom nav.
- **Density:** about ten places per phone screen in a list; large photo cards only on rails.

| Angle | Widths | Shell | Layout |
|---|---|---|---|
| Phone | to 768 (390 x 844, 360 floor) | Slim header (wordmark, Friends, account), bottom nav of three (Explore, Plan, My trips) | One column; the main action in a sticky bottom bar where a page has one |
| Tablet | 769 to 1279 (820 x 1180, 1180 x 820) | One header row; places stack icon over word | Two panes where content allows (list and map from 769; a side column on detail pages from 1024); extras move to More, nothing is cut |
| Desktop | 1280 up (1440 x 900, 1920 checked) | One header row; places with icon and word | The price and its action in the first view; filters as a rail beside lists |

Breakpoints come from `scripts/ci/css-breakpoints.mjs` (360, 380, 420, 430, 480, 600, 700, 768, 1024, 1100, 1200, 1240, 1280, 1440, 1600, 1800). A sweep at 360, 390, 600, 768, 820, 1024, 1180, 1280, 1440 and 1920 shows no horizontal scroll.

**Ledger before panel:** a list is ruled onto the ground (a rule above and below, hairlines between, no fill or shadow), its text aligned with the section head. A paper panel is only for one object that must read as a thing: an identity card, a form, a chart's ground, a card in a grid, a sheet.

## Elevation & Depth

Only what floats casts a shadow; every shadow is ink, never colour.

| Token | Value | For |
|---|---|---|
| `--elev-1` | `0 0 0 1px` ink at 7 % | Cards and panels: a hairline ring, flat on the ground |
| `--elev-2` | ink ring at 6 %, then `0 12px 32px -8px` ink at 24 % | Sheets, menus, popovers, toasts, the action bar |
| `--elev-3` | ink ring at 6 %, then `0 18px 48px -12px` ink at 32 % | A dialog |
| `--scrim` | ink at 42 % | Behind a modal sheet or dialog |

No coloured top or side border on a panel; no decorative gradient, glass or glow.

## Shapes

{rounded.sm} for a plate's square end, a tag and the Score plate; {rounded.control} for buttons, fields, search, menus and toasts; {rounded.panel} for panels, sheets and the map frame; {rounded.card} for photos and cards; {rounded.pill} for chips, wagons, segments and round doors. The plate keeps its pointed end (`--plate-tip` 14 px); the blaze keeps its square stripe. Strokes: hairline 1, control edge 1.5, route and paint bar 3, focus ring 3 with a 2 px offset.

## Motion & Micro-interaction

Character: **painted and placed.** The state changes in the next frame; motion only says what changed and where it went.

- **Overshoot only on the control the finger touched** ({motion.tick}, about 5 %; the Add icon {motion.pop}, about 13 %). Figures, plates, the chosen pin, surfaces and pages settle without overshoot ({motion.settle}).
- Press {motion.press}; a blaze or tab bar painting in {motion.paint}; a sheet rising {motion.sheet}; routine changes {motion.fast} to {motion.slow}. A view transition lasts at most {motion.surface}.
- Figures move only right after the traveller changed them; a delta note ("+€328") stays four seconds.
- At most one signature moment per screen. Interruptible: transitions and springs, not keyframes.
- Haptics only on a touch commit, through `src/lib/haptics.js`, with a "Vibrate on tap" setting.
- Reduced motion shows the end state at once (`02-base.css` zeroes every duration).

Springs come from `src/lib/motionTokens.js` via `scripts/ci/spring-easings.mjs`. Primitives, haptics and what never moves: `@docs/design/components.md#motion-patterns`.

## Voice & Content Strategy

The tone is `BRAND.md`'s: human, catchy, short and clear. The mechanics are `PRODUCT.md`'s: headlines under ten words, labels two or three, sentence case, no em or en dashes, no emojis, the banned words and one word per object. On screen: say the unit once, never put a method note or a catalogue count on a page, and let a figure speak for itself.

## Components

One line each; the full spec of every part is in `@docs/design/components.md`. States for every part: loading (three painting blazes and still bands), empty (a dashed blaze and a way out), error (one calm fix), missing figure ("Not yet", outside every sum).

- **Buttons** (`button-primary`, `button-main`, `button-secondary`, `button-quiet`, `button-danger`): {typography.button}, at least 44 px; a place's or a sheet's one main action is `button-main`, full width at 48 px. The primary is solid terracotta, the secondary paper with a 1.5 px ink edge, quiet is terracotta words, danger solid ink with its word; disabled always reads unavailable.
- **Chips** (`chip`, `chip-selected`): {typography.label} pills, 36 px drawn inside a 44 px target, a 1.5 px {colors.edge} edge on paper; chosen fills solid terracotta with bold paper text, no tick. A chip that opens a choice (a setting, the style door) is an ordinary chip with its icon in the accent and a small chevron; it is never painted as chosen.
- **Segmented and tabs** (`segmented-selected`): the chosen segment solid terracotta; a 3 px terracotta bar under the chosen tab.
- **Header doors** (`header-door`): Friends, the account split pill and the signed-in initial, solid terracotta.
- **Field** (`field`): 16 px text, 1.5 px edge, the error under it; an unsure value gets an ink edge and a WarnLine.
- **WarnLine** (`warn-line`): an outline warning icon and ink words at 700, no box.
- **Sheets** (`sheet`, `sheet-close`): from the bottom on a phone, a popover or dialog from 769 px; a short grey grip bar on top, the title as the sheet's `h2`, a 44 px round close top right, `--elev-2` over the `--scrim`, the one main action (`button-main`) sticky at the foot.
- **Receipt** (`receipt-total`): the headline is the day figure in whole euros with its basis beside it ("€138 per day, per person"); every line and the Total are in cents ("€137.76"), so the two differ by rounding on purpose, and a "Rounding" line appears only when the printed lines do not add up to the Total. The Total line is {typography.lead} at 800 under a hairline; getting there sits after it, apart, because it is outside the day. The unit chip ("Per day, per person") is the setting that switches per person and whole group, not a second unit label.
- **Signature parts:** the blaze (chosen or here), the plate (`plate`, `plate-mark`, `score-plate`), the formation (`wagon-go`, `wagon-bed`, `wagon-food`): `@docs/design/components.md#signature-components`.
- **The kit** (Switch, ChoiceRows, DialogSheet, Card, Tile, CostRow, Money, CarouselArrows, StepRail, AiTag): `@docs/design/components.md#the-kit`. A missing variant is added to the kit, never styled locally.
- **Icons:** `src/components/HouseIcons.jsx`, a 24 px grid, 1.75 stroke, square caps, currentColor: `@docs/design/components.md#icons`.

## Do's and Don'ts

- **Do** make the figure the loudest thing in its row and say the unit once.
- **Do** keep the main button rare: one solid main action per screen.
- **Do** let ink carry warnings, delete and best value with a word, an icon or an outline.
- **Do** draw the relief only from real peaks, always with a printed height.
- **Don't** add a second accent, a tinted box, a gradient, glass or a glow.
- **Don't** put text on a photo or on the relief's contours; a control on a photo is a paper disc.
- **Don't** use the blaze as decoration or a plate as an ordinary card.
- **Don't** stagger rows, overshoot a figure or animate at first paint.
- **Don't** reach for the travel clichés: a dotted world map, a plane with a dashed trail, a globe, polaroids, handwritten "wanderlust", a compass rose, a sparkle for AI.

## Signature graphics

- **The blaze:** a white halo, a square terracotta stripe and a short ink heel. It means "chosen" or "here"; resting or dashed, "the path is waiting". Nothing else, and never the logo.
- **The signpost plate:** an ink plate with one pointed end that holds a place, a time on foot and euros as one unit.
- **The formation:** the price row, where getting there, the bed and the food couple like wagons before the day figure.
- **The relief:** the one background graphic, contours from a place's real peaks (`ReliefBand`), always printing a real height, never behind text, figures or controls, at most two per screen, not on Explore. Check with `node scripts/verify_relief.mjs`. Rules and the opening screen: `@docs/design/components.md#background-graphics-the-relief`.
- **Photography:** licensed, credited, corners {rounded.card}; the missing photo is a world tint with a resting blaze, never stock.

With the logo hidden, a screen is still this product.

## Map

MapLibre with the house basemap (`src/map/houseBasemap.js`; Explore's Protomaps style in `src/lib/map/cartaMapStyle.js`). Routes terracotta on a white halo, dotted for flights; pins are MapLibre layers; the chosen pin is the terracotta plate. The map page per angle: `@docs/design/components.md#map`.

## Shell, home and print

- **Shell:** the header lies on stone with one hairline; the Gate V mark and the name, then the solid terracotta doors. The current place has a terracotta bar (tablet, desktop) or a blaze over its icon (phone), gliding with {motion.settle}.
- **Home:** the one surface that persuades, so it may move on its own; its type and film tokens are in `01-tokens.css` under "The home page", its rules in `.claude/skills/carta-design/references/home.md`.
- **Print and share:** the same tokens; PDFs use the two faces as static TTFs (`src/assets/print-fonts/`); e-mails use the shared frame in `supabase/functions/_shared/mailFrame.mjs`.

## Working on the style

| To change | Edit | Then |
|---|---|---|
| A colour, radius, size or duration | `continent-app/src/styles/01-tokens.css` | `node scripts/ci/design-md-tokens.mjs`, mirror map colours in `src/map/tokenColors.js`, `node scripts/ci/token-contrast.mjs` |
| A spring | `continent-app/src/lib/motionTokens.js` | `node scripts/ci/spring-easings.mjs` |
| A kit control or house part | `src/components/ui/`, `src/styles/03-button.css`, `04-ui.css`, `05-house.css` | Its demo in `src/styleguide/StyleGuide.jsx` and its section in `docs/design/components.md` |
| The shell | `src/components/AppHeader.jsx`, `BottomNav.jsx`, `src/styles/10-shell.css` | Check 390, 820, 1180, 1440 |
| An icon | `src/components/HouseIcons.jsx` | The grid rules above |
| The typefaces | `src/assets/fonts/`, `src/styles/00-fonts.css` | The preload in `index.html`, `tests/pwa.test.mjs`, `docs/tos/fonts.md` |

**Before you ship:** one job and one main action, obvious in five seconds at 390 and 1440; every function still there; tokens and kit only (`design-lint` 0 new, `token-contrast` 0 under, `design-md-tokens --check` clean, Google's `npx -p @google/design.md designmd lint DESIGN.md` 0 errors, axe serious and critical 0); phone, tablet and desktop each deliberate; reduced motion shows the end state; every euro through `formatMoney()`; six languages fit (German for length); a relief only from real peaks.
