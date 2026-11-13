# Carta roadmap to production

Nov 4, 2026, @Bas (dates updated 2026-11-12). Public opening: **Tuesday 9 March 2027** (week 10, fast track, J-b). Launch campaign: **Tuesday 4 May 2027** (week 18 of 2027).

This file is the plan of record. It replaces `Roadmap/Carta roadmap.md` (Dutch, last updated 10-28). Every figure in it comes from a read-only audit of the repo on 2026-11-04.

Three things carry the most weight: **documentation** (every piece of logic written down and kept true), **security** (designed in, tested, never an afterthought) and **UI** (researched, tested with people, measured). The goal is a full-time product, not only a finished app, so Track I covers the business around it: onboarding, accounts, retention, money, support, growth and operations.

The full audit of the app as it is today, with every pain point, its evidence and its severity, is [docs/research/2026-11-audit.md](docs/research/2026-11-audit.md). Each pain point (`P-01` to `P-59`) is carried by an item below.

---

## 1. How to read this file

- **Fix now** (section 3) comes first: production breakage, security exposure and spinning jobs found by the audit. Items `N1` to `N8`, all this week or next.
- **Phases** (section 4) set the order of work: P0 to P5, each with a quality gate. Tracks say what; phases say when.
- **Eleven tracks**, A to K. Each track has the same six parts: Goal, Exit criteria, Research, Items, Item details, Depends on.
- **Pain point IDs** (`P-21`) point into [docs/research/2026-11-audit.md](docs/research/2026-11-audit.md).
- **Item IDs**: build items are `B3`, `C7` and so on. Research items are `B-R1`, `C-R2` and so on.
- **Build items** are done in Claude Code sessions. A session runs as a crew run (`.work/<date>-<slug>/`, `docs/decisions/0001-adopt-crew.md`) and names the item ID in its report. Task numbers `T001` to `T1222` are the history before crew.
- **Research items are yours.** Each has a question, starting points, a timebox and an output. The output is a note in `docs/research/` (template in section 2) that ends in a decision. A build item that depends on research waits until that decision is written. Claude can gather sources or summarise for you, but you make the call.
- **Size**: **S** is one session, **M** is a batch of 2 to 4 tasks, **L** is a phase of its own. Research timeboxes are in days.
- **Weeks** are ISO weeks. 2026 W45 starts Mon 2 Nov. W1 to W19 are 2027.
- **Status** per item: `todo`, `doing`, `done`. Update the tables as items move.

---

## 2. Research: how your own research fits in

**Rhythm.** Each track opens with its research items. About one day a week is research time (Fridays, decision R-b). Research for a track finishes before that track's first build item that depends on it.

**Output template** (`docs/research/_TEMPLATE.md`):

```
# <ID>: <question>
Date, time spent, status (open / decided)

## Question
## Why it matters for Carta
## Options considered (2 to 4)
## What I read or tried (links, notes, small experiments)
## Comparison (table: option x criteria)
## Decision and reason
## What it changes (which build items, which docs)
```

A decided research note becomes an ADR in `docs/architecture/adr/` when it changes the architecture.

**Total research budget.** About 37 days across 26 weeks (29 research items). That is more than one day a week, so each phase in section 4 names the research to do first; the rest is optional and can follow launch.

---

## 3. Fix now (this week and next)

The audit found things that are broken in production, exposed, or burning effort right now. They come before any track. Owner means only you can do it.

