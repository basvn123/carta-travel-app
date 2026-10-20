# T471: cost and logistics, audited and written into the roadmap

## Task ID

T471

## Date

2026-10-20

## What changed

The owner brought eight ideas:
1. a cheaper alternative (a "dupe") wherever a destination is proposed
2. a Lifestyle model in which every setting moves the price on a written basis
3. "Sleep nearby and save" for expensive cities
4. cost plus logistics as Carta's differentiator, carried across the app and its docs
5. a day planner that starts from suggestions and asks about pace, walking and children
6. an own engine for car, train and bus costs when there is no partner
7. Carta as the planning and budgeting brain on top of Google Maps
8. three long-term ideas: save from social media, a seasonal price and weather strip, and a planned versus actual wallet

This task audited the code and data behind each idea and checked the external facts. It wrote the systems out in a new plan file, `Roadmap/2.14-kosten-en-logistiek.md` (Dutch, like the roadmap). It added fifteen rows to `Roadmap/Carta roadmap.md`:
- phase 1: 1.12 to 1.14
- phase 2: 2.14 to 2.17
- phase 3: 3.10
- phase 4: 4.13 to 4.17
- phase 5: 5.9 and 5.10, parked until after launch

It also updated the phase 2 intro and the week plan, and pointed 4.4 at the new graph. Ideas 4 and 7 are planned only: the plan lists every file to change, and roadmap row 1.13 does the change once the owner picks the sentence. Idea 8b is already covered by roadmap rows 1.11 and 4.10, so it got no new row. No code changed.

The task also repaired the register. T470 changed "open" to "closed by T470" across `Execution/_OPEN.md`. That reworded two header lines and wrongly closed T030-a, T030-b and T031-a (Stripe owner steps), while T469-a to e, the rows T470 meant to close, stayed open. This commit restores the header, reopens the three Stripe rows, and marks T469-a to e closed by T470.

The audit found seven things.

**First, a licence risk.** The food basket of all 3,868 destinations is Numbeo data from June 2026. Numbeo needs a paid licence (from $260 a month) for commercial use.

**Second, Lifestyle prices only the bed and food.**
- Food is one national basket for 90% of places.
- The 284 stay-tier rows are fixtures, so the sleep choice changes nothing at 3,584 destinations.
- Foodie prices below Easygoing in Rome.

**Third, "Sleep nearby" cannot be honest today.** Satellites of Florence, Paris, Venice, Santorini, Lucerne and Bruges copy the hub's stay price. There are only 58 distinct city-level stay harvests, shared by 709 rows.

**Fourth, the Google Maps day link already exists but breaks on phones.** The code sends up to 9 waypoints; Google allows 3 in a mobile browser.

**Fifth, the ground-cost model is coarse.**
- Every distance is a straight line times a factor, and three different factors are in use.
- Leg tolls average the two endpoint countries.
- Vignettes add €0.
- Own-car tolls are always priced from Brussels.
- Fuel is a hand-typed June petrol figure.
- No connection is ever checked, while 8,701 FlixBus pairs sit unused on disk.

**Sixth, the day planner is closer to the idea than expected.** It already has guided tiles, a step budget and a step-free switch. Three gaps remain:
- an empty day has no suggestions;
- the trip-level pace never reaches the day;
- no POI carries child or pushchair data.

**Seventh, the market figures do not hold as a set.** The figures in the idea (61%, 63%, 1 in 2) trace to no single source. The verified ones are in the plan.

## Files touched

**Modified:**
- Roadmap/Carta roadmap.md
- Execution/_OPEN.md

**Created:**
- Roadmap/2.14-kosten-en-logistiek.md
- Execution/P11/T471-cost-logistics-roadmap.md

**Deleted:**
- None

## Commands run

The audits were done by sub-agents and were read-only:
- dupes and sleeping nearby
- Lifestyle pricing
- day planner and exports
- ground transport
- positioning, plus the fit of the long-term ideas
- web research: market claims, Eurostat and Numbeo licences, the Oil Bulletin, tolls and vignettes, rail fares, GTFS and MOTIS, the Google and Apple map URLs, the social platform APIs, ECB rates and the EDPB anonymisation guidelines

The satellite analysis ran haversine over the wire `continent-app/public/app_data.json` for ten hubs, with costs computed by the app's own `computeCosts` in a Node one-off. Scratch scripts are in the session scratchpad and are not committed.

```
git diff fc1ea0a68 ee98bb83e -- Execution/_OPEN.md   (to measure the T470 register damage: 5 lines)
```

## Config and secrets set

None.

## Before/after measurements

Not measured. This is a planning task. The plan file names the figures the later tasks must move:
- 70% of 40 known dupe pairs in the top three
- 30 cities within 20% of two public budget sources
- every satellite of the ten hubs with its own measured bed price
- 50 legs: drive time within 10%, toll and fuel within 15%, the real rail fare inside the range in 80% of cases
- an 8-stop day opening complete on an iPhone and a Pixel

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| T470 closed three open Stripe owner rows and reworded the register header | A blanket text replacement of "open" in `_OPEN.md` | Restored in this commit; T469-a to e marked closed by T470 as T470 intended |
| The idea's satellite example (Zermatt to a cheaper town within 30 km) | Straight-line radius; Cervinia is 15 km away but hours by road | The plan measures "nearby" in travel time from the graph (2.16), not in kilometres |

## What is still open

The owner has four calls to make. **T471-a, Numbeo** (pay or replace), is the one that blocks the launch. The other three are the positioning sentence (b), dupes across borders (c), and MOTIS on the Hetzner box (d).

Six defects go to the next tasks through the roadmap rows:
- the mobile Google Maps waypoint limit (1.14, T471-e)
- tolls from Brussels (4.15, T471-f)
- the Lifestyle math defects (2.14 and 4.17, T471-g)
- three documents that still say Carta prices flights (1.13, T471-h)
- the `source_km` provenance error (2.15, T471-i)
- dead or dishonest pieces (T471-j)

Phase 4 now holds seventeen rows. The plan names what can slide: 4.17 can go with 4.16, and 4.13 can go to the first week of phase 5.

`PRODUCT.md` and a new `user_knowledge.md` were being edited by another session during this task. They are not part of this commit.

## Rollback procedure

`git revert` the T471 commit. It touches only the two roadmap files, this report and the register. Reverting it also undoes the register repair, which would bring back the T470 damage, so a revert should keep the `_OPEN.md` hunk for T030-a, T030-b, T031-a, T469-a to e and the header.
