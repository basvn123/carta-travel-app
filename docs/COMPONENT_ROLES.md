# Component roles: which outside library to read for what, and how a lifted component becomes Carta's

This is the standing rule for bringing a component from an outside UI library into Carta. It was written by T197 on 2026-10-02. It adopts nothing. It decides which library is worth reading for which job, what a component has to go through before it ships, and which libraries stay out.

Read PRODUCT.md, DESIGN.md and the carta-design skill first. When this file and the skill disagree, the skill wins; on colour and type, DESIGN.md records what the skill's banner decided.

## Why roles and not one library

Every popular React registry has a recognisable house look. Install one wholesale and the app reads as that library's demo. Mixing them by job spreads the risk, but it does not remove it: five house looks are still not Carta's look. So the rule has two halves. Each role names one library as the place to read for structure and behaviour. Nothing from any of them ships until it has been rewritten onto Carta's tokens and passes the checks at the end of this file. Taking a library's look as well as its structure is how the generated aesthetic gets back in, one component at a time.

## What Carta can take, given its stack

Carta is React 18.3 on Vite with five runtime dependencies (React, React DOM, Supabase, MapLibre, jsPDF) and one hand-written stylesheet, `continent-app/src/styles.css`. There is no Tailwind, no CSS-in-JS, no headless primitive library and no animation library. Every library this file names assumes at least Tailwind, and most assume a primitive or motion package as well.

| Library | What its components assume | Can Carta install it as it stands |
|---|---|---|
| shadcn/ui | Tailwind, Radix primitives, class-variance-authority, clsx, tailwind-merge, lucide icons. New projects get Tailwind v4 and React 19 builds that pass `ref` as a plain prop, which React 18 does not forward | No |
| Origin UI, now coss ui | Tailwind. The legacy Origin snapshot sits on Radix in the shadcn style; coss ui moved to Base UI primitives | No |
| Magic UI | Tailwind and the `motion` package, delivered through the shadcn registry | No |
| Motion Primitives | Tailwind and the `motion` package | No |
| Aceternity UI | Tailwind and `motion`, with some effects on canvas or WebGL | No |

So "adopt" in Carta means one thing: read the reference component for its markup, its keyboard model and its ARIA, then write a plain React 18 component that keeps those and throws away the styling, and style it in CSS against the `:root` tokens. No package comes along. Adding Tailwind is T199's question and adding any dependency is a separate decision with its own task; neither is settled here, and a lifted component must not quietly assume either.

## The role map

Each row names the role, the library to read for it, what Carta already has in that role, and what that reading is for.

| Role | Read | Carta already has | What to take, what to leave |
|---|---|---|---|
| Foundational primitives: buttons, text inputs, selects, dialogs, forms | shadcn/ui | `Dropdown.jsx` (used by four surfaces), `DateField.jsx`, `OriginPicker.jsx`, `CountryPicker.jsx`, `browse/SheetShell.jsx` with `hooks/useFocusTrap.js`. No shared button component: 90 distinct `*btn*` / `*button*` class families in `styles.css` | Take the keyboard and focus model, the `aria-*` wiring and the variant idea (one component, a few named variants). Leave the zinc palette, `rounded-md`/`rounded-xl`, `shadow-sm`, `ring` focus and every `dark:` class |
| Dense operational surfaces: filters, budget and range sliders, admin tables | Origin UI / coss ui | `FilterControls.jsx` (the dual range slider), `browse/FilterChips.jsx`, `browse/PlacesFilterSheet.jsx`, `browse/ExploreFilterRail.jsx`, `browse/LifestylePanel.jsx`, five admin tables under `components/admin/`, the receipt in `CostSummary.jsx` and `planner/ExpenseLedger.jsx` | Take the density, the dual-thumb slider's ARIA and the table's sort and header semantics. Leave the decoration. Numbers in these surfaces go in `--mono` with tabular numerals, which no library does for you |
| Pricing tier cards | Magic UI | `PassModal.jsx` with tiers from `lib/pricing.js` | Take the comparison layout only. Leave the shine borders, animated gradients, number tickers and marquees: carta-design bans all four |
| Bento grids for destinations | Magic UI, read with care | `browse/ExploreRails.jsx`, `browse/JourneysSection.jsx` | Usually do not. A bento of boxed tiles is a run of related facts drawn as cards, and carta-design says lists get hairlines while only bounded objects get borders. Use one where each tile really is an object, a destination or a plan, and never as the page's main device |
| Feedback and transitions: success states, sheet and route changes, hover | Motion Primitives | 40 `@keyframes` and 44 `prefers-reduced-motion` blocks in `styles.css`; three skeleton loaders (`ExploreRails`, `CountryBrief`, `DayTripCards`) | Take the timing and the choice of what moves. Rebuild it in CSS on `transform` and `opacity`, under 300 ms, with a reduced-motion branch. Do not bring in `motion`; CSS already covers every case Carta has |
| Cinematic hero, destination spotlight | Aceternity UI | `HeroImage.jsx`, licensed photography under a dark scrim | Do not use. See below |

