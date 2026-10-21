---
name: Carta
description: A calm travel app for budget Europe where photos sell the place and one honest price line sits under every photo, in two base colours, blue-grey ink and one warm brown.
colors:
  neutral-0: "#ffffff"
  neutral-25: "#fbfbfa"
  neutral-50: "#f6f5f2"
  neutral-100: "#efeeea"
  neutral-150: "#e9eae7"
  neutral-200: "#dcdfdd"
  neutral-300: "#c5cac8"
  neutral-600: "#5c6873"
  neutral-700: "#44515c"
  neutral-800: "#2e3a44"
  neutral-900: "#1f2a33"
  lagoon-50: "#eef7f7"
  lagoon-100: "#dff0f1"
  lagoon-200: "#bfe0e2"
  lagoon-300: "#8cc6ca"
  lagoon-600: "#0b7480"
  lagoon-700: "#0a6670"
  lagoon-800: "#08575f"
  lagoon-900: "#07454b"
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
  surface-page: "#f6f5f2"
  surface: "#ffffff"
  surface-sunken: "#efeeea"
  surface-hover: "#eeede9"
  text: "#1f2a33"
  text-2: "#44515c"
  text-3: "#5c6873"
  border: "#dcdfdd"
  border-soft: "#e9eae7"
  action: "#8c5a2b"
  action-hover: "#744820"
  action-press: "#5a3716"
  action-text: "#ffffff"
  action-tint: "#f6e7d3"
  select-bg: "#f6e7d3"
  select-ink: "#744820"
  select-border: "#8c5a2b"
  focus: "#8c5a2b"
  best: "#f2b33d"
  best-bg: "#fdefc0"
  best-ink: "#1f2a33"
  rate: "#744820"
  rate-soft: "#5c6873"
  rate-bg: "#efeeea"
  gem-ink: "#744820"
  gem-bg: "#efeeea"
  amber-ink: "#a8400f"
  green: "#4a6a3a"
  good-ink: "#16794f"
  trail-bg: "#e8f0e6"
  danger: "#b3372a"
  danger-dark: "#96291e"
  danger-bg: "#f6dcd8"
  status-success: "#10b981"
typography:
  display:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum"
  headline:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum"
  title:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: "tnum"
  lead:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: "tnum"
  body:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.35
    fontFeature: "tnum"
  caption:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
    fontFeature: "tnum"
  micro:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.35
    fontFeature: "tnum"
rounded:
  sm: "6px"
  control: "10px"
  card: "16px"
  sheet: "20px"
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
  gutter: "16px"
  tap: "44px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-primary-press:
    backgroundColor: "{colors.action-press}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-hover}"
  button-quiet:
    textColor: "{colors.action}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "44px"
  button-quiet-hover:
    backgroundColor: "{colors.action-tint}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.control}"
    height: "44px"
  button-danger-hover:
    backgroundColor: "{colors.danger-dark}"
  button-disabled:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text-3}"
  button-sm:
    padding: "0 12px"
    height: "32px"
  icon-button:
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    size: "44px"
  icon-button-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    size: "44px"
  icon-button-pressed:
    backgroundColor: "{colors.select-bg}"
    textColor: "{colors.select-ink}"
  chip-filter:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  chip-filter-selected:
    backgroundColor: "{colors.select-bg}"
    textColor: "{colors.select-ink}"
  chip-count:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text-2}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    height: "20px"
  chip-status-best:
    backgroundColor: "{colors.best}"
    textColor: "{colors.text}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    height: "24px"
  chip-status-gem:
    backgroundColor: "{colors.gem-bg}"
    textColor: "{colors.gem-ink}"
    rounded: "{rounded.sm}"
    height: "24px"
  chip-status-rate:
    backgroundColor: "{colors.rate-bg}"
    textColor: "{colors.rate}"
    rounded: "{rounded.sm}"
    height: "24px"
  segmented-track:
    backgroundColor: "{colors.surface-sunken}"
    rounded: "{rounded.control}"
    padding: "3px"
  segmented-item:
    textColor: "{colors.text-2}"
    typography: "{typography.label}"
    padding: "0 16px"
    height: "38px"
  segmented-item-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
  tab:
    textColor: "{colors.text-2}"
    typography: "{typography.body}"
    height: "44px"
  tab-selected:
    textColor: "{colors.text}"
  card-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "8px 12px 8px 8px"
  card-row-media:
    rounded: "{rounded.control}"
    size: "72px"
  card-tile:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  field-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.lead}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  field-input-disabled:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text-3}"
---

# Design System: Carta

This is the design system for Carta: the exact values the shipped app runs on, with the one job each value has. Read it after PRODUCT.md and before writing any CSS, JSX, HTML, email or image for Carta. Treat every value here as a rule, not a suggestion. If a design needs something this file does not define, that is a task to raise, not a value to invent.

The source of truth is the `:root` block of `continent-app/src/styles/01-tokens.css`. This file is a record of it, kept in step by hand; when the two disagree, that file is what ships and this file is wrong. The frontmatter above is the machine-readable copy of the same values. `src/styles.css` is only the entry point that imports the domain files in `src/styles/`, in a fixed order (T191). Never hardcode a hex, a font name or a pixel spacing in a component: reference the custom property.

## Overview

**Creative North Star: "Lagoon", in brown**

Carta is a travel app you want to open: photos sell the place, and one calm price line sits under every photo, marked as an estimate where it is one. The look is "Lagoon" (T419, owner decision 2026-10-13): the category standard of Airbnb, Polarsteps and Wanderlog, executed at their craft level rather than reinvented. White surfaces sit on a warm light grey; ink is a blue-grey that is never black; one warm brown (umber) carries every action and every selection, so the app has two base colours, the ink and the brown (owner decision 2026-10-13, T438, which replaced the lagoon teal); sun yellow marks best value and nothing else; one friendly typeface, Figtree, sets everything, figures included, with tabular numerals.

The density is a working app, not a brochure. A filtered or searched list on Explore and Destinations is compact rows, about ten to a phone screen, each a small rounded photo, a name, the Score and a price line such as "€49 a day". Sections (rails) and the home page use large photo tiles, where inspiration leads. Pages say less: no catalogue counts, no method or coverage sentences beside a figure (owner, 2026-10-13). Depth is quiet: objects at rest carry a hairline border, and only what floats (a sheet, a popover, a control over a photograph) takes a soft ink shadow.

The world refuses two things, both confirmed by the owner in the direction contract (`continent-app/.impeccable/surfaces/continent-app.md`): the brochure hero with text laid over a photograph, and the dark instrument look of black slabs and dark selected states.

**Key Characteristics:**
- Photography leads; text never sits on a photograph.
- Two base colours: blue-grey ink and one brown for everything that acts or is selected, as a light tint plus brown text, never a dark slab.
- A rating is the Score: a brown star and an ink figure, never a filled chip.
- Every colour outside the neutrals and the brown has exactly one job.
- One typeface, tabular figures everywhere, so prices line up and settle in place.
- Borders at rest, shadows only on what floats.
- Every control is 44 px on touch, with a 2 px brown focus ring.

