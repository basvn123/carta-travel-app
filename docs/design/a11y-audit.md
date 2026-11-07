# Accessibility audit (ROADMAP G10)

The standing record of Carta's WCAG 2.2 AA audit. The full task report with every node is `Execution/P15/T1128-accessibility.md`; this page keeps the method, the current result and what is left.

## Method

- **Automated:** `continent-app/scripts/verify_axe.mjs` runs axe-core 4.14 (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) on each screen at 390 px and 1280 px. Exit code 1 when any screen has a serious or critical violation (`--gate` changes the floor).
- **Keyboard:** the same script presses Tab up to 60 times per screen and records each stop: whether it shows a focus mark (outline or box-shadow on the element, or on a card that draws the ring with `:focus-within`), whether Tab left focus on the same element (stuck), and how often two stops in a row share a name.
- **Screens (15):** Home, Explore list, Explore map, Explore places (trips category), a place page (Bled), a trail page, a beach page, Plan start, the Plan wizard, the wizard review, the trip page (a built Italy trip), Account signed in (`?accountmock`), Account guest, Pricing, Admin (a faked admin session, every Supabase call answered locally).
- **Manual (owner):** a screen-reader pass on a real phone with VoiceOver and TalkBack (register T1128-a). Automated checks cannot judge what is heard.

Run it against a dev server; see the script header for the admin server and the options.

## Result on 2026-11-06 (T1128)

| | Before | After |
|---|---|---|
| Screen and width runs failing the serious gate | 21 of 30 | 0 of 30 |
| Serious or critical axe nodes | 94 | 0 |
| Tab stops without a focus mark | 2 | 0 |
| Tab stops stuck on the same element | 0 | 0 |

The rules that failed, and the fix pattern for each:

- **label-content-name-mismatch (WCAG 2.5.3).** A control's `aria-label` must contain the words it shows, in order. Two causes: labels that reword or reorder the visible text ("Stay in Ossuccio: find one" on a button that says "Find or add a stay"), and label and value spans with no space between them, so the visible text reads "FromBrussels". Rule: write the name as the visible words first, then any extra; put a space inside a span (not a bare space between flex or grid items, which has no box); where a link wraps a whole card, let the content name it.
- **aria-prohibited-attr.** No `aria-label` on a `<p>` or a generic `<span>`; use a visually hidden copy (`.sr-only`).
- **color-contrast.** White labels over the home film carried a soft shadow that measures as mid-grey; a hairline of full ink holds 4.5:1 without the film.
- **scrollable-region-focusable.** A region that scrolls sideways takes `tabIndex={0}` so a keyboard can scroll it.
- **role-img-alt.** An image role needs a name; an empty chart is decoration (`aria-hidden`).

## Still open

- Screen-reader pass on a real phone: T1128-a (owner).
- Pause for the home film and tour, WCAG 2.2.2: T1128-b (owner decision).
- Screens not yet in the script (day workspace, journey, cycling, lake, mountain, region, Together, DateField): T1128-c.
- Wizard country map keyboard layer: T1128-d (owner decision). Explore rails Tab cost: T1128-e. A CI workflow for the script: T1128-f. Ask Carta rows: T1128-g.
