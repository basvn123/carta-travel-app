# Carta roadmap to production

Nov 4, 2026, @Bas. Launch: **Tuesday 4 May 2027** (week 19 of 2027), 26 weeks from today.

This file is the plan of record. It replaces `Roadmap/Carta roadmap.md` (Dutch, last updated 10-28). Every figure in it comes from a read-only audit of the repo on 2026-11-04.

Three things carry the most weight: **documentation** (every piece of logic written down and kept true), **security** (designed in, tested, never an afterthought) and **UI** (researched, tested with people, measured). The goal is a full-time product, not only a finished app, so Track I covers the business around it: onboarding, accounts, retention, money, support, growth and operations.

The full audit of the app as it is today, with every pain point, its evidence and its severity, is [docs/AUDIT-2026-11.md](docs/AUDIT-2026-11.md). Each pain point (`P-01` to `P-59`) is carried by an item below.

---

## 1. How to read this file

- **Fix now** (section 3) comes first: production breakage, security exposure and spinning jobs found by the audit. Items `N1` to `N8`, all this week or next.
- **Phases** (section 4) set the order of work: P0 to P5, each with a quality gate. Tracks say what; phases say when.
- **Eleven tracks**, A to K. Each track has the same six parts: Goal, Exit criteria, Research, Items, Item details, Depends on.
- **Pain point IDs** (`P-21`) point into [docs/AUDIT-2026-11.md](docs/AUDIT-2026-11.md).
- **Item IDs**: build items are `B3`, `C7` and so on. Research items are `B-R1`, `C-R2` and so on.
- **Build items** are done in Claude Code sessions. A session takes real task numbers (`T1045` onwards, CLAUDE.md "Task numbers") and names the item ID in its report.
- **Research items are yours.** Each has a question, starting points, a timebox and an output. The output is a note in `docs/research/` (template in section 2) that ends in a decision. A build item that depends on research waits until that decision is written. Claude can gather sources or summarise for you, but you make the call.
- **Size**: **S** is one session, **M** is a batch of 2 to 4 tasks, **L** is a phase of its own. Research timeboxes are in days.
- **Weeks** are ISO weeks. 2026 W45 starts Mon 2 Nov. W1 to W19 are 2027.
- **Status** per item: `todo`, `doing`, `done`. Update the tables as items move.

---

## 2. Research: how your own research fits in

**Rhythm.** Each track opens with its research items. About one day a week is research time (suggested: Fridays). Research for a track finishes before that track's first build item that depends on it.

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
| N2 | Publish `status.json` and add `status.json`, `.keep`, `_test` to the prune keep list in `scripts/r2/push-data.mjs`; make `--prune` list what it would delete and ask | 404 on every page view; the Nov 3 prune deleted `data/flights/` | `status.json` returns 200; a dry prune shows its list | next task | P-14 | done (T1056; owner publishes status.json, T1056-a) |
| N3 | Rotate the leaked R2 admin token (T291-b) and check R2 access logs | Anyone holding it can change or delete shipped data | Old token revoked, new one only in secrets | you | P-07 | todo |
| N4 | Bump `dompurify` (non-breaking); file jspdf 4 and maplibre 5/6 as C6 tasks | Three critical advisories in production dependencies | `npm audit --omit=dev` shows no critical that a minor bump fixes | next task | P-08 | done (T1053) |
| N5 | Clear account-tied `carta.*` stores on sign-out (or ask "remove this device's copy") | Bookings and companions stay visible on a shared device | Sign-out test passes on a real phone | next task | P-09 | done (T1054; real-phone check T1054-a) |
| N6 | Commit the flight-sweep deploy script under `scripts/`, deploy the half-speed night fix (T1043-a), check refusals by hour (T1043-b) | Google refuses the sweep 3 of 3 nights | Three clean nights | you (deploy) | P-16 | todo |
| N7 | Fix the lint error at `ExploreMap.jsx:911` (missing `collectKpins` dependency) | A real stale-closure bug on the main screen | `npm run lint` shows 0 errors | next task | P-45 | done (T1055) |
| N8 | Move the 6 closed rows out of `_OPEN.md`; close the migration rows T985 proved live (T034-a, T043-a, T265-a, T270-b, T281-b) | The register misleads every session | Rows moved with reasons | next task | P-56, P-58 | done (T1058) |

---

## 4. Phases and quality gates: the order of work

The tracks (sections 7 to 17) say **what** to build. The phases say **in which order**, and each phase ends in a gate that must pass before the next one starts its main work. The principle, confirmed by the research in [docs/research/2026-11-launch-plan-research.md](docs/research/2026-11-launch-plan-research.md):

1. **Depth before breadth.** The pages and flows marketing will point at (the marketing surface) become complete and clean first. Breadth across all 3,868 places and 17,619 trails comes after.
2. **Quality before traffic.** No campaign links to a page that fails the marketing surface gate. Google judges a site partly by its weakest pages, so pages below the bar stay `noindex,follow` until they pass.
3. **Marketing starts now and scales with the gates.** Low-risk work first (SEO plumbing, waitlist, building in public, research), deep links and campaigns only after the gate.
4. **The business is registered as late as sensible, and run without an accountant or lawyer.** Everything before registration is free to use and runs payments in Stripe test mode. You register as a sole trader in P4 (about week 13), a few weeks before money first flows. Legal and admin work is done by you, from official sources and templates, with deliberately simple choices that stay out of the hard legal areas (I1, I-R4, I-R5). Data licensing still starts now, because it can change the price engine.
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
| Register as a sole trader | W13 | W8 (about 22 February) | About two weeks before the first paid sale, as in I1 |
| Public opening (soft launch) | not in plan | W10 (about 8 March) | Open to everyone, paid Pass live; quiet: waitlist, communities, data stories |
| P4 Breadth and hardening | W11 to W16 | W6 to W14, alongside the public site | Breadth, the full security walk (C10, C11) and the external check run while real users arrive |
| P5 Campaign launch | W17 to W19 | W17 to W19 | Product Hunt, press, mid-May beach ranking, with real users and testimonials behind it |

