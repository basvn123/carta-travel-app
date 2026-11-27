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
  umber-50: "#fbf1ec"
  umber-100: "#f6e1d6"
  umber-200: "#ecc5b2"
  umber-300: "#d99f85"
  umber-500: "#c0643f"
  umber-600: "#a54a26"
  umber-700: "#8e3f20"
  umber-800: "#73321a"
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
  action: "#a54a26"
  action-hover: "#8e3f20"
  action-press: "#73321a"
  action-text: "#ffffff"
  action-tint: "#f6e1d6"
  select-bg: "#f6e1d6"
  select-ink: "#73321a"
  select-border: "#a54a26"
  select-row: "#fbf1ec"
  focus: "#8e3f20"
  focus-on-dark: "#ffffff"
  plate: "#1e2421"
  plate-hover: "#2c3530"
  on-plate: "#ffffff"
  on-plate-2: "#ecc5b2"
  wagon-go-edge: "#a54a26"
  wagon-go-ink: "#73321a"
  wagon-bed: "#a54a26"
  wagon-bed-ink: "#ffffff"
  wagon-food: "#f6e1d6"
  wagon-food-edge: "#c0643f"
  wagon-food-ink: "#73321a"
  wagon-none-edge: "#7a847d"
  kind-places: "#a54a26"
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
  map-route: "#a54a26"
  best: "#1e2421"
  best-bg: "transparent"
  danger: "#1e2421"
  danger-dark: "#86200f"
  danger-bg: "#f6dcd8"
  green: "#3f6332"
  good-ink: "#16794f"
  amber-ink: "#1e2421"
  gem-ink: "#8e3f20"
  rate: "#8e3f20"
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

The look. Read `BRAND.md` and `PRODUCT.md` first; part specs are in `docs/design/components.md`, read only for the part you build. Tokens live in `continent-app/src/styles/01-tokens.css`; this file records them, and a token change updates it in the same commit. Why: `docs/decisions/0012-house-style.md`. Craft: `docs/design/craft-guide.md`. Every part, live: `/?styleguide`. The file says "the app".

## Fixed rules and free choices

This file enforces few rules and describes the rest as the current default. The look must stay quick to change, so values sit in tokens and parts in the kit: one edit restyles every screen.

**Fixed.** These hold whatever the look:
1. **Accessible:** 44 px targets (`--tap`), WCAG AA contrast (4.5 text, 3 marks, `scripts/ci/token-contrast.mjs`), a visible focus ring, full keyboard use, 12 px text floor, colour never alone, reduced motion shows the end state, real links and buttons, one `h1` per view, modals that trap focus and close on Escape, every string through i18n.
2. **Honest numbers:** every figure from the price engine through `formatMoney()`, "Not yet" for a missing one, the engine's own total, no price moving unless the traveller changed it (`PRODUCT.md`).
3. **Copy mechanics:** `PRODUCT.md` "Voice" and the vocabulary; tone from `BRAND.md`.
4. **Every function stays:** restyle, never remove.
5. **Tokens and kit only:** no hex outside `01-tokens.css` (the map mirror and flags excepted), no literal sizes, durations or easings, no local restyle of a kit class (`scripts/ci/design-lint.mjs`). This is what keeps the look changeable.
6. **One main action per screen.**
7. **Three angles:** phone, tablet and desktop each deliberate, no horizontal scroll from 360 px.
8. **Photos:** licensed only, credited; no text on a photo outside `.hs-photo-scrim`.
9. **Logo:** Gate V only (`BRAND.md`); the blaze is never the logo.
10. **Light only**, until a theme is decided as its own feature.
11. **One accent:** terracotta is the only colour on a page, for the main action, links and every chosen thing; everything else is stone and ink (`BRAND.md` "Colour").

**Free to change** (edit the token or the kit part, its demo and this file, then run the checks):
- Every colour value, as long as contrast passes and the page keeps one accent: the shades, the kinds, the tints, the ground.
- Radii, strokes, shadows, spacing, page widths and the type scale.
- The two faces, if licensed and the glyph list still renders.
- Durations, springs and which moments animate.
- The anatomy of every component below: sizes, layouts, order, the signature parts themselves (blaze, plate, relief, formation). They are today's identity; keep the job each does, change how it looks.
- The specs in `docs/design/components.md` are a record of what is built, not a law: a new design updates them.

