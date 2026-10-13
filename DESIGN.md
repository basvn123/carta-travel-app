# Carta design tokens

This is the deterministic design system for Carta: the exact values the shipped app runs on, with the one job each value has. Read it after PRODUCT.md and before writing any CSS, JSX, HTML, email or image for Carta. Treat every value here as a rule, not a suggestion. If a design needs something this file does not define, that is a task to raise, not a value to invent.

The source of truth is the `:root` block of `continent-app/src/styles/01-tokens.css`. This file is a record of it, kept in step by hand; when the two disagree, that file is what ships and this file is wrong. `src/styles.css` is only the entry point that imports the domain files in `src/styles/`, in a fixed order (T191). Never hardcode a hex, a font name or a pixel spacing in a component: reference the custom property.

**The look is "Lagoon" (T419, owner decision 2026-10-13):** a top-tier travel app in the manner of Airbnb, Polarsteps and Wanderlog. Photography leads; white surfaces sit on a warm light grey; ink is a blue-grey that is never black; one deep lagoon teal carries every action and every selection; sun yellow marks best value and nothing else; one friendly typeface, Figtree, sets everything, figures included, with tabular numerals. The direction contract is in `continent-app/.impeccable/surfaces/continent-app.md`; the brand commitment is in PRODUCT.md. T421 built the tokens below. The carta-design skill still describes the earlier cream, Fraunces and terracotta world until T425 rewrites it (register row T419-c); where the skill and this file disagree on colour, type, radius or elevation, this file wins.

## Colour

Tokens come in three layers. **Primitives** are the raw scales, and components never read them. **Roles** say what a value is for, and every new or touched rule reads a role. **Legacy names** are every name the stylesheet used before T421, each now an alias of a role, so the whole app re-skinned from the token file alone; the migration (T426 onward) retires them file by file, and new code does not use them. The app is single-theme: there are no `prefers-color-scheme` or `data-theme` blocks. Ratios are WCAG 2 contrast, and `continent-app/scripts/ci/token-contrast.mjs` checks every pair the product uses (29 pairs, all at 4.5:1 or more).

### Primitives

| Token | Value |
|---|---|
| `--neutral-0` | `#ffffff` |
| `--neutral-25` | `#fbfbfa` |
| `--neutral-50` | `#f6f5f2` |
| `--neutral-100` | `#efeeea` |
| `--neutral-150` | `#e9eae7` |
| `--neutral-200` | `#dcdfdd` |
| `--neutral-300` | `#c5cac8` |
| `--neutral-600` | `#5c6873` |
| `--neutral-700` | `#44515c` |
| `--neutral-800` | `#2e3a44` |
| `--neutral-900` | `#1f2a33` |
| `--lagoon-50` | `#eef7f7` |
| `--lagoon-100` | `#dff0f1` |
| `--lagoon-200` | `#bfe0e2` |
| `--lagoon-300` | `#8cc6ca` |
| `--lagoon-600` | `#0b7480` |
| `--lagoon-700` | `#0a6670` |
| `--lagoon-800` | `#08575f` |
| `--lagoon-900` | `#07454b` |
| `--sun-100` | `#fdf1d8` |
| `--sun-400` | `#f2b33d` |
| `--sun-800` | `#7a5000` |

`--lagoon-600` is one step darker than the decision card's `#0e7c86`, so teal text clears AA on its own tint (4.67:1, the pair that failed at 3.8:1 in the T418 baseline).

### Roles

