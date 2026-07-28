---
name: carta-design
description: The locked design system for Carta, the European budget travel price app at carta-europetravel.com. Use this skill whenever you touch anything visual in the Carta codebase or write any Carta copy, including landing pages, marketing sections, app UI, React or HTML components, buttons, forms, cards, tables, charts, map overlays, emails, Open Graph images, favicons, icons, empty states, error states and CSS. Also use it whenever you are about to pick a colour, a font, a border radius or a shadow, or write a headline, a button label, an error message or an empty state for Carta, even if the request never mentions design at all. If a human will see the output, read this first.
---

# Carta design system

## Why this file exists

Carta had a homepage that looked machine generated. Not because any single choice was wrong, but
because the defaults accumulated: a cream background, a serif display face, a terracotta accent, pastel
tiles behind line icons, three stat counters, a gradient CTA block. Each one arrived separately and
looked harmless on its own.

That is the failure mode this file prevents. The generic look does not come back all at once. It comes
back one component at a time, in a hurry, when nobody is looking at the whole page. So the rules below
are not suggestions to weigh against convenience. Deviating from them needs a reason you could defend
out loud.

## What Carta is

A price transparency tool for budget travel in Europe. You give it your dates and your departure
airport, and it prices the entire trip for 1,570 destinations: flights, cabin bag, airport transfers,
accommodation, food, local transport. Then it plans the trip and plans each day.

The audience is people counting money. The product's only real asset is trust in its numbers, and the
whole visual language follows from that: **Carta should look like an instrument, not a brochure.**
Reference world: rail timetables, boarding passes, departure boards, itemised receipts, survey maps.
When a design decision is genuinely open, ask what a well made timetable would do.

## Colour

Paste `assets/tokens.css` and reference the custom properties. Never hardcode a hex outside that file.

| Token | Value | Only for |
|---|---|---|
| `--ink` | `#0E1116` | Body text, dark surfaces |
| `--ink-70` | `#4A525E` | Secondary text, supporting paragraphs |
| `--ink-45` | `#78818F` | Metadata, captions, placeholders |
| `--paper` | `#FFFFFF` | Page ground |
| `--panel` | `#F4F5F7` | Alternating section grounds, input fills |
| `--line` | `#E3E6EB` | Hairline dividers |
| `--line-strong` | `#C7CCD5` | Input borders, card borders |
| `--signal` | `#1E3FD6` | Interactive: links, primary buttons, focus rings, active states |
| `--signal-dark` | `#14309F` | Hover on signal |
| `--signal-wash` | `#EDF1FE` | Tinted callouts, selected rows |
| `--flag` | `#FFD54A` | The cheapest option. Nothing else |
| `--up` | `#0B7A5A` | A price went down, a status is live |
| `--down` | `#B3261E` | A price went up, a destination is unreachable |

Three rules that matter more than the list:

**One saturated colour.** `--signal` is the only saturated colour in normal use. If a design feels flat,
the fix is contrast and spacing, not a second hue. Do not introduce purple, teal, orange or pink, and
do not tint neutrals warm.

**`--flag` marks exactly one thing per view.** It means "this is the cheapest." The moment it also means
"new" or "popular" or "look here", it stops meaning anything, and a price product that cannot point at
the cheapest option has lost its most useful signal. One flag per view, no exceptions.

**Greys are cool, never warm.** Cream and beige grounds near `#F4F1EA` are banned outright. That
particular cream, combined with a serif headline and a clay accent, is the most recognisable generated
web look of the moment, and it is precisely what Carta was mistaken for.

`--up` and `--down` appear in data only, never in chrome. A green button is not a thing Carta has.

## Type

Two faces, and one rule about which is which.

```
Display and body   Instrument Sans   400, 500, 600
Data               IBM Plex Mono     400, 500, tabular numerals
```

**The mono rule.** IBM Plex Mono carries machine readable facts only: prices, dates, times, durations,
airport codes, counts, percentages, coordinates. Prose is always Instrument Sans. This is the single most
characteristic thing about Carta's type, and it works because it is informative rather than decorative:
seeing mono tells the reader "this is a measured number." Setting a decorative eyebrow label in uppercase
mono spends that signal on nothing and is the mistake the old site made. Section eyebrows may use mono
only when they are genuinely short labels, in `--signal`, at 11.5px with `0.11em` tracking, sentence
case. If in doubt, use the sans.

Always set `font-variant-numeric: tabular-nums` on prices and any number that appears in a column, so
figures line up and do not jitter when they update.

**No serif face anywhere.** Not in headlines, not in pull quotes, not "just for the hero." A serif
display face is half of the look this project is escaping.

Scale, tracking tightens as size grows:

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Page headline | `clamp(38px, 5.4vw, 66px)` | 600 | `-0.03em` |
| Section headline | `clamp(28px, 3.4vw, 40px)` | 600 | `-0.028em` |
| Subsection | 20px | 600 | `-0.02em` |
| Lede paragraph | 19px, `--ink-70` | 400 | `-0.005em` |
| Body | 17px, line-height 1.55 | 400 | `-0.005em` |
| UI label, small print | 14 to 15px | 400 or 500 | `0` |
| Metadata, mono | 12.5px, `--ink-45` | 400 | `0` |

Two weights in normal use, 400 and 600. Reach for 500 only on button labels and table values. Never 700
outside the wordmark. Headlines cap at roughly 15 characters per line so they break where you intend.

## Layout

- Radius: `6px` on controls, `10px` on cards. Nothing rounder. No pills except real status chips.
- Borders: `1px solid var(--line)` for dividers, `var(--line-strong)` for anything a user can type into
  or click. No rounded corners on single sided borders.
