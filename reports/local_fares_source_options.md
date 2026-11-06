# Local transport fare: choosing the source (D10, T714-b)

Prepared T1115, 2026-11-06. For the owner's decision 4, parked as "Not now". Scope: a single ticket and a 24 hour pass for 127 metros first (`reports/local_fares_metros_127.csv`), then 614 cities. Today 0 of 3,868 places carry a fare.

| | A. Curated operator fare pages | B. Licensed dataset |
|---|---|---|
| What it is | Carta reads each city's own tariff page (BVG, TfL, RATP, ZTM...) and records ticket, day pass, currency, URL, date. | A paid or open-licence feed of urban transit fares (a fare-data vendor, or GTFS fare tables where an operator publishes them). |
| Cost | No licence fee. About 127 pages at 10 to 15 minutes each, roughly 25 to 30 hours of one-off work, mostly by a session with web access; the next 614 cities about 5 times that. | A licence fee, quoted per vendor; not known today and not priced in this note. Setup is small once chosen: one importer and a city mapping. |
| Licence | Fares are facts, but pages carry their own terms. Store the number and the URL only, never page text or tables. Record the source per row (the `source` key) and list the operators in `docs/tos/data_licenses.md`. | Set by the contract. Check that it allows storing and showing values in a public app, that attribution is shown, and what happens to stored values when the contract ends. A licence that bans caching would block the build. |
| Coverage | Complete by construction for the cities we choose; some operators show prices only in a PDF or an app. | Strong in large metros, patchy in small cities and in the Balkans, Baltics and Nordic towns; 100 percent coverage should not be assumed. |
| Refresh effort | Fares change about once a year per city, mostly January. A yearly pass of 127 pages is about 20 hours, or a script that fetches each page and flags a changed number for a human check (the build box has network; the cloud sessions do not). | A scheduled import, near zero effort per refresh, but only as fresh as the vendor. |
| Quality | Highest: each value is read from the operator, with a date. Matches the "Measured" label. | Depends on the vendor's own method; ask for a date per row. Without one the value can only be shown as `modelled`. |
| Risks | Operator sites move or change layout; zone rules differ (zone 1 vs whole network) and need a written rule per city. | Lock-in, cost drift, a vendor that stops. |

Recommendation (a view, not the decision): start with A for the 127 metros, because it costs no licence and is the honest, dated source the app promises; revisit B only if the vendor's licence allows storing values and its coverage beats A for the 614 cities. The roadmap checklist (I-c) already says "a curated table you approve, not a paid API", which favours A.

What stays the same either way: the field shape in `docs/SCHEMA.md` ("Planned: local transport fare per place"), the engine in `lib/price/priceDay.js`, and the empty state, where a place with no fare shows "Not yet measured".