| Token | Resolves to | Only for |
|---|---|---|
| `--surface-page` | `--neutral-50` | The ground behind everything |
| `--surface` | `--neutral-0` | Cards, sheets, bars. The only pure white |
| `--surface-sunken` | `--neutral-100` | Input fills, quiet bands |
| `--surface-hover` | `#eeede9` | Hover on a quiet surface |
| `--text` | `--neutral-900` | Body text and headings, 13.4:1 on the page |
| `--text-2` | `--neutral-700` | Secondary text, 7.5:1 |
| `--text-3` | `--neutral-600` | Metadata at 11 to 14 px, never body copy; 5.2:1 on the page, 4.9:1 on a sunken band |
| `--border` | `--neutral-200` | Card and input borders, dividers |
| `--border-soft` | `--neutral-150` | Hairlines inside an object |
| `--action` | `--lagoon-600` | Primary buttons, links, the live route. White on it 5.5:1; as text 5.5:1 on a card |
| `--action-hover`, `--action-press` | `--lagoon-700`, `--lagoon-800` | Hover and press fills of `--action` |
| `--action-text` | `--neutral-0` | The label on an `--action` fill |
| `--action-tint` | `--lagoon-100` | A light teal ground; `--action` text on it 4.7:1 |
| `--select-bg`, `--select-ink`, `--select-border` | `--lagoon-100`, `--lagoon-700`, `--lagoon-600` | The one selected state: tint, teal label (5.7:1), teal edge. Never a dark slab |
| `--focus` | `--lagoon-600` | Focus rings. Teal, so focus never reads as an error |
| `--best`, `--best-bg`, `--best-ink` | `--sun-400`, `--sun-100`, `--sun-800` | Best value only: a marker or fill with `--text` on it (7.9:1), or text (7.1:1). Yellow is never text |

### Legacy names (aliases, retiring)

`--paper` is `--surface-page`, `--paper-dim` is `--surface-sunken`, `--bg-card` is `--surface`, `--on-fill` is `--action-text`, `--ink` is `--text`, `--ink-soft` is `--text-2`, `--ink-mute` is `--text-3`, `--rule` is `--border`, `--rule-soft` is `--border-soft`, `--accent` is `--action`, `--accent-bg` is `--action-tint`, `--accent-hover` is `--action-hover`, `--accent-press` and `--accent-press-alt` are `--action-press`, `--accent-soft` is `--lagoon-300`, `--accent-wash` and `--wash` are `--lagoon-50`, `--accent-wash-alt` is `#f4f9f9`, `--paper-hover` is `--surface-hover`, `--paper-lift` is `--neutral-25`, `--shadow-1` and `--shadow-card` are `--elev-1`, `--shadow-2` is `--elev-2`, and `--display`, `--mono` and `--font` resolve to `--ui`.

`--ink-fill` is `--lagoon-800`. Until T422 moves every chip, tab and segment onto the `--select-*` tint, selection is a deep teal fill under white labels (8.3:1). T421 moved the 52 control declarations that painted a selected chip or a button with solid `--ink` onto it; data drawings (bars, strips, pins, month cells) and toasts keep `--ink`.

### Measures and semantics

| Token | Value | Only for |
|---|---|---|
| `--rate` | `#8f5a0c` | Ochre. Ratings as a measure, filled: white on it 5.8:1. Never for actions. The star colour is roadmap item 1.8 |
| `--rate-soft` | `#946313` | Ochre as text on the page, 4.8:1 |
| `--rate-bg` | `#f6e6cb` | The ground behind a rating chip; `--rate` on it 4.7:1 |
| `--green` | `#4a6a3a` | Good news in data, always with a word. Never chrome, never a button |
| `--danger`, `--danger-dark` | `#b3372a`, `#96291e` | Destructive actions only. Now that the action is teal, red means one thing: this erases something |
| `--status-success` | `#10b981` | Indicator dots and ticks. Never text |
| `--gem-ink`, `--gem-bg` | `#7a4a6f`, `#f3e8f0` | Plum. Hidden gems and nothing else (5.8:1). Moved off teal in T421 so a gem never reads as a button |

Three rules matter more than the list. Ratings are a measure, so they are ochre and never the action colour. `--danger` exists because nothing else may mean "this erases everything". Sun yellow marks best value only, and plum marks a hidden gem only.

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

**Cautions: amber, orange and red-brown. Warnings that are not destructive (--danger is the destructive one)**