T425 rewrote the carta-design skill for Lagoon (closes register row T419-c): this file holds the values, the skill holds the judgement on top of them. If the two ever disagree on a value, the stylesheet ships, this file records it, and the skill is the one to fix.

## Where to adjust the style

For the owner fine-tuning by hand. Change a value in one place and every screen that reads it follows.

**Which file holds what.** All paths are inside `continent-app/`.

| What you want to change | File | What is in it |
|---|---|---|
| A colour, a font size, a radius, a shadow, a spacing step, a motion speed | `src/styles/01-tokens.css` | The `:root` block, in three layers: primitives (raw scales such as `--umber-600`), roles (what a value is for, such as `--action`), and the scales (`--text-*`, `--radius-*`, `--elev-*`, `--space-*`, `--dur-*`). Change a role to repoint one job; change a primitive to shift every role that reads it. The legacy names at the bottom are aliases; do not edit them, edit the role they point to. |
| Page defaults: body text, focus ring, press feedback, reduced motion | `src/styles/02-base.css` | The reset, the body face and tabular figures, text selection colour, the touch press shade, the focus floor and the motion floor. |
| Buttons | `src/styles/03-button.css` | Every variant and size of the shared Button. |
| Icon buttons, chips, segmented controls, tabs, cards, fields, icons, prices | `src/styles/04-ui.css` | One block per component, in that order, with a reduced-motion block at the end. |
| The typeface | `index.html` and `public/fonts/` | The two Figtree `@font-face` rules (latin and latin-ext, variable 300 to 900) and the self-hosted `.woff2` files. Changing the face also means changing `--ui` in `01-tokens.css`. |
| A rule only the trip and day planners, or the admin page, render | `src/styles/planners/` and `src/styles/admin/` | The rules of a domain file that only that route renders (T474, CSS per route), so they load with the route's chunk and not before the first paint. Each part keeps its domain file's name; the rest of the domain stays in `src/styles/`. A rule lives in one of the two, so edit it where it is. `scripts/css-routes.mjs --check dist/assets` proves on a build that every rule here is still route-only and that nothing later in the cascade could override it. |
| One screen's own layout | `src/styles/10-*.css` to `src/styles/69-*.css` | Older per-screen files. They still carry px literals and legacy token names, and the migration (T426 onward) moves them onto roles and scales file by file. Adjust a screen here only until its file is migrated; never copy a value from these files into new work. |

**Preview live.** In `continent-app/`, run `npm run dev` and open `/?styleguide` on the dev server. The style guide (`src/styleguide/StyleGuide.jsx`) is built from the real kit and the real tokens, so a change in `01-tokens.css` shows there at once: every colour role with its contrast, the type ramp, spacing and corners, every component with when to use it and when not, and the price formats in all six languages through the language switch at the top. Then look at the real screens the change touches.

**Checks after a change.** Run these from `continent-app/`:

1. `node scripts/ci/token-contrast.mjs` checks every text and fill pair the product uses (31) against the 4.5:1 floor, the non-text marks (focus ring, selected edge, rating star, switch track) against 3:1, and the colour distance that keeps warning, best value and quiet tints apart from the brown (T438). It must report 0 under the floor.
2. `node scripts/ci/design-lint.mjs` flags hex colours outside `:root`, gradients, shadow and font literals, removed outlines, em dashes, middots, banned words, and the migration rules (legacy token names, px font sizes and radii, euro literals). It must report no new violations in the files you touched; the baseline is not a place to add them.
3. If you changed a colour that a map or a PDF draws, update the token mirror `src/map/tokenColors.js` to the same value under the same token name. MapLibre cannot read a CSS custom property, so this file is the one JavaScript copy, and the design lint's `token-mirror-drift` rule fails when it disagrees with `01-tokens.css`.
4. Update this file in the same commit (CLAUDE.md): the frontmatter value and any prose that names the token, plus the sync line under History.

## Colors

A warm light grey ground under white surfaces, and two base colours: blue-grey ink and one warm brown for action and selection, plus a few single-job accents.

Tokens come in three layers. **Primitives** (`--neutral-*`, `--umber-*`, `--sun-*`, and the retired `--lagoon-*`, values in the frontmatter) are the raw scales, and components never read them. **Roles** say what a value is for, and every new or touched rule reads a role. **Legacy names** are every name the stylesheet used before T421, each an alias of a role, so the whole app re-skinned from the token file alone. The app is single-theme: there are no `prefers-color-scheme` or `data-theme` blocks. Ratios are WCAG 2 contrast, and `scripts/ci/token-contrast.mjs` checks every pair the product uses (31 text pairs at 4.5:1, 7 marks at 3:1, 6 colour distances).

### Primary

- **Umber** (`--action`, resolves to `--umber-600` `#8c5a2b`): the one primary button of a view, links, the live route, focus rings (`--focus`). White on it 5.8:1; as text 5.8:1 on a card, 5.3:1 on the page. It replaced the lagoon teal on 2026-10-13 (T438, owner decision: two base colours).
- **Deep Umber** (`--action-hover`, `--action-press`, resolving to `--umber-700`, `--umber-800`): hover and press fills of `--action`, never a resting colour.
- **Umber Mist** (`--action-tint`, resolves to `--umber-100` `#f6e7d3`): a light brown ground behind brown text (4.8:1), such as the hover of a quiet button. It sits 9.9 delta E from the sunken grey, so a selected item never looks like a quiet band.
- **The selected state** (`--select-bg`, `--select-ink`, `--select-border`, resolving to `--umber-100`, `--umber-700`, `--umber-600`): tint, brown label (6.4:1), brown edge. The one way anything shows it is chosen.

### Secondary

- **Sun Yellow** (`--best`, `--best-bg`, `--best-ink`, resolving to `--sun-400`, `#fdefc0`, `--text`): best value only. A marker or fill with `--text` on it (7.9:1). Best value as text is ink beside the marker (T438: the old dark yellow text sat on top of the brown). Yellow itself is never text.

### Tertiary

These are measures and semantics, each with one job.

- **The rating star** (`--rate`, resolves to `--umber-700`): the star of the Score (T437), 7.8:1 on a card. A rating is never a filled chip, so the star cannot read as a button. `--rate-soft` (`--text-3`) and `--rate-bg` (`--surface-sunken`) became neutral in T438, so the old ochre tints (tips bands, festival tags, the travel-day number) no longer look selected.
- **The gem mark** (`--gem-ink`, `--gem-bg`, resolving to `--umber-700`, `--surface-sunken`): a small diamond and the words "Hidden gem", 6.7:1. Plum retired in T438.
- **Rust** (`--amber-ink` and its siblings, `#a8400f`): warning text, 6.2:1 on a card. Retuned from amber in T438 so a warning never reads as the brown.
- **Moss** (`--green`): good news in data, always with a word. Never chrome, never a button. The positive status chip is `--text` on `--surface-sunken` with a 6 px `--status-success` dot (owner, 2026-10-13: status, not green).
- **Brick** (`--danger`, `--danger-dark`, `--danger-bg`): destructive actions only. Red means one thing: this erases something.
- **Signal Green** (`--status-success`): indicator dots and ticks. Never text.

