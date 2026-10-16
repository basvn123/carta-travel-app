# T460 critique, Assessment B (before): detector and evidence

Surface: the pass panel (the paywall). `continent-app/src/components/PassModal.jsx`, mounted only by `src/hooks/usePaywall.jsx`, with its tiers from `src/lib/pricing.js`, the expiry banner in `src/components/AnnouncementBar.jsx`, and its CSS in `src/styles/21-chat-passes.css` (pass block, lines 302 to 462 and 778 to 837) and `src/styles/69-v6-account.css` (pass rules at 133 to 155, 248 to 320, 428 to 434, 490 to 514). Inherited rules it renders through: `12-guided-trip.css` 680 to 700 (`.guide-next`) and 753 to 794 (`.day-saved-*`), `20-day-planner-flow.css` 327 to 341 (`.ai-plan-*`), `16-auth.css` 326 to 337 (`.auth-link`), `25-feature-pages.css` 1765 (overlay z-index).

Run 2026-10-16, read-only. Because another session was editing the working tree, every file was materialised from the app repo at `9e7ab0d` into the scratchpad (`.../scratchpad/t460-before/`) and those copies were scanned. Line numbers below are the `9e7ab0d` line numbers. Evidence only; the design opinion is Assessment A's.

## 1. Impeccable detector CLI (static)

Command from the repo root: `impeccable.cmd detect --json <file>`.

| File (9e7ab0d copy) | Lines | Findings |
|---|---|---|
| components/PassModal.jsx | 241 | 0 (`[]`, exit 0) |
| styles/21-chat-passes.css | 837 | 0 (`[]`, exit 0) |
| styles/69-v6-account.css | 534 | 0 (`[]`) |
| components/AnnouncementBar.jsx | 122 | 0 (`[]`) |

Weak evidence, as in T434: the JSX carries class names rather than styles, and the static CSS rules match little (T434 showed a control file with a 9 px size and a gradient also went unflagged). The real findings come from the grep in section 2 and the screenshots in section 4. No browser detector pass was run for this assessment (the before screenshots were taken by the parent session).

## 2. Static evidence (grep of the 9e7ab0d copies)

### Buttons

- **Raw `<button>` in PassModal.jsx: 3 JSX sites, 4 rendered buttons, 0 kit components.** Close (`:90`, legacy `.day-saved-close.pass-close`, not `IconButton`), the terms link (`:118`, `.auth-link`), and the buy button (`:166`, rendered twice, `.guide-next` for the Trip Pass and `.pass-buy-quiet` for the Year Pass). `Button` and `IconButton` from `components/ui/` are not imported.
- AnnouncementBar `PassExpiryBanner` uses the kit `Button` for "Extend my pass" (`:114`) but a raw close button (`:117`).
- Buy buttons have no `min-height`: `.guide-next:not(.btn)` is `padding: 10px 22px` (12-guided `:680`). The browser measured them at **38 px tall** (section 4), under the 44 px `--tap` floor on a phone.

### Type (px literals; the scale is 11, 12, 13, 14, 16, 20, 28, 40)

| Rule | Size | Note |
|---|---|---|
| 21:387 `.pass-flag` ("Recommended") | **10px** | Functional text under the 11 px floor (never-do 10) |
| 21:411 `.pass-price small` ("once, 30 days") | **11px** | Carries a figure (30, 12) under the 12 px figure floor |
| 21:448 `.pass-buy-placeholder` ("Your current plan") | 11.5px | Off scale, `--ink-mute` |
| 20-day-planner-flow:340 `.ai-plan-note` (VAT, no-subscription, legal notes) | 11.5px | Off scale, `--ink-mute` (= `--text-3`) on body sentences; DESIGN.md: `--text-3` "never body copy" |
| 21:317 `.pass-current` | 12.5px | Off scale, holds the days-left figure |
| 21:416 `.pass-blurb`, 21:424 `.pass-features li` | 12px | Feature lines with figures at the caption floor |
| 21:441 `.pass-buy-quiet` | 13.5px | Off scale |
| 21:395 `.pass-tier h4` | 15px | Off scale |
| 21:402 / 69:136 `.pass-price` / `.pass-price-eur` | 27px then 24px | Two declarations, 69 wins |
| 20:331 `.ai-plan-head h3` | 17px | The dialog title; off scale (`--text-title` is 20) |
| 69:264 `.pass-compare` | 13px | Literal, equals `--text-label` |

Literal font sizes in the pass rules: 10 in 21, 2 in 69, 3 inherited. `--text-*` tokens used: **0**. `CheckIcon size={11}` at PassModal `:149, :155, :161, :163` (icons are 16 px inline in the kit).

