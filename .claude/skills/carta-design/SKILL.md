---
name: carta-design
description: The locked design system for Carta, the European budget travel price app at carta-europetravel.com. Use this skill whenever you touch anything visual in the Carta codebase or write any Carta copy, including landing pages, marketing sections, app UI, React or HTML components, buttons, forms, cards, tables, charts, map overlays, emails, Open Graph images, favicons, icons, empty states, error states and CSS. Also use it whenever you are about to pick a colour, a font, a border radius or a shadow, or write a headline, a button label, an error message or an empty state for Carta, even if the request never mentions design at all. If a human will see the output, read this first.
---

# Carta design system

> Rewritten 2026-10-03 (T325) to match the decided state in `DESIGN.md` at the repo root and the
> typography decision of T198. The earlier body taught a cool-grey "Timetable" palette (`--signal`
> blue, Instrument Sans, IBM Plex Mono, no serif anywhere). That palette was built for the landing
> page and then reverted, and it is gone from this file. Values below are copied from the `:root` of
> `continent-app/src/styles.css`. If a value here disagrees with that file, the stylesheet ships and
> this file is wrong; fix this file. T191 (the CSS refactor) may rename tokens, so check names
> against `:root` before relying on them.

## Why this file exists

Carta once had a homepage that looked machine generated, because defaults accumulated one component
at a time. The generic look comes back the same way: in a hurry, when nobody is looking at the whole
page. The rules below are not suggestions to weigh against convenience. Deviating from them needs a
reason you could defend out loud. Read `PRODUCT.md` and `DESIGN.md` first; this file is the judgement
layer on top of them.

## What Carta is

A price transparency tool for budget travel in Europe. You give it dates and a departure airport and
it prices the whole trip for each destination: accommodation, food, local transport and the fare you
enter yourself. Then it plans the trip and each day. Carta does not price flights from a live source.
Never imply that it does.

The audience is people counting money. The only real asset is trust in the numbers, so the look
follows: warm and calm like a paper atlas, precise like an itemised receipt. When a decision is
genuinely open, ask what a good map key or a receipt would do.

## Colour

Warm alabaster ground, deep slate ink, one terracotta accent. The app is single theme: no
`prefers-color-scheme` blocks and no dark variants exist. Reference custom properties, never a hex.
The full table with the one job of each token is in `DESIGN.md`; the ones you will reach for:

| Token | Value | Only for |
|---|---|---|
| `--paper` | `#f8f6f0` | Page ground, and text on a dark fill |
| `--paper-dim` | `#efece2` | Alternating grounds, input fills |
| `--bg-card` | `#ffffff` | Card fill, the only pure white |
| `--ink` | `#0f172a` | Body text, headings, dark surfaces |
| `--ink-soft` | `#414b5e` | Secondary text |
| `--ink-mute` | `#7d8393` | Metadata and placeholders at 12 to 14px, never body |
| `--ink-fill` | `#2b3446` | Fill behind an active control |
| `--rule`, `--rule-soft` | `#ccc7b8`, `#e2ded1` | Borders and dividers; hairlines inside a card |
| `--accent` | `#e05a47` | Terracotta: actions, alerts, live route, focus rings |
| `--accent-soft`, `--accent-bg` | `#e97f6b`, `#f7dcd4` | Hover borders; tinted callouts |
| `--rate`, `--rate-soft`, `--rate-bg` | ochre | Ratings as a measure. Never actions |
| `--green` | `#4a6a3a` | Good news in data. Never chrome, never a button |
| `--danger`, `--danger-dark` | `#b3372a`, `#96291e` | Destructive actions only |
| `--status-success` | `#10b981` | Indicator dots and ticks. Never text |
| `--gem-ink`, `--gem-bg` | teal | Hidden gems and nothing else |
| `--kind-*` | ink ramp | Place kind, metro to area: weight, not hue |

Rules that matter more than the list:

**One saturated colour.** `--accent` is the only saturated colour in normal use. If a design feels
flat, fix contrast and spacing, not the hue count.