| Token | Value | Only for |
|---|---|---|
| `--warn-ink` | `#b3402a` | over budget, no fare, cautions |
| `--warn-vivid` | `#cc4433` | poor water and swim-stop indicator |
| `--amber` | `#c68a12` | sufficient water, hazard rules, amber indicator |
| `--amber-ink` | `#8a5a18` | warning note text |
| `--amber-ink-alt` | `#8a5f0d` | amber text beside the ochre family |
| `--amber-ink-deep` | `#855a0a` | deepest amber text |
| `--amber-warm` | `#b3690f` | warm amber text |
| `--beach-ink` | `#c48a2a` | beach pin name |
| `--amber-bg` | `#fdf3e2` | warning note fill |
| `--amber-bg-alt` | `#fcf2dd` | a second warning tint |
| `--amber-rule` | `#efd9a3` | warning border |
| `--rate-rule` | `#e0cba4` | rating band border |
| `--crowd-hot` | `#d06a2a` | crowded indicator |
| `--orange` | `#d35a26` | orange fill |
| `--experience-ink` | `#9a3a2a` | experience type text |
| `--experience-rule` | `#eec7bb` | experience type border |
| `--danger-bg` | `#f6dcd8` | poor water fill |

**Accent states and tints**

| Token | Value | Only for |
|---|---|---|
| `--accent-hover` | `#b7321f` | hover fill of an accent button |
| `--accent-press` | `#8e3615` | hover fill of a primary cost action |
| `--accent-press-alt` | `#923b16` | hover fill, stay search |
| `--accent-wash` | `#f6ede0` | a warm hover wash |
| `--accent-wash-alt` | `#fdf6f0` | a faint accent tint behind advice |

**Violet, slate and surface tints. Single-use domain colours**

| Token | Value | Only for |
|---|---|---|
| `--ai-violet` | `#5b3fa8` | AI-planned stops |
| `--ai-violet-bg` | `#eee7fb` | AI chip fill |
| `--mountain-ink` | `#6b5b95` | mountains pin name |
| `--slate-ink` | `#55606f` | unknown or neutral swim and way label |
| `--slate-pin` | `#5b6472` | town pin |
| `--crowd-mid` | `#6b7280` | moderate crowd indicator |
| `--slate-mute` | `#6f7688` | map popup subtitle |
| `--wash` | `#f6f3ee` | a faint wash for a current tier |
| `--paper-hover` | `#efe9db` | hover fill on paper |
| `--paper-lift` | `#fdfbf5` | a card ground one step off paper |
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
| `--gem-ink`, `--gem-bg` | `#7a4a6f`, `#f3e8f0` | Plum, hidden gems only (see Measures and semantics) |

### Elevation

| Token | Value | Only for |
|---|---|---|
| `--elev-1` | `0 1px 2px rgba(31, 42, 51, 0.06), 0 2px 8px rgba(31, 42, 51, 0.05)` | A resting card that has no border |
| `--elev-2` | `0 4px 12px rgba(31, 42, 51, 0.10), 0 12px 28px rgba(31, 42, 51, 0.08)` | Raised: a popover, a sticky bar over content |
| `--elev-3` | `0 12px 32px rgba(31, 42, 51, 0.16), 0 2px 6px rgba(31, 42, 51, 0.08)` | Overlay: a sheet or a dialog |

Elevation is declared once per object: a border or a shadow, never both. All three are ink at low alpha. No gradient exists in the product.

## Type

One family, Figtree (variable, weights 300 to 900, latin and latin-ext, self-hosted in `continent-app/public/fonts`, declared in `continent-app/index.html`; nothing loads from a Google host). Decision T421, replacing T198's Fraunces, Plus Jakarta Sans and JetBrains Mono: Figtree is friendly and warm like the Airbnb reference, the most compact of the three faces tried (Figtree, Manrope, Onest) for the compact rows the owner chose, and carries real tabular figures. It is not on impeccable's list of overused faces.

| Token | Value | Only for |
|---|---|---|
| `--ui` | `'Figtree', system-ui, -apple-system, 'Segoe UI', sans-serif` | The one face declaration. `--font`, `--display` and `--mono` alias it |
| `--font` | `var(--ui)` | The name new rules use |