**Conditions for the fast track.**
- **Your Claude allowance.** Check it after the first full week. Heavy sessions that build, test and check in the browser use a lot, so 30 to 40 a week may hit your plan's weekly cap. If it does, the fast track stretches toward the normal plan, and nothing breaks.
- **Your time.** At this pace you review and merge 5 to 8 results a day. With phone checks and owner steps, that is about 2 to 4 hours a day. It is the real speed limit.
- **Research cut to the essentials** (about 10 to 12 days instead of 37): G-R1, G-R3 with K-R1 (the interviews), I-R4, I-R5, C-R2, E-R1. The rest is optional or can follow launch.
- **Gates unchanged.** The marketing surface gate and the P4 checklist still have to pass before the public opening. If they do not pass, the opening moves; quality does not.
- **What speed does not shorten.** Search traffic still takes 6 to 12 months, so indexing starts in November in both plans. The beta needs 3 to 4 weeks with real people. Registration and Stripe verification take about 2 weeks. Scrapers must stay slow to avoid blocks.

Choose one with decision J-b in section 19.

### What happens in each phase

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
- Owner, early in P4 (week 13, about 29 March): register as a sole trader (I1), then switch Stripe to live and make one real purchase and refund (I2), and put the affiliate partner IDs live (I4). Allow about 2 weeks for the business number, VAT status and Stripe verification, so the latest safe week is 14.
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
| A1 | Top-level layout | Root and `continent-app/` root clean, MAP updated, tests and dry run pass (T1050: docs and stray folders archived; live code folders moved to A2; `Trips/` waits on A-a) | M | P0 | done |
| A2 | Pipeline structure | `run_pipeline.py` split by domain, flat files grouped, ruff on touched files | L | P4 | todo |
| A3 | Register triage | Under 250 open rows, owner rows in one procedure per system | M | P1 | in progress (T1072: 1,603 to 1,423 rows; T1072-a) |
| A4 | Claude context, lean and exact | Memory index under 5 KB with stale memories merged or removed; CLAUDE.md and MAP.md corrected and only pointing at files that exist; one entry path (CLAUDE.md, then MAP.md, then the handbook section, then the file); skills folder trimmed; a check that fails when MAP or CLAUDE names a missing path (T1051: memory index 15 KB to 3.7 KB, CLAUDE and MAP corrected, `scripts/docs/check_entry_points.py` plus the `entry-points` workflow; skills kept, since the project impeccable skill is the one in use; `continent-app/.git` removal stays an owner step, T1040-d) | S | P0 | done |

### Item details

**A1. Top-level layout**

```
README.md  CLAUDE.md  MAP.md  PRODUCT.md  DESIGN.md  ROADMAP.md  SECURITY.md
continent-app/      the app
pipeline/           all Python pipeline code (src/ingestion moves in)
supabase/  infra/   backend and build box (ops/*.sh moves to infra/backup/)
services/           FastAPI and MCP services (Track F)
evals/              golden sets, runners, results
docs/               see B2
Execution/          task reports and register
data/ app_data/ cache/ tools/   data and tools, never deleted
archive/            retired code and plans
```

| Action | Paths |
|---|---|
| Archived (done, T1050) | `Claude outputs/`, `additional docs/`, `Roadmap/`, `Execution/_queue/`, root `1.CARTA.md`, `PLAN.md`, `ROUTES.md`, `CARTA_TRAILS_BUILD_BRIEF.md`, `user_knowledge.md`, `continent-app/CARTA_*.md` (3), and every old doc in `docs/` (to `archive/docs-2026-11/`). Kept in `docs/` because code reads them: `SCHEMA.md`, `tos/data_licenses.md`, `REGIONS.md`, `LAKES.md`. `ARTICLE30.md` moved to `docs/legal/` |
| Not archived: still in use (moved to A2) | `pipeline/field_stubs/` (imported by `run_pipeline.py` and the trails worker), `pipeline/diagnostics/` (rating-tests workflow), `pipeline/oneoff/` (imported by `apply_new_gems.py`), `src/estimation/` (used by holiday ingestion), `ops/*.sh` (named by the secret-scan workflow) |
| Fold, then archive (waits on decision A-a) | `Trips/carta-unified/` (308 files): move what runs into `pipeline/trips/`, repoint `golden-set.yml` and `trip-validator.yml` |
| Untracked and ignored (done, T1050) | the 28 dated `reports/coverage_backlog_*.csv`. The rest of `reports/` stays tracked: `rating_reference_v5.json` is the frozen rating calibration. `continent-app/reports/` stays: it holds the performance baselines reports cite |
| Deleted locally (done, T1050) | `impeccable/` (17 MB copy), `.fastbuild/`, `dev/`, `.vercel/`, `bash.exe.stackdump`, empty `continent-app/screenshots/`, root `*.log` (3.3 MB), all `__pycache__/`. `logs/` stays: Task Scheduler runs `logs/run_*.cmd` and `logs/pipeline_state.json` is pipeline state |
| Review | 622 tracked files in `cache/` (git or R2?); `vercel.json` retired (T1067); `csp-hash.mjs` kept for the `_headers` script-src |

**A2. Pipeline structure**
- Split `run_pipeline.py` (74 tasks in one list) into `pipeline/tasks/<domain>.py`. `run_pipeline.py` keeps the CLI and imports the registry.
- Group the 89 flat files as A-R1 decides. One commit per folder.
- Add `pyproject.toml` with ruff and mypy, scoped to new packages first.
- Done check: `--dry-run` lists all 74 tasks, Python tests pass.

