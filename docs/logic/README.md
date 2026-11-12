# Logic catalogue

ROADMAP item B3. Every rule the code applies that a traveller would notice (a formula, weight, threshold, band, sort order, fallback, cap, cache time, eligibility rule) has one entry here: what it decides, the constant or config key with its file and value, and the test that pins it, or "no test". Written from the code on 2026-11-06 (T1132); where the HANDBOOK and the code disagreed, the code was written down and the disagreement is listed at the end of each file and in `docs/owner/`.

| File | Prefix | Covers | Rules | No test |
|---|---|---|---|---|
| [rating.md](rating.md) | RATING | Place rating v5, appeal, beauty, depth, fame, POI tiers, nature on the ladder | 37 | 20 |
| [price.md](price.md) | PRICE | Price request, party, lifestyle, food, beds, day price and bands, trip total, flights display | 45 | 2 |
| [recommendation.md](recommendation.md) | REC | Taste profile, personal match, For you, trip finder, slots, together | 38 | 3 |
| [seasons-crowds.md](seasons-crowds.md) | SEASON | Climate strip, best months, when logic, crowds by month, sea temperature | 36 | 15 |
| [trails.md](trails.md) | TRAIL | Trail selection, rating, difficulty, names, distance and time, cycling | 38 | 21 |
| [ask.md](ask.md) | ASK | Ask Carta intent, retrieval, ranking, answers, limits, index build | 40 | 9 |
| [plan-day.md](plan-day.md) | PLANDAY | AI day plan, day planner hand-off, suggest-city | 34 | 16 |
| [quotas-paywall.md](quotas-paywall.md) | QUOTA | AI quotas and caps, the Pass, paywall gates, checkout and webhook | 30 | 13 |

Not yet done (the second half of B3): the IDs are catalogue IDs only. Tagging each rule in the code (`// LOGIC: PRICE-012`, `# LOGIC: RATING-004`) and the two-way CI check `scripts/docs/logic_check.py` are open (register row T1132-dx). Until then line numbers drift; the constant name is the stable handle. A task that changes a rule updates its entry in the same commit.