### Neutral

| Role | Resolves to | Only for |
|---|---|---|
| `--surface-page` | `--neutral-50` | The ground behind everything. Never a card fill |
| `--surface` | `--neutral-0` | Cards, sheets, bars. The only pure white |
| `--surface-sunken` | `--neutral-100` | Input fills, quiet bands, a segmented track. Never a selected state |
| `--surface-hover` | its own value | Hover on a quiet surface |
| `--text` | `--neutral-900` | Body text and headings, 13.4:1 on the page |
| `--text-2` | `--neutral-700` | Secondary text, 7.5:1. Never a heading |
| `--text-3` | `--neutral-600` | Metadata at 11 to 14 px, never body copy; 5.2:1 on the page, 4.9:1 on a sunken band |
| `--border` | `--neutral-200` | Card and input borders, dividers |
| `--border-soft` | `--neutral-150` | Hairlines inside an object |

`--neutral-300` is the hover edge of a bordered control and the scrollbar thumb.

### Legacy names (aliases, retiring)

`--paper` is `--surface-page`, `--paper-dim` is `--surface-sunken`, `--bg-card` is `--surface`, `--on-fill` is `--action-text`, `--ink` is `--text`, `--ink-soft` is `--text-2`, `--ink-mute` is `--text-3`, `--rule` is `--border`, `--rule-soft` is `--border-soft`, `--accent` is `--action`, `--accent-bg` is `--action-tint`, `--accent-hover` is `--action-hover`, `--accent-press` and `--accent-press-alt` are `--action-press`, `--accent-soft` is `--umber-300`, `--accent-wash`, `--accent-wash-alt` and `--wash` are `--umber-50`, `--paper-hover` is `--surface-hover`, `--paper-lift` is `--neutral-25`, `--shadow-1` and `--shadow-card` are `--elev-1`, `--shadow-2` is `--elev-2`, and `--display`, `--mono` and `--font` resolve to `--ui`.

`--ink-fill` is `--umber-800`: the deep brown fill under white labels (10.7:1) that older surfaces still use as their selected state. T422 built the kit on the `--select-*` tint; the migration moves the remaining surfaces onto the kit, and `--ink-fill` retires with them. New code never uses it. Data drawings (bars, strips, pins, month cells) and toasts keep `--ink`.

### Domain colours

Unchanged by T421, from T191. Single-purpose indicator and tint colours for one feature each (water quality, trails, crowding, AI stops, warnings). A component never takes one as a general-purpose colour.

**Good, nature and trail greens. Indicators and small text, never fills for actions**

| Token | Value | Only for |
|---|---|---|
| `--good-ink` | `#16794f` | text-safe green for open-now, verified and good-deal text |
| `--good-ink-soft` | `#2c7d54` | a step lighter than --good-ink, trip budget done state |
| `--good-ink-alt` | `#2e7d4f` | extras delta under budget |
| `--good-mid` | `#3a9d6b` | icons and borders for a great tier |
| `--good-vivid` | `#2e9e5b` | swim and way-in indicators, good water |
| `--leaf-ink` | `#2c6a1f` | add stamps and positive chips |
| `--trail-ink` | `#3d6b42` | trail and park text |
| `--trail-pin` | `#3d7a4e` | trail and nature map pins |
| `--trail-bg` | `#e8f0e6` | trail and park card fill |
| `--trail-rule` | `#d2e0cf` | trail and park card border |
| `--trail-bg-alt` | `#e8f3e6` | a second trail tint |
| `--trail-rule-alt` | `#c5dfbe` | a second trail border |
| `--event-ink` | `#1f6b41` | AI event tag and pin |
| `--event-bg` | `#e2f0e6` | AI event tag fill |
| `--climate-good` | `#6b9e3f` | climate band, good month |
| `--budget-low-bg` | `#e4edda` | budget band, low |
| `--budget-low-rule` | `#c3d2ba` | budget band, low border |
| `--water-good-bg` | `#ddeedd` | day extras water quality, good |
| `--water-good-ink` | `#2c6136` | day extras water quality, good text |

**Water and sky blues**

| Token | Value | Only for |
|---|---|---|
| `--water-clear` | `#1f8fb0` | excellent bathing water, clear sea blue |
| `--water-pin` | `#2a8fbd` | beach pins and chips |
| `--lake-ink` | `#2a6f9e` | lake pin name |
| `--water-link` | `#2b6f9e` | blue text inside water facts |
| `--swim-ink` | `#2c6376` | swim type text |
| `--swim-bg` | `#e2eef2` | swim type fill |
| `--swim-rule` | `#cbdfe6` | swim type border |
| `--rain-ink` | `#4a70a8` | rain figure in a weather day |
| `--climate-poor` | `#9bb0bd` | climate band, poor month |
| `--water-excellent-bg` | `#d8ecf5` | day extras water quality, excellent |
| `--water-excellent-ink` | `#11607f` | day extras water quality, excellent text |

**Cautions: amber, orange and red-brown. Warnings that are not destructive (`--danger` is the destructive one)**

| Token | Value | Only for |
|---|---|---|
| `--warn-ink` | `#b3402a` | over budget, no fare, cautions |
| `--warn-vivid` | `#cc4433` | poor water and swim-stop indicator |
| `--amber` | `#c68a12` | sufficient water, hazard rules, amber indicator |
| `--amber-ink` | `#a8400f` | warning note text (rust since T438) |
| `--amber-ink-alt` | `#a8400f` | warning text beside the rating family |
| `--amber-ink-deep` | `#9c3d12` | deepest warning text |
| `--amber-warm` | `#a8400f` | warm warning text (was 4.25:1, under the floor) |
| `--beach-ink` | `#c48a2a` | beach pin name |
| `--amber-bg` | `#fdf3e2` | warning note fill |
| `--amber-bg-alt` | `#fcf2dd` | a second warning tint |
| `--amber-rule` | `#efd9a3` | warning border |
| `--rate-rule` | `#e0cba4` | rating band border |
| `--crowd-hot` | `#d06a2a` | crowded indicator |
| `--orange` | `#d35a26` | orange fill |
| `--experience-ink` | `#9a3a2a` | experience type text |
| `--experience-rule` | `#eec7bb` | experience type border |
| `--danger-bg` | `#f6dcd8` | poor water fill; the danger status chip |

**Violet and slate. Single-use domain colours**