Figures. A separate monospaced face is retired (owner decision 2026-10-13, PRODUCT.md "Numbers"). `body` sets `font-variant-numeric: tabular-nums`, so every price, date, time and distance lines up in columns and settles in place in the one family. Measured facts are told apart by their position and their unit, not by a costume face.

| Token | Value | Only for |
|---|---|---|
| `--text-micro` | 11 px | The floor for any functional text: badges, counts, captions on a pin |
| `--text-caption` | 12 px | Metadata; the floor for a figure or a rating |
| `--text-label` | 13 px | Labels, chips, secondary buttons |
| `--text-body` | 14 px | Body copy and list rows |
| `--text-lead` | 16 px | Lead text, primary buttons on a phone, row titles |
| `--text-title` | 20 px | Card and section titles |
| `--text-headline` | 28 px | Page titles |
| `--text-display` | 40 px | Destination names on a hero |
| `--leading-tight`, `--leading-ui`, `--leading-body` | 1.2, 1.35, 1.5 | Headings, controls, prose |
| `--measure` | 68ch | The maximum line length of prose |

Nothing functional is set under 11 px, and no rating chip under 12 px (T421 raised every rule that was under 10 px). The stylesheet still holds older px sizes from 10 px up; the migration moves them onto the scale.

## Spacing

A 4 px grid. T421 moved `--space-5` and `--space-6` onto it (they were 22 and 30 px). The scale is for new and touched rules; the stylesheet still carries older px literals, which the migration retires.

| Token | Value |
|---|---|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `24px` |
| `--space-6` | `32px` |
| `--space-7` | `40px` |
| `--space-8` | `56px` |
| `--gutter` | `16px` |
| `--tap` | `44px` |

`--tap` is the floor a finger needs. Icon-only controls get it as a minimum box even where the glyph inside is 15 px (WCAG 2.5.5). Nothing interactive is smaller.

## Layout

| Token | Value | Only for |
|---|---|---|
| `--filter-h` | `132px` | Height of the filter bar on the map tab |
| `--panel-w` | `440px` | Width of the desktop detail panel |
| `--bottom-nav-h` | `86px` | Height of the phone bottom nav; set to `0px` where the nav is hidden |

Radius (T421): `--radius-sm` 6 px for small inline marks, `--radius-control` 10 px for buttons and inputs, `--radius-card` 16 px for cards and photos, `--radius-sheet` 20 px for sheets and dialogs, `--radius-pill` 999 px for chips and round icon buttons. Layers, low to high: `--z-base` 0, `--z-sticky` 10, `--z-map-ui` 20, `--z-nav` 30, `--z-overlay` 40, `--z-sheet` 50, `--z-modal` 60, `--z-toast` 70. The older literals in the stylesheet move onto both scales during the migration. Borders are `1px solid var(--rule)` on anything a user can type into or click and `var(--rule-soft)` for hairlines inside an object. Lists get hairlines, objects get borders. The content column caps at 1180 px.

Breakpoints (T380, design direction v6): the small floor is 360 px with no horizontal scroll; below 769 px is the phone (bottom nav, sheets, one column); from 769 px the header carries the tabs; from 1024 px map and list sit side by side and a detail page may run two columns. The display scale, elevation and icon rules are in the carta-design skill under Layout and spacing.

## Motion

Added by T380 (design direction v6, `docs/design-v6/DIRECTION.md` part 2). Every transition and animation reads these; JavaScript reads them through `durationMs()` in `src/lib/motion.js`.

| Token | Value | Only for |
|---|---|---|
| `--dur-1` | `120ms` | Immediate feedback: a press, a chip toggling, a hover tint |
| `--dur-2` | `200ms` | A routine state change: a fold, a figure settling in place, a chip entering, a row sliding to its place, a tab's content arriving; every exit |
| `--dur-3` | `320ms` | A surface arriving: a sheet, a dialog, a popover, a shared element becoming its page, the grid to map crossfade |
| `--dur-4` | `480ms` | One authored movement over distance: the map camera, one leg of the route reveal (the whole reveal is capped at 900 ms) |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Arrivals and settles |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Movement between two on-screen positions: a reorder, the active marker sliding, a scrub marker |

