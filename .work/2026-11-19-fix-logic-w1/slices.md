# Slices: E1 totals golden set, before and after (G5)

`node scripts/eval/run.mjs logic-engines --check` follows the flag (default old); the table forces the path (`runGolden({ which })`, set `totals`).

| | old (flag off) | new (flag E1 on) |
|---|---|---|
| all 17 cases | 10 of 17 (all 10 current pass, 0 of 7 target) | 17 of 17 |
| class budget | current 2/2, target 0/2 | 2/2, 2/2 |
| class trip | current 2/2, target 0/1 | 2/2, 1/1 |
| class standing | current 3/3, target 0/1 | 3/3, 1/1 |
| class order | current 1/1, target 0/1 | 1/1, 1/1 |
| class currency | current 1/1, target 0/1 | 1/1, 1/1 |
| class food | current 1/1, target 0/1 | 1/1, 1/1 |
| country ES | current 5/5, target 0/4 | 5/5, 4/4 |
| country EU (money rules, no country) | current 5/5, target 0/3 | 5/5, 3/3 |
| persona island-hopper | current 2/2, target 0/2 | 2/2, 2/2 |
| persona slow-culture | current 2/2, target 0/1 | 2/2, 1/1 |
| other personas (backpacker, foodie, friends-out, no-car-rail) | target 0/1 each | 1/1 each |

No current case moved: the old path and the new path agree wherever today's answer was right (the total stays the engine's figure, V1).

Whole harness, flag default old: 69 of 105 cases (36 target open: E1 7 + the E5, E6, E8 targets). Worst slice stays persona ski (E5, wave 5).

Persona shadow diff (`shadow/shadow-E1.md`): on the synthetic catalogue every one of the 12 personas sees the "getting there: before" wording and the "without beds at stop 1" trip label; 4 (family-toddler, beach-family, friends-out, skier) also gain REUS in fits or tight, a place the search used to drop. `before/shadow-E1.md` is the committed characterisation of today's answers.

Limit: the golden and persona sets use a synthetic catalogue (the committed real-place fixture has no bed or food prices). The effect of A-13 on the published catalogue (how many places lose a food price when a basket lacks an item the Lifestyle uses) was not measured here.