**Ochre is a measure, teal is a gem, red is destruction.** Ratings are never terracotta, because
"Rome 9.5" in a red bubble reads as an error. `--danger` exists because terracotta cannot also mean
"this erases everything", so nothing else may use it. Teal belongs to hidden gems and nothing else.

**Green is data, never chrome.** `--green` and `--status-success` appear in data and indicators. A
green button is not a thing Carta has.

**Warm neutrals are the house ground.** The old ban on cream is retired: `--paper` is the ground. What
stays banned is inventing a new warm tint beside the tokens.

**Three shadows exist, all ink at low alpha** (`--shadow-1`, `--shadow-2`, `--shadow-card`). No other
shadow. No gradients anywhere.

## Type

Three faces, each through its token and never by name. Decision recorded by T198.

```
--display  Fraunces (serif)        display headings and destination names only
--ui       Plus Jakarta Sans       everything else: body, labels, buttons, prose
--mono     JetBrains Mono          measured facts only
```

`scripts/ci/design-lint.mjs` (rule `font-literal`) fails any `font-family` outside `:root` that is not
`var(--display)`, `var(--ui)`, `var(--mono)` or `inherit`. Cormorant Garamond, Instrument Sans and IBM
Plex Mono are rejected. Fonts are self-hosted (T199); load nothing from a Google host.

**One serif, one role.** Fraunces is the only serif and appears only at display sizes (weights 400 to
700). It is never used for running text, buttons, labels or numbers. The old line "no serif anywhere"
is retired.

**The mono rule.** `--mono` carries machine readable facts and nothing else: prices, dates, times,
durations, distances, airport codes, counts, percentages, coordinates. Prose is always `--ui`. A number
inside a sentence is set in `--ui`; a number in a column, a receipt line or a pin is set in `--mono`
with `font-variant-numeric: tabular-nums`. A decorative uppercase mono eyebrow spends the signal on
nothing, so do not write one. If in doubt, use `--ui`.

Body is `--ui` at 14px, line-height 1.45, `--ink`. Two weights in normal use, 400 and 600; 500 on
button labels and table values. Never 700 outside the wordmark and Fraunces display. Format prices
through `Intl.NumberFormat` with two decimals, never raw float output.

## Layout and spacing

- Spacing: `--space-1` to `--space-8` (4, 8, 12, 16, 22, 30, 40, 56px) for new and touched rules.
  `--tap` (44px) is the floor for anything interactive, icon-only controls included. One exception
  (owner, 2026-10-07): on a fine pointer (`@media (pointer: fine)`) a compact control such as the
  small Button may be 32px high. On a coarse pointer it is always `--tap`.
- Radius: 6px on controls, 10 to 12px on cards. `999px` only on real status chips and round icon
  buttons.
- Borders: `1px solid var(--rule)` on anything a user can type into or click; `var(--rule-soft)` for
  hairlines inside an object.
- Lists get hairlines, objects get borders. Divide a run of related facts with rules; reach for a card
  only when the thing inside is a bounded object: a receipt, a plan, a destination.
- The content column caps at 1180px. Layout tokens: `--filter-h`, `--panel-w`, `--bottom-nav-h`.
- Responsive down to 380px with no horizontal scroll.

## Components

**Buttons.** Height `--tap`, radius 6px, sentence case, verb first. Primary is `--accent` filled with
white text; an active toggle is `--ink-fill` with white text; secondary is transparent with a `--rule`
border. One primary per view. Two primaries mean neither is the answer.

**Inputs and the search strip.** The search strip is the most important control, modelled on an airline
booking bar: one bordered row divided into fields by hairlines, a small label above a value, the submit
button in the last cell. It collapses to a two column grid on phones with the button spanning full
width. Placeholders show a real valid example, never a repeat of the label.

**The receipt.** Carta's signature element. Use it wherever a total needs justifying: a `--paper-dim`
header with destination and route, one hairline separated line per cost component with the figure right
aligned in `--mono`, a `2px solid var(--ink)` rule above the sum, the sum in `--mono`, and an
`--accent-bg` footer showing what one changed input would do to the total. Never round line items to
look tidier. `24.99` is the point; `25` is a different product.

**Price pins.** City in `--ui`, price in `--mono`. The single cheapest pin is the one emphasised pin in
a view.

