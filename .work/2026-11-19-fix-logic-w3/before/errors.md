# Errors

58 of 143 golden cases fail (0 current, 58 target). Sample of up to 50, grouped.

| Group | Cases | Engine wave that fixes it |
|---|---|---|
| a fine month is missing from climate.best (shoulder season, ski, winter) | 13 | E5 one month (fit, source, heat) |
| a total prints lower for a missing part | 7 | E1 honest totals |
| no place is fine in the winter months (coverage) | 6 | E5 one month (fit, source, heat) |
| persona top 5 misses places a traveller would accept | 6 | E6 one place ranker |
| a missing bed tier or a room count is not one ladder (dorm) | 3 | E3 one stay ladder |
| a missing bed tier or a room count is not one ladder (rooms) | 3 | E3 one stay ladder |
| a missing bed tier or a room count is not one ladder (measured) | 3 | E3 one stay ladder |
| equal scores follow file order (no fame tiebreak) | 2 | E6 one place ranker |
| the way back to the stay is not part of the day | 2 | E8 one day clock |
| a party is counted differently per screen (cars) | 2 | E2 one party model |
| a party is counted differently per screen (footprint) | 2 | E2 one party model |
| a missing bed tier or a room count is not one ladder (cleaning) | 2 | E3 one stay ladder |
| a party is counted differently per screen (daybudget) | 1 | E2 one party model |
| a party is counted differently per screen (kind) | 1 | E2 one party model |
| a party is counted differently per screen (limits) | 1 | E2 one party model |
| a missing bed tier or a room count is not one ladder (row) | 1 | E3 one stay ladder |
| a missing bed tier or a room count is not one ladder (home) | 1 | E3 one stay ladder |
| a missing bed tier or a room count is not one ladder (room) | 1 | E3 one stay ladder |
| a missing bed tier or a room count is not one ladder (hotel5) | 1 | E3 one stay ladder |

Biggest group: a fine month is missing from climate.best (shoulder season, ski, winter) (13 cases), fixed by E5 one month (fit, source, heat).

## a fine month is missing from climate.best (shoulder season, ski, winter)

- month-fit/FAO-m10 (target): got false, want true. .work/2026-11-17-app-logic-audit/probes/F-personas.out.txt: Faro Oct comfort 78 great, not in best
- month-fit/lagos-pt-m10 (target): got false, want true. .work/2026-11-17-app-logic-audit/probes/F-personas.out.txt: Lagos Oct comfort 78 great
- month-fit/albufeira-m10 (target): got false, want true. .work/2026-11-17-app-logic-audit/probes/F-personas.out.txt: Albufeira Oct comfort 78 great
- month-fit/HER-m10 (target): got false, want true. .work/2026-11-17-app-logic-audit/probes/F-personas.out.txt: Heraklion Oct comfort 84 great
- month-fit/JTR-m10 (target): got false, want true. Santorini Oct: warm sea, quieter streets (comfort great)
- month-fit/st-anton-m1 (target): got false, want true. .work/2026-11-17-app-logic-audit/probes/F-personas.out.txt: ski in January, best lists Jun to Aug only
- month-fit/st-anton-m2 (target): got false, want true. .work/2026-11-17-app-logic-audit/probes/F-personas.out.txt: ski season
- month-fit/zermatt-m2 (target): got false, want true. .work/2026-11-17-app-logic-audit/probes/F-personas.out.txt: Zermatt ski
- month-fit/chamonix-m1 (target): got false, want true. .work/2026-11-17-app-logic-audit/probes/F-personas.out.txt: Chamonix ski in January
- month-fit/canazei-m1 (target): got false, want true. .work/2026-11-17-app-logic-audit/probes/F-personas.out.txt: Canazei ski in January
- month-fit/NCE-m10 (target): got false, want true. Nice Oct: comfort good, 23 C, quieter
- month-fit/bruges-m5 (target): got false, want true. Bruges May: the wire's climate.best and monthly comfort
- month-fit/RVN-m1 (target): got false, want true. Rovaniemi in January: the season for lights and snow (winter-tagged place)

## a total prints lower for a missing part

