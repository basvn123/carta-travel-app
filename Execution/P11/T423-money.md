# T423: one money formatter (roadmap 1.2)

## Task ID

T423

## Date

2026-10-13

## What changed

Every euro in the app now comes from one formatter, `continent-app/src/lib/money.js` (`formatMoney`, `formatApprox`, `formatEst`, `formatMoneyRange`), and a `<Money>` component in the kit. The eleven app-side helpers that each formatted money their own way (`eur`, `eurExact`, `eurDay`, `eurCents`, `eurRange`, `eur0`, `eurFmt`, `formatPrice`, the inline Intl call on the journey page) are now one-line aliases over it, so the symbol sits where the reader's language puts it everywhere (€87 in English, 87 € in German and French) and digits group by locale. The owner's precision rule is applied by context: comparison contexts (cards, pins, lists, rails, filters, destination facts) stay whole euros, while the trip planner, its legs and extras, the expense ledger, past trips, the trip memory and the trip export switched to cents (51 call sites). No i18n string carries a euro sign any more: the € came out of 19 templates in all six languages and their live call sites pass a formatted figure. Estimates take one shape, `~€87 est.` (the tilde joined, the language's own short word after: est., gesch., stim.), replacing "~ €x", "est. €x" and the spaced tilde on the receipts. Short per-person forms (/p, p.p., /pers., /P., /pp hard-coded in two components) became the one phrase each language already used ("a person", "per persoon", "pro Person", "par personne", "por persona", "a persona"). The range joiner, hard-coded as English "to", now follows the language (to, tot, bis, à, a). The pass prices in the Account panel follow the app language instead of always en-GB. Three keys were added to each language: `money.est`, `money.perPerson`, `money.onRequest`.

## Files touched

**Created (app, mirrored in root):**
- continent-app/src/lib/money.js
- continent-app/src/components/ui/Money.jsx

**Modified:**
- continent-app/src/lib/format.js, costIndex.js, lifestyleSlider.js, journeys.js, pricing.js, tripExport.js, destinationPdf.js
- continent-app/src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js
- continent-app/src/browse/CountryPage.jsx, DestinationPage.jsx, DestinationsTab.jsx, ExploreTab.jsx, GettingThere.jsx, JourneyPage.jsx, JourneysSection.jsx, LandingPage.jsx, TrailPage.jsx, TripFilters.jsx
- continent-app/src/components/CountryIntel.jsx, FirstRunReceipt.jsx, ReceiptCard.jsx, ui/index.js
- continent-app/src/hooks/usePlaceExits.js
- continent-app/src/planner/DayTripTransport.jsx, ExpenseLedger.jsx, TravelLegsSection.jsx, TripExtras.jsx, TripPlannerTab.jsx
- continent-app/src/auth/PastTripForm.jsx, TripMemoryView.jsx
- continent-app/src/styles/04-ui.css (.money)
- Execution/_OPEN.md (T417-c already closed; rows T423-a to T423-d)

**Created (root):**
- Execution/P11/T423-money.md

## Commands run

```
python i18n_money.py src/i18n          (scratchpad script: six languages, each key matched exactly once)
node moneycheck.mjs                    (formatMoney in six locales)
npm run test                           (368 of 368 pass)
npx vite build && npx vite preview --port 5206 --strictPort
node scripts/verify_quality_floor.mjs t423-money --port=5206 --out=C:/Users/Gebruiker/Documents/Portfolio/design-1.2-baseline
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before (T418) | After | Delta |
|---|---|---|---|
| Implementations that format a euro (app) | 12 | 1 (`formatMoney`; the old names are aliases) | -11 |
| i18n templates with a baked euro sign | 19 keys x 6 languages = 114 | 0 | -114 |
| Estimate notations | 5 | 1 (`~€87 est.`; the planner's tag form renders the same) | -4 |
| Short per-person forms | 7 | 1 phrase per language | -6 |
| Locale sources for money | 4 | 1 (app language, or an explicit language passed through) | -3 |
| Planner line items in whole euros next to cents | 17 call sites in TripPlannerTab alone | 0 | |
| Range joiner in the reader's language | English only | six languages | |
| Unit tests | 368 pass | 368 pass | 0 |
| Quality floor, 107 screens | 2 phone targets, 0 console errors | same | 0 |

Measured on the built app: the planner reads "~€556.48 est." and "€278.24 a person"; the destination page facts read "€87" and "€31".

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| "40 € to 60 €" in German | `formatRange` hard-coded the English word | The joiner follows the app language |
| A double tilde would have shown on the leg summary | The caller prefixed `~` and the new template does too | The caller passes the bare figure with `~`, the template adds the word |
| Two shell heredoc paths mangled while scripting | Backslashes and a Windows path in a URL | Scripts written as files; pathToFileURL |

## What is still open

T423-a: the destination PDF still prints "EUR 12" through its own helpers; it moves to `formatMoney` with its fonts in the PDF task (T421-b). T423-b: nine i18n keys whose euro sign was removed have no caller left (`filter.perDirection`, `detail.eachLocalRate`, `detail.perNightApprox`, `detail.perDayApprox`, `detail.perTwoDirections`, `detail.rentalMetaMany`, `detail.rentalMetaOne`, `detail.viaGround`, `dest.tripTotal`); a dead-string pass deletes them. T423-c: a few templates still join two figures with a literal word (`journey.fltBetween`, `brief.dayCostRange`, `match.budget`, which also spells out "euros"); they move onto `formatMoneyRange` in their tab's migration. T423-d: the design-lint `money-literal` rule (a euro sign in JSX or i18n, `toFixed` on a price, a call to a retired helper) is written in T425, so the aliases can then be retired call site by call site. The planner showing three different totals for one trip is roadmap item 2.2 and unchanged here.

## Rollback procedure

Revert the T423 commits in both repos. No data or storage format changed; only display strings.