### Radius and spacing

- Radii: 21:320 and 21:336 `8px`, 21:354 `12px` (a card; `--radius-card` is 16), 21:389 `999px`, 21:437 `6px` (a button; `--radius-control` is 10), 69:255 `10px` (the compare wrap, a card), 12-guided `.day-saved-card` `18px` (a dialog; `--radius-sheet` is 20). **0 radius tokens.**
- Spacing: 21 uses literal paddings and margins throughout (`8px 10px`, `9px 11px`, `16px 14px 14px`, `15px 13px 13px`, `3px 9px`, `gap: 12px / 6px / 7px`, `margin: 6px 0 4px`); 6, 7, 9, 11, 13, 15 are off the 4 px grid. 69 uses `--space-*` in the compare table and the close.

### Tokens

- **Legacy aliases in the pass rules: 23 uses in 21 (lines 318 to 454), 14 in 69.** `--ink`, `--ink-soft`, `--ink-mute`, `--paper`, `--rule`, `--rule-soft`, `--accent`, `--on-fill`, `--wash`, `--display`, `--mono`, `--bg-card`, `--shadow-card`. **Role names (`--surface`, `--text`, `--action`, `--border`): 0.**
- **The dialog sits on the page ground.** `--paper` resolves to `--surface-page` (DESIGN.md line 356). `.day-saved-card` (12-guided) and `.pass-tier` (21:356) both paint `--paper`, so the dialog and its cards are the warm grey page colour, while the compare table paints `--bg-card` (= `--surface`, white). The screenshots show a grey dialog with one white table in it.
- **Brown spent on non-acting surfaces.** `--wash` resolves to `--umber-50`. It fills the waiver box (21:335), the current-plan line (21:319) and the current tier card (21:373, which for a guest is the Free card, because `current` defaults to `'free'`, PassModal `:66`).
- Overlay `z-index: 320` (25-feature-pages `:1765`), outside the `--z-*` scale (`--z-modal` 60, `--z-toast` 70).
- No hex in 21's pass block or 69's pass rules. 12-guided `.day-saved-overlay` has `rgba(26, 26, 26, 0.42)` and `blur(2px)`, overridden by 69:432 (28 % `--ink`, no blur).

### Gradients, border plus shadow

- Gradients: **0**.
- Border plus shadow: 21:353 + 21:365 `.pass-tier` border with a hover `box-shadow` (neutralised by 69:316). `.day-saved-card` has `--shadow-2` (= `--elev-2`); a dialog is `--elev-3`.

### Motion

- 21:309, 311, 360 animate with literal `.38s`, `.25s`, `.45s` and `cubic-bezier(.16, .84, .32, 1)`, plus a stagger (21:362 to 363). All overridden by 69:309 to 312 (token `acc-fade` / `acc-rise`, `pass-tier` animation none). The 21 rules and three `@keyframes` are dead code, which breaks 69's own header rule ("never leave two copies").
- Transitions without a local reduced-motion branch: `.pass-buy-quiet` (21:444, 69:496), `.guide-next` (12-guided `opacity .15s`, a literal), `.auth-link` (16-auth `:332`). The `.pass-tier` transition has its branch (21:377, 69:352). T434 found a global floor in `02-base.css:110` that zeroes all transitions, so this is a rule breach, not a live motion bug.

### Dialog semantics and focus

- `role="dialog" aria-modal="true"` is on the **scrim** (`:87`), not the card. **No `aria-labelledby` or `aria-label`: the dialog has no accessible name.**
- Heading levels: the dialog title is `h3` (`:96`), tiers are `h4` (`:131`). No `h2` in the dialog.
- Focus: `useFocusTrap(cardRef, onClose, { initialFocusRef: closeRef })` (`:63`), Escape on the shared stack, opener restored (`useFocusTrap.js:85`). Disabled while the terms page is on top. Good.
- The close button is absolutely positioned inside the scrolling card, so on a phone it scrolls away with the content (12-guided `.day-saved-close`, 21:459 `overflow-y: auto`).
- On a phone `.pass-tier.featured { order: -1 }` (69:154) shows Trip before Free while DOM and focus order stay Free, Trip, Year.
- The checkout error (`:227`) renders after the compare table, at the foot of the panel, with no `role="alert"` or live region. On a phone it appears about 1,000 px below the button that caused it.
- The compare region is focusable (`tabIndex={0}`, `:191`) with a visible focus ring (69:258) and a caption. Good.
- Buy buttons carry `aria-label` "Get the Trip Pass" / "Get the Year Pass" (`:172`). Good.

### Copy and small print