**How to change the look:** components read roles, never raw colours, so a brand change edits the brand roles in `01-tokens.css` (plan step C adds them, OKLCH with hex fallback); a part changes in the kit and every screen follows. The table below names each file. Then run `node scripts/ci/token-contrast.mjs`, `node scripts/ci/design-lint.mjs` and the three angles.

## The idea

**The furniture of a European footpath, made for prices.**

- **The blaze:** a white halo, a square umber stripe and a short ink heel. It means "chosen" or "here"; resting or dashed, "the path is waiting" (loading, empty, missing photo). Nothing else. A UI mark, never the logo.
- **The signpost plate:** a dark ink plate with one pointed end holding a place, a time on foot and euros as one unit.
- **The relief:** contours drawn only from a place's real peaks, always printing a real height. No peak, no relief.
- **The formation:** the price row, where getting there, the bed and the food couple like wagons before the day figure.

A pale stone ground, green-black ink (never #000), and **umber, the paint you put on the path when you choose**. Beige (umber 100 and 200) for tints and quiet surfaces. With the logo hidden, a screen is still this product.

## Where to adjust the style

| To change | Edit | Then |
|---|---|---|
| A colour, radius, size or duration | `continent-app/src/styles/01-tokens.css` | Mirror map colours in `src/map/tokenColors.js` (lint fails on drift); `node scripts/ci/token-contrast.mjs`; update this file |
| A spring | `continent-app/src/lib/motionTokens.js` | `node scripts/ci/spring-easings.mjs`, paste its lines into the tokens |
| A kit control | `src/components/ui/`, `src/styles/03-button.css`, `04-ui.css` | Its demo in `src/styleguide/StyleGuide.jsx` |
| A house part (blaze, plate, formation, rail, relief, states, figure) | `src/components/ui/`, `src/styles/05-house.css` | Its demo; `node scripts/verify_relief.mjs` for the relief |
| The shell | `src/components/AppHeader.jsx`, `BottomNav.jsx`, `src/styles/10-shell.css`, the house block at the end of `60-v6-shell.css` | Check 390, 820, 1180, 1440 |
| An icon | `src/components/HouseIcons.jsx` | The grid rules below |
| The typefaces | `src/assets/fonts/`, `src/styles/00-fonts.css`, `--ui`, `--plate-face` | The preload in `index.html`, `tests/pwa.test.mjs`, `docs/tos/fonts.md` |

## Colour

All values are hex in one `:root` block (several readers parse hex only). Ratios are WCAG 2 on the ground each colour sits on; `scripts/ci/token-contrast.mjs` checks 45 text pairs (4.5 floor) and 22 marks (3 floor).

### Ground and ink

| Token | Hex | Job | Contrast |
|---|---|---|---|
| `--surface-page` (`--neutral-50`) | `#eef0ea` | Stone: the page ground | |
| `--surface-sunken` (`--neutral-100`) | `#e3e7df` | Band: quiet bands, sticky heads, input wells, the relief field | |
| `--surface` (`--neutral-0`) | `#ffffff` | Paper: sheets, cards, fields, bars | |
| `--surface-hover` | `#e6e9e2` | Hover on a quiet surface | |
| `--text` (`--neutral-900`) | `#1e2421` | Ink: main text | 13.76 on stone, 15.80 on paper |
| `--text-2` (`--neutral-700`) | `#465049` | Second text, every 12 px line | 7.30 on stone |
| `--text-3` (`--neutral-600`) | `#59625c` | Third text, 13 px and up | 5.50 on stone, 5.04 on band |
| `--border` (`--neutral-200`) | `#cfd5cc` | Hairlines; never a control's only edge | |
| `--border-soft` (`--neutral-150`) | `#dde2da` | Soft hairlines inside a panel | |
| `--edge` (`--neutral-500`) | `#7a847d` | Control edges (chips, fields, switches, segments); never text | 3.37 on stone, 3.87 on paper |

### The paint: umber

| Token | Hex | Job | Contrast |
|---|---|---|---|
| `--umber-600` = `--action`, `--select-border`, `--map-route`, `--wagon-bed` | `#a54a26` | The primary action, the selected edge, the blaze stripe, the route, the chosen pin, the bed wagon, the chosen segment | 5.06 on stone, 5.81 on paper; white on it 5.81 |
| `--umber-700` = `--action-hover`, `--focus`, `--rate` | `#8e3f20` | Brown text (quiet buttons, See all), action hover, the focus ring | 6.80 on stone |
| `--umber-800` = `--action-press`, `--select-ink`, `--wagon-food-ink` | `#73321a` | Pressed action, text on the tint | 7.57 on umber 100 |
| `--umber-500` = `--wagon-food-edge` | `#c0643f` | A mark only (the food wagon's edge) | |
| `--umber-300` | `#d99f85` | Decorative only | |
| `--umber-200` = `--on-plate-2` | `#ecc5b2` | Tint 2: the second line on a plate | 9.93 on the plate |
| `--umber-100` = `--select-bg`, `--action-tint`, `--wagon-food` | `#f6e1d6` | Tint: the food wagon, tags | |
| `--umber-50` = `--select-row` | `#fbf1ec` | A selected row in a list | |
| `--brand-mark` | `#b5532c` | The logo's terracotta arch; never text | 4.3 on stone (a mark) |

**Palette (`BRAND.md` "Colour"):** stone and ink are calm; terracotta is the one accent.
- The `--umber-*` names hold the terracotta scale: every link, chosen state, route, pin, tab bar and main action is terracotta. The names stay because hundreds of rules read them.
- A chosen chip or segment fills solid terracotta with bold paper text; fill against outline tells it apart, never colour alone.
- Delete and errors, warnings, best value and money owed are ink, told apart by their word, icon, outline or sign (`--danger`, `--amber-ink`, `--best`, `--owe`); no tinted boxes.
- `--primary` (the main action) and `--brand-mark` (the logo, #b5532c) are the brand roles; a brand change edits the scale and these lines.

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

Each kind has its own paint, for its pictogram, swatch and tab underline only, **always with the pictogram and the word**: places umber 600, trails `#2f7a45`, beaches `#0e7c86`, lakes `#2b5fa8`, mountains `#6248a8`, cycling `#b02a63` (`--kind-*`, each 3:1 or more on the band).

### Status and the rest

`--danger`, `--owe`, `--amber-ink` and `--best` are ink: delete, errors, warnings, the Trip kitty balance and best value say what they are in words, an icon, an outline or a sign, never a second colour. Colours being retired, with their last readers: `docs/design/components.md`.

### Colour rules

- One primary action per screen, solid.
- **Selected:** an item among many (chip, row, card, leg plate, day) takes the beige wash, umber 800 text, an umber edge and a mark (tick or blaze). The one option of a single control (segment, tab) takes the paint (umber thumb with paper text, umber bar). The chosen map pin is the umber mark. Never a dark slab, never colour alone.
- **My trips** (decision 0016): the chosen chip is an umber 800 outline with a tick and no wash; two-way frames, the grade and value scales use `--radius-sm` (chips stay pills).
- No text on photos or relief contours; a control on a photo is a paper disc.
- No decorative gradients, glassmorphism or glow.
- **Style Studio:** umber only, plus one saffron mark (`--sun-*`: the "On Explore" tag and the "Changed for this trip" strip). Its cost bar paints bed `--action` and food `--umber-200` with a 1.5 px `--umber-500` inner edge, with a legend in words.
- Light only; `theme-color` is the stone ground.

## Type

**Overpass** (SIL OFL 1.1) sets every word and figure, variable 100 to 900, with `tabular-nums lining-nums` on `body` so every price, time and count lines up. **Sofia Sans Extra Condensed** (SIL OFL 1.1) sets plate names only, 19 px and up. The wordmark is Fraunces drawn as outlined paths (`BrandMarks.jsx`), so it loads no font. Fonts are self-hosted woff2 (latin, latin-ext) in `src/assets/fonts/`, Overpass latin preloaded. Checked glyphs: Č, Š, ť, ü, ñ, œ, Ž, ł, ő, Ě, €.

| Token | Phone | Tablet 769 up | Desktop 1024 up | Weight | Use |
|---|---|---|---|---|---|
| `--text-display` | 40 | 48 | 54 | 800, -0.02em | A total figure |
| `--text-headline` | 24 | 30 | 36 | 800, -0.018em | A page title |
| `--text-title` | 19 | 21 | 22 | 800 | A section |
| `--text-plate` | 21 | 22 | 22 | 700, plate face | A plate name |
| `--text-signpost` | 32 | 38 | 44 | 800, plate face, capitals | The one signpost title: Today's place on My trips |
| `--text-figure` | 18 | 18 | 19 | 800 | A row's day figure |
| `--text-figure-lg` | 28 | 28 | 28 | 800 | A followed price on its My trips tile |
| `--text-lead` | 16 / 1.5 | same | same | 400 | Reading text, fields (16 px so iOS never zooms) |
| `--text-body` | 14 / 1.35 | same | same | 400 to 700 | Rows, controls, lists |
| `--text-label` | 13 | same | same | 600 | Labels |
| `--text-micro`, `--text-caption` | 12 | same | same | 600 | The floor |

Sentence case, no uppercase transforms, no eyebrow kickers. Headings use `text-wrap: balance`. Plate names wrap with `overflow-wrap: anywhere; hyphens: auto` and the document `lang`; a total's label never hyphenates. Names truncate with an ellipsis only as a last resort. The figure is always the loudest thing in its row or card.

## Space, grid and the three angles

- **Space** on a 4 px grid: `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-5` 24, `--space-6` 32, `--space-7` 40, `--space-8` 56, `--space-9` 64.
- **Gutter** `--page-gutter`: 16 on a phone, 24 from 769, 32 from 1024, 48 from 1440.
- **Caps:** `--w-browse` 1440, `--w-detail` 1240, `--w-hub` 1120, `--w-form` 720, `--w-read` 720. Every grid track is `minmax(0, …)`.
- **Targets:** `--tap` 44 px floor; `--tap-main` 48 for a place's main action and the bottom nav.

| Angle | Widths | Shell | Layout |
|---|---|---|---|
| Phone | to 768 (390 x 844 reference, 360 floor) | Slim header (wordmark, Together, account; the travel style is the corner disc on Explore and My trips), bottom nav of three (Explore, Plan, My trips) | One column; dense lists (8 to 10 rows in the first view); the main action in a sticky bottom bar where a page has one |
| Tablet | 769 to 1279 (820 x 1180, 1180 x 820) | One header row; places stack icon over word | Two panes where content allows (list and map from 769; a sticky side column on detail pages from 1024); toolbars wrap or move extras to More, nothing is cut |
| Desktop | 1280 up (1440 x 900 reference, 1920 checked) | One header row; places with icon and word; the door with its label | Caps above; the price and its action in the first view; filters as a rail beside lists |

Breakpoints come from `scripts/ci/css-breakpoints.mjs` (360, 380, 420, 430, 480, 600, 700, 768, 1024, 1100, 1200, 1240, 1280, 1440, 1600, 1800; max-width is boundary minus 1 for 600, 1024, 1280). A sweep at 360, 390, 600, 768, 820, 1024, 1180, 1280, 1440 and 1920 shows no horizontal scroll and no overflow.

## Shape and depth

| Token | Value | For |
|---|---|---|
| `--radius-sm` | 6 px | A plate's square end, a tag, the Score plate |
| `--radius-control` | 8 px | Buttons, fields, search, menus, toasts |
| `--radius-panel` (`--radius-sheet`) | 12 px | Panels, sheets, booking cards, the map frame |
| `--radius-card` | 16 px | Photos and cards |
| `--radius-pill` | 999 px | Chips, wagons, segmented controls, round icon buttons |

The plate keeps its pointed end (`--plate-tip` 14 px); the blaze keeps its square stripe. Strokes: `--stroke-hair` 1, `--stroke-edge` 1.5 (control edges), `--stroke-route` 3 (route, paint bar), `--stroke-focus` 3 (focus ring, 2 px offset).

**Depth:** only what floats casts a shadow (`--elev-2`: sheets, menus, popovers, toasts, the action bar; `--elev-3`: a dialog). Cards and panels lie flat on a hairline (`--elev-1`). No coloured top or side border on a panel.

**Ledger before panel:** a list (settings rows, answers, plan lines, pass lists, group lists) is ruled onto the ground: a `--border` rule above and below, `--border-soft` between lines, no fill, radius or shadow, text aligned with the section head; touching ledgers share one rule. Hover lifts a row to `--surface`. A paper panel is only for one object that must read as a thing: an identity card, a form, a chart's ground, a card in a grid, a sheet or dialog.

## Signature components

The parts that make a screen this product, each in `src/components/ui/` with its demo at `/?styleguide`. Their full specs: `docs/design/components.md`.

- **Blaze:** chosen or here; three painting blazes while loading.
- **Plate:** the signpost plate for a place, a leg, a total or a chosen mark; the Score plate beside every name.
- **Formation:** the price row, getting there, the bed and the food coupled before the day figure.
- **Rail and RailCard, list row, receipt sheet, Style Studio, band, journey line, My trips and Friends parts, states.**

## The kit

`src/components/ui/`: Button, IconButton, Chip, Segmented, Tabs, Switch, Field, ChoiceRows, DialogSheet, Card, Tile, CostRow, Money, CarouselArrows, StepRail, AiTag. A missing variant is added to the kit, never styled locally. Specs: `docs/design/components.md`.

## Icons

`src/components/HouseIcons.jsx` via `<Icon as={HouseIcon.signpost} />`: a 24 px grid, 1.75 stroke, square caps, currentColor, decorative. No sparkle for AI (the boxed AI tag instead), no compass rose, no plane with a dashed trail, no emoji. The set: `docs/design/components.md`.

## Photography

Licensed photos only, each with author and licence (credits under the gallery and in "Sources and photo credits"), corners `--radius-card`. No text on a photo; a control on a photo is a paper disc. Missing photo: the world tile. The one exception, a photo header carrying its title, uses `.hs-photo-scrim`: `--photo-scrim` (ink `#1e2421` at 78 %) under the bottom 45 %, where white text measures 7.7:1 even on a white photo.

## Background graphics: the relief

The one background graphic: contours from a place's real peaks (`ReliefBand`, `src/lib/relief.js`), always printing a real height, never behind text, figures or controls, at most two per screen, not on Explore. No peak, no relief. Check with `node scripts/verify_relief.mjs`. Rules and the opening screen: `docs/design/components.md`.

## Interaction

Character: **painted and placed**.

1. Respond in the next frame: state first, motion second.
2. Motion says what changed and where it went, or it goes.
3. **Overshoot only on the control the finger touched** (the tick spring about 5 %, the Add icon about 13 %). Figures, plates, the chosen pin, surfaces and pages settle without overshoot.
4. At most one signature moment per screen.
5. Interruptible: transitions and springs, not keyframes (the refused-submit shake excepted).
6. Never blocks input; a view transition lasts at most `--dur-3`.
7. Figures move only right after the traveller changed them.
8. Haptics only on a touch commit.
9. The more often, the smaller.
10. Reduced motion shows the end state at once (`02-base.css` zeroes every duration); haptics have their own setting.

### Tokens

| Token | Value | For |
|---|---|---|
| `--dur-press` | 80 ms (`--ease-out`) | The finger lands: `--press-scale` 0.97 (0.92 small icons, 0.985 cards and rows), `--press-shade` 0.78; `--lift-scale` 1.03 lifts a row picked up to reorder |
| `--dur-tick`, `--ease-tick` | 300 ms, spring 180 ms visual, bounce 0.3 | Release, a switch thumb, a check mark, a segment |
| `--dur-pop`, `--ease-pop` | 550 ms, spring 260 ms, bounce 0.45 | The Add icon only |
| `--dur-settle`, `--ease-settle` | 400 ms, spring 200 ms, no bounce | Figures rolling, plates arriving, the chosen pin, rows gliding, the nav marker |
| `--dur-paint` | 220 ms | A blaze stripe or the tab bar stroking in |
| `--dur-save` | 240 ms | A save on Explore: the bookmark ticks (1, 1.14, 1) and sends one ring out |
| `--dur-couple` | 420 ms | A wagon coupling into the formation |
| `--dur-sheet`, `--ease-sheet` | 420 ms, `cubic-bezier(0.32, 0.72, 0, 1)` | A sheet rising |
| `--dur-1` to `--dur-4` | 120, 200, 320, 480 ms | Colour, routine changes, surfaces, one authored movement |
| `--dur-note` | 4000 ms | A delta note ("+€328") |
| `--dur-fill-step` | 240 ms | One year's step in Your Europe's fill (1200 ms in all at most) |
| `--dur-reveal` | 640 ms | A route on the My trips plate and the journey line drawing in |

The linear() easings come from `src/lib/motionTokens.js` (`SPRING`: tick, pop, settle, surface, route, reveal, fling) via `scripts/ci/spring-easings.mjs`, so CSS and Motion move alike.

Primitives, haptics and what never moves: `docs/design/components.md` "Motion patterns".

## Home page

The one surface that persuades, so it may move on its own (the film, the drawn route, the tour's tabs). Its type (`--text-hero`, `--text-showcase`, `--tracking-hero`, `--leading-hero`), the film tint and bar and its timings are in `01-tokens.css` under "The home page"; rules in `references/home.md`. It still keeps one primary, 44 px targets and a reduced-motion branch.

## Shell

The header lies on stone with one hairline. The wordmark slot holds the Gate V mark (`BrandMark`, `src/components/BrandMarks.jsx`) and the name. The current place has the umber bar under it (tablet, desktop) or a blaze over its icon (phone bottom nav), both gliding on `useNavMarker` with the settle spring. On a phone the row fits at 360: the wordmark, then Together and account. The travel style is the corner disc, which opens the Style Studio. Navigation is a real link; Together and account are round doors.

## Map

MapLibre with the house basemap (`src/map/houseBasemap.js`, Explore's Protomaps style in `src/lib/map/cartaMapStyle.js`); map colours mirrored in `src/map/tokenColors.js`. Routes umber, pins as MapLibre layers, the chosen pin the umber plate. The map page per angle and the pins: `docs/design/components.md` "Map".

## Print and share

The same tokens: a cover with the total plate, a relief where the trip has peaks, the journey line, the receipt with leaders and Rounding. PDFs use the two faces as static TTFs (`src/assets/print-fonts/`, built by `scripts/print-fonts/build_print_fonts.py`); social cards and share images load the woff2. Rules per surface: `references/brand.md`; licences: `docs/tos/fonts.md`.

## Do and don't

The fixed rules above are the hard limits. Current defaults worth keeping unless a design replaces them:
- Make the figure the loudest thing in its row; say the unit once.
- Mark selected with the wash, umber text, an edge and a mark.
- Draw the relief only from real peaks, with a printed height.
- Overshoot only on the touched control; no stagger on rows; no animation at first paint.
- No side stripes or coloured top borders on panels; no blaze as decoration; no plate as an ordinary card.

## The AI-slop catalogue (avoid)

Purple-blue gradients, glassmorphism, blurred blobs, a centred hero with two buttons, three identical feature cards, bento grids for their own sake, gradient text, a sparkle for AI, eyebrow kickers, cards in cards in cards, one big radius everywhere, a cream ground with a serif display and terracotta accent (the app keeps terracotta to the logo and the one main action, on stone, with a sans interface; the serif is the wordmark only), dark neon "tech", stock 3D or people at laptops, emoji icons, fake logo strips, filler copy. For travel: a dotted world map, a plane with a dashed trail, a globe icon, polaroid stacks, handwritten "wanderlust", passport stamps as wallpaper, a compass rose logo. Also the retired old look: a warm grey ground, white rounded cards, a booking-site structure.

## Before you ship

1. One job and one main action, obvious in 5 seconds at 390 and 1440?
2. Every function still there and working the same?
3. No redundant text?
4. Tokens and kit only; `node scripts/ci/design-lint.mjs` shows no new violation?
5. `node scripts/ci/token-contrast.mjs` 0 under the floor; axe serious and critical 0?
6. Phone, tablet and desktop each deliberate (390, 820, 1180, 1440), the width sweep clean?
7. Every selection, toggle, add, save, step and screen change answers; reduced motion shows the end state?
8. Every euro through `formatMoney()`; a missing figure "Not yet"; the total the engine's own?
9. Six languages fit (German for length); no dashes, middle dots or banned words?
10. Relief, if any, from real peaks with a height (`verify_relief.mjs`)?
