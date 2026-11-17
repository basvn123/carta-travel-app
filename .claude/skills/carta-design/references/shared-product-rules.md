# Shared product rules (reference)

> Product rules every screen keeps. The look of every screen comes from `DESIGN.md` and the carta-design `SKILL.md` (house style run, 2026-11); the rules below are what each screen shows, what each control does and how numbers behave, whatever the look. They bind. Rules for one area live in its lane file: explore.md, place.md, outdoors.md, plan.md, trip.md, account.md, home.md, brand.md.

## What still binds under design freedom (owner decision 2026-10-30, T878)

The owner, during the plan flow walk (T878): "Ignore carta constraints. The page responsible for design needs to enable more freedom." The look rules are defaults, not bans. What still binds, because it protects the traveller rather than the look:
- Accessibility: text contrast 4.5:1 (3:1 for large text), 44 px touch targets on a coarse pointer, visible focus, `prefers-reduced-motion: reduce` honoured, colour never the only carrier.
- Honest numbers: every euro from `formatMoney()`, no fabricated figures or social proof, a missing figure is `NotYet`, the flight price is never presented as Carta's own.
- Copy: no em or en dashes, the six languages through i18n keys, plain words.
- Licensed photography with its credit; no AI-generated photographs of places.

Say in the task report what departed from the defaults and why.

## Where the truth lives

- `PRODUCT.md` (repo root): who the app is for, the voice, accessibility, the vocabulary, the interaction promise and the three angles. Read it first.
- The live style guide: run the app and open `?styleguide`. It renders the real kit on the real tokens with "use for" and "not for" lines, and switches all six languages.
- If no rule covers a case, the question goes to a task or the owner; do not make the call silently.

## Why these rules exist

Carta once had a homepage that looked machine generated, because defaults accumulated one component at a time. The generic look comes back the same way: in a hurry, when nobody is looking at the whole page. The rules are not suggestions to weigh against convenience. Deviating from them needs a reason you could defend out loud.

## What the app is

"Stop stitching trips together from five apps. Carta plans the whole trip in one place, with what each day costs." (owner, T471-b, 2026-10-21; the same sentence as PRODUCT.md). One app for planning a trip anywhere in Europe, cutting coordination and logistics. It prices the ground for every destination (a bed plus food and drink, per person per day; local transport is not in the day figure yet), plans the trip city by city and each day hour by hour. Carta never navigates: no route guidance and no GPS, the traveller's maps app takes them there. For the flight it shows Google Flights' price, with the airline, the times and when it was checked, so the flight, the bed and the days add up to one total; a fare the traveller types in replaces it. The flight price is never presented as Carta's own. It takes no booking and never ranks by what it earns; some links pay Carta a small fee at no cost to the traveller (I-e, 2026-11-12). It hands the traveller to the operator.

The audience counts money: students, young workers, families on one income, retirees, and hikers first at launch. The only real asset is trust in the numbers.

The formation (DESIGN.md "Signature components") is the price row under every photo. The voice is plain, specific and short.

## App structure

**Places (T496, owner 2026-10-21).** Explore (the old Destinations tab folded in as six category tiles: Places, Trails, Beaches, Lakes, Mountains, Cycling; the trip library is a "Trip styles" row, never a tile), Plan (trip and day in one place; with nothing in progress a "Plan something new" page with two tiles, Trip and One day), My trips (the saved count only) and an account icon. Home is behind the logo on desktop and a "How Carta works" row in Account on a phone. Language and currency live in Account, not in the settings line.