- Words in the panel (English, free plan): about **243** by string count; the comparison table alone is 34 words, every fact of which is already on the cards above it (price, plans, searches, duration).
- **Small print: 7 sentences, 76 words**, in four blocks: the waiver (2 sentences plus a link, `:115`), the VAT note (2), the no-subscription note (2), the legal note (1). The lead adds 2 more.
- "No subscription" is said **4 times**: the lead, `featOneOff` on both paid cards, and `noSubNote`.
- The year is "once, 12 months" on the card and "365 days" in the table.
- `pass.freePrice` ("€0", "0 €") is a euro sign in an i18n string in all six locales (en.js:1821); it is not rendered by PassModal (unused key).

### Money

- Every price goes through `formatPrice` (pricing.js `:123`) into `formatMoney(cents / 100, { precision: 'cents', locale })`, in the reader's locale. The free plan prints "€0.00" through the same path. **0 money literals in the JSX.**
- The year card's "Costs less than 3 Trip Passes" is computed (`yearPassTripsEquivalent`, pricing.js `:142`), so it cannot drift from the prices.

## 3. Paywall logic (usePaywall.jsx and every call site at 9e7ab0d)

### The three doors

- `require(why)` (`:191`): returns true when `paid`; otherwise opens the modal with `why` and returns false. `openedHard` follows the gate's kind, so a soft reason opened through `require` is still snoozable.
- `nudge(why)` (`:204`): soft offer; see rules below.
- `openPrices(why = 'browse')` (`:224`): always opens, for anyone, paid or not; marks the opening hard.
- `paid` (`:171`): true under `?paymock`; false for a guest; **true while the status is loading or unknown (fails open)**; otherwise `tier !== 'free'`.

### Triggers

| Call site (9e7ab0d) | Reason | Door | Gate kind | When |
|---|---|---|---|---|
| DestinationPage.jsx:539 | export | require | hard | PDF of a destination |
| DayPlannerTab.jsx:1923, 1950, 1961 | export | require | hard | Day plan PDF, calendar, map file |
| TripItinerary.jsx:454, 460, 914 | export | require | hard | Trip exports |
| MagicImportZone.jsx:37 | import | require | hard | Reading a booking |
| TripSharePanel.jsx:108, 140 | share | require | hard | Co-planning invites |
| TripSharePanel.jsx:307 | share | require | hard | Second share link (first is free) |
| TripPlannerTab.jsx:811 | save | require | hard | Second saved trip (only when `!paywall.paid`) |
| AiDayPlanModal.jsx:387 via DayPlannerTab:3721 | plans | require | hard | After the server returns `user_cap` |
| AiDayPlanModal.jsx:260 via DayPlannerTab:3721 | ground | require | hard | Events ticked with `groundLeft <= 0` |
| AiDayPlanModal.jsx:286 via DayPlannerTab:3721 | plansLow | require | soft | On the last plan (`plansLeft === 1`) |
| CartaChatPlanner.jsx:482 via useCredit | plans | require | hard | Continue pressed with `credit.out` |
| CartaChatPlanner.jsx:754 via useCredit | plans | require | hard | Chat failed with `user_cap` |
| TripPlannerTab.jsx:447 | celebrate | nudge | soft | Trip first becomes planned and has never been saved |
| AnnouncementBar.jsx:114 | expiring | openPrices | soft by kind, opened hard | Pass banner, 7 days or fewer left |
| AppHeader.jsx:136, 207 | browse | openPrices | hard | Header "Get a pass" |
| AccountPanel.jsx:918 | browse | openPrices | hard | "See passes" / "Extend my pass" (shown only when `canUpgrade`, so not for a Year Pass) |

`CreditChip.jsx:37` defines `openPasses(why = 'plansLow')` as `require(why)`; its only callers pass `'plans'`.

### Can a paid traveller who has used the allowance reach the panel?

**No, not from the moment it runs out.** Every allowance trigger goes through `require()`, which returns true for any paid tier without opening anything:

- **CartaChatPlanner.jsx:482** `if (credit.out) { credit.openPasses('plans'); return; }`: for a Trip Pass holder at 0 plans, `require` returns true, the function still returns, and **Continue does nothing at all** (a dead button, no message).
- **CartaChatPlanner.jsx:754** and **AiDayPlanModal.jsx:387**: the "See passes" button on the `user_cap` failure does nothing for a paid traveller.
- **AiDayPlanModal.jsx:260** ("See passes" beside "Live search needs a pass", shown when `groundLeft <= 0`) and **:286** (last plan) do nothing for a paid traveller.

