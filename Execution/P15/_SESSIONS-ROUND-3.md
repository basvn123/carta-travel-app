# Round 3: the accepted proposals, the unscheduled items and the round 2 follow-up

Written 2026-11-07 by the round 2 orchestrator at the owner's request ("Do (2), (3), (4)"): the eight proposed items D16 to D22 and I17 (accepted by the owner that day), the roadmap items no round had scheduled (A2, G9, G14, I12, I16), and sweeps of the `next task` register rows round 2 left (278 rows, grouped by area).

- 21 sessions, S113 to S133, task numbers T1197 to T1217 reserved in order.
- Integration branch `p15-round3`, cut from `p15-round2` at its round 2 summary (23bb6601d5), so round 2 can be reviewed and merged on its own.
- Each session reads its brief in `Execution/P15/_run_r3/briefs/S<n>.md`; the rules from round 2 (`Execution/P15/_SESSIONS-ROUND-2.md` and `_NEXT-50-SESSIONS.md`) still apply, and every brief carries the lessons of round 2.
- Held from round 2, started as soon as their owner rows close: S63 (T1146-a), S67 (T1149-a, b), S93 (T1111-a).

## Order and dependencies

- Batch 13: D16, D17, D19, D20 and the trails sweep (pipeline layers that do not touch each other).
- Batch 14: D18, D21, D22, I17 (migration 073 if a table is needed) and the AI sweep.
- Batch 15: A2 alone among pipeline writers (it splits `run_pipeline.py` and moves files), with G9, G14 and the product and ops sweeps.
- Batch 16: I12 alone in the router, I16, and the data quality, intelligence and validation sweeps.
- Batch 17: the docs sweep alone and last, because every earlier task changes the generated docs and the config reference.

| S | Task | Item | Batch | Scope | Gate | Done when |
|---|---|---|---|---|---|---|
| 113 | T1197 | D16 | 13 | Link and page health | None (the full run on the box is an owner step). | The checker runs on fixtures and a sample, results feed the admin list and a D2 rule, the weekly task is registered. |
| 114 | T1198 | D17 | 13 | Photo correctness | None (model runs needing a key are owner steps). | The check flags seeded wrong photos in tests, replacements come from the ladder, the rate is a D2 rule. |
| 115 | T1199 | D19 | 13 | Entry rules and official advice | None (the refresh against live sources is an owner run where hosts are blocked). | Entry data for every country with sources and dates, shown on the country page at phone and desktop, contract and checks green. |
| 116 | T1200 | D20 | 13 | Heat and fire risk by month | None. | Heat and fire months marked per place on fixtures and the shipped data the container has, best months respect them, the note shows, checks green. |
| 117 | T1201 | register follow-up (trails) | 13 | Round 2 follow-up sweep, trails | None (rows that need the owner stay open with a reason). | Every row in the group is closed, or open with a one-line reason in the report; counts before and after; checks green. |
| 118 | T1202 | D18 | 14 | Seasons and closures | None. | Open months on fixtures and the data the container has, the plan flow skips closed places in a test, the strip shows them, checks green. |
| 119 | T1203 | D21 | 14 | Accessibility facts | None. | Facts on fixtures and the data the container has, shown only when known at phone and desktop, checks green. |
| 120 | T1204 | D22 | 14 | Trip footprint | None. | An estimate per mode and trip with a test against hand-computed values, shown beside the price at phone and desktop, checks green. |
| 121 | T1205 | I17 | 14 | Price alerts | Email secrets, the migration paste and the deploy are owner steps. | Saving an alert, the drop check and the email body tested with stubs, unsubscribe works, RLS harness green on a local Postgres, checks green. |
| 122 | T1206 | register follow-up (AI and Ask) | 14 | Round 2 follow-up sweep, AI and Ask | None (rows that need the owner stay open with a reason). | Every row in the group is closed, or open with a one-line reason in the report; counts before and after; checks green. |
| 123 | T1207 | A2 | 15 | Pipeline structure | You are the only session in this batch that edits `run_pipeline.py` or moves pipeline files. | Tasks identical before and after by test, files grouped, all references updated, entry points, drift, reference and lineage checks green. |
| 124 | T1208 | G9 | 15 | Trust made visible | None. | Chips with evidence and dates render at phone and desktop on fixture data, design-lint 0 new, the seven carta-design questions answered. |
| 125 | T1209 | G14 | 15 | Home page | The design direction approval (T1111-a) is the owner's: build behind a flag. | The new home renders behind its flag at phone and desktop, first load measured before and after on the fast build, design-lint 0 new, CSP check green. |
| 126 | T1210 | register follow-up (product and growth) | 15 | Round 2 follow-up sweep, product and growth | None (rows that need the owner stay open with a reason). | Every row in the group is closed, or open with a one-line reason in the report; counts before and after; checks green. |
| 127 | T1211 | register follow-up (ops and security) | 15 | Round 2 follow-up sweep, ops and security | None (rows that need the owner stay open with a reason). | Every row in the group is closed, or open with a one-line reason in the report; counts before and after; checks green. |
| 128 | T1212 | I12 | 16 | Growth, language in the URL | You are the only session in this batch that edits the router. | Language URLs route and prerender on the fast build, hreflang and sitemap tested, CSP check green. |
| 129 | T1213 | I16 | 16 | Data access ladder | Partner applications are the owner's. | Every source has a dated record with links, thresholds in config, flags tested off by default. |
| 130 | T1214 | register follow-up (data quality and catalogue) | 16 | Round 2 follow-up sweep, data quality and catalogue | None (rows that need the owner stay open with a reason). | Every row in the group is closed, or open with a one-line reason in the report; counts before and after; checks green. |
| 131 | T1215 | register follow-up (intelligence) | 16 | Round 2 follow-up sweep, intelligence | None (rows that need the owner stay open with a reason). | Every row in the group is closed, or open with a one-line reason in the report; counts before and after; checks green. |
| 132 | T1216 | register follow-up (validation) | 16 | Round 2 follow-up sweep, validation | None (rows that need the owner stay open with a reason). | Every row in the group is closed, or open with a one-line reason in the report; counts before and after; checks green. |
| 133 | T1217 | register follow-up (docs) | 17 | Round 2 follow-up sweep, docs | None (rows that need the owner stay open with a reason). | Every row in the group is closed, or open with a one-line reason in the report; counts before and after; checks green. |
