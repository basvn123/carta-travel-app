# T537: cost sections, one clean line everywhere

## Task ID

T537 (P11). Follows the stay-price batch T530 to T536. App branch `p11-cost-sections` (worktree `wt/app-stays`), merged into app master as 6a23f83 plus 1 fixture commit. Root mirror d8e02ffc5.

## Date

2026-10-22

## What changed

The owner asked for every cost section to be "visually simple and clean with appropriate icons", and for "a super clean modern link to the actual flight".

- **One breakdown line.** There used to be five ways to draw a label and a figure: the receipt card's `.frr-line`, the budget receipt's copy of it, the planner's `.plan-line`, the trip card's `.tprice-line` and the Explore hover's `.cost-row` with a five-step gauge. Each had its own label size and figure weight, and most had no icons. They are now one kit primitive, `CostRow` and `CostSum` in `src/components/ui/CostRow.jsx`.
  - Each row shows an 18px icon for what the money buys, then the label with an optional second line, then the figure right-aligned in tabular numerals.
  - The sum has a 2px ink rule above it, the figure at `--text-title` 700, and the per-person figure under it. The label sits on the figure's baseline.
  - Icon map (`COST_ICON`):
    - bed: BedIcon
    - food: DiningIcon
    - flight: PlaneIcon
    - getting there: RouteIcon
    - transfers and local transport: BusIcon
    - between stops: TrainIcon
    - drive: CarIcon
    - tickets: TicketIcon
    - buffer: PiggyIcon
  - Used by:
    - ReceiptCard (the destination price card)
    - DestFood and DestPriceCard
    - PlanTotal (the planner)
    - BudgetResults
    - TripPriceCard
    - CostSummary (the Explore hover receipt)
- **One estimate notation.** Estimates show as `~€87 est.` (Money `est`, or `formatEst` where the figure sits inside a string). Places that changed:
  - the transfer pickers in TripItinerary and TripPlannerTab, which had hand-written tildes and no word
  - the leg summary, whose tilde now shows only when the leg is an estimate, alongside the existing est chip
  - the wizard's per-night price (`wizard.perNight` no longer has a tilde in any of the six languages)
  - receipt totals, where the "est." word stays at label size and is never title-sized
- **Flight link.** A flight pair now has one round-trip link, "View this return on Google Flights", instead of a one-way link on each row.
  - It comes from `FlightLink` and `googleFlightsLink(from, to, date, { back, lang })`, which builds a "returning" query and adds `hl` for the language.
  - The link is 44px tall, in `--action` with an underline, and has an ExternalIcon. The note "Prices may have changed" sits under it.
  - Used on the destination price card and the trip price card. FlightRow takes `linkOut={false}` there.
- **ExternalIcon** (an arrow leaving a box) replaces the text glyph "↗" on every outside link: CountryIntel, DayTripTransport, TripItinerary and TripPlannerTab. It uses a shared `.link-ext` rule.
- **Shared labels.** Copy is the same everywhere: "Bed", "Food and drink" and "Beds" (i18n aliases in six languages).
- **Dead CSS removed** (−616 lines in total):
  - the old line styles in 38-first-run, 64, 67, 70, 73, 74 and the planner sheets
  - `.cost-gauge`, `.cost-row`, `.cost-total`, `.xcard-cost` and `.xcard-preview-cost` in 18, 24, 25, 46 and 62
  - the stale 30px phone override on `.frr-sum-eur`
- **Fixture.** The contract fixture moves to `schema_version` 18. T536 regenerated it but never committed it.

## Files touched

App (continent-app), 40 files:
- New: `src/components/ui/CostRow.jsx`
- `src/components/ui/index.js`, `Icons.jsx` (ExternalIcon), `ReceiptCard.jsx`, `CostSummary.jsx`, `CountryIntel.jsx`, `flights/Flights.jsx`
- `src/lib/flights/flights.js`
- `src/browse/BudgetResults.jsx`, `DestFood.jsx`, `DestPriceCard.jsx`, `TripPriceCard.jsx`
- `src/planner/PlanTotal.jsx`, `TripItinerary.jsx`, `TripPlannerTab.jsx`, `DayTripTransport.jsx`, `GuidedTripWizardParts.jsx`
- `src/i18n/{en,de,es,fr,it,nl}.js`
- `src/styles/04-ui.css`, `18`, `24`, `25`, `38`, `46`, `62`, `64`, `67`, `70`, `73`, `74-dest-food`, `74-flights`, `items/70`, `planners/67`, `planners-held.css`
- `scripts/ci/fixtures/contract-min.json`