So a Trip Pass holder who spends 60 plans or 40 searches cannot be offered the Year Pass at the moment they need it. They can still reach the panel through the header "Get a pass", the Account panel's "Extend my pass" (Trip only), or the expiry banner (last 7 days). A Year Pass holder at 0 has only the header (and the banner). `openPrices(why)` was added for exactly this (comment at `:218`: "require() cannot do this"), but the allowance call sites were not moved to it. The heading for `plans` ("You have used your Carta bot plans") would fit a paid traveller unchanged.

### Soft-gate rules

- `nudge()` refuses when `paid`, when the reason is not in `GATES`, when **any** soft prompt has already shown this session (`sessionStorage` `carta.paywall.softShown.v1`), or when this reason is snoozed (`localStorage` `carta.paywall.snooze.v1`, per reason, a timestamp).
- Showing marks the session as used, whatever the outcome.
- Dismissing (close, Escape, scrim) a soft opening writes a 30-day snooze for that reason (`SNOOZE_DAYS`, `:63`, `:238`). A hard gate or an `openPrices` opening never snoozes.
- Only `celebrate` actually reaches `nudge()`. `plansLow` is soft by kind but opened through `require` from a click, so it skips the session and snooze checks yet still writes a snooze on dismissal; nothing reads that snooze because nobody nudges `plansLow`. `expiring` is soft by kind but always opened through `openPrices`, so it never snoozes; the banner has its own per-expiry dismissal (`carta.passExpiry.dismissed.v1`).
- Guests are `paid: false`, so they get every hard gate and the `celebrate` nudge. Their buy button calls `onSignIn` (PassModal `:70`), which closes the panel and opens sign-in; the chosen tier and reason are not carried through, so after signing in the traveller is not returned to the panel.

### Other logic notes

- A Trip Pass holder opening the panel sees "You have a Trip Pass with N days left." and the Trip card still reads "Get this pass", with no "extends your pass" wording; only the `--wash` fill marks it as current.
- Funnel events are counted once per opening in the provider (`:139`), with a `pagehide` dismissal (`:152`). Good.

## 4. Browser facts (Execution/P11/T460-shots/before, measure-before.json)

Screenshots are 2x. The `-full` shots are the same size as the viewport shots (the panel is fixed; a full-page capture adds nothing), so the panel's full scroll height is not in the evidence.

| Scene | View | Words* | Primaries* | Under-tap controls | hscroll |
|---|---|---|---|---|---|
| pass-guest | p360 | 101 | Get this pass | Get the Trip Pass 234x38 | no |
| pass-free | p360 | 148 | See passes, Get this pass | Get the Trip Pass 234x38 | no |
| pass-guest | phone 390x844 | 122 | Get this pass | Get the Trip Pass 264x38 | no |
| pass-free | phone 390x844 | 174 | See passes, Get this pass | Get the Trip Pass 264x38 | no |
| pass-guest | ipad | 247 | Get this pass | Trip 203x38, Year 203x38 | no |
| pass-free | ipad | 300 | See passes, Get this pass | Trip 203x38, Year 203x38 | no |
| pass-guest | desk | 247 | Get this pass | none (fine pointer) | no |
| pass-free | desk | 300 | See passes, Get this pass | none | no |

\* The harness counts visible text on the whole page. "See passes" in `pass-free` is the Account panel's button behind the scrim, not part of the panel; inside the panel there is one primary in every view. The free/guest word gap (53 to 56) is the same page-behind effect.

**Panel height at 390x844.** The card runs from y 34 to y 810 CSS px: **776 px, the 92dvh cap** (69:513), so the panel fills the screen and scrolls inside. The first screen holds the heading, the lead, the 5-line waiver box with its link, and the whole Trip Pass card with its buy button (at about y 614). The Free card starts at about y 661, so the Year Pass, the comparison table and the three notes are all below the fold. Estimated content height, by adding the remaining blocks at the measured phone widths: **about 1,650 px, roughly two screens of scroll**, of which the Year Pass card starts around the second screen. This is an estimate from the screenshots, not a scripted `scrollHeight`.

**Desktop 1440x900.** The card runs from y 24 to y 876: **852 px of a 900 px viewport**, with no scroll. iPad 820x1180: about 875 px (y 152 to 1027).

**Visible in the shots:**

- At p360 and on iPad the waiver's last line breaks unevenly: the inline terms link takes `min-height: var(--tap)` on a coarse pointer (69:389 `.auth-link` inline-flex), so the line holding "page. Read the terms of service" is taller than the others and leaves a gap above it.
- The "Recommended" flag is visibly small (10 px) in every view.
- The guest view labels the Free card "Your current plan" with a brown wash, though a guest holds no plan.
- The Free card on desktop has a large empty band between its features and "Your current plan" (equal-height grid, `margin-top: auto`).
- The dialog ground is grey and the comparison table white (section 2, Tokens).