| Token | Value | Only for |
|---|---|---|
| `--ai-violet` | `#5b3fa8` | AI-planned stops |
| `--ai-violet-bg` | `#eee7fb` | AI chip fill |
| `--mountain-ink` | `#6b5b95` | mountains pin name |
| `--slate-ink` | `#55606f` | unknown or neutral swim and way label |
| `--slate-pin` | `#5b6472` | town pin |
| `--crowd-mid` | `#6b7280` | moderate crowd indicator |
| `--slate-mute` | `#6f7688` | map popup subtitle |
| `--mask-solid` | `#000` | the opaque stop of a mask-image gradient |

### Card taxonomy

Place kind is an ink-density ramp, not a rainbow: `--text` mixed over `--surface-page` at 100, 78, 62, 45 and 50 per cent, so the hierarchy reads as weight and survives greyscale and colour-blind viewing.

| Token | Value | Only for |
|---|---|---|
| `--kind-metro` | `#1f2a33` | Metro |
| `--kind-city` | `#4f575d` | City |
| `--kind-town` | `#71777c` | Town |
| `--kind-village` | `#959a9c` | Village |
| `--kind-area` | `#8b9093` | Area |
| `--verdict-3` | `var(--rate)` | Filled verdict ribbon |
| `--verdict-2` | `var(--rate)` | Outline verdict ribbon |
| `--verdict-1` | `var(--ink-mute)` | Text-only verdict |

### Named Rules

**The Two Colours Rule.** Ink carries the text and the drawings; brown means it acts, is live or is selected. Nothing decorative and no status is ever brown; the rating star and the gem diamond are the two small marks it lends out.

**The One Job Rule.** Sun yellow is best value, red destruction, rust a warning. A colour borrowed for a second job stops meaning the first.

**The No Slab Rule.** A selected state is the light brown tint with a brown label and a mark (a tick, an underline, a lifted thumb). Never a dark fill, so the app never reads as black.

## Typography

**Display Font:** Figtree (with system-ui, -apple-system, Segoe UI, sans-serif)
**Body Font:** Figtree, the same family
**Label/Mono Font:** none. Figures use Figtree with tabular numerals.

**Character:** One friendly, warm sans for everything, in the manner of the Airbnb reference; the most compact of the three faces tried (Figtree, Manrope, Onest) for the compact rows the owner chose, with real tabular figures.

Figtree is variable (weights 300 to 900), latin and latin-ext, self-hosted in `continent-app/public/fonts` and declared in `continent-app/index.html`; nothing loads from a Google host. `--ui` is the one face declaration; `--font` is the name new rules use, and `--display` and `--mono` alias it. Decision T421, replacing T198's Fraunces, Plus Jakarta Sans and JetBrains Mono.

`body` sets `font-variant-numeric: tabular-nums`, so every price, date, time and distance lines up in columns and settles in place. A separate monospaced face for figures is retired (owner decision 2026-10-13, PRODUCT.md "Numbers"). Measured facts are told apart by their position and their unit, not by a costume face.

### Hierarchy

Sizes are the `--text-*` tokens in the frontmatter; leading is `--leading-tight` (1.2) for headings, `--leading-ui` (1.35) for controls and `--leading-body` (1.5) for prose.

- **Display** (`--text-display`, 700): destination names on a hero.
- **Headline** (`--text-headline`, 700): page titles.
- **Title** (`--text-title`, 600): card and section titles.
- **Lead** (`--text-lead`, 600): row titles, lead text, primary buttons on a phone, the value in a field.
- **Body** (`--text-body`, 400): body copy and list rows. Prose caps at `--measure` (68ch).
- **Label** (`--text-label`, 500; 600 on a selected chip or a field label): labels, chips, secondary buttons.
- **Caption** (`--text-caption`, 400): metadata; the floor for a figure or a rating.
- **Micro** (`--text-micro`, 600): the floor for any functional text: badges, counts, captions on a pin.

### Named Rules

**The Floor Rule.** Nothing functional is set under 11 px, and no figure or rating under 12 px. T421 raised every rule that was under 10 px; the older per-screen files still hold px sizes from 10 px up, which the migration moves onto the scale.

**The Tabular Rule.** Every column of figures uses tabular numerals in the one family. A figure that changes updates in place, never with a count-up.

## Layout

A 4 px spacing grid (`--space-1` to `--space-8` in the frontmatter); T421 moved `--space-5` and `--space-6` onto it (they were 22 and 30 px). `--gutter` is the 16 px side margin. The scale is for new and touched rules; the older stylesheets still carry px literals, which the migration retires.

`--tap-main` (48 px, T496, owner T485-a) is the height of the phone bottom nav slots and of each place's one primary action (Plan a trip, Add to day, the drawer handle). `--tap` (44 px) is the floor a finger needs. Icon-only controls get it as a minimum box even where the glyph inside is 15 px (WCAG 2.5.5). Nothing interactive is smaller on touch. Under `@media (pointer: fine)` a compact control, such as the small Button or a chip, may be 32 px high (T362).

| Token | Value | Only for |
|---|---|---|
| `--filter-h` | `132px` | Height of the filter bar on the map tab |
| `--panel-w` | `440px` | Width of the desktop detail panel |
| `--bottom-nav-h` | `calc(64px + env(safe-area-inset-bottom, 0px))` | Height of the four-slot phone bottom nav including the home-indicator inset (T494, T496), so nothing above it adds the inset again; set to `0px` where the nav is hidden |
| `--drawer-strip` | `72px` | The collapsed strip of the phone MapDrawer, which always carries the amount (T500) |

Layers, low to high (T474): `--z-base` 0; `--z-sticky` 10, a bar that sticks inside a scroll view; `--z-float` 12, lists and panels floating over the map; `--z-popover` 20, menus, tips and suggestions over those; `--z-header` 25, the app header and top bar; `--z-tray` 30, the open filter tray and a page's own toast; `--z-overlay` 40, drawers, phone panels, the calendar and their scrims; `--z-nav` 50, the bottom nav, the site banner and the plan chooser; `--z-shell` 55, shell panels over the nav (account, the phone header, the destination panel); `--z-modal` 60, dialogs, sheets and full overlays; `--z-toast` 80, a confirmation over a dialog; `--z-menu` 90, phone popovers, and dropdown menus and the loading screen at +10; `--z-page` 200, full-screen pages and what opens over them; `--z-top` 1000, the definition popover and the guides panel; `--z-max` 9999, the crash screen. Inside the map's own layer, `--z-pin-selected` 50 and `--z-pin-hover` 100 lift a price pin. Every z-index of 10 or more reads one of these, or a step inside its band written `calc(var(--z-band) + n)` (a destination page is `calc(var(--z-page) + 40)`); 1 to 9 is stacking inside one component and stays a number. The values are the ones the app shipped with, so the ladder names the order rather than changing it, and the design lint's `z-index-literal` rule keeps it that way. The content column caps at 1180 px.

Breakpoints (T380, design direction v6): the small floor is 360 px with no horizontal scroll; below 769 px is the phone (bottom nav, sheets, one column); from 769 px the header carries the tabs; from 1024 px map and list sit side by side, highlighting each other, and a detail page may run two columns.

