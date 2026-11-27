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

The look. Read `BRAND.md` and `PRODUCT.md` first. Tokens live in `continent-app/src/styles/01-tokens.css`; this file records them, and a token change updates it in the same commit. Why: `docs/decisions/0012-house-style.md`. Craft: `docs/design/craft-guide.md`. Every part, live: `/?styleguide`. The file says "the app".

## Fixed rules and free choices

This file enforces few rules and describes the rest as the current default. The look must stay quick to change, so values sit in tokens and parts in the kit: one edit restyles every screen.

**Fixed.** These hold whatever the look:
1. **Accessible:** 44 px targets (`--tap`), WCAG AA contrast (4.5 text, 3 marks, `scripts/ci/token-contrast.mjs`), a visible focus ring, full keyboard use, 12 px text floor, colour never alone, reduced motion shows the end state.
2. **Honest numbers:** every figure from the price engine through `formatMoney()`, "Not yet" for a missing one, the engine's own total, no price moving unless the traveller changed it (`PRODUCT.md`).
3. **Copy mechanics:** `PRODUCT.md` "Voice" and the vocabulary; tone from `BRAND.md`.
4. **Every function stays:** restyle, never remove.
5. **Tokens and kit only:** no hex outside `01-tokens.css` (the map mirror and flags excepted), no literal sizes, durations or easings, no local restyle of a kit class (`scripts/ci/design-lint.mjs`). This is what keeps the look changeable.
6. **One main action per screen.**
7. **Three angles:** phone, tablet and desktop each deliberate, no horizontal scroll from 360 px.
8. **Photos:** licensed only, credited; no text on a photo outside `.hs-photo-scrim`.
9. **Logo:** Gate V only (`BRAND.md`); the blaze is never the logo.
10. **Light only**, until a theme is decided as its own feature.
11. **Umber stays** the paint for links and chosen states (owner rule); terracotta is the one main action (`BRAND.md` "Colour").

**Free to change** (edit the token or the kit part, its demo and this file, then run the checks):
- Every colour value, as long as contrast passes and umber stays the paint: the shades, the kinds, the beige, the ground.
- Radii, strokes, shadows, spacing, page widths and the type scale.
- The two faces, if licensed and the glyph list still renders.
- Durations, springs and which moments animate.
- The anatomy of every component below: sizes, layouts, order, the signature parts themselves (blaze, plate, relief, formation). They are today's identity; keep the job each does, change how it looks.
- The section specs below are a record of what is built, not a law: a new design updates them.