**Breakpoints.** Floor 360 px with no horizontal scroll; below 769 px the phone (a bottom nav of three: Explore, Plan, My trips; sheets for choices, pages for detail); from 769 px the header carries the tabs and list and map sit side by side, highlighting each other; from 1024 px detail pages take two columns. Page widths (owner, 2026-11-03, T1041, after Airbnb, Booking, Wanderlog and Google Explore): browse pages cap their content at `--w-browse` (1440 px), one place or one trip at `--w-detail` (1240 px), hubs (Account, Together, Pricing) at `--w-hub` (1120 px); a map surface has no cap and gives the map the rest of the screen. The header, the settings line, a page bar and a browse page share one left edge, `--page-inset` (T438, T427 kept: on a wide screen that edge moves in with the cap instead of staying at the screen's).

**Phone first.** Design the phone layout first, at 360 px. Every fixed or sticky bar reads `env(safe-area-inset-*)`; full-height layouts use `100dvh`. The one primary sits in the lower half of the screen inside the content, never sticky over it and never in the top bar. A swipe, drag or long press always has a visible button doing the same; `:hover` rules sit inside `@media (hover: hover)`. The submit sits under the last field, and the bottom nav hides while an input in a sheet or page has focus. Desktop adds side by side map and list, hover detail and keyboard shortcuts; it never removes a phone path.

## Numbers and money

Every euro the traveller reads comes from `formatMoney()` in `continent-app/src/lib/money.js`, or `<Money>` in the kit. Two screens can never write the same figure two ways.

- **Precision by context.** Whole euros where many places are compared at once: cards, pins, lists, rails, filters, chips, destination facts. Cents on receipts, totals, ledgers, the planner's legs and extras, pass prices and exports. The context decides, never the call site's taste. A receipt never rounds a line to look tidier: `24.99` is the point, `25` is a different product.
- **Locale places the symbol.** `Intl.NumberFormat` in the reader's language: €87 in English, 87 € in German and French, digits grouped by locale.
- **No euro sign in an i18n string.** Templates take a formatted figure (`{price}`, `{eur}`); the formatter supplies the symbol. A `€` or `EUR` typed into JSX or a string is a bug (the `money-literal` lint rule (T425) catches it).
- **One amount and its unit** (owner 2026-10-24, price plan rule 2, replacing T590's tilde). An estimate is written like any figure: no tilde, no "est.", no "live", no assumption line, and a screen reader hears the figure itself. Whether a price is measured, live or an estimate is stored by the price engine (`src/lib/price/`) and shown only in the admin page's Prices view. `formatEst()` and `<Money est>` stay for their callers and draw the plain figure; never a mark of your own instead.
- **Per person or the whole group** (T694, plan rule 4). One Segmented control under People in the settings line; every day figure, pin, filter stop and chip draws through `useDayView()`, the total being the figure times seats and nights ("for 2 people, 7 nights"). Nothing builds its own total.
- **The opened price** (T695, plan rule 9). The amount on a card and on the destination header opens, on a tap, the InfoDot popover listing the items in it (bed, food and drink, local transport, car hire when going by car, activities, events, the way there) with their amounts and a kit Switch each; switching one off is a setting and applies everywhere. An item without data shows `NotYet`, never a zero and never a switch. `components/PriceItems.jsx` is the one component.
- **Ranges** go through `formatMoneyRange()`: "€40 to €60", with the language's own joiner.
- **Per unit** is one phrase per language through i18n ("a person", "a day", "a night", "for the trip"). No `/pp`, `/p`, `/day` in JSX. When two units apply the string is one: "A day, a person" (house style 2026-11, the same string in DESIGN.md and PRODUCT.md), said once (a column head, a figure's label), never under every figure (owner, minimal text); a person's share is "a person", never "each"; a unit is never a suffix glued to a figure.
- **No figure** prints words (`money.onRequest`, "Price on request"), never a blank, a lone dash or "€NaN".
- **The amount is the whole pedigree on the page** (owner decisions 2026-10-13, T438, and 2026-10-24). No method sentences ("measured from N stays", "the national basket", "N of M figures measured"), no "national" word after a figure, no source footers. Never a flight figure presented as Carta's own, never a bookable claim, never a stored figure shown as current. Every external booking link warns that prices may have changed.
- **Flights** (T511 to T518, 2026-10-21). A flight figure is Google Flights' price, not Carta's estimate. It always travels with the airline mark and the departure and arrival times. Owner decision 2026-10-29 (T840): the "Google Flights, checked {time}" line is no longer required on screen, and Change flight shows none; where a link out to Google Flights is offered it still says "prices may have changed". The airline mark is the airline's own logo, never recoloured, tinted or redrawn. A fare the traveller typed in replaces it and is labelled as theirs. A swept price older than its sweep cycle is not shown (5 days for the next two weeks, 16 days beyond, 32 days past day 181, T780, T798; config `flights.max_age_days`). Bag fees (10 kg cabin, 20 kg checked) are Carta's estimates; the traveller's bag is priced on every flight (T691). The one exception to "One amount and its unit" (owner tick T882-b, 2026-11-12, built under ROADMAP D10): a far-ahead date with no swept fare shows a typical fare, the median of the route's swept fares, labelled "Typical for this route, not for your dates" next to the amount and on the receipt line; it is never presented as a fare found for those dates and never counted in "Fits" without its label. Cents on receipts, whole euros on cards, like every other figure.
- **One day-cost basis.** The traveller's Lifestyle prices the day everywhere: the card, the pin and the page show the same figure (owner decision 2026-10-13, T374-d). A saved trip keeps the stay and Lifestyle it was saved with; the app-wide settings apply to new and unsaved trips (owner T703-a, 2026-11-12).
- **Figures line up.** Every price, date, time, distance and count is set with tabular numerals (`font-variant-numeric: tabular-nums` on `body`), so a column of figures lines up. A measured fact is told apart by its position (right aligned in a receipt line, after the label in a row, on its own line under a photo) and by its unit.

**Cost on cards and pages.** A card or page that offers a place or a trip carries one price line: the day cost per person at the traveller's Lifestyle ("From {price} a person" with its length on a collection card, from the cheapest member, never an average; in a trip list whose length control already states the days, the card carries no length, owner 2026-10-15), read from `src/lib/costIndex.js` so it agrees with Explore and the receipt. It carries nothing about its source (T438; the estimate mark left on 2026-10-24). No figure when the data is too thin. A page shows one per person per day figure and every other mention on the page is that value.

**Best value.** The cheapest item in a comparison (the cheapest pin in view, a "Best value" status chip) is marked once per view. It is a marker, not a selection and not an action.

**Ratings.** The Score is the ink Score plate with a white figure out of 10 (`ScorePlate`, DESIGN.md "Score plate"), 12 px minimum; no stars, no coloured scores (house style 2026-11, replacing the star of T437). A page head adds the band word. Hidden gems are a diamond with the word. Tier names such as "Worth the journey" never appear on screen.

The receipt, the cost bar and the day sentence: see place.md. The settings line and the Lifestyle control: see explore.md.

## Photography

Every photo is real and licensed with its credit (`docs/tos/data_licenses.md`).

- A photo's credit sits under that photo, on its caption line (owner 2026-10-15). Credits are text. (The home page's film clips are the one exception: see home.md.)
- A missing photo is the world tile (`WorldTile`: the kind's world tint with a resting blaze), never a stock picture and never a bare grey box.
- Never an AI-generated photograph, never stock people with laptops, never a 3D or glossy render.

## Controls and components (behaviour)

Use the kit in `continent-app/src/components/ui/`; a new local button, chip or card is a regression (the `raw-button` lint rule (T425) meters what is left; `node scripts/ci/design-lint.mjs --meter`). Read shadcn for keyboard and ARIA behaviour only.

- **Button**: primary, secondary, quiet (an offer inside a bar, a row or a card), danger. Loading keeps its width; disabled never looks like a paler live button. One primary per view. A link that only navigates is a link, not a Button.
- **IconButton**: always a 44 px box and a required label. `pressed` gives the selected state and `aria-pressed`.
- **Chip**: filter (toggle, `aria-pressed`, tick when on), choice (radio in a ChipGroup, arrow keys), count (a figure beside a label), status (tones neutral, best, gem, rate, positive, danger; not interactive).
- **Segmented**: radio semantics.
- **Tabs**: tablist semantics, arrow, Home and End keys.
- **Card**: layouts row (the compact default) and tile (rails, home). Slots in fixed order: media, title, meta, rating, price, actions. The price slot takes `<Money>`. One stretched link or button on the title opens the card; actions sit above the stretch; nothing interactive nests.
- **Field**: input, select or textarea with a visible label, help and error under it tied by `aria-describedby`. A placeholder is optional (owner 2026-10-22, T569): the label names the field, so an empty field may stay empty, and a placeholder, when there is one, never stands in for the label. Ask Carta's chat field has none (see account.md). Inputs are 16 px so iOS does not zoom.
- **Score** (`ScorePlate`, house style 2026-11): the ink plate with a white figure out of 10, tabular, 12 px or more, right after the name; no stars and no coloured scores (`RatingBadge.jsx`'s `ScoreChip` keeps its markup and data attributes; its star is hidden and the figure sits on the plate, so the plate is the look everywhere). `band` adds the band word (Exceptional, Excellent, Very good) through i18n, on a page head or a preview.
- **Switch** (T437): `role="switch"`, the whole row is the hit area.
- **Tile** (T437): an icon over its word in an even grid, as a toggle or a choice; selected carries a tick.
- Kept: `SheetShell`, `Dropdown`, `DateField`, `ReceiptCard`, `StateBlocks`, `InfoDot`.
- **One selected state.** A selected chip, tab, segment, tile, rail row, nav item or section link carries a mark so the state never rests on colour alone (a tick on a chip, an underline on a tab, a lifted thumb in a segmented control, an edge on a selected card). The active section carries `aria-current="page"`.

**InfoDot.** One glossary marker: a small dot after the term, inside a real `<button>` with a `--tap` box and an aria-label naming the term. It opens a popover (at most 280 px, the term and one or two sentences) from the shared glossary. Escape, a second tap or a tap outside closes it and returns focus. One per term per view, on the first occurrence; never on a heading, a button label or a pin; never an "i" in a circle.

**Dialog family.** One scrim, one close control, a focus trap through `useFocusTrap`, Escape; never a confirm modal. A sheet (a choice on a phone) rises over the same scrim with a grab handle, a `--tap` close and one primary, caps at 80 percent of the height in landscape and scrolls inside; a sheet never holds a sheet and a page never opens inside one. A popover (a card preview) is at most 320 px, never over the photo; it opens on hover after 150 ms, on focus after 400 ms, on Enter or tap at once. A choice of two from the bottom nav is a menu. Every modal has the scrim and the page behind takes no clicks.

**Close control.** CloseIcon at 16 px in a `--tap` IconButton, top right (inline right on a toast), label "Close" translated. No letter x, no multiplication sign, no grey disc.

**Navigation.** Anything that changes the view (a tab, the brand mark, a card that opens a page, a back control) is an `<a href>` with the view's URL; a section change pushes one history entry; `<button>` is for actions. Every detail page has its own URL, a save control and a share control in its page bar. The back control names the list it returns to, on a phone and a desktop alike: every full-screen page wears the one page bar, `PageBar.jsx` (back, the name once the heading has gone, save, share; T474). Opened by pointer or a link, focus goes to the page heading (tabindex -1); from the keyboard, the first control (`usePageArrival.js`); closing returns focus to the opener.

**Sticky section rail.** At most one per page, only with three or more sections, `--tap` high, links scrolling sideways on a phone; the section in view takes the selected state. Each link is a real `<a>` to its anchor.

**Tracks.** The day track, flashcards and the photo track share mechanics: one card per stop of `scroll-snap-type: x mandatory`, about 85 percent wide on a phone so the next shows (a rail card is 76 percent, the place photo track 88 percent: three tracks, three widths), three across from 1024 px for days; Previous and Next secondaries at `--tap` and the position ("Day 3 of 7", "2 of 5") above or under it; arrow keys move one; position dots hidden from screen readers. Swiping is a shortcut, never the only way. No autoplay, no looping, no flip. Flashcards have a "Show all" link that turns the deck into a list, and print as the list. Every day stays reachable as a link from the page's own list.

**Data drawings.** One family: weight is the scale (filled to the level, outlined beyond), the figure always sits beside the drawing, the drawing reads the same when removed, no legend (a strip on a card is explained once per list as a text key), at most one committed item marked. Members: the month strip (twelve cells, the chosen month outlined), the thin bar (at most 8 px), the profile (elevation on a km axis, one marker shared with the map, moved by drag, tap or arrow keys), the gauge (five segments), the five squares, the receipt, and the label-over-value row.

**Bottom slot and undo.** Toasts, the site notice and the pass expiry banner stack in one slot above the bottom nav on a phone and bottom centre on desktop, newest on top, at most three, each with a close, never over the nav or a sheet's primary. A destructive action on the traveller's own data runs at once and shows "Undo" as a secondary for six seconds; the button that started it is danger. An inline confirm only where nothing can be held back (deleting an account, publishing to the gallery, withdrawing a public link): one sentence and two buttons, the safe one first and focused, Escape keeps; the erasing one is danger, the publishing one primary.

**"More" menu.** More than two secondary actions in a footer: the rest go into one "More" button with menu semantics; a destructive item in it is danger text. A multi-step flow's fixed chrome on a phone takes at most a quarter of the screen together, and its footer is one row.

**Status.** A positive verdict or confirmation ("You can swim here", "Profile updated.") is never green text in a sentence; it carries a small status dot before it. A "since you saved" price change may be marked ("{price} less a day than on 3 Oct").

**Loading.** A waiting region holds its final height as a still block, no shimmer, no spinner (a Button's own loading spinner excepted), "Loading" for screen readers only. Header and bottom nav stay usable while a tab loads.

**Smaller rules still in force.** Derived sentences show only when the authored text agrees with the data, never "0 of N". A view may restore the last category, country or open folds from browser storage in try/catch, correct without it.

## Copy

The voice did not change with the look. The app sounds like an instrument, not a brochure.

- Every headline carries a verb the traveller recognises or a number. "What the whole trip actually costs" works; "Everything the price tag usually hides" could sit on any product. A browse section title may be a plain noun phrase ("Hidden gems").
- Say less (owner, 2026-10-13). Every sentence on a page earns its place for the traveller. Method notes, coverage statements and catalogue counts ("3,855 places", "253 trips in 39 countries") are not page furniture (catalogue counts left the page furniture, T438); a figure the traveller needs (a price, a distance, their own shortlist) is.
- No em dashes and no en dashes, anywhere: a comma, a colon or two sentences. `stripDashes()` in `src/lib/format.js` enforces it on shipped strings; the rule holds for source, docs and reports too. No middot or bullet characters as separators. Ranges use the word "to".
- Banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.
- Sentence case everywhere. No terminal punctuation on labels, buttons or headings; body and helper text take full stops. Contractions are fine. Nothing uppercase: no eyebrows, no kickers.
- Active voice, verb first. A button that says "Save trip" produces "Trip saved."
- Errors say what happened and what to do in one sentence, with no apology and no "Error:" prefix.
- Empty states are an invitation, not an apology: name the space and give the action.
- A hand-over names the thing and the app: "Open Day 2 in Google Maps", "Open this ride in Google Maps". Never "Navigate", "Start route" or "Directions", because Carta does not navigate.
- Honest in the product's own voice. A flight price is never presented as Carta's own estimate (the checked line is optional since T840); the typical fare of T882-b is labelled as typical for the route, never as a fare for your dates; a fare the traveller typed is labelled as theirs. When the AI is off, say it is off. An empty result says so in one line.
- Strings go through i18n keys in all six languages, never concatenation; test labels at the longest translation (usually German).

## Never do this (product)

1. A second primary in a view.
2. Fabricated social proof: testimonials, user counts, press, partner logos, "popular" badges without a measure. Data freshness is the proof Carta has.
3. AI-generated photographs of places, stock people with laptops.
4. A euro sign or "EUR" in an i18n string or JSX, `toFixed` on a price, a rounded receipt line, or any mark of provenance on a price: a tilde, "est.", "live", a method line (2026-10-24, price plan rule 2).
5. Any text under 12 px, or a touch target under 44 px on a coarse pointer.

Also never: catalogue counts, method sentences or coverage notes as page furniture; scroll-triggered counters or a count-up on a figure.

## Quality floor

- 360 px wide with no horizontal scroll; one `h1` per view, headings in order.
- Real `<a>` for navigation, real `<button>` for actions; visible focus on every interactive element (`:focus-visible`; never `outline: none` without a replacement).
- `--tap` (44 px) is the floor for anything interactive, icon-only controls included; on a fine pointer a compact control such as the small Button or a chip may be 32 px.
- No text under 12 px (the house floor, DESIGN.md "Type").
- Every text pair 4.5:1 or better (`node scripts/ci/token-contrast.mjs`).
- Colour is never the only carrier: selection carries a mark, place kind survives greyscale, good news and danger come with words.
- `prefers-reduced-motion: reduce` on every transition; scripted motion asks `prefersReducedMotion()` or `durationMs()` in `src/lib/motion.js`.
- Decorative icons are `aria-hidden`.
- Every `aria-modal` overlay traps focus and closes on Escape.
- `node scripts/ci/design-lint.mjs` reports no new violations against its baseline.
- Run the app (`npm run dev` in `continent-app/`) and look at every screen the diff touches on a phone width and a desktop width.

## Gates before you ship

These two questions still gate (owner design-freedom decision, 2026-10-30), with contrast:
- Is any rating or figure under 12 px, any text under 12 px, any column of figures without tabular numerals, any euro not from `formatMoney`?
- Does every headline contain a verb or a number (or name a browse section), is there no count, method line or coverage sentence that could go, and is the diff free of em and en dashes, middots and the banned words?
