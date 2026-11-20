---
name: House style
description: The furniture of a European footpath, made for prices. A pale stone ground, green-black ink and umber brown as the paint of choice and action, with the blaze, the signpost plate, the relief drawn from real peaks and the price formation as its signature parts.
colors:
  neutral-0: "#ffffff"
  neutral-25: "#f7f8f5"
  neutral-50: "#eef0ea"
  neutral-100: "#e3e7df"
  neutral-150: "#dde2da"
  neutral-200: "#cfd5cc"
  neutral-300: "#b4bcb3"
  neutral-500: "#7a847d"
  neutral-600: "#59625c"
  neutral-700: "#465049"
  neutral-800: "#2c3530"
  neutral-900: "#1e2421"
  umber-50: "#faf6f1"
  umber-100: "#f6e7d3"
  umber-200: "#e7d3bc"
  umber-300: "#d4b48f"
  umber-500: "#a8733f"
  umber-600: "#8c5a2b"
  umber-700: "#744820"
  umber-800: "#5a3716"
  sun-100: "#fdf1d8"
  sun-400: "#f2b33d"
  sun-800: "#7a5000"
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
  action: "#8c5a2b"
  action-hover: "#744820"
  action-press: "#5a3716"
  action-text: "#ffffff"
  action-tint: "#f6e7d3"
  select-bg: "#f6e7d3"
  select-ink: "#5a3716"
  select-border: "#8c5a2b"
  select-row: "#faf6f1"
  focus: "#744820"
  focus-on-dark: "#ffffff"
  plate: "#1e2421"
  plate-hover: "#2c3530"
  on-plate: "#ffffff"
  on-plate-2: "#e7d3bc"
  wagon-go-edge: "#8c5a2b"
  wagon-go-ink: "#5a3716"
  wagon-bed: "#8c5a2b"
  wagon-bed-ink: "#ffffff"
  wagon-food: "#f6e7d3"
  wagon-food-edge: "#a8733f"
  wagon-food-ink: "#5a3716"
  wagon-none-edge: "#7a847d"
  kind-places: "#8c5a2b"
  kind-trails: "#2f7a45"
  kind-beaches: "#0e7c86"
  kind-lakes: "#2b5fa8"
  kind-mountains: "#6248a8"
  kind-cycling: "#b02a63"
  world-water: "#d3dfe2"
  world-lowland: "#dce5d4"
  world-rock: "#e3ddd3"
  map-land: "#f8f9f5"
  map-water: "#d3dfe2"
  map-border: "#d7dcd3"
  map-route: "#8c5a2b"
  best: "#e7d3bc"
  best-bg: "#faf6f1"
  danger: "#a12a1c"
  danger-dark: "#86200f"
  danger-bg: "#f6dcd8"
  green: "#3f6332"
  good-ink: "#16794f"
  amber-ink: "#a8400f"
  gem-ink: "#744820"
  rate: "#744820"
  status-success: "#10b981"
typography:
  display:
    fontFamily: "Overpass, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1.1
    fontFeature: "tnum, lnum"
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Overpass, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.2
    fontFeature: "tnum, lnum"
    letterSpacing: "-0.018em"
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
  sheet: "12px"
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
  gutter: "16px"
  tap: "44px"
  tap-main: "48px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-primary-press:
    backgroundColor: "{colors.action-press}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-quiet:
    textColor: "{colors.action-hover}"
    rounded: "{rounded.control}"
    height: "44px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.select-bg}"
    textColor: "{colors.select-ink}"
  segmented-selected:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.pill}"
    height: "44px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "44px"
  plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.on-plate}"
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
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
---

# Design system: the house style

Read `PRODUCT.md` first (who the app is for, the voice, the vocabulary, the number rules). This file is the look: everything a session needs to make on-style work for any screen without this run's context. The tokens in `continent-app/src/styles/01-tokens.css` are the source of truth; this file records them. A token change updates this file in the same commit. Decision record: `docs/decisions/0012-house-style.md`. General craft practice for any visual task: `docs/design/craft-guide.md`. The live index of every part: `/?styleguide`.

The file is name-free: it says "the app".

## The idea

**The furniture of a European footpath, made for prices.** A walker reads a waymark painted on a rock, a signpost with a place, a time on foot and a distance, and the shape of the ground around them. The app gives prices the same furniture:

- **The blaze**: a white halo with a square umber paint stripe and a short ink heel. It means "chosen" or "here", and, in its resting or dashed state, "the path is waiting" (the loading mark, the empty state, the missing photo). Nothing else.
- **The signpost plate**: a dark ink plate with one pointed end that holds a place, a time on foot and euros as one unit, read the same way everywhere.
- **The relief**: illuminated contours drawn only from a place's real peaks, always printing a real height. It is honest by construction: no peak in the data, no relief.
- **The formation**: the price row, where getting there, the bed and food couple like wagons in front of the day figure.

The ground is a pale lichen stone, the ink is green-black and never #000, and **umber brown is the paint you put on the path when you choose**: the action, the selected thing, the blaze, the route, the chosen pin. Beige (umber 100 and 200) is for tints, the food wagon and quiet surfaces. The one choice that only makes sense for this product: minutes on foot and euros are one unit on one object.

With the logo hidden, a screen is still this product: blaze, plate, relief and formation carry it.

## Where to adjust the style

| To change | Edit | Then |
|---|---|---|
| A colour, a radius, a size, a duration | `continent-app/src/styles/01-tokens.css` | Mirror map colours in `src/map/tokenColors.js` (the lint fails on drift); run `node scripts/ci/token-contrast.mjs`; update this file |
| A spring | `continent-app/src/lib/motionTokens.js` | `node scripts/ci/spring-easings.mjs` and paste its lines into the tokens |
| A kit control | `continent-app/src/components/ui/` and `src/styles/03-button.css`, `04-ui.css` | Its demo in `src/styleguide/StyleGuide.jsx` |
| A house part (blaze, plate, formation, rail, relief, states, figure) | `src/components/ui/` and `src/styles/05-house.css` | Its demo; `node scripts/verify_relief.mjs` for the relief |
| The shell (header, nav, page frame) | `src/components/AppHeader.jsx`, `BottomNav.jsx`, `src/styles/10-shell.css`, the house block at the end of `60-v6-shell.css` | Check 390, 820, 1180, 1440 |
| An icon | `src/components/HouseIcons.jsx` | Same grid rules (below) |
| The typefaces | `src/assets/fonts/`, `src/styles/00-fonts.css`, `--ui` and `--plate-face` | The preload in `index.html`, `tests/pwa.test.mjs`, `docs/tos/fonts.md` |

