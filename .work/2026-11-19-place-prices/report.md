# Run report: place card, receipt and flights (G12, D10)

- **Status:** done; judge 1 FAIL with every fix then made and verified by script (4a596afaeb, e374a2b029); shipped at the owner's request
- **Date:** 2026-11-19 to 2026-11-20 · L2 · crew:design, the session orchestrated only
- **Proposal approved:** https://claude.ai/artifact/5x3imuLbjbF54c56JkbYkt v3 (card A, airline badges with logos, the may-change note in the link's info)
- **Branch:** `p15-place-prices` from main bf6eb53383
- **Undo:** `git revert` the run's commits (7268045a59 to the report commit). Production D1 `carta_flights`: `airlines.logo` was reset to NULL for all 125 rows (owner approved) so the sweep copies the logos again; one-way, harmless (the sweep sets it back as it copies).

## Summary
Under each photo two lines: name and score with the figure, country with its basis. A tap opens one receipt (no tabs) whose total always equals the card in all four price-basis settings; the chips under the total are the travel style and settings that produce it and open the Style Studio or that Settings step; Bed, Food and drink and the way there open in place to the bed tiers, eating styles and other ways with this place's prices, changing this trip only; one action, one honest insight line. About 35 explaining sentences are gone. The flights screen is per person always, shows only freshly checked days with breaks over gaps, every live flight of a day sorted by the shown price with Show all, a fast retry, airline logos over coloured code badges, and "Book on Google Flights" with the source, check date and may-change note behind an info button. Band: no line under the phone header, Browse wraps, the desktop settings line starts on the field's edge.

## Checks
- Card = receipt in four basis cells: 48 of 48 checks (en, nl, de; 360 to 1440); new `tests/priceReceipt.test.mjs`.
- Flights with live data (BRU and AMS to Rome): bars, sorted rows, Show all, info, retry on a 502, logos and badges.
- verify_band 97/97, verify_smooth 324/324, verify_rail_arrows 29/29, verify_filters pass, verify_destinations pass; css-routes --check passes; design-lint 0 new; eslint 0 errors; impeccable clean.
- Full npm test before the last fix round: 2363 tests, 2316 pass, 34 fail (base set on this Windows machine plus css-routes and design-lint, both fixed after).

## Open
- Rail cards no longer show "good in {month}" or the hidden-gem mark (the two-line card); the place page keeps them.
- Airline logos return over the next sweep runs (25 a publish).