Root: the mirror of the above, this report, `Execution/_OPEN.md`.

## Commands run

- `npx eslint <touched files>`: 0 errors. Warnings are the existing fast-refresh notes and an unused-arg warning in CountryIntel's IntelLine, which this task did not touch.
- `npm test` on merged master: 588 of 588 pass. In the worktree, 3 tests fail only because `public/coverage.json` is absent there.
- `impeccable detect --json` on 11 touched files: `[]`.
- Dash and middot scan of every added line: none.
- `npm run build:pages`: PASS, 169 files.
- `npx wrangler pages deploy dist --project-name carta-app --branch main`: deployment a7ef8e93. No data changed, so there was no R2 upload.

## Config and secrets set

None.

## Before/after measurements

| | Before | After |
|---|---|---|
| Ways to draw a cost line | 5 | 1 (CostRow) |
| Cost lines with an icon (destination card, budget receipt, planner, trip card, hover) | flights only | every priced line |
| Flight links per flight pair | 2 one-way | 1 round-trip |
| Text "↗" glyphs on links | 4 | 0 |
| CSS and JSX lines (T537 diff) | | +481 / −616 |

## What broke and how it was fixed

- An earlier edit dropped TripPriceCard's `SLOT_KIND` (a no-undef error). Restored next to `LINE_KEY`.
- The Python edits wrote LF into files stored as CRLF (and the reverse), which made a 40,000-line diff. Each file's line endings were restored from HEAD before the commit, giving a real diff of 481/616.
- On a phone, the receipt total rendered at 30px with a title-sized "est.", because a leftover `.frr-sum-eur` media rule applied. Removed it. The "est." word is now `--text-label`.
- The total's label sat on the per-person line. `.costsum` now aligns on the baseline.

## End check (browser)

- **Dev server on the branch, desktop 1280 and phone 375:**
  - Destination price card (Vienna, 21 to 28 Nov, 2 people): Bed, Food and drink and Total rows, each with its icon. No horizontal overflow on the phone.
  - Budget search receipt: Bed, Food and drink, Buffer and Total, plus three "Not priced yet" rows, all with icons.
  - Wizard country list: every figure shows as `~€87 est.`.
- **Production** (www.carta-europetravel.com, bundle index-CaeDh32v.js): the Vienna card shows two flight rows (BRU to VIE €84, back €107) and one link to `google.com/travel/flights?q=Flights from BRU to VIE on 2026-11-21 returning 2026-11-28&curr=EUR&hl=en`, 44px tall with the external icon. No row-level links remain.
- **Not opened:** the trip planner's TripPriceCard flight link (built the same way, with the same props), the Explore hover receipt, the day planner and the PDFs. In dev, the trip wizard's Trips step said "No ready-made trip runs 0 days" with dates set in the URL, so the planner was not reached that way (T537-b).

## What is still open

- Some figures are not on CostRow yet:
  - TripItinerary's bed and extras rows (`itin-bed`, `itin-extras`), the trip summary rows (`tsum-row`) and CountryBrief's fold figures
  - Neighbourhoods hood prices, which have no estimate mark when `q` is not measured
  - FlightChip and pin labels
  - Dead code: `BreakdownSection`, `.itin-bd-sec`, and the second `pricedPartySize`

  Each is a small, separate change (T537-a).
- In dev, the trip wizard reaches "Trips" with 0 days when the dates come only from the URL. This was not investigated and may be an older bug (T537-b).
- The trip planner flight link, the Explore hover receipt, the day planner and the PDFs were not opened in the browser (T537-c).

## Rollback procedure

- App: `git -C continent-app revert -m 1 6a23f83`, then build and redeploy. The previous Pages deployment, db9a32f6, can also be promoted in the Cloudflare dashboard.
- Root: `git revert d8e02ffc5`.
- No data or schema change.