**A3. Register triage**
1. A script groups the 1,576 rows by area and age.
2. Each row becomes: still true, done already (closed with its task), won't do (closed with a reason), or folded into a roadmap item.
3. Owner rows (539) become one ordered procedure per system (Stripe, Supabase migrations, Dashboard, legal) in `Execution/_OPEN-<slug>.md`.
4. Rows are moved, never deleted.

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
| B3 | Logic catalogue | Every rule tagged with an ID in code, one catalogue entry per ID, two-way CI check | L | P2 to P3 | todo |
| B4 | Config reference | `_doc` on every key of `rating.json`, `pricing.json` and quality rules; tables generated | S | P3 | todo |
| B5 | Data lineage and diagrams | Per field: source, task, file; Mermaid diagrams of the pipeline and the request paths, generated | M | P3 | todo |
| B6 | Generated reference and docs site | pdoc, TypeDoc, task catalogue, OpenAPI, SQL tables; MkDocs site with search on private Cloudflare Pages | M | P4 | todo |
| B7 | Keep it true: drift checks and the task loop | Drift check per area, executable examples, link check, docstring floor, `carta-docs` skill and Stop hook, CLAUDE.md step | M | P3 | todo |
| B8 | Ask the docs | Search box on the docs site answers from the docs with citations (if B-R4 says go) | M | After | todo |

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
| C2 | Secrets and accounts | Inventory of every secret (where, who, rotation), rotation done for old ones, MFA on every owner account, recovery codes stored | S | P0 | in progress: inventory done (T1059), owner rotation open |
| C3 | Auth and access | Supabase auth settings per C-R3, admin behind MFA and role checks, session lifetimes set, admin actions audit-logged | M | P1 | in progress (T1071: code half; Dashboard is T1071-a) |
| C4 | Data access and RLS | RLS on every table proven by tests (exist, extended), service-role key never in the browser, storage and R2 access reviewed | S | P2 | in progress (T1078: all 34 tables fixtured, signed-out reads fixed, bundle key check; 063 is T1078-a. T1087: all 16 admin harnesses green to 064 and in CI, definer search_path test) |
| C5 | Web and API hardening | Strict CSP and security headers, CORS allow-list, input validation on every endpoint, durable rate limits (with H3), Stripe webhook signature check verified | M | P2 | in progress (T1079: headers, function guards, Edge CORS and body caps; T1090: no style-src 'unsafe-inline', CSP gate in CI; deploy and WAF are T1079-a, T1079-b) |
| C6 | Supply chain | Lockfiles enforced, `npm audit`, `pip-audit`, OSV in CI, Renovate or Dependabot, GitHub Actions pinned to SHAs, SBOM per release | S | P3 | done (T1080; gates on since T1088, first CI run unverified: T1080-c) |
| C7 | Static analysis | Semgrep or CodeQL on every PR, findings triaged to zero high | S | P3 | todo |
| C8 | AI security | OWASP LLM Top 10 mapped to Carta; guardrail module (E3) covers injection, output handling, excessive agency, data leakage; injection set in CI | M | P3 | in progress (T1117: `aiGuard` on Ask, plan-day, parse-booking; 50-attack set in `npm test`; OWASP map in the threat model. Live red team is T1117-a; suggest-city is T1117-b) |
| C7 | Static analysis | Semgrep or CodeQL on every PR, findings triaged to zero high | S | P3 | done (T1119) |
| C8 | AI security | OWASP LLM Top 10 mapped to Carta; guardrail module (E3) covers injection, output handling, excessive agency, data leakage; injection set in CI | M | P3 | todo |
| C9 | Privacy and GDPR | Data map (what personal data, where, how long), retention jobs, export and delete tested end to end, Article 30 current, a light DPIA for AI features | M | P3 | todo |
| C8 | AI security | OWASP LLM Top 10 mapped to Carta; guardrail module (E3) covers injection, output handling, excessive agency, data leakage; injection set in CI | M | P3 | todo |
| C9 | Privacy and GDPR | Data map (what personal data, where, how long), retention jobs, export and delete tested end to end, Article 30 current, a light DPIA for AI features | M | P3 | partly done (T1118: Article 30 current with a retention line per table, 069 retention sweep, export schema 4 and erase trigger tested end to end; legal review, paste and the AI DPIA open) |
| C10 | Security testing | ZAP baseline scan in CI against preview deploys; full ASVS L2 checklist walked and recorded | M | P4 | todo |
| C11 | External check and disclosure | `SECURITY.md`, `security.txt`, incident response for security events; an outside review or a structured self-pentest, then retest | M | P4 | todo |

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

