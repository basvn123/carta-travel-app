# The next 50 sessions (from 2026-11-06)

Fifty Claude Code sessions, in the order to run them. Each row is one task. Its task number is reserved here, so parallel sessions never collide.
- Read `_HANDOVER-2026-11-05.md` first.
- The plan of record stays `ROADMAP.md`; every row names its item.
- **Gate** names an owner decision or step the session needs. A gated session either waits, or does only its ungated half and says so.

## Rules for running many sessions

1. **Base.** Merge PR #10 first. Every session then branches from `main` (`p15-<slug>`), or runs inside a batch branch.
2. **Task numbers.** T1085 to T1134 are reserved, in the order below. A session uses its own number and letters (`T1090-a`) for register rows. It does not take a new number.
3. **Migrations.** The next free number is **065**. Sessions that write migrations (S03, S20, S33, S34) run one after another, never in parallel. Each takes the next free number at its start.
4. **Shared files.** Two sessions in the same wave must not touch the same files. The "Files" column says where each one works. `Execution/_OPEN.md` changes in every session:
   - run as a batch, the batch lead adds the rows at merge;
   - run as separate sessions, append rows only and rebase before merge.
5. **Batches.** Running a wave as one batch (one branch, subagents in worktrees, one end check, one PR) is cheaper than separate sessions. That is how T1068 to T1084 ran.
6. **Worktrees.** Each full worktree is about 1.5 GB, and the disk had 38 GB free. Keep at most six at once, and remove each when its branch is merged. Unlink the `node_modules` junction with `cmd /c rmdir` before you remove a worktree.
7. **Never** use the Claude API, write em dashes, deploy without the owner asking, apply a migration live, or touch `cache/`, `continent-app/public/` (except generated data a task owns) or `tools/` destructively.
8. **Done means** a report from `_TEMPLATE.md`, register rows, the HANDBOOK section if behaviour changed, the ROADMAP status set, green checks, and the end check on the screens touched.

## Prompt template for one session

```
Task T{n} ({roadmap item}; register rows {ids}). Read CLAUDE.md, MAP.md and
Execution/P15/_HANDOVER-2026-11-05.md, then the row for S{nn} in
Execution/P15/_NEXT-50-SESSIONS.md. Branch p15-{slug} from main.
Scope: {scope}. Files: {files}. Do not touch files outside them; anything
outside becomes a register row. Done when: {done}. Report
Execution/P15/T{n}-{slug}.md from _TEMPLATE.md, register rows in the same
commit, checks per CLAUDE.md, end check on {screens}.
```

## Wave 1: finish today's open threads (small, no owner gate, parallel-safe)

| S | Task | Item (rows) | Scope | Files | Model | Done when |
|---|---|---|---|---|---|---|
| 01 | T1085 | B2 (T1073-a) | Rewrite REGIONS.md and LAKES.md in place from the code, plus the stale core docs (pipeline, coverage, joins, trails, beaches, mountains, photos, backup) | `docs/` | Sonnet | Each doc matches the code; the entry-point check passes |
| 02 | T1086 | B2 (T1073-b, T1073-f) | Backup and restore, refund and incident runbooks, verified against the scripts | `docs/runbooks/` | Sonnet | Three runbooks with commands that exist |
| 03 | T1087 | C4 (T1082-a, T1078-b) | Update the stale admin harness assertions to migrations 052 to 064 and add them to CI; a test that every SECURITY DEFINER function pins search_path | `supabase/tests`, `.github/workflows` | Opus | Harnesses green in CI |
| 04 | T1088 | C6 (T1080-b, T1080-d, T1080-c) | Bump the 12 flagged Python pins, clear the dev-tree npm highs, bump trailslab's maplibre; make pip-audit and OSV gates; fix the first supply-chain.yml run | `constraints.txt`, `requirements*.txt`, `tools/trailslab/review/package*.json`, `.github/workflows/supply-chain.yml` | Sonnet | supply-chain.yml green, with gates on |
| 05 | T1089 | A3 (T1083-a, about 45 rows) | Refresh or retire the stale `verify_*.mjs` harnesses whose selectors left the app; close their rows | `continent-app/scripts/verify_*.mjs` | Sonnet | Every remaining harness passes on the dev server |
| 06 | T1090 | C5 (T1079-c, T1079-e) | Remove `style-src 'unsafe-inline'` (hashes or a nonce for React style attributes and MapLibre); run `verify_csp.mjs` in CI | `public/_headers`, app style call sites, `.github/workflows` | Opus | No CSP violation on any screen; CI runs it |
| 07 | T1091 | I3 (T1084-a) | Credit NASA JPL MUR SST in the Data sources screen; audit every ledger row's "attributed" column against what the app shows | `src/data/attribution.js`, `src/ingestion/core/registry.py` | Sonnet | Every row that requires credit is credited in the app |