**How to change the look:**
- **A brand change:** edit the brand roles in `01-tokens.css` (plan step C adds them, OKLCH with hex fallback); components read roles, never raw colours.
- **A part:** change it in `src/components/ui/` and its demo in `/?styleguide`; every screen follows.
- **A one-off need:** add a variant to the kit, never a local style.
- Then: `node scripts/ci/token-contrast.mjs`, `node scripts/ci/design-lint.mjs`, the three angles.

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
| `--umber-600` = `--action`, `--select-border`, `--map-route`, `--wagon-bed` | `#8c5a2b` | The primary action, the selected edge, the blaze stripe, the route, the chosen pin, the bed wagon, the chosen segment | 5.06 on stone, 5.81 on paper; white on it 5.81 |
| `--umber-700` = `--action-hover`, `--focus`, `--rate` | `#744820` | Brown text (quiet buttons, See all), action hover, the focus ring | 6.80 on stone |
| `--umber-800` = `--action-press`, `--select-ink`, `--wagon-food-ink` | `#5a3716` | Pressed action, text on beige | 8.68 on umber 100 |
| `--umber-500` = `--wagon-food-edge` | `#a8733f` | A mark only (the food wagon's edge) | |
| `--umber-300` | `#d4b48f` | Decorative only | |
| `--umber-200` = `--on-plate-2` | `#e7d3bc` | Beige 2: the second line on a plate | 11.4 on the plate |
| `--umber-100` = `--select-bg`, `--action-tint`, `--wagon-food` | `#f6e7d3` | Beige: the selected wash, the food wagon, tags | |
| `--umber-50` = `--select-row` | `#faf6f1` | A selected row in a list | |
| `--brand-mark` | `#b5532c` | The logo's terracotta arch; never text | 4.3 on stone (a mark) |

**Palette (`BRAND.md` "Colour"):** stone and ink are calm; terracotta pops.
- **Terracotta** is the one main action per screen: #a54a26 wherever it carries or sits under text (5.07 on stone, 5.82 on paper). The logo keeps #b5532c.
- **Umber** stays the paint for links, the selected thing, the blaze, the route and the chosen pin.
- Both are equally light, so never let them alone tell two states apart: add weight, an underline or an icon.
- The token lands in plan step C (`docs/research/2026-11-26-brand-system-toolkit.md` section 6); until then `--action` is umber. No other accent.

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

- `--danger` `#a12a1c` (6.43 on stone): destructive actions and errors, always with words.
- `--owe` `#b3402a` (4.9 on stone, 5.7 on paper): only the Trip kitty balance a person still pays, always with its sign.
- Best value is a beige mark (`--best` umber 200, `--best-bg` umber 50, `--best-ink` umber 800) with its word ("Cheapest", "Best value"). No yellow.
- Retiring, no new readers: `--sun-*` (share images via `src/lib/share/draw.js`, the cost card `92-cost-card.css`, the taste chip, the search dock's Ask tile and beaches tab, one place template tag, the trip art), `--cost-*` (the trip summary bar's four groups, `TripSummary.css`), `--ai-violet` (the day planner's AI marks, `20-day-planner-flow.css`, `planners-held.css`).
- "Domain colours" in the token file are single-job (water quality, climate, crowds, cost groups).
- Legacy names (`--paper`, `--ink`, `--accent`, `--rule` and the rest) alias the roles; new rules read roles (the lint flags legacy names).

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

The current defaults (see "Fixed rules and free choices"). All in `src/components/ui/` (exported from `index.js`), styled in `src/styles/05-house.css` with the `hs-` prefix.

**Blaze** (`<Blaze size="sm|md|lg|xl" state="painted|rest|blank" kind=…/>`): 16 x 10, 24 x 14, 40 x 22, 72 x 40. Only for chosen or here: the current nav place, the chosen map pin, a sheet grip, the relief cut, the chosen row of a single-pick `ChoiceRows` and the chosen plan in the pass sheet (both painted in on the pick). As the waiting path: three painting blazes while loading, a dashed one in an empty state, a resting one on the missing-photo tile. Never on headings, bullets, plates, ordinary pins or panels.

**Plate** (`<Plate variant="place|leg|total|mark" …/>`):
- **Place:** ink plate, pointed end, the name in the plate face, a beige second line, the figure right in Overpass 800.
- **Leg:** paper in a 1.5 px edge. With `checked` it is a radio (umber edge, umber 50 fill); the caller wraps the group in `role="radiogroup"` and handles arrow keys, as `ChipGroup` does.
- **Total:** a label over a 40 to 54 px figure, the engine's own total. One per screen.
- **Mark:** the small umber plate for "you chose this" (a chosen row's price, the chosen pin).
- Price bands ("€100 to €149", count on the tip) are place plates, shown only when sorting by cheapest day. A plate is never an ordinary card.

**Score plate** (`<ScorePlate value={9.7} label="Score" />` or `rating={place.rating}`): ink, a white figure out of 10, right after the name. No stars, no coloured scores. An estimate is spoken "about 8.1", no score shows "Not yet", the accessible name carries the band word ("Score 9.7, Exceptional"). Explore's `PlaceScore` is this.

**PlateGroup** (`<PlateGroup label=…>`): one radio group of leg plates: one tab stop, arrows, Home and End, the touch tick on a pick.

**Formation** (`<Formation go={{mode, amount}} bed food day weighted? size="lg"? />`): the price row of every row and card.
- Getting there is an outlined umber pill with its mode icon: a return fare outside the day. Outlined means "outside the day figure" and nothing else.
- The bed is a solid umber wagon, food and drink a beige wagon, coupled with 2 px gaps, then the day figure, always the loudest.
- A part without a figure is a dashed "Not yet" wagon outside the sum; a place without a split shows the day figure alone.
- Wagons are content-sized in rows; `weighted` sizes them by euros on cards and the cost post. Heights 24 (rows, cards) and 36 (`size="lg"`).
- It formats, never sums. Props: `est` (true or per part, spoken as an estimate, draws nothing), `dayWrap`, `figure={false}` (no day slot), `around` (a getting around wagon, umber 200), `extras` (more wagons, flights on sunken paper) for a trip total.

**Rail and RailCard:** the section labelled by its heading; arrows "Scroll back" and "Scroll forward", disabled at the ends; ArrowLeft and ArrowRight move focus card to card; "See all" a real button (a link only with an href).
- **Head:** a 28 px line, the title left, "See all" in umber 700 with a 24 px beige arrow disc (painted on hover, the arrow nudges 2 px; 44 px target; named "See all: {rail}"), two round outlined arrows right from 1024 px (touch scrolls).
- **Card:** a 4:3 photo at 16 px corners, the name with its Score plate, flag and country (the Hidden gem diamond in umber 700), the weighted formation, a paper save disc on the photo. 76 % wide to 599 px, about two across from 600, four and a quarter from 1024 (`max(256px, ...)`).
- **Explore's card** (`ExploreRails.jsx`, `styles/85-explore-rails.css`): a column with the name and Score plate (wraps, never cut), flag and country under it, room for the strip's longest name (`--xrc-name-lines`, `.xrc-top`), then at the foot the figure (`--text-title`, 800) with its basis under it (caption, dotted `--umber-300` underline). A travel style's match mark sits at the foot's end in the same grid cell (`.xrc-body`), adding no height. Cards stretch, so a strip's figures share one line. No sign after the figure. The photo is the link. Each strip ends on a photo-sized See all tile: beige, three round photo faces of the next places, "See all", the rail's name and the umber 44 px arrow disc.
- **Rhythm:** title to strip 12 px (16 from 1024), rail to rail 40 px (56 from 1024).
- Only the photo, name and country sit in the link; the formation and the `body`, `foot` and `mark` slots render after it, so no button nests in a link. No `href` or `onOpen`: a static card.

**List row** (`browse/explore/PlaceRow.jsx`): one grid per container width.
- **Under 600 px:** three lines (name with Score and water mark; flag, region and country; the figure with its basis), a 44 px photo, about 7 rows above the bar at 390 x 844.
- **From 600:** one line with a 56 px photo, the figure in its own column, the reason under it; from 1024 the reason gets its own column.
- Nothing is cut in any language: name, region and country wrap, and on a phone the figure never shares their line.
- The water mark is the house `water` icon in `--umber-700` (16 px), its class in the accessible name; no teal pill.
- The figure sits over its basis, no wagons: one button (44 px) that opens the receipt sheet; the basis has a dotted `--umber-300` underline. The unit sits on the figure ("€149 /day", "/day for 2"; never "total").
- Selected: the umber 50 wash and the umber price mark, never a side stripe. The link and buttons are siblings in the `.xrow` grid. Save is the bookmark at the row's end.

**Dock** (`components/dock/Dock.jsx`, `dockStore.js`, `styles/89-dock.css`): a trigger that grows in place into a card; today only the corner style disc uses it, and a tap opens the Style Studio.
- **Corners:** the heart and, on a phone, Map (`MapCorner.jsx`) sit in two fixed 48 px slots 12 px above the bottom nav. Desktop: the heart alone, 24 px from the corner. From 769 to 1023 px the Explore list ends on an 80 px foot bar that holds the disc; from 1024 it floats and may cover a photo's corner, never a name, figure or control. Scrollers end with `--corner-room` (checked by `scripts/verify_band.mjs`).
- One store, so at most one card is open. Below 769 px the card is a modal (full width, `aria-modal`, inert app, scrim, focus kept, returned to the trigger); from 769 a non-modal popover (Escape, a press outside or focus leaving closes it). Escape in a drilled row steps back first.
- Rows full width, 52 px, hairlines between (`DockRowButton`, `DockRowField`).
- Motion, CSS only: the card scales from 0.92 at its corner on `--dur-2`, rows 24 ms apart, the chevron turns, the `tune` plane glides on `--dur-3`, knobs swap on `--dur-tick` / `--ease-tick`. Depth `--elev-1` and `--elev-2`.

**Receipt sheet** (`components/price/PriceSheet.jsx`, `styles/86-price-items.css`, prefix `rcp-`): opened from a figure. One sheet, no tabs:
- The place name (800) with flag and country; the total at display size with its basis; at most one insight line with an umber arrow; the settings chips (the style chip in the selected wash, 13 px chevrons).
- Three rows, Bed, Food and drink and the way there, each a 36 px icon tile (radius 8, 1.5 px edge, umber 800 ink): bed 16 % umber 600 with an umber 600 edge, food umber 100 with an umber 500 edge, way umber 50 with an umber 600 edge. A row opens in place to its lever (options with wash and tick).
- The total line, then one sticky primary, Plan this trip. Phone: the modal bottom sheet. From 769: a non-modal popover off the tapped figure.
- **Flights screen** (`components/price/FlightTab.jsx`, `styles/87-flights-screen.css`, prefix `fls-`), behind a back button, "Flights to {place}": the return a person at headline size; the two legs as plates in a radio group; day bars in `--sun-400` with a `--sun-800` cap (cheapest saffron, the shown day umber 600, a break mark over long gaps); the hours segment; the day's rows (an airline badge with the IATA code in the airline's colour under its logo, times, name, length, stops, fare, a saffron "Cheapest" tag), skeletons while loading; one primary, Book on Google Flights, with a 48 px info button; Change airport or dates as the quiet button (primary only when no airport has data).

**Style Studio** (`browse/styles/`, `styles/79-style-studio.css`): the one sheet for travel styles, full height on a phone, a 560 px dialog from 769.
- **Overview:** an explainer card on `--home-ground-deep` in `--home-ink-on-deep`, then style cards in a radiogroup (the one in use: a 2 px umber edge and "In use" with a tick disc; meta as icon and word items, no separators), a More menu per card, a dashed New tile.
- **Wizard:** one question a step. A ten-step bar in two labelled groups (done and current `--action`, the current ringed, to come `--umber-100`); titles as questions at `--text-plate` / 800, no sub-text; choice tiles with the selected look (umber edge, `--umber-50`, a tick disc top right); a sticky foot with Back and one primary.
- Steps slide in on `SPRING.surface` from the side they came from; a new card rises and its figure counts up once.

**Band and Settings** (`browse/band/`, `styles/80-band.css`; `browse/settings/`, `styles/81-settings.css`): the top of Explore.
- **Grid:** row 1, 48 px (phone 44): the field, Ask Viantra and on desktop Places Settings. Row 2: the settings line on the field's text edge, 32 px items 16 px apart. Row 3: the tabs, 48 px, the underline as wide as the word. Rows 16 px apart, ink to ink. On desktop the band is one height on every tab.
- **Search field:** radius 8 (never a pill), a 1.5 px umber 300 edge, text 16 px 600 inset 16; on desktop Filters inside after a hairline (icon, word, count disc); the umber search button closes the right end; a back arrow inside the left end in a searched list; no left magnifier.
- **Ask Viantra:** outlined in umber, lit while its panel is open.
- **Rail arrows:** 44 px rounds at the photos' middle over the first and last visible photo's outer edges, mouse and keyboard only, dimmed at the ends.
- **Settings line:** icon and word items, no separators: the heart (the style door, always `HeartIcon`, a saffron dot while a trip holds the style), a flag, a calendar, the way glyph, the euro. Desktop: one line under the field. Phone: a sideways chip row under the tabs (scroll snap, edge fade, full words, 44 px), pinned while the field and tabs fold away on scroll.
- **Settings sheet:** the Style Studio's shell, "Your settings", five rows (icon disc, label, value, chevron), one question a step with Back. The When step's range grid has one tab stop and a round umber range; month cards say the full month and "from" a figure only where one exists. Phone: a modal sheet at 88 %; tablet: a 560 px dialog; desktop: a panel docked right that pads the band and list (`html.has-settings-dock`, `--settings-dock-w`). Brown and saffron only.

**Receipt** (`CostRow`, `CostSum`, `.costrows.has-leaders`): a dotted leader to each figure on wide receipts; the engine's own total; a "Rounding" line where lines do not add up; "Not yet" parts outside the sum.

**Journey line** (`planner/trip/JourneyLine.jsx`): stops as umber pills as long as their nights, legs as a 2 px ink line (dashed for flights) with a mode icon, home ends as ink discs.

**My trips ink parts** (`auth/mytrips/atlas/Ink.jsx`, `styles/73-mytrips-ink.css`; the atlas in `72-atlas.css`, classes `atlas-*`; decision 0016): line and ink, no beige wash, no sunken fill.
- **`SectHead`:** a title at 19/800 ink, its count as a plain `--text-3` figure, one action at the end.
- **`Frame2`:** the two-way choice (Per day | Whole trip, By year | By grade, Per day | Per trip; Today | Trip kitty as tabs on Spending): a 1.5 px `--umber-800` frame at `--radius-sm`, the chosen cell `--action` with paper text at 800, the other transparent in `--text-2`, a 1 px `--umber-300` rule between, 44 px tall.
- **`MoveInk`:** a price move on its own line, a 14 px arrow and 12/700 words, lower in `--umber-700`, higher in `--text-2`; no pill, no tint.
- **`NoPrice`:** "No price yet" at 13/600 `--text-2` after an 11 px dashed `--edge` square; never wraps, outside every sum.
- **Chips** (inside `.mt-panel` only): unchosen a 1.5 px `--edge`; chosen a 2.5 px `--umber-800` edge, umber 800 words at 800 and the tick, no fill; a count as a plain `--text-3` figure ("All" has none); the row wraps.
- **Photo card** (Saved and Past trips): two across on a phone (gap 22 by 14), three from 820 and beside the map from 1100. A 4:3 photo at `--radius-card`, the menu a 32 px paper disc (44 px target) top right, in Choose the select disc top left (`aria-pressed`; chosen: a 3 px `--action` ring). The name at 16/800, two lines at most, with its flag; one line with the Score plate and today's figure at 18/800 and its unit at 12 (or `NoPrice`); a non-place kind says its word above it; `MoveInk` and the note (a pencil, `--text-2`, no box) under it.
- **Following tile:** a 1.5 px `--border` edge at `--radius-panel`, the chart an ink 1.5 px line with 4 px square weekly points and the latest a 6 px `--umber-800` square, no fill; the price at `--text-figure-lg`.
- **Lists:** each cover a 2 x 2 mosaic in a 1.5 px `--umber-800` frame with 1 px paper rules; the chosen list a 3 px `--action` ring and a tick; New list dashed.
- **Country head:** a picked country heads the list with its silhouette, name, count and Show all; places are not regrouped.
- **Past trips:** the same card, three across in the left 7/12 from 1024; the name, flags and "7 nights, Aug" (the year when ranked by grade). The grade: ten 9 x 14 px cells in a 1.5 px `--umber-800` frame, filled to n in `--action` (the best trip `--umber-800`), "9/10" printed; no grade: dashed cells and "Give a grade", which opens the ten taps under the card. Year heads: the year and its nights on a 1.5 px `--umber-800` rule.
- **Charts:** nights per year as solid bars in the year ramp on one `--edge` baseline, the figure above, the year under, a picked year ringed in `--umber-800`, others never dimmed; months as twelve slim bars, an empty month a 2 px tick, the busiest `--umber-800`, the rest `--action`; no helper line.
- **Extremes:** four ruled rows N, E, S, W, each a 22 px framed letter tile, the name at 16/800 and the degrees at 12 in `--text-3`; one column on a phone, two by two from 768. No compass rose.
- **Cost:** a solid `--action` bar on a 1 px `--border` baseline, the average a 2 px ink notch (its key "average" carries the notch), the figure right; a tight 36 px ledger. Milestones keep their stamps; locked is a dashed `--edge` ring.
- **Spending:** Today | Trip kitty in the frame; food against the plan as ten connected tiles in one `--umber-800` frame, each a tenth of the plan, filled in `--action` with a part fill on the last, "€38 of €50" above; keypad keys a 1.5 px `--border` edge; no row wash (the name underlines); a new row an 8 px `--action` square fading over `--dur-note`; a disabled Go a dashed frame; pills, chips and the currency button outlined.

**Friends parts** (`together/home/VriendenHome.jsx`, `together/home/timeline.js`, `together/circle/`, `styles/91-vrienden.css`; decision 0017): the My trips ink parts on stone; no white card stacks, no beige. Every control 44 px.
- **Timeline:** one spine, a 1.5 px `--umber-300` rule in a 44 px gutter. A date plate: the day in the plate face at 26/800 over the month at 12/700 `--text-2`; an undated moment an 11 px dot ringed 2 px `--umber-600` (filled for Now); band heads at 12/800 uppercase `--text-2`. From 1100 px a three-across grid with the plate above each card and a sticky month ruler (month at 14/700, a 5 px `--umber-600` dot per moment).
- **Moment card:** a 3:2 photo at `--radius-card`, no border or shadow (no place: `--surface-sunken` with a 40 px face); faces under it at 24 px overlapping 6 px, 3 then +n; the title 16/700, wrapping; one fact at 14 `--text-2` (`--umber-700` at 700 when it includes you); at most one primary plus Later. Row scale: a 96 x 64 photo at `--radius-control` on the left. The soonest overlap spans two columns at 2:1 from 1100.
- **Face strip:** 44 px faces with a 12/700 name; You ringed `--umber-800`, Asked an outlined disc, a circle a `--umber-800` rounded square.
- **Status line:** 48 px, 16/800, the count in the plate face at 24/800 `--umber-800`, a hairline under; the only sticky element on a phone.
- **Motion exception** (decision 0017): the timeline rises in once per page load (`--dur-4`, `--ease-out`) when Friends opens through the door; never on a deep link or under reduced motion.
- **Overlap lanes:** two 16 px bars (you `--umber-600`, the friend `--umber-800`) on a day scale, shared days framed 2.5 px `--sun-400`, the one saffron mark on the home.
- **Milestone rings:** 56 px, a 2 px `--border` ring filling in `--umber-600`; earned a solid `--umber-800` disc with a paper icon.
- **Step tiles:** three in one 1.5 px `--umber-800` frame at `--radius-panel` (one column from 1100), each result in the plate face at 20/800; chosen `--umber-600` with paper text.
- **Heat calendar:** day cells at `--radius-control`, figures in the plate face; levels: a `--border` hairline, a 1.5 px `--umber-300` outline, then `--umber-300`, `--umber-600`, `--umber-700`, `--umber-800` fills (paper figures on the dark three); the best window framed 3 px `--sun-400`.
- **Fare table:** a member row (face and a framed IATA tile), a column per top proposal with a 4:3 photo head, each cell the return with a 4 px `--umber-600` bar, `NoPrice` where none; the average under a 1.5 px `--umber-800` rule; Fairest framed 2.5 px `--umber-800` with a solid tag; it scrolls in its own region when it cannot fit.
- **Stamp:** the place at 38/800 and the dates at 20/800 in the plate face, in a 3 px `--umber-800` frame at `--radius-panel`, tilted 4 degrees (upright and small on the ring).
- **Your Europe extremes:** as in My trips.

**States** (`StateBlock`, `Skeleton`, `NotYet`, `WorldTile`): loading is three painting blazes, announced politely, plus still bands the size of what comes. Empty: a dashed blaze and a way out (`PRODUCT.md` "Voice"). Error: one calm fix, no apology. Missing figure: "Not yet", outside every sum.

**Figure** (`<Figure value precision mine delta />`): see "Numbers that move honestly".

## The kit

`src/components/ui/`. A screen that needs a missing variant files a foundation request; it never restyles a kit class locally.

- `Button`: primary umber, default paper with a 1.5 px ink edge, quiet umber text, danger; 44 px. Disabled always reads unavailable (sunken paper, its edge, muted text), never dim umber.
- `IconButton`: round 44 px; `surface` with an edge, `photo` a paper disc.
- `Chip`, `ChipGroup`: pills, 1.5 px edge, the selected wash with a springing tick.
- `Segmented`: a pill, the chosen segment painted, 44 px high.
- `Tabs`: a 3 px umber bar strokes in under the chosen tab.
- `Switch`: umber when on, the thumb springs.
- `Field`: 8 px radius, 1.5 px edge, 16 px text, the error under it.
- `ChoiceRows`: one ruled list on the ground; the chosen row takes the wash, an umber outline and the blaze; multi-pick keeps the ticked square.
- `DialogSheet`: a bottom sheet on a phone, a centred dialog from 700 px; plays its exit, then closes; no entrance under reduced motion.
- Also `Card`, `Tile`, `CostRow`, `Money` (every euro through `formatMoney()`), `CarouselArrows`, `StepRail`, `AiTag` (the boxed "AI" on Ask, `.ai-tag`, sized in em; never a sparkle).
- The facts board (`.pt-page .pt-facts`: a 1 px frame, two columns on a phone, three from 820) is one part for place, journey and outdoor pages.

## Icons

`src/components/HouseIcons.jsx` via `<Icon as={HouseIcon.signpost} />`: a 24 px grid, 1.75 stroke, square caps, mitred joins, currentColor, decorative (the control carries the name).

- **Places:** signpost (Explore), route (Plan), ticket (My trips, dashed perforation in butt caps).
- **Actions:** bookmark (save, fills when saved), pack (travel style), people (Friends and every friend surface), invite (a person and a plus, only on Invite), voteUp, voteDown, tune (a plane over two slider lines, never a gear), fader (Settings), euro (prices shown).
- **Explore tabs**, on one ground line: Places a small town, Trails a switchback to a waymark post, Beaches a half sun over a wave, Lakes a shore with a fir, Mountains two peaks with a snow line, Cycling wheels.
- **The rest:** ret (a return fare), borders (no globe), car, train, bus, ferry, flight, bed, food, walk, the kinds and the standard actions.
- Never: a sparkle for AI, a compass rose, a plane with a dashed trail, emoji. `SparkIcon` draws the boxed AI mark, only where the thing is AI. Old glyphs in `Icons.jsx` stay where used; new work uses the house set.

## Photography

Licensed photos only, each with author and licence (credits under the gallery and in "Sources and photo credits"), corners `--radius-card`. No text on a photo; a control on a photo is a paper disc. Missing photo: the world tile. The one exception, a photo header carrying its title, uses `.hs-photo-scrim`: `--photo-scrim` (ink `#1e2421` at 78 %) under the bottom 45 %, where white text measures 7.7:1 even on a white photo.

## Background graphics: the relief

The one background graphic.

1. **Only from real ground:** drawn from the peaks in the place's dossier (`nearby.mountains[]`: name, km, bearing, `elev_m`; `reliefPeaks()` in `src/lib/relief.js`). No peak, flat band. Prices are never drawn as terrain.
2. **Prints a real height:** at least one tag ("Grand Combin 4,309 m") on paper (15.8).
3. **Where:** the "Around" band on place and outdoor pages, the trip header, the home page's story band, print and share covers. Never on Explore, list headers, or behind figures, rows, fields, focus rings or map labels. At most two per screen.
4. **Clear zone:** text sits on the flat side, ending `--space-6` before the cut, a thin umber line (`--stroke-edge`) with a blaze on top.
5. **Contrast:** lit lines white 95 %, shade lines ink 20 %, on the band; `aria-hidden`.
6. **Light** from the north-west; east-west at true scale, north-south squeezed.
7. **Motion:** none, except one `--dur-4` fade when its data changes; instant under reduced motion.
8. **Forced colours:** dropped.
9. **Missing photo:** a world tint with a resting blaze (`WorldTile`), never stock.

Check: `node scripts/verify_relief.mjs --port <port> --pages "/?styleguide,<your page>"` fails on a relief without a height, text in the zone, or text under 4.5.

Use: `<ReliefBand mountains={dossier.nearby.mountains} seed={place.id} cut="55%">…flat-side text…</ReliefBand>`.

**The opening screen** breaks rules 3 to 5 and 7 on purpose. A deep umber ground (`--umber-800`, a soft `--umber-700` glow) with the relief of Chamonix's peaks (`gem:chamonix`) in its bottom 40 % and one tag, "Mont Blanc 4,806 m"; no cut, the zone fades in over its top third and the words centre above it. Lit lines `--umber-100` at 42 %, shade ink 38 %. It rises once (a 1.4 s clip from the bottom), the blaze paints itself (halo, stripe, heel), the name lifts letter by letter, then `.hs-wait` shows. When the app is ready the screen lifts away like a curtain with rounded bottom corners. Reduced motion: at rest, gone at once. Files: `continent-app/index.html`, `src/styles/06-boot-splash.css`, `src/lib/bootSplash.js`, `src/components/LoadingScreen.jsx`; HANDBOOK "Opening screen".

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

### Primitives

| Primitive | Response | Haptic |
|---|---|---|
| Press | shrink and shade on `--dur-press`, spring back on the tick | none |
| Select | fill over `--dur-1`, the mark springs in | tick |
| Toggle | the thumb springs; pressed it stretches from its resting side | tick |
| Add / save | outline to filled on the pop; a toast with Undo | confirm |
| Remove | fade over `--dur-1`, neighbours settle; Undo toast 6 s or more | tick |
| Reveal | opacity and 4 px over `--dur-2`; popovers scale from 0.96 | none |
| Count | only the changed figure rolls (`Figure`); others dip once together | on the stepper, never the figure |
| Reflow | staying rows glide on settle, entering rows fade; up to 24 rows, no stagger | none |
| Sheet | rises on the sheet curve; drag 1 to 1, closes past 30 % or a fling | optional tick at the threshold |
| Route | the new view fades and rises 8 px; a drill-in shares the photo | none |
| Error | the field group shakes once, the message shows, focus moves | warn |

Without Motion, the classes in `05-house.css` do the same, added at the traveller's own act and flat under reduced motion: `.hs-pop`, `.hs-leave`, `.hs-reveal`, `.hs-sheet-in`, `.hs-sheet-out`, `.hs-dialog-in`, `.hs-route-in`, `.hs-shake`, `.hs-settle-in`, `.hs-couple-in`, `.hs-couple-out`, `.hs-paint`. `Button` takes `haptic="confirm"` for a commit. The style guide shows each live.

Signature moments: on Explore a chosen pin and its row paint and the price settles into an umber plate; on a place a chosen way there rolls the total; on a trip the hire car couples in and the total rolls with its delta note.

### Haptics

`src/lib/haptics.js`: `haptic('tick' | 'confirm' | 'warn')`, via Android `navigator.vibrate` (10 ms; 10, 60, 14; 20, 80, 20), the Capacitor Haptics plugin, or iOS Safari's switch tick. Only after a touch, at most one per 50 ms, only on a commit; never on pointerdown, navigation, opening a sheet, scroll, load or a timer. Chip, Segmented and Switch call it; screens never call `navigator.vibrate` (a test checks). The "Vibrate on tap" setting wins; by default it is on, except under reduced motion.

### Numbers that move honestly

A figure animates only within a second of the traveller's own change (`mine` windows of 1000 ms in `TripSummary.jsx` and `DestPriceCard.jsx`): only that figure, once, from the side it moved to, with a delta note. Refreshes, a co-planner's edit and first paint never move a figure. Many at once share one dip. Screen readers hear the new value once, politely. List order changes only from the traveller's own sort or filter.

### What never animates

A price the traveller did not change, list order while reading, anything at first paint (except the opening screen), the map camera on its own, the relief (beyond its fade), hover beyond a colour change, focus rings, loops other than a real loading indicator, blur, confetti, sparkles, sound.

## Home page

The one surface that persuades, so it may move on its own (the film, the drawn route, the tour's tabs). Its type (`--text-hero`, `--text-showcase`, `--tracking-hero`, `--leading-hero`), the film tint and bar and its timings are in `01-tokens.css` under "The home page"; rules in `references/home.md`. It still keeps one primary, 44 px targets and a reduced-motion branch.

## Shell

The header lies on stone with one hairline. The wordmark slot holds the Gate V mark (`BrandMark`, `src/components/BrandMarks.jsx`) and the name. The current place has the umber bar under it (tablet, desktop) or a blaze over its icon (phone bottom nav), both gliding on `useNavMarker` with the settle spring. On a phone the row fits at 360: the wordmark, then Together and account. The travel style is the corner disc, which opens the Style Studio. Navigation is a real link; Together and account are round doors.

## Map

MapLibre on the CARTO Voyager style, repainted by `src/map/houseBasemap.js` (land `--map-land`, water `--map-water`, borders `--map-border`). Routes umber on a white halo, dotted for flights. Ordinary pins: an ink head on a post with a paper price plate; clusters "+n"; the chosen pin the umber plate with the blaze, no overshoot. Labels are measured after the fonts load and never cover a post or another label. The pin drop plays only when the traveller opens the map. The coastline is the app's own (`public/europe_map.json`, Natural Earth).

The Explore map uses its own Protomaps basemap (`src/lib/map/cartaMapStyle.js`, `BASEMAP_COLOURS` in `src/map/tokenColors.js`), CARTO as fallback: land #f4efe6, sea and lakes #dfe6e6, borders #d9c6ae, roads from zoom 10 #e8dccb, parks #d6dccd, labels #465049 with a land halo, countries in spaced capitals, Noto Sans glyphs.

### Map page

- **Phone:** the map fills the page above the bottom nav. Floating on it: the search field with the umber search button and the Ask button (44 px, `--elev-2`), then chip rows: the style chip (umber 100) pinned left, then the settings; then Filters (umber edge, count disc 8 px from its word) and the quick chips (paper, the selected wash when on) in one sideways line with a 32 px end fade. Applied chips take their own line when they do not fit beside Filters; Clear all is bare words 8 px from its neighbours. Chip rows are transparent, keeping the chips' shadows whole. The header, category tabs, heart and zoom step aside (pinch). An ink "List of {n}" pill bottom centre opens the list sheet (peek with the count, Sort, List and the legend; half; full with a paper Map pill), which follows the finger and moves one stop per flick. A picked place is a 342 px tap card above the nav (a 120 px photo with Save, Close a 36 px sunken disc, the List pill 12 px above it, neighbours peeking); a swipe down, the map or Escape puts it away.
- **Tablet, 769 to 1023 px:** the phone model inside the frame: tap card and half sheet at most 560 px centred, the full sheet two columns. Tab gaps 16 px (12 px from 769 to 799) so six tabs fit; an overflowing row slides with the 32 px fade. Share sits in the search field. The settings line says the short words ("Create a style", "A day, each") and fades where it still overflows.
- **Desktop:** the band stays, List | Map on the tab row, Share (18 px glyph, 44 px target) 8 px before it from 1024. A column of compact cards on stone beside the map (380 px, 440 from 1440), headed by the count and the legend; a card under the pointer lifts its pin and the reverse. The anchored card from 1024: 320 px (288 below 1440), a 16:9 photo, `--elev-3`. Zoom 40 px bottom right with the credit under it; the heart 16 px in from the map's bottom left, never over the column and with no pin under it.
- **From 769 px:** with no filter on there is no applied row; a quick filter shows once, checked in the quick row; Clear all is quiet words (label size, 700, action umber) after the checked chips, on paper at the map's top edge (28 px, pill radius, no edge), always in view. The match explanation is a 360 px paper popover (hairline, `--radius-panel`, `--elev-3`), no backdrop.
- **Map rows** (`MapRow`): a 112 x 96 photo (128 x 96 in the desktop column), three lines that wrap, never cut, the short basis with the match mark level with the figure; rows one height.
- **Match mark:** a 24 px saffron pill (sun 100 ground, sun 400 edge, sun 800 text, the heart filled sun 400); its explanation stacks umber 600 to 200 bars, conflicts hatched saffron.
- **Icons beside words** sit on the capitals: the word's box is trimmed to cap height (`text-box: trim-both cap alphabetic` in `03-button.css`) in chips, kit buttons, the band's Settings, List | Map, Together, the tabs from 769 and the header nav from 1280.
- **Pins** are MapLibre layers, never DOM (`src/browse/explore/mapPins.js`). Photo pins: 44 px (56 named), radius 11 and 13, a 2.5 px paper ring, the Score as a 20 px ink plate top right, a 24 px paper label (name 700, figure 800), the picked one ringed and labelled umber; every pin on a 5 px point. Price pills: white with the ink figure (Overpass 800, the cards' `priceFigure` in the traveller's basis, whole euros); a saffron dot on the cheapest in view ("Best value in view"), never over a bubble or pill; the picked place an umber pill with its name. Count bubbles (umber 300 edge) to zoom 4.5, a tap zooms in; then 8 px umber dots with a white ring and a 44 px tap area. About one pill per 18,000 px of map (10 to 40), best-ranked first, collision on, none under the floating chrome. Settings and filters re-price in place; the camera moves only for a new search or a pick under the chrome.

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
