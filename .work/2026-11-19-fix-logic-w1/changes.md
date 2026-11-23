# Changes: logic wave 1 (E1, E10, G11)

Commits: `e5dba13476` eval first; `01dcc7017a` E1; `aefd4113da` E10 + G11; the UI commit after it.

| Row | Outcome | Test |
|---|---|---|
| A-1 | fixed behind E1: `quoteTrip().missing/complete`, receipt line `bedsMissing`, stay tile `leftOut` | honestTotals "the trip names the stop..." |
| A-9 | fixed behind E1: priced inside the catalogue (`opts.destinations` or `dests`) | honestTotals A-9; golden A9 |
| A-10 | deliberate, wording: `there: 'before'` and "before getting there" on the Ask receipt | honestTotals A-9/A-10 |
| A-13 | fixed behind E1: null on a missing used item | honestTotals A-13 |
| A-17 | fixed behind E1: `quoteNights().noWay`, flight row "Not yet" on the place card | honestTotals A-17 |
| A-20 | fixed behind E1: `toEur` null, "not converted" note on past-trip spend | honestTotals A-20 |
| B-4 | fixed behind E1: `no_fare`, `orderByTotal`, bounds, histogram, filter in Places | honestTotals B-4; golden B4 |
| B-5 | moot on HEAD: price chain keeps the row as stay-only sorted last | (reading, `ways.js`) |
| H-2, H-4 ranking half | fixed behind E1: badge and quick filter never "under budget" for a partial trip, price priority sorts partial last | honestTotals H-2 |
| H-8 comparison half | fixed behind E1: day budget against bed plus food (`budgetCompared`) | honestTotals H-8 |
| G-6 median half | moot: `styleDay.js` already skips `tierFallback` | (reading) |
| J-5, J-7, J-9, J-12 | fixed: `paywallDecision.js` behind E10; checkout and webhook server fixes (not flagged) | paywallDecision, idempotency |
| J-5 owner, J-9 owner | `docs/owner/stripe.md` step 6 | |
| G11 | webhook replay and sync push twice tested | idempotency |

Tests fail on the old path: honestTotals asserts both `OLD` (today) and `NEW` answers for every site; the golden totals set is 10 of 17 with E1 old and 17 of 17 with E1 new. The E10 `decide()` has no old code to fail (the old rule was inline).

Deviations: B-4 keeps `grand_total` and adds `no_fare` instead of `total: null` (V1 and the many readers of the total); `budgetStanding` returns state `over` for a partial total already over budget (owner default 16).

Files: continent-app/src/lib/{flags,currency,budgetSearch,runtime_pricing,tripTotal,paywallDecision,checkout}.js, src/lib/price/{gaps,stay,trip,tiles,nights,compose}.js, src/lib/recommend/{rank,trips,compare}.js, src/lib/ask/compose.js, src/lib/{planPdf,share/receipt}.js, src/hooks/{usePaywall.jsx,useDestinationSearch.js}, src/planner/{PlanTotal.jsx,trip/CostCard.jsx,trip/useTripSave.js,finder/finderText.js}, src/browse/{DestPriceCard,AskSearchFull}.jsx, src/auth/{pastTripMemory.js,PastTripForm.jsx,TripMemoryView.jsx}, src/i18n/{en,nl,de,fr,es,it}.js, src/styles/75-ask.css, scripts/eval/{shadow-diff.mjs,adapters/logic-engines.mjs,lib/logic-engines.mjs,lib/totals-engine.mjs}, scripts/verify_logic_w1.mjs, tests/{honestTotals,paywallDecision,idempotency}.test.mjs, tests/fixtures/logic-golden/{totals,totals-places}.json; supabase/functions/{checkout,stripe-webhook}/index.ts, supabase/functions/_shared/{checkoutUrls,stripeEvents}.mjs; docs/logic/{price,quotas-paywall}.md, docs/HANDBOOK.md, ROADMAP.md, docs/owner/{stripe,product-decisions}.md.
