# Carta design tokens

This is the deterministic design system for Carta: the exact values the shipped app runs on, with the one job each value has. Read it after PRODUCT.md and before writing any CSS, JSX, HTML, email or image for Carta. Treat every value here as a rule, not a suggestion. If a design needs something this file does not define, that is a task to raise, not a value to invent.

The source of truth is the `:root` block of `continent-app/src/styles.css`. This file is a record of it, kept in step by hand; when the two disagree, `styles.css` is what ships and this file is wrong. Never hardcode a hex, a font name or a pixel spacing in a component: reference the custom property.

The carta-design skill (`.claude/skills/carta-design/SKILL.md`) still governs structure, the mono rule, the receipt, the search strip, the copy rules, the "never do this" list and the quality floor. Its banner of 2026-07-28 declares the palette and type below as the decided state. The skill's older body (cool-grey Timetable palette, `--signal` blue, Instrument Sans, IBM Plex Mono, "no serif anywhere", `assets/tokens.css`) was built for the landing page and reverted; it contradicts the banner and this file, and this file wins on colour and type. T198 recorded the typography decision under Type below; T325 rewrites the skill body to match.

## Colour

Warm alabaster ground, deep slate ink, one terracotta accent. The app is single-theme: there are no `prefers-color-scheme` or `data-theme` blocks, and no dark variants of these tokens exist.

### Paper and ink

| Token | Value | Only for |
|---|---|---|
| `--paper` | `#f8f6f0` | The page ground, and the text colour on a dark fill |
| `--paper-dim` | `#efece2` | Alternating section grounds, input fills, a quiet band on paper |
| `--bg-card` | `#ffffff` | Card fill. The only pure white in the product |
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

## Before you ship

Read the diff and answer these seven questions, from the carta-design skill.

1. Any hex value outside the `:root` of `styles.css`?
2. Any gradient, any colour not in this file, any second saturated hue beside `--accent`?
3. Is ochre used for anything but a rating, teal for anything but a gem, `--danger` for anything but destruction?
4. Is any mono text prose rather than a measured fact, or any column number set in sans?
5. More than one primary button in a view?
6. Does every headline contain a verb or a number, and is the diff free of em dashes and the banned words?
7. Remove one thing. There is almost always one decoration that is carrying nothing.

Last synced with `styles.css` `:root`: 2026-10-01 (T195). Known drift at that date: 378 hex literals live outside `:root` in `styles.css`; T191 (design tokens and CSS modules) owns bringing them onto the tokens.