No overshoot, bounce or elastic curve exists. The reduced-motion floor in `src/styles/02-base.css` still zeroes every duration, and every rule carries its own `prefers-reduced-motion: reduce` branch as well.

## Interaction

Focus: `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible` (`--accent` is `--action`, teal). The browser's own surfaces take the palette too: text selection is `--select-bg`, the caret and native checkboxes and radios are `--action`, scrollbars are `--neutral-300`. Inputs may swap the outline for `border-color: var(--accent)` but never ship `outline: none` without one of the two.

Motion (T380 relaxed the earlier "under 300 ms, transform and opacity only" line): durations and easings from the Motion tokens, never a literal. Routine motion animates `transform` and `opacity`; a press, hover or selection may also animate `background-color`, `border-color` and `color` at `--dur-1`; a reveal may animate `clip-path`, `mask-position` or `stroke-dashoffset`. Nothing animates `width`, `height`, `top`, `left`, margins, padding, `grid-template-*`, `box-shadow`, `filter` or `backdrop-filter`; `transition: all` is never written. A figure that changes updates in place in tabular mono with one opacity dip (`settleFigure()` in `src/lib/figureChange.js`), never a count-up. Nothing moves because the page scrolled. Every transition and animation has a `prefers-reduced-motion: reduce` branch that sets it to `none`. The full motion rule, including what moves and what never moves, is in the carta-design skill under Interaction.

Buttons: height `--tap`, radius `--radius-control`, sentence case, verb first, one primary per view. Primary is `--action` filled with `--action-text`; secondary is `--surface` with a `--border` edge; a selected toggle, chip or tab takes the `--select-*` tint from T422 (until then `--ink-fill`, deep teal, with white text). T422 builds these as the shared kit.

## Components

**Suitability strip (T360, accepted on owner instruction 2026-10-03).** A strip under a trip hero is a solid `--paper` band at full opacity, flush against the bottom edge of the hero, with a `--rule` border and square corners where it meets the photo. No alpha, no gradient, no text over the photograph. It holds exactly three cells in fixed order: difficulty, style, total cost. Difficulty is five small squares, filled `--ink` up to the level and outlined `--ink-mute` beyond it (never `--rate` or `--accent`), plus the level as a word. Style is one or two words from the trip's tags. Total cost is in the mono face with the currency. A missing value shows a placeholder word ("Unrated", "Mixed", "Price on request") so every trip shows three cells. It stays one row of three on a phone. Built as `.jstrip` in `src/styles/25-feature-pages.css`; no new token.

**Secondary chrome (T360).** The "Get a pass" chip in the desktop bar is transparent with a `--rule` border and 6 px radius. The phone's round plus button is `--bg-card` with a `--rule` border, `999px` radius and a `--tap` or larger target. Neither is `--accent` filled, which leaves the accent for each page's one primary action.

**Rules decided by the owner on 2026-10-07 (T362).** The InfoDot, the day track, flashcards, the sticky section rail, the one Lifestyle control, the cost bar above a receipt, no bento grid, a scrim behind every modal dialog, and the install hint. The full text of each is in the carta-design skill under Components. None adds a token: the cost bar uses the `--kind-*` ink ramp, and the scrim is `--ink` at 28 percent as `.lifestyle-scrim` already draws it.

**Compact controls on a fine pointer (T362).** `--tap` stays the floor on touch. Under `@media (pointer: fine)` a compact control, such as the small Button, may be 32 px high.

**Colours in JavaScript (T362).** Where a colour must live in JavaScript (MapLibre paint properties cannot read a CSS custom property), it lives in one token-mirror module that copies each value from `01-tokens.css` under the token's name, with a comment naming the token. No other JavaScript file holds a hex. The module is `src/map/tokenColors.js` (T364). The design lint checks it: rule `js-hex-literal` flags a hex in any other JavaScript file (flag and brand artwork excepted; the print exports and PDF colours sit in the lint baseline until they are migrated), and rule `token-mirror-drift` fails when a mirrored value no longer matches `01-tokens.css`. `--accent` and `--ink-mute` are not mirrored, because T363 changes them; they are read live. Map-only colours with no token (the three lower Explore tier steps) are listed apart in the same module.

