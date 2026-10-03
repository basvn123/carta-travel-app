# Carta design tokens

This is the deterministic design system for Carta: the exact values the shipped app runs on, with the one job each value has. Read it after PRODUCT.md and before writing any CSS, JSX, HTML, email or image for Carta. Treat every value here as a rule, not a suggestion. If a design needs something this file does not define, that is a task to raise, not a value to invent.

The source of truth is the `:root` block of `continent-app/src/styles/01-tokens.css`. This file is a record of it, kept in step by hand; when the two disagree, that file is what ships and this file is wrong. `src/styles.css` is only the entry point that imports the domain files in `src/styles/`, in a fixed order (T191). Never hardcode a hex, a font name or a pixel spacing in a component: reference the custom property.

The carta-design skill (`.claude/skills/carta-design/SKILL.md`) still governs structure, the mono rule, the receipt, the search strip, the copy rules, the "never do this" list and the quality floor. Its banner of 2026-07-28 declares the palette and type below as the decided state. The skill's older body (cool-grey Timetable palette, `--signal` blue, Instrument Sans, IBM Plex Mono, "no serif anywhere", `assets/tokens.css`) was built for the landing page and reverted; it contradicts the banner and this file, and this file wins on colour and type. T198 recorded the typography decision under Type below; T325 rewrites the skill body to match.

## Colour

Warm alabaster ground, deep slate ink, one terracotta accent. The app is single-theme: there are no `prefers-color-scheme` or `data-theme` blocks, and no dark variants of these tokens exist.

### Paper and ink

| Token | Value | Only for |
|---|---|---|
| `--paper` | `#f8f6f0` | The page ground, and the text colour on a dark fill |
| `--paper-dim` | `#efece2` | Alternating section grounds, input fills, a quiet band on paper |
| `--bg-card` | `#ffffff` | Card fill. The only pure white in the product |
| `--on-fill` | `#ffffff` | Label, icon and stroke colour on any filled surface (an accent button, an ink-fill pill, a pin). Shared by buttons and chips |
| `--ink` | `#0f172a` | Body text, headings, the fill of a dark surface |
| `--ink-soft` | `#414b5e` | Secondary text, supporting paragraphs |
| `--ink-mute` | `#7d8393` | Metadata, captions, placeholders, at 12 to 14 px, never body copy |
| `--ink-fill` | `#2b3446` | The fill behind an active control. One step off `--ink` so a painted button does not read as pure black; 11:1 against `--paper` |
| `--rule` | `#ccc7b8` | Dividers, card borders, input borders |
| `--rule-soft` | `#e2ded1` | Hairlines inside a card, where `--rule` is too loud |

### Accent and semantic colours

| Token | Value | Only for |
|---|---|---|
| `--accent` | `#e05a47` | Terracotta. Actions, alerts, the live route, focus rings. The one saturated colour in normal use |
| `--accent-soft` | `#e97f6b` | Hover and focus borders on inputs; the lighter end of the accent |
| `--accent-bg` | `#f7dcd4` | Tinted callouts and selected rows on the accent |
| `--rate` | `#8f5a0c` | Ochre. Ratings as a measure, filled: paper text on `--rate` is 5.3:1. Never for actions |
| `--rate-soft` | `#946313` | Ochre as text on paper, 4.8:1 |
| `--rate-bg` | `#f6e6cb` | The ground behind a rating chip; `--rate` on it is 4.7:1 |
| `--green` | `#4a6a3a` | Good news in data: "good deal" copy, a price that went down. Never in chrome, never a button |
| `--danger` | `#b3372a` | Destructive actions only (delete an account, erase a trip): 5.6:1 as text, 6.0:1 as a fill under white. Never decoration, never an alert |
| `--danger-dark` | `#96291e` | Hover on `--danger` |
| `--status-success` | `#10b981` | Indicator-only green: compliance ticks, open-now dots. Never text |

Three rules that matter more than the list. Ratings are a measure, not a warning, so they are ochre and never terracotta: "Rome 9.5" in a saturated red bubble reads as an error. Terracotta is the action colour and so cannot also mean "this erases everything"; that is why `--danger` exists and why nothing else may use it. Teal (below) belongs to hidden gems and to nothing else.