| ID | Fix | Why now | Done when | Owner | Pain point | Status |
|---|---|---|---|---|---|---|
| N1 | Pause the hourly `CartaStaysBooking` and `CartaStaysHostelworld` tasks; remove the dead `CartaFlightsAll` and `CartaFlightsNow` tasks; drop `VITE_E2E_SEAMS=1` from `continent-app/.env` | Booking returns 0 prices for 3,437 towns every hour since Oct 30 (block risk, 43.7 MB log); Hostelworld parses 0 prices from 677 pages | Tasks disabled, log rotated, Hostelworld parser bug filed (fixed in D5) | you (Task Scheduler) | P-13, P-20 | todo |
| N2 | Publish `status.json` and add `status.json`, `.keep`, `_test` to the prune keep list in `scripts/r2/push-data.mjs`; make `--prune` list what it would delete and ask | 404 on every page view; the Nov 3 prune deleted `data/flights/` | `status.json` returns 200; a dry prune shows its list | next task | P-14 | done (T1056; status.json published 2026-11-12 by the owner sweep, 200 with `{"enabled": false}`) |
| N3 | Rotate the leaked R2 admin token (T291-b) and check R2 access logs | Anyone holding it can change or delete shipped data | Old token revoked, new one only in secrets | you | P-07 | done (owner rolled it and checked the audit log, T1059-a; recorded 2026-11-12) |
| N4 | Bump `dompurify` (non-breaking); file jspdf 4 and maplibre 5/6 as C6 tasks | Three critical advisories in production dependencies | `npm audit --omit=dev` shows no critical that a minor bump fixes | next task | P-08 | done (T1053) |
| N5 | Clear account-tied `carta.*` stores on sign-out (or ask "remove this device's copy") | Bookings and companions stay visible on a shared device | Sign-out test passes on a real phone | next task | P-09 | done (T1054; real-phone check T1054-a) |
| N6 | Commit the flight-sweep deploy script under `scripts/`, deploy the half-speed night fix (T1043-a), check refusals by hour (T1043-b) | Google refuses the sweep 3 of 3 nights | Three clean nights | you (deploy) | P-16 | in progress (owner sweep 2026-11-12: the half-speed Worker is live since 2026-11-04, nights run at about half the day's searches a minute; `node scripts/flight-sweep.mjs nights` is the check and `deploy` the committed deploy; 0 of 6 nights clean, 3 refusals each, so half speed alone does not stop them. Next: no searches 22:00 to 05:00, or a longer first pause) |
| N7 | Fix the lint error at `ExploreMap.jsx:911` (missing `collectKpins` dependency) | A real stale-closure bug on the main screen | `npm run lint` shows 0 errors | next task | P-45 | done (T1055) |
| N8 | Move the 6 closed rows out of `_OPEN.md`; close the migration rows T985 proved live (T034-a, T043-a, T265-a, T270-b, T281-b) | The register misleads every session | Rows moved with reasons | next task | P-56, P-58 | done (T1058) |

---

## 4. Phases and quality gates: the order of work

The tracks (sections 7 to 17) say **what** to build. The phases say **in which order**, and each phase ends in a gate that must pass before the next one starts its main work. The principle, confirmed by the research in [docs/research/2026-11-launch-plan-research.md](docs/research/2026-11-launch-plan-research.md):

1. **Depth before breadth.** The pages and flows marketing will point at (the marketing surface) become complete and clean first. Breadth across all 3,868 places and 17,619 trails comes after.
2. **Quality before traffic.** No campaign links to a page that fails the marketing surface gate. Google judges a site partly by its weakest pages, so pages below the bar stay `noindex,follow` until they pass.
3. **Marketing starts now and scales with the gates.** Low-risk work first (SEO plumbing, waitlist, building in public, research), deep links and campaigns only after the gate.
4. **The business is registered as late as sensible, and run without an accountant or lawyer.** Everything before registration is free to use and runs payments in Stripe test mode. You register as a sole trader about Mon 22 February 2027 (week 8, fast track J-b), about two weeks before money first flows. Legal and admin work is done by you, from official sources and templates, with deliberately simple choices that stay out of the hard legal areas (I1, I-R4, I-R5). Data licensing still starts now, because it can change the price engine.
5. **Documentation, security and UI stay first-class.** They apply to the marketing surface first, then widen.

| Phase | Weeks | Goal | Exit gate |
|---|---|---|---|
| **P0 Fix and start** | 2026 W45 to W46 | Stop what is broken; start the slow owner chain and the marketing groundwork | N1 to N8 done, CI green, `status.json` 200 |
| **P1 Surface data and flow** | 2026 W47 to W51 | The data and journey behind the marketing surface are right | Surface data rows of the gate pass; I3 decision written |
| **P2 Clean look** | 2026 W52 to 2027 W3 | The marketing surface looks finished and loads fast (by about 18 Jan) | The full marketing surface gate passes |
| **P3 Business and closed beta** | 2027 W4 to W10 | Carta is ready to sell; 50 real travellers use it | Test-mode purchase and refund on a phone; 4 of 5 beta testers plan unaided; zero S1 |
| **P4 Breadth, hardening, open beta** | 2027 W11 to W16 | Registered and selling; quality across the whole catalogue; security tested; open beta for summer planners | Production-ready checklist (section 18), must list |
| **P5 Launch** | 2027 W17 to W19 | Fix weeks, freeze, launch campaign | Launch on Tue 4 May |

### Fast track: using your full Claude allowance every week

The plan above assumes about 6 to 8 sessions a week. If you use your full weekly allowance, about 30 to 40 sessions a week (3 to 4 in parallel, two rounds a day), the build work before launch (102 items, about 190 to 380 sessions plus about 30% rework) fits in 8 to 12 weeks. The fast track uses that speed to open to the public in March, in time for summer planning, and keeps 4 May as the date of the big campaign.

| Phase | Normal weeks | Fast-track weeks | What changes |
|---|---|---|---|
| P0 Fix and start | W45 to W46 | W45 to W46 | A4 (Claude context) and A1 (cleanup) first, so every later session starts lean |
| P1 Surface data and flow | W47 to W51 | W47 to W49 | Data runs (trail photos, summaries, sea temperature) start in week 1, because they take wall-clock time |
| P2 Clean look | W52 to W3 | W50 to W52 | The marketing surface looks finished by Christmas; Sunshine Saturday release on Sat 2 Jan stays |
| P3 Business and closed beta | W4 to W10 | W1 to W6 | Closed beta in January to early February |
| Register as a sole trader | W13 | W8 (Mon 22 February 2027) | About two weeks before the first paid sale, as in I1 |
| Public opening (soft launch) | not in plan | W10 (Tue 9 March 2027) | Open to everyone, paid Pass live once T228 passes (a free open beta until then, 0007); quiet: waitlist, communities, data stories |
| P4 Breadth and hardening | W11 to W16 | W6 to W14, alongside the public site | Breadth, the full security walk (C10, C11) and the external check run while real users arrive |
| P5 Campaign launch | W17 to W19 | W17 to W19 | Product Hunt, press, mid-May beach ranking, with real users and testimonials behind it |

**Conditions for the fast track.**
- **Your Claude allowance.** Check it after the first full week. Heavy sessions that build, test and check in the browser use a lot, so 30 to 40 a week may hit your plan's weekly cap. If it does, the fast track stretches toward the normal plan, and nothing breaks.
- **Your time.** At this pace you review and merge 5 to 8 results a day. With phone checks and owner steps, that is about 2 to 4 hours a day. It is the real speed limit.
- **Research cut to the essentials** (about 10 to 12 days instead of 37): G-R1, G-R3 with K-R1 (the interviews), I-R4, I-R5, C-R2, E-R1. The rest is optional or can follow launch.
- **Gates unchanged.** The marketing surface gate and the P4 checklist still have to pass before the public opening. If they do not pass, the opening moves; quality does not.
- **What speed does not shorten.** Search traffic still takes 6 to 12 months, so indexing starts in November in both plans. The beta needs 3 to 4 weeks with real people. Registration and Stripe verification take about 2 weeks. Scrapers must stay slow to avoid blocks.

Decided 2026-11-12 (J-b): the fast track. The fast-track column is the plan; the normal weeks are the fallback if the weekly allowance or review time cannot carry it. Dated runway: section 16, Launch runway (decision record `docs/decisions/0009-launch-plan-fast-track.md`).

### What happens in each phase

Weeks below are the normal plan; on the fast track (J-b) read the fast-track column of the table above.

**P0 Fix and start (W45 to W46)**
- Build: A4 (Claude context, first), N1 to N8, H1 (CI), A1 (layout and redundant files removed), C2 (secrets, MFA, token rotation).
- Owner: the I3 terms reads start. No company yet.
- Marketing: K1 (positioning, launch market), K3 (waitlist with referral on Home), K4 (build in public, weekly), K12 (Search Console, cookieless channel counts). Affiliates: open Travelpayouts and Omio accounts and get approved (I4); partner IDs go live only after registration in P4.
- Your research: G-R1, G-R2 (design benchmark and principles), K-R1 (audience interviews, which also serve as G-R3).
- Gate: N1 to N8 done, CI green, `status.json` returns 200.

**P1 Surface data and flow (W47 to W51)**
- Build: D7 (top-band trails first), D8, D10, D11, D12, D13, D14, D5, E6, G12, G13, H9, H12, H13, I5, I9, B2, A3.
- Security: C1 (threat model; surface first), C3 (auth and admin access).
- Design: G1 (direction, from G-R1 to G-R3).
- Owner: I3 decision by W50 (keep, replace with an affiliate or licensed feed, or drop each source), so prices have a plan B before any campaign says "honest prices". Beds are already decided (I-g: keep scraping, flagged); the open question is flights and the smaller sources. I16 sets the data access ladder.
- Marketing: K2 (SEO plumbing and page quality gate: thin pages `noindex`, segmented sitemaps, hubs indexed), K3 newsletter issue 1.
- Gate: the data rows of the marketing surface gate pass.

**P2 Clean look (W52 to W3)**
- Build: G2, G3, G4, G5 (sheets and tabs), G6 and G7 (surface files first), G8, G10 for the surface screens, D9 for the top 300 places, H2, I11, I12.
- Docs: B3 logic catalogue for the surface domains first (rating, price, seasons).
- Security: C4, C5.
- Marketing: K5 (Europe Cost Index and the Sunshine Saturday release on Sat 2 Jan 2027), K6 (community presence), K10 (press list). The creative slot opens (K13).
- Gate: the full marketing surface gate below. Only then does marketing link deep into the app.

**P3 Business and closed beta (W4 to W10)**
- Build: I2, I4 (Viator, GetYourGuide), I6, I8, I10, I14, I15, H3, H5, H6, H7, H10, H11, D1, D2, D4, E1, E3, F1, F6, B4, B5, B7.
- Security: C6, C7, C8, C9.
- Marketing: K7 (100 EUR a day map, cheapest-week calendar, trip receipt sharing), K8 (open dataset plus Show HN), K9 (closed beta of 50 from the waitlist), K10 (press kit).
- Your research: I-R4 (registering late and running the admin yourself), I-R5 (do-it-yourself legal), both finished before P4.
- Gate: test-mode purchase and refund on a phone, 4 of 5 beta testers plan unaided, zero S1 bugs. The closed beta is free.

**P4 Breadth, hardening, open beta (W11 to W16)**
- Owner, week 8 (Mon 22 February 2027, fast track): register as a sole trader (I1), then switch Stripe to live and make one real purchase and refund (I2), and put the affiliate partner IDs live (I4). Allow about 2 weeks for the business number, VAT status and Stripe verification, so the paid Pass is live for the public opening on Tue 9 March; if verification runs late, the opening is a free open beta until it is (0007).
- Build: D3, D6, D9 (breadth), G9, G10 (full audit), G11, E2, E4, E5, B6, B8, A2, H4, H8, H14, F8, I4 (Booking.com and Hostelworld on the public preview), I7 (PWA polish), J1, J2.
- Security: C10 (ASVS L2 walk and ZAP in CI), C11 (external check and retest).
- Marketing: K9 open beta in March for summer planners, scale the channels that converted, K11 preparation.
- Gate: the production-ready checklist (section 18), must list.

**P5 Launch (W17 to W19)**
- Build: J3 (fix weeks), J4, J5.
- Marketing: K11 launch campaign (Product Hunt, Show HN if not used, waitlist email, courtesy notes to credited bodies, mid-May beach ranking).

**At every gate:** you walk the whole journey on a real phone (first visit, find, judge, price, plan, save, share, pay, return) and write what felt unnatural. Each finding becomes an item or a fix before the next phase.

### The marketing surface and its gate

**The marketing surface** is what any campaign may link to: Home; Explore (default map and list, filters, Ask); the top 300 places plus every place a campaign names; top-band trails near those places; the plan flow up to a priced draft; the trip page and the shared-trip view.

**The gate** (all must pass before marketing links into the app):

| Area | Bar |
|---|---|
| Places (top 300) | 100% hero and 5+ photos; 100% full intro; 95% of must-see POIs described; 95% measured bed price, the rest say "not yet measured"; local transport fare for every metro and city; crowds by month 100% (UK included); sea temperature for every beach |
| Trails (top band) | 95% photo; 100% summary and clean display name; climb-based difficulty; time and climb on the card; own URL |
| Getting there | Zero wrong-mode picks on the 50-pair check |
| Plan | First priced plan in 5 screens or fewer; median under 3 minutes in a 5-person test; 4 of 5 finish unaided |
| Speed (mid-range phone, 4G) | LCP p75 under 2.5 s, INP under 200 ms, CLS under 0.1; Lighthouse mobile 85+ on 5 surface URLs; entry chunk under 150 KB gzip; no hot-linked Wikimedia images |
| Quality | Zero open S1 or S2 bugs on the surface; zero console errors on a scripted walk; axe zero serious or critical; Ask text and cards agree on 100% of the golden set; 50-place truth sample passes; surface wires fresh; launch-language strings complete |
| Docs and security | Every rule on the surface has a logic ID (B3); surface threats from C1 have controls |

### Must for launch, and what can follow

| Must for launch | Can follow launch |
|---|---|
| Fix now: N1 to N8 | Carta Intelligence beyond F1, F6, F8: F2 to F5, F7 (decision F-b) |
| Repo and docs: A1 to A4, B1 to B7 | Docs: B8 (ask the docs) |
| Security: C1 to C11 | Data: D3 full field provenance beyond the surface |
| Data: D1, D2, D4, D5, D7, D8, D9 (surface depth), D10 to D14 | Data: D9 breadth beyond 85% |
| AI: E1, E3, E6 | AI: E2, E4, E5 (do as soon as traffic gives data) |
| Intelligence: F1, F6, F8 | |
| UI: G1 to G4, G8, G10 to G13 | UI: G5 full, G6 and G7 beyond the surface, G9 |
| Ops: H1 to H3, H5 to H7, H9 to H13 | Ops: H4, H8, H14 |
| Business: I1 to I6, I8, I9, I11, I12, I14 to I16 | Business: I7 store app (stay a PWA), I10 beyond simple self-kept books, I13 |
| Marketing: K1 to K12 | |
| Launch: J1 to J5 | |

Sized at about 140 to 200 sessions for the must list, which fits 26 weeks at about 6 to 8 sessions a week. The owner's time, not the session count, is the real limit: keep research to the items marked in each phase.

---

## 5. Where Carta stands today

| Area | Today | Gap to production |
|---|---|---|
| Repo | 52k tracked files, 528 `.md`, 89 flat `.py` files in `pipeline/`, `run_pipeline.py` 3,203 lines, 13 stray top-level folders | One layout, one home per kind of file |
| Documentation | 43 flat files in `docs/`, 24 older than 10-15, 12 on MAP's distrust list, 9 product areas with no doc, both READMEs stale, no doc that explains every feature, no record of where each rule and threshold lives | Handbook, logic catalogue, area docs, generated reference, drift checks |
| Security | Secret scan, RLS tests and admin RPC tests in CI, CSP, a security pass on 2026-08-12. No threat model, no dependency audit in CI, no dynamic scan, rate limits per isolate, AI injection defence in one function only | Threat model, OWASP ASVS checklist, supply-chain checks, AI security, tested and documented |
| Register | 1,592 open rows in `Execution/_OPEN.md` (541 owner), about 230 likely stale, 70% raised before T600 | Under 250 rows, each mapped to an item or procedure |
| Data quality | Data contract in `docs/SCHEMA.md` (v19) and a hand-written JS validator. `pipeline/schema.py`, named in CLAUDE.md, does not exist. Separate audits; freshness for trails only; provenance per layer | One schema checked at write and sync, scorecard per run, accuracy measured |
| Ask Carta (RAG) | Dense (potion-128M) + BM25 with RRF, sentence verifier that withdraws bad answers, 50 golden queries run by hand | Eval gate in CI, reranker, BM25 everywhere, injection tests, query logs |
| LLM features | Gemini plan-day, parse-booking, suggest-city with quotas, catalogue checks, model fallback chain | One guardrail module, every call logged with tokens and cost |
| UI | 244 tokens, UI kit in 185 files, live styleguide. 1,740 literal font sizes, 775 literal radii, 446 raw `<button>`, about 15 breakpoints, place head built 3 times, no axe or Lighthouse, no usability tests with travellers | Researched direction, tested with people, one component per role, quality gates |
| Ops | 11 GitHub workflows, but `npm run ci` and app tests not in CI (1,229 of 1,229 pass locally). No Python lint. No error tracking. Manual backups. No load tests. 28 monthly and quarterly tasks run nowhere; Booking scrape failing hourly; `status.json` 404 | Full CI, Sentry, nightly backups, load tested, every task scheduled |
| Shipped data | Trails 20.2% photo and 2.6% summary (unchanged since Sep 13); sea temperature 0%; local transport fare 0%; bed price missing for 515 places; UK crowds missing; full place intro 47.5%, English only; four wires 49 to 70 days old | Every must-see place and top trail complete, every layer fresh |
| Performance and code | 477 KB gzip JS and 170 KB blocking CSS on first load; one error boundary; 3 critical advisories; DayPlannerTab 4,446 lines; 18 dead files | Entry under 150 KB gzip, boundary per tab, no critical advisory |
| Product and business | No legal entity or VAT, Stripe not live, affiliate IDs empty, retention email off, guest trips lost at sign-up, no support mailbox, English-only URLs, no store app, only a developer can edit a place | A business that can sell, support, retain and grow |

---

## 6. Tracks at a glance

| Track | Goal | Phases | Build | Research |
|---|---|---|---|---|
| **A** Repo cleanup | One clean layout, a register a human can work, and Claude entry points that send every session straight to the right file | P0 to P4 | 4 | 1 |
| **B** Documentation | Every feature and every piece of logic written down, generated where possible, checked in CI | P0 to P4 | 8 | 4 |
| **C** Security | Threat-modelled, tested against OWASP ASVS and the LLM Top 10, documented | P0 to P4 | 11 | 4 |
| **D** Data quality and completeness | Prove every place is complete, valid, fresh and accurate, and fill the gaps the audit found | P1 to P4 | 14 | 2 |
| **E** RAG and guardrails | Measured retrieval, guarded and logged LLM calls | P1 to P4 | 6 | 2 |
| **F** Carta Intelligence | The AI product engineering skill set as real Carta features | P3 to After | 8 | 2 |
| **G** UI and UX | Researched direction, tested with travellers, consistent and measured | P1 to P4 | 13 | 5 |
| **H** Production hardening | CI, monitoring, limits, backups, scheduling, performance, code health | P0 to P4 | 14 | 1 |
| **I** Product and business | Everything a full-time product needs around the features: legal, money, onboarding, accounts, retention, mobile, support, analytics, growth, content ops, affiliates, licensed data | P0 to P4 | 16 | 5 |
| **J** Launch | Beta, freeze, go live | P3 to P5 | 5 | 0 |
| **K** Marketing | People who would love Carta find it without paid ads; every campaign points at pages that pass the gate | P0 onwards | 13 | 3 |

### Timeline

The order of work is the phase plan in section 4. Every item's **Phase** column says when it runs (P0 to P5, or After for work that can follow launch).

### Dependencies between tracks

- **A1 before B2**: the docs tree lands in the cleaned layout.
- **B3 (logic catalogue) runs alongside every later track**: each new rule gets a logic ID the day it is written.
- **C1 (threat model) before C3 to C9**: each hardening item answers a threat from the model.
- **H1 (CI) before every gate** in B, C, D, E, G.
- **D1 before D2 and D3**: rules and provenance hang off the schema.
- **E1 before E2**: retrieval changes are measured against the gate.
- **F1 before F2, F3, G9**: the taxonomy feeds the student model, the taste profile and the "why this place" chips.
- **E3 and C8 are one piece of work**: the guardrail module is also the AI security control.

---

## 7. Track A: repo cleanup

**Goal.** One clean layout, one home per kind of file, and a register you can actually work.

**Exit criteria.**
- The root holds only README, CLAUDE, MAP, PRODUCT, DESIGN, ROADMAP, SECURITY and folders.
- `run_pipeline.py` is a CLI over a registry split by domain.
- The register is under 250 open rows.

### Research

| ID | Question | Starting points | Timebox | Output |
|---|---|---|---|---|
| A-R1 | How should a Python data pipeline plus a JS app be laid out in one repo? Keep `pipeline/` flat-by-prefix, or group by stage, or by domain? | Layouts of open-source data projects (dbt, Dagster example repos), "Cookiecutter Data Science", Python Packaging User Guide on `src` layouts | 1 day | Decision on A2's target structure |

### Items

| ID | Item | Done when | Size | Phase | Status |
|---|---|---|---|---|---|
| A1 | Top-level layout | Root and `continent-app/` root clean, MAP updated, tests and dry run pass (T1050: docs and stray folders archived; live code folders moved to A2; `Trips/` folds per A-a (decided 2026-11-12), in A2) | M | P0 | done |
| A2 | Pipeline structure | `run_pipeline.py` split by domain, flat files grouped, ruff on touched files | L | P4 | in progress (T1207: table split, audit, blog and pois grouped; rest in T1207-b to f); T511-d (owner 2026-11-12): remove the unused demand_events task (holidays, school_holidays) from pipeline/tasks/catalogue.py; the collector stays |
| A3 | Register triage | Under 250 open rows, owner rows in one procedure per system | M | P1 | done (2026-11-11, crew alignment: the register is retired; 766 owner rows live in `docs/owner/`, the 1,340 engineering rows stay in git history; `docs/decisions/0003-open-items-owner-steps-and-roadmap.md`) |
| A4 | Claude context, lean and exact | Memory index under 5 KB with stale memories merged or removed; CLAUDE.md and MAP.md corrected and only pointing at files that exist; one entry path (CLAUDE.md, then MAP.md, then the handbook section, then the file); skills folder trimmed; a check that fails when MAP or CLAUDE names a missing path (T1051: memory index 15 KB to 3.7 KB, CLAUDE and MAP corrected, `scripts/docs/check_entry_points.py` plus the `entry-points` workflow; skills kept, since the project impeccable skill is the one in use; `continent-app/.git` removal stays an owner step, T1040-d. 2026-11-11, crew alignment: MAP.md folded into `docs/project-map.md`, CLAUDE.md rewritten in the crew shape, `docs/decisions/` and `docs/lessons.md` added, the check now covers CLAUDE.md, the project map and the lessons; `docs/decisions/0004-lean-always-loaded-context.md`) | S | P0 | done; follow-up (T369-b, decided 2026-11-12): copy the owner's impeccable 4.5.0 over .claude/skills/impeccable/ so the project and personal copies match |

### Item details

**A1. Top-level layout**

```
README.md  CLAUDE.md  PRODUCT.md  DESIGN.md  ROADMAP.md
continent-app/      the app
pipeline/           all Python pipeline code (src/ingestion moves in)
supabase/  infra/   backend and build box (ops/*.sh moves to infra/backup/)
services/           FastAPI and MCP services (Track F)
evals/              golden sets, runners, results
docs/               see B2 and docs/project-map.md
.work/              crew run reports and INDEX.md (history of every task)
data/ app_data/ cache/ tools/   data and tools, never deleted
(archive/ and Execution/ retired 2026-11-11, in git history)
```

| Action | Paths |
|---|---|
| Archived (done, T1050) | `Claude outputs/`, `additional docs/`, `Roadmap/`, `Execution/_queue/`, root `1.CARTA.md`, `PLAN.md`, `ROUTES.md`, `CARTA_TRAILS_BUILD_BRIEF.md`, `user_knowledge.md`, `continent-app/CARTA_*.md` (3), and every old doc in `docs/` (to `archive/docs-2026-11/`). Kept in `docs/` because code reads them: `SCHEMA.md`, `tos/data_licenses.md`, `REGIONS.md`, `LAKES.md`. `ARTICLE30.md` moved to `docs/legal/` |
| Not archived: still in use (moved to A2) | `pipeline/field_stubs/` (imported by `run_pipeline.py` and the trails worker), `pipeline/diagnostics/` (rating-tests workflow), `pipeline/oneoff/` (imported by `apply_new_gems.py`), `src/estimation/` (used by holiday ingestion), `ops/*.sh` (named by the secret-scan workflow) |
| Fold, then archive (decision A-a, 2026-11-12) | `Trips/carta-unified/` (308 files): move what runs into `pipeline/trips/`, repoint `golden-set.yml` and `trip-validator.yml` |
| Untracked and ignored (done, T1050) | the 28 dated `reports/coverage_backlog_*.csv`. The rest of `reports/` stays tracked: `rating_reference_v5.json` is the frozen rating calibration. `continent-app/reports/` stays: it holds the performance baselines reports cite |
| Deleted locally (done, T1050) | `impeccable/` (17 MB copy), `.fastbuild/`, `dev/`, `.vercel/`, `bash.exe.stackdump`, empty `continent-app/screenshots/`, root `*.log` (3.3 MB), all `__pycache__/`. `logs/` stays: Task Scheduler runs `logs/run_*.cmd` and `logs/pipeline_state.json` is pipeline state |
| Review | 622 tracked files in `cache/` (git or R2?); `vercel.json` retired (T1067); `csp-hash.mjs` kept for the `_headers` script-src |

**A2. Pipeline structure**
- Split `run_pipeline.py` (74 tasks in one list) into `pipeline/tasks/<domain>.py`. `run_pipeline.py` keeps the CLI and imports the registry.
- Group the 89 flat files as A-R1 decides. One commit per folder.
- Add `pyproject.toml` with ruff and mypy, scoped to new packages first.
- Done check: `--dry-run` lists all 74 tasks, Python tests pass.
- Follow-up (T1045-i, decided 2026-11-12, A-a): fold `Trips/carta-unified/`: move generate_trip.py, the critic, golden/ and the validator into `pipeline/trips/`, repoint golden-set.yml and trip-validator.yml, archive the rest with a git mv. In the same change repoint the `TRIPS` path in `pipeline/journeys/sample_trips.py` (it writes to `Trips/carta-unified/`, sample_trips.py:38).
- Follow-up (T155-b, decided 2026-11-12): with the A-a fold, add a CONSTRAINTS rule in gap_matrix.py that gives no own week to MC, LI, AD, SM, VA; keep MAX_PER_CELL 2, target about 600.

**A3. Register triage**
1. A script groups the 1,576 rows by area and age.
2. Each row becomes: still true, done already (closed with its task), won't do (closed with a reason), or folded into a roadmap item.
3. Owner rows (539) become one ordered procedure per system (Stripe, Supabase migrations, Dashboard, legal) in `Execution/_OPEN-<slug>.md`.
4. Rows are moved, never deleted.
- Round 2 (2026-11-12, from docs/owner): owner files de-duplicated and `docs/owner/unsorted.md` emptied. Claude checks that need a full worktree with data: T286-e (Valbona Valley PDF guide, every "around" row a real nearby place, `?paymock`), T335-c (maintenance screen and announcement bar at 375 and 1440 px), T1089-f (run the 10 skipped `verify_*.mjs` harnesses with the public anon key, a fast build and the main checkout's data; fix the stale `account_panel` selectors). `verify_home.mjs` still waits for `.hv-week`, removed by T953: fix that wait.

**A4. Claude context, lean and exact**

Every Claude session reads the same entry files before it does anything. When they are long, stale or wrong, each session spends tokens and time looking around, and can follow a dead pointer. Measured on 2026-11-04:

| Entry file | Today | Problem | Target |
|---|---|---|---|
| Memory index (`MEMORY.md` in the Claude project memory) | 15 KB, about 200 lines, pointing at 303 memory files | Loaded into every session; many entries describe things since rebuilt (Vercel hosting, old planner versions, retired fare sources) | Under 5 KB; stale memories merged or deleted with the `consolidate-memory` skill |
| `CLAUDE.md` | 10 KB | Names `pipeline/schema.py` (does not exist); says tests are not in CI (11 workflows run) | Corrected; points at ROADMAP.md, the handbook and the audit |
| `MAP.md` | 8 KB | Wrong files for the rating sheet and the trip page (T1045-b); lists docs to distrust that A1 will archive | Every path exists; "docs to distrust" list gone once archived |
| `.claude/skills/` | carta-design, impeccable, repo-cleanup (75 tracked files) | A copy of impeccable is also installed globally | Only project skills that are used, plus the new `carta-docs` skill (B7) |
| Stale nested repo `continent-app/.git` | still on disk | `git status` there shows hundreds of false changes and has misled sessions | Removed (owner step, T1040-d) |

**How it stays lean.** A small script (`scripts/docs/check_entry_points.py`, run in CI with B7) fails when CLAUDE.md or MAP.md names a path that does not exist. Every task report already names its files, so MAP rows can be checked against the reports.

**What A1 removes, so sessions stop finding it.** These are the stray folders and files listed in A1: `Claude outputs/`, `additional docs/`, the old `Roadmap/`, the September plans, the 21 one-off scripts, scratch reports, about 80 MB of logs and caches, and the 12 distrusted docs. Everything is moved to `archive/` or deleted locally, as A1's table says.

**Depends on.** Nothing. A runs first, with A4 before everything else.

---

## 8. Track B: documentation

**Goal.** You can look up any feature, any rule, any threshold and any data field and find: what it does, why, where it lives in the code, what feeds it, and when it last changed. Most of it is generated from the code, and CI fails when the docs and the code disagree.

**Exit criteria.**
- `docs/HANDBOOK.md` covers every feature in MAP.md.
- Every business rule in the code has a logic ID and an entry in the logic catalogue, both ways, checked in CI.
- Every config number (rating, pricing, quality rules) appears in generated docs with its explanation.
- Every MAP area has a current doc; reference, lineage and diagrams regenerate in CI; the drift check is green.
- Worked examples in the docs run as tests.
- The docs site is live with search and an "ask the docs" box.

### The documentation system

Seven layers. Each answers a different question, and each has an owner (you, Claude in the task loop, or a generator).

| Layer | Answers | Kind | Kept true by |
|---|---|---|---|
| **Handbook** | What does each feature do and how does it work? | Written | Task loop updates the section |
| **Logic catalogue** | Where is every rule, formula and threshold, and why is it that value? | Written, linked to code by ID | CI check: every tag has an entry and every entry a tag |
| **Config reference** | What does every number in `rating.json`, `pricing.json`, `rules.yaml` mean? | Generated from `_doc` fields in config | Generator in CI |
| **Area docs** | How does this part of the system fit together? | Written, one template | Drift check per area |
| **Data lineage** | Which source and pipeline step produced this field? | Generated from the task registry and schema | Generator in CI |
| **Reference** | What functions, tasks, endpoints and tables exist? | Generated (pdoc, TypeDoc, OpenAPI, SQL) | Generator in CI |
| **Decisions and history** | Why did we choose this, and what changed when? | ADRs and per-area changelog | ADR per decision; changelog from `T`-prefixed commits |

Plus: runbooks (how to operate), a glossary (every Carta term), and research notes (section 2).

### Research

| ID | Question | Starting points | Timebox | Output |
|---|---|---|---|---|
| B-R1 | Which documentation framework should structure Carta's docs? | Diátaxis (tutorials, how-to, reference, explanation), the Good Docs Project templates, "Docs for Developers" (book), GitLab and Stripe docs as examples | 1 day | Decision on B2's tree and doc types |
| B-R2 | How do teams keep business logic documented next to the code without it rotting? | "Living documentation" (Cyrille Martraire), docs-as-code practice, ADR practice (Michael Nygard), architecture decision log examples on GitHub | 1 day | Decision on B3's tag format and catalogue shape |
| B-R3 | Which docs site and generators fit a Python + JS repo? | MkDocs Material vs Docusaurus vs Starlight; pdoc vs Sphinx; TypeDoc; mkdocstrings; Mermaid for diagrams | 1 day | Decision on B6 tooling |
| B-R4 | Can an "ask the docs" assistant be built on the existing Ask Carta stack without the Claude API? | Ask Carta's own `ask_index_layer.py` and model2vec, Workers AI models, local Ollama | 1 day | Go or no-go for B8 |

### Items

| ID | Item | Done when | Size | Phase | Status |
|---|---|---|---|---|---|
| B1 | Carta Handbook | `docs/HANDBOOK.md` explains every feature from the code (T1045: 93 features) | M | P0 | done |
| B2 | Docs tree and area docs | New `docs/` tree, 12 distrusted docs archived, stale core rewritten, 9 missing area docs written, CLAUDE.md corrected | M | P1 | in progress (T1073: tree and area docs; T1085: REGIONS, LAKES, layer and backup docs rewritten from code; T1086: backup, refund, incident runbooks; T1073-a) |
| B3 | Logic catalogue | Every rule tagged with an ID in code, one catalogue entry per ID, two-way CI check | L | P2 to P3 | in progress (T1132: catalogue first pass, 8 domains; code tags and logic_check.py still to do) |
| B4 | Config reference | `_doc` on every key of `rating.json`, `pricing.json` and quality rules; tables generated | S | P3 | in progress (T1165: docs/reference/config.md generated by scripts/docs/config_reference.py, 298 keys with readers, 17 dead; CI fails on a key added or removed without regenerating; the `_doc` siblings and their CI check still to do, they change the config); the round 2 follow-up sweep, docs (register follow-up (docs), T1217, 2026-11-07): dead keys 36 to 3 (provenance and prose marked as notes for people, keys only tests read marked, a config passed as an argument followed so slo.json's 19 keys found their readers, `month.anyWeather` dropped, `match.lambda_range` and `conflict_range` and the anchor bands mirror enforced by `--check`), access-ladder.json added; the `_doc` siblings, `stay.repair` and the top band share check stay open) |
| B5 | Data lineage and diagrams | Per field: source, task, file; Mermaid diagrams of the pipeline and the request paths, generated | M | P3 | done (T1166; lineage for 76 wire fields and 7 request path diagrams in docs/architecture/, check `scripts/docs/build_lineage.py --check`; CI wiring T1166-a done by T1217 (register follow-up (docs), 2026-11-07), MAP.md points to the lineage) |
| B6 | Generated reference and docs site | pdoc, TypeDoc, task catalogue, OpenAPI, SQL tables; MkDocs site with search on private Cloudflare Pages | M | P4 | partly done (T1167: generators, site, CI; OpenAPI waits for F5, deploy is an owner step; OpenAPI done by T1154; register follow-up (docs), T1217, 2026-11-07: python.md and app-lib.md stay regenerated by docs-site.yml (decision), Zensical 0.1.0 tried on mkdocs.yml and builds, the switch waits for its beta to end (T1217-c)); visibility decided (B-a, 2026-11-12): private behind Cloudflare Access until C10 passes |
| B7 | Keep it true: drift checks and the task loop | Drift check per area, executable examples, link check, docstring floor, `carta-docs` skill and Stop hook, CLAUDE.md step | M | P3 | in progress (T1134: scripts/docs/drift.py in CI checks logic constants, values and tests, the SCHEMA.md table and entry points; per-area History check, examples, links, docstrings, skill and hook still to do) |
| B8 | Ask the docs | Search box on the docs site answers from the docs with citations (if B-R4 says go) | M | After | done (T1168, extractive BM25; dense and CI index step open); follow-up (T1168-b, decided 2026-11-12): try model2vec potion embeddings fused with BM25 (RRF); keep only if the ask-the-docs eval score rises |

### Item details

**B1. Carta Handbook**
- One file, six parts: Discover; Scores and seasons; Prices and logistics; Planning; Outdoors and imagery; Ask Carta, accounts and platform.
- Every feature uses five headings: What it does, How it works (real rules and numbers from code and config), Data behind it, Where it lives, Limits.
- Linked from README, MAP and `docs/README.md`. Once B3 exists, every rule in the handbook links to its logic ID.

**B2. Docs tree and area docs**

```
docs/
  README.md        index: what to read for what
  HANDBOOK.md      every feature (B1)
  logic/           the logic catalogue, one file per domain (B3)
  architecture/    system overview, diagrams (B5), ADRs
  areas/           one file per MAP row, same template
  data/            schema, lineage, sources and licences, quality rules
  ai/              Ask Carta, plan-day, guardrails, evals, model cards
  security/        threat model, controls, ASVS checklist (Track C)
  runbooks/        deploy, incident, backup, refund, build box
  reference/       generated, never edited by hand (B6)
  research/        your research notes (section 2)
  glossary.md      every Carta term
  archive/         nothing here binds
```

- Archive the 12 docs on MAP's distrust list.
- Rewrite: both READMEs, PIPELINE, COVERAGE, JOINS, TRAILS, LAKES, BEACHES, MOUNTAINS, REGIONS, PHOTOS, BACKUP, trips_layer.
- Write the 9 missing area docs: Explore, Plan flow, Day planner and plan-day, My trips and Together, Ask Carta, Climate and crowds, Languages, Build box, Tests and checks.
- Correct CLAUDE.md: `pipeline/schema.py` does not exist; tests do run in 11 workflows.
- Area doc template: Purpose, How it works, Files, Data read and written, Logic IDs used, Quality checks, Metrics, Security notes, Known limits, Open items, History, Last verified.

**B3. Logic catalogue**
- A rule is any decision the code makes that a traveller would notice: a formula, weight, threshold, band, sort order, fallback, cap, cache time, eligibility rule.
- Each gets an ID like `RATING-004` or `PRICE-012`, tagged in the code with one comment (`# LOGIC: RATING-004` in Python, `// LOGIC: RATING-004` in JS).
- Each ID has one entry in `docs/logic/<domain>.md`: statement in plain words, the formula or rule, current values (linked to config), why this value, where it is used, tests that cover it, the task that introduced or last changed it.
- `scripts/docs/logic_check.py` in CI: every tag has an entry, every entry has at least one tag, no ID used twice.
- First pass by domain in this order: rating, price, recommendation, seasons and crowds, trails, Ask, plan-day, quotas and paywall.

**B4. Config reference**
- Every key in `continent-app/config/rating.json`, `pricing.json` and `pipeline/quality/rules.yaml` gets a `_doc` sibling (meaning, unit, range, logic ID).
- A generator writes `docs/reference/config.md`. A missing `_doc` fails CI.

**B5. Data lineage and diagrams**
- Each task in the registry declares `reads` and `writes`. With the schema (D1) this gives, per wire field: source, task, intermediate file, final file.
- Generated outputs: `docs/data/lineage.md` (table per wire file) and Mermaid diagrams for the pipeline DAG, the data wire, and the request paths of Ask, plan-day, flights and stays.

**B6. Generated reference and docs site**
- pdoc (Python), TypeDoc (app `src/lib`), the task catalogue (cadence, inputs, outputs), OpenAPI for the Intelligence API (F5), Supabase tables and RLS policies from the migrations.
- Site: tool from B-R3, private Cloudflare Pages project `carta-docs`, full-text search, built in CI on every merge.

**B7. Keep it true**

| Check | How |
|---|---|
| Drift per area | `scripts/docs/drift.py` maps each area doc to file globs (from MAP.md). A change to those files without touching the area doc's History fails CI (skip label for trivial changes) |
| Executable examples | Worked examples in the handbook and logic catalogue (for example a 4-night trip total) live as fenced blocks that a test runs against the real code |
| Links | `lychee` link checker |
| Docstrings | `interrogate` floor at today's figure, ratcheting up |
| Task loop | New step in CLAUDE.md "How to run a task": update the handbook section, logic entries and area History. A `carta-docs` skill holds the checklist; a Stop hook reminds when area files changed but docs did not |
| Changelog | Per-area changelog generated from `T`-prefixed commit messages |

**B8. Ask the docs**
- Index `docs/` with the same passage builder and model2vec embeddings as Ask Carta; answer with citations to doc sections; runs locally or on Workers AI. Never the Claude API.
- Doubles as a second RAG system to evaluate with the E1 harness.
- Round 2 (2026-11-12, from docs/owner): T1168-c: run `ask_docs.mjs --model` once live with a Workers AI token (`CF_AI_TOKEN`, AI read) and record the answers.

**Depends on.** A1 for B2. D1 for B5. F5 for the OpenAPI part of B6.

---

## 9. Track C: security

**Goal.** Every surface of Carta is threat-modelled, every threat has a control, every control is tested, and all of it is written down. Target: OWASP ASVS level 2 for the app and APIs, the OWASP Top 10 for LLM Applications for the AI features.

**Exit criteria.**
- `docs/security/threat-model.md` covers every surface, with each threat mapped to a control and a test.
- ASVS L2 checklist complete, every gap closed or accepted in writing.
- Dependency, secret, SAST and DAST scans run in CI with no high finding open.
- External retest (C11) passed.
- `SECURITY.md` and `security.txt` published.

### Surfaces in scope

| Surface | What is there |
|---|---|
| App (browser) | React SPA, local storage of trips, CSP |
| Pages functions | `functions/api/ask`, `flights`, `stays`, prerender |
| Supabase | Auth, Postgres with RLS, Edge Functions (plan-day, parse-booking, suggest-city, checkout, stripe-webhook), storage |
| Payments | Stripe checkout and webhook |
| Data and storage | R2 buckets, wire files, backups |
| AI | Gemini calls, Workers AI, prompts, retrieved notes, booking emails |
| Build box | Hetzner server, SSH, scheduled scrapers, secrets on disk |
| Supply chain | npm and pip dependencies, GitHub Actions, Cloudflare and Supabase accounts |
| People and accounts | Owner accounts on GitHub, Cloudflare, Supabase, Stripe, Google, Hetzner |

### Research

| ID | Question | Starting points | Timebox | Output |
|---|---|---|---|---|
| C-R1 | How do I threat-model a small product properly? | STRIDE, OWASP Threat Modeling Cheat Sheet, OWASP Threat Dragon, "Threat Modeling: Designing for Security" (Shostack) | 2 days | Method and template for C1 |
| C-R2 | Which standard should Carta be measured against, and at what level? | OWASP ASVS 4.0 (L1 vs L2), OWASP Top 10, OWASP Top 10 for LLM Applications, OWASP MASVS (if a mobile app comes) | 1 day | Chosen checklist and level for C10 |
| C-R3 | How do Supabase and Cloudflare recommend locking down auth, RLS, functions and accounts? | Supabase security and RLS guides, Supabase "production checklist", Cloudflare Pages and Workers security docs, Stripe webhook security docs | 1 day | Settings list for C3, C4, C5 |
| C-R4 | Which free scanners fit this stack, and what do they catch? | Semgrep, CodeQL, OWASP ZAP baseline, gitleaks, trivy, pip-audit, npm audit, OSV-Scanner, Dependabot vs Renovate | 1 day | Tool choice for C6 and C10 |

### Items

| ID | Item | Done when | Size | Phase | Status |
|---|---|---|---|---|---|
| C1 | Threat model | Every surface modelled with STRIDE (or C-R1's method), threats ranked, each mapped to a control and test | M | P1 | done (T1069) |
| C2 | Secrets and accounts | Inventory of every secret (where, who, rotation), rotation done for old ones, MFA on every owner account, recovery codes stored | S | P0 | in progress: inventory done (T1059); owner rolled the leaked, critical and billed keys and turned on MFA (T1059-a to T1059-d, recorded 2026-11-12); open: GitHub Actions secrets (T153-b, T235-a) and restricted live Stripe keys at go-live (T1059-e), both in `docs/owner/secrets-rotation.md` |
| C3 | Auth and access | Supabase auth settings per C-R3, admin behind MFA and role checks, session lifetimes set, admin actions audit-logged | M | P1 | in progress (T1071: code half; T1084: Dashboard done; open T1071-c, T1071-d, T1084-a, T1084-b); owner decisions 2026-11-12: T1164-f built (no composition rules, context words in sign-up, reset and change password), the context check runs in the app only, so a server-side check (Auth password hook) is open (ASVS V6.2.11 partial); optional TOTP for travellers decided and not built (needs `[auth.mfa.totp]` on, an enrol step in Account and an aal2 sign-in step); T1164-j session lifetimes settled by the owner (time-boxed sessions wait on the Supabase Pro plan); follow-up (T365-f, decided 2026-11-12): new migration requiring aal2 in admin_adjust_expiry like admin_set_tier, with a down migration and an admin-rpc-security test |
| C4 | Data access and RLS | RLS on every table proven by tests (exist, extended), service-role key never in the browser, storage and R2 access reviewed | S | P2 | in progress (T1078: all 34 tables fixtured, signed-out reads fixed, bundle key check; 063 is T1078-a. T1087: all 16 admin harnesses green to 064 and in CI, definer search_path test; 2026-11-12 live check: all 121 SECURITY DEFINER functions pin search_path (T1087-c). Follow-ups: pin search_path on the three non-definer functions the Supabase advisor flags (`eu_member_states`, `eu_vat_bp`, `email_prefs_stamp`); after the first real content report, confirm `content_reports.source_header` is `cf-connecting-ip` (T068-c)) |
| C5 | Web and API hardening | Strict CSP and security headers, CORS allow-list, input validation on every endpoint, durable rate limits (with H3), Stripe webhook signature check verified | M | P2 | in progress (T1079: headers, function guards, Edge CORS and body caps; T1090: no style-src 'unsafe-inline', CSP gate in CI; deploy and WAF are T1079-a, T1079-b; Edge CORS verified live 2026-11-12; the T1079 headers checked on a throwaway Pages preview 2026-11-12, they go live with the next ship); per-address cap for the Edge Functions decided 2026-11-12: a database counter by address (owner decision T1157-c), not built (needs a migration and a check in `_shared/http.mjs`) |
| C6 | Supply chain | Lockfiles enforced, `npm audit`, `pip-audit`, OSV in CI, Renovate or Dependabot, GitHub Actions pinned to SHAs, SBOM per release | S | P3 | done (T1080; gates on since T1088, first CI run unverified: T1080-c). Owner sweep 2026-11-12: Dependabot alerts and security updates on; React, ESLint and Vite majors grouped, numpy, rasterio and geopandas held. Follow-ups: (1) the numpy 2 / Python 3.12 move (CI and box on 3.12, numpy 2, then rasterio 1.5 and geopandas 1.2; closed PR #31, open #26); (2) the uptime pipeline check needs a narrow read path (an anon-callable summary of `pipeline_runs`) so `CARTA_SUPABASE_SERVICE_KEY` never goes into GitHub; (3) pin `docs-site.yml` and `load.yml` actions to SHAs; (4) `semgrep`, `scan` and the three database checks become required on `main` once green on every PR (`.work/2026-11-12-owner-security/report.md`) |
| C7 | Static analysis | Semgrep or CodeQL on every PR, findings triaged to zero high | S | P3 | done (T1119) |
| C8 | AI security | OWASP LLM Top 10 mapped to Carta; guardrail module (E3) covers injection, output handling, excessive agency, data leakage; injection set in CI | M | P3 | in progress (T1117: `aiGuard` on Ask, plan-day, parse-booking; 50-attack set in `npm test`; OWASP map in the threat model. Live red team is T1117-a; suggest-city is T1117-b) |
| C9 | Privacy and GDPR | Data map (what personal data, where, how long), retention jobs, export and delete tested end to end, Article 30 current, a light DPIA for AI features | M | P3 | partly done (T1118: Article 30 current with a retention line per table, 069 retention sweep, export schema 4 and erase trigger tested end to end; legal review, paste and the AI DPIA open); 2026-11-12: booking documents need not stay in the EU, any host with a DPA (T1135-d); the anonymised `pass_grants` record is kept for the Belgian VAT period the accountant confirms (T1118-b, draft 10 years), sweep line to follow once confirmed; T1054-b (2026-11-12): deleting the account now also clears this device's account-tied stores (`clearDeviceThings`), add it to the data map; T1015-a (2026-11-12): documents in the Notes tab stay on the device, a booking the traveller imports is sent once to parse-booking and not stored (a failed read keeps only its kind and size in `parse_failures`, 30 days), add it to the data map; the 2026-11-12 Privacy policy line "your feedback is deleted with your account" ships in the same release as the 069 paste (supabase lane), not before |
| C10 | Security testing | ZAP baseline scan in CI against preview deploys; full ASVS L2 checklist walked and recorded | M | P4 | in progress (T1164: `zap.yml` with a High gate, local preview scan 0 High; Edge and Pages auth tests in `npm test`; ASVS 5.0.0 L2 walked in `docs/security/asvs.md`, 50 gaps as rows; preview scan and live probes are T1164-a, T1164-b); the round 2 follow-up sweep, ops and security (register follow-up (ops and security), T1211, 2026-11-07) closed 19 of 32 ops and security rows: ASVS gaps 50 to 39 (security documents, SSRF address and redirect checks, static CORS detached, refused-request log lines, upload sanitising recorded as the control), the auth tests also on the Deno runtime, backup freshness alert, every migration rebuilds on a plain Postgres; PKCE, least privilege and the log store stay open; parse-booking link import goes through an egress proxy that checks the connected address (owner decision T1211-a, 2026-11-12), not built (V13.2.4, V13.2.5 stay gaps until it is) |
| C11 | External check and disclosure | `SECURITY.md`, `security.txt`, incident response for security events; an outside review or a structured self-pentest, then retest | M | P4 | todo; method decided (C-a, 2026-11-12): structured self-pentest with OWASP WSTG and a retest, peer review if offered |

### Item details

**C1. Threat model**
- One section per surface: data flow diagram, assets, trust boundaries, threats (STRIDE), likelihood and impact, control, test.
- Kept in `docs/security/threat-model.md`. Revisited whenever a new surface appears (for example F5 and F7 add services).

**C2. Secrets and accounts**
- Inventory in `docs/security/secrets.md` with names only, never values: Supabase keys, Stripe keys, Gemini keys, Cloudflare tokens, R2 keys, Hetzner SSH, Google.
- Rotation schedule; any secret ever pasted in a chat, log or commit rotated now.

**C3. Auth and access**
- Email confirmation, password rules, leaked-password check, rate limits on auth endpoints, JWT expiry, refresh rotation.
- Admin: role checked server side on every RPC (the `admin-rpc-security` workflow exists), MFA required, every admin action written to an audit table.

**C4. Data access and RLS**
- Extend `rls-policies.yml` to every table, including new ones from C4, E4 and F3.
- Check that no browser bundle contains a service key (a CI grep on `dist/`).
- Round 2 (2026-11-12, from docs/owner): T1087-b: once admin-harnesses, admin-rpc-security and rls-policies are green on `main`, add them to the required checks: `gh api -X POST repos/basvn123/carta-travel-app/branches/main/protection/required_status_checks/contexts` with the three names.

**C5. Web and API hardening**
- CSP without `unsafe-inline` where possible, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`; verified with a header test.
- Every Pages and Edge Function validates input with a schema and returns generic errors.

**C6. Supply chain**
- Renovate (or Dependabot) with grouped weekly updates; auto-merge only for patch updates with green CI.
- GitHub Actions pinned to commit SHAs; workflow permissions set to read by default.

**C7. Static analysis**
- Semgrep rules for JS, Python and SQL plus a few Carta-specific rules (no `service_role` in `src/`, no raw SQL from user input, no Claude API imports).
- Round 2 (2026-11-12, from docs/owner): T1119-b: triage the findings the fixed gate now reports (real ones fixed, fixtures baselined with a reason), then make `static-analysis / semgrep` required. Also red on `main`: schema-contract (11 dynamic table or function names the gate cannot read; `public/entry_rules.json` missing from the workflow's sparse list, an orchestrator workflow edit) and coverage-contract (`reports/coverage_contract.json` never committed, old T112-a).

**C8. AI security**
- Map each OWASP LLM Top 10 risk to Carta: prompt injection (booking emails, user questions), insecure output handling (rendering model text), sensitive data disclosure, excessive agency (no write tools), model denial of service (quotas, caps), supply chain (models).
- The controls are E3's guardrail module; this item adds the mapping, the tests and the doc `docs/security/ai.md`.

**C9. Privacy and GDPR**
- Builds on `docs/legal/ARTICLE30.md` and the existing GDPR export. Retention for logs, AI caches, Ask query logs, stays scrape data.
- Follow-up (T1152-f, decided 2026-11-12): derive the taste, funnel and launch counts server-side from requests that are part of the service itself, and drop the client-only pings, so ePrivacy Art 5(3) (EDPB Guidelines 2/2023) does not reach them; add the pass_grants rule of ARTICLE30 row 8 (kept 10 years after the end of the year of the sale, the conservative reading, decision 0010) to the 069 sweep.

**C10. Security testing**
- ZAP baseline on each preview deploy, failing on high alerts.
- ASVS checklist in `docs/security/asvs.md`: each requirement marked met, not applicable, or gap with a register row.
- Round 2 (2026-11-12, from docs/owner): T1164-a: ZAP baseline against production run 43271799649 passed: 0 High, 2 Medium (10098 cross-domain JS, 10055 CSP `style-src 'unsafe-inline'`), 3 Low (COOP, COEP, timestamp); rerun after each preview deploy. T1164-b: live probes done (stripe-webhook 503 until its secrets, AI trio 401 without a user). T1211-b: live parse-booking URL import answers 200 with `Deno.resolveDns` in place (throwaway user, deleted).

**C11. External check and disclosure**
- Ask a security-minded peer, a university contact, or use a structured self-pentest against the threat model. Retest every finding.
- `security.txt` in `public/.well-known/`.

**Depends on.** C1 before C3 to C9. H1 for the CI scans. E3 and C8 are built together.

---

## 10. Track D: data quality and completeness

**Goal.** At any moment, answer "is every place complete, valid, fresh and accurate, and how do I know?" with a number, and close the data gaps the audit measured (trails first).

**Exit criteria.**
- One JSON Schema validates every wire file at write and at sync.
- Every run writes a scorecard; no hard rule fails.
- 95% of truth-set fields correct within tolerance.
- Every layer inside its freshness limit.
- Completeness targets met (baseline from the 2026-11-04 audit):

| Field | Today | Target at launch |
|---|---|---|
| Trails with photo | 20.2% (top band 64%) | 60% overall, 95% top band |
| Trails with summary | 2.6% (top band 6.9%) | 40% overall, 100% top band |
| Trails with a clean display name | 93.6% (6.4% code or empty) | 100% |
| Beaches with sea temperature by month | 0% | 95% |
| Places with local transport fare | 0% | 100% of metros and cities (741) |
| Places with measured bed price | 86.7% | 98% |
| Places with crowds by month | 85.0% (UK 0.4%) | 98% |
| Places with full intro | 47.5% | 85%, in all six languages |
| Places with 5+ photos | 58.0% | 85% |
| POIs (must-see and recommended) with description | must-see 71% | 95% |
| Wires older than their freshness limit | 4 | 0 |

### The six quality dimensions

| Dimension | Question | Check |
|---|---|---|
| Completeness | Does every place have the fields its page needs? | Required fields per entity and tier |
| Validity | Is every value the right type and range? | JSON Schema plus range rules |
| Uniqueness | Is each real place in the catalogue once? | Dedupe within 150 m plus name similarity, as a gate |
| Consistency | Do layers agree? | Cross-layer rules (country of coords = country code, price tier matches price) |
| Freshness | Is it recent enough? | Max age per layer (stays 14 days, flights 3, food prices 180, climate 365) |
| Accuracy | Is it true? | Truth set and cross-source agreement |

### Research

| ID | Question | Starting points | Timebox | Output |
|---|---|---|---|---|
| D-R1 | Build the quality engine myself or use a framework? | Great Expectations, Soda Core, pandera, Pydantic validators; "data contracts" (Andrew Jones) | 1 day | Decision for D2 |
| D-R2 | How do I measure accuracy without labelling everything? | Stratified sampling, confidence intervals on a sample, cross-source agreement, LLM-as-judge calibration (Cohen's kappa) | 1 day | Sample size and method for D4 |

### Items

| ID | Item | Done when | Size | Phase | Status |
|---|---|---|---|---|---|
| D1 | One machine-readable contract | A seeded bad value fails both pipeline write and app sync, with the field path | M | P3 | done (T1133: docs/wire.schema.json, read by the pipeline write guard, the sync and CI) |
| D2 | Quality engine and scorecard | One engine, scorecard and 90-day trend per run, admin Data health panel | M | P3 | in progress (T1134: scripts/quality/scorecard.py, per layer completeness, validity, freshness, accuracy; first card in data/reports/quality/. T1142: scripts/quality/rules.yaml with 75 rules, one per scorecard field; engine.py gate fails the run on a must_see drop of more than 2 points or a hard floor; run_pipeline.py hook; admin Data health tab with the 90-day trend); the round 2 follow-up sweep, data quality and catalogue (register follow-up (data quality and catalogue), T1214, 2026-11-07) closed 21 of 35 rows of T1142 to T1146 and T1173: the gate reads validity, freshness (soft) and rating accuracy and the dossier, hero image and POI audit reports, in-place writers re-date their blocks, block writers checked against the source registry, coverage parity in CI, crowding takes the place's own country first (10 border places moved, 11 proxies labelled), Ask recall per language, trail and cycle override files, the truth judge rubric in the prompt registry; catalogue writes and network fills stay open; T1024-d (owner 2026-11-12): place.visit_h is the one sightseeing-time source; the dossier intro time phrase is rebuilt from it in the same run and a consistency rule fails when the intro phrase and place.visit_h disagree (Rome 13 h vs seventeen); T1142-c (owner 2026-11-12): rules.yaml confirmed; after each fill run the touched fields' floors are raised to 2 points under the new share, and the freshness rule turns hard once app_data has shipped on cadence for a month; T1142-d and T1173-g (owner 2026-11-12): the box uploads the Data health and Overrides snapshot (panel.json) to R2 status/ after each run; an admin-only Pages Function serves it and both admin tabs fetch it, showing its run date and falling back to the build snapshot labelled with its date |
| D3 | Provenance and freshness per field | Every key block carries `_src` and `_asof`; sources registry generated | M | P4 | done in code (T1143: schema 20, 49,328 of 49,328 key blocks stamped on the shipped wire; pipeline/config/sources.yaml, docs/data/sources.md generated, `pipeline/provenance_sources.py --check` in pytest. Open: master migration on the box (T1143-a), the other wire files (T1143-b)); owner sweep 2026-11-12: the box master of 2026-11-10 carries `destinations.*.airports`, which `docs/wire.schema.json` does not have, so `sync-data.mjs` refuses it; the 2026-11-12 ship kept the live schema-20 wire (laptop master moved aside to `app_data/app_data.box-2026-11-10.schema20-airports.json`). Next: add `airports` to the contract end to end (pipeline run, artifact, wire build, app load) or drop it in the writer, then ship the new data |
| D4 | Truth set | 150 items verified by hand, scored per release | M | P3 | in progress (T1144: 150-item stratified sample, 762-row sheet and guide in `evals/truth/`, scorer `evals/run_truth.py` and the `truth` eval, 95.6% on 90 seeded rows; text judge harness with a 50-text calibration set; the hand check and the 50 labels are owner steps); the D23 text judge calibrates on that 50-text set (T1188: kappa, bootstrap lower bound, planted recall; seeded labels only until the owner's); blurbs cite no source, `guide.url` credits the guide text and a blurb is checked against Wikipedia or another reliable source (owner decision T1144-e, 2026-11-12); follow-up (T153-d, decided 2026-11-12): a session spot-checks the ten golden trips' key figures against their sources before T153-a blesses the baseline |
| D5 | Scraper and source health | Yield, drift and staleness alerts reach admin and email | S | P1 | in progress (T1074: box steps T1074-c); stays manifest stamps `SCHEMA_VERSION` (20) instead of a typed 18 (owner sweep round 2, 2026-11-12), live once the box pulls `main` and the monthly `stays` run (2026-12-05) or a manual `box_stays.py` republishes |
| D6 | Coverage fairness | Parity table per country, region and language in `docs/data/` | S | P4 | done (T1145; Ask recall per language T1145-c, blend review T1145-e) |
| D7 | Trails and outdoor fill | Trail targets in the table met; display names cleaned; difficulty weighs climb and terrain, not length; mountains and lakes filled (P-21, P-30, P-36) | L | P1 | in progress (T1092: display names and per-day difficulty in code; rebuild is T1092-a; T1093: photo licence gate and paced harvest in code, the box run is T1093-a; T1094: walk recovery rules (article pairs, lone famous way, main line, reorder splice) and the Northern Ireland country fix in code, the box rebuild is T1094-a); owner sweep 2026-11-12, data-lane exports moved here from docs/owner: lake shore length and swept flag (T182-a), beach walk-in minutes (T182-b), lift top station height (T182-c), a monthly field for beaches, mountains and walks (T394-b, sea temperature is in `sea_temp`), lake floors for GB and IE (T456-e), start reachable by public transport (T373-f), local and exonym names in the catalogue (T384-h); trails `top.json` is live on the data host (T183-a done) |
| D9 | Place text and photos | Intros, guide text and galleries to target, French, Italian and UK first; POI descriptions; intros in six languages (P-23, P-24) | L | P2 (top 300), P4 | in progress (T1095: intro harvest built; T1096: gallery pass and POI description harvest built; runs are owner steps). Open: src/lib/cheapTips.json (103 KB of money tips, shown as Travel cheaper) is English in all six languages (T377-f, moved here by the owner sweep 2026-11-12) |
| D8 | Sea temperature | `sea_temp` run, beaches re-exported, `climate.water_c` filled, beach strip draws (P-22) | S | P1 | code ready (T1097); box run T1097-a |
| D10 | Prices completed | Local transport fare table for 741 places; bed prices for the 515 missing places; "not yet measured" shown honestly (P-25, P-26) | M | P1 | in progress (T1075, T1114: notes on all five price screens; T1115: fare field planned in SCHEMA, 127-metro list and source comparison ready; fare source decided: a curated table of the operators' own fare pages (I-c, T1115-a); the 127-metro table is next); owner sweep 2026-11-12: the stay hold-out (12 towns in 3 countries) is widened from the box stays journal once the monthly stays build runs, then the suite reruns (T096-a); T714-c (2026-11-12, owner: change the homepage promise now) is applied the honest way: when the first fares ship, add `'transport'` to `DAY_PARTS` (`src/lib/dayIncludes.js`, `dest.dayPart.transport` exists in six languages) and change `home.ch2` (a manual follow-up, not automatic), since no place has a fare yet (T714-b "Not now") and promising them earlier would print a false price; R4 (2026-11-12): the price follows the trip settings: a hire car drops the stops' local fares and adds parking and local driving (`car.local`), cars count babies in the hire and the day alike, the wizard stay filter prices at the stop's own nights |
| D11 | UK crowds by month | ONS or VisitBritain regional visitor nights for GB, plus BA, FO, MD, XK (P-27) | S | P1 | doing (T1098: loader and task built; owner run pending); owner sweep 2026-11-12: the box has neither `uk_crowds_nights.csv` nor the ITL1 outlines, so the 2026-11-09 `crowding_uk` success was a no-op; building both input files is Claude's (T1098-a, T1098-b), then the task reruns (T1098-c) |
| D12 | Freshness and stamps | Every wire inside its limit; `generated_at` correct in `app_data.json` and all wires (P-29) | S | P1 | in progress (T1099: stamps, report and test done; refresh runs are owner steps); T1099-d (owner 2026-11-12): each wire's freshness limit = producing task cadence + slack + 7 days, derived from pipeline/tasks cadences in freshness_report.py (app_data 16, monthly wires 41, quarterly layers 107) |
| D13 | Getting there mode choice | Mode picked by door-to-door time and cost; flights preferred above a distance; checked on 50 origin and destination pairs (P-31) | M | P1 | in progress (T1100: rule in code, 50-pair check on fixture fares; the run on the real sweep is T1100-a); follow-up T506-c (owner 2026-11-12): budget search (lib/budgetSearch.js) counts drivingEstimate fuel and tolls in the total when the way is Own car; train and bus stay "Not priced yet"; update app-rules "Budget search" in the same commit; follow-up T855-a and T874-f (owner 2026-11-12): when a finder or flight-first trip keeps a flight on another day than the trip's, the trip's dates move to the flight and stays and food are priced for those nights. Decided in the owner sweep 2026-11-12 (T506-b): add a "set aside for getting there" amount the traveller types, taken off the budget as their own figure, because without it 3,664 of 3,855 places fit the worked example |
| D14 | Licensed data sources | Aviasales Data API (Travelpayouts) supplies "from" fares where its coverage is good; Viator and Tiqets APIs supply activity prices; each source's licence recorded; scraped beds flagged as a risk until the Booking Demand API is reachable | M | P1 | probe built (T1112), owner run pending |
| D15 | Catalogue gaps: add and prune places | D6's gap list worked through: missing places added per country and region under the same rules and checks as today's 3,868; duplicates merged and places failing D2 removed or fixed, each change logged | M | P4 | part 1 done (T1146: review list in docs/data/catalogue-gaps/). Part 2, applying the approved adds with `promote_place_candidates.py --approve`, waits on owner step T1146-a (`docs/owner/unsorted.md`); follow-up (T448-d, decided 2026-11-12): about 10 one-base hiking weeks in pipeline/journeys/ after T431-b and T431-d; family beach weeks and Camino weeks after launch; T384-h (owner 2026-11-12): the catalogue and region wires carry alternate names (Wikidata labels and aliases, six app languages plus the local one, CC0) and lib/placeSearch.js ranks them, so Gent finds Ghent and Sicily finds Sicilia; T1191-j (owner 2026-11-12): Skanor med Falsterbo (SE D6-005) approved; Cashel added as an IE candidate for County Tipperary under the D15 rules; Sicily, Sardinia, Veneto covered by the existing region pages plus English names (T384-h); T459-f (owner 2026-11-12): merge Terme di Diocleziano into Baths of Diocletian (one POI, local name as alias, category ancient site and museum, not Sauna & baths); the uniqueness check also matches the same Wikidata item or a cross-language name within 400 m. Part 3, from the owner sweep 2026-11-12 (report `.work/2026-11-12-owner-review/report.md`): merge the Baths of Diocletian duplicate under its English name (T459-f); drop or mark not-visitable the 74 "Fondali" seabed POIs, 9 of them must-see (T433-c); correct wrong kinds and dwell times such as the Colosseum filed as a theatre for 25 min (T433-l). The source `cache/activities.json` is protected and overrides cannot patch list items, so the fix goes in `normalize_poi_kinds.py` and `dedupe_pois.py`, then a box rerun |
| D16 | Link and page health | Every outbound link (official sites, booking, affiliate, sources) and every image URL checked weekly; broken ones listed in admin and fixed or dropped | S | P2 | built (T1197, 2026-11-07: checker, weekly task, admin list with fix-or-drop, D2 rule; the first full run is a box step, T1197-a) |
| D17 | Photo correctness | A sample of hero photos per run checked against the place they front (wrong town, map, logo, interior); flagged ones replaced; rate tracked in D2 | M | P3 | in progress (T1198, 2026-11-07: pipeline/photos/correctness.py, task photo_check, a weekly sample of 500 heroes, cheap signals then Gemini for the unsure, flagged heroes replaced from their own ladder, flag rate a hard D2 rule through the D23 runner layer photos; the first box run, the baseline, the vision run and source-side replacements are open, T1198-a to T1198-h) |
| D18 | Seasons and closures | Places, huts, lifts and ferries that close part of the year carry their open months; the month strip and the plan flow stop suggesting a closed place | M | P3 | code done (T1202, 2026-11-07); first data run is owner step T1202-a; owner sweep 2026-11-12: opening hours per POI from OSM `opening_hours` decided yes (T433-b; 0 of 3,865 POI shards carry hours today); Round 2 (2026-11-12, from docs/owner): Trip facts authoring (T169-a, T170-a, T170-b, T174-b, T174-c) decided: Claude Code sessions write them from cited official sources in batches of about 20 trips, instead of a paid Gemini run: booking windows (66 trips), a bad-weather fallback per outdoor day, arrival, departure and sleeping facts (new schema slots), descent per moving day, surface and traffic-free split per cycling trip. No source, no fact. Trip validator plus a 10 percent spot check by a fresh session, then the journeys wire rebuild. |
| D20 | Heat and fire risk by month | Months with extreme heat or wildfire risk marked per place from open climate data, so "best months" never sends a family into 42 degrees | S | P3 | built T1200 (dry-heat proxy; true FWI table and run are owner steps); follow-up T1022-c (owner 2026-11-12): the climate comfort index weighs heat harder so a month with highs at when.guide hot_c (33 C) or above never rates Good; change the pipeline cut points and whenGuide.js together (T1022-b) |
| D19 | Entry rules and official advice | Entry requirements per traveller nationality (EU Entry/Exit System, ETIAS, visas) and official travel advice per country, from government sources whose licence allows reuse, with the date checked | M | P3 | done in code (T1199, 2026-11-07); live GOV.UK refresh and source check are owner steps T1199-a, T1199-b; Check before you go asks once for the traveller's passport, remembers it and shows that one line (owner decision T1199-e, 2026-11-12), not built; follow-up (owner T183-f, 2026-11-12): Band 1 of the opening screens (lib/openingScreen.js) skips places in a country under official advice against all or all but essential travel (D19 data) and restricted-entry places (Mount Athos); they stay in search, lists and rails; Round 2 (2026-11-12, from docs/owner): T1199-a: check `pipeline/entry_rules.py` against travel-europe.europa.eu (EES, ETIAS; needs a JavaScript browser), Your Europe, EUR-Lex 2018/1806 and GOV.UK, then move RULES_CHECKED. |
| D21 | Accessibility facts | Step-free access and accessible toilets at key places and stations, from OpenStreetMap tags where present, shown only when known | S | P4 | code done (T1203): harvest, destinfo `access` row and place page card on fixtures; the Overpass run is an owner step; Round 2 (2026-11-12, from docs/owner): T1203-b: no `access` rows have shipped and the box's quarterly timer first fires 2027-01-16; run `access_facts` (Overpass, free) before a ship, then look at the Access card at 390 and 1440 px. |
| D22 | Trip footprint | An honest CO2 estimate per trip and per transport mode from published emission factors, shown beside the price | S | P4 | done (T1204, round 3; T1204-a 2026-11-12: factors checked against the DESNZ 2026 flat file, train 35 to 31 and car 170 to 162 g) |
| D23 | External validation of every layer | Every layer and every generated text has a validation run per release: a comparison with outside references whose terms allow it, a calibrated LLM judge where facts are textual, the 30 largest gaps reviewed with a verdict, corrections made at the cause, and a gate that fails the run when a must-pass check drops; results in one scorecard per layer | L | P3 (method and first runs), P4 (every layer, every release) | in progress: trails first run done, 282 outside reference trails matched (coverage 52.8%, top band 33.0%), the 30 largest gaps reviewed and a gate wired as the `trails-external` data eval (T1181, 2026-11-06); the method built: one runner with sampling per country, one scorecard format in `data/reports/validation/`, the admin trend under Data health and the gate joined to the D2 quality run, trails the first layer on it (T1187, 2026-11-06); beaches the second: 14,861 EEA sea sites, coverage 23.6%, class agreement 97.8%, 30 gaps reviewed, Blue Flag loader awaiting an owner export (T1189, 2026-11-06); prices the third: Eurostat price levels for food, drink, groceries and beds, 406 of 407 country items matched, 74.6% within tolerance, MdAPE 14.2%, 30 gaps reviewed (9 Carta faults), a 48-row hand sample drawn and fare examples awaiting the owner (T1190, 2026-11-07); the LLM judge for text and facts built: `pipeline/judge/` with a session and a Gemini backend, prompt `judge-text` in the registry, calibration against the D4 labels with the threshold rule in config, wired into the runner as the `texts` layer; on seeded labels kappa 0.94, so it does not count until the owner labels (T1188, 2026-11-07); place ratings the fifth: T760 repeated on 3,855 places with pageviews, Wikivoyage, lists and UNESCO kept separate, tau-b 0.153 with pageviews (0.334 rho controlling for population), list AUC 0.773, agreement for 21 countries plus a pooled row, 30 gaps reviewed (24 keep, 4 catalogue, 2 appeal proposals), Wikivoyage tiers and tourism board lists awaiting the owner (T1191, 2026-11-07); cycling: 119 EuroVelo route-country items from an unverified seed list, coverage 42.0%, 30 gaps reviewed (13 probable Carta holes, 10 tagging, 7 route absent), geometry and length facts waiting for owner files (T1193, 2026-11-07); climate, sea temperature and crowds layers built on the runner with error tables per month and country, reference exports and gap review awaiting the owner (T1194, 2026-11-07); trips: 1,806 legs on the runner, a hand seed of 81 published timetable times (coverage 4.5%), 50.9% of 57 timed train legs within max(20 min, 20%), 24 train legs whose end has no station, 30 gaps reviewed (all Carta faults at two causes in leg()), the GTFS and OSRM runs awaiting the owner (T1195, 2026-11-07); texts and translations: a stratified sample of 120 shipped texts judged against their cited sources (supported 41 of 120; place blurbs 2 of 40, wire trail summaries 8 of 20, T1179 summaries 20 of 20, journey summaries 11 of 40, 6 contradicted) and a back-translation check on all 3,187 drafted strings (3,176 hold, 11 fail, worst cases in docs/i18n/review.md), all provisional until the judge is calibrated on the owner's labels (T1196, 2026-11-07); the other layers todo; lakes and mountains the next two: 6,211 EEA lake sites, coverage 27.5%, class agreement 98.7%, 30 gaps reviewed (16 real holes); mountains runs on a 21-summit seed, the Wikidata export awaiting the owner (T1192, 2026-11-07); the round 2 follow-up sweep, validation (register follow-up (validation), T1216, 2026-11-07) closed 11 of 45 validation rows: the ratings layer reads every component point of a serial World Heritage site (fact.unesco_join 360 to 610 places in reach, 75.6% to 57.0% tagged, which shows the join gap of T1191-a), BG register names transliterated for the beaches name test, a runner --gaps-only option, seven rows already done by later tasks; 34 stay open (layer writers, the box and owner runs); T1189-d (owner 2026-11-12): a beach with several EEA bathing sites shows the worst class among them; fix in the beach export and re-check the 76 beaches; T1191-c (owner 2026-11-12): accept appeals Dannewerk 6.8 to 6.2 and Bleggio Superiore 6.5 to 6.1, applied as in T781 (app_data/curated_appeal.json, re-score on the frozen reference, only these two move) and review why their Q reaches 8.3 and 7.7; T1195-e (owner 2026-11-12): timetable references for SE (Trafiklab), IE (NTA) and BE (unified open data gateway, attribution); IT, CZ, PL, NL, DK no reference until a licence is confirmed; each used feed added to src/ingestion/core/registry.py and docs/tos/data_licenses.md |
| D24 | Trail quality pack | Trail summaries for the top band; the downhill relief fix (T286-c); the trails external check with a trail validation gate; the trails lab on the box (T784-a); the 3,518 broken routes repaired where they become continuous; multi-stage treks as one record with stages; the way back for one-way walks; mountains and lakes filled | L | P1 to P2 | in progress: summaries for the 2,089 top-band walks written and checked, not yet on the wire (T1179, 2026-11-06); downhill relief fixed in rate.py, re-rate on the box pending (T1180, 2026-11-06); trails external check and gate in place, 133 of 282 reference trails missing, 33 of them for broken geometry (T1181, 2026-11-06); routed continuity repair built and tested on fixtures behind CARTA_TRAILS_ROUTE_BRIDGE, the box run pending (T1183, 2026-11-06); multi-stage treks built at export and shown on the trail page, 119 treks expected on the current wire, the export run pending (T1184, 2026-11-06); the way back for one-way walks built at export and shown on the trail page, 6,348 one-way rows expected on the current wire, the export run pending (T1185, 2026-11-06); mountain route up and lake water class fill steps built and tested on fixtures, the network run pending (T1186, 2026-11-07); trails lab on the box built and dry-run (tools/trailslab/box, CARTA_TRAILSLAB_HOME=box), enabling it on the box is the owner's (T1182, 2026-11-07); the round 2 follow-up sweep closed 20 of 30 trails rows in code (loop flag and route type follow the line, retired leads off the wire, lake and landform highlights, routed bridges on the wire, stage counts, external check coverage 157 of 282), the box run pending (T1201, 2026-11-07); derived routes fit the 4 GB box (compact way store, location passes, one child process per country, memory preflight; T1223, 2026-11-11), the six big countries run on the next quarterly run; the rest todo; follow-ups from T1223: read each country's peak memory on the next box run of `trails_derive_routes` (Spain, France and Germany set `CARTA_DERIVE_MB_PER_EXTRACT_MB`; a country the preflight skips needs a bigger box, more swap or a regional split), and load `ingest_osm_routes` node locations in passes with `way_store.load_aligned_locations` instead of one 1.6 GB IdFilter; owner sweep 2026-11-12: the T449 moth on trail 86628 survived its takedown because the wire carries the title percent-encoded; takedown.py now normalises both sides and the ledger row is on the box, but the trails export does not read the ledger: once the box runs merged code and the run lock is free, Claude runs `takedown.py scrub` on the box, pushes the trails wires, and checks that `trails/BE.json` and `trails/top.json` on the data host no longer carry the moth (T449-a); teaching the trails export to read the ledger is the lasting fix; T1179 summaries ship as English `summary` on the wire from the next trails export (owner decision T1179-a, 2026-11-12; `export_wire.wire_summary`); T456-e (owner 2026-11-12): export_lakes.py drops non-lakes before the country floor fill, Geograph photos feed the GB and IE photo gate, then the lakes task reruns; verify_lakes keeps GB 60 / IE 25 unless the re-harvest proves fewer real lakes exist (then pin the reached count with the reason); T642-e (owner 2026-11-12): greenway seed rule adopted (OSM route=hiking|foot|bicycle relations named greenway, via verde, voie verte or ciclovia, 5 km or longer): count first in the report, then ingest through the normal rating; above 1,500 rows only those passing the photo and rating gate ship; Greenway del Lago di Como (relation 5205171) must be in the result (T630-g); T1181-e (owner 2026-11-12): re-tune the rating shape term (one-way walks no longer 0) and per-km scenery once against the frozen trails-external reference with a held-out part, no certification bonus; report how many ratings move; T1183-d (owner 2026-11-12): route_bridge may reorder a relation's pieces by their ends when the chain is unambiguous (joints within 50 m, no branch, no reuse), then route at most one real break; reordered rows flagged in the report, published only when continuous |

### Item details

**D1. One machine-readable contract** (schema migration)
- `pipeline/contract/`: Pydantic models for every wire file. Generate JSON Schema into `docs/data/schema/`, versioned with `schema_version`.
- Validate on write in `pipeline_io.py`; validate with ajv in `sync-data.mjs`. Retire `contract.mjs` once covered.
- End-to-end check: pipeline run, artifact, wire build, app load.

**D2. Quality engine and scorecard**
- Rules in `pipeline/quality/rules.yaml`, each hard (blocks the wire) or soft (warns). Fold in `audit_quality.py`, `audit_gaps.py`, `dossier/audit.py`, image audits, trails freshness.
- Output `data/reports/quality/<date>.json` plus `quality_history.jsonl`. Admin "Data health" panel with the 90-day trend. A drop of more than 2 points on a must_see field fails the run.

**D3. Provenance and freshness per field** (schema migration)
- `_src` and `_asof` on every block that matters. `pipeline/config/sources.yaml` holds licence, cadence and owner per source; `docs/data/sources.md` is generated.

**D4. Truth set**
- 100 places by stratified sample, 25 trails, 25 beaches and lakes, verified once by hand. `evals/truth/` and `evals/run_truth.py`. Refresh 20 places a month.
- Text fields: LLM-as-judge against cited sources (offline in a Claude Code session or via Gemini), calibrated on 50 human judgments.

**D5. Scraper and source health**
- First fix what is broken today: the Hostelworld parser (677 pages, 0 prices), the Booking block since Oct 30 (paused in N1), and switch on the box's monthly stays build (T1021-a). Remove the inert Xotelo path from `functions/api/stays.js` and `src/lib/liveStays.js`.
- Yield alert below 70% of the 7-run median; drift alert when a city's median price moves more than 25%; staleness alerts from D2.

**D6. Coverage fairness**
- Completeness and rating distributions per country and region; Ask recall per language. Each gap becomes a backlog item.

**D7. Trails and outdoor fill**
- Photos: run `trails_images`, then a per-country pass for the worst (DE 4% of 4,725, IT 10%, GB 12%, FR 16%).
- Summaries: top-band trails first (2,348), then the rest, grounded in the trail's own facts (route, climb, sights on the way), checked by the D2 rules.
- Display names: strip route codes and network prefixes, transliterate Cyrillic, shorten long titles, keep the source name on the page.
- Difficulty: weigh climb, terrain (`sac_scale`), and length per day, so a flat 286 km path is "long", not "very hard".
- Recover the 8,893 walks lost as `way_only_not_derived` with the Phase 2 way derivation; close the 549 places with no trail in 20 km where data exists.
- Mountains: route up (14.8% today); lakes: water class (55.8%) and the 258 unknown swim flags.
- Check the country assignment (for example "Grote Rivierenpad" filed under Germany).
- Round 2 (2026-11-12, from docs/owner): T233-a and T233-c decided: stay on Mapterhorn terrain; no own Europe PMTiles cut before launch (355.6 GB planet, no launch need). The Range CORS rule is live (T233-b) if it is ever needed.

**D8. Sea temperature**
- Run the `sea_temp` task, re-export beaches, run `apply_climate`. Confirm the beach page strip draws.
- Round 2 (2026-11-12, from docs/owner): T1097-b: `sea_temp` ran on the box (2,388 rows, 2026-11-09) but no beach row carries it, because `beach_context` runs quarterly (next 2027-01-16). Rerun `beach_context` on the box before the next ship, grep the beach export for `sea_temp`, look at one beach strip at 375 px. Round 2's box run was refused by the session's permission guard.

**D9. Place text and photos**
- Harvest Wikipedia and Wikivoyage intros and guide text (FR 27%, RS 29%, IT 31% today), festivals, neighbourhoods.
- Gallery pass for GB (29%), RO, FR, IT. POI descriptions for must-see and recommended.
- Translate intros into the five other languages (I8).
- Round 2 (2026-11-12, from docs/owner): T1096-c: `place_gallery` has never run on the box. Run it, then `place_gallery.py --report` and `build_dossier.py --all`; look at one GB, RO, FR and IT gallery at 375 and 1440 px.

**D10. Prices completed**
- Local transport: a curated single-ticket and day-pass table per city (source decided: the operators' own fare pages, I-c), 127 metros and 614 cities first.
- Beds: re-scrape the 515 missing places (FR 94, IT 77, GB 56, GR 40) once D5's parser fix lands; places with 2 or fewer observations flagged.
- Follow-up (T099-c, decided 2026-11-12): hut-to-hut weeks: hut nights leave the bed total and the trip receipt says in one line that hut nights are not priced; a hut price tier only once hut prices have a licensed source.
- Follow-up (T534-a with T514-a, decided 2026-11-12): re-cut `bands.cuts` (day, stay, food) in `continent-app/config/pricing.json` from the shipped day-price distribution at measured beds and food model v2, keeping the fat middle band; rebaseline `tests/priceGolden.test.mjs` and update the DESIGN and HANDBOOK band text.
- Follow-up (T597-a, decided 2026-11-12): under Plane, a place with no swept flight on the chosen dates shows "No flight on these dates" in its price slot (cards, pins tooltip, place page), six languages, instead of no total.
- Follow-up (T882-b, owner tick 2026-11-12): far-ahead trips with no swept fare show a typical fare, the median of the swept fares for that route, labelled "Typical for this route, not for your dates" next to the amount and on the receipt line; it is the one allowed mark on a price, never presented as a found fare and never counted in "Fits" without its label; the Terms flight paragraph gets "Where no fare is known for your dates, a typical fare for the route is shown and labelled so." in the same commit that ships T882-b, not before (the Terms are true today without it). PRODUCT.md and app-rules "Flights" name the exception.
- Round 2 (2026-11-12, from docs/owner): T1075-d decided (owner): not-yet slots show as "Not yet measured", never hidden. T714-b decided "Not now" (owner tick): no local fare source yet. T643-a checked: Home Lisbon Hostel (Hostelworld 15529, 10 Dec) says "Prices are per room" at EUR 107.10 for 1 and 2 guests; the sample's 59.85 is the room's 119.69 / 2, so the list figure is per person and the B4 verdict stands. T645-b: after the box first publishes stays (T1021-a), check the live FR stays file's Chamonix prices. T695-b found two defects: `.pitems-trigger` is 36 x 21 px (under the 44 px target), and on a phone the "In this price" panel lists the EUR 90 flight with a switch while the per-day figure is bed and food only, so the switch changes nothing.

**D11. UK crowds by month**
- Regional visitor nights from ONS or VisitBritain mapped to UK places; same method for BA, FO, MD, XK.

**D12. Freshness and stamps**
- destinfo (70 days), trails (52), trips (50), region (49) refreshed by the H9 schedule; every wire stamps its real build time.

**D14. Licensed data sources**
- Google Flights has had no API since 2018, so scraping it has no licensed path. The Aviasales Data API serves cached fares meant for static pages and fits Carta's build; measure its coverage on the 10,094 routes before switching.
- Booking.com's Demand API needs a managed partner contract, so beds stay scraped (flagged) until volume earns one. Hostelworld has no public partner API.
- Sources in [docs/research/2026-11-launch-plan-research.md](docs/research/2026-11-launch-plan-research.md), section 4.

**D13. Getting there mode choice**
- Today the card can show a car to Bergen or a 512 euro train to Taormina while flights exist. Compare modes on door-to-door time and cost; set a distance above which flight is the default when a fare exists.

**D15. Catalogue gaps: add and prune places** (added 2026-11-06)
- Input: D6's parity table (places per region and per 1,000 km2, completeness and rating spread per country). A region far below its neighbours, or a country behind the rest, is a gap.
- Add: candidate places from the same sources the catalogue already uses (Wikidata, Wikivoyage, OpenStreetMap, the regions layer). Each candidate passes the same selection rules and D2 checks as the existing places, and gets prices, climate and photos through the normal pipeline. No place is added by hand without a source.
- Prune: duplicates (the same town under two spellings, for example Rhodes and Rodos) merged; places that fail D2 on must-have fields fixed or removed. Every add, merge and removal is logged with its reason, and the wire contract and the coverage gate stay green.
- 2 to 3 sessions after D6. Owner reviews the add list per country before the wire changes.
- Follow-up (T431-b to T431-e, decided 2026-11-12): the audit of the four sample trips found these corrections; apply them in `pipeline/journeys/sample_trips.py` and keep `sample` True until a second check cites a source for every changed figure. Makarska (T431-b): July and August apartment EUR 120 to 200 a night, 180 to 300 a person; activities 80 to 120; Biokovo park about EUR 15 an adult in summer with the Skywalk included (pp-biokovo.hr price list); "the coastal path from Baska Voda, 4 km"; return distances throughout (Brela 26, Omis 74, Bol 44 km); rafting about EUR 30 to 45; totals recomputed. Prague, Vienna, Budapest (T431-c): trolleybus 59 to Nadrazi Veleslavin, then metro A; Prague to Vienna by rail about 400 km via Brno (distanceKm about 665); the St Vitus nave needs the castle ticket; "about EUR 12 single"; opera standing places from about EUR 15, sold online on the day and at the standing-room desk 80 minutes before. Camino from Sarria (T431-d): 115 km throughout; botafumeiro "on feast days and when a group sponsors it"; roof tour about EUR 12 to 15; "A scallop shell for your pack"; Xunta albergues first come unless its booking site says otherwise for the date. Paros, Antiparos, Naxos (T431-e): Acropolis EUR 30 since April 2025 (timed entry, hhticket.gr) and in the activities budget (60 to 95); accommodation per person, two sharing, about 130 to 230; the Acropolis in the day 1 afternoon slot and Plaka in the evening; totals recomputed.
- Round 2 (2026-11-12, from docs/owner): T431-a: audit the sample week ba-hostel-sarajevo-mostar-kotor against the stays wire (Mostar EUR 10, Kotor 21 to 24, 32 in July and August) and one Sarajevo listing, fix the "EUR 15 to 28" text, drop `sample` so it enters the sitemap.

**D16 to D22. Additions** (proposed 2026-11-06, accepted by the owner 2026-11-07 with I17)
- D16 link and page health: dead links and missing images quietly erode trust and SEO; a weekly check is cheap.
- D17 photo correctness: T1077 found hero photos that were a government group photo or a university building. A sampled visual check (a pipeline model call or a human pass) catches wrong photos before travellers do.
- D18 seasons and closures: mountain huts, lifts, island ferries and some beach towns close for months. Without this, the plan flow can suggest a place that is shut.
- D19 entry rules and official advice: the first question for a UK or non-EU traveller. Use only official sources whose reuse terms allow it, show the date checked, and link to the source rather than paraphrasing legal rules.
- D20 heat and fire risk: summer heat waves and wildfire seasons change which months are really good; open climate data (the sources already in the climate layer) can flag them.
- D21 accessibility facts: OpenStreetMap carries `wheelchair` and toilet tags for many places and stations; show them only where they exist, never as a guarantee.
- D22 trip footprint: travellers increasingly ask; an estimate from published emission factors per mode fits Carta's honest-numbers promise. Label it as an estimate.
- Follow-up (T433-n, decided 2026-11-12, D21): the planner's step-free answer is advice only: change chat.stepFreeHint in six languages to say walks are shorter and step-free access is not checked, and use D21's facts in the day plan only where a place has them.

**D23. External validation of every layer** (added 2026-11-06)
- Round 2 (2026-11-12, from docs/owner): T1189-j, T1193-a, T1197-b verified; T1193-b obsolete (eurovelo.com publishes no km per country). Still to do: T1181-a (282 trail starts against Wikidata P625/P402, move the baseline), T1194-a (DWD CLIMAT 1991-2020 normals CSV, climate layer run), T1194-c (Eurostat `tour_occ_nim` into the crowds CSV, crowds layer run).

*Why.* A number or a sentence Carta shows should agree with the best outside evidence, or Carta should know why it differs. T760 did this once for place ratings (top 200 against Tripadvisor, Lonely Planet, UNESCO and Wikivoyage; 30 gaps reviewed, 9 corrected). D23 makes it the rule for everything, every release.

*The method, the same for every layer:*
1. **References.** A research subagent (CLAUDE.md step 3) picks the outside sources for the layer. They must be official, open or published sources whose terms allow the use; sites that forbid scraping (Komoot, AllTrails, Booking, Google) are never scraped.
2. **Measure.** Coverage (does Carta have what the references name), agreement (rank correlation or error), and the share of facts that match.
3. **LLM judge for text and facts.** Intros, summaries, trip text, Ask answers and translations are checked against their cited sources by a model judge. Where it runs:
   - in a Claude Code session, offline;
   - or through the pipeline's Gemini key;
   - never through the Claude API.
   The judge is calibrated against human judgments (D4, Cohen's kappa) before its verdicts count.
4. **Review.** The 30 largest gaps both ways are reviewed with a verdict and a reason, as in T760.
5. **Correct at the cause.** Fix or fetch the data, fix the bug, or re-tune a weight once against a frozen reference with part of it held out. Scores are never hand-edited to match a list.
6. **Gate.** Must-pass checks join the D2 quality engine, so a regression fails the run.
7. **Scorecard.** One file per layer per release in `data/reports/validation/`, with a trend line in admin (D2).

*Per layer: references to try* (the research step confirms each one and its terms):

| Layer | References to try | What is checked |
|---|---|---|
| Place ratings | Repeat T760; Wikivoyage, UNESCO, national tourism boards' lists, published best-of lists | Rank agreement, the 30 gaps |
| Trails | Famous registry, certified quality trails (Leading Quality Trails, Premiumwege), national portals, Wikipedia trail lists (D24) | Coverage of famous walks, rank agreement, distance and climb error |
| Beaches | EEA bathing water quality, Blue Flag lists, national beach lists | Water class, swim flags, coverage |
| Lakes | EEA and national water bodies, swimming lists | Water class, swim flags |
| Mountains | Wikidata and OSM heights, prominence lists, national summit lists | Height, prominence, route up |
| Cycling | EuroVelo official routes, national cycle networks | Route coverage and geometry |
| Prices | Eurostat price levels, a hand-checked sample of live listings, published fare examples | Error against the reference |
| Climate and sea temperature | National met office normals, Copernicus | Error per month |
| Crowds | Eurostat and national visitor statistics | Month shape agreement |
| Trips | Official timetables and operator sites for each leg; the trip validator and critic | Feasible legs, honest times |
| Texts and translations | The cited sources; back-translation and native review (I8) | Grounding, no invented facts |
| Ask answers | E1 eval set | Grounding and recall |
| Photos | D17 | The photo shows the named place |

*Order.* Trails first (D24), then beaches and prices (the most visible numbers), then the rest. Each run is sized as a sample per layer, stratified by country, so the cost stays small and the result holds for the whole layer.

**D24. Trail quality pack** (added 2026-11-06): the trail work D7's current sessions leave out, run early in round 2 right after D7's S10:
- summaries for the 2,348 top-band trails, grounded in the trail's own facts;
- the downhill relief fix (488 routes, T286-c);
- the trails external check, D23's method applied to trails, with a trail validation gate like the places' one;
- the trails lab moved to the box (T784-a);
- the 3,518 `failed_continuity` routes repaired with the routing engine within strict limits, publishing only what becomes continuous;
- multi-stage treks as one parent record with ordered stages (540 of 594 stage groups have none), shown as one walk and as a multi-day trip;
- the way back to the start for one-way walks, linked to the trip planner;
- mountains (route up, 14.8% today) and lakes (water class 55.8%, 258 unknown swim flags) filled.

**Depends on.** H1, B2. D7 to D12 also need H9 (scheduling) and D5 (scraper health).

---

## 11. Track E: RAG and guardrails

**Goal.** Ask Carta's retrieval and answers are measured on every change, and every LLM call is guarded, logged and has a fallback.

**Exit criteria.**
- Ask eval gate green in CI (recall@10, nDCG@10, abstention).
- Injection test set passes for every LLM function.
- Withdrawal rate under 10%.
- Every call logged with tokens, cost and latency.

### Research

| ID | Question | Starting points | Timebox | Output |
|---|---|---|---|---|
| E-R1 | How do strong teams evaluate RAG end to end? | RAGAS, DeepEval, promptfoo docs; BEIR benchmark paper; recall@k, MRR, nDCG definitions | 1 day | Metric set and thresholds for E1 |
| E-R2 | Does a reranker pay off at Carta's scale and latency budget? | Workers AI reranker models, cross-encoder basics (Sentence-Transformers docs), MTEB reranking leaderboard | 1 day | Go or no-go and model for E2. **Answered** by T1141 (2026-11-06): no-go for now (the one Workers AI reranker is English and Chinese only; the weak questions turn on facts a text reranker cannot see); live check is owner step T1141-a |
| E-R3 | Which models, hosted where, answer Carta's questions best per euro, today and at 1,000, 10,000 and 100,000 monthly users? | Open-weight models (Qwen, Llama, Mistral, Gemma families) on Cloudflare Workers AI, llama.cpp and vLLM docs, Hetzner CPU and GPU server specs and prices, EU-hosted inference providers, the Gemini and Workers AI price pages, the E1 eval set | 2 days | Cost and quality table per option and a switch point for each AI feature (E7). **Done** by T1135 (2026-11-06): `docs/research/E-R3-models-and-hosting.md`; prices to verify (T1135-a), quality to measure on E1 (T1135-b) |

### Items

| ID | Item | Done when | Size | Phase | Status |
|---|---|---|---|---|---|
| E1 | Ask eval gate | 200 labelled queries, metrics per retriever, gate in CI | M | P3 | done (T1136; dense and hybrid baseline open, T1136-a) |
| E2 | Retrieval upgrades | BM25 everywhere, reranker kept only if it wins, index built on the box | M | P4 | in progress (T1141: English BM25 query in six languages, server BM25 over beaches, lakes and peaks, rules and BM25 fused by reciprocal rank; E1 bm25 recall@10 0.569 to 0.576, MRR 0.802 to 0.838, own list recall@10 0.323 to 0.413; reranker no-go (E-R2) pending the owner's live check T1141-a; contextual passages and the staleness check open, T1141-c and T1141-d) |
| E3 | One guardrail module | Same input, output and failure rules in every LLM function; injection set in CI | M | P3 | in progress (T1137: every model call goes through `aiModels` (Edge Functions and Ask) or `pipeline/ai_gateway.py` (batch jobs), provider and chain are config, one failure rule and refusal shape, suggest-city guarded, 75-attack set in the `ai-guard` workflow, a grep test fails on any direct provider call. Open: PII scrub, number tracing, banned terms, the rule-based or cached fallback, T1137-a to T1137-h); the round 2 follow-up sweep, AI and Ask (register follow-up (AI and Ask), T1206, 2026-11-07) closed 29 of 46 AI and Ask rows: PII scrub of input and the dash fix on output built, banned words detected, suggest-city's wish fenced, Ask refuses 30 of 30 out-of-scope questions (25 before), 14 of 21 prompts guarded by an offline eval (5 before); the output rules, number tracing and the fallback stay open (T1137-b) |
| E4 | LLM observability | Every call in `ai_model_events`; admin cost and latency panel; Ask query logs | S | P4 | built, awaiting owner steps (T1139: gateway event per call, migration 071, weekly admin panel, optional Langfuse export; paste, deploy and mount open; Langfuse trace export stays off until Langfuse runs on the box, decided 2026-11-12 (T1139-c)); follow-up (T1135-h, decided 2026-11-12): admin panel shows Ask answers per day with a warning at 450, the cue for the Workers Paid switch |
| E5 | Prompt registry | Prompts versioned in files; a bump runs its eval | S | P4 | done (T1140: 15 prompts in `prompts/registry.json` with version, eval and last score; the Edge Functions, Pages and the app load a generated module, the pipeline reads the files; loader output byte-identical to the old code on 138 inputs; `prompts.yml` fails a text change without a bump and runs a bumped prompt's eval. Open: offline evals for the 12 prompts without a `run.mjs` eval (T1140-b), deploy with T1137-a (T1140-a)) |
| E6 | Answer and cards agree | The places Ask's text names are exactly the cards it shows, enforced in the verifier; the failing live query is in the golden set (P-35) | S | P1 | done (T1101; T1101-a 2026-11-12: the quiet lake query is in the golden set, 141 cases; the live `ask-eval-live.mjs` run after the next ship is open) |
| E7 | Model strategy: open models, hosting and when to switch | Every AI feature (Ask, plan-day, suggest-city, parse-booking, pipeline jobs such as tagging, summaries and blog drafts) has a measured cost per 1,000 calls and a quality score on the E1 eval for at least three options; all model calls go through one module so a provider is a config change; batch jobs that pass the eval run on the box's CPU; written switch triggers for moving live traffic to a self-hosted GPU, reviewed monthly against real usage | M | P3 (decide), P4 onwards (review monthly) | in progress: T1138 (2026-11-06) recorded cost per 1,000 calls for 3 to 5 options per feature, 6 of 32 scores measured and the rest as owner runs, the switch triggers (`continent-app/config/ai_models.json`, `docs/ai/model-strategy.md`) and the box provider behind an eval gate; the box runs, three missing evals and the live decision are open (T1138-a to T1138-j); owner sweep 2026-11-12: Langfuse on the box (T1148-b) and the box CPU benchmark (T1138-a) deferred: the 4 GB box runs the pipeline and the trails lab; live decision taken 2026-11-12: Ask stays on Workers AI, the rest on Gemini Flash-Lite, triggers as set (T1138-h); at a plan-day or suggest-city trigger that feature moves to the best open model that passes its eval (T1135-g) |

### Item details

**E1. Ask eval gate**
- `evals/ask/`: 200 queries across 6 languages, labelled per passage, 30 that must get "Carta does not know".
- Retrieval: recall@5 and @10, MRR, nDCG@10 for dense, BM25, hybrid, hybrid + rerank. Generation: verifier pass rate, withdrawal rate, abstention correctness.
- GitHub Action on Ask changes; fails on a drop beyond tolerance. Results in `docs/reference/evals.md`.

**E2. Retrieval upgrades** (each measured against E1)
1. BM25 over every source, server side.
2. Reranker on the top 30 if E-R2 says go.
3. Contextual passages: place and country prepended before embedding.
4. Index built on the build box with a staleness check.
- Round 2 (2026-11-12, from docs/owner): E-R2 / T1141-a decided: the reranker stays no-go and the live check is dropped; the only Workers AI reranker is English and Chinese.

**E3. One guardrail module**

| Stage | Rule |
|---|---|
| Input | Length caps, PII scrub, user text and retrieved notes wrapped and labelled as data (parse-booking's pattern, copied to plan-day, suggest-city, Ask) |
| Output | Schema validation always (grounded suggest-city gets a validator), every place id in the catalogue, every number traced to input, banned terms and no dashes |
| Failure | Retry once, next model in the chain, then a rule-based or cached answer; never an empty screen |

- Shared code in `supabase/functions/_shared/guard/` and `continent-app/functions/_lib/guard/`. `evals/injection/`: 40 adversarial inputs in CI. Security mapping in C8.

**E4. LLM observability**
- One `ai_model_events` row per call (today only plan-day logs). Admin panel: cost per day, p50 and p95 latency, failure rate. Ask query log hashed, 30-day retention, thumbs up and down.
- Follow-up (T571-g, decided 2026-11-12): voice input in the Ask panel via the browser Web Speech API, shown only where on-device recognition is available (Chrome's server recognition sends audio to Google) and hidden where unsupported, after a C9 data map check; then thumbs, share a chat, save places.

**E5. Prompt registry**
- `prompts/<function>/vN.md` with a changelog; a version bump runs that function's eval.

**E6. Answer and cards agree**
- Live example: "quiet lake with good walks in June under 120 a day" named Castel di Tora in the text and showed Esztergom as a card. The verifier rejects an answer whose named places differ from its cards.

**E7. Model strategy: open models, hosting and when to switch** (added 2026-11-06)

*Today* (from the handbook):
- **Ask Carta** answers on Cloudflare Workers AI (`@cf/qwen/qwen3-30b-a3b-fp8`, falling back to `@cf/meta/llama-3.2-3b-instruct`) inside the free 10,000 Neurons a day (cap 9,000). A traveller with a capable device can opt in to an on-device model (Qwen 2.5 1.5B through WebLLM).
- **plan-day, suggest-city and parse-booking** run on Gemini through Supabase Edge Functions, under per-user and global daily caps.
- **The build box** is a small ARM server (CAX11), with a larger CAX41 for heavy jobs. Neither has a GPU.
- **The Claude API is never used** (CLAUDE.md), and that stays.

*The question.* Which model, hosted where, gives the best answers per euro for each feature, now while traffic is near zero and later as users arrive, and at what point does it pay to move live traffic to hardware Carta runs itself.

*Options to compare, per feature:*
1. **Managed APIs as today** (Workers AI, Gemini): pay per use, free tiers now, no operations work.
2. **Open-weight models through a pay-per-token provider:** Workers AI already serves open models; EU-hosted providers keep data in the EU.
3. **Self-hosted on CPU** (llama.cpp with a quantized 3B to 8B model on a larger Hetzner ARM or x86 server):
   - too slow for live answers at any real volume;
   - a fit for batch pipeline work that can take hours, such as tagging (F1, F2), summaries (D7, D9) and blog drafts (K14).
4. **Self-hosted on a GPU** (a rented dedicated GPU server or hourly GPU cloud, vLLM or llama.cpp): a fixed monthly cost that only beats pay-per-token above a certain steady volume.
5. **On device** (WebLLM) as a free path for capable phones and laptops, kept as an opt-in.

*How to decide:*
- **Measure each feature:** tokens per call, latency, and quality on the E1 eval (and F6 for the intelligence features).
- **Price each option:** cost per 1,000 calls at 1,000, 10,000 and 100,000 monthly users, using real call rates from E4 observability and K12 once users exist.
- **Find the break-even:** the volume where a GPU server's fixed cost plus operations time drops below the API bill.
- **Keep data in the EU** where personal data is involved (C9, ARTICLE30).
- **Keep a fallback chain:** a self-hosted model always falls back to a managed one.

*What to build now:*
- **One model-access module** (with E3's guardrails), so changing a provider or model is a config change with an eval run, not a rewrite.
- **Move batch jobs to CPU** on the box where they pass the eval: they cost nothing per call and need no live latency.

*Switch triggers* (to be set from E-R3's numbers; examples of the form): move a live feature to a self-hosted GPU when its API spend has been above about 1.5 times the GPU server's monthly cost for two months, and the self-hosted model scores within the eval tolerance. Move back if quality drops or the volume falls.

*Rule change.* CLAUDE.md says runtime AI stays on the Gemini-backed Edge Functions. Moving a live feature to another provider is an owner decision, and CLAUDE.md is updated in the same change.

**Depends on.** H1, B2, C1 (threat model informs E3).

---

## 12. Track F: Carta Intelligence

**Goal.** Build the AI product engineering skill set (retrieval, classification, evaluation, distillation, API design, LLMOps, responsible AI) as real Carta features, each with a measured result.

**The framing.** TechWolf infers skills from messy work text, maps them to a taxonomy, lets employees validate them and serves the result through an API. Carta has the same shape: infer what a place offers and what a traveller likes from messy text, map both to one taxonomy, let travellers validate it, serve it through an API.

**Exit criteria.**
- Every model has an eval set, a metric and a CI gate.
- The tagger runs in the pipeline; the student model is published with a model card.
- The Intelligence API serves the pipeline in batch.
- Taste-profile acceptance rate is tracked.

### Research

| ID | Question | Starting points | Timebox | Output |
|---|---|---|---|---|
| F-R1 | How are skill taxonomies built and how is extreme multi-label extraction done? | ESCO structure, TechWolf papers (JobBERT, LLM skill extraction 2023, Efficient Text Encoders 2025), Sentence-Transformers training docs | 2 days | Taxonomy shape and pipeline for F1 |
| F-R2 | How do I distil an LLM labeller into a small encoder and serve it cheaply? | Sentence-Transformers fine-tuning guide, hard-negative mining, ONNX Runtime quantisation, Hugging Face model card guide | 1 day | Training plan for F2 |

### Items

| ID | Item | Parallel at TechWolf | Skill | Done when | Size | Phase | Status |
|---|---|---|---|---|---|---|---|
| F1 | Travel taxonomy and tagging | ESCO, extreme multi-label skill extraction | Retrieval, classification, calibration | Every place tagged, P@5 and F1 reported on 400 labelled items | L | P3 | in progress (T1149: taxonomy v1 with 268 nodes, mapping of every tag in use, 400-item label template, P@5 and F1 eval. T1150: batch tagger with evidence per tag and a threshold per use, all 26,588 items tagged in about 30 s, beats today's tags on the seed set (R-precision at 5 0.477 vs 0.433); hand labels, the verifier run and wiring into the app are still open); the round 2 follow-up sweep, intelligence (register follow-up (intelligence), T1215, 2026-11-07): taxonomy 1.1.0 with labels in six languages (268 of 268, was 103) and synonyms in five more, the agreement script, trail detail files and other-language descriptions read by the tagger (seed R-precision at 5 0.477 to 0.503), journeys taggable on request, the first Intelligence API caller (`intel_tags`); owner decision T089-b (2026-11-12): the app's tag filters and chips switch from the 1,035 English slug tags to the F1 taxonomy nodes and their six-language labels, filters per style offer any node with enough places, not the top 12 |
| F2 | Distilled tagger | ConTeXT-match, JobBERT V2 | PyTorch, HF Transformers, Sentence-Transformers, contrastive learning, ONNX | Student within 3 F1 points of teacher at under 1% of the cost; on the HF Hub | L | After | todo: waits on owner steps T1149-a (agree the taxonomy vocabulary) and T1149-b (hand-label the 400-row gold set) in `docs/owner/unsorted.md`, and the E7 compute choice |
| F3 | Taste profile with validation | Employee skill validation, acceptance rate | Human in the loop, explainability | Chips with evidence on My trips, acceptance rate tracked | M | After | in progress (T1152: chips with evidence on My trips, accept and reject synced through account_things, acceptance rate counted without ids; migration 072 and the live two-device check are owner steps, a ranker reading the negatives and the admin card are open); the round 2 follow-up sweep, intelligence (register follow-up (intelligence), T1215, 2026-11-07): the trip finder reads the verdicts, parent roll-up and See all per chip, the admin acceptance card, the taxonomy map loads lazily (My trips chunk 148,061 to 137,759 B); Explore's For you stays on the taste profile; the persona joins it only after its calibration check T877-c passes (owner T877-d, 2026-11-12) |
| F4 | Place linking | Job-title normalisation | Entity linking | MRR and accuracy@1 on 300 messy mentions | M | After | in progress (T1153: linker, eval and flagged search; Ask and parse-booking callers open); the round 2 follow-up sweep, intelligence (register follow-up (intelligence), T1215, 2026-11-07): Ask and Destinations search read the linker behind the flag, both known misses fixed (accuracy@1 0.993 to 1.000 on the set), a CI workflow runs the eval; parse-booking has the logic, wiring waits for the owner (T1153-e); parse-booking keeps its own copy of the linker in `supabase/functions/_shared/linking/` with a test that the copies match (owner decision T1153-e, 2026-11-12); not wired yet: `index.ts` must fetch the search index and lexicon (about 315 KB) once per cold start; follow-up (T1153-a, decided 2026-11-12): default the place linker on in src/lib/linking/flag.js (keep ?link=0 to switch off) after the linking eval and a browser check pass |
| F5 | Intelligence API | API-first data layer | FastAPI, Pydantic, OpenAPI, Docker, tests | Service on the box, pipeline calls it in batch | M | After | in progress (T1154: services/intelligence with /tag, /link, /similar, /taxonomy, /profile, key auth, rate limit, logs, metrics, Docker; every endpoint tested against its eval set; OpenAPI in docs/reference/openapi.md; running it on the box and a pipeline caller are open); the round 2 follow-up sweep, intelligence (register follow-up (intelligence), T1215, 2026-11-07): first pipeline caller, data root follows CARTA_PUBLIC, base images pinned by digest and pip-audit on its requirements |
| F6 | Eval and LLMOps platform | Eval-driven development | Golden sets, LLM-as-judge, tracing | One runner for all evals; plan-day judge with kappa reported; Langfuse traces | M | P3 | in progress (T1148: runner, format, dashboard, plan-day judge; hand labels and Langfuse install are owner steps) |
| F7 | Carta MCP server | MCP, agents and workflows | Tool design | Read-only tools usable from an MCP client | S | After | in progress (T1155: services/mcp with four read-only tools, tested with an MCP client, threat model section 13; wiring a real client to the checkout and a docs mention are owner or later steps); the round 2 follow-up sweep, intelligence (register follow-up (intelligence), T1215, 2026-11-07): price_trip prices through quoteTrip with legs and flights, with a parity test and an eval; 2026-11-12: public data only, no saved trips (T1155-a); ships from a repo checkout only (T1155-b); tried in a real client by the owner (T1155-d) |
| F8 | Responsible AI | Fair, transparent AI, EU AI Act | Fairness, documentation | Public AI page, model cards, parity table | S | P4 | done (T1156: page at /?legal=ai, cards for Ask and plan-day, tagger stub; legal read, translations, AI labels and report button are open rows T1156-a to T1156-f); the round 2 follow-up sweep, intelligence (register follow-up (intelligence), T1215, 2026-11-07): Written by AI label on every model-written text, Report button with migration 074 (not live), cards for suggest-city and parse-booking with a failure-case set |

### Item details

**F1. Travel taxonomy and tagging**
- About 300 nodes in 3 levels (activity, setting, vibe, traveller style, practical), each with code, definition, synonyms in 6 languages, parent, "not to be confused with". File: `pipeline/taxonomy/carta_taxonomy.yaml`.
- Replaces the hand-built gem categories, the 20 vibe scores and the 12 taste keys.
- Passages per place → bi-encoder top 25 labels → Gemini verifier only where uncertain → threshold per use → place-level tags with evidence.
- Eval on 400 labelled items: precision@5, recall@10, micro and macro F1, calibration, cost per 1,000 items.

**F2. Distilled tagger**
- Teacher labels 20k pairs; hard negatives from the taxonomy. Student: `gte-small`, Sentence-Transformers, `MultipleNegativesRankingLoss`, PyTorch, ONNX int8.
- Publish model, card and eval set to the Hugging Face Hub after a licence check.

**F3. Taste profile with validation**
- Profile from saves, trips and filters on the taxonomy; chips with evidence; accept or reject; rejections become negatives. User's own data only, deletable, in the GDPR export.

**F4. Place linking**
- Alias table, BM25 and embeddings for candidates; context to disambiguate; "did you mean" below the threshold. Used by parse-booking, Ask and search.

**F5. Intelligence API**
- `services/intelligence/`: FastAPI, Docker, on the box. `/tag`, `/link`, `/similar`, `/taxonomy`, `/profile`. Pydantic, OpenAPI, pytest with eval sets as contract tests, structured logs, metrics, API key, rate limit. Added to the threat model (C1).

**F6. Eval and LLMOps platform**
- One runner and results format for every eval; dashboard page in the docs site. Plan-day LLM-as-judge calibrated on 40 human-rated plans with Cohen's kappa. Self-hosted Langfuse on the box, only once H7 shows the CAX11 has room (Langfuse needs Postgres, ClickHouse and Redis); until then ai_model_events and the E4 panel are the trace (H-a, 2026-11-12).

**F7. Carta MCP server**
- `services/mcp/`: read-only tools (search places, place facts, price a trip, list trips). No write tools. Added to the threat model.

**F8. Responsible AI**
- Public "How Carta uses AI" page; model cards for the tagger and Ask; D6 parity table.
- Follow-up (T1156-a, decided 2026-11-12): Carta is the provider of its AI features under AI Act Art 3(3); add the machine-readable mark of Art 50(2) (for example a `data-ai-generated` attribute on the text `AiMark` labels) so generated text is detectable as well as visible. Part of the T227 legal gate: shipped before the public opening on Tue 9 March 2027.

**Depends on.** E1 and F6 (eval runner), D1 (contract for new fields), C1 (threat model for new services).

**Owner decision F-a.** The JD names AWS Bedrock; CLAUDE.md keeps runtime AI on Gemini and forbids any Claude API use. Option: an offline-only experiment with non-Anthropic Bedrock models on the F1 eval set, never in the app. Decided 2026-11-12: yes, offline only, after launch with F2.

---

## 13. Track G: UI and UX

**Goal.** A design direction you chose on evidence, tested with real travellers, built from shared parts, with motion and trust made visible, and quality gates that stop it slipping back.

**Exit criteria.**
- A written design direction (G-R1 to G-R3) approved by you.
- Usability tests with at least 5 travellers on each core flow, findings fixed and retested.
- WCAG 2.2 AA audit passed.
- One component per role; design-lint baseline down by at least 2,500.
- axe, Lighthouse, bundle budget and visual baselines in CI.

### Research

| ID | Question | Starting points | Timebox | Output |
|---|---|---|---|---|
| G-R1 | What do the best travel and planning products do that Carta does not? | Teardown of 6 products (for example Airbnb, Hopper, Wanderlog, Komoot, Google Travel, Booking) on the same 4 flows: find a place, judge it, price it, plan days; Mobbin for screen references | 2 days | Benchmark board and 10 patterns to adopt or reject |
| G-R2 | What makes an interface feel premium and calm rather than busy? | "Refactoring UI", Laws of UX, Apple Human Interface Guidelines (layout, motion), Material 3 motion, awwwards travel sites (inspiration only; carta-design wins) | 2 days | Principles note that extends the carta-design skill |
| G-R3 | Where do travellers struggle in Carta today? | 5 short interviews and one unmoderated test on the live app (Maze, Lyssna or a call with screen share), Nielsen's 10 heuristics as a self-audit | 2 days | Top 10 problems ranked by severity, feeding G1 to G11 |
| G-R4 | How should motion work across the product? | Material 3 motion, Apple HIG motion, `motion` library docs, Val Head "Designing Interface Animation" | 1 day | Motion principles and tokens for G5 |
| G-R5 | How do I run a proper accessibility audit? | WCAG 2.2 AA, axe-core rules, screen reader testing with NVDA and VoiceOver, the A11y Project checklist | 1 day | Audit method for G10 |

### Items

| ID | Item | Done when | Size | Phase | Status |
|---|---|---|---|---|---|
| G1 | Design direction | G-R1 to G-R3 turned into a direction doc and carta-design skill update, approved by you | S | P1 | in progress (T1111: `docs/design/direction.md` approved 2026-11-12, row T1111-a; skill update T1111-b open) |
| G2 | Shared parts that exist once | `PlaceHead`, `PhotoCarousel`, `Chip` tones, `Button href` used everywhere; T1024-b/c, T1027-c, T1039-b closed | M | P2 | in progress (T1121: PlaceHead, CarouselArrows, Button href, DialogSheet and five price-line parts folded with no visual change; T1024-c, T1027-c, T1039-b closed; cards, other sheets and price lines, and Chip tones T1024-b open as T1121-a to T1121-d); follow-up (owner T457-g, 2026-11-12): Card layout=tile titles clamp at two lines with two lines reserved on Explore and Destinations rails, full name in the accessible name; gallery dots must not change a tile's height; follow-up (owner T504-b, 2026-11-12): Beaches, Lakes, Mountains, Trails and Cycling in Explore move from the map card, peek and PlaceCard to Places' one overview and phone drawer; T1039-a (owner 2026-11-12): outdoor pages move to a shared OutdoorWhen on the when-* design: peaks snow and storm days, lakes and beaches water temperature and swim months, no crowd or price rows |
| G3 | Umber cost card as signature | One component in Explore card, place page, plan tab, receipt; T1026-c closed | M | P2 | in progress (T1122: plan tab variant built behind a flag, off; T1026-c decided with T1111-a and T1122-a, 2026-11-12); follow-up (T1122-a, decided 2026-11-12): switch `COST_CARD_UMBER` on in planner/trip/costCardVariant.js (?cc=arc keeps previewing the old card), update tests/costCardUmber.test.mjs and the HANDBOOK cost card line, gated on a look at a trip page at 390 and 1440 width; Explore card and receipt open; follow-up T173-e (owner 2026-11-12): Carta's own trip page (JourneyPage.jsx Costs section and PriceDock) prices from the Lifestyle through the price engine like the receipt, not the authored budget ranges (the app-wide Lifestyle; a trip the traveller saved keeps its own, T703-a); follow-up T1019-a (owner 2026-11-12): with default dates DestPriceCard's dates pill says it shows the year's cheapest return and names its month; then drop the limit lines at HANDBOOK 235 and 1177 |
| G4 | Core flow fixes from research | The top problems from G-R3 fixed in Explore, place page, plan flow and trip page | M | P2 | in progress (T1123: four plan flow and trip page fixes from the audit and the T1103 note; G-R3 interviews not run yet, row T1123-b); follow-up T1045-d (owner 2026-11-12): budget search drops the buffer (lib/budgetSearch.js BUFFER_*, the Buffer control and receipt line, the Tight group), with HANDBOOK "The buffer" removed and app-rules "Budget search" rewritten in the same commit; follow-up T876-f (owner 2026-11-12): the trip page BudgetCard shows and edits the group total when the budget was given for the group (budget.per 'group', groupEur); follow-up T938-a (owner 2026-11-12): the Together group budget says in one line that each person's own way there is not in it; follow-up (owner T444-a, 2026-11-12): Explore's Trip type chips (TRIP_KINDS in ExploreFilterRail.jsx) become vibes from lib/guidedSearch.js, one vocabulary for the pane and the search, six languages; follow-up (owner T444-b, 2026-11-12): an Explore rail "Within {n} hours of {origin}" built on the existing reachHours filter, shown only when an origin is set; no hiking-first opening (T489-h stands); follow-up (owner T457-e, 2026-11-12): on a phone the category tabs row (.xcats-row, T601) stays pinned under the header while a list scrolls, at --z-sticky, checked at 390 px; follow-up (owner T498-e, 2026-11-12): the region page shows at most four rails, ordered by card count, and folds the rest behind one More button (RegionPage.jsx); follow-up (owner T502-h, 2026-11-12): routeFromSearch in lib/urlState.js sends a legacy ?tab=places or ?tab=destinations without a valid cat to Explore on Places (view map), with a urlState test; follow-up (owner T589-a, 2026-11-12): Explore's Good to know group uses Chips (selected tint, aria-pressed) instead of Switch rows; follow-up (owner T1044-a, 2026-11-12): Plan home's Upcoming list and its count leave out the Up next trip (PlanHome.jsx) |
| G5 | Motion system | Shared springs for sheets, tabs, figures, card-to-place photo move; reduced motion shows the end state | M | P2 | partly done (T1124: tokens and reduced motion). Part 2, the shared motion kit from `docs/design/direction.md`, unblocked: direction approved 2026-11-12 (T1111-a) |
| G6 | Type and radius debt | Literal font sizes and radii on the scale, legacy aliases removed | M | P2 | partial (T1125: exact matches done) |
| G7 | Breakpoints and CSS consolidation | 4 width tokens, v6 override layer folded in, big files split, dead-selector check, `!important` halved | M | P2 | partial (T1126: widths 43 to 19, 2,983 dead rules removed, css-routes proof green); dead .fav-star rules in styles/26-shortlist-extras.css go (T393-d obsolete, 2026-11-12) |
| G8 | Imagery gaps | Photo share on walks above 60%, styled map thumbnails instead of grey tiles | M | P2 | partly done (T1127: licensed feature photos for walks, placeholder count per screen measured; harvest and map thumbnails open); follow-up (owner T879-a, 2026-11-12): trip cards use only a photo of one of the trip's own places, else the flag placeholder; the country-photo fallback in finderText.js tripPhotos goes |
| G9 | Trust made visible | "Why this place" chips (F1), "checked on" dates (D3), confidence in words | M | P4 | partly done (T1208: chips with evidence on cards and the place page, confidence in two words, refreshed price dates, six languages; tagger tags on the wire, opening and entry-rule dates open); follow-up T503-c (owner 2026-11-12): /about/numbers (scripts/explainer/numbers.mjs) drops the bed and food provenance lists, the food accuracy method and the "Where coverage is thin" counts; keeps the lede, the day-price paragraph and the credits; app-rules "My trips, Account and the pass screens" changes in the same commit |
| G10 | Accessibility audit | WCAG 2.2 AA audit with screen readers, every failure fixed | M | P2 (surface), P4 | partial (T1128: axe on 15 surface screens at 390 and 1280, serious and critical nodes 94 to 0, `scripts/verify_axe.mjs`, results in `docs/design/a11y-audit.md`; screen-reader pass T1128-a, film pause decided (T1128-b, 2026-11-12: a text Pause button on the v3 film and tour, built only if v3 stays live; none needed once G14 is the home), remaining screens T1128-c) |
| G11 | Quality gates and usability retest | axe-core, Lighthouse CI, bundle budget, visual baselines for 10 screens at 390 and 1440; 5-person retest of core flows; one real-phone pass per release replaces the 49 per-task phone rows | M | P4 | todo; follow-up (T998-a, decided 2026-11-12): drop the design-lint gradient rule (scripts/ci/design-lint.mjs and its baseline entries); contrast stays with axe; run npm test |
| G13 | Trail cards and trail links | Cards show time and climb next to length; trail pages get their own URL like places; display names from D7 (P-36, P-37) | S | P1 | done T1102 (open items in the register) |
| G12 | Onboarding and a shorter plan flow | First plan in 5 screens or fewer (12 today); a priced draft after 3 answers; Explore's start dialog inline and dismissible; sample trip on an empty Plan home (P-33, P-34, P-46) | M | P1 | in progress (T1103: shorter plan flow done; Explore start dialog and sample trip open, rows T1103-a, T1103-b); T812-b (2026-11-12): a stop takes up to 60 nights in the wizard, StepStay and the booking import (`MAX_TRIP_NIGHTS`), HANDBOOK plan flow limits updated; travel styles (2026-11-13): named, switchable styles (how you stay, how you explore) in the header of every tab, seeding new trips and the taste profile, the help-me-choose walk skips what a style answered, getting around and the day goal asked once (HANDBOOK "Travel styles"), each style card with its day figure (lib/styleCost.js) |
| G14 | Home page | Home passes the marketing surface gate on its own: one clear promise from PRODUCT.md, the waitlist (K3), a live example priced from real data, links into Explore and a sample trip, fast first load (H12) and checked on a real phone | M | P2 | in progress (T1209: built behind the HOME_G14 flag, off; direction approved 2026-11-12 (T1111-a) and the flag flip decided (T1209-a); follow-up (T1209-a): flip HOME_G14 = true in browse/home/homeVariant.js once ?home=g14 passes axe, Lighthouse and a phone and desktop look at 390 and 1280 with the carta-design seven questions answered, v3 kept as the fallback by flag; G14's ground-only card also answers T951-a (visitors without a swept flight see a proof), no v3 change; LCP and the real phone open). Follow-up from the owner sweep (2026-11-12, T1128-h): at 375 px the live home shows two brand bars, the white app header (mark, Together, account) above the film and the film's own mark and Log in under it, against DESIGN.md "On a phone the home page's own top line lies on the same bar"; one bar on the phone film, keeping an account entry once scrolled past; fixed 2026-11-12 (owner sweep round 2): the phone's `.hv-top` is gone and the shell bar lies on the film at every width (one brand at 375 and 1440 px), not yet shipped |

### Item details

**G1.** One doc, `docs/design/direction.md`, plus an update to `.claude/skills/carta-design/SKILL.md`. The carta-design skill stays the top design source.

**G2.** Today the place head is built 3 times, carousels 4 times, external link buttons 3 times. One component each in `src/components/ui/`, added to the styleguide.

**G3.** End the arc vs no-arc split. Figures on `--text-amount` with tabular numbers.

**G4.** Scope comes from G-R3. Each fix is checked with the same task that found it.

- Follow-up (T703-a, decided 2026-11-12): an opened saved trip prices at its own saved stay and Lifestyle (priceRequest), not the app's; the app setting applies to new and unsaved trips, and to a saved trip only when the traveller changes it on that trip (useTripPlanner preferredStayTier effect). T432-m and T858-a read the same way: app-wide for new and unsaved trips, a saved trip keeps its own.
- Follow-up (T458-c, decided 2026-11-12): children stay half and babies free with no ages asked; if the Who step ever asks ages, pass them to Booking.com as age= per child.
- Follow-up (T815-a, decided 2026-11-12): a month with no dates starts on its first Saturday on every screen: change planner/flow/appSync.js syncWhen (now the 1st) and GuidedTripWizard.jsx:526 (now the 5th) to one shared helper, lib/budgetSearch.js startForMonth or firstRun.js seededWindow's saturdayFrom.
- Follow-up (T871-b, decided 2026-11-12): tf.who.car becomes "Some places on this trip are hard to reach without a car." in six languages (the voice rules ban "the best").
- Follow-up (T876-e, decided 2026-11-12): Tell Carta's Continue stays pinned above the bottom bar on phones, so a long sentence never pushes it off screen at 360x740 or 375x667; check with a verify_*.mjs DOM check.
- Follow-up (T876-h, decided 2026-11-12): StayTypes shows a Room in a home tile, selected, only when stay_tier is 'room' (chosen on Explore or the Lifestyle panel); otherwise the three tiles of the owner's 2026-10-30 walk stay.

**G5.** `motion` is used only on Home today. Tokens from `--dur` and `--ease`. Check INP before and after.

**G6.** Codemod 1,740 literal font sizes and 775 literal radii; remove legacy aliases (4,638 uses).

**G7.** Replace about 15 widths and the 768/769 split with 560, 768, 1024, 1440. Fold files 60 to 69 into domain files, split files over 2,500 lines, coverage-based dead-selector report. Finish the 1440 and 1920 checks (T1041-b).

**G8.** A photo source for routes and things to do (22% of walks have a photo today, T1033-a, T1032-b). Map thumbnails in brand colours.

**G9.** Chips explain why a place fits, with evidence. Dates where honesty needs them. Six languages.

**G10.** Keyboard, focus order, contrast, 44 px targets, screen reader labels, reduced motion. Results in `docs/design/a11y-audit.md`.

**G11.** Gates block regressions on every PR. The retest uses the G-R3 tasks so the results compare.

**G12.** Today: "Start planning", then a choice that is already made, then 10 steps. Skip the choice when no trip is in progress; merge steps the free-text box already answers; show a priced draft early and let the rest refine it. Explore's "What matters most" dialog becomes an inline prompt, and its seen-flag follows the account. Measure time to first plan before and after (G-R3 tasks).

- Follow-up (T874-c, decided 2026-11-12): Plan your days preselects How do you like to eat from the setup's spend style and How do you get around from the way there; both stay changeable.
- Follow-up (T874-e, decided 2026-11-12): when Tell Carta's words name children, How do you like to travel starts on the Family preset (still changeable).
- Follow-up (T1103-f, decided 2026-11-12): the default trip types for a brand new traveller lead with walking (for example trails, nature, culture) instead of city, culture, food, per PRODUCT.md's hiker-first launch; change BROAD_TYPES in candidates.js and check the finder at phone and desktop width.
- Status (r3 ranking audit, 2026-11-12): the trip settings now order the found trips: stay or move (asked shapes, else the persona's) adds `rank.shapeStep`, price and comfort add `rank.priorityPull`, the persona's types (`persona.types`) pick the countries while the likes are unanswered, a family keeps its family type, heat and no car are one rule each (`lib/recommend/prefs.js`), and a no-car trip prices no car hop. Open: warm weather once the dates are set, and the dead `bases` lever.

**G13.** Trail tiles today show only difficulty and length. Add walking time and climb. Opening a trail sets `#trail=<id>` so it can be shared, bookmarked and reached with Back.

**Process.** `impeccable` critique and the `taste-skill` look-and-fix loop per screen; the seven carta-design questions before shipping.

**G14. Home page** (added 2026-11-06)
- Home is the first page of the marketing surface and the page every campaign lands on, so it gets its own item instead of being covered piecemeal by G2 to G8.
- Inputs: the design direction (G1), the mission and short form in PRODUCT.md, K3 (waitlist with referral), H12 (first load), K12 (channel counts).
- Done when: the promise reads in one line; one live example shows a real per-day total for a real place this month; the waitlist works; Explore and a sample trip are one tap away; LCP and INP meet H12's targets; checked at phone and desktop width and on a real phone.
- Runs right after G1 is approved, before the other G items, so the most visited page is finished first (by the P2 gate, about 18 January).

**Depends on.** G-R1 to G-R3 before G1; G1 before G2 to G9; F1 and D3 for G9; H1 for G11.

---

## 14. Track H: production hardening

**Goal.** Carta runs unattended, fails visibly, recovers quickly and survives 10x launch traffic.

**Exit criteria.**
- Every check runs in CI and `main` is protected.
- Errors reach Sentry; SLOs on one panel.
- Load test at 10x passed; restore drill timed.
- Every owner gate for launch closed.

### Research

| ID | Question | Starting points | Timebox | Output |
|---|---|---|---|---|
| H-R1 | Which SLOs and alerts make sense for a one-person product? | Google SRE book (SLO chapters), "Implementing Service Level Objectives" (Hidalgo), Cloudflare and Supabase observability docs | 1 day | SLO list for H8 |

### Items

| ID | Item | Done when | Size | Phase | Status |
|---|---|---|---|---|---|
| H1 | CI that runs everything | `npm run ci`, `npm test`, ruff, mypy, pytest on every push and PR; branch protection on `main` | S | P0 | done (T1057; branch protection T1057-c) |
| H2 | Error tracking | Sentry (EU) for app, Pages functions, Edge Functions, pipeline; release tags, PII scrubbing | S | P2 | partly done (T1120: app and Pages Functions, no-op until the DSN; Edge Functions, pipeline, source maps open) |
| H3 | Durable rate limiting | Limits for ask, flights, stays hold across isolates | S | P3 | code done (T1157: per-endpoint RL_ASK, RL_FLIGHTS, RL_STAYS, RL_FORECAST bindings with in-memory fallback; Pages refuses `[[ratelimits]]` (Wrangler 4.160, checked 2026-11-12 by the owner sweep), so the bindings left `wrangler.toml` and the durable layer is the WAF rule on /api/ (owner step T1079-a); the ship preflight now fails on any key Pages refuses) |
| H4 | Load tests | k6 at 10x launch traffic, p95 under budget, report in docs | M | P4 | partly (T1158: scripts and doc, preview run is the owner's); day routes stay on the public FOSSGIS OSRM, cached per route; a self-hosted router does not fit the 4 GB box, so the choice of a hosted router is made from this item's load numbers before launch (T433-o, decided in the owner sweep 2026-11-12); follow-up (T433-o, decided 2026-11-12): measure a BRouter server for foot and car day routes on the box first (memory and disk for the Europe segments, with H7); if it fits, point routing.js at it with routing.openstreetmap.de as fallback and include it in the k6 load test; if it does not fit, keep the public server; no date |
| H5 | Backups and restore drill | Nightly encrypted `pg_dump` to R2, 30-day retention, timed restore written up | S | P3 | code done (T1159); live drill is the owner's; after the owner's restore drill passes, Claude clears the laptop copies T045 left (the T045 report's rm list, the laptop trailslab volume, then the Docker disk image; T045-e); box half verified live in the owner sweep 2026-11-12 (nightly dump of 2026-11-12 in R2, status/backup.json ok, the stale-backup alert on); the restore drill waits on the owner's backup secret key (docs/owner/hetzner-box.md); retire the weekly dump in run_pipeline.sh from 2026-11-14 (T1159-b); backups gain an encrypted auth and Storage export (owner decision T1159-e, 2026-11-12), not built |
| H6 | Owner gates cleared | Unapplied migrations (022, 029, 030, 031 and the rest), Stripe live setup, secrets, Dashboard steps | M | P3 | todo |
| H7 | Pipeline unattended on the box | Every scheduled task with manifest, retries, D2 gate before publish, failure alert; two clean weeks | M | P3 | todo; follow-up (T1056-b, decided 2026-11-12): first make push-data --prune refuse to delete more than 25 top-level names without a terminal; only after that guard lands may run_pipeline.sh add --yes to the unattended prune; until then the box prune runs without --yes; follow-up (T954-c, decided 2026-11-12): remove carta-late-fill.service and its install.sh lines, then systemctl disable it on the box |
| H8 | SLOs and incident drill | Uptime, error rate, p95 per API, freshness on one panel; one drill written up | S | P4 | built (T1160; panel mounted in Admin and config/slo.json in the config reference by T1211; live collector and drill pending, T1160-b to -d) |
| H9 | Every pipeline task on a schedule | Monthly and quarterly tiers run on the box; the box pushes `pipeline_state.json` and a freshness report to R2 after each run (P-15) | M | P1 | done (T1107; owner enables the timers on the box, T1107-a); owner sweep 2026-11-12: every box step that was an owner run is now a scheduled task; Claude's follow-ups once the quarterly catch-up (carta-catchup-3, started 2026-11-11) ends: commit the coverage contract, gate baseline and page (T112-a, T112-c, T160-a, T211-c), rerun `crowding` once for border places (T1214-d), ratings baseline after `unesco` (T1216-c), trails validation, external check and famous seeds (T1187-h, T1181-b, T1181-i), the scorecard (T1134-b), the photo_check baseline (T1198-b), beaches validation and the Blue Flag list (T1189-h, T1189-i), `fill_water.py` then the lakes check (T1186-a, T1192-h), `fill_route_up.py` (T1186-b), mountain heights from Wikidata (T1192-a), Wikivoyage tiers (T1191-g), EU price levels (T1190-b), place signals for gap countries (T1146-e), climate heights (T1194-e), `export_stubs.py` and its push (T124-a), gate attribution and the national-trek comparison (T322-a, T322-b), the Ask baseline and highlight check after `ask_index` (T1136-a, T1141-b, T1141-g), the bi-encoder tagger trial (T1150-b), the basket and route-choice reports (T1100-a, T1130-b, T1130-f), one `scenic.py --refresh` so highlight names move to display_name (T311-d), a read of the first photo_sources run and its gc plan (T324-c), the beach length, orientation and lake size counts after `beach_context` and `lake_detail` (T179-d), the by-coordinate hero fix for the 27 gem destinations (T1127-b), after the first monthly run with the box lab, `free -m` and the `trails_*` run minutes, lowering `TRAILSLAB_MEM_LIMIT` or moving the lab to a CAX21 if the box swaps hard (T1182-b), a check that the trails export's credit gate dropped the uncredited photos (T280-a), and copying any report file the box writes back into git |
| H10 | No laptop-only steps | Ask index, stays scrape, guided search, trails lab and trip promotion run on the box or the worker; the trails lab dump is in R2 (P-17) | M | P3 | code done (T1161); enabling on the box and the Booking host are the owner's (T1161-a to T1161-e); the lab move itself is T1182; owner sweep 2026-11-12: `CARTA_STAYS_SCRAPE=1` set on the box (Hostelworld, March and September); `CARTA_BOX_ML` stays `ask` (guided_search skips) until the box has 8 GB free (5.3 GB on 2026-11-12); the box's R2 key is refused on `carta-stays-state` (403), so the scrape upload and the monthly stays build wait on the owner's token change (docs/owner/stays-box.md); self-hosted MOTIS stays postponed (T471-d, T475-e: no room on the 4 GB box); the Intelligence API (T1154-a) and the blog pull request (T1174-b, needs a box push credential) are not switched on; every trails lab input lives on the box volume (owner decision T1182-d, 2026-11-12) |
| H11 | One scripted ship and a stable toolbox | `ship` script that stops on any failed step; css-routes check in `npm test`; `PYTHONUTF8=1`; a worktree script that handles junctions; stale `continent-app/.git` removed (P-18, P-19) | M | P3 | done in code (T1162: `scripts/ship.mjs` dry run green and stops on a seeded failure, css-routes proof in `npm test`, `scripts/worktree.mjs`, `PYTHONUTF8=1` in the pipeline launchers. Open: removing the stale `continent-app/.git` (T1162-a) and a junction run of the worktree script on Windows (T1162-b). Owner sweep 2026-11-12: the preflight checks `wrangler.toml` keys against what Pages accepts; prerender build and push are not ship steps) |
| H12 | Fast first load and self-hosted images | Entry chunk under 150 KB gzip (224 today); DestinationsTab, DestinationPage, AccountPanel and planner screens lazy; CSS split by route; own AVIF and WebP images live (P-11, P-41) | M | P1 | in progress (T1105: first paint prefers own copies, waits on the R2 upload) |
| H13 | Errors that stay local | Error boundary per tab; the 107 silent catches reviewed, data errors show a visible state (P-42) | S | P1 | done (T1106; owner look pending) |
| H14 | Code health | DestinationsTab and DayPlannerTab split; App overlays into a shell; 18 dead files removed; finder TripPage renamed; react-refresh warnings quieted (P-43, P-44, P-45) | M | P4 | partly done (T1163: six files split, 26 dead files out, FoundTripPage, 125 react-refresh warnings on a line baseline; the three largest still above 1,800 lines); T1163-b (owner decision 2026-11-12) deleted AiDayPlanModal, AiPlanRoute and lib/accuracy.js. The `ground` paywall gate has a caller again (owner round 2, 2026-11-12): the Carta bot's events switch shows `ai.eventsNeedPass` with a See passes link (`openPasses('ground')`) for a signed-in free traveller at 0 searches, and `verify_paywall_funnel.mjs` counts `.openPasses('...')` callers; follow-up (T373-e obsolete, 2026-11-12): coverageSentence and coverageFacts in continent-app/src/lib/footers.js and the cov.* keys have no caller since the Destinations footer left; remove them with their tests; follow-up (T464-a obsolete, 2026-11-12): PERSONAS in homeDemo.js is no longer on the page but pagePhotos() and tests/home.test.mjs still read it; remove the dead data with its test |

### Item details

**H1.** 11 workflows exist, but none runs `npm run ci`. Add `ci.yml` (app) and `python.yml` (ruff, mypy scoped, pytest). Protect `main`.

**H2.** Free tier, EU region, source maps uploaded on deploy, PII scrubbing on.

**H3.** Cloudflare rate-limit binding or a Durable Object. Today limits live in memory per isolate.

**H4.** Scripts in `tests/load/` for ask, flights, stays, static wire.

**H5.** Replace manual `ops/backup_supabase.sh` with a scheduled job; restore into a scratch project.

**H6.** One ordered owner procedure from A3. Only you can do these steps.

**H7.** Builds on the existing Hetzner box and Task Scheduler runs.

**H8.** Builds on the existing uptime workflow and `INCIDENT_RUNBOOK.md`. Round 2 (2026-11-12, from docs/owner): T1160-b: the SLO collector (uptime runs, Supabase function stats, `ai_model_events`, freshness report into `src/admin/sloSnapshot.json`; Sentry once H2 lands) is this item's work, not an owner step.

**H9.** Today 50 of 74 tasks are due in the local state and the box runs the weekly tier only (T048-h); its own state is never pulled back (T740-b). Schedule the 28 monthly and quarterly tasks, push state and freshness to R2, show them in the admin Data health panel (D2). Round 2 (2026-11-12, from docs/owner): T1107-c: after the first monthly (2026-12-05) and quarterly (2027-01-16) box runs, read `r2:carta/status/last_run.json` and `freshness_wires.json`: tier, exit 0, fewer than 8 wires over cadence (8 on 2026-11-12), the quarterly duration against its 120 h timeout.

**H10.** Install `requirements-ml.txt` on the box or the CAX41 worker so the Ask index builds there; move the stays scrape off the laptop; trails lab PostGIS and trip promotion into the worker job. Round 2 (2026-11-12, from docs/owner): T1161-e decided "Yes, promote" (owner tick): add `CARTA_TRAILSLAB_PROMOTE=1` to the box env when the trails worker runs again (inert while it is off; round 2's box write was refused by the session's permission guard).

**H11.** The 657 "What broke" entries cluster on encoding (47), heredoc quoting (44), worktrees (33), flaky tests (22). Fix the causes once.

**H12.** `App.jsx` imports the biggest screens eagerly; only 7 screens use `lazy()`; one 950 KB CSS file blocks rendering. Photos are hot-linked from Wikimedia (5 to 8 s on trail and plan pages) while own copies are built but not live (T1045-h).

**H13.** One boundary in `main.jsx` today, so any panel error blanks the app.

**H14.** Ranked by churn times size: App.jsx, TripPlannerTab, DestinationsTab, ExploreTab, DayPlannerTab, GuidedTripWizard.

**Depends on.** A3 for H6.

---

## 15. Track I: product and business

**Goal.** Everything a full-time consumer product needs around the features: a business that can sell (registered as late as sensible, run without an accountant or lawyer), money that flows, onboarding that gets people to value, accounts that keep their work, reasons to come back, a phone app, support, numbers to steer by, growth, and a way to edit content without a developer. The audit's verdict: the product is far more complete than the business behind it.

**Exit criteria.**
- Registered as a sole trader with the VAT status settled, before the first paid sale or affiliate payout; terms, privacy and disclosures written from official sources and checked by you against a written checklist.
- A real purchase and a real refund done end to end; affiliate links earning.
- Every data source used commercially has terms that allow it.
- Guest work survives sign-up; lifecycle email live.
- Support mailbox, About page and accessibility statement live.
- Weekly cohort and funnel numbers visible in admin.
- All six languages complete, with language in the URL.

### Research

| ID | Question | Starting points | Timebox | Output |
|---|---|---|---|---|
| I-R1 | How do the best travel apps onboard and bring people back? | Teardown of first run and the first 30 days of email in Wanderlog, Hopper, Komoot, Airbnb; "Hooked" (Nir Eyal) and Reforge retention notes as frameworks | 2 days | Onboarding and lifecycle plan for G12 and I6 |
| I-R2 | Which business model mix fits Carta: Pass, yearly plan, affiliate, or a blend? | Competitor pricing pages, affiliate programme terms (Booking/Awin, GetYourGuide, Viator, Omio), Belgian VAT and OSS rules for digital content | 1 day | Pricing and revenue decision for I2 and I4 |
| I-R3 | Which route to the phone: stay a PWA, wrap with Capacitor, or go native? | Capacitor docs, Apple App Store guidelines (sign-in with Apple rule 4.8, payments rule 3.1), Google Play policies, PWA install and push support on iOS | 1 day | Mobile decision for I7 |
| I-R4 | How do I register late and run the admin myself? When does building, a free beta or affiliate sign-up turn into economic activity that must be registered; sole trader as main or side job (hoofdberoep or bijberoep); social contributions; the VAT small-enterprise exemption and how EU sales of digital content are taxed (OSS); simplified bookkeeping a sole trader may keep alone | Official pages of FOD Economie (ondernemingsloket, KBO), FOD Financien (VAT, small-enterprise exemption, OSS), your social insurance fund, the EU "Your Europe" business pages, Stripe Tax docs | 2 days | A written plan for I1 and I10: the registration week, the VAT regime, the bookkeeping method, and the yearly obligations with their dates |
| I-R5 | How do I do the legal parts myself, safely? Terms for a one-off digital pass, the right of withdrawal for digital content and its waiver, privacy policy and records under GDPR, the Imprint, affiliate disclosure, accessibility statement, trademark check | EU Consumer Rights Directive guidance (digital content, withdrawal), FOD Economie consumer pages, the Belgian data protection authority (APD/GBA) guides and templates, EU accessibility statement model, EUIPO TMview (free search), the existing `archive/docs-2026-11/tos/` and `docs/legal/ARTICLE30.md` | 2 days | A legal checklist in `docs/legal/` with each rule, its official source and where Carta meets it; the simplifications in I1 |

### Items

| ID | Item | Done when | Size | Phase | Status |
|---|---|---|---|---|---|
| I1 | Late registration and do-it-yourself legal | From I-R4 and I-R5: registered as a sole trader about Mon 22 February 2027 (week 8, fast track J-b; week 13 on the normal plan), VAT status chosen, Imprint with the business number published; terms, privacy, withdrawal waiver, disclosure and accessibility statement written from official templates and checked against the `docs/legal/` checklist; trademark searched in TMview; the simplifications below applied (P-01, P-05) | M | P3 (prepare), P4 (register) | todo |
| I2 | Payments live | P3: everything built and tested in Stripe test mode (Prices tax inclusive, webhook, Terms URL, refund path). P4, after registration: live keys, one real purchase and refund on a phone; `REFUND_SOP.md` corrected (P-02, P-50) | M | P3 (test), P4 (live) | todo |
| I3 | Data source licensing | Terms checked for Booking, Hostelworld, Google Flights, Xotelo, Ferryhopper, OpenSky; each source cleared, replaced by an affiliate or licensed feed, or dropped (P-03) | M | P1 | in progress (T1091: credit audit done; terms decisions open); follow-up (T336-b, decided 2026-11-12): read the UNESCO World Heritage Centre terms of use from whc.unesco.org, record the licence for the `unesco` designation in docs/tos/data_licenses.md and attribution.js (drop "(verify)"); only then may a courtesy note go to UNESCO |
| I4 | Affiliate programmes | Travelpayouts (Kiwi, Tiqets, Airalo, DiscoverCars, Aviasales data) and Omio now; Viator and GetYourGuide in P3; Booking.com (CJ) and Hostelworld (Partnerize) on the public preview in P4; SafetyWing or Airalo after launch; IDs set; revenue in admin (P-04) | S | P0 to P4 | todo |
| I5 | Accounts that keep your work | Device trips, kept trips and day plans move to the account on sign-in ("3 trips moved"); Apple sign-in and magic link (P-47) | M | P1 | in progress (T1104: sync built and tested, migration 065 paste and the two-device check are owner steps; the moved notice, Apple sign-in and magic link open). Decided in the owner sweep 2026-11-12 (T1015-a): trip documents (passport scans, booking PDFs) stay on the device that added them; Carta holds no identity documents on its servers, so no storage bucket for them |
| I6 | Retention email | Resend secrets and the 060 cron live; welcome, "your trip is in 30 days" and price-drop emails; unsubscribe and preferences (P-48) | M | P3 | todo |
| I7 | Mobile app | Checkout and offline trip checked on real iOS and Android; route from I-R3 built (Capacitor wrap with push, or a polished PWA); store listings live (P-49) | L | P4 (PWA), store After | partly done (T1169: PWA part, offline shell and kept trip after the first visit, API never cached, verify_pwa.mjs; real phones, I-R3 route and stores open); route until launch decided (I-d, T1169-c, 2026-11-12): stay a PWA; store route chosen in February 2027 from I-R3; T632-h (owner 2026-11-12): trip pages offer a waypoint-only GPX (stops and night places as named wpt, no track line); routed GPX not planned |
| I8 | Six complete languages | 525 missing keys filled per locale; key-parity test in CI; browser language on first visit; place intros translated; display currency choice (P-40) | M | P3 | code half done T1170 (keys, parity test, browser language); owner sweep 2026-11-12: catalogue audit, 774 stripped accents restored, French set to vous, shortlist word unified (docs/i18n/review.md); native read per language (docs/owner/translation-review.md), currency choice, place intros open; follow-up (T1047-a, decided 2026-11-12): press.whatP2 and support.fq.pricesA in the five other locales follow the new English I-e wording; follow-up (T1170-e, decided 2026-11-12): French register is vous, convert the tu strings on the home page in fr.js; T377-f (owner 2026-11-12): cheapTips.json gets per-language tips, Dutch first for the K-a launch, then de, fr, es, it; native review through translation-review.md; the PDF reads the same keys |
| I9 | Support and trust | support@ mailbox with SPF, DKIM and DMARC; contact switched from the personal Gmail; About page; accessibility statement (EU Accessibility Act); feedback loop approved and running (P-51) | S | P1 | partly done (T1108: Help and contact page, FAQ, status line; mailbox, About and accessibility statement open) |
| I10 | Business operations, kept yourself | `infra_ledger` live; simple self-kept books (income from Stripe and affiliate reports, costs from invoices) in one sheet with a monthly 30-minute routine; a calendar of yearly tax and social dates from I-R4; cost per active user in admin; Hetzner backups on (P-06, P-55) | S | P3 (prepare), P4 (start) | todo; the monthly 30-minute routine covers T043-b, T043-c, T047-e and T055-b: enter invoices as actual, read the reconciliation line, compare with the Tier 0 plan |
| I11 | Product analytics | Consent-free weekly cohorts (returning accounts, trips saved, plans priced), funnel from first visit to saved trip, a server-side experiment flag in `site_config` (P-52) | M | P2 | in progress (T1129: funnel counters built, migration 070 awaits paste) |
| I12 | Growth | Language in the URL (`/nl/...`) with prerender per language; per-page share images for places and trips; newsletter; referral link (P-53) | M | P2 | partial: language URLs, language pages for destinations, trips and journeys, hreflang and sitemap per language done (T1212), indexed after native review (T1212-a); share images, newsletter, referral open; language prefix at / kept as replaceState, no banner (T1212-f, 2026-11-12) |
| I13 | Content operations | An admin editor for place facts, photos and text that writes overrides the pipeline respects; audit trail per edit (P-54) | M | After | in progress (T1173: runbook docs/runbooks/content-ops.md; data/overrides/{dest,beach,lake,mountain}.json with who, when, why and source per entry, applied last in every run by pipeline/apply_overrides.py; admin Overrides tab lists them and drafts one as a layer file, JSON Patch and pull request text. Open: trails, same-run derived outputs, a live editor that writes, T1173 rows); the writing path is a staging table the pipeline reads at run time (owner decision T1173-i, 2026-11-12), not built (needs a migration) |
| I14 | Where the paywall meets the journey | One designed moment and copy for the Pass (what is free, when the offer shows, what it unlocks), tested in the closed beta; no dead ends | S | P3 | built behind a flag (T1171); beta test is the owner's (T1171-a); T503-g (owner tick 2026-11-12): Account's Your plan no longer links to the pricing page; the pass sheet keeps its "See all prices" link and the pricing page stays |
| I15 | Affiliate links done right | `rel="sponsored noopener"` on every partner link; a small "partner link" mark and a disclosure page; links only after Carta's own figure, one door per cost line, never sorted by commission; cookieless click counting; no partner scripts (so no cookie banner); PRODUCT.md wording decided (I-e); checked against the I-R5 legal checklist | S | P3 | code done (T1172); affiliate ids and the I-R5 check are owner steps; Aviasales hand-off kept with the partner mark (owner T508-c, 2026-11-12); check it shows PartnerMark and rel="sponsored noopener" wherever transportLinks.js and runtime_pricing.js push it |
| I16 | Data access ladder | Each commercial data source has a written legal route, the milestone that unlocks the next step (users or bookings), and a date; Google Flights scraping kept, flagged as a known risk, until a better source (owner tick T1052-a, 2026-11-12); the bed decision (I-g) reviewed before the Booking.com affiliate application; milestones tracked in admin (K12) | M | P1 to P4, then ongoing | partly done (T1213: records, config and flags built, applications are owner steps; the box late sweep reads the same LADDER_STOP_GOOGLE_FLIGHTS switch, T1213-d, owner sweep 2026-11-12); T1161-c (2026-11-12): no home device or proxy for Booking; it stays paused until the affiliate or Demand API route after registration; owner sweep 2026-11-12: the stays health check reports through the run status rather than a mail (T1074-c); the real Hostelworld card fixture (T1074-a) and the missing-beds re-scrape (T1075) are taken at the March 2027 box scrape; once the owner opens `carta-stays-state` to the box key (docs/owner/stays-box.md), Claude runs the stays build and reads `cache/stays/gate_report.md` (T645-a), recounts places with a measured stay curve (T103-a), makes the cheapest-week calendars with `scripts/share/share_assets.mjs --stays <dir> --png` (T1175-b) and reruns the basket numbers (T1130-f) |
| I17 | Price alerts | A traveller can save a place or trip and get one email when its total drops by a set share; built on the stays and flights data already refreshed, through the email route of I6 | M | P3 | code done (T1205, 2026-11-07): place alerts behind a flag; the 073 paste, the secrets, the deploy and the trip-level control are open (T1205-a to T1205-f); follow-up T1205-g (decided 2026-11-12): when alerts go live, retire the T944 price_drops switch (TravelView.jsx), reportPriceDrops in App.jsx and the notify price-drop path, moving opted-in accounts to alerts |

### Item details

**I1.** All owner work, without an accountant or lawyer, by your choice. The procedure is not written yet; it goes in `docs/owner/` when I1 starts (the register file planned under A3 never existed). Round 2 (2026-11-12, from docs/owner): T333-f: once Resend sends (T213-e), send the 12 November 2026 Terms change notice to every confirmed account (text and recipients in `docs/legal/terms-change-notice-2026-11-12.md`) and record the send date; uploads go public 30 days after.

- **Why week 8 (fast track, J-b).** Building, a free beta, the waitlist and opening affiliate accounts need no registration. Taking money does: a paid Pass, or affiliate commission paid out to you. Registering on about 22 February leaves about two weeks for the business number, VAT status and Stripe's verification before the public opening on Tue 9 March 2027. The VAT regime is chosen by Tue 16 February (I-R4, Launch runway). Confirm in I-R4 exactly where Belgian rules draw the line.
- **Simplifications that keep you out of the hard legal areas.** Each one replaces a question the register had parked for a lawyer:
  - Sell only one-off passes. Make the yearly plan a 12-month pass that does not renew automatically. This removes the subscription renewal rules entirely (T460-b, T461-e).
  - Treat a pass as a digital service: the checkout asks to start at once, a withdrawal within 14 days pays for the days used, and the right ends only when the pass has fully run (self-review T032-e, 2026-11-12; Directive 2011/83/EU Art 14(3), 16(a); CJEU C-641/19; decision 0010).
  - Write the privacy policy and processing records from the APD/GBA templates. `docs/legal/ARTICLE30.md` already exists.
  - Use links-only affiliates with clear disclosure and no tracking scripts, so no cookie banner is needed (I15).
  - Commission wording resolved by I-e (2026-11-12): PRODUCT.md carries the new sentence.
  - Run the trademark check yourself in TMview. Register the mark later, if ever.
- **What you accept.** Without a professional review, a mistake is yours to find and fix. Every legal text lists its official sources, and section 19 records the decision, so the choice is visible. If revenue grows, a one-off review later stays an option. Since 2026-11-12 each legal text is self-reviewed by a Claude session against the official texts, with the clauses it relies on recorded, in place of a lawyer's check (`docs/decisions/0010-legal-posture-diy.md`).
- **Register rows this retires.** T015 and T033-g (the accountant's VAT answer) are replaced by I-R4. The lawyer-review rows are replaced by I-R5 and the checklist. Close them in A3 with this reason.
- Follow-up (T333-b, T206-c, 2026-11-12): the upload terms were rewritten; bump `UPLOAD_TERMS_VERSION` and `OSM_TICK_VERSION` in `continent-app/src/community/uploads.js` to 2026-11-12 with a migration that moves `begin_upload`'s `v_terms` and `v_osm`, and set `upload.osmTick` in the six locales to "Carta may give this track to OpenStreetMap, which may use it under the OpenStreetMap contributor terms".
- Follow-up (T461-i, 2026-11-12): cap the legal body (`.legal-doc` prose) at about 70 characters a line with a legal-only max-width, leaving the global `--measure` token alone; record it in DESIGN.md and check phone and desktop.
- Follow-up (T032-e model form, 2026-11-12): when the Imprint is filled (T461-b), the withdrawal model form in the Terms names the legal name and postal address instead of "the provider named in the Imprint" (Directive 2011/83/EU Annex I(B)).

**I2.** Follows `docs/owner/stripe.md` and `docs/owner/pass-subscription.md`. Test from the installed app on a real phone (T246-c).

- Follow-up (T460-b, T461-e, T032-e, 2026-11-12; code built 2026-11-12 under I-f, owner round 2: one-off checkout, waiverText, six-locale strings, cancel flow removed; still open: the confirmation email, the `REFUND_SOP.md` pro-rata line, the T227 saved-trips check): make the Year Pass a one-off 12-month payment (checkout mode `payment` for both tiers, `RECURRING_TIERS` empty, drop the cancel flow and the invoice grant path in `supabase/functions/_shared/passes.mjs` and the webhook; `pass.yearName` becomes "Year Pass" in six locales; the pricing.js comment loses "it is also what renews"); change `waiverText` and `continent-app/tests/passSubscription.test.mjs` to the digital-service request: "I ask Carta to start my pass as soon as this payment completes. I understand that if I withdraw within 14 days I pay for the days my pass has run until then, and that my right to withdraw ends once the pass has been fully supplied. [terms link]"; add the pro-rata withdrawal refund to `REFUND_SOP.md`. The T228 gate fails unless the purchase confirmation email (Directive 2011/83/EU Art 8(7), the durable medium of Art 8(8)) repeats the request to start, the 14-day right, the pro-rata rule and the model form. The Terms already describe this (2026-11-12). Before T227, confirm in code the Terms promise that trips and plans stay saved and readable when a pass ends. The same release changes, in all six locales, the in-app strings that still describe a renewing plan: `pass.legalYear`, `pass.holdYear`, `pass.subscribedNote`, `pass.errSubscribed`, `pass.cancellingNote`, `account.planResumed`, `account.fq.differenceA` (`pass.legalTrip` was aligned on 2026-11-12). Gate: no live Stripe key (T228) until this follow-up has shipped, because the Terms of 2026-11-12 already say no pass renews.
- Follow-up (T1047-a, K-b, 2026-11-12): a founding price flag on the account so checkout offers the Year Pass at the founding price once K-b's figure is set.

**I3.** The highest business risk after I1. For each source: terms read, risk written, decision recorded as an ADR.

- Follow-up (T300-e, T516-a, T310-a, T641-a, 2026-11-12): Ferryhopper widget sampling and the OpenSky collectors are dropped before the first sale (no traveller surface reads them); the Lifestyle anchors are recomputed from Eurostat comparative price levels and shipped before T227, and until then the Numbeo-seeded anchors stay flagged "not sourced" in the ledger; the copied Google airline logos are dropped and the airline name shown instead; a Claude session works through the remaining `Verify` rows of the licence ledger (`src/ingestion/core/registry.py`) by reading each licensor's own terms and records the clause; opentransportdata.swiss and the Sardinia (Delcomar) feed are verified (terms read 2026-11-12).
- Google Flights (owner tick T1052-a, T518-c, 2026-11-12): scraped Google fares appear in the free tier and trip totals only; no paid feature is described as "live flight prices"; `LADDER_STOP_GOOGLE_FLIGHTS=1` is switched on and off once in a drill before O-7 (Tue 2 March 2027).

**I4.** Affiliates add roughly 8 to 15 EUR per 1,000 visitors against about 170 EUR from the Pass (an assumption, research file section 4): useful, never the main business. Booking.com needs a live site with content, so apply on the public preview.

- Follow-up (T461-d, decided 2026-11-12): a unit test fails if operator or link order reads any commission field, so "never ranks by what it earns" (PRODUCT.md) stays true.

**I14.** The roadmap review found no item that designs the paid moment; this is it.

**I15.** Plain decorated links set no cookie on Carta's domain; partner widgets would force a consent banner. EU guidance requires the disclosure before the user clicks.

**I16. Data access ladder.** The best legal data is earned with traffic: partners open their feeds to sites that already send them customers. So Carta climbs in steps. Terms change, so each step is re-checked when it is reached (sources: research file, section 4).

| Data | Today | Legal route | Unlocks when | Step |
|---|---|---|---|---|
| Flight fares | Scraped from Google Flights (no API since 2018, so no legal route) | Aviasales Data API via Travelpayouts: cached fares from real searches, meant for static pages | Free signup, now | **P1**: measure coverage on the 10,094 routes; switch where coverage is good. Keep scraping Google Flights, flagged, until Aviasales coverage or another licensed source replaces it route by route (owner tick T1052-a, 2026-11-12) |
| Live flight search | Not available | Travelpayouts Flight Search API | About 50,000 monthly users (a note in `continent-app/src/lib/affiliate.js`) | Apply at the milestone |
| Bed prices | Scraped from Booking.com and Hostelworld | Booking.com Demand API, for Managed Affiliate Partners only (contract plus an account manager) | Steady bookings sent through Booking affiliate links; the threshold is not published, so ask once there is a track record | **Decision I-g: keep scraping, flagged as a known risk, until the Demand API.** Review before applying to Booking's affiliate programme (P4), because its terms are likely to forbid scraping and a breach could cost the account the ladder depends on |
| Hostel prices | Scraped from Hostelworld | No public API; a direct partnership | Volume through Hostelworld affiliate links (Partnerize) | Approach with numbers after launch |
| Activity prices | None | Viator (Basic tier instant), Tiqets (self-service API), GetYourGuide (through a partner manager) | Little or nothing | **P3**, with I4 |

**Living with decision I-g (scraping beds until the Demand API).**
- **Keep the footprint small.** Slow, polite scraping only. Never republish raw listings: Carta shows its own derived figures (a per-night price for a place and tier), never a copy of a listing.
- **Be ready to switch.** Each bed price links to Booking or Hostelworld for the real price. The `LIVE_STAYS` kill switch and a fallback to price bands (option B) stay built, so stopping is a one-line change.
- **Watch the scrapers.** D5's yield and block alerts show early if a source pushes back.
- **Write it down.** The risk and the reasons go in the I-R5 legal checklist and an ADR.
- **Review dates.** (1) Before the Booking.com affiliate application in P4: keep A, or move to option C (scraped data only calibrates bands, never shown as a live price) so the affiliate account is safe. (2) As soon as the Demand API opens: switch and stop scraping.

**Milestones in admin.** K12 adds the unlock numbers to the weekly marketing view: monthly users, affiliate clicks and bookings per partner. Each step of the ladder has a trigger you can see coming.

- Terms read 2026-11-12 (T1213-a): Booking.com customer terms A15.2 forbid robot access and copying "whether or not the use is commercial", A15.3 blocks price gathering, A18.3 reserves an injunction; the Hostelworld affiliate agreement 3.1(h) forbids automated gathering of prices by an affiliate and 6.1(c) bars tracked links on price comparison or travel search sites without written agreement. So: stop the Hostelworld sample (`LADDER_STOP_HOSTELWORLD_SCRAPE=1`) before joining the Hostelworld programme and ask Hostelworld in writing whether Carta may carry its tracked links; never quote Booking.com-scraped prices in press stories, social images or data stories (T1130-c, T1175-c).

**I5.** Today the device trip only shows in `SavedTripsPanel.jsx` and kept trips stay on the device. On `SIGNED_IN`, upload and merge, then clear the device copy (pairs with N5).

- After launch (T889-c, decided 2026-11-12): a personal address to forward booking emails to, needing an inbound mail route and a C9 privacy entry.

**I6.** `supabase/functions/notify` exists. Lifecycle content follows I-R1.

**I7.** Mobile route: stay a PWA through launch (I-d, decided 2026-11-12).
- If the February I-d decision picks a store app: owner makes the Android signing key with an offline copy, publishes assetlinks.json, uploads the icons from continent-app/brand/store (ex T212-f).
- T272-b (2026-11-12): Apple and Google developer accounts wait for decision I-d in February.

**I8.** 136 of the missing keys are traveller-facing (wizard 49, trip 38). Editorial text is English only today.

- Follow-up (T401-h, T461-c, 2026-11-12): the legal pages stay English in de, fr, es and it, with one translated line saying so, and the pricing page says "You can only buy a pass in Dutch or English for now" until they are translated; for the Dutch launch (K-a) a session translates the Privacy policy, Terms and Imprint into Dutch after the English texts settle, and the owner reads them as a native speaker. The Dutch pages are part of the T227 legal gate (Tue 2 March 2027).

**I9.** Support and trust.
- Decided 2026-11-12 (T1108-a): the support address is support@carta-europetravel.com, forwarded by Cloudflare Email Routing; `SUPPORT_EMAIL` in `continent-app/src/lib/contact.js` changes to it once the route answers.

**I11.** Keep the current no-identifier, no-consent approach: counters per week, not per person.

**I13.** Today only a developer can add or fix a place. Admin overrides (migrations 018, 043) are the base.

**I17. Price alerts** (proposed 2026-11-06): the most asked-for retention feature in travel; it reuses data Carta already refreshes and gives the newsletter (K3) and retention email (I6) a reason to exist. Consent and unsubscribe per GDPR (C9).

**Depends on.** I-R4 and I-R5 before I1; I1 (registration) before I2 goes live and before affiliate IDs go live (I4); I3 before relying on scraped data commercially; I5 pairs with N5; G12 uses I-R1.

---

## 16. Track J: launch

**Goal.** Go live on 4 May 2027 with the business in place (Track I), a tested beta and a frozen, rollback-ready build. The public opening (open beta) is Tue 9 March 2027.

**Exit criteria.** The production-ready checklist (section 18) is all ticked.

### Items

| ID | Item | Done when | Size | Phase | Status |
|---|---|---|---|---|---|
| J1 | Launch sign-off | Registered (I1), payments live (I2), sources cleared (I3); terms and privacy final against the `docs/legal/` checklist; AI page live (F8); Article 30 current (C9) | S | P4 | todo |
| J2 | Performance and SEO | Prerendered place pages within G11 budgets, sitemap, structured data | S | P4 | todo |
| J3 | Beta fixes | Closed and open beta run in K9 (50, then open); plan completion, Ask withdrawal rate and taste acceptance measured, two fix weeks | M | P3 to P5 | todo |
| J4 | Launch metrics and outreach | `LAUNCH-METRICS.md` live, outreach from `docs/marketing/launch-outreach.md` (approved 2026-11-12, T336-a) | S | P5 | todo |
| J5 | Freeze and go live | Fixes only from Tue 27 April (D-7), full deploy procedure, rollback tested, launch Tue 4 May 2027 | S | P5 | todo |

### Launch runway (dates set 2026-11-12, T207-a, T220-a, T220-c)

Two dates anchor the runway. O is the public opening (open beta, fast track J-b): Tuesday 9 March 2027 (W10). D is the campaign launch: Tuesday 4 May 2027 (W18). The T220 runway (`archive/execution-full-2026-11-03:Execution/P12/T220-launch-runway.md`) was written for one launch with a 15-person soft launch at D-14; on the fast track the closed beta (K9, January to early February) and the public opening replace that soft launch, so the rows that protect strangers and the funnel move to O. If T227 or T235 is late, O moves by the same number of days; the gates never move. Record: `docs/decisions/0009-launch-plan-fast-track.md`.

| Date | Offset | What happens |
|---|---|---|
| now (2026-11-12) | D-173 | D and O committed (T207-a). Search Console, Bing Webmaster and IndexNow (K12, was D-42) and the landing page and sitemap (K2, was D-28) run now, because indexing takes months |
| Before the first K9 invitation (January 2027) | | The Imprint carries the owner's legal name, postal address and email (enterprise number "applied for"); no stranger's email is taken before it does |
| Tue 26 Jan 2027 | O-42 | Gate check: can T227 (legal), T228 (payments), T232 (Supabase Pro) and T235 (alerting) finish by their rows below? If not, move O now, not later |
| Tue 16 Feb 2027 | O-21 | Was D-35 and D-21: support mailbox open and each canned answer in docs/SUPPORT.md tried once; pricing page and every paywall string final in the launch languages (nl, en; pricing.js only); refund path tried once in test mode (docs/runbooks/refund.md); no third-party script, no cookie banner. I-R4 finished: VAT regime chosen and written in `docs/decisions`. The K-b founding yearly price set from measured AI use |
| Mon 22 Feb 2027 | O-15 | Register as a sole trader (I1, 0007), then start Stripe live verification |
| Tue 2 Mar 2027 | O-7 | T227 legal gate (with Terms, Privacy and Imprint in Dutch read by the owner, and the Art 50(2) machine-readable AI mark shipped, F8), T232 Supabase on Pro, T235 uptime and error alerting passed; Lifestyle anchors from Eurostat shipped and the Google Flights stop drill done (I3); marketing surface gate and the P4 must list for the opening (section 4) |
| Mon 8 Mar 2027 | O-1 | T228 payments gate: one real EUR 6.99 purchase succeeded and refunded in the Stripe dashboard, credit note issued; payout reconciliation follows with the first payout. Done only when checkout creates mode `payment` for both tiers (`RECURRING_TIERS` empty; built 2026-11-12, I-f), `waiverText` in passes.mjs contains no "lose" (built 2026-11-12), and the purchase confirmation email (Art 8(7)) is sent (not built yet) with the request to start, the 14-day right, the pro-rata rule and the model form. If Stripe is not verified yet, O still opens as a free open beta and the paid Pass goes live the day after T228 passes (0007) |
| Tue 9 Mar 2027 | O | Public opening: waitlist email, communities, data stories; no press, no Product Hunt. The paid Pass goes live here only if T228 passed, never earlier than O; referral rewards (K-b) are granted once it is live |
| Tue 23 Mar 2027 | O+14 | Opening marks (T220-d): at least one recorded purchase, every inbox message answered within two working days, every finding triaged weekly, no open finding that stops a stranger reaching the receipt |
| Tue 23 Mar 2027 | D-42 | D confirmed or moved; from here the T220 offsets hold |
| Sun 4 Apr 2027 | D-30 | Hacker News (if not used by K8), Product Hunt, Reddit, OSM forum and OSMBC accounts open and used normally |
| Tue 6 Apr 2027 | D-28 | Any page a campaign will name passes the gate and is in the sitemap |
| Tue 13 Apr 2027 | D-21 | Partner emails L1 to L3 with the co-announce paragraph (T336-a, `docs/marketing/launch-outreach.md`); brand assets and press kit final (K10) |
| Tue 20 Apr 2027 | D-14 | Re-read each subreddit's rules and the Product Hunt guide; re-check the outlets list |
| Mon 26 Apr 2027 | D-8 | Last day a fix that needs a migration or a function deploy may ship |
| Tue 27 Apr 2027 | D-7 | Freeze (J5): fixes only. T229, T230, T231 passed. Go or no-go written in the report |
| Sat 1 May 2027 | D-3 | Final copy check: Product Hunt text, OSM forum post, reply bank |
| Mon 3 May 2027 | D-1 | Dry run on a clean phone and laptop profile; abandon if checkout cannot take a payment, alerts do not fire or the deep link needs a sign-in |
| Tue 4 May 2027 | D | Campaign launch (K11): Product Hunt at 00:01 Pacific (09:01 Brussels), waitlist email, OSM forum post; courtesy notes after the posts are up (T336-a, T336-b); evening: the five numbers in LAUNCH-METRICS |
| Wed 5 May 2027 | D+1 | Reddit data post where the community rules allow it |
| Fri 7 May 2027 | D+3 | weeklyOSM item through OSMBC |
| Tue 11 May 2027 | D+7 | Week-one metrics read in full; mid-May beach ranking follows (K5) |

**Depends on.** All other tracks.

---

## 17. Track K: marketing

**Goal.** People who would love Carta find it, try it and tell others, without paid ads. Every campaign points at pages and flows that already pass the marketing surface gate (section 4).

**The constraint.** A visitor is worth about 0.17 EUR (`archive/execution-2026-11-11:archive/docs-2026-11/GTM-ACQUISITION-CONSTRAINT.md`), so paid search, paid social, influencer fees and sponsorships are out. The budget is engineering and writing time. Carta's edge is data nobody else publishes: real daily costs for 3,868 places, 17,619 rated trails, bathing water and crowds by month.

**Exit criteria.**
- Search Console shows the indexable page sets growing and "discovered, not indexed" under 30%.
- A waitlist and newsletter with a regular issue.
- At least two data stories picked up by press or linked from other sites.
- A closed beta of 50 and an open beta before launch.
- A launch campaign run, with results measured per channel.

### Research

| ID | Question | Starting points | Timebox | Output |
|---|---|---|---|---|
| K-R1 | Who is the first audience, and what words do they use? | 5 to 8 interviews with travellers who plan Europe trips (shared with G-R3); r/solotravel and r/travel threads read for language; PRODUCT.md persona | 2 days | Audience note, launch market (country and language), the three pains Carta's messaging leads with |
| K-R2 | Which channels and rules fit Carta? | Each subreddit's own rules (message the mods), Show HN rules, Product Hunt 2026 playbooks, Indie Hackers, travel Facebook groups; the research file section 3 | 1 day | Channel plan with the rules for each |
| K-R3 | Creative exploration: what would make people share Carta? | The campaign backlog in the research file section 3; awwwards and Reddit data-viz posts for inspiration; what people screenshot from travel apps | 2 days, then ongoing | A ranked shortlist for the creative slot (K13) |

### Items

| ID | Item | Done when | Size | Phase | Status |
|---|---|---|---|---|---|
| K1 | Positioning and brand basics | One-page positioning (from K-R1), launch market and language, name check (EUIPO), social handles, a press-ready logo and screenshots | S | P0 | in progress: draft done (T1060); name kept, Carta in class 39 as word plus logo (owner tick T1060-a, 2026-11-12); handles open (T1060-c) |
| K2 | SEO plumbing and the page quality gate | Prerender and canonical live; `indexable` field from the pipeline; pages below the bar `noindex,follow` and out of the sitemap; sitemaps split by page type; hubs indexed; structured data; weekly Search Console review | M | P1 | in progress (T1076 bar, T1113 bars for every kind; owner decision 1 kept 337 places; upload is an owner step, T1113-a); open: IndexNow key file in `public/` and a submit step after each prerender push (owner sweep 2026-11-12) |
| K3 | Waitlist and newsletter | Waitlist on Home with double opt-in and a referral jump (3 referrals = a free Trip Pass, 10 = a founding yearly price); a monthly "best-value places" newsletter | S | P0 to P1 | partly (T1110: double opt-in capture built; referral jump and newsletter issue 1 open); reward rules fixed (K-b, 2026-11-12): a free Trip Pass at 3 referrals; at 10 a founding yearly price below 14.99, its figure set before 16 Feb 2027 with at least EUR 2.00 net margin over worst-case AI cost; each reward once per account; a referral counts when the friend confirms a different email address (double opt-in); Carta may withdraw a reward for abuse; the rules are written in the waitlist page terms; no price is shown on the waitlist page until it is set; rewards granted once the paid Pass is live |
| K4 | Build in public | A weekly post (pipeline, data, design, AI engineering) on LinkedIn and one other channel; a public changelog page | S, ongoing | P0 onwards | todo |
| K5 | Data stories | Europe Cost Index 2027 with a methodology page and a local angle per country; Sunshine Saturday release on Sat 2 Jan 2027; a June "quiet clean beaches" ranking | M | P2, P4 | in progress (T1130: basket script, Dutch and English drafts, method note; publishing is an owner step, T1130-a); Walloon press skipped until after launch, Dutch and English only (T1130-d, K-a) |
| K6 | Community presence | Regular, useful answers with real numbers in 3 or 4 communities; occasional data posts with no link; mods contacted first | S, ongoing | P2 onwards | todo |
| K7 | Shareable assets | "Europe on 100 EUR a day" map, "cheapest week" calendar per place, shareable trip receipt image | M | P3 | in progress (T1175: the three assets generate with a numbers check and credits, the receipt shares behind its flag; calendars wait for the stays wire on the owner box, the flag flip and publishing are owner steps); price images exclude Booking-derived figures (T1130-c, T1175-c, 2026-11-12): social images and data stories show prices only from licensed or Carta-measured sources; bed or stay prices derived from Booking.com wait for a licensed source (I16) |
| K8 | Open dataset and Show HN | A CC-BY subset (licences checked) on GitHub with a write-up; Show HN once the free part needs no signup | S | P3 | doing: code half done (T1176), owner publishes; Round 2 (2026-11-12, from docs/owner): T1176-a: trace the source of gem `id`, `name` and rounded `lat`/`lon` (85 of 3,608 gems have no GeoNames match) and drop OSM-only rows from the open export. T1176-b decided: Claude runs the export against the live wire and publishes the repo in February with this item. |
| K9 | Beta programme | Closed beta of 50 from the waitlist (P3), open beta from the public opening on Tue 9 March 2027 (P4, J-a and J-b); feedback loop into the register; testimonials collected with consent | M | P3 to P4 | todo; invitation approved (T220-d, `docs/marketing/beta-invitation.md`); start condition (2026-11-12): no invitation goes out before the Imprint carries the owner's legal name, postal address and email (enterprise number "applied for"); opening marks: one recorded purchase by O+14, every inbox message answered within two working days, findings triaged weekly, no open finding that stops a stranger reaching the receipt |
| K10 | Press kit and list | A press page (facts, screenshots, methodology, contact); a list of about 40 BE, NL and UK travel and data journalists and newsletters | S | P2 to P3 | built T1131 (owner fills founder line, names and addresses) |
| K11 | Launch campaign | Product Hunt on 4 May, waitlist email, courtesy notes to the credited bodies (`docs/marketing/launch-outreach.md`, recipients per T336-b), community posts, mid-May beach ranking; a two-week plan with owners per thread | M | P5 | todo |
| K12 | Marketing measurement | Cookieless channel counts (UTM to the existing counters), Search Console per page type, waitlist and referral funnel, one weekly marketing number in admin; the I16 unlock numbers (monthly users, affiliate clicks and bookings per partner) | S | P0 to P1 | partly done (T1109: channel counts built, migration pending) |
| K13 | The creative slot | One experiment every two weeks from P2, picked from K-R3's shortlist; each written up in one paragraph (idea, what it took, what it did) | S each | P2 onwards | todo |
| K14 | Automated data blog | A blog at `/blog/` whose posts are drafted automatically each month from Carta's own data, checked by script for honest numbers and copy rules, approved by the owner, and published with the deploy; RSS, sitemap and structured data | M | P2 to P3 | part 1 built (T1178, 2026-11-07): drafts task, check script, pages, RSS, sitemap file; part 2 built (T1174, 2026-11-07): what changed, new on Carta and lowest fare week types, snapshots, monthly `blog_pr` routine (dry run until the owner sets `CARTA_BLOG_PR=1`); December 2026 draft ready for the owner, nothing published; wiring into deploy open (T1178-a), fares export and Dutch open (T1174-a, T1178-c) |

### Item details

**K2.** The research found Google uses site-wide quality signals, so thin generated pages can pull down good ones. Today about 1,800 places and about 450 trails would pass the bar in the research file (section 2). Pages promote automatically as data work (D7, D9) lifts them over the bar. Pause new batches if "discovered, not indexed" passes about 30%.

**K3.** Show HN does not allow waitlist-only pages, so the free part (map, place pages) stays open and the waitlist sits in front of planning features until the beta.

**K5.** Post Office's yearly holiday barometer and the Backpacker Index earn press every year with the same simple basket and a local angle per country. Carta's basket is bed, food and getting there, per place, per month. Pitch the Belgian angle to Flemish press first; Walloon press follows once French is added after launch (T1130-d).

- Decided 2026-11-12 (T1130-c): press stories never quote prices scraped from Booking.com (customer terms A15.2 forbid robot collection whatever the use, A18.3 injunction); the bed figure in a story waits for a licensed source, or the story ships without it.

**K13.** Room for creativity, on purpose. Candidates from the research: the quiz, Shorts ("what 50 EUR buys in X vs Y"), an embeddable cost widget, tourism board data swaps, a "five apps vs Carta" video, map art from trail data, a monthly hidden-trail list. A rule protects it: an experiment whose landing page fails a phone check is postponed, not shipped.

**K14. Automated data blog** (added 2026-11-06)
- Round 2 (2026-11-12, from docs/owner): T1174-b decided: switch the monthly `blog_pr` on. Claude makes a write deploy key for the box (`main` stays protected, so drafts arrive as PRs) and sets `CARTA_BLOG_PR=1`; publishing stays the owner's merge.

*Why.* Search traffic and links come from pages that answer a seasonal question with numbers nobody else has ("Where in Europe is warm and under 80 euros a day in March?"). Carta has those numbers every month. A blog turns them into posts with almost no writing per post, and feeds the newsletter (K3) and the community posts (K6).

*The risk to design around.* Google treats large volumes of generated pages with little original value as spam (scaled content abuse), and site-wide quality signals mean thin posts pull good pages down (K2). So: few posts, each built on data that is Carta's own, each reviewed by the owner, never auto-published.

*Post types* (all from data the pipeline already refreshes):
- Monthly "Where to go in <month>": best-value places that are in season, with weather, sea temperature and crowds.
- Cheapest week: for Easter, May, summer and autumn breaks, per departure airport in the launch market.
- What changed: the biggest moves in bed and flight prices since last month (from D5's drift report).
- New on Carta: places and trails added by D15 and D7.
- Seasonal rankings: quiet clean beaches in June, ski weeks, autumn walks; the K5 data stories (Cost Index, Sunshine Saturday) are published here too.
- How we measure: method notes for prices, ratings and sources (they earn links and trust).

*How it runs:*
1. A monthly pipeline task `blog_drafts` (on the box, H9) writes structured drafts: the numbers, tables and chart data as JSON from the current wire, plus Markdown text from templates. Prose beyond the templates comes from a Claude Code session or the pipeline's Gemini key (never the Claude API, per CLAUDE.md).
2. A check script refuses any draft where a number does not match the data snapshot it cites, a copy rule fails (banned words, dashes, superlatives), an image is not licensed or credited, the post adds no original data, or another post already targets the same question.
3. Drafts land as a pull request (a scheduled Claude Code routine can open it each month). The owner reads and edits, then merges.
4. The next deploy prerenders the posts at `/blog/<slug>` (and `/nl/blog/` once Dutch is ready, I8): canonical, `BlogPosting` structured data with author and dates, hreflang, links into the place pages that pass K2's bar, an RSS feed and a blog sitemap in the index.
5. The newsletter (K3) sends the monthly post; K12 counts visits per post; the K2 pause rule applies (stop new posts if "discovered, not indexed" passes 30%).

*Cadence.* Two to four posts a month. Quality over volume.

*Phasing.*
- P2: generator, check script, page template, feed and sitemap; three launch posts in December ("Where to go in January", the Sunshine Saturday story, one method note).
- P3: the monthly routine on the box.
- P4: Dutch posts.
- About 3 sessions: generator and checks; pages, feed and structured data; the first posts and the routine.

**Calendar at a glance.**

| Month | Marketing |
|---|---|
| Nov | K1, K3 waitlist, K4 weekly posts, K12, K-R1 interviews, K2 plumbing |
| Dec | K2 gate live, newsletter issue 1, Cost Index built, Sunshine Saturday release drafted, K10 list |
| Jan | Release on Sat 2 Jan, second push at the end of January, K6 community posts, creative slot starts |
| Feb | K8 open dataset and Show HN, K9 closed beta, widget beta for 10 bloggers, registration about 22 Feb |
| Mar | Public opening and open beta on Tue 9 March for summer planners, cheapest-week calendar for Easter and May, Shorts series |
| Apr | Hidden trails and beaches lists, Product Hunt preparation, trip receipt sharing live |
| May | Launch on 4 May; mid-May beach ranking; June price-shock report |

**Depends on.** The marketing surface gate (section 4) before any deep link; K2 needs H1 and D7; K7 needs G3 and G12; K8 needs I3 (licences) and D1 (clean schema).

---

## 18. Production-ready checklist

**Documentation**
- [ ] Handbook covers every feature; every rule has a logic ID and a catalogue entry, checked both ways in CI
- [ ] Config reference, lineage, diagrams and API reference regenerate in CI; drift check green; examples run as tests

**Security**
- [ ] Threat model current; ASVS L2 and LLM Top 10 checklists complete, no high finding open
- [ ] Dependency, secret, SAST and DAST scans in CI; MFA on every owner account; secrets inventoried and rotated
- [ ] External check passed and retested; `SECURITY.md` and `security.txt` live

**Data and AI**
- [ ] One JSON Schema validates every wire file at write and at sync
- [ ] Scorecard per run, no hard rule failing, 95% truth-set accuracy, every layer fresh
- [ ] Ask gate green, injection set passes, withdrawal rate under 10%
- [ ] Every LLM call guarded and logged, with a fallback that never shows an empty screen

**UI**
- [ ] Usability retest with 5 travellers passes on every core flow
- [ ] WCAG 2.2 AA audit passed; axe, Lighthouse, bundle and visual gates in CI

**Fix now**
- [ ] N1 to N8 done

**Data completeness**
- [ ] Every target in the Track D completeness table met

**Product and business**
- [ ] Registered as a sole trader with VAT status settled before the first paid sale; legal texts checked against the `docs/legal/` checklist; every data source cleared for commercial use
- [ ] Real purchase and refund done; affiliate links earning
- [ ] Guest work survives sign-up; lifecycle email live; support mailbox live
- [ ] Six complete languages with language in the URL; weekly cohorts in admin
- [ ] First plan in 5 screens or fewer

**Marketing**
- [ ] Marketing surface gate passed before any deep link (section 4)
- [ ] Page quality gate live: thin pages noindex, sitemaps by type, Search Console reviewed weekly
- [ ] Waitlist and newsletter running; two data stories published; closed and open beta done
- [ ] Affiliate links disclosed, marked sponsored, no partner scripts

**Operations**
- [ ] CI runs every check on every PR; `main` protected
- [ ] Sentry, SLO panel, durable rate limits, load test at 10x passed
- [ ] Nightly backups, timed restore drill
- [ ] Every pipeline task scheduled off the laptop; entry chunk under 150 KB gzip
- [ ] Every owner gate closed; legal checklist complete
- [ ] Register under 250 open rows, each mapped to an item or procedure

---

## 19. Decisions only you can make

All open rows were decided by the owner on 2026-11-12 (owner ticks T1045-i, T1047-a, T1049-a: accept every recommendation, fast track for J-b). Records: `docs/decisions/0009-launch-plan-fast-track.md`, `docs/decisions/0010-legal-posture-diy.md`.

| ID | Question | Decision |
|---|---|---|
| R-a | Approve this file as the plan of record and archive `Roadmap/` | Decided 2026-11-12 by the owner: yes. This file is the plan of record; `Roadmap/` was archived by T1050 (7ff82fe20d). |
| R-b | One research day a week (Fridays) as the rhythm | Decided 2026-11-12 by the owner: yes, Fridays. On the fast track only the essential research runs (section 4: G-R1, G-R3 with K-R1, I-R4, I-R5, C-R2, E-R1). |
| F-a | Offline Bedrock experiment with non-Anthropic models (needs an AWS account) | Decided 2026-11-12 by the owner: yes, offline only, non-Anthropic models on the F1 eval set, never in the app (0005). It runs after launch with F2 (F-b); the AWS account is an owner step at that time. |
| H-a | Sentry and Langfuse as new services (EU options; Langfuse self-hosted) | Decided 2026-11-12 by the owner: yes. Sentry in the EU region with IP storage off (owner step T1120-a). Langfuse self-hosted on the box once H7 shows the 4 GB box has room; until then `ai_model_events` and the E4 panel carry tracing. |
| C-a | Who does the external security check in C11 | Decided 2026-11-12 by the owner: a structured self-pentest (OWASP WSTG against the C10 ASVS list, ZAP baseline, retest), plus a security-minded peer if one offers; no paid firm (0007). |
| A-a | `Trips/carta-unified/`: fold into `pipeline/trips/` or archive with its two workflows | Decided 2026-11-12 by the owner: fold what runs (generator, critic, golden set, validator, repointing `golden-set.yml` and `trip-validator.yml`) into `pipeline/trips/`, archive the rest (A2). |
| B-a | Docs site private or public | Decided 2026-11-12 by the owner: private first (Cloudflare Access on the docs Pages project), public after the C10 checks (B6). |
| I-a | Business set-up (I1) | Decided by you on 2026-11-04: sole trader, registered as late as sensible (week 13, 14 at the latest), no accountant, no lawyer; legal and admin done yourself from official sources (I-R4, I-R5). On the fast track (J-b, 2026-11-12) registration is about Mon 22 February 2027; legal texts are self-reviewed by a Claude session against official texts (0010). |
| I-f | Yearly plan as a non-renewing 12-month pass | Decided 2026-11-12 by the owner: yes (also 0007): the Year Pass is a one-off 12-month pass that never renews. Built 2026-11-12 (owner round 2): checkout mode `payment` for both tiers (`RECURRING_TIERS` empty), `waiverText` without "lose", the webhook's subscription and invoice branches, the `billing` function and the cancel, resume and portal screens removed, six-locale copy says Year Pass with no renewal, migration 075 (+ down) drops the `subscribed` refusal from `pass_can_buy`. Owner steps: paste 075, make `STRIPE_PRICE_YEAR` a one-time Price, deploy checkout and stripe-webhook, `supabase functions delete billing`. Follow-up: purchase confirmation email (Art 8(7)) not built yet; blocker before live sales. |
| I-g | Bed prices until the Booking.com Demand API (I16) | Decided by you on 2026-11-04: option A, keep scraping Booking.com and Hostelworld, flagged as a known risk, with the safeguards in I16. Review before the Booking affiliate application in P4 (A or C). Reviewed by you on 2026-11-12 (T1213-h): A stays |
| I-b | For each scraped source, keep, replace with an affiliate or licensed feed, or drop (I3) | Decided 2026-11-12 by the owner: per source after the terms check in I3, written by W50. Google Flights stays scraped until a better source exists (owner tick T1052-a); beds follow I-g. |
| I-c | Local transport fare source (D10, T714-b) | Decided 2026-11-12 by the owner: a curated table approved in a session, not a paid API (D10). |
| I-d | Mobile route (I7, after I-R3) | Decided 2026-11-12 by the owner: stay a PWA through launch (I7); the store route (Capacitor or native) is chosen in February 2027 from I-R3. |
| F-b | Carta Intelligence: only F1, F6, F8 before launch, the rest after | Decided 2026-11-12 by the owner: yes: F1, F6, F8 before launch; F2 to F5 and F7 follow launch. |
| I-e | PRODUCT.md "takes no commission" wording (T461-d) | Decided 2026-11-12 by the owner: "Carta never sells you a ticket or a bed and never ranks by what it earns. Some links pay Carta a small fee at no cost to you." Written into PRODUCT.md (T1047-a). |
| J-a | Open beta in March for summer planners | Decided 2026-11-12 by the owner: yes. The open beta is the public opening on Tuesday 9 March 2027 (J-b). |
| J-b | Normal plan or fast track (section 4) | Decided 2026-11-12 by the owner: the fast track. Public opening Tuesday 9 March 2027 (W10), registration about 22 February (W8), campaign launch Tuesday 4 May 2027 (W18); dated runway in section 16. If the allowance or review time cannot carry 30 to 40 sessions a week the dates stretch toward the normal plan; the gates never move. |
| K-a | Launch market and language first (K1) | Decided 2026-11-12 by the owner: Belgium and the Netherlands in Dutch and English, then the UK. Walloon press stays out until French is added after launch (T1130-d). |
| K-b | Waitlist reward | Decided 2026-11-12 by the owner: a free Trip Pass at 3 referrals; at 10, a founding yearly price below 14.99 on Year Passes that account buys before 9 March 2028. The figure is set before 16 February 2027 from measured AI use per Year Pass, with at least EUR 2.00 net margin over worst-case cost (about EUR 13.99 on today's numbers); no price is shown on the waitlist page until it is set, and it is shown as the founding price without a crossed-out reference price. Each reward once per account; a referral counts when the friend confirms a different email address (double opt-in); Carta may withdraw a reward for abuse; the rules are written in the waitlist page terms. Rewards are granted once the paid Pass is live, from the public opening at the earliest. |
| N-a | Pause the hourly stays tasks and rotate the R2 token this week (N1, N3) | Decided 2026-11-12 by the owner: yes, now (N1, N3). |
