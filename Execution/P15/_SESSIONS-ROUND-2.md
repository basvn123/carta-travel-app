# Round 2: the 50 sessions after S44

The next 50 sessions once S44 of `_NEXT-50-SESSIONS.md` is done:
- **S45 to S50** finish the first plan (task numbers T1129 to T1134, unchanged).
- **S51 to S94** are new, with task numbers **T1135 to T1178** reserved in order.
- **S95 to S112** (wave 10: trail quality and external validation) were added the same day, with task numbers **T1179 to T1196** reserved in order.

The same rules apply as in `_NEXT-50-SESSIONS.md` ("Rules for running many sessions"), including rule 8: a session that picks a tool, library, model, service, data source or method runs a research subagent first (CLAUDE.md step 3).

Written 2026-11-06 from ROADMAP.md as it stood that day. Before starting, check that the decisions and owner steps marked **Gate** are done (the owner checklist and `_HANDOVER-2026-11-05.md`).

## Order and dependencies

- **E1 (eval gate) before** E2, E7 and the F track: nothing changes a model or a ranking without a score to compare.
- **D1 and D2 (S49, S50) before** D3, D4 and D15: the contract and the quality rules come first.
- **D6 before D15:** the gap list decides which places to add.
- **F6 (eval platform) before** F1 to F4.
- **Migrations:** D3 is a schema change. Sessions writing migrations take the next free number at their start and never run in parallel.
- **Deploys are still the owner's.** Round 2 builds and tests; going live needs a deploy after each wave.

## S45 to S50: finish the first plan

| S | Task | Item | Scope |
|---|---|---|---|
| 45 | T1129 | I11 | Product analytics, cookieless |
| 46 | T1130 | K5 | Data stories (yearly basket per country, Belgian angle first) |
| 47 | T1131 | K14 | Automated data blog, part 1 |
| 48 | T1132 | B3 | Logic catalogue |
| 49 | T1133 | D1 | One machine-readable contract |
| 50 | T1134 | B7, D2 | Drift checks and a first quality scorecard |

## Wave 6: AI evaluation and data quality (S51 to S63)

| S | Task | Item | Scope | Model | Gate | Done when |
|---|---|---|---|---|---|---|
| 51 | T1135 | E-R3 | Research: which models, hosted where, answer each AI feature best per euro now and at 1,000, 10,000 and 100,000 monthly users (Workers AI, Gemini, open models via EU providers, CPU on the box, a rented GPU, on device) | Sonnet | None | Cost and quality table and proposed switch points |
| 52 | T1136 | E1 | Ask eval gate: a question set with expected places and facts, recall and grounding scores, run in CI on every Ask change | Opus | None | A score per run; a drop fails the check |
| 53 | T1137 | E3 | One guardrail module and one model-access module for every AI call (Ask, plan-day, suggest-city, parse-booking, pipeline jobs) | Opus | None | All calls go through it; a provider is a config change |
| 54 | T1138 | E7 | Model strategy: apply E-R3, move batch jobs that pass E1 to the box's CPU, write the switch triggers | Opus | Box access; moving a live feature off Gemini is the owner's decision | Cost per 1,000 calls and quality per feature recorded; triggers written |
| 55 | T1139 | E4 | LLM observability: tokens, cost and latency per call, privacy-safe | Sonnet | Self-hosted tracing on the box (owner) | A weekly cost and latency view in admin |
| 56 | T1140 | E5 | Prompt registry: every prompt versioned with its eval score | Sonnet | None | Prompts load from the registry |
| 57 | T1141 | E2 | Retrieval upgrades, including the reranker question (E-R2), measured on E1 | Opus | None | E1 recall up, latency within budget |
| 58 | T1142 | D2 | Quality engine, part 2: rules for every must-have field, the admin Data health panel, the 90-day trend | Opus | None | A drop of more than 2 points on a must-see field fails the run |
| 59 | T1143 | D3 | Provenance and freshness per field (`_src`, `_asof`); sources registry generated | Opus | Schema migration, run alone | Every key block carries its source and date |
| 60 | T1144 | D4 | Truth set: 100 places, 25 trails, 25 beaches and lakes sampled; tooling and a text check against cited sources (offline in a session or via Gemini, never the Claude API) | Opus | The owner verifies the sample by hand | A score per release |
| 61 | T1145 | D6 | Coverage fairness: a parity table per country, region and language | Sonnet | None | `docs/data/` table; each gap a backlog item |
| 62 | T1146 | D15 | Catalogue gaps, part 1: candidate places per gap from the existing sources, through the same rules and checks | Opus | The owner reviews the add list per country | A reviewed add, merge and remove list |
| 63 | T1147 | D15 | Catalogue gaps, part 2: apply the list, run the pipeline, keep the contract and coverage gate green | Sonnet | Part 1 approved | Places added and pruned, each change logged |