**C5. Web and API hardening**
- CSP without `unsafe-inline` where possible, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`; verified with a header test.
- Every Pages and Edge Function validates input with a schema and returns generic errors.

**C6. Supply chain**
- Renovate (or Dependabot) with grouped weekly updates; auto-merge only for patch updates with green CI.
- GitHub Actions pinned to commit SHAs; workflow permissions set to read by default.

**C7. Static analysis**
- Semgrep rules for JS, Python and SQL plus a few Carta-specific rules (no `service_role` in `src/`, no raw SQL from user input, no Claude API imports).

**C8. AI security**
- Map each OWASP LLM Top 10 risk to Carta: prompt injection (booking emails, user questions), insecure output handling (rendering model text), sensitive data disclosure, excessive agency (no write tools), model denial of service (quotas, caps), supply chain (models).
- The controls are E3's guardrail module; this item adds the mapping, the tests and the doc `docs/security/ai.md`.

**C9. Privacy and GDPR**
- Builds on `docs/legal/ARTICLE30.md` and the existing GDPR export. Retention for logs, AI caches, Ask query logs, stays scrape data.

**C10. Security testing**
- ZAP baseline on each preview deploy, failing on high alerts.
- ASVS checklist in `docs/security/asvs.md`: each requirement marked met, not applicable, or gap with a register row.

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
| D1 | One machine-readable contract | A seeded bad value fails both pipeline write and app sync, with the field path | M | P3 | todo |
| D2 | Quality engine and scorecard | One engine, scorecard and 90-day trend per run, admin Data health panel | M | P3 | todo |
| D3 | Provenance and freshness per field | Every key block carries `_src` and `_asof`; sources registry generated | M | P4 | todo |
| D4 | Truth set | 150 items verified by hand, scored per release | M | P3 | todo |
| D5 | Scraper and source health | Yield, drift and staleness alerts reach admin and email | S | P1 | in progress (T1074: box steps T1074-c) |
| D6 | Coverage fairness | Parity table per country, region and language in `docs/data/` | S | P4 | todo |
| D7 | Trails and outdoor fill | Trail targets in the table met; display names cleaned; difficulty weighs climb and terrain, not length; mountains and lakes filled (P-21, P-30, P-36) | L | P1 | in progress (T1092: display names and per-day difficulty in code; rebuild is T1092-a; T1093: photo licence gate and paced harvest in code, the box run is T1093-a; T1094: walk recovery rules (article pairs, lone famous way, main line, reorder splice) and the Northern Ireland country fix in code, the box rebuild is T1094-a) |
| D9 | Place text and photos | Intros, guide text and galleries to target, French, Italian and UK first; POI descriptions; intros in six languages (P-23, P-24) | L | P2 (top 300), P4 | in progress (T1095: intro harvest built; T1096: gallery pass and POI description harvest built; runs are owner steps) |
| D8 | Sea temperature | `sea_temp` run, beaches re-exported, `climate.water_c` filled, beach strip draws (P-22) | S | P1 | code ready (T1097); box run T1097-a |
| D10 | Prices completed | Local transport fare table for 741 places; bed prices for the 515 missing places; "not yet measured" shown honestly (P-25, P-26) | M | P1 | in progress (T1075, T1114: notes on all five price screens; fares wait on T714-b) |
| D11 | UK crowds by month | ONS or VisitBritain regional visitor nights for GB, plus BA, FO, MD, XK (P-27) | S | P1 | doing (T1098: loader and task built; owner run pending) |
| D12 | Freshness and stamps | Every wire inside its limit; `generated_at` correct in `app_data.json` and all wires (P-29) | S | P1 | in progress (T1099: stamps, report and test done; refresh runs are owner steps) |
| D13 | Getting there mode choice | Mode picked by door-to-door time and cost; flights preferred above a distance; checked on 50 origin and destination pairs (P-31) | M | P1 | in progress (T1100: rule in code, 50-pair check on fixture fares; the run on the real sweep is T1100-a) |
| D14 | Licensed data sources | Aviasales Data API (Travelpayouts) supplies "from" fares where its coverage is good; Viator and Tiqets APIs supply activity prices; each source's licence recorded; scraped beds flagged as a risk until the Booking Demand API is reachable | M | P1 | probe built (T1112), owner run pending |

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

**D8. Sea temperature**
- Run the `sea_temp` task, re-export beaches, run `apply_climate`. Confirm the beach page strip draws.

**D9. Place text and photos**
- Harvest Wikipedia and Wikivoyage intros and guide text (FR 27%, RS 29%, IT 31% today), festivals, neighbourhoods.
- Gallery pass for GB (29%), RO, FR, IT. POI descriptions for must-see and recommended.
- Translate intros into the five other languages (I8).

**D10. Prices completed**
- Local transport: a curated single-ticket and day-pass table per city (owner picks the source, T714-b), 127 metros and 614 cities first.
- Beds: re-scrape the 515 missing places (FR 94, IT 77, GB 56, GR 40) once D5's parser fix lands; places with 2 or fewer observations flagged.

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
| E-R2 | Does a reranker pay off at Carta's scale and latency budget? | Workers AI reranker models, cross-encoder basics (Sentence-Transformers docs), MTEB reranking leaderboard | 1 day | Go or no-go and model for E2 |

### Items

| ID | Item | Done when | Size | Phase | Status |
|---|---|---|---|---|---|
| E1 | Ask eval gate | 200 labelled queries, metrics per retriever, gate in CI | M | P3 | todo |
| E2 | Retrieval upgrades | BM25 everywhere, reranker kept only if it wins, index built on the box | M | P4 | todo |
| E3 | One guardrail module | Same input, output and failure rules in every LLM function; injection set in CI | M | P3 | todo |
| E4 | LLM observability | Every call in `ai_model_events`; admin cost and latency panel; Ask query logs | S | P4 | todo |
| E5 | Prompt registry | Prompts versioned in files; a bump runs its eval | S | P4 | todo |
| E6 | Answer and cards agree | The places Ask's text names are exactly the cards it shows, enforced in the verifier; the failing live query is in the golden set (P-35) | S | P1 | done (T1101) |

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

**E3. One guardrail module**

| Stage | Rule |
|---|---|
| Input | Length caps, PII scrub, user text and retrieved notes wrapped and labelled as data (parse-booking's pattern, copied to plan-day, suggest-city, Ask) |
| Output | Schema validation always (grounded suggest-city gets a validator), every place id in the catalogue, every number traced to input, banned terms and no dashes |
| Failure | Retry once, next model in the chain, then a rule-based or cached answer; never an empty screen |

- Shared code in `supabase/functions/_shared/guard/` and `continent-app/functions/_lib/guard/`. `evals/injection/`: 40 adversarial inputs in CI. Security mapping in C8.

**E4. LLM observability**
- One `ai_model_events` row per call (today only plan-day logs). Admin panel: cost per day, p50 and p95 latency, failure rate. Ask query log hashed, 30-day retention, thumbs up and down.

**E5. Prompt registry**
- `prompts/<function>/vN.md` with a changelog; a version bump runs that function's eval.

**E6. Answer and cards agree**
- Live example: "quiet lake with good walks in June under 120 a day" named Castel di Tora in the text and showed Esztergom as a card. The verifier rejects an answer whose named places differ from its cards.

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
| F1 | Travel taxonomy and tagging | ESCO, extreme multi-label skill extraction | Retrieval, classification, calibration | Every place tagged, P@5 and F1 reported on 400 labelled items | L | P3 | todo |
| F2 | Distilled tagger | ConTeXT-match, JobBERT V2 | PyTorch, HF Transformers, Sentence-Transformers, contrastive learning, ONNX | Student within 3 F1 points of teacher at under 1% of the cost; on the HF Hub | L | After | todo |
| F3 | Taste profile with validation | Employee skill validation, acceptance rate | Human in the loop, explainability | Chips with evidence on My trips, acceptance rate tracked | M | After | todo |
| F4 | Place linking | Job-title normalisation | Entity linking | MRR and accuracy@1 on 300 messy mentions | M | After | todo |
| F5 | Intelligence API | API-first data layer | FastAPI, Pydantic, OpenAPI, Docker, tests | Service on the box, pipeline calls it in batch | M | After | todo |
| F6 | Eval and LLMOps platform | Eval-driven development | Golden sets, LLM-as-judge, tracing | One runner for all evals; plan-day judge with kappa reported; Langfuse traces | M | P3 | todo |
| F7 | Carta MCP server | MCP, agents and workflows | Tool design | Read-only tools usable from an MCP client | S | After | todo |
| F8 | Responsible AI | Fair, transparent AI, EU AI Act | Fairness, documentation | Public AI page, model cards, parity table | S | P4 | todo |

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
- One runner and results format for every eval; dashboard page in the docs site. Plan-day LLM-as-judge calibrated on 40 human-rated plans with Cohen's kappa. Self-hosted Langfuse on the box.

**F7. Carta MCP server**
- `services/mcp/`: read-only tools (search places, place facts, price a trip, list trips). No write tools. Added to the threat model.

**F8. Responsible AI**
- Public "How Carta uses AI" page; model cards for the tagger and Ask; D6 parity table.

**Depends on.** E1 and F6 (eval runner), D1 (contract for new fields), C1 (threat model for new services).

**Owner decision F-a.** The JD names AWS Bedrock; CLAUDE.md keeps runtime AI on Gemini and forbids any Claude API use. Option: an offline-only experiment with non-Anthropic Bedrock models on the F1 eval set, never in the app.

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
| G1 | Design direction | G-R1 to G-R3 turned into a direction doc and carta-design skill update, approved by you | S | P1 | in progress (T1111: `docs/design/direction.md` drafted, waiting on owner sign-off T1111-a; skill update T1111-b after it) |
| G2 | Shared parts that exist once | `PlaceHead`, `PhotoCarousel`, `Chip` tones, `Button href` used everywhere; T1024-b/c, T1027-c, T1039-b closed | M | P2 | todo |
| G3 | Umber cost card as signature | One component in Explore card, place page, plan tab, receipt; T1026-c closed | M | P2 | todo |
| G4 | Core flow fixes from research | The top problems from G-R3 fixed in Explore, place page, plan flow and trip page | M | P2 | todo |
| G5 | Motion system | Shared springs for sheets, tabs, figures, card-to-place photo move; reduced motion shows the end state | M | P2 | todo |
| G6 | Type and radius debt | Literal font sizes and radii on the scale, legacy aliases removed | M | P2 | todo |
| G7 | Breakpoints and CSS consolidation | 4 width tokens, v6 override layer folded in, big files split, dead-selector check, `!important` halved | M | P2 | todo |
| G8 | Imagery gaps | Photo share on walks above 60%, styled map thumbnails instead of grey tiles | M | P2 | todo |
| G9 | Trust made visible | "Why this place" chips (F1), "checked on" dates (D3), confidence in words | M | P4 | todo |
| G10 | Accessibility audit | WCAG 2.2 AA audit with screen readers, every failure fixed | M | P2 (surface), P4 | todo |
| G11 | Quality gates and usability retest | axe-core, Lighthouse CI, bundle budget, visual baselines for 10 screens at 390 and 1440; 5-person retest of core flows; one real-phone pass per release replaces the 49 per-task phone rows | M | P4 | todo |
| G13 | Trail cards and trail links | Cards show time and climb next to length; trail pages get their own URL like places; display names from D7 (P-36, P-37) | S | P1 | done T1102 (open items in the register) |
| G12 | Onboarding and a shorter plan flow | First plan in 5 screens or fewer (12 today); a priced draft after 3 answers; Explore's start dialog inline and dismissible; sample trip on an empty Plan home (P-33, P-34, P-46) | M | P1 | in progress (T1103: shorter plan flow done; Explore start dialog and sample trip open, rows T1103-a, T1103-b) |

### Item details

**G1.** One doc, `docs/design/direction.md`, plus an update to `.claude/skills/carta-design/SKILL.md`. The carta-design skill stays the top design source.

**G2.** Today the place head is built 3 times, carousels 4 times, external link buttons 3 times. One component each in `src/components/ui/`, added to the styleguide.

**G3.** End the arc vs no-arc split. Figures on `--text-amount` with tabular numbers.

**G4.** Scope comes from G-R3. Each fix is checked with the same task that found it.

**G5.** `motion` is used only on Home today. Tokens from `--dur` and `--ease`. Check INP before and after.

**G6.** Codemod 1,740 literal font sizes and 775 literal radii; remove legacy aliases (4,638 uses).

**G7.** Replace about 15 widths and the 768/769 split with 560, 768, 1024, 1440. Fold files 60 to 69 into domain files, split files over 2,500 lines, coverage-based dead-selector report. Finish the 1440 and 1920 checks (T1041-b).

**G8.** A photo source for routes and things to do (22% of walks have a photo today, T1033-a, T1032-b). Map thumbnails in brand colours.

**G9.** Chips explain why a place fits, with evidence. Dates where honesty needs them. Six languages.

**G10.** Keyboard, focus order, contrast, 44 px targets, screen reader labels, reduced motion. Results in `docs/design/a11y-audit.md`.

**G11.** Gates block regressions on every PR. The retest uses the G-R3 tasks so the results compare.

**G12.** Today: "Start planning", then a choice that is already made, then 10 steps. Skip the choice when no trip is in progress; merge steps the free-text box already answers; show a priced draft early and let the rest refine it. Explore's "What matters most" dialog becomes an inline prompt, and its seen-flag follows the account. Measure time to first plan before and after (G-R3 tasks).

**G13.** Trail tiles today show only difficulty and length. Add walking time and climb. Opening a trail sets `#trail=<id>` so it can be shared, bookmarked and reached with Back.

