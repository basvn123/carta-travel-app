# Carta, the product in one page

Read this before DESIGN.md and before any task that touches a screen, a string or a number the traveller sees. It is the durable product truth: who Carta is for, what they are doing when they use it, how it speaks and what it owes them. CLAUDE.md points here so every session starts from the same facts instead of guessing them.

DESIGN.md holds the tokens. This file holds the reasons the tokens look the way they do.

## What Carta is

A price transparency tool for budget travel in Europe. Carta prices the ground for every destination in the catalogue: the bed, food and local transport, per person per day. It does not price flights. A traveller who has a fare types in what they paid, and only then does the full-trip total include the flight, as their own figure. Carta then plans the trip city by city and each day hour by hour, and it says plainly which numbers are measured and which are estimates.

The catalogue is master data in `app_data/app_data.json` and grows with every ingest (3,868 destinations in 43 countries on 2026-10-01; do not copy that figure into UI, read `meta` instead). The app is Vite + React in `continent-app/`, served as static JSON from a CDN. Nothing on the map is live-searched; everything is precomputed by the pipeline and cached.

Live at carta-europetravel.com. Six languages: English, Dutch, French, German, Spanish and Italian, on every surface including the PDF, KML and ICS exports.

## Who it is for

People counting money. The core audience is budget-conscious travellers inside Europe: students, young workers, families on one income, retirees on a fixed one, anyone who starts from "what can I afford" rather than "where do I want to go". They fly low-cost carriers from secondary airports, they take the bus from the airport, they sleep in dorms, private rooms and small apartments, and they care about the difference between €24.99 and €25.

They are not a luxury audience and Carta does not pretend otherwise. A premium feel comes from precision and honesty, not from the vocabulary of luxury travel.

Two secondary audiences shape the surfaces: travellers in the planner who already know the destination and want the days and the ground legs priced, and returning users with a saved trip who want to see what changed since last time.

## What they are doing

Comparing dense pricing matrices. The central act is reading many prices at once and finding the cheapest honest option for a fixed set of inputs (origin, dates, group size, lifestyle). That decides the operational context.

The map shows every destination pinned with its total for the traveller's inputs. The receipt itemises one total line by line. The planner prices every leg of a multi-city route by mode. The day planner builds a clock-based day from the POI catalogue. Each is a table of measured numbers first and a picture second.

Prices change meaning with the inputs, so the inputs are always visible and the figures update in place. Numbers must line up in columns and must not jitter when they change. A figure is never rounded to look tidier.

Density is a feature. The traveller wants to see forty prices on one phone screen and still tell them apart. Whitespace is spent on separating groups, not on making a card feel generous.

## The one rule the numbers follow

Real harvested quote, then cached third-party quote, then model estimate, and never a blank. Each step is labelled for what it is. A harvested fare shows its source and age. A cached quote carries its expiry. An estimate is prefixed with a tilde, tagged "est." and never dressed up as a bookable price. An estimate ships only where a flight verifiably exists. Every external booking link warns that prices may have changed.

Carta does not price flights (owner decision, 2026-10-02). No fare harvest has been live since 2026-10-01, and none is planned. The only flight figure in a total is one the traveller typed in, labelled as theirs. Surfaces that still show the frozen fare snapshots as estimates are being removed (register row T272-a); until then they must keep the tilde and "est.".

The product's only real asset is trust in its numbers. Every visual and copy choice follows from that.

## Brand voice

Carta should sound like an instrument, not a brochure. Reference world: rail timetables, boarding passes, departure boards, itemised receipts, survey maps. When a copy decision is open, ask what a well made timetable would say.

Plain, specific, verb first. Every headline carries a verb the traveller recognises or a number. "What the whole trip actually costs" works; "Everything the price tag usually hides" could sit on any product and so does not.

Prefer the figure to the claim. "Bed prices measured in N of M destinations, refreshed 2 hours ago" beats any adjective because it sounds like software that is running.

Honest about coverage, in its own voice. Four carriers and estimated food costs are facts to state, not weaknesses to bury. When the AI is off, the app says it is off. Carta has no testimonials; data freshness is the proof it has.

Sentence case everywhere. No terminal punctuation on labels, buttons or headings; helper text and body copy take full stops. Contractions are fine. Active voice. A button that says "Save trip" produces "Trip saved."

Errors say what happened and what to do, in one sentence, with no apology and no "Error:" prefix. Empty states are an invitation, not an apology: name the space and give the action.

No em dashes and no en dashes, anywhere, ever: a comma, a colon or two sentences instead. `stripDashes()` in `continent-app/src/lib/format.js` enforces this at build time on every shipped string, and the rule applies equally to source, docs and reports. Middle dots and bullet characters as separators are banned too.

Banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.

## Accessibility constraints

These are not optional and are not announced in the UI.

Touch. Every control is at least 44 by 44 px (`--tap`), including icon-only buttons whose glyph is 15 px. Phones are first-class: the layout holds down to 360 px wide with no horizontal scroll, and bottom-nav labels shrink before they truncate in the longest translations.

Contrast. Body text is `--ink` on `--paper`. Secondary text is `--ink-soft`; `--ink-mute` is for metadata at small sizes and never for body copy. Every token pair the product uses as text or fill clears WCAG AA 4.5:1, and the ratios are written next to the tokens in `continent-app/src/styles.css`. Ratings use ochre, not the action red, so a measure is never read as an alarm.

Colour is never the only carrier. The place-kind hierarchy is an ink-density ramp so it survives greyscale and colour-blind viewing. Estimates carry a tilde and "est." in text, not only a colour. Good news in data (`--green`) and destructive actions (`--danger`) are each backed by words.

Focus and keyboard. Visible focus on every interactive element, `outline: 2px solid var(--accent)` with an offset. `outline: none` is never shipped without a replacement. Every `aria-modal` overlay traps focus through `useFocusTrap` and closes on Escape. Navigation is a real `<a>`, actions are a real `<button>`, headings stay in order with one `h1` per view.

Motion. `prefers-reduced-motion: reduce` is honoured on every transition and animation. Animations stay under 300 ms and animate only transform and opacity. No parallax, no scroll-triggered counters, no bounce.

Language. The document language follows the chosen UI language. Strings are never built by concatenation; they go through the i18n keys so word order survives translation.

Numbers. Prices are formatted through `Intl.NumberFormat` with two decimals, set in `--mono` with `font-variant-numeric: tabular-nums`, never raw float output.

Single theme. The app is deliberately light-only: there are no `prefers-color-scheme` or `data-theme` blocks, and `theme-color` is `--paper`. Do not add a dark mode as a side effect of another task.

## Where the facts live

| Fact | Source of truth |
|---|---|
| Design tokens | `continent-app/src/styles.css` `:root`, recorded in DESIGN.md |
| Design rules, copy rules, the "never do this" list | `.claude/skills/carta-design/SKILL.md` |
| Pass pricing | `continent-app/src/lib/pricing.js` TIERS |
| Catalogue size and schema | `app_data/app_data.json` `meta`, `docs/SCHEMA.md` |
| Provenance chain | `docs/1.CARTA.md` |
| Fare model | `docs/ESTIMATION.md` |
| Licences and credits | `docs/tos/data_licenses.md` |

Last reviewed: 2026-10-01 (T195).