## Wave 7: the intelligence track (S64 to S72)

| S | Task | Item | Scope | Model | Gate |
|---|---|---|---|---|---|
| 64 | T1148 | F6 | Eval and LLMOps platform: one runner and results format for every eval, a dashboard page | Opus | None |
| 65 | T1149 | F1 | Travel taxonomy, part 1: the taxonomy itself, from research and the existing tags | Opus | None |
| 66 | T1150 | F1 | Travel taxonomy, part 2: tag every place and trail, as a batch job on the box's CPU where E7 allows | Opus | Box run |
| 67 | T1151 | F2 | Distilled tagger: a small model trained on F1's labels | Opus | Compute choice from E7 |
| 68 | T1152 | F3 | Taste profile with validation | Opus | None |
| 69 | T1153 | F4 | Place linking (the same place across sources) | Opus | None |
| 70 | T1154 | F5 | Intelligence API on the box (FastAPI, eval sets as contract tests, API key, rate limit) | Opus | Box deploy (owner) |
| 71 | T1155 | F7 | Carta MCP server | Sonnet | None |
| 72 | T1156 | F8 | Responsible AI: model cards, limits, the public AI page | Sonnet | None |

## Wave 8: operations, security testing and docs (S73 to S84)

| S | Task | Item | Scope | Model | Gate |
|---|---|---|---|---|---|
| 73 | T1157 | H3 | Durable rate limiting across the edge and the Edge Functions (closes T1079-d) | Sonnet | Cloudflare binding (owner) |
| 74 | T1158 | H4 | Load tests at launch-day volume | Sonnet | Run against preview |
| 75 | T1159 | H5 | Backups and the restore script; the drill itself is the owner's | Sonnet | Owner runs the drill |
| 76 | T1160 | H8 | SLOs and an incident drill script | Sonnet | None |
| 77 | T1161 | H10 | No laptop-only steps: every pipeline step runs on the box | Opus | Box access |
| 78 | T1162 | H11 | One scripted ship and a stable toolbox (the deploy stays owner-triggered) | Opus | None |
| 79 | T1163 | H14 | Code health: split the largest files (DayPlannerTab and others), dead code out | Opus | None |
| 80 | T1164 | C10 | Security testing: automated scans and auth tests against preview | Opus | Preview deploy |
| 81 | T1165 | B4 | Config reference: every key in `continent-app/config/` and the pipeline config, generated | Sonnet | None |
| 82 | T1166 | B5 | Data lineage and diagrams per request path and pipeline task | Sonnet | None |
| 83 | T1167 | B6 | Generated reference and a docs site | Sonnet | None |
| 84 | T1168 | B8 | Ask the docs, on the Ask stack (never the Claude API) | Sonnet | None |

## Wave 9: product breadth and marketing (S85 to S94)

| S | Task | Item | Scope | Model | Gate |
|---|---|---|---|---|---|
| 85 | T1169 | I7 | Installable app (PWA): offline shell, install prompt, icons | Opus | None (stores are later) |
| 86 | T1170 | I8 | Six complete languages, code half: every key in all six, checks in CI | Sonnet | Native review (owner) |
| 87 | T1171 | I14 | Where the paywall meets the journey | Opus | None |
| 88 | T1172 | I15 | Affiliate links done right (disclosure, tracking, fallbacks) | Sonnet | Affiliate IDs (owner, after registration) |
| 89 | T1173 | I13 | Content operations: who updates what, how often | Sonnet | None |
| 90 | T1174 | K14 | Automated data blog, part 2: the monthly routine on the box and the first monthly post | Sonnet | Box schedule; the owner approves each post |
| 91 | T1175 | K7 | Shareable assets: the "Europe on 100 EUR a day" map, the cheapest-week calendar, the shareable trip receipt | Opus | None |
| 92 | T1176 | K8 | Open dataset: a CC-BY subset with licences checked, and the write-up | Sonnet | None |
| 93 | T1177 | G5 | Motion system | Sonnet | Design direction (S27) |
| 94 | T1178 | K10 | Press kit page and the journalist list | Sonnet | None (name decided: Carta) |