### Domain colours

Added by T191 so that no hex literal has to live outside `:root`. Every value is the exact colour the stylesheet already used, so nothing on screen moved. These are single-purpose indicator and tint colours for one feature each (water quality, trails, crowding, AI stops, warnings). They are not part of the brand palette: a new screen takes its colours from the two tables above and reaches for one of these only when it draws the same feature the token is named after. A component never takes one of them as a general-purpose colour.

`--on-fill` is the one shared token here. It is `#ffffff`, the label, icon and stroke colour on any filled surface: an `--accent` button, an `--ink-fill` pill, a map pin. `--bg-card` stays the fill of a card; both are pure white today, and the split lets them diverge without a search. A shared Button takes its label colour from `--on-fill`.


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
| `--accent-hover` | `#cf4c3a` | hover fill of an accent button |
| `--accent-press` | `#b0431a` | hover fill of a primary cost action |
| `--accent-press-alt` | `#b3491b` | hover fill, stay search |
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

Place kind is an ink-density ramp, not a rainbow: ink mixed over paper at 100, 78, 62, 45 and 50 per cent, so the hierarchy reads as weight and survives greyscale and colour-blind viewing.

| Token | Value | Only for |
|---|---|---|
| `--kind-metro` | `#0f172a` | Metro |
| `--kind-city` | `#424856` | City |
| `--kind-town` | `#686c75` | Town |
| `--kind-village` | `#8f9297` | Village |
| `--kind-area` | `#84868d` | Area |
| `--verdict-3` | `var(--rate)` | Filled verdict ribbon |
| `--verdict-2` | `var(--rate)` | Outline verdict ribbon |
| `--verdict-1` | `var(--ink-mute)` | Text-only verdict |
| `--gem-ink` | `#2c6e63` | Teal. Hidden gems and nothing else, so "the world hasn't noticed" can never be confused with "worth the journey" |
| `--gem-bg` | `#d9eae5` | The ground behind a gem badge |

### Shadows

| Token | Value |
|---|---|
| `--shadow-1` | `0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.04)` |
| `--shadow-2` | `0 4px 16px rgba(15, 23, 42, 0.10), 0 12px 32px rgba(15, 23, 42, 0.08)` |
| `--shadow-card` | `0 4px 20px rgba(15, 23, 42, 0.06)` |

All three are ink at low alpha. There is no other shadow and no gradient in the product.

## Type

Three faces, and one rule about which is which.

Decision (T198, 2026-10-02): Carta's type is Fraunces for display, Plus Jakarta Sans for everything else and JetBrains Mono for measured facts, through the three tokens below and never by name; Cormorant Garamond, Instrument Sans and IBM Plex Mono are rejected, and `scripts/ci/design-lint.mjs` (rule `font-literal`) fails any `font-family` outside `:root` that is not `var(--display)`, `var(--ui)`, `var(--mono)` or `inherit`.

Why. The research note (`additional docs/Carta/Plan/Frontend Design/Frontend Design Tools Research.md`) proposed Cormorant Garamond with Plus Jakarta Sans; the carta-design skill body bans every serif and teaches Instrument Sans with IBM Plex Mono; the app has shipped Fraunces, Plus Jakarta Sans and JetBrains Mono since the skill's banner of 2026-07-28. The shipped state wins because every planner, PDF and map label is already set in it, Fraunces at display sizes carries the destination-name voice the brochure-free rule still allows, and Plus Jakarta Sans is the one face all three sources agree on. Fraunces is the only serif and only in the display role; the skill's "no serif anywhere" line is retired by this decision and T325 rewrites the skill body to match.

| Token | Value | Only for |
|---|---|---|
| `--display` | `'Fraunces', 'Iowan Old Style', Georgia, serif` | Display headings and destination names |
| `--ui` | `'Plus Jakarta Sans', 'Inter Tight', system-ui, -apple-system, sans-serif` | Everything else: body, labels, buttons, prose |
| `--mono` | `'JetBrains Mono', 'SF Mono', Menlo, monospace` | Measured facts only |