## Colour

All values in hex in one `:root` block (several readers parse hex only). Ratios are WCAG 2 on the ground each colour is read on; `scripts/ci/token-contrast.mjs` checks 45 text pairs (4.5 floor) and 22 marks (3 floor).

### Ground and ink

| Token | Hex | Job | Contrast |
|---|---|---|---|
| `--surface-page` (`--neutral-50`) | `#eef0ea` | Stone: the page ground behind everything | |
| `--surface-sunken` (`--neutral-100`) | `#e3e7df` | Band: quiet bands, sticky heads, input wells, the relief field | |
| `--surface` (`--neutral-0`) | `#ffffff` | Paper: sheets, cards, fields, the cost post, bars | |
| `--surface-hover` | `#e6e9e2` | Hover on a quiet surface | |
| `--text` (`--neutral-900`) | `#1e2421` | Ink: all main text | 13.76 on stone, 15.80 on paper |
| `--text-2` (`--neutral-700`) | `#465049` | Second text, every 12 px line | 7.30 on stone |
| `--text-3` (`--neutral-600`) | `#59625c` | Third text, 13 px and up only | 5.50 on stone, 5.04 on band |
| `--border` (`--neutral-200`) | `#cfd5cc` | Hairlines; never the only boundary of a control | |
| `--border-soft` (`--neutral-150`) | `#dde2da` | Soft hairlines inside a panel | |
| `--edge` (`--neutral-500`) | `#7a847d` | Control edges (chips, fields, switches, segments): a mark, never text | 3.37 on stone, 3.87 on paper |

### The paint: umber