**Rules decided by T380 (design direction v6, 2026-10-08, under the owner's delegation of 2026-10-07).** From the 96 "Needs a rule" proposals of the ten surface briefs, 94 were accepted (6 as amended) and 2 rejected; the table with every decision and reason is `docs/design-v6/DIRECTION.md` part 9. The accepted rules, in full in the carta-design skill under Components and Interaction: the caption band (text never on a photograph), the one selected state (`--ink-fill`; `--accent-bg` is never a selection), accent marks only on what acts or is live, the count chip (`--mono` 11 px on `--paper-dim`), the one close control, the dialog family (dialog, sheet, popover), navigation as links with history and addressable detail pages, the settings line, the bottom slot, undo instead of confirm, the "More" menu, cost on cards and pages from one cost index, the priced list, the budget ceiling, the month, the data drawings family (month strip, thin bar, profile, gauge, squares, receipt, timetable row), the receipt extended (trip receipt, day receipt, ranges, a live fragment, a receipt as shared element), the detail page grammar (key facts band, before you go, hand-off band, five rows, hairline folds, utility row, two columns from 1024 px), map and list in sync, rails and cuts, filter chips and the refine row, the day list and day switcher, the photo track, status not green, the small text rules, derived copy that stays silent, the comparison table, the focal card, remembered state and the still loading block. None adds a colour token; the motion tokens above are the only new tokens.

**Contrast tokens, darkened (T363, owner decision 2026-10-07 in T362; historical, the values were replaced by Lagoon in T421 and every pair now passes, see Colour).** Three pairs failed the 4.5:1 floor that PRODUCT.md promises: `--ink-mute` on `--paper` (3.51:1), `--accent` as text on `--paper` (3.40:1) and `--on-fill` on `--accent` (3.67:1). The owner chose to darken the tokens, same hue: `--ink-mute` is `#646978` (5.07:1 on `--paper`, 4.63:1 on `--paper-dim`) and `--accent` is `#ce3823` (4.61:1 as text on `--paper`, 4.98:1 under white). The three hover fills keep the step they had above the old accent: `--accent-hover` `#b7321f` (6.0:1 under white; it keeps the accent's saturation, because at the old hover's lower saturation it would sit 3 Lab units from `--danger`), `--accent-press` `#8e3615` (7.8:1) and `--accent-press-alt` `#923b16` (7.3:1). Two pairs still fall short and are open: `--accent` as text on `--accent-bg` is 3.83:1 (was 2.82:1) and on `--paper-dim` 4.22:1. Lightening `--accent-bg` far enough would make it lighter than `--paper`, so a selected chip would stop reading as selected; the fix is a text step for those rules, not a paler tint (register row T363-a). Ratios are WCAG 2 relative-luminance contrast, (L1 + 0.05) / (L2 + 0.05).

## Before you ship

Read the diff and answer these seven questions, from the carta-design skill.

1. Any hex value outside `src/styles/01-tokens.css`? (`node scripts/ci/design-lint.mjs` checks this.)
2. Any gradient, any colour not in this file, any saturated hue beside `--action` outside its one job (sun for best value, plum for gems, ochre for ratings, red for destruction)?
3. Is ochre used for anything but a rating, plum for anything but a gem, sun yellow for anything but best value, `--danger` for anything but destruction?
4. Is any rating under 12 px, any functional text under 11 px, or any column of figures without tabular numerals?
5. More than one primary button in a view?
6. Does every headline contain a verb or a number, and is the diff free of em dashes and the banned words?
7. Remove one thing. There is almost always one decoration that is carrying nothing.

Last synced with `src/styles/01-tokens.css`: 2026-10-13 (T421, Lagoon: primitives, roles, legacy aliases, Figtree, the type, radius, elevation and layer scales). Before that 2026-10-08 (T380, the six motion tokens), 2026-10-07 (T363) and 2026-10-03 (T191).