**The Compact Default Rule.** Lists where places are compared default to compact rows (about ten to a phone screen); large photo tiles belong to rails and the home page.

## Elevation & Depth

A hybrid that leans flat. Objects at rest are drawn with a border; a shadow appears only on what floats over other content: a sheet, a dialog, a popover, a sticky bar over content, an icon button over a photograph, and the lifted thumb of a segmented control. All three shadows are ink (`#1f2a33`) at low alpha. No gradient exists in the product.

### Shadow Vocabulary

- **Resting lift** (`--elev-1`: `0 1px 2px rgba(31, 42, 51, 0.06), 0 2px 8px rgba(31, 42, 51, 0.05)`): a resting object that has no border, such as an icon button on a photo or the selected segment.
- **Raised** (`--elev-2`: `0 4px 12px rgba(31, 42, 51, 0.10), 0 12px 28px rgba(31, 42, 51, 0.08)`): a popover, a sticky bar over content.
- **Overlay** (`--elev-3`: `0 12px 32px rgba(31, 42, 51, 0.16), 0 2px 6px rgba(31, 42, 51, 0.08)`): a sheet or a dialog.

A modal dialog sits over a scrim of `--ink` at 28 per cent (T362).

### Named Rules

**The Border Or Shadow Rule.** Elevation is declared once per object: a border or a shadow, never both.

## Shapes

Gently rounded and consistent by size of object: the larger the object, the softer the corner.

- **Small marks** (`--radius-sm`, 6 px): status chips, inline marks, a focus ring around a tab.
- **Controls** (`--radius-control`, 10 px): buttons, inputs, selects, the segmented track, the photo inside a compact row.
- **Cards and photos** (`--radius-card`, 16 px): cards and photographs.
- **Sheets** (`--radius-sheet`, 20 px): sheets and dialogs.
- **Pills** (`--radius-pill`, 999 px): filter and choice chips, count chips, round icon buttons, spinners.

Borders are `1px solid var(--border)` on anything a user can type into or click and `var(--border-soft)` for hairlines inside an object. Lists get hairlines, objects get borders. A tile card clips its photo to the card's corner; the photo itself has no radius of its own there.

## Components

The shared kit lives in `continent-app/src/components/ui/` (exported from `index.js`) with its styles in `src/styles/03-button.css` and `src/styles/04-ui.css`, on roles and scales only. The style guide at `/?styleguide` shows each with a live example. New screens build from the kit; a one-off control that duplicates a kit component is a defect. Labels are passed in by the caller, who owns the i18n key.

Shared across the kit: focus is `outline: 2px solid var(--focus); outline-offset: 2px` on `:focus-visible`; hover rules sit inside `@media (hover: hover)` so a touch never sticks a hover state; colour changes take `--dur-1` with `--ease-out`; the press shade and compression come from `02-base.css` for every control; disabled reads as unavailable (`--surface-sunken`, `--text-3`, `cursor: not-allowed`), never as a quieter live control.

### Buttons

Calm and solid: a 10 px corner, a 600 weight label, and a fill only when the button is the one thing the view is for.

- **Shape:** gently rounded (`--radius-control`, 10 px), at least `--tap` high, `--space-5` side padding, `--text-body` at 600, an 8 px gap to an icon.
- **Primary:** `--action` fill, `--action-text` label. The one action of a view; one per view.
- **Secondary (the default):** `--surface` with a `--border` edge, `--text` label. Every action that is not the one.
- **Quiet** (`ghost` is an alias): no fill, brown label; an offer inside a bar or a row.
- **Danger:** `--danger` fill, white label. Erases something, nothing else.
- **Hover / Press:** primary darkens to `--action-hover`, then `--action-press` while pressed; secondary shifts to `--surface-hover` with a `--neutral-300` edge; quiet takes the `--action-tint` ground; danger darkens to `--danger-dark`.
- **Sizes:** `md` (default, `--tap` high) and `sm` (inline in a bar: 32 px on a fine pointer, `--tap` on touch, `--text-label`, `--space-3` padding). `block` fills the container width.
- **Loading:** keeps its width, hides the label in place, shows an 18 px spinner, sets `aria-busy` and blocks clicks. Under reduced motion the spinner stops and dims.
- **Icons:** `iconStart` and `iconEnd` sit beside the label and are hidden from assistive tech.
- **Copy:** verb first, sentence case, no full stop.
- **Not for:** a control whose only content is an icon (use IconButton); a toggle between views (use Segmented); a filter (use a Chip).

### Icon buttons

- **Shape:** always a `--tap` (44 px) round box, even with a 16 px glyph. The label is required: it becomes the accessible name and the tooltip.
- **Tones:** `plain` (no fill, icon in `--text-2`; bars and rows; the default), `surface` (a round `--surface` disc with a `--border` edge; over a map or on a sheet), `photo` (a round `--surface` disc with `--elev-1` and no border; over a photograph).
- **Hover:** `--surface-hover` behind the icon, which turns `--text`.
- **Pressed:** pass `pressed` for a toggle such as the save heart: it sets `aria-pressed` and the selected tint (`--select-bg` with `--select-ink`).
- **Not for:** an action whose meaning an icon cannot carry alone; use a Button with an icon and a label.

### Chips

One chip in four kinds. Selected takes the light tint and a tick, so the state never rests on colour alone.

- **Filter:** a toggle that narrows a list; a button with `aria-pressed`. `--surface` with a `--border` edge, pill corners, `--text-label` at 500, 32 px high on a fine pointer and `--tap` on touch. Selected: `--select-bg`, `--select-border` edge, `--select-ink` label at 600, and a 14 px tick that replaces the icon.
- **Choice:** one of a set, inside a ChipGroup (`role="radiogroup"`; arrow keys move the choice, only the chosen chip is in the tab order). Same look as filter.
- **Count:** a figure beside a label ("Filters 3"); not interactive. A 20 px pill on `--surface-sunken`, `--text-caption` at 600 in `--text-2`.
- **Status:** a label on an object; not interactive. 24 px, `--radius-sm`, `--text-caption` at 600, in one tone: `neutral` (`--surface-sunken`, `--text-2`), `best` (`--best` with `--text`), `gem` (`--gem-bg`, `--gem-ink`), `rate` (`--rate-bg`, `--rate`), `positive` (`--surface-sunken`, `--text`, a 6 px `--status-success` dot, always with its word), `danger` (`--danger-bg`, `--danger`).
- **When to use:** filters and refine rows; a short set of choices (more than four options also lands here rather than in Segmented); labels on objects.
- **Not for:** an action (use a Button); a selected state painted dark; a status tone used outside its one job.

### Segmented