- **No shadows and no gradients.** Depth comes from one dark surface per page, not from elevation. If a
  card needs to separate from the ground, it gets a border or the ground changes to `--panel`.
- Container: `max-width: 1180px`, `padding: 0 32px`, dropping to `0 20px` under 900px.
- Section rhythm: `96px` vertical padding, `64px` on mobile. Two column sections alternate which side
  the visual sits on so the page has a pulse.
- **Lists get hairlines, objects get borders.** A run of related facts is divided by rules, not boxed
  into cards. Reach for a bordered card only when the thing inside is genuinely a bounded object: a
  receipt, a plan, a destination.

## Components

**Buttons.** Height 44px, or 52px for a page level call to action, 38px in the header. Radius 6px, 15px
label at weight 500, sentence case, verb first. Primary is `--signal` filled with white text, hovering to
`--signal-dark`. Secondary is transparent with a `--line-strong` border, hovering to `--panel` fill.
**One primary button per view.** Two primaries mean neither is the answer.

**Inputs and the search strip.** The search strip is Carta's most important control and it is modelled on
an airline booking bar: a single bordered row divided into fields by internal hairlines, each field a
mono uppercase micro label above a 16px weight 500 value, with the submit button occupying the last cell.
It collapses to a two column grid on mobile with the button spanning full width. Placeholders show a real
valid example, never a repeat of the label.

**The receipt.** Carta's signature element, and the clearest statement of what the product does. Use it
anywhere a total needs justifying. Structure: a `--panel` header with the destination and the route in
mono, one hairline separated line per cost component with the figure right aligned in mono, a `2px solid
var(--ink)` rule above the sum, the sum in mono at 34px weight 500, and a `--signal-wash` footer showing
what one changed input would do to the total. Never round the line items to look tidier. `€24.99` is the
point; `€25` is a different product.

**Price pins.** On the dark map: translucent white fill, `rgba(255,255,255,.18)` border, city in sans and
price in mono. The single cheapest pin is `--flag` filled with `--ink` text.

**Plan cards.** Two columns, equal weight. The recommended plan gets `2px solid var(--signal)` and a
`--signal-wash` badge, and keeps the same background as the other. Never dim or grey out the free plan.
State limits as plain numbers: "three saved trips," not "limited trips."

**Cards in general.** `--paper` fill, `1px solid var(--line)`, radius 10px, padding `24px`.

## Copy

Words are design material here, and the old site's copy was as templated as its palette.

- Every headline carries a verb the user recognises or a number. "What the whole trip actually costs"
  works. "Everything the price tag usually hides" does not, because it could sit on any product.
- Prefer the specific figure to the claim. `1,208 of 1,570 destinations priced from Charleroi, refreshed
  2 hours ago` outperforms any adjective, because it sounds like software that is actually running.
- **No em dashes.** Use a comma, a colon, or two sentences.
- Banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.
- Sentence case everywhere. No terminal punctuation on labels, buttons or headings. Helper text and
  body copy do take full stops.
- Contractions are fine. Active voice, verb first. A button that says "Save trip" produces "Trip saved."
- Errors say what happened and what to do, in one sentence, with no apology and no "Error:" prefix.
  "That airport has no low cost routes on those dates. Try a wider window."
- Empty states are an invitation, not an apology. Name the space and give the action.
- Be honest about coverage in the product's own voice. Four airlines and estimated food costs are
  facts to state plainly, not weaknesses to bury. Stating them is what makes the accurate numbers
  believable.

## Never do this

Each of these has been tried on this project and read as generated.

1. Cream or beige grounds. Any warm neutral. Cool greys only.
2. A serif display face, anywhere, for any reason.
3. Terracotta, clay or coral accents near `#D97757`.
4. Pastel rounded squares behind line icons. Icons are 20px, 1.5px stroke, `--ink-70`, no tile.
5. A row of three stat counters as a hero device. If a number matters, put it in a sentence that
   explains why it matters.
6. Gradient blocks, especially dark navy to plum on a call to action. Flat `--ink` instead.
7. Decorative uppercase mono eyebrows. See the mono rule.
8. Numbered markers, `01 / 02 / 03`, unless the content is a real ordered sequence where order carries
   information the reader needs.
9. Scroll triggered counters, marquees, parallax, or fade-in-on-scroll on every section. One deliberate
   moment beats scattered effects, and scattered effects are themselves a tell.
10. AI generated photographs of European cities. The product's claim is accuracy, and a plausible but
    wrong skyline undermines it faster than any layout flaw. License photography or use real map tiles.
11. Stock illustration of people with laptops, and any 3D or glossy icon.
12. Fabricated social proof. Carta has no testimonials yet. Data freshness is the proof it does have.

## Quality floor

Not optional and not worth announcing in the UI:

- Responsive down to 380px with no horizontal scroll.
- Visible keyboard focus, `0 0 0 2px var(--signal)` with an offset, never `outline: none` without a
  replacement.
- `prefers-reduced-motion: reduce` respected on every transition.
- Headings in order, one `h1`, real `<a>` for navigation and real `<button>` for actions.
- Text contrast at least 4.5:1. `--ink-45` is for metadata at 12 to 14px and never for body copy.
- Prices formatted through `Intl.NumberFormat` with two decimals, never raw float output.

## Before you ship

Read the diff and answer these:

1. Any hex value outside `tokens.css`?
2. Any warm neutral, serif face, gradient or shadow?
3. Is `--flag` used more than once in one view?
4. Is any mono text prose rather than a measured fact, or any number set in sans?
5. More than one primary button in a view?
6. Does every headline contain a verb or a number, and is the page free of em dashes and the banned
   words?
7. Remove one thing. There is almost always one decoration that is carrying nothing.