**Process.** `impeccable` critique and the `taste-skill` look-and-fix loop per screen; the seven carta-design questions before shipping.

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
| H3 | Durable rate limiting | Limits for ask, flights, stays hold across isolates | S | P3 | todo |
| H4 | Load tests | k6 at 10x launch traffic, p95 under budget, report in docs | M | P4 | todo |
| H5 | Backups and restore drill | Nightly encrypted `pg_dump` to R2, 30-day retention, timed restore written up | S | P3 | todo |
| H6 | Owner gates cleared | Unapplied migrations (022, 029, 030, 031 and the rest), Stripe live setup, secrets, Dashboard steps | M | P3 | todo |
| H7 | Pipeline unattended on the box | Every scheduled task with manifest, retries, D2 gate before publish, failure alert; two clean weeks | M | P3 | todo |
| H8 | SLOs and incident drill | Uptime, error rate, p95 per API, freshness on one panel; one drill written up | S | P4 | todo |
| H9 | Every pipeline task on a schedule | Monthly and quarterly tiers run on the box; the box pushes `pipeline_state.json` and a freshness report to R2 after each run (P-15) | M | P1 | done (T1107; owner enables the timers on the box, T1107-a) |
| H10 | No laptop-only steps | Ask index, stays scrape, guided search, trails lab and trip promotion run on the box or the worker; the trails lab dump is in R2 (P-17) | M | P3 | todo |
| H11 | One scripted ship and a stable toolbox | `ship` script that stops on any failed step; css-routes check in `npm test`; `PYTHONUTF8=1`; a worktree script that handles junctions; stale `continent-app/.git` removed (P-18, P-19) | M | P3 | todo |
| H12 | Fast first load and self-hosted images | Entry chunk under 150 KB gzip (224 today); DestinationsTab, DestinationPage, AccountPanel and planner screens lazy; CSS split by route; own AVIF and WebP images live (P-11, P-41) | M | P1 | todo |
| H13 | Errors that stay local | Error boundary per tab; the 107 silent catches reviewed, data errors show a visible state (P-42) | S | P1 | done (T1106; owner look pending) |
| H14 | Code health | DestinationsTab and DayPlannerTab split; App overlays into a shell; 18 dead files removed; finder TripPage renamed; react-refresh warnings quieted (P-43, P-44, P-45) | M | P4 | todo |