## Wave 2: P1 roadmap items (the launch path)

| S | Task | Item | Scope | Files | Model | Gate | Done when |
|---|---|---|---|---|---|---|---|
| 08 | T1092 | D7 | Trail display names (strip route codes, transliterate, shorten, keep the source name) and difficulty from climb, `sac_scale` and length per day | `pipeline/trails/`, trail wire | Opus | None | A flat 286 km path reads "long", not "very hard"; tests |
| 09 | T1093 | D7, K2 (T1076-c) | Trail photo harvest per country (DE, IT, GB, FR worst first) with a licence field on the wire image | `pipeline/trails/`, `docs/SCHEMA.md` | Sonnet | Network run of hours | The trail image carries a licence; coverage before and after |
| 10 | T1094 | D7 | Recover the 8,893 `way_only_not_derived` walks; check country assignment (for example Grote Rivierenpad) | `pipeline/trails/` | Opus | Box or a long laptop run | Walks recovered, counted |
| 11 | T1095 | D9 | Wikipedia and Wikivoyage intros for the top 300 places in FR, RS and IT, grounded and checked | `pipeline/` intro harvest, master | Sonnet | Network run | Intro coverage per country before and after |
| 12 | T1096 | D9 | Gallery pass for GB, RO, FR and IT; POI descriptions for must-see and recommended | `pipeline/photos/`, POI layer | Sonnet | Network run | Gallery coverage before and after |
| 13 | T1097 | D8 | Run the sea_temp task, re-export beaches, run `apply_climate`; check the beach page strip | pipeline tasks, beach wire | Sonnet | About 6 h of ERDDAP calls | The beach strip draws sea temperature |
| 14 | T1098 | D11 | UK crowds by month from ONS or VisitBritain, mapped to UK places; same method for BA, FO, MD, XK | `pipeline/` crowding | Sonnet | None | UK places carry monthly crowds |
| 15 | T1099 | D12 | Every wire stamps its real build time; a freshness report the box can push | pipeline writers, `continent-app/scripts/` | Sonnet | Box schedule (H9) for the refresh half | Stamps in every wire |
| 16 | T1100 | D13 | Getting-there mode choice (train, bus, car, fly) per ROADMAP D13 | price and flight code | Opus | None | Per the ROADMAP done condition |
| 17 | T1101 | E6 | Ask answers and the cards they show agree (same places, same numbers) | `src/browse/ask/`, `functions/api/ask` | Sonnet | None | A test of 20 questions where answer and cards match |
| 18 | T1102 | G13 | Trail cards and trail links per ROADMAP G13 | trail card components | Sonnet | None | End check at phone and desktop |
| 19 | T1103 | G12 | Onboarding and a shorter plan flow | `src/planner/flow/` | Opus | Read PRODUCT.md and carta-design first | Fewer steps, end check, a usability note |
| 20 | T1104 | I5 | Accounts that keep your work (sync of saved trips, lists, settings) | `src/auth/`, migration 065 if needed | Opus | Migration applied by the owner | Signed-in work survives a device change |
| 21 | T1105 | H12 | Fast first load and self-hosted images (the ladder_v1 derivatives in place of Wikimedia on first paint) | `src/lib/heroImage.js`, `pipeline/photos/` | Opus | R2 upload by the owner for the live half | LCP before and after on the fast build |
| 22 | T1106 | H13 | Errors that stay local: every component error contained, a clear message, no white screen | `src/components/ErrorBoundary.jsx`, call sites | Sonnet | None | Seeded errors stay inside their card |
| 23 | T1107 | H9 | Every pipeline task on a schedule: the monthly and quarterly tiers in the box scheduler, and the push of state and freshness to R2 | `run_pipeline.py`, `logs/`, box scripts | Opus | Box access (owner) | The schedule written and dry-run; the owner enables it |
| 24 | T1108 | I9 | Support and trust: contact route, FAQ, status page link | app pages | Sonnet | Support address (owner) | Pages live in the app |
| 25 | T1109 | K12 | Marketing measurement: cookieless channel counts from UTM, one weekly number in admin | `src/lib/`, admin | Sonnet | None | Counts in admin |
| 26 | T1110 | K3 | Waitlist and newsletter capture (double opt-in) | app, Edge Function | Sonnet | Email provider key (owner) | A sign-up stored and confirmed in test |
| 27 | T1111 | G1 | Design direction: a written direction for owner approval, from carta-design and the research | `docs/` design note | Opus | The owner approves | A one-page direction the owner signs off |
| 28 | T1112 | D14 | Measure Aviasales Data API coverage on the 10,094 routes before any switch | `scripts/` probe | Sonnet | API token (owner) | A coverage table |