### Why Aceternity stays out

Aceternity's signature effects are the aesthetic carta-design exists to avoid, and each maps onto a numbered item in its "never do this" list. Spotlights, aurora and beam backgrounds are gradients (item 6). Parallax, scroll reveals and text that types itself in are scattered effects (item 9). Three-dimensional tilt cards and glossy surfaces are item 11. Gradient and glowing text spend the one accent on decoration. Carta's hero is a real photograph of the real place with a price on it, and that is the claim the product makes: the numbers are true. A cinematic layer on top says the opposite. If a page ever needs a single deliberate moment, it is designed against carta-design as its own task, not lifted from here.

## The re-skin contract

A lifted component is Carta's only when all of this holds. Most items are the translation from a registry's Tailwind defaults to the tokens in DESIGN.md.

Colour comes from `:root` and nowhere else. The registry's neutral scale becomes `--paper`, `--paper-dim`, `--bg-card`, `--ink`, `--ink-soft`, `--ink-mute` and `--rule`. Its `primary` becomes `--accent`; an active toggle is `--ink-fill`. Its `destructive` becomes `--danger`, and only for an action that erases something. No hex literal in the component or its CSS.

Shape follows DESIGN.md: 6 px radius on controls, 10 to 12 px on cards, `999px` only on a real status chip or a round icon button. Borders are `1px solid var(--rule)`, hairlines inside an object `var(--rule-soft)`. Where the source separates a card with a shadow, use a border or a `--paper-dim` ground; if a shadow stays, it is one of the three `--shadow-*` tokens. No gradient.

Type is `--ui` for everything except measured facts, which are `--mono` with `font-variant-numeric: tabular-nums`. `--display` only for display headings and destination names. Labels in sentence case, buttons verb first, no terminal punctuation.

Focus is `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible`. The registry's `ring` utilities and any `outline: none` without a replacement go.

Size: every interactive element is at least `var(--tap)` square. Registry buttons at 32 or 36 px high are too small.

Motion: transitions on `transform` and `opacity` only, under 300 ms, with a `prefers-reduced-motion: reduce` branch that sets them to `none`.

Theme: Carta is light-only. Every `dark:` variant and every dark-mode token block is deleted, not translated.

Icons come from `components/Icons.jsx`. Do not add lucide or any other icon set.

Strings go through the i18n keys in all six catalogues, never inline English, and pass `stripDashes()`.

Dialogs trap focus with `useFocusTrap`, close on Escape and return focus to the trigger. A new sheet uses `SheetShell` rather than a fresh scaffold.

Provenance: the file's header comment names the source library, the component and its URL, the date it was read, and the licence. shadcn/ui, Magic UI and Motion Primitives publish under MIT; check the licence of anything else at the moment you read it, and do not lift from a paid tier.

The gate: the component passes the generic-pattern detector (T196, the mind map's T192) and the seven "Before you ship" questions in DESIGN.md. As of this writing T196 has not been built. Until it is, the seven questions plus a grep of the new file for `#` hex literals, `gradient`, `box-shadow`, `dark:`, `rounded-` and `outline: none` stand in, and the report for the task that lifts the component says the detector was not available. A detector that runs over zero lifted components proves nothing, so the first lift after T196 lands is also its first real test.

## Things noticed while mapping the roles

These belong to other tasks and are recorded in the T197 report and the register, not fixed here.

`PassModal.jsx` and `planner/AiDayPlanModal.jsx` render `role="dialog" aria-modal="true"` with no `useFocusTrap` and no Escape handler inside the component, which PRODUCT.md says every `aria-modal` overlay has.

The featured pass tier carries a "Most popular" badge (`pass.mostPopular`, six languages). Checkout has never been live, so no tier has been bought, and the label claims a popularity Carta cannot show. carta-design's plan-card rule asks for a recommended plan, and its item 12 bans fabricated social proof.

There is no shared button component; 90 button class families each restate height, radius and colour. A `Button` primitive read from shadcn/ui is the most useful first lift, and it sits with T191's token work or T186's quality floor.