The mono rule. `--mono` carries machine-readable facts and nothing else: prices, dates, times, durations, distances, airport codes, counts, percentages, coordinates. Seeing mono tells the reader "this is a measured number", and that signal is spent the moment a decorative label is set in it. Prose is always `--ui`. A number in prose is set in `--ui`; a number in a column, a receipt line or a pin is set in `--mono` with `font-variant-numeric: tabular-nums`.

Body is `--ui` at 14 px, line-height 1.45, colour `--ink`. Fraunces is a variable optical-size face; the display role uses weights 400 to 700 and it is never used for running text.

Fonts are self-hosted (T199): variable woff2 files for Fraunces, Plus Jakarta Sans and JetBrains Mono, latin and latin-ext only, sit in `continent-app/public/fonts`, are declared by `@font-face` inline in `continent-app/index.html`, and nothing loads from a Google host.

## Spacing

The scale is for new and touched rules; the stylesheet still carries older px literals and nothing is rewritten wholesale.

| Token | Value |
|---|---|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `22px` |
| `--space-6` | `30px` |
| `--space-7` | `40px` |
| `--space-8` | `56px` |
| `--tap` | `44px` |

`--tap` is the floor a finger needs. Icon-only controls get it as a minimum box even where the glyph inside is 15 px (WCAG 2.5.5). Nothing interactive is smaller.

## Layout

| Token | Value | Only for |
|---|---|---|
| `--filter-h` | `132px` | Height of the filter bar on the map tab |
| `--panel-w` | `440px` | Width of the desktop detail panel |
| `--bottom-nav-h` | `86px` | Height of the phone bottom nav; set to `0px` where the nav is hidden |

Radius in shipped CSS is 6 px on controls and 10 to 12 px on cards, with `999px` only on real status chips and round icon buttons. Borders are `1px solid var(--rule)` on anything a user can type into or click and `var(--rule-soft)` for hairlines inside an object. Lists get hairlines, objects get borders. The content column caps at 1180 px.

## Interaction

Focus: `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible`. Inputs may swap the outline for `border-color: var(--accent)` but never ship `outline: none` without one of the two.

Motion: transitions under 300 ms on transform and opacity only, and every transition and animation has a `prefers-reduced-motion: reduce` branch that sets it to `none`.

Buttons: height `--tap`, radius 6 px, sentence case, verb first, one primary per view. Primary is `--accent` filled with white text; an active toggle is `--ink-fill` with white text; secondary is transparent with a `--rule` border.

## Components

**Suitability strip (T360, accepted on owner instruction 2026-10-03).** A strip under a trip hero is a solid `--paper` band at full opacity, flush against the bottom edge of the hero, with a `--rule` border and square corners where it meets the photo. No alpha, no gradient, no text over the photograph. It holds exactly three cells in fixed order: difficulty, style, total cost. Difficulty is five small squares, filled `--ink` up to the level and outlined `--ink-mute` beyond it (never `--rate` or `--accent`), plus the level as a word. Style is one or two words from the trip's tags. Total cost is in the mono face with the currency. A missing value shows a placeholder word ("Unrated", "Mixed", "Price on request") so every trip shows three cells. It stays one row of three on a phone. Built as `.jstrip` in `src/styles/25-feature-pages.css`; no new token.

**Secondary chrome (T360).** The "Get a pass" chip in the desktop bar is transparent with a `--rule` border and 6 px radius. The phone's round plus button is `--bg-card` with a `--rule` border, `999px` radius and a `--tap` or larger target. Neither is `--accent` filled, which leaves the accent for each page's one primary action.

## Before you ship

Read the diff and answer these seven questions, from the carta-design skill.

1. Any hex value outside `src/styles/01-tokens.css`? (`node scripts/ci/design-lint.mjs` checks this.)
2. Any gradient, any colour not in this file, any second saturated hue beside `--accent`?
3. Is ochre used for anything but a rating, teal for anything but a gem, `--danger` for anything but destruction?
4. Is any mono text prose rather than a measured fact, or any column number set in sans?
5. More than one primary button in a view?
6. Does every headline contain a verb or a number, and is the diff free of em dashes and the banned words?
7. Remove one thing. There is almost always one decoration that is carrying nothing.

Last synced with `src/styles/01-tokens.css`: 2026-10-03 (T191). No hex literal remains outside the token file; the design lint baseline carries zero `hex-literal` entries.