- totals/A1-bcn-reus-no-bed (target): got {"bedsLeftOut":""}, want {"bedsLeftOut":"1"}. A-1 probe: Barcelona 3 nights plus Reus 4 nights, Reus with no bed price, adds 0 and reads as complete (proposal-simplify.md E1 test)
- totals/A9-repaired-bed-fits (target): got {"probe":"none"}, want {"probe":"fits"}. A-9: a place whose scraped bed is out of bounds is repaired with its country median in the catalogue; the search priced it alone and dropped it
- totals/A10-public-before-there (target): got {"there":""}, want {"there":"before"}. A-10 and owner default 1: the search leaves getting there out unless it prices it, and says so
- totals/A13-missing-food-item (target): got {"total":248}, want {"total":null}. A-13: a missing food item counted as 0 made the day cheaper
- totals/A20-unknown-currency (target): got {"eur":100}, want {"eur":null}. A-20: an unknown code was converted at par
- totals/H2-partial-not-fits (target): got {"state":"fits"}, want {"state":"partial"}. H-2 and owner default 1: 400 euros of a trip with no flight is never fits
- totals/B4-fareless-last (target): got {"order":"PALMA,LISB,BCN"}, want {"order":"LISB,BCN,PALMA"}. B-4: Places sorted a plane with no fare first as the cheapest, T597-a

## no place is fine in the winter months (coverage)

- month-fit/coverage-m1 (target): got 0, want ">= 5". .work/2026-11-17-app-logic-audit/proposal-simplify.md E5 test: every month has at least 300 of 3,855 places fine (7.8%); 5 of this 60-place fixture; today Jan, Feb, Nov and Dec have 0
- month-fit/coverage-m2 (target): got 0, want ">= 5". .work/2026-11-17-app-logic-audit/proposal-simplify.md E5 test: every month has at least 300 of 3,855 places fine (7.8%); 5 of this 60-place fixture; today Jan, Feb, Nov and Dec have 0
- month-fit/coverage-m3 (target): got 2, want ">= 5". .work/2026-11-17-app-logic-audit/proposal-simplify.md E5 test: every month has at least 300 of 3,855 places fine (7.8%); 5 of this 60-place fixture; today Jan, Feb, Nov and Dec have 0
- month-fit/coverage-m10 (target): got 2, want ">= 5". .work/2026-11-17-app-logic-audit/proposal-simplify.md E5 test: every month has at least 300 of 3,855 places fine (7.8%); 5 of this 60-place fixture; today Jan, Feb, Nov and Dec have 0
- month-fit/coverage-m11 (target): got 0, want ">= 5". .work/2026-11-17-app-logic-audit/proposal-simplify.md E5 test: every month has at least 300 of 3,855 places fine (7.8%); 5 of this 60-place fixture; today Jan, Feb, Nov and Dec have 0
- month-fit/coverage-m12 (target): got 0, want ">= 5". .work/2026-11-17-app-logic-audit/proposal-simplify.md E5 test: every month has at least 300 of 3,855 places fine (7.8%); 5 of this 60-place fixture; today Jan, Feb, Nov and Dec have 0

## persona top 5 misses places a traveller would accept

- rank/family-toddler (target): got 0.2, want "P@5 >= 0.4". persona family-toddler of tests/personas_v5.json (gate 7); relevant places are an owner-judged hand pick, not from the audit
- rank/slow-culture (target): got 0.2, want "P@5 >= 0.4". persona slow-culture of tests/personas_v5.json (gate 7); relevant places are an owner-judged hand pick, not from the audit
- rank/foodie (target): got 0.2, want "P@5 >= 0.4". persona foodie of tests/personas_v5.json (gate 7); relevant places are an owner-judged hand pick, not from the audit
- rank/AT-skier (target): got 0.33, want "P@3 >= 0.34". AT places only, persona skier; relevant places are an owner-judged hand pick, not from the audit
- rank/PT-beach-family (target): got 0.33, want "P@3 >= 0.34". PT places only, persona beach-family; relevant places are an owner-judged hand pick, not from the audit
- rank/DE-wellness (target): got 0.33, want "P@3 >= 0.34". DE places only, persona wellness; relevant places are an owner-judged hand pick, not from the audit

## a missing bed tier or a room count is not one ladder (dorm)

- stay-ladder/E3-dorm-venice (target): got {"tier":"home","fallback":true,"unit":"place"}, want {"tier":"hotel3","fallback":true,"unit":"room"}. A-2 and G-6: a solo dorm request in Venice (no hostel) fell to the entire place at 194 a night; owner default 3: dorm, private, 2-star, 3-star, so the 3-star room at 84
- stay-ladder/E3-dorm-santorini (target): got {"tier":"home","fallback":true,"unit":"place"}, want {"tier":"hotel2","fallback":true,"unit":"room"}. A-2: Santorini has no hostel; the ladder reaches the 2-star room at 62 before the entire place at 115
- stay-ladder/E3-dorm-children (target): got {"unit":"bed","units":3,"total":225}, want {"unit":"bed","units":4,"total":300}. A-15: children in a dorm get one bed each (owner default 4); two adults and two children are four beds, 4 x 25 x 3 nights; two children sharing one bed was the old half bed