| Token | Hex | Job | Contrast |
|---|---|---|---|
| `--umber-600` = `--action`, `--select-border`, `--map-route`, `--wagon-bed` | `#8c5a2b` | The paint: the one primary action, the selected edge, the blaze stripe, the route, the chosen pin, the bed wagon, the chosen segment | 5.06 on stone, 5.81 on paper; white on it 5.81 |
| `--umber-700` = `--action-hover`, `--focus`, `--rate` | `#744820` | Brown text (quiet buttons, See all), hover on the action, the focus ring | 6.80 on stone |
| `--umber-800` = `--action-press`, `--select-ink`, `--wagon-food-ink` | `#5a3716` | Pressed action, text on the beige | 8.68 on umber 100 |
| `--umber-500` = `--wagon-food-edge` | `#a8733f` | A mark only (the food wagon's edge) | |
| `--umber-300` | `#d4b48f` | Decorative only | |
| `--umber-200` = `--on-plate-2` | `#e7d3bc` | Beige 2: the second line on a dark plate | 11.4 on the plate |
| `--umber-100` = `--select-bg`, `--action-tint`, `--wagon-food` | `#f6e7d3` | Beige: the selected wash, the food wagon, tags | |
| `--umber-50` = `--select-row` | `#faf6f1` | A selected row in a list | |

The umber stays by owner rule (2026-11-13). Never invent a second accent: umber is the only paint.

### Plates and parts

| Token | Value | Job |
|---|---|---|
| `--plate` | `#1e2421` | The signpost plate and the Score plate |
| `--plate-hover` | `#2c3530` | A plate under the pointer |
| `--on-plate` | `#ffffff` | Text on a plate (15.80) |
| `--focus-on-dark` | `#ffffff` | The focus ring on a plate |
| `--wagon-go-edge`, `--wagon-go-ink` | umber 600, umber 800 | Getting there: an outlined pill (ink 10.54 on paper) |
| `--wagon-none-edge` | `#7a847d` | "Not yet": a dashed edge |
| `--world-water`, `--world-lowland`, `--world-rock` | `#d3dfe2`, `#dce5d4`, `#e3ddd3` | The missing-photo tile |
| `--relief-lit`, `--relief-shade`, `--relief-ground` | white 95 %, ink 20 %, band | The relief |
| `--map-land`, `--map-water`, `--map-border`, `--map-route` | `#f8f9f5`, `#d3dfe2`, `#d7dcd3`, umber 600 | The map (mirrored in `src/map/tokenColors.js`) |

### Kinds

Kinds of place have their own paint, for the kind's pictogram mark, swatch and tab underline only, **always with the pictogram and the word**, never body text, never colour alone: places umber 600, trails `#2f7a45`, beaches `#0e7c86`, lakes `#2b5fa8`, mountains `#6248a8`, cycling `#b02a63` (`--kind-*`; each 3:1 or more on the band).

### Status and the rest

`--danger` `#a12a1c` (6.43 on stone) for destructive actions and errors, always with words. Best value is a beige mark (`--best` umber 200, `--best-bg` umber 50, `--best-ink` umber 800) always with its word ("Cheapest", "Best value"); there is no yellow in the house style. The `--sun-*` primitives are read by the share images by name (`src/lib/share/draw.js`) and still by a few older screen rules (the cost card `92-cost-card.css`, the taste chip, the search dock's Ask tile and beaches tab, one place template tag, the trip art); new work must not read them. The cost-bar group colours (`--cost-*`) stay for the trip summary bar's four groups only (owner T845, `TripSummary.css`). `--ai-violet` is read only by the day planner's AI marks (`20-day-planner-flow.css`, `planners-held.css`). Each retires with its last reader. The domain colours under "Domain colours" in the token file are single-job (water quality, climate, crowds, cost-bar groups); do not use them as general colours. Legacy names (`--paper`, `--ink`, `--accent`, `--rule` and the rest) are aliases re-pointed at the roles; new rules read roles (the lint flags legacy names outside the token file).

### Colour rules

- Umber is the paint of choice and action. A screen has one primary action in solid umber.
- **Selected**, one rule per kind of choice: an item chosen among many (a chip, a row, a card, a leg plate, a day) takes the beige wash, umber 800 text, an umber edge and a mark (the tick, the blaze); the one option of a single control (a segmented control's segment, a tab) takes the paint (the umber thumb with paper text, the umber paint bar). The chosen map pin is the umber mark. Never a dark slab (no ink-filled pills for a selected tab), never colour alone.
- Text never sits on a photo and never on the relief's contours. Where a control must sit on a photo it is a paper disc.
- No gradients for decoration, no glassmorphism, no glow.
- **Style Studio** (owner 2026-11-18): the umber family only, for every selection and both wizard parts, plus one saffron mark (`--sun-*`: the "On Explore" tag on the main way there, and the "Changed for this trip" strip). No teal in the studio and no gradient. The draft's cost bar breaks the house cost colours on purpose, at the owner's request: bed is `--action`, food is light umber (`--umber-200` with a 1.5 px `--umber-500` inner edge for 3:1 on paper) instead of `--lagoon-600`, with a legend in words.
- Single light theme. `theme-color` is the stone ground.

## Type

**Overpass** (SIL OFL 1.1) sets every word and figure, variable 100 to 900, with `font-variant-numeric: tabular-nums lining-nums` set on `body`: every price, time and count lines up in columns (checked in the font file: all ten digits share one advance under `tnum`). **Sofia Sans Extra Condensed** (SIL OFL 1.1) sets plate names and the wordmark slot only, 19 px and up. Both are self-hosted woff2 (latin and latin-ext) from `src/assets/fonts/`, Overpass latin preloaded. Glyphs checked: Č, Š, ť, ü, ñ, œ, Ž, ł, ő, Ě, €.

| Token | Phone | Tablet 769 up | Desktop 1024 up | Weight | Use |
|---|---|---|---|---|---|
| `--text-display` | 40 | 48 | 54 | 800, -0.02em | A total figure |
| `--text-headline` | 24 | 30 | 36 | 800, -0.018em | A page title |
| `--text-title` | 19 | 21 | 22 | 800 | A section |
| `--text-plate` | 21 | 22 | 22 | 700, plate face | A plate name |
| `--text-figure` | 18 | 18 | 19 | 800 | A row's day figure |
| `--text-lead` | 16 / 1.5 | same | same | 400 | Reading text, fields (16 px so iOS never zooms) |
| `--text-body` | 14 / 1.35 | same | same | 400 to 700 | Interface text: rows, controls, lists |
| `--text-label` | 13 | same | same | 600 | Labels |
| `--text-micro`, `--text-caption` | 12 | same | same | 600 | The floor: nothing under 12 px |

Rules: sentence case, no uppercase transforms, no eyebrow kicker above headings. Headings balance (`text-wrap: balance`). Plate names wrap with `overflow-wrap: anywhere; hyphens: auto` and the document `lang`; a total's label never hyphenates. Row names and countries truncate with an ellipsis only as a last resort. The figure is always the loudest thing in its row or card.

## Space, grid and the three angles

Spacing on a 4 px grid: `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-5` 24, `--space-6` 32, `--space-7` 40, `--space-8` 56, `--space-9` 64. Page gutter `--page-gutter`: 16 on a phone, 24 from 769, 32 from 1024, 48 from 1440. Page caps: `--w-browse` 1440, `--w-detail` 1240, `--w-hub` 1120, `--w-form` 720, `--w-read` 720. Every grid track is `minmax(0, …)`. Targets: `--tap` 44 px floor, `--tap-main` 48 for a place's main action and the bottom nav.

Every screen is designed at three angles, each its own layout:

| Angle | Widths | Shell | Layout rules |
|---|---|---|---|
| Phone | to 768 (390 x 844 the reference, 360 the floor) | Slim header row (wordmark, Together, account; the travel style is the corner disc on Explore and My trips) and a bottom nav of three (Explore, Plan, My trips) | One column; lists dense (about 8 to 10 rows in the first view); the main action in a sticky bottom bar where a page has one |
| Tablet | 769 to 1279 (820 x 1180 portrait, 1180 x 820 landscape) | One header row; the three places stack icon over word | Two panes where the content allows (list and map side by side from 769; detail pages take a sticky side column from 1024); never a stretched phone, never a cramped desktop; toolbars wrap or move extras into a More menu, nothing is cut |
| Desktop | 1280 and up (1440 x 900 the reference, 1920 checked) | One header row; places with icon and word; the door with its label | Content caps above; the price and its action in the first view; filters as a rail beside lists |

Breakpoints come from the scale in `scripts/ci/css-breakpoints.mjs` (360, 380, 420, 430, 480, 600, 700, 768, 1024, 1100, 1200, 1240, 1280, 1440, 1600, 1800; max-width as boundary minus 1 for 600, 1024, 1280). A width sweep (360, 390, 600, 768, 820, 1024, 1180, 1280, 1440, 1920) must show no horizontal scroll and no overflowing element. Touch and pointer both work; hover is never the only way to anything.

## Shape and depth

One radius scale, rounder than a ruler:

| Token | Value | For |
|---|---|---|
| `--radius-sm` | 6 px | A plate's square end, a tag, the Score plate |
| `--radius-control` | 8 px | Buttons, fields, the search, menus, toasts |
| `--radius-panel` (`--radius-sheet`) | 12 px | Panels, sheets, booking cards, the map frame |
| `--radius-card` | 16 px | Photos and cards |
| `--radius-pill` | 999 px | Chips, wagons, segmented controls, round icon buttons |

The signpost plate keeps its pointed end (`--plate-tip` 14 px) with softly rounded other corners; the blaze keeps its square stripe. Strokes: `--stroke-hair` 1, `--stroke-edge` 1.5 (control edges), `--stroke-route` 3 (the route, the paint bar), `--stroke-focus` 3 (focus ring, 2 px offset).

**Depth, one rule:** only what floats over the page casts a shadow (`--elev-2`: sheets, menus, popovers, toasts, the action bar; `--elev-3` for a dialog). Cards and panels lie flat on a hairline (`--elev-1` is that hairline as a ring). No coloured top or side border on a panel (a side stripe is a template tell): mark a panel with a plate or a hairline.

**Ledger before panel:** a list (settings and account rows, answers to choose from, things to answer, plan lines on pricing, the pass lists, group and friend lists) is ruled straight onto the ground, not put in a white panel: a rule above and below (`--stroke-hair`, `--border`), hairlines between its lines (`--border-soft`), no fill, radius or shadow; its text lines up with the section head and two ledgers that touch share one rule. Hover lifts a row to `--surface`. A paper panel is kept for one object that must read as a thing: an identity card, a form, a chart's ground, a card in a grid of cards, a sheet or dialog. This keeps the screens off the stack-of-white-cards template.

## Background graphics: the relief

The one background graphic. Rulebook:

1. **Only from real ground.** A relief is drawn from the peaks with a height in the place's own dossier (`nearby.mountains[]`: name, km, bearing, `elev_m`; `src/lib/relief.js`, `reliefPeaks()`). No peak, no relief: the band stays flat. Prices are never drawn as terrain.
2. **Prints a real height.** Every relief shows at least one height tag ("Grand Combin 4,309 m") on a paper tag (contrast 15.8).
3. **Where:** the place and outdoor pages' "Around" band, the trip header (from the trip's places), the home page's story band, print and share covers. **Not** on Explore or in any list header (lists stay dense), not behind figures, rows, fields, focus rings or map labels. At most two per screen.
4. **Clear zone:** text sits only on the flat side, which ends a gutter (`--space-6`) before the cut. The zone starts at a thin umber cut (`--stroke-edge`) with a blaze on top; contours never run under text.
5. **Contrast budget:** lit lines white at 95 %, shade lines ink at 20 %, on the band; decorative only (`aria-hidden`).
6. **Light from the north-west**, east-west at true scale, north-south squeezed to the band.
7. **Motion:** never animated, except one fade (`--dur-4`) when the data behind it changes. Under reduced motion it appears at once.
8. **Forced colours:** dropped.
9. **The missing photo** is a world tint (`--world-water`, `--world-lowland`, `--world-rock`) with a resting blaze (`WorldTile`), never a stock picture.

Check: `node scripts/verify_relief.mjs --port <port> --pages "/?styleguide,<your page>"` fails on a relief without a printed height, text in the zone, or a tag or flat-side text under 4.5.

Use: `<ReliefBand mountains={dossier.nearby.mountains} seed={place.id} cut="55%">…flat-side text…</ReliefBand>`.

**The opening screen (G5, owner choice "deep umber", 2026-11-17)** is the one place the relief leaves rules 3 to 5 and 7, on purpose. It fills the bottom 40 % of a full deep umber ground (`--umber-800` with a soft `--umber-700` glow), drawn from Chamonix's own peaks (`gem:chamonix`, `nearby.mountains`) with one tag, "Mont Blanc 4,806 m". There is no cut: the zone fades in over its top third, and the words centre above it so no contour runs under them. Lit lines are `--umber-100` at 42 %, shade lines ink at 38 %, tuned for the dark ground. It rises in once (a clip from the bottom, 1.4 s) and never moves again. The blaze paints itself (halo, stripe left to right, then the heel), the name lifts in letter by letter, and the house loading mark (`.hs-wait`) shows once the opening has played. When the app is ready, the whole screen lifts away like a curtain with rounded bottom corners. Under reduced motion everything shows at rest and it goes at once. Files: `continent-app/index.html` (markup), `src/styles/06-boot-splash.css`, `src/lib/bootSplash.js`, `src/components/LoadingScreen.jsx`; HANDBOOK "Opening screen".

## Signature components

All in `src/components/ui/` (exported from `index.js`), styled in `src/styles/05-house.css` with the `hs-` prefix.

**Blaze** (`<Blaze size="sm|md|lg|xl" state="painted|rest|blank" kind=…/>`). 16 x 10, 24 x 14, 40 x 22, 72 x 40. Only where it means chosen or here: the wordmark slot, the current nav place, the chosen map pin, a sheet grip, the relief cut, the chosen row of a single-pick `ChoiceRows` list and the chosen plan in the pass sheet (both painted in on the pick); and as the waiting path: three painting blazes while loading, a dashed blaze in an empty state, a resting blaze on the missing-photo tile. This widens decision item 8 on purpose: those three states are the path not yet walked. Not on section headings, bullets, plates, ordinary pins or panels.

**Plate** (`<Plate variant="place|leg|total|mark" …/>`). A leg plate with `checked` is a radio: the caller wraps the group in `role="radiogroup"` with its label and handles the arrow keys (as `ChipGroup` does). Place: ink plate, pointed end, name in the plate face, a second line in beige, the figure right in Overpass 800. Leg: paper inside a 1.5 px edge; as a radio (`checked`) it takes the umber edge and the umber 50 fill. Total: label above a 40 to 54 px figure (the engine's own total). Mark: the small umber plate for "you chose this" (a chosen row's price, the chosen pin). Price bands ("€100 to €149", count on the tip) are place plates and appear only when the traveller sorts by cheapest day. Never use a plate as an ordinary card. One total plate per screen.

**Score plate** (`<ScorePlate value={9.7} label="Score" />` or `<ScorePlate rating={place.rating} />`). Ink, white figure out of 10, right after the place name. No stars, no coloured scores. With `rating`, an estimated Score is spoken "about 8.1", an unscored place shows "Not yet", and the accessible name carries the band word ("Score 9.7, Exceptional"); Explore's `PlaceScore` is this.

**PlateGroup** (`<PlateGroup label=…>` around leg plates). One radio group: one tab stop, arrow keys, Home and End, the touch tick on a pick.

**Formation** (`<Formation go={{mode, amount}} bed food day weighted? size="lg"? />`). The price row of every row and card: getting there as an outlined umber pill with its mode icon (a return fare, outside the day; the outlined pill means "outside the day figure" and nothing else, so a cost inside a total is never outlined), the bed as a solid umber wagon, food and drink as a beige wagon, coupled with 2 px gaps, then the day figure, always the loudest. A part without a figure is a dashed "Not yet" wagon outside the sum; a place without a split shows the day figure alone (decision 0012 says "one honest wagon"; a lone wagon would repeat the day figure, so the figure stands by itself). Wagons are content-sized in rows; `weighted` sizes them by their euros on cards and the cost post. Heights 24 (rows, cards), 36 (`size="lg"`, cost posts). The component formats, never sums. More props: `est` (true, or per part) is spoken as an estimate and draws nothing; `dayWrap` wraps the day figure (for example in the items list); `figure={false}` drops the day slot (the place cost post prints its day above; a trip total); `around` adds a getting around wagon (umber 200) and `extras` more wagons inside the train (flights on sunken paper), for a trip total.

**Rail and RailCard**. It keeps every behaviour of the old `StoryRail`: the section labelled by its heading, the arrows labelled "Scroll back" and "Scroll forward" and disabled at the ends, ArrowLeft and ArrowRight moving focus card to card, "See all" a real button (a link only when given an href). Head: a 28 px line, title left, "See all" in umber 700 with a 24 px beige disc holding the arrow (the disc takes the paint and the arrow nudges 2 px on hover; the 44 px target hangs above and below the line; named "See all: {rail}"), and two round outlined arrow buttons right (from 1024 px; touch scrolls). Cards: 4:3 photo at 16 px corners, the name with its Score plate, flag and country (and the Hidden gem diamond in umber 700), the weighted formation; a paper save disc over the photo. 76 % wide to 599 px, about two across from 600, four and a quarter from 1024 (`max(256px, ...)`: a minmax track never grows in an overflowing strip). Explore's own rail card (`ExploreRails.jsx`, `styles/85-explore-rails.css`) sets the name (room for two lines on every card, so a strip's cards share one height), the Score and the day figure on one line, the flag and country under it, then bed plus food and the return fare apart; the photo is its link, stretched over the card. Each Explore strip ends on a See all tile the size of a photo: beige, the next places as three round photo faces, "See all" and the rail's name, the umber 44 px arrow disc. Explore's rhythm: title to strip 12 px (16 from 1024), rail to rail 40 px (56 from 1024). Only the photo, the name line and the country sit in the card's link; the formation and the `body`, `foot` and `mark` slots render after it, so a button in them never nests in a link. Without `href` or `onOpen` the card is static (no link).

**List row** (Explore, `browse/explore/PlaceRow.jsx`). One grid per container width. Under 600 px: three lines (name, Score and the day; flag, region and country; the formation), a 44 px photo, about 8 rows above the bar at 390 x 844. From 600: one line with a 56 px photo, the formation in its own column and the reason under it; from 1024 the reason takes its own column. Selected: the umber 50 wash and the umber price mark, never a side stripe. The unit sits on the figure ("€149 /day", or "/day for 2" for the whole group; never "total"); the column head and the price notes left the Explore list and the map list (2026-11-18). Since 2026-11-20 (place prices) the row shows the figure over its basis, as on the card, with no wagons: one button (44 px hit area) that opens the receipt sheet; the basis's cue is a dotted `--umber-300` underline. The row's link and its buttons are siblings in the `.xrow` grid, so a button never nests in the link. The save control is the bookmark at the row's end.

**Dock** (`components/dock/Dock.jsx`, `dockStore.js`, `styles/89-dock.css`; 2026-11-18). One trigger that grows in place into a card, used by the corner style disc (the Trip dock that also used it left with G12, Explore top, 2026-11-18; Settings holds the trip) (bottom left on every width, owner 2026-11-18; since the Style Studio it grows no card: a tap opens the studio). Round 2 (2026-11-19): the heart and, on a phone, Map (`MapCorner.jsx`) sit in two fixed 48 px corner slots 12 px above the bottom nav (desktop: the heart alone, 24 px from the corner); nothing lifts, tucks or measures them, the slots follow the nav's height with a transition, and the scrollers end with `--corner-room` so the last row clears them (checked by `scripts/verify_band.mjs`). The disc, the changed dot kept. One store, so at most one card is open. Below 769 px the card is a real modal: full screen width, `aria-modal`, the rest of the app inert, a scrim, focus kept inside, and it hands focus back to its trigger. From 769 px it is a non-modal popover after its trigger: no trap; Escape, a press outside or focus leaving closes it. Escape inside a drilled row steps back one level first. Rows are full width, 52 px, hairlines between (`DockRowButton` resets the kit Button to a row; `DockRowField` for a control). Motion is CSS only on the tokens: the card scales up from 0.92 at its corner on `--dur-2`, rows arrive 24 ms apart, the chevron turns, the `tune` plane glides on `--dur-3` and its knobs swap on `--dur-tick` / `--ease-tick`; reduced motion shows the end state. Depth from `--elev-1` and `--elev-2`.

**Receipt sheet** (`components/price/PriceSheet.jsx`, `styles/86-price-items.css` prefix `rcp-`; 2026-11-20, replaces the tabbed price sheet). Opened from a card's or list row's figure. One sheet, no tabs: the place name (title, 800) and the flag and country; the total at display size, 800, tabular, with its basis beside it; at most one insight line with an umber arrow; the settings chips (pills, the style chip in the selected wash, each with a 13 px chevron); then three rows, Bed, Food and drink and the way there, each a 36 px icon tile (radius 8, 1.5 px edge, umber 800 ink) tinted from its cost colour: bed a 16% umber 600 mix with an umber 600 edge, food umber 100 with an umber 500 edge, way umber 50 with an umber 600 edge, so the three read as one set. A row opens in place to its lever (options with the selected wash and a tick). Total line, then one primary, Plan this trip, sticky at the foot. Phone: the shared bottom sheet, modal, full width. From 769 px: a non-modal popover hung off the tapped figure. **Flights screen** (`components/price/FlightTab.jsx`, `styles/87-flights-screen.css` prefix `fls-`), the receipt's second view behind a back button, titled "Flights to {place}": the return a person at headline size; the two legs as plates in a radio group (the shown one in the selected wash); day bars in `--sun-400` with a `--sun-800` cap, the cheapest saffron, the shown day umber 600, a break mark over long gaps, no rings; the hours segment; the day's rows (airline badge, a rounded square with the IATA code in the airline's colour and the logo over it, times, name, length and stops, fare, a "Cheapest" tag in saffron), skeleton rows while loading; one primary, Book on Google Flights, with a 48 px info button beside it; Change airport or dates as the quiet button (primary only when no airport has data).

**Style Studio** (`browse/styles/`, `styles/79-style-studio.css`; 2026-11-18). The one sheet for travel styles: full height on a phone, a 560 px dialog from 769 px. The overview opens on an explainer card on `--home-ground-deep` in `--home-ink-on-deep`, then the style cards (a radiogroup; the card in use has a 2 px umber edge and "In use" with a tick disc; the meta row is icon and word items with gaps, never separators), a More menu per card and a dashed New tile. The wizard is one question a step: a ten-step progress bar in two labelled groups (done and current `--action`, the current one ringed, to come `--umber-100`), titles as questions on `--text-plate` / 800 with no sub-text, choice tiles with the selected look (umber edge, `--umber-50` ground, tick disc inside the top right), a sticky foot with Back and one primary. Steps slide in on `SPRING.surface` from the side they came from; a new card rises in and its figure counts up once; reduced motion shows the end state.

**Band and Settings** (`browse/band/`, `styles/80-band.css`; `browse/settings/`, `styles/81-settings.css`; 2026-11-18). The top of Explore in the top bar. Round 2 grid (2026-11-19): row 1 at 48 px (phone 44), the field, Ask Carta and on a desktop's Places Settings; row 2 the settings line on the field's text edge, 32 px items 16 px apart; row 3 the tabs, 48 px, the underline as wide as the word; the rows one gap apart, 16 px ink to ink (owner O1). The desktop band is one height on every tab (the line is content-box, so an empty line keeps its room). Search field anatomy: radius 8 (`--radius-control`, never a pill), a 1.5 px umber-300 edge, words 16 px in at 16 px 600, on a desktop Filters inside after a hairline (icon, word, count disc), and the umber search button closing the right end on the field's own corner; a back arrow inside the left end in a searched list; no left magnifier. Ask Carta beside it is outlined in umber and lit while its panel is open. Rail arrows: 44 px rounds on the photos' vertical middle over the first and last visible photo's outer edges, mouse and keyboard only, dimmed at the ends. Row 2: the settings as icon and word items with no separators: the heart (the style door, always the legacy `HeartIcon`, the saffron dot while a trip holds the style), a flag, a calendar, the way glyph, the euro. On a desktop it is one line under the pill; on a phone a sideways chip row under the six tabs with scroll snap and a soft edge fade, full words, never an ellipsis, 44 px tall; it stays pinned while the pill and the tabs fold away on scroll. The Settings sheet is the Style Studio's shell: "Your settings", five rows (icon disc, small label, value, chevron), one question a step with Back; choice tiles with the selected look; the When step's range grid has one tab stop and a round umber range; month cards say the full month name and "from" a figure only where one exists. Phone: a modal sheet at 88 %; tablet: a 560 px dialog; desktop: a panel docked at the right that pads the band and the list (`html.has-settings-dock`, `--settings-dock-w`). Brown and saffron only, no teal.

**Receipt** (`CostRow`, `CostSum`, `.costrows.has-leaders`). The label reaches its figure along a dotted leader on wide receipts; the total is the engine's own total; a "Rounding" line where printed lines do not add up; parts without a price as "Not yet", outside the sum.

**Journey line** (trip page, `planner/trip/JourneyLine.jsx`): stops as umber pills as long as their nights, legs as a 2 px ink line (dashed for flights) with a mode icon, home ends as ink discs.

**States** (`StateBlock`, `Skeleton`, `NotYet`, `WorldTile`). Loading: three blazes painting, announced politely, plus still bands the size of what comes. Empty: a dashed blaze, the name of the space and the action ("No place fits", Clear all). Error: one sentence of what happened and what to do, an action, no apology. Missing figure: "Not yet", out of every sum.

**Figure** (`<Figure value precision mine delta />`). See "Numbers that move honestly".

## The kit

`src/components/ui/`: `Button` (primary umber, default paper with a 1.5 px ink edge, quiet umber text, danger; 44 px), `IconButton` (round 44 px; `surface` with an edge, `photo` a paper disc), `Chip` and `ChipGroup` (pills, 1.5 px edge, selected wash with a tick that springs in), `Segmented` (a pill; the chosen segment takes the paint; 44 px high on every pointer), `Tabs` (the umber 3 px paint bar strokes in under the chosen tab), `Switch` (umber when on, the thumb springs), `Field` (8 px, 1.5 px edge, 16 px text, the error under it), `Card`, `Tile`, `ChoiceRows` (one ruled list on the ground: a rule above and below, hairlines between rows; the chosen row takes the wash, an umber outline and the blaze; a multi-pick keeps the ticked square), `CostRow`, `Money` (every euro through `formatMoney()`), `DialogSheet` (a sheet from the bottom on a phone, a centred dialog from 700 px; it plays its exit, then closes; reduced motion: no entrance), `CarouselArrows`, `StepRail`, `AiTag`. A disabled primary or danger button reads as unavailable like every disabled button (sunken paper, its edge, muted text), never umber with dim ink. The Ask button carries a boxed "AI" tag (`AiTag`, `.ai-tag`, sized in em), never a sparkle. The facts board (`.pt-page .pt-facts`: a 1 px frame, two columns on a phone, three from 820) is one part for the place, journey and outdoor pages. A screen that needs a variant the kit lacks files a foundation request; it never restyles a kit class locally.

## Icons

`src/components/HouseIcons.jsx`, through the `Icon` wrapper (`<Icon as={HouseIcon.signpost} />`): a 24 px grid, 1.75 stroke, square caps, mitred joins, currentColor, decorative (the control carries the name). The set includes signpost (Explore), route (Plan), ticket (My trips: a ticket with a dashed perforation, the perforation in butt caps so the dashes stay open), bookmark (save a place, an outline that fills when saved), pack (travel style), rings and people (Together; the header pill wears people), tune (a plane over two slider lines, never a gear; it drew the retired Trip dock), fader (Settings: two waymark posts with open knobs), euro (Prices shown), the six Explore tab glyphs on one ground line (Places a small town, Trails a switchback to a waymark post, Beaches a half sun over one wave, Lakes a closed shore with a fir, Mountains two peaks with a snow line, Cycling wheels on the ground line; no decorative blaze), ret (a return fare, two opposed arrows), borders (countries, no globe), car, train, bus, ferry, flight, bed, food, walk, the kinds and the standard actions. No sparkle for AI, no compass rose, no plane with a dashed trail, no emoji. Older glyphs in `Icons.jsx` are still used in many files and stay; new work uses the house set. `SparkIcon` draws the boxed AI mark, so it stands only where the thing is AI (an Ask, an AI plan, an AI reading); a tip, a vibe or a recommended train takes its own glyph.

## Photography

Licensed photos only, each with author and licence (credits under the gallery and in "Sources and photo credits"). Corners `--radius-card`. Text never on a photo: titles and prices sit under it; a control on a photo is a paper disc. Missing photo: the world tile. The one exception, a photo header that must carry its title, uses `.hs-photo-scrim`: `--photo-scrim` (ink `#1e2421` at 78 %) under the bottom 45 % of the photo; white text inside that band measures 7.7:1 even over a pure white photo. Text outside the band never sits on the photo.

## Interaction

Character: **painted and placed**. Rules:

1. Respond in the next frame: the state first, motion second.
2. Motion says what changed and where it went; if it explains nothing, drop it.
3. **Overshoot only on the control the finger touched** (the tick spring, about 5 %; the Add icon may pop about 13 %). Figures, plates, the chosen pin, surfaces and pages settle without overshoot.
4. One signature moment per screen at most.
5. Interruptible: transitions and springs, not keyframes (except the refused-submit shake).
6. Never blocks input; a view transition lasts at most `--dur-3`.
7. Figures move only when the traveller has changed them a moment before.
8. Haptics only on a touch commit.
9. The more often, the smaller.
10. Reduced motion shows the end state at once (`02-base.css` zeroes every duration); haptics have their own setting.

### Tokens

| Token | Value | For |
|---|---|---|
| `--dur-press` | 80 ms (`--ease-out`) | The finger lands: `--press-scale` 0.97 (0.92 small icons, 0.985 cards and rows), `--press-shade` 0.78; `--lift-scale` 1.03 lifts a row picked up to reorder |
| `--dur-tick`, `--ease-tick` | 300 ms, spring 180 ms visual, bounce 0.3 | The release, a switch thumb, a check mark, a segment |
| `--dur-pop`, `--ease-pop` | 550 ms, spring 260 ms, bounce 0.45 | The Add icon only |
| `--dur-settle`, `--ease-settle` | 400 ms, spring 200 ms, no bounce | Figures rolling, plates arriving, the chosen pin, rows gliding, the nav marker |
| `--dur-paint` | 220 ms | A blaze stripe or the tab paint bar stroking in |
| `--dur-couple` | 420 ms | A wagon coupling into the formation (add a cost part) |
| `--dur-sheet`, `--ease-sheet` | 420 ms, `cubic-bezier(0.32, 0.72, 0, 1)` | A sheet rising |
| `--dur-1` to `--dur-4` | 120, 200, 320, 480 ms | Colour changes, routine changes, surfaces, one authored movement |
| `--dur-note` | 4000 ms | A delta note ("+€328") |

The linear() easings are generated from `src/lib/motionTokens.js` (`SPRING`: tick, pop, settle, surface, route, reveal, fling) by `scripts/ci/spring-easings.mjs`, so CSS and Motion move alike.

### Primitives

| Primitive | Response | Haptic |
|---|---|---|
| Press | shrink and shade on `--dur-press`, spring back on the tick (02-base.css) | none |
| Select | fill over `--dur-1`, the mark springs in (tick, paint bar, blaze stripe) | tick |
| Toggle | the switch thumb springs; pressed it stretches from its resting side | tick |
| Add / save | the icon swaps outline to filled on the pop; a toast with Undo | confirm |
| Remove | fade over `--dur-1`, neighbours settle; Undo toast 6 s or more | tick |
| Reveal | opacity and 4 px over `--dur-2`; popovers scale from 0.96 | none |
| Count | only the changed figure rolls (`Figure`), others dip once together | on the stepper, never on the figure |
| Reflow | staying rows glide on settle, entering fade; only up to 24 rows, no per-row stagger | none |
| Sheet | rises on the sheet curve; drag 1 to 1, closes past 30 % or a fling | optional tick at the close threshold |
| Route | tab change: the new view fades and rises 8 px; a drill-in shares the photo | none |
| Error | the field group shakes once, the message appears, focus moves | warn |

For screens without Motion the primitives exist as classes in `05-house.css`, each added at the moment of the traveller's own act and flat under reduced motion: `.hs-pop` (the Add icon), `.hs-leave` (a removed item, then remove it), `.hs-reveal` (a fold, an inline message, a popover), `.hs-sheet-in` and `.hs-sheet-out`, `.hs-dialog-in`, `.hs-route-in` (a pushed view), `.hs-shake` (a refused submit), `.hs-settle-in` (a plate arriving), `.hs-couple-in` and `.hs-couple-out` (a wagon), `.hs-paint` (a blaze stripe). `Button` takes `haptic="confirm"` for a commit (save, add, submit). The style guide shows each live.

Signature moments: Explore, a chosen pin and its row paint and the price settles into an umber plate; place, a getting-there option is chosen and the total rolls; trip, the hire car couples into the formation and the total rolls with its delta note.

### Haptics

`src/lib/haptics.js`: `haptic('tick' | 'confirm' | 'warn')`, Android `navigator.vibrate` (10 ms; 10, 60, 14; 20, 80, 20), a Capacitor build's Haptics plugin, iOS Safari's switch tick where it still plays. Only after a touch (never mouse, pen or keyboard), at most one per 50 ms, only on a commit: never on pointerdown, navigation, opening a sheet, scroll, load or a timer. The kit's Chip, Segmented and Switch call it; screens never call `navigator.vibrate` (a test checks). The traveller's "Vibrate on tap" switch (Settings, shown only where a route exists) wins; with no choice it is on, except under reduced motion.

### Numbers that move honestly

A figure animates only within a second of the traveller's own change (`mine` windows of 1000 ms in `TripSummary.jsx` and `DestPriceCard.jsx`), only the figure that change moved, once, from the side it moved to, with a delta note; a figure nobody touched never moves under the reader's eye (refreshes, a co-planner's edit, first paint). Many figures at once share one dip. Screen readers hear the new value once, politely. Prices swap in place; list order changes only from the traveller's own sort or filter.

### What never animates

A price the traveller did not change, list order while reading, anything at first paint (the opening screen is the one exception, see "Background graphics"), the map camera on its own, the relief (beyond its one fade), hover beyond a colour change, focus rings, loops other than a real loading indicator, blur, confetti, sparkles, sound.

## Home page

The one surface that persuades rather than operates, so it may move on its own (the film, the drawn route, the tour's tabs). Its larger type (`--text-hero`, `--text-showcase`, `--tracking-hero`, `--leading-hero`), the film tint and bar and the film and reveal timings are in `01-tokens.css` under "The home page"; the rules are in `references/home.md`. It still keeps one primary, 44 px targets and a reduced-motion branch.

## Shell

The header lies on the stone ground with one hairline. The wordmark slot is a blaze and the name in the plate face; it takes any name. The current place is marked by the umber paint bar under it (tablet and desktop) or a blaze over its icon (phone bottom nav); both glide on the nav marker (`useNavMarker`) with the settle spring. On a phone the row always fits at 360: the wordmark, then Together and account. The travel style left the header on 2026-11-18; it is the corner disc, which opens the Style Studio. Navigation is a real link; Together and account are round doors.

## Map

The app's own MapLibre maps on the CARTO Voyager style, repainted by `src/map/houseBasemap.js` (land `--map-land`, water `--map-water`, borders `--map-border`); routes in umber on a white halo (dotted for flights); pins: ordinary ones an ink head on a post with a paper price plate, clusters "+n"; the chosen pin the umber plate with the blaze, settling without overshoot; labels measured after the fonts load and never covering a post or another label. The pin drop plays only when the traveller opens the map. Never a drawn coast: the outline is the app's (`public/europe_map.json`, Natural Earth). The Explore map (G12, 2026-11-20) draws on its own Protomaps basemap instead (`src/lib/map/cartaMapStyle.js`, palette `BASEMAP_COLOURS` in `src/map/tokenColors.js`): land #f4efe6, sea and lakes #dfe6e6, borders #d9c6ae, roads (from zoom 10) #e8dccb, parks #d6dccd, labels ink-soft #465049 with a land halo, countries in spaced capitals, Noto Sans glyphs; CARTO only as its fallback.

## Print and share

Print and share follow the same tokens: the cover with the total plate, a relief where the trip's places have peaks, the journey line, the receipt with leaders and Rounding. PDFs use the screens' two faces as static TTFs (`src/assets/print-fonts/`, built by `scripts/print-fonts/build_print_fonts.py`); the social cards and share images load the screens' woff2. Rules per surface: `references/brand.md`; licences: `docs/tos/fonts.md`.

## Do and don't

Do:
- Use the roles and the kit; one primary umber action per screen.
- Make the figure the loudest thing in its row; say the unit once.
- Mark selected with the wash, umber text, an edge and a mark.
- Draw the relief only from real peaks, with a printed height.
- Check 390, 820, 1180 and 1440 and a width sweep before you ship.
- Keep every function: restyle, never remove.

Don't:
- No text on photos or contours; no side stripes or coloured top borders on panels.
- No blaze as decoration; no plate as an ordinary card.
- No overshoot on figures, plates, pins or surfaces; no stagger on rows; no animation at first paint.
- No new hex outside the token file (the map mirror and flags excepted); no literal durations or easings; no font other than the two faces.
- No made-up figure: a missing one is "Not yet".

## The AI-slop catalogue (never)

Purple-blue gradients, glassmorphism and blurred blobs, a centred hero with two buttons, three identical feature cards, bento grids for their own sake, gradient text, a sparkle icon for AI, an eyebrow kicker above every heading, card inside card inside card, one big radius everywhere, a cream ground with a serif display and terracotta accent, dark neon "tech" looks, stock 3D or people at laptops, emoji icons, fake logo strips, filler copy; and for travel: a dotted world map, a plane with a dashed trail, a globe icon, polaroid stacks, handwritten "wanderlust", passport stamps as wallpaper, a compass rose logo. The old look (warm grey ground, white rounded cards, a booking-site structure) is retired too.

## Before you ship (pre-ship checklist)

1. One job and one main action, obvious in 5 seconds at 390 and 1440?
2. Every function the screen had is still there and works the same?
3. No redundant text: no unit sentences or sublines the context gives?
4. Tokens and kit only; `node scripts/ci/design-lint.mjs` shows no new violation in touched files?
5. `node scripts/ci/token-contrast.mjs` 0 under the floor; axe serious and critical 0?
6. Phone, tablet and desktop each deliberate (390, 820, 1180, 1440 shots), and the width sweep clean?
7. Every selection, toggle, add, save, step and screen change answers from the interaction system; reduced motion shows the end state?
8. Every euro through `formatMoney()`; a missing figure "Not yet", out of every sum; the total the engine's own?
9. Six languages fit (German for length); no dashes, middots or banned words?
10. Relief, if any, from real peaks with a height (`verify_relief.mjs`)?

## History

- 2026-11-15: the house style (decision 0012): Waymark in Line's colours, rounder, replacing the Lagoon look (T421 to T1126; the previous text of this file is in git history).
- 2026-11-18: Explore polish (G12, D10): the Dock and the price sheet join the signature components, the list row carries its unit on the figure, and the glyphs tune, ret and bookmark join the set (save moves from the cairn to the bookmark). No token changed (run `.work/2026-11-17-explore-polish/`).
- 2026-11-18: Style Studio (G12): the studio joins the signature components with its colour rule (umber plus one saffron mark, no teal, the food bar in light umber); My trips takes the ticket glyph and the cairn leaves the set; the travel style leaves the header for good. No token changed (run `.work/2026-11-18-style-studio/`).
- 2026-11-18: Explore top (G12, D10): the band and the Settings sheet join the signature components; the fader, the euro and six tab glyphs join the icon set; the heart is always the style door; the cards' teal why chips are gone, so no teal is left on Explore (run `.work/2026-11-18-search-settings/`).
- 2026-11-20: Place prices (G12, D10): card option A (two lines, the figure and its basis as one button), the receipt sheet replaces the tabbed price sheet (one icon tile tinted per cost), and the flights screen with airline badges join the signature components. No token changed (run `.work/2026-11-19-place-prices/`).