## Wave 3: work gated on the owner's decisions

Decisions 1 and 2 were answered on 2026-11-05 (see the handover, section 3), so S29 and S30 can run. S31 waits on decision 4 (answered "not now") and S32 on decision 8.

| S | Task | Item | Gate | Scope | Model |
|---|---|---|---|---|---|
| 29 | T1113 | K2 (T1076-b, T1076-e, T1076-d) | Decision 1 | Apply the chosen bar; the bar for beach, lake, mountain, cycling and trip pages; a canonical for near-duplicate trips; trail prose and place links | Sonnet |
| 30 | T1114 | D10 (T1075-c) | Decision 2 | The thin-bed and not-yet notes on the trip page, Plan receipt, Ask and Explore cards, per the chosen rule | Sonnet |
| 31 | T1115 | D10 (T1075-b) | Decision 4 | The local transport fare layer from the chosen source, 127 metros first; the engine prices it | Opus |
| 32 | T1116 | A3 | Decision 8 | Apply the chosen register rule to reach under 250 rows | Sonnet |

## Wave 4: P2 items

| S | Task | Item | Scope | Model | Gate |
|---|---|---|---|---|---|
| 33 | T1117 | C8 | AI security: prompt-injection guards on Ask and plan-day, an output schema check, a refusal test set | Opus | None |
| 34 | T1118 | C9 | Privacy and GDPR: Article 30 record current, retention jobs, a data export and delete flow | Opus | Legal wording (owner) |
| 35 | T1119 | C7 | Static analysis in CI (Semgrep or CodeQL, chosen by C-R4 if done) with a baseline | Sonnet | None |
| 36 | T1120 | H2 | Error tracking with a privacy-safe setup | Sonnet | Account (owner) |
| 37 | T1121 | G2 | Shared parts that exist once (cards, sheets, price lines) | Opus | None |
| 38 | T1122 | G3 | The umber cost card as signature | Opus | Design direction (S27) |
| 39 | T1123 | G4 | Core flow fixes from the research | Opus | None |
| 40 | T1124 | G14 | **Home page** (added 2026-11-06): one clear promise, the waitlist, a live example priced from real data, links into Explore and a sample trip, fast first load; checked on a real phone. **Run it right after S27 is approved**, before the other wave 4 items | Opus | Design direction (S27) |
| 41 | T1125 | G6 | Type and radius debt against the design-lint baseline | Sonnet | None |
| 42 | T1126 | G7 | Breakpoints and CSS consolidation, dead CSS out (26 folded rows) | Sonnet | None |
| 43 | T1127 | G8 | Imagery gaps on the screens with placeholders | Sonnet | None |
| 44 | T1128 | G10 | Accessibility audit of the surfaces (29 folded rows) | Opus | None |
| 45 | T1129 | I11 | Product analytics, cookieless | Sonnet | None |
| 46 | T1130 | K5 | Data stories (the yearly basket per country, Belgian angle first) | Opus | Market (decision 6) |
| 47 | T1131 | K14 | **Automated data blog, part 1** (added 2026-11-06): the `blog_drafts` generator, the check script (numbers match the data, copy rules, licensed images, original data), the post pages, RSS, sitemap and structured data, three launch posts for December. Part 2 (the monthly routine) goes to round 2 | Opus | Owner reviews each post before merge |

## Wave 5: P3 foundations

| S | Task | Item | Scope | Model |
|---|---|---|---|---|
| 48 | T1132 | B3 | Logic catalogue: one file per domain under `docs/logic/`, every rule with its constant and test | Opus |
| 49 | T1133 | D1 | One machine-readable contract: a seeded bad value fails both the pipeline write and the app sync, with the field path | Opus |
| 50 | T1134 | B7, D2 | Drift checks that keep the docs true, and a first quality scorecard | Opus |

## After the 50

Added to the roadmap on 2026-11-06 and planned for round 2: D15 catalogue gaps (after D6), the blog's monthly routine (K14 part 2), G5 motion and K10 press kit (moved out of wave 4 for the home page and the blog). Eight proposed items wait on the owner: D16 to D22 and I17 (ROADMAP track D and I tables, status "proposed").


What remains: the rest of P3 and P4 (C10, C11, D2 to D6, E1 to E5, F1 to F8, H3 to H11, H14, I1 to I16, J1 to J5, K items).
- The launch dates are fixed by ROADMAP: open beta in March, Product Hunt on 4 May.
- Owner steps decide the pace more than session count: 490 owner rows are open.