Two to four exclusive views of one thing (List and Map, Overview and Day by day, I know my dates and I'm flexible).

- **Style:** a `--surface-sunken` track with 3 px padding and `--radius-control` corners; segments in `--text-2`, `--text-label` at 600, 38 px high (30 px in `sm`), with an optional icon.
- **Selected:** a raised white thumb (`--surface`, `--elev-1`) with the label in `--text`. Lifted, never painted dark.
- **Behaviour:** `role="radiogroup"` with `role="radio"` segments; arrow keys move the choice; only the chosen segment is in the tab order. `block` stretches the segments to fill the width.
- **Not for:** more than four options or filters (use chips).

### Tabs

Sections of one page that swap in place.

- **Style:** a row of labels on a `--border` hairline, `--space-5` apart, each `--tap` high, `--text-body` at 600. Unselected labels are `--text-2`; hover turns them `--text`.
- **Selected:** `--text` with a 2 px `--action` underline that grows from the centre (`scaleX`, `--dur-2`). An optional count follows the label in `--text-3`.
- **Behaviour:** `role="tablist"` with `role="tab"`; arrow keys move, Home and End jump; the caller renders the panel and may pass its id for `aria-controls`.
- **Not for:** moving between pages or tabs of the app, which are links with history.

### Cards / Containers

One anatomy for every object Carta lists (a place, a trail, a beach, a trip, a saved item). Slots in fixed order: media, title, meta, price, rating, actions.

- **Corner Style:** softly rounded (`--radius-card`, 16 px).
- **Background:** `--surface` with `--text`.
- **Shadow Strategy:** none at rest; a card is a bordered object (see Elevation & Depth).
- **Border:** `1px solid var(--border)`; hover on an interactive card shifts to `--neutral-300`; selected takes a `--select-border` edge and a 1 px inset outline of the same brown.
- **Row layout (the default):** a 72 px photo with `--radius-control` corners at the start, then title (`--text-lead` at 600, one line, ellipsis), meta (`--text-label` in `--text-3`) and the figures line (price at `--text-body` 600, then rating). Padding 8 px, 12 px on the right.
- **Tile layout:** a 4:3 photo on top clipped to the card's corners, then the body with 12 px top and 16 px side padding; actions float in the photo's top right corner as photo-tone icon buttons.
- **Opening:** the whole card opens its page through one real link or button on the title, stretched over the card; actions such as the save heart sit above the stretch as their own controls. No nested interactive elements. Focus draws the ring around the whole card.
- **Price slot:** always a `<Money>`.
- **Not for:** a card inside a card; a bento grid of facts; text on a photograph.

### Inputs / Fields

Every input the traveller types or picks into.

- **Style:** a visible label above (`--text-label` at 600), then the control: `--surface`, `1px solid var(--border)`, `--radius-control`, `--tap` high, `--space-3` side padding, the value in `--text-lead` (16 px, which also stops phone browsers zooming). Placeholders are `--text-3`. A textarea starts at 96 px, `--leading-body`, resizable vertically. A select draws its own chevron in `--text-2`.
- **Hover:** the edge shifts to `--neutral-300`.
- **Focus:** the 2 px `--focus` ring at a 1 px offset, and the edge turns `--action`.
- **Error / Disabled:** an error turns the edge `--danger`, sets `aria-invalid`, and shows one sentence under the field in `--danger` at `--text-caption` 600 that says what happened and what to do. Help text sits under the field in `--text-3` at `--text-caption`. Both are tied to the control with `aria-describedby`. Disabled is `--surface-sunken` with `--text-3`.
- **Rule:** the label is required and always present. `hideLabel` keeps it for assistive tech on a search box whose purpose the icon and context make plain. A placeholder is never the name of a field.

### Icons

Drawn line icons from `src/components/Icons.jsx` (1.5 stroke, `currentColor`), wrapped by Icon in three sizes: `sm` 16 px inside chips and inline with 13 to 14 px text; `md` 20 px in buttons, rows and the tab bar (the default); `lg` 24 px in empty states and the hero of a sheet. Decorative by default (hidden from assistive tech, since the control around it carries the name); pass `label` when the icon alone carries meaning. SVG only; no icon fonts, no glyph characters as icons.

### Money

Every euro the traveller reads goes through one formatter, `src/lib/money.js` (`formatMoney`, `formatApprox`, `formatEst`, `formatMoneyRange`) on `Intl.NumberFormat`, or the `<Money>` component in JSX, so two screens can never write the same figure two ways (T423, PRODUCT.md "Numbers", owner decisions 2026-10-13).

- **Whole euros in comparison contexts:** cards, pins, lists, rails, filters and chips, where many places are compared at once ("€87"). This is the one owner-approved rounding.
- **Cents on receipts and totals:** receipts, totals, ledgers, pass prices and exports (`precision="cents"`, "€87.40"). A rounded figure on a receipt is a defect.
- **Locale placement:** the reader's language decides where the symbol goes and how digits group ("€1,268" in English, "1.268 €" in German). It defaults to the app language.
- **Estimates:** written `~€87 est.`: the tilde joined to the figure, then the estimate word from i18n (`money.est`: "est." in English, French and Spanish, "gesch." in Dutch and German, "stim." in Italian). Never "~ €87", never "est. €87", never one mark without the other. The estimate word sits at 0.85em, 500 weight, in `--text-3`.
- **Per unit (T474):** one phrase per unit and one order when two apply: "a person a day" ("per persoon per dag", "pro Person und Tag", "par personne et par jour", "por persona y día", "a persona al giorno"), "a person" for a person's share (never "each"), "a day", "a night", "a car". The unit is its own i18n phrase or part of the template, never a suffix glued to a figure.
- **Ranges:** the language's own range word between two formatted figures ("€40 to €60"; "tot", "bis", "à", "a", "a" in Dutch, German, French, Spanish and Italian). No dash between figures.
- **Missing values:** words, never a blank, a dash or "€NaN": `<Money>` prints `money.onRequest` ("Price on request") in `--text-3` at 500.
- **No euro sign in i18n:** strings never carry a euro sign; a template takes a formatted figure (`{price}`, `{eur}`) from the formatter. Per person is one phrase per language (`money.perPerson`).
- **Typesetting:** `.money` is tabular and never wraps between the tilde, the figure and the word.
- **Not for:** `toFixed` on a price, a euro literal in a template, string concatenation of a symbol.

### Navigation

The phone has a white bottom tab bar (`--bottom-nav-h`) of four `--tap-main` slots (Explore, Plan, My trips, Account) with the active icon and label in brown; from 769 px the header carries the logo (the way Home), the three places left after it and the account icon far right (T496). Navigation between pages is links with history and addressable detail pages, never in-page tabs (T380).

**The page bar (T474).** Every full-screen page (destination, item, trip, journey and region) wears one bar, `src/browse/PageBar.jsx` with `.ipage-bar` in `70-item-pages.css`: a quiet back button that names the list it returns to on a phone and a desktop alike (never a bare arrow on one size and a cross on the other), the page's name once its heading has scrolled away, then save and share as icon buttons. It sits on `--surface` with a `--border-soft` hairline, 52 px tall plus the notch inset (content-box, so the inset adds height instead of eating it). A list item that opens a page is a real `<a href>` to the page's address; a plain click opens it in place, a modifier click is the browser's.

**Arrival focus (T474).** One rule, `src/hooks/usePageArrival.js`: opened by pointer, touch or a link the app booted on, focus goes to the page's h1 (tabindex -1, no ring); from the keyboard, to the first control in the page bar. `useFocusTrap` then traps Tab and Escape and hands focus back on close.

### Motion

Added by T380 (design direction v6, `docs/design-v6/DIRECTION.md` part 2). Every transition and animation reads these tokens; JavaScript reads them through `durationMs()` in `src/lib/motion.js`. They are motion, so they sit outside the frontmatter schema.

| Token | Value | Only for |
|---|---|---|
| `--dur-1` | `120ms` | Immediate feedback: a press, a chip toggling, a hover tint |
| `--dur-2` | `200ms` | A routine state change: a fold, a figure settling in place, a chip entering, a row sliding to its place, a tab's content arriving, a tab underline; every exit |
| `--dur-3` | `320ms` | A surface arriving: a sheet, a dialog, a popover, a shared element becoming its page, the grid to map crossfade |
| `--dur-4` | `480ms` | One authored movement over distance: the map camera, one leg of the route reveal (the whole reveal is capped at 900 ms) |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Arrivals and settles |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Movement between two on-screen positions: a reorder, the active marker sliding, a scrub marker |

No overshoot, bounce or elastic curve exists. Durations and easings come from these tokens, never a literal. Routine motion animates `transform` and `opacity`; a press, hover or selection may also animate `background-color`, `border-color` and `color` at `--dur-1`; a reveal may animate `clip-path`, `mask-position` or `stroke-dashoffset`. Nothing animates `width`, `height`, `top`, `left`, margins, padding, `grid-template-*`, `box-shadow`, `filter` or `backdrop-filter`; `transition: all` is never written. A figure that changes updates in place with one opacity dip (`settleFigure()` in `src/lib/figureChange.js`), never a count-up. Nothing moves because the page scrolled. The press shade (opacity 0.78, `scale: 0.98`, 60 ms) comes from `02-base.css`. The reduced-motion floor in `02-base.css` zeroes every duration, and every rule carries its own `prefers-reduced-motion: reduce` branch as well.

### Home page exception (T462)

Owner decision 2026-10-17 ("allow it"): the home page (`src/browse/home/`, styles in `src/styles/61-v6-home.css`) persuades rather than operates, so it is the one surface that may move on its own and put a label on a photograph. It adds no token.

- **A pinned product phone that follows the story** (T463, owner 2026-10-17, replacing T462's looping demo). From 1024 px one phone frame holding real captures of the app (`public/home/<lang>/`) stays pinned beside five chapters, and its screen crossfades (opacity, `--dur-3`) to the chapter that reaches the middle of the page; the chapter bar under it follows and its tabs scroll to their chapter. The screen changes; nothing scrubs, slides, scales or parallaxes with the scroll, and nothing plays by itself. Below 1024 px the chapters are a snap track (Previous, Next, the position, arrow keys). Under reduced motion the screen swaps at once. The devices are drawings of a phone (an ink bezel, a 9:41 bar) and a light browser window, each one object with `--elev-3`; the phone's outer radius is `calc(var(--radius-sheet) * 2)`, the only radius on the page outside the scale, because a device drawn at 20 px reads as a card.
- **Sections reveal once** on entering the viewport (opacity and a short translate, `--dur-3`, `--ease-out`), below the first viewport only and never before the observer exists. Under reduced motion nothing reveals.
- **A label or a price on a photograph** only inside a solid `--surface` pill with `--elev-1`; never a scrim, a gradient or a sentence on a photo.

Everything else in this file still binds the home page: the motion tokens, the animated properties above, no overshoot, no parallax, no count-up, one primary, `--tap` targets, no catalogue counts. No other surface takes this exception.

### Interaction

Focus: `outline: 2px solid var(--focus); outline-offset: 2px` on `:focus-visible` (the focus floor in `02-base.css` reads it since T426). Brown, so focus never reads as an error. The browser's own surfaces take the palette too: text selection is `--select-bg`, the caret and native checkboxes and radios are `--action`, scrollbars are `--neutral-300`. Inputs may add `border-color: var(--action)` to the ring but never ship `outline: none` without a replacement.

### Product rules for components

These are owner decisions about specific surfaces. They still hold; where a value has moved with Lagoon, the current value is given.

**Suitability strip (T360, accepted on owner instruction 2026-10-03).** A strip under a trip hero is a solid `--surface-page` band at full opacity, flush against the bottom edge of the hero, with a `--border` edge and square corners where it meets the photo. No alpha, no gradient, no text over the photograph. It holds exactly three cells in fixed order: difficulty, style, total cost. Difficulty is five small squares, filled `--text` up to the level and outlined `--text-3` beyond it (never `--rate` or `--action`), plus the level as a word. Style is one or two words from the trip's tags. Total cost is a `<Money>` in tabular figures (it was the mono face before T421). A missing value shows a placeholder word ("Unrated", "Mixed", "Price on request") so every trip shows three cells. It stays one row of three on a phone. Built as `.jstrip` in `src/styles/25-feature-pages.css`; no new token.

**Secondary chrome (T360).** The "Get a pass" chip in the desktop bar is transparent with a `--border` edge and `--radius-sm` corners. The phone's round plus button is `--surface` with a `--border` edge, pill corners and a `--tap` or larger target (the IconButton `surface` tone). Neither is `--action` filled, which leaves the brown fill for each page's one primary action.

**Rules decided by the owner on 2026-10-07 (T362).** The InfoDot, the day track, flashcards, the sticky section rail, the one Lifestyle control, the cost bar above a receipt, no bento grid, a scrim behind every modal dialog, and the install hint. The full text of each is in the carta-design skill under Components. None adds a token: the cost bar uses the `--kind-*` ink ramp, and the scrim is `--ink` at 28 per cent as `.lifestyle-scrim` draws it.

**Colours in JavaScript (T362, T364).** Where a colour must live in JavaScript (MapLibre paint properties cannot read a CSS custom property), it lives in one token-mirror module, `src/map/tokenColors.js`, that copies each value from `01-tokens.css` under the token's name. Since T421 each value there is the end of the alias chain, and the lint follows it. No other JavaScript file holds a hex. The design lint checks it: rule `js-hex-literal` flags a hex in any other JavaScript file (flag and brand artwork excepted; the print exports and PDF colours sit in the lint baseline until they are migrated), and rule `token-mirror-drift` fails when a mirrored value no longer matches `01-tokens.css`. Map-only colours with no token (the three lower Explore tier steps) are listed apart in the same module.

**Rules decided by T380 (design direction v6, 2026-10-08, under the owner's delegation of 2026-10-07).** From the 96 "Needs a rule" proposals of the ten surface briefs, 94 were accepted (6 as amended) and 2 rejected; the table with every decision and reason is `docs/design-v6/DIRECTION.md` part 9. The accepted rules, in full in the carta-design skill under Components and Interaction: the caption band (text never on a photograph), the one selected state (now the `--select-*` tint, see Colors; it was `--ink-fill` until T422), accent marks only on what acts or is live, the count chip (now the kit's count Chip on `--surface-sunken` at `--text-caption`; it was `--mono` 11 px before T422), the one close control, the dialog family (dialog, sheet, popover), navigation as links with history and addressable detail pages, the settings line, the bottom slot, undo instead of confirm, the "More" menu, cost on cards and pages from one cost index, the priced list, the budget ceiling, the month, the data drawings family (month strip, thin bar, profile, gauge, squares, receipt, timetable row), the receipt extended (trip receipt, day receipt, ranges, a live fragment, a receipt as shared element), the detail page grammar (key facts band, before you go, hand-off band, five rows, hairline folds, utility row, two columns from 1024 px), map and list in sync, rails and cuts, filter chips and the refine row, the day list and day switcher, the photo track, status not green, the small text rules, derived copy that stays silent, the comparison table, the focal card, remembered state and the still loading block.

## Do's and Don'ts

### Do:
- **Do** read a role (`--action`, `--surface`, `--text-3`) in every new or touched rule, and build from the kit in `src/components/ui/`.
- **Do** keep one primary Button per view; everything else is secondary or quiet.
- **Do** show selection as `--select-bg` with `--select-ink` and a mark: a tick on a chip, an underline on a tab, a lifted thumb on a segment.
- **Do** put a caption under a photograph, never on it (the home page's solid pill labels are the one exception, see Motion).
- **Do** give every control a 44 px (`--tap`) target on touch and the 2 px `--focus` ring on `:focus-visible`.
- **Do** print every euro through `formatMoney()` or `<Money>`: whole euros where places are compared, cents on receipts and totals, `~€87 est.` for an estimate.
- **Do** declare elevation once: a `--border` at rest, or an `--elev-*` shadow on what floats.
- **Do** take every duration and easing from the motion tokens and give every transition a reduced-motion branch.

### Don't:
- **Don't** paint a selected state as a dark fill; the dark slab is the look Lagoon refused.
- **Don't** use brown for anything that does not act, is not live or is not selected (beyond the rating star and the gem diamond), or sun yellow, rust or red outside their one job.
- **Don't** fill a rating chip, show a catalogue count as page furniture, or put a method or coverage sentence beside a figure.
- **Don't** set sun yellow as text; best value as text is ink beside the marker.
- **Don't** add a gradient, a second typeface, a monospaced face for figures, or a hex outside `01-tokens.css` and the token mirror.
- **Don't** set functional text under 11 px, or a figure or rating under 12 px.
- **Don't** give one object both a border and a shadow.
- **Don't** write a euro sign into an i18n string, call `toFixed` on a price, or round a figure on a receipt.
- **Don't** use a placeholder as the only name of a field.
- **Don't** write em dashes, en dashes, middots or bullet characters as separators in any copy.

### Before you ship

Read the diff and answer these seven questions, from the carta-design skill.

1. Any hex value outside `src/styles/01-tokens.css`? (`node scripts/ci/design-lint.mjs` checks this.)
2. Any gradient, any colour not in this file, any saturated hue beside `--action` outside its one job (sun for best value, rust for warnings, red for destruction)?
3. Is brown used only for what acts, is live or is selected (plus the rating star and the gem diamond), sun yellow only for best value, `--danger` only for destruction?
4. Is any rating under 12 px, any functional text under 11 px, or any column of figures without tabular numerals?
5. More than one primary button in a view?
6. Does every headline contain a verb or a number (or name a browse section), is there no catalogue count or method line that could go, and is the diff free of em dashes and the banned words?
7. Remove one thing. There is almost always one decoration that is carrying nothing.

## History

Retired decisions, kept so the record reads in order. None of these is a rule any more.

**Contrast tokens, darkened (T363, owner decision 2026-10-07 in T362; the values were replaced by Lagoon in T421 and every pair now passes).** Three pairs failed the 4.5:1 floor that PRODUCT.md promises: `--ink-mute` on `--paper` (3.51:1), `--accent` as text on `--paper` (3.40:1) and `--on-fill` on `--accent` (3.67:1). The owner chose to darken the tokens, same hue: `--ink-mute` became `#646978` and `--accent` `#ce3823`, with the hover fills `--accent-hover` `#b7321f`, `--accent-press` `#8e3615` and `--accent-press-alt` `#923b16`. Two pairs still fell short (`--accent` on `--accent-bg` 3.83:1, on `--paper-dim` 4.22:1; register row T363-a); Lagoon's `--action` on `--action-tint` at 4.7:1 closed them.

**The terracotta world (T198 to T420).** Cream paper, Fraunces display, Plus Jakarta Sans text and JetBrains Mono figures, with a terracotta accent. T421 replaced it with Lagoon. The "Accent states and tints" table this file carried until 2026-10-13 (`--accent-hover` `#b7321f`, `--accent-press` `#8e3615`, `--accent-press-alt` `#923b16`, `--accent-wash` `#f6ede0`, `--accent-wash-alt` `#fdf6f0`) and the old values of `--wash` (`#f6f3ee`), `--paper-hover` (`#efe9db`) and `--paper-lift` (`#fdfbf5`) were that world's; those names are now aliases, listed under Colors.

**Lagoon teal (T421 to T437).** One deep lagoon teal (`--lagoon-600` `#0b7480`) carried every action and selection, ratings were filled ochre chips (`#8f5a0c`), gems plum (`#7a4a6f`), warnings amber (`#8a5a18`). On 2026-10-13 the owner asked for two base colours (T438): the teal became umber, ratings became the Score (T437), gems joined the brown, warnings turned rust. The `--lagoon-*` primitives stay defined until no rule reads them.

**Selection as a dark fill (T380 to T422).** The one selected state was `--ink-fill`, first a slate slab, then deep teal under white labels in T421. T422 moved the kit onto the `--select-*` tint; older surfaces keep `--ink-fill` until the migration reaches them.

**Last synced with `src/styles/01-tokens.css`:** 2026-10-20 (T474: the z-index ladder, `--z-float` to `--z-max` and the two pin layers, values unchanged; `--z-map-ui` and `--z-sheet` retired unused, `--z-nav` moved to 50 and `--z-toast` to 80, where those layers sat). Before that 2026-10-13 (T438: the umber ramp, the roles on it, rate, gem, best and warning retuned; before that T421 to T424, Lagoon: primitives, roles, legacy aliases, Figtree, the type, radius, elevation and layer scales; the kit in `03-button.css` and `04-ui.css`; the money formatter; the style guide; restructured into the DESIGN.md format with frontmatter). Before that 2026-10-08 (T380, the six motion tokens), 2026-10-07 (T363) and 2026-10-03 (T191).