## a missing bed tier or a room count is not one ladder (rooms)

- stay-ladder/E3-rooms-2a-2c (target): got {"unit":"room","units":2,"total":576}, want {"unit":"room","units":1,"total":288}. A-4: children share the parents' room; owner default 4, up to 2 children in a room; one room, 3 nights at 96
- stay-ladder/E3-rooms-2a-1c (target): got {"unit":"room","units":2}, want {"unit":"room","units":1}. A-4: 2 adults + 1 child book one room, not two
- stay-ladder/E3-rooms-2a-3c (target): got {"unit":"room","units":3}, want {"unit":"room","units":2}. A-4: a room holds 2 children, so three children need a second room

## a missing bed tier or a room count is not one ladder (measured)

- stay-ladder/E3-measured-mad (target): got {}, want {"measured":true}. REQ-data-2: pipeline/stays/bed_rules.py is_measured: q measured, beds present and captured set
- stay-ladder/E3-measured-legacy (target): got {}, want {"measured":false}. REQ-data-2: a legacy block (q measured, captured null) is not a measurement we can date, so it reads Not yet measured
- stay-ladder/E3-measured-modelled (target): got {}, want {"measured":false}. REQ-data-2: a modelled block reads Not yet measured

## equal scores follow file order (no fame tiebreak)

- rank/tie-9.6-by-fame (target): got ["gem:taormina","gem:hallstatt","DBV","SZG"], want ["SZG","DBV","gem:hallstatt","gem:taormina"]. .work/2026-11-17-app-logic-audit/probes/E-month.out.txt: four 9.6 places tie and follow catalogue order; fame 1,284, 1,106, 621, 335
- rank/tie-9.6-reversed-input (target): got ["DBV","gem:taormina","SZG","gem:hallstatt"], want ["SZG","DBV","gem:hallstatt","gem:taormina"]. same four places in another input order must give the same order (a tiebreak, not file order)

## the way back to the stay is not part of the day

- day-feasibility/paris-ends-1745-return-30 (target): got {"legsInOrder":true,"dinnerNotEarly":true,"lunchBetweenStops":true,"fits":true}, want {"legsInOrder":true,"dinnerNotEarly":true,"lunchBetweenStops":true,"fits":false}. the way back to the stay is part of the day (audit I-4, proposal E8): a day that ends 17:45 and needs 30 minutes home does not end before 18:00
- day-feasibility/barcelona-gaudi-stay-in-sitges (target): got {"legsInOrder":true,"dinnerNotEarly":true,"lunchBetweenStops":true,"fits":true}, want {"legsInOrder":true,"dinnerNotEarly":true,"lunchBetweenStops":true,"fits":false}. the day ends 16:55 at the Gothic Quarter; the train back to Sitges is 70 minutes, so the day ends 18:05 (audit I-4)

## a party is counted differently per screen (cars)

- party/E2-cars-4a-1b (target): got {"explore":1,"places":1,"planner":2,"day":2}, want {"explore":2,"places":2,"planner":2,"day":2}. B-9 probe P8: 4 adults and a baby are one car on Explore and Places and two in the planner; owner default 2, the baby takes a seat, so two everywhere
- party/E2-cars-3a-1c-1b (target): got {"explore":1,"places":1,"planner":2,"day":2}, want {"explore":2,"places":2,"planner":2,"day":2}. B-9: five car seats are two cars on every screen

## a party is counted differently per screen (footprint)

- party/E2-footprint-4a-1b (target): got {"kg":32.4}, want {"kg":64.8}. B-10: a party that needs two cars emits two cars' grams shared over its seats: 800 km x 162 g x 2 cars / 4 seats = 64.8 kg
- party/E2-footprint-6a (target): got {"kg":25.9}, want {"kg":43.2}. B-10: six adults are two cars, 800 x 162 x 2 / 6 = 43.2 kg; the cap of 5 seats shared one car's grams over five and gave 25.9

## a missing bed tier or a room count is not one ladder (cleaning)

- stay-ladder/E3-cleaning-4a (target): got {"unit":"place","units":2,"cleaning":52}, want {"unit":"place","units":2,"cleaning":104}. A-3: four adults book two places for two and each is cleaned; cleaning was charged once (52)

## a party is counted differently per screen (daybudget)


## a party is counted differently per screen (kind)


## a party is counted differently per screen (limits)


## a missing bed tier or a room count is not one ladder (row)


## a missing bed tier or a room count is not one ladder (home)


## a missing bed tier or a room count is not one ladder (room)


## a missing bed tier or a room count is not one ladder (hotel5)