### Item details

**H1.** 11 workflows exist, but none runs `npm run ci`. Add `ci.yml` (app) and `python.yml` (ruff, mypy scoped, pytest). Protect `main`.

**H2.** Free tier, EU region, source maps uploaded on deploy, PII scrubbing on.

**H3.** Cloudflare rate-limit binding or a Durable Object. Today limits live in memory per isolate.

**H4.** Scripts in `tests/load/` for ask, flights, stays, static wire.

**H5.** Replace manual `ops/backup_supabase.sh` with a scheduled job; restore into a scratch project.

**H6.** One ordered owner procedure from A3. Only you can do these steps.

**H7.** Builds on the existing Hetzner box and Task Scheduler runs.

**H8.** Builds on the existing uptime workflow and `INCIDENT_RUNBOOK.md`.

**H9.** Today 50 of 74 tasks are due in the local state and the box runs the weekly tier only (T048-h); its own state is never pulled back (T740-b). Schedule the 28 monthly and quarterly tasks, push state and freshness to R2, show them in the admin Data health panel (D2).

**H10.** Install `requirements-ml.txt` on the box or the CAX41 worker so the Ask index builds there; move the stays scrape off the laptop; trails lab PostGIS and trip promotion into the worker job.

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
| I1 | Late registration and do-it-yourself legal | From I-R4 and I-R5: registered as a sole trader in week 13 (14 at the latest), VAT status chosen, Imprint with the business number published; terms, privacy, withdrawal waiver, disclosure and accessibility statement written from official templates and checked against the `docs/legal/` checklist; trademark searched in TMview; the simplifications below applied (P-01, P-05) | M | P3 (prepare), P4 (register) | todo |
| I2 | Payments live | P3: everything built and tested in Stripe test mode (Prices tax inclusive, webhook, Terms URL, refund path). P4, after registration: live keys, one real purchase and refund on a phone; `REFUND_SOP.md` corrected (P-02, P-50) | M | P3 (test), P4 (live) | todo |
| I3 | Data source licensing | Terms checked for Booking, Hostelworld, Google Flights, Xotelo, Ferryhopper, OpenSky; each source cleared, replaced by an affiliate or licensed feed, or dropped (P-03) | M | P1 | in progress (T1091: credit audit done; terms decisions open) |
| I4 | Affiliate programmes | Travelpayouts (Kiwi, Tiqets, Airalo, DiscoverCars, Aviasales data) and Omio now; Viator and GetYourGuide in P3; Booking.com (CJ) and Hostelworld (Partnerize) on the public preview in P4; SafetyWing or Airalo after launch; IDs set; revenue in admin (P-04) | S | P0 to P4 | todo |
| I5 | Accounts that keep your work | Device trips, kept trips and day plans move to the account on sign-in ("3 trips moved"); Apple sign-in and magic link (P-47) | M | P1 | in progress (T1104: sync built and tested, migration 065 paste and the two-device check are owner steps; the moved notice, Apple sign-in and magic link open) |
| I6 | Retention email | Resend secrets and the 060 cron live; welcome, "your trip is in 30 days" and price-drop emails; unsubscribe and preferences (P-48) | M | P3 | todo |
| I7 | Mobile app | Checkout and offline trip checked on real iOS and Android; route from I-R3 built (Capacitor wrap with push, or a polished PWA); store listings live (P-49) | L | P4 (PWA), store After | todo |
| I8 | Six complete languages | 525 missing keys filled per locale; key-parity test in CI; browser language on first visit; place intros translated; display currency choice (P-40) | M | P3 | todo |
| I9 | Support and trust | support@ mailbox with SPF, DKIM and DMARC; contact switched from the personal Gmail; About page; accessibility statement (EU Accessibility Act); feedback loop approved and running (P-51) | S | P1 | partly done (T1108: Help and contact page, FAQ, status line; mailbox, About and accessibility statement open) |
| I10 | Business operations, kept yourself | `infra_ledger` live; simple self-kept books (income from Stripe and affiliate reports, costs from invoices) in one sheet with a monthly 30-minute routine; a calendar of yearly tax and social dates from I-R4; cost per active user in admin; Hetzner backups on (P-06, P-55) | S | P3 (prepare), P4 (start) | todo |
| I11 | Product analytics | Consent-free weekly cohorts (returning accounts, trips saved, plans priced), funnel from first visit to saved trip, a server-side experiment flag in `site_config` (P-52) | M | P2 | todo |
| I12 | Growth | Language in the URL (`/nl/...`) with prerender per language; per-page share images for places and trips; newsletter; referral link (P-53) | M | P2 | todo |
| I13 | Content operations | An admin editor for place facts, photos and text that writes overrides the pipeline respects; audit trail per edit (P-54) | M | After | todo |
| I14 | Where the paywall meets the journey | One designed moment and copy for the Pass (what is free, when the offer shows, what it unlocks), tested in the closed beta; no dead ends | S | P3 | todo |
| I15 | Affiliate links done right | `rel="sponsored noopener"` on every partner link; a small "partner link" mark and a disclosure page; links only after Carta's own figure, one door per cost line, never sorted by commission; cookieless click counting; no partner scripts (so no cookie banner); PRODUCT.md wording decided (I-e); checked against the I-R5 legal checklist | S | P3 | todo |
| I16 | Data access ladder | Each commercial data source has a written legal route, the milestone that unlocks the next step (users or bookings), and a date; Google Flights scraping stopped before the first paid sale; the bed decision (I-g) reviewed before the Booking.com affiliate application; milestones tracked in admin (K12) | M | P1 to P4, then ongoing | todo |

### Item details