**Verdict and rating chips.** Ochre (`--rate`, `--rate-bg`). Hidden gems get the teal badge. Place kind
is the ink ramp, never a rainbow.

**Plan cards.** Equal weight. The recommended plan is marked with an `--accent` border and a badge and
keeps the same background as the other. Never dim the free plan. State limits as plain numbers.

**Cards in general.** `--bg-card` fill, `1px solid var(--rule-soft)` or `--rule`, radius 10 to 12px,
`--shadow-card` at most.

**Suitability strip.** Under a trip hero, a solid `--paper` band at full opacity, flush with the photo's bottom edge, `--rule` border, square corners where it meets the photo. No alpha, no gradient, no text over the photo. Exactly three cells in fixed order: difficulty (five squares, filled `--ink` up to the level, outlined `--ink-mute` beyond it, never `--rate` or `--accent`, plus the level as a word), style (one or two words from tags), total cost (mono face, with currency). A missing value shows a placeholder word ("Unrated", "Mixed", "Price on request") so every trip shows three cells. One row of three on a phone.

**Secondary chrome.** The desktop "Get a pass" chip and the phone's round plus button are secondaries (transparent or `--bg-card` with a `--rule` border; 6 px radius on the chip, `999px` on the round icon button, 44 px minimum target). The accent is kept for each page's one primary action.

The rules below were decided by the owner on 2026-10-07 and written down by T362.

**InfoDot.** One glossary marker for the whole product. A 6 px filled `--ink-mute` dot set after the term or figure it explains, inside a real `<button>` with a `--tap` box and an aria-label that names the term ("What measured means"). It opens a popover: `--bg-card`, `1px solid var(--rule)`, 10 px radius, `--shadow-2`, at most 280 px wide, the term in `--ui` 600 and one or two sentences in `--ui` 13 px `--ink-soft`. The text comes from the shared glossary, never written per screen. Escape, a second tap or a tap outside closes it, and focus returns to the dot. One dot per term per view, on the first occurrence. Never on a heading, a button label or a price pin, and never an "i" in a circle.

**Day track.** Day by day may run as a horizontal track. One card per day, `scroll-snap-type: x mandatory`, about 85 percent of the width on a phone so the next card shows, three cards across from 1024 px. Above the track, right aligned: the position in `--mono` ("Day 3 of 7") and two secondary buttons, Previous and Next, each `--tap`. Arrow keys move one card when the track has focus. Under the track, position dots: 6 px, `--rule`, the current one `--ink-fill`, hidden from screen readers because the counter says the same. No autoplay, no looping, no momentum tricks. Under `prefers-reduced-motion` the track jumps instead of scrolling smoothly. Every day stays reachable as a link from the page's own list or rail.

**Flashcards.** Advisory sections may run as a deck, one card visible at a time. The card is `--bg-card` with a `1px solid var(--rule)` border and square corners, which marks it as a deck card and not an object card. Under it: Previous and Next as secondary buttons and the position in `--mono` ("2 of 5"). Swiping is a shortcut for those buttons, never the only way, and arrow keys do the same. A "Show all" link turns the deck into a plain list, and printing shows the list. No flip, no 3D, no stacked-card shadows; a transform transition under 300 ms with a reduced-motion branch.

**Sticky section rail.** At most one per page, and only when the page has three or more sections. It sticks below the top chrome once the hero has scrolled away: a `--paper` band, height `--tap`, a `1px solid var(--rule)` bottom border, no shadow. Section links in `--ui` 13 px `--ink-soft`, scrolling sideways on a phone. The section in view is an `--ink-fill` pill with `--on-fill` text and a 6 px radius, never `--accent`. Each link is a real `<a>` to the section's anchor.

**Lifestyle control.** There is one Lifestyle control: the existing Lifestyle panel. A surface that lets the traveller change how they travel opens or embeds that control; it never builds a second slider. Where it is shown as a slider it is stepped, one stop per existing level, each stop labelled with its word, and the figures it drives update in place. One sentence in `--ui` under it states the trade-off in plain words with the figure.