## Wave 10: trail quality and external validation (S95 to S112)

Added 2026-11-06 at the owner's request (ROADMAP D23 and D24). Task numbers **T1179 to T1196** are reserved in order.
- **Run order:** the trail pack (S95 to S102) is best run early, right after S10 of the first plan, not after S94. Its numbers stay as listed here.
- **Research first:** every validation session starts with a research subagent that picks the references and checks their terms.
- **LLM judge:** text checks use a calibrated judge, offline in a session or on the pipeline's Gemini key, never the Claude API.

| S | Task | Item | Scope | Model | Gate |
|---|---|---|---|---|---|
| 95 | T1179 | D24 | Trail summaries for the 2,348 top-band trails, grounded in each trail's own facts, checked by the D2 rules | Sonnet | None |
| 96 | T1180 | D24 | The downhill relief fix (488 routes, T286-c), and a re-rate | Sonnet | None |
| 97 | T1181 | D24, D23 | Trails external check: the famous registry, certified quality trails, national portals and Wikipedia lists against Carta's coverage and ranking; the 30 largest gaps reviewed; corrections at the cause; a trail validation gate | Opus | None |
| 98 | T1182 | D24 | The trails lab on the box (T784-a), so trail runs no longer need the laptop | Opus | Box access (owner) |
| 99 | T1183 | D24 | Repair the 3,518 `failed_continuity` routes with the routing engine within strict limits; publish only what becomes continuous | Opus | Box or laptop run |
| 100 | T1184 | D24 | Multi-stage treks as one parent record with ordered stages, shown as one walk and as a multi-day trip | Opus | None |
| 101 | T1185 | D24 | The way back to the start for one-way walks, linked to the trip planner | Sonnet | None |
| 102 | T1186 | D24, D7 | Mountains (route up) and lakes (water class, swim flags) filled | Sonnet | Network run |
| 103 | T1187 | D23 | The validation method and scorecard: shared runner, sampling per country, `data/reports/validation/`, the admin trend, gate wiring into D2 | Opus | After S50 and S58 |
| 104 | T1188 | D23, D4 | The LLM judge: prompts, calibration against the D4 human sample (Cohen's kappa), the threshold for its verdicts to count | Opus | D4 hand sample (owner) |
| 105 | T1189 | D23 | Beaches: EEA bathing water, Blue Flag and national lists against water class, swim flags and coverage | Sonnet | None |
| 106 | T1190 | D23 | Prices: beds, food and fares against Eurostat price levels and a hand-checked sample of live listings | Opus | None |
| 107 | T1191 | D23 | Place ratings: repeat T760 on the current ratings with more references; the 30 gaps | Opus | None |
| 108 | T1192 | D23 | Lakes and mountains: heights, prominence, water class against Wikidata, OSM and national lists | Sonnet | None |
| 109 | T1193 | D23 | Cycling: EuroVelo and national networks against coverage and geometry | Sonnet | None |
| 110 | T1194 | D23 | Climate, sea temperature and crowds against national met office normals, Copernicus and Eurostat | Sonnet | None |
| 111 | T1195 | D23 | Trips: every leg against official timetables and operator sites; honest times | Opus | None |
| 112 | T1196 | D23 | Texts and translations: intros, summaries and trip text against their cited sources with the calibrated judge; back-translation check before the native review (I8) | Opus | After S104 |

After the first full pass, each validation reruns every release as part of the D2 run. Only the review of new gaps needs a session.

## If the owner accepts the proposed items

D16 to D22 and I17 (ROADMAP, status "proposed") take about 8 to 10 sessions. Two ways to fit them in:
- **Swap them in** for the most deferrable rows: F7, F8, B8, H8, K10.
- **Run them as an extra wave** after S94.

D16 (link health) and D18 (seasons and closures) are the strongest candidates to swap in, because they protect what travellers see.

## What remains after S94

These are mostly the owner's or the users':
- C11, the external security check;
- G11, the usability retest;
- I1, I2, I4 and I10: registration, Stripe live, affiliates, business operations;
- I6, retention email, once a provider is chosen;
- K9, K11 and J1 to J5: the beta and the launch;
- the ongoing K4, K6 and K13.

At that point most of Claude's part of the roadmap is built, and the pace is set by the owner steps and the launch calendar (open beta in March, Product Hunt on 4 May 2027).