**I1.** All owner work, without an accountant or lawyer, by your choice. The procedure lives once in `Execution/P15/_OPEN-business-launch.md` (created under A3).

- **Why week 13.** Building, a free beta, the waitlist and opening affiliate accounts need no registration. Taking money does: a paid Pass, or affiliate commission paid out to you. Registering in week 13 leaves about two weeks for the business number, VAT status and Stripe's verification, and two weeks of buffer before the 4 May launch. Confirm in I-R4 exactly where Belgian rules draw the line.
- **Simplifications that keep you out of the hard legal areas.** Each one replaces a question the register had parked for a lawyer:
  - Sell only one-off passes. Make the yearly plan a 12-month pass that does not renew automatically. This removes the subscription renewal rules entirely (T460-b, T461-e).
  - Use the EU's standard model wording for the digital-content withdrawal waiver at checkout (T032-e).
  - Write the privacy policy and processing records from the APD/GBA templates. `docs/legal/ARTICLE30.md` already exists.
  - Use links-only affiliates with clear disclosure and no tracking scripts, so no cookie banner is needed (I15).
  - Resolve the commission contradiction with the I-e wording (T461-d).
  - Run the trademark check yourself in TMview. Register the mark later, if ever.
- **What you accept.** Without a professional review, a mistake is yours to find and fix. Every legal text lists its official sources, and section 19 records the decision, so the choice is visible. If revenue grows, a one-off review later stays an option.
- **Register rows this retires.** T015 and T033-g (the accountant's VAT answer) are replaced by I-R4. The lawyer-review rows are replaced by I-R5 and the checklist. Close them in A3 with this reason.

**I2.** Follows `Execution/P2/_OPEN-stripe-launch.md` and `Execution/P11/_OPEN-pass-subscription.md`. Test from the installed app on a real phone (T246-c).

**I3.** The highest business risk after I1. For each source: terms read, risk written, decision recorded as an ADR.

**I4.** Affiliates add roughly 8 to 15 EUR per 1,000 visitors against about 170 EUR from the Pass (an assumption, research file section 4): useful, never the main business. Booking.com needs a live site with content, so apply on the public preview.

**I14.** The roadmap review found no item that designs the paid moment; this is it.

**I15.** Plain decorated links set no cookie on Carta's domain; partner widgets would force a consent banner. EU guidance requires the disclosure before the user clicks.

**I16. Data access ladder.** The best legal data is earned with traffic: partners open their feeds to sites that already send them customers. So Carta climbs in steps. Terms change, so each step is re-checked when it is reached (sources: research file, section 4).

| Data | Today | Legal route | Unlocks when | Step |
|---|---|---|---|---|
| Flight fares | Scraped from Google Flights (no API since 2018, so no legal route) | Aviasales Data API via Travelpayouts: cached fares from real searches, meant for static pages | Free signup, now | **P1**: measure coverage on the 10,094 routes; switch where coverage is good. **Before the first paid sale** (P4 week 13, or week 8 on the fast track): stop scraping Google Flights |
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

**I5.** Today the device trip only shows in `SavedTripsPanel.jsx` and kept trips stay on the device. On `SIGNED_IN`, upload and merge, then clear the device copy (pairs with N5).

**I6.** `supabase/functions/notify` exists. Lifecycle content follows I-R1.

**I8.** 136 of the missing keys are traveller-facing (wizard 49, trip 38). Editorial text is English only today.

**I11.** Keep the current no-identifier, no-consent approach: counters per week, not per person.

**I13.** Today only a developer can add or fix a place. Admin overrides (migrations 018, 043) are the base.

**Depends on.** I-R4 and I-R5 before I1; I1 (registration) before I2 goes live and before affiliate IDs go live (I4); I3 before relying on scraped data commercially; I5 pairs with N5; G12 uses I-R1.

---

## 16. Track J: launch

**Goal.** Go live on 4 May 2027 with the business in place (Track I), a tested beta and a frozen, rollback-ready build.

**Exit criteria.** The production-ready checklist (section 18) is all ticked.

### Items

| ID | Item | Done when | Size | Phase | Status |
|---|---|---|---|---|---|
| J1 | Launch sign-off | Registered (I1), payments live (I2), sources cleared (I3); terms and privacy final against the `docs/legal/` checklist; AI page live (F8); Article 30 current (C9) | S | P4 | todo |
| J2 | Performance and SEO | Prerendered place pages within G11 budgets, sitemap, structured data | S | P4 | todo |
| J3 | Beta fixes | Closed and open beta run in K9 (50, then open); plan completion, Ask withdrawal rate and taste acceptance measured, two fix weeks | M | P3 to P5 | todo |
| J4 | Launch metrics and outreach | `LAUNCH-METRICS.md` live, outreach from `LAUNCH-OUTREACH-DRAFTS.md` | S | P5 | todo |
| J5 | Freeze and go live | Fixes only from W18, full deploy procedure, rollback tested, launch 4 May | S | P5 | todo |

**Depends on.** All other tracks.

---

## 17. Track K: marketing

**Goal.** People who would love Carta find it, try it and tell others, without paid ads. Every campaign points at pages and flows that already pass the marketing surface gate (section 4).

**The constraint.** A visitor is worth about 0.17 EUR (`archive/docs-2026-11/GTM-ACQUISITION-CONSTRAINT.md`), so paid search, paid social, influencer fees and sponsorships are out. The budget is engineering and writing time. Carta's edge is data nobody else publishes: real daily costs for 3,868 places, 17,619 rated trails, bathing water and crowds by month.

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
| K1 | Positioning and brand basics | One-page positioning (from K-R1), launch market and language, name check (EUIPO), social handles, a press-ready logo and screenshots | S | P0 | in progress: draft done (T1060), owner decisions open |
| K2 | SEO plumbing and the page quality gate | Prerender and canonical live; `indexable` field from the pipeline; pages below the bar `noindex,follow` and out of the sitemap; sitemaps split by page type; hubs indexed; structured data; weekly Search Console review | M | P1 | in progress (T1076 bar, T1113 bars for every kind; owner decision 1 kept 337 places; upload is an owner step, T1113-a) |
| K3 | Waitlist and newsletter | Waitlist on Home with double opt-in and a referral jump (3 referrals = a free Trip Pass, 10 = a founding yearly price); a monthly "best-value places" newsletter | S | P0 to P1 | partly (T1110: double opt-in capture built; referral jump and newsletter issue 1 open) |
| K4 | Build in public | A weekly post (pipeline, data, design, AI engineering) on LinkedIn and one other channel; a public changelog page | S, ongoing | P0 onwards | todo |
| K5 | Data stories | Europe Cost Index 2027 with a methodology page and a local angle per country; Sunshine Saturday release on Sat 2 Jan 2027; a June "quiet clean beaches" ranking | M | P2, P4 | todo |
| K6 | Community presence | Regular, useful answers with real numbers in 3 or 4 communities; occasional data posts with no link; mods contacted first | S, ongoing | P2 onwards | todo |
| K7 | Shareable assets | "Europe on 100 EUR a day" map, "cheapest week" calendar per place, shareable trip receipt image | M | P3 | todo |
| K8 | Open dataset and Show HN | A CC-BY subset (licences checked) on GitHub with a write-up; Show HN once the free part needs no signup | S | P3 | todo |
| K9 | Beta programme | Closed beta of 50 from the waitlist (P3), open beta in March for summer planners (P4); feedback loop into the register; testimonials collected with consent | M | P3 to P4 | todo |
| K10 | Press kit and list | A press page (facts, screenshots, methodology, contact); a list of about 40 BE, NL and UK travel and data journalists and newsletters | S | P2 to P3 | todo |
| K11 | Launch campaign | Product Hunt on 4 May, waitlist email, courtesy notes to the credited bodies (`archive/docs-2026-11/LAUNCH-OUTREACH-DRAFTS.md`), community posts, mid-May beach ranking; a two-week plan with owners per thread | M | P5 | todo |
| K12 | Marketing measurement | Cookieless channel counts (UTM to the existing counters), Search Console per page type, waitlist and referral funnel, one weekly marketing number in admin; the I16 unlock numbers (monthly users, affiliate clicks and bookings per partner) | S | P0 to P1 | partly done (T1109: channel counts built, migration pending) |
| K13 | The creative slot | One experiment every two weeks from P2, picked from K-R3's shortlist; each written up in one paragraph (idea, what it took, what it did) | S each | P2 onwards | todo |

### Item details

**K2.** The research found Google uses site-wide quality signals, so thin generated pages can pull down good ones. Today about 1,800 places and about 450 trails would pass the bar in the research file (section 2). Pages promote automatically as data work (D7, D9) lifts them over the bar. Pause new batches if "discovered, not indexed" passes about 30%.

**K3.** Show HN does not allow waitlist-only pages, so the free part (map, place pages) stays open and the waitlist sits in front of planning features until the beta.

**K5.** Post Office's yearly holiday barometer and the Backpacker Index earn press every year with the same simple basket and a local angle per country. Carta's basket is bed, food and getting there, per place, per month. Pitch the Belgian angle to Flemish and Walloon press first.

**K13.** Room for creativity, on purpose. Candidates from the research: the quiz, Shorts ("what 50 EUR buys in X vs Y"), an embeddable cost widget, tourism board data swaps, a "five apps vs Carta" video, map art from trail data, a monthly hidden-trail list. A rule protects it: an experiment whose landing page fails a phone check is postponed, not shipped.

**Calendar at a glance.**

| Month | Marketing |
|---|---|
| Nov | K1, K3 waitlist, K4 weekly posts, K12, K-R1 interviews, K2 plumbing |
| Dec | K2 gate live, newsletter issue 1, Cost Index built, Sunshine Saturday release drafted, K10 list |
| Jan | Release on Sat 2 Jan, second push at the end of January, K6 community posts, creative slot starts |
| Feb | K8 open dataset and Show HN, K9 closed beta, widget beta for 10 bloggers |
| Mar | Open beta for summer planners, cheapest-week calendar for Easter and May, Shorts series |
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

| ID | Question | Recommendation |
|---|---|---|
| R-a | Approve this file as the plan of record and archive `Roadmap/` | Yes |
| R-b | One research day a week (Fridays) as the rhythm | Yes |
| F-a | Offline Bedrock experiment with non-Anthropic models (needs an AWS account) | Yes, offline only |
| H-a | Sentry and Langfuse as new services (EU options; Langfuse self-hosted) | Yes |
| C-a | Who does the external security check in C11 | A security-minded peer or a structured self-pentest |
| A-a | `Trips/carta-unified/`: fold into `pipeline/trips/` or archive with its two workflows | Fold what runs, archive the rest |
| B-a | Docs site private or public | Private first, public after the C10 checks |
| I-a | Business set-up (I1) | Decided by you on 2026-11-04: sole trader, registered as late as sensible (week 13, 14 at the latest), no accountant, no lawyer; legal and admin done yourself from official sources (I-R4, I-R5) |
| I-f | Yearly plan as a non-renewing 12-month pass | Yes: it avoids the auto-renewal rules that would otherwise need legal review |
| I-g | Bed prices until the Booking.com Demand API (I16) | Decided by you on 2026-11-04: option A, keep scraping Booking.com and Hostelworld, flagged as a known risk, with the safeguards in I16. Review before the Booking affiliate application in P4 (A or C) |
| I-b | For each scraped source, keep, replace with an affiliate or licensed feed, or drop (I3) | Decide per source after the terms check |
| I-c | Local transport fare source (D10, T714-b) | A curated table you approve, not a paid API |
| I-d | Mobile route (I7, after I-R3) | Decide in February |
| F-b | Carta Intelligence: only F1, F6, F8 before launch, the rest after | Yes: F1 gives travellers better filters and "why" chips; F2 to F5 and F7 are skill-building that can follow |
| I-e | PRODUCT.md "takes no commission" wording (T461-d) | "Carta never sells you a ticket or a bed and never ranks by what it earns. Some links pay Carta a small fee at no cost to you." |
| J-a | Open beta in March for summer planners | Yes |
| J-b | Normal plan or fast track (section 4) | Fast track if your first full week shows the Claude allowance and your review time can carry 30 to 40 sessions a week; otherwise the normal plan |
| K-a | Launch market and language first (K1) | Belgium and the Netherlands in Dutch and English, then the UK |
| K-b | Waitlist reward | Free Trip Pass at 3 referrals, founding yearly price at 10 |
| N-a | Pause the hourly stays tasks and rotate the R2 token this week (N1, N3) | Yes, now |