**The cost bar.** A receipt may carry one stacked bar as a summary above its lines, never in place of them. 8 px high, the full width of the receipt, one segment per receipt line in receipt order, in the ink ramp (`--kind-*`), separated by 1 px `--paper` gaps. No `--accent`, no legend, no percentages on the bar: each receipt line already carries its figure. A line marked as an estimate keeps its marker in the receipt; the bar does not repeat it.

**No bento grid.** Detail pages do not use tiles of mixed sizes. Slot 6 of the detail skeleton is the collapsed row list (T164).

**Modal dialogs.** Every modal dialog has a scrim: `--ink` at 28 percent behind it, as `.lifestyle-scrim` draws it, and the page behind takes no clicks. This holds for the Lifestyle dialog on every tab.

**Install hint.** Carta may suggest adding the web app to the home screen in one place only: one line with a secondary button ("Add to home screen") in My trips, shown on a phone browser that is not already running the installed app, after the traveller has saved a trip. Dismissed once, it never returns. Never a modal, never on the first run, never a banner over content.

## Interaction

Focus: `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible`. Inputs may swap the
outline for `border-color: var(--accent)`; never ship `outline: none` without one of the two. Motion:
transitions under 300ms on transform and opacity only, and every transition and animation has a
`prefers-reduced-motion: reduce` branch that sets it to `none`.

## Copy

- Every headline carries a verb the user recognises or a number. "What the whole trip actually costs"
  works. "Everything the price tag usually hides" could sit on any product.
- Prefer the specific figure to the claim.
- **No em dashes, ever.** Use a comma, a colon, or two sentences. No middot or bullet separators.
- Banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.
- Sentence case everywhere. No terminal punctuation on labels, buttons or headings. Body copy and helper
  text take full stops.
- Active voice, verb first. A button that says "Save trip" produces "Trip saved."
- Errors say what happened and what to do, in one sentence, with no apology and no "Error:" prefix.
- Empty states are an invitation, not an apology. Name the space and give the action.
- Be honest about coverage in the product's own voice. Carta does not price flights; the fare is the
  traveller's own entry. State limits plainly: that is what makes the accurate numbers believable.

## Never do this

1. Pastel rounded squares behind line icons. Icons are 20px, 1.5px stroke, `--ink-soft`, no tile.
2. A row of three stat counters as a hero device. Put the number in a sentence that says why it matters.
3. Gradients of any kind, especially dark navy to plum on a call to action. Flat `--ink` instead.
4. Decorative uppercase mono eyebrows. See the mono rule.
5. Numbered markers `01 / 02 / 03` unless the order carries information the reader needs.
6. Scroll triggered counters, marquees, parallax, or fade-in-on-scroll on every section.
7. AI generated photographs of European cities. The claim is accuracy; license photography or use real
   map tiles.
8. Stock illustration of people with laptops, and any 3D or glossy icon.
9. Fabricated social proof. Data freshness is the proof Carta has.
10. A hardcoded hex, font name or pixel spacing in a component when a token exists; a second saturated
    hue beside `--accent`; any colour not in `DESIGN.md`.

## Quality floor

- Responsive down to 380px with no horizontal scroll.
- Visible keyboard focus (see Interaction).
- `prefers-reduced-motion: reduce` respected on every transition.
- Headings in order, one `h1`, real `<a>` for navigation and real `<button>` for actions.
- Text contrast at least 4.5:1. `--ink-mute` is for metadata at 12 to 14px, never body copy.
- Tap targets at least `--tap` (32px allowed on a fine pointer only, see Layout).

## Before you ship

Read the diff and answer these seven questions (the same seven are at the end of `DESIGN.md`):

1. Any hex value outside the `:root` of `styles.css`?
2. Any gradient, any colour not in `DESIGN.md`, any second saturated hue beside `--accent`?
3. Is ochre used for anything but a rating, teal for anything but a gem, `--danger` for anything but
   destruction?
4. Is any mono text prose rather than a measured fact, or any column number set in sans?
5. More than one primary button in a view?
6. Does every headline contain a verb or a number, and is the diff free of em dashes and the banned
   words?
7. Remove one thing. There is almost always one decoration that is carrying nothing.
