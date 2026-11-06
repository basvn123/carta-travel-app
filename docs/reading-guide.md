# Reading guide: understanding Carta step by step

**Who this is for.** The owner, and anyone new to the repository.
**What it does.** It explains how Carta fits together and how the work is organised, then gives a reading route through the real documents. It links to every document in the repository, so you can navigate to anything from here.
**What it is not.** It adds no new facts. Every statement comes from a document linked next to it, and where the two disagree, the linked document wins.

Written 2026-11-06, after the session of 2026-11-05 (tasks T1053 to T1084). Links are relative to `docs/`. They work in the Claude app's Files pane and on GitHub.

## Contents

1. [How to use this guide](#1-how-to-use-this-guide)
2. [What Carta is](#2-what-carta-is)
3. [How the system fits together](#3-how-the-system-fits-together)
4. [The data](#4-the-data)
5. [How each feature works](#5-how-each-feature-works)
6. [Security, privacy and legal](#6-security-privacy-and-legal)
7. [Running it: deploy, build box, incidents](#7-running-it-deploy-build-box-incidents)
8. [How the work is organised](#8-how-the-work-is-organised)
9. [What happened on 2026-11-05](#9-what-happened-on-2026-11-05)
10. [Your steps as owner](#10-your-steps-as-owner)
11. [What comes next](#11-what-comes-next)
12. [The reading route](#12-the-reading-route)
13. [Words that keep coming back](#13-words-that-keep-coming-back)
14. [Documentation that is not Markdown](#14-documentation-that-is-not-markdown)
15. [Appendix A: every Markdown file in the repository](#appendix-a-every-markdown-file-in-the-repository)
16. [Appendix B: the archive](#appendix-b-the-archive)

---

## 1. How to use this guide

- **New to everything:** read sections 2 to 4, then follow the reading route in section 12.
- **Looking for one thing:** use the "Read this for that" table in [README.md](README.md), or search Appendix A.
- **Want to act:** read section 10 and open the owner checklist.
- **Every Claude session** starts from [../CLAUDE.md](../CLAUDE.md) and [../MAP.md](../MAP.md). Those two files are short on purpose and point here for depth.

## 2. What Carta is

Carta is a web app for planning a trip anywhere in Europe. Its one idea, from [../PRODUCT.md](../PRODUCT.md):

> a cheap flight is not a cheap trip; Carta shows what the days there cost.

Flight search engines show only the ticket. Carta adds the flight, the bed and the days (food, local transport) into one total per person per day. You browse places, trails, beaches, lakes, mountains and cycling routes, and you plan a trip from them. It is one web app (Vite and React), later wrapped for the app stores. The launch market is Belgium and the Netherlands, in Dutch and English (owner's choice, 2026-11-05).

| Read | For |
|---|---|
| [../PRODUCT.md](../PRODUCT.md) | Who Carta is for, the mission in the owner's words, the voice and copy rules, the accessibility constraints. Read before anything a traveller sees. |
| [../DESIGN.md](../DESIGN.md) | The design tokens (colour, type, spacing) and components. 80 KB: search for the token you need. The source of truth is `continent-app/src/styles.css` `:root`. |
| [brand/POSITIONING.md](brand/POSITIONING.md) | The positioning draft, the trademark queries and the launch market recommendation (T1060). |
| [research/2026-11-launch-plan-research.md](research/2026-11-launch-plan-research.md) | The launch research behind the roadmap: SEO quality bar, channels, timing. |
| [../README.md](../README.md) and [../continent-app/README.md](../continent-app/README.md) | The repository and app readmes. |
| [../.claude/skills/carta-design/SKILL.md](../.claude/skills/carta-design/SKILL.md) | The carta-design skill: the design rules every visual change follows (it wins over other design sources). |
| [../.claude/skills/impeccable/SKILL.md](../.claude/skills/impeccable/SKILL.md) | The impeccable design skill used for UI work. |

## 3. How the system fits together

Think of a restaurant: a kitchen makes the food, a store room holds it in portions, the dining room serves it, an office handles accounts and payments, and an inspector checks everything.

| Part | Plain words | Read |
|---|---|---|
| **Pipeline** (Python) | The kitchen. Hundreds of open sources (OpenStreetMap, Wikidata, Wikipedia, Eurostat, price and weather data) are harvested and merged into one master dataset and separate layers. Run with `python run_pipeline.py <task>`. | [../pipeline/README.md](../pipeline/README.md), [../pipeline/intake/README.md](../pipeline/intake/README.md), [../src/ingestion/README.md](../src/ingestion/README.md), [../src/ingestion/CREDENTIALS.md](../src/ingestion/CREDENTIALS.md) |
| **Master and layers** | `app_data/app_data.json` (140 MB, kept out of git) plus layer folders for trails, beaches, lakes, mountains and cycling. | [SCHEMA.md](SCHEMA.md), [data/README.md](data/README.md) |
| **Wire** | The store room. `sync-data.mjs` cuts the master into portions a phone can load: a boot index, one file per country, detail files. Its shape is checked against SCHEMA.md. | [areas/data-wire.md](areas/data-wire.md) |
| **R2** | Cloudflare storage behind `data.carta-europetravel.com`. The browser fetches the wire straight from there. | [architecture/README.md](architecture/README.md) |
| **App on Cloudflare Pages** | The dining room. The React app, served by Cloudflare Pages (project `carta-app`). Response headers and the CSP are set in `continent-app/public/_headers`. | [../continent-app/README.md](../continent-app/README.md), [areas/deploy.md](areas/deploy.md) |
| **Pages Functions** | Small server code on Cloudflare: Ask Carta answers, live flights, the forecast, and about 32,000 prerendered pages for search engines. | [architecture/README.md](architecture/README.md), [areas/ask-carta.md](areas/ask-carta.md), [areas/flights.md](areas/flights.md) |
| **Workers** | Cloudflare Workers for the flight sweeps. | [../continent-app/workers/shared/fli/VENDORED.md](../continent-app/workers/shared/fli/VENDORED.md), [areas/flights.md](areas/flights.md) |
| **Supabase** | The office. Postgres with sign-in, saved trips, groups, lists, admin. Row level security (RLS) keeps each user to their own rows; since T1078 all 34 tables are tested. | [areas/admin.md](areas/admin.md), [areas/my-trips.md](areas/my-trips.md), [areas/pass-paywall.md](areas/pass-paywall.md) |
| **Edge Functions** | Server code at Supabase: the AI features on Gemini (`plan-day`, `suggest-city`, `parse-booking`; never the Claude API), payments (`checkout`, `stripe-webhook`, `billing`), email (`notify`), upload scanning (`upload-scan`). | [../supabase/functions/plan-day/README.md](../supabase/functions/plan-day/README.md), [../supabase/functions/suggest-city/README.md](../supabase/functions/suggest-city/README.md), [../supabase/functions/parse-booking/README.md](../supabase/functions/parse-booking/README.md), [../supabase/functions/notify/README.md](../supabase/functions/notify/README.md), [../supabase/functions/upload-scan/README.md](../supabase/functions/upload-scan/README.md), [../supabase/functions/checkout/test_purchase_e2e.md](../supabase/functions/checkout/test_purchase_e2e.md) |
| **Migrations** | Numbered SQL files that change the database, which the owner pastes into the Supabase SQL editor. 061 to 064 are written and not yet applied. | `supabase/migrations/`, [../Execution/P15/_OPEN-supabase-migrations.md](../Execution/P15/_OPEN-supabase-migrations.md) |
| **Hetzner build box** | A small server that runs the pipeline on a schedule and pushes data to R2. The owner confirmed it runs in production. | [../infra/hetzner/README.md](../infra/hetzner/README.md), [runbooks/build-box.md](runbooks/build-box.md), [areas/build-box.md](areas/build-box.md) |
| **GitHub CI** | The inspector. 14 workflows run tests, lint, build, security scans, the data contract and the licence check on every change. Branch protection on `main` keeps red code out. | [areas/tests-checks.md](areas/tests-checks.md), and the "CI and checks" section of [HANDBOOK.md](HANDBOOK.md) |
| **Tools** | Side tools for routing, benchmarks and trail review. | [../tools/trailslab/README.md](../tools/trailslab/README.md), [../tools/trailslab/review/README.md](../tools/trailslab/review/README.md), [../tools/reachability/README.md](../tools/reachability/README.md), [../tools/benchmark/README.md](../tools/benchmark/README.md), [../tools/benchmark/results/2026-10-01.md](../tools/benchmark/results/2026-10-01.md) |

The picture with a diagram and the request paths (browse, Ask, plan with AI, pay, data refresh) is in [architecture/README.md](architecture/README.md).

## 4. The data

| Read | For |
|---|---|
| [data/README.md](data/README.md) | The index of everything about data: contract, sources, licences, quality checks. |
| [SCHEMA.md](SCHEMA.md) | The data contract: every field in the wire, its type, who writes it. CI reads its "Wire contract" table. |
| [tos/data_licenses.md](tos/data_licenses.md) | The licence ledger: every external source, its licence, the credit owed and where it is shown. Generated from `src/ingestion/core/registry.py`; never edit it by hand. |
| [REGIONS.md](REGIONS.md) | How regions are built and covered. Code reads it. |
| [LAKES.md](LAKES.md) | How the lakes layer is built. Code reads it. |
| [../Trips/carta-unified/carta-unified/README.md](../Trips/carta-unified/carta-unified/README.md) | The curated trip library (258 trips): how it is built and validated. |
| [../Trips/carta-unified/carta-unified/schema/SCHEMA.md](../Trips/carta-unified/carta-unified/schema/SCHEMA.md) | The trip record schema. |
| [../Trips/carta-unified/carta-unified/reports/validation-report.md](../Trips/carta-unified/carta-unified/reports/validation-report.md), [../Trips/carta-unified/carta-unified/reports/gap-matrix.md](../Trips/carta-unified/carta-unified/reports/gap-matrix.md) | The trip validator's report (0 errors since T1077) and the coverage gap matrix. |
| [../Trips/carta-trips-enhancement-spec.md](../Trips/carta-trips-enhancement-spec.md), [../Trips/README_1.md](../Trips/README_1.md), [../Trips/gap-matrix.md](../Trips/gap-matrix.md), [../Trips/validation-report.md](../Trips/validation-report.md) | The original trip enhancement spec and older copies of the reports. |
| The generation prompts in `Trips/carta-unified/carta-unified/pipeline/prompts/` | How trip text is generated (listed in Appendix A). |
| `data/curation/research/_sources_*.md` (Appendix A) | Research notes per layer: which sources were considered for beaches, images, mountains, ranking, trails and trips. |
| [../data/curation/features_review_summary.md](../data/curation/features_review_summary.md) | The review of the retired features layer. |
| `data/reports/coverage/<country>.md` (Appendix A) | Coverage per country: what each country has and lacks. |
| [../data/reports/trails_coverage.md](../data/reports/trails_coverage.md), [../data/reports/field_stubs.md](../data/reports/field_stubs.md), [../data/reports/llm_runs_report.md](../data/reports/llm_runs_report.md) | Trail coverage, stub fields, and LLM run results. |
| [../reports/rating_external_check_v5.md](../reports/rating_external_check_v5.md), [../reports/rubric_spotcheck_v5.md](../reports/rubric_spotcheck_v5.md) | The rating v5 checks against outside sources and a rubric spot check. |
| [../continent-app/reports/persona_check_v5.md](../continent-app/reports/persona_check_v5.md) | The persona check of recommendations. |

## 5. How each feature works

Two layers of documentation:
- **Area docs** ([areas/README.md](areas/README.md)): one page per product area, with screens, app files, pipeline files, data, tests, limits and open register rows. Start here for any feature.
- **The handbook** ([HANDBOOK.md](HANDBOOK.md), about 2,500 lines): every rule, formula and threshold, with the config key or constant behind each number. Search it for the feature; do not read it whole.

| Area doc | Covers |
|---|---|
| [areas/home.md](areas/home.md) | The home page |
| [areas/explore.md](areas/explore.md) | Explore: map, cards, filters, rails, sort |
| [areas/place-page.md](areas/place-page.md) | The place (destination) page |
| [areas/plan-flow.md](areas/plan-flow.md) | The plan flow: help me choose, trip finder |
| [areas/trip-page.md](areas/trip-page.md) | The trip page and itinerary |
| [areas/day-planner.md](areas/day-planner.md) | The day planner |
| [areas/trip-library.md](areas/trip-library.md) | The curated trip library (journeys) |
| [areas/my-trips.md](areas/my-trips.md) | My trips: saved trips, lists, groups |
| [areas/price-engine.md](areas/price-engine.md) | The price engine: per person per day |
| [areas/stays.md](areas/stays.md) | Bed prices: scrape and health |
| [areas/flights.md](areas/flights.md) | Flight prices: sweeps and live search |
| [areas/ratings.md](areas/ratings.md) | Ratings (v5) |
| [areas/climate-crowds.md](areas/climate-crowds.md) | Climate and crowds by month |
| [areas/outdoors.md](areas/outdoors.md) | Beaches, lakes, mountains |
| [areas/trails-cycling.md](areas/trails-cycling.md) | Trails and cycling |
| [areas/regions.md](areas/regions.md) | Regions and coverage |
| [areas/images.md](areas/images.md) | Photos and image credits |
| [areas/ask-carta.md](areas/ask-carta.md) | Ask Carta |
| [areas/languages.md](areas/languages.md) | The six languages |
| [areas/licences.md](areas/licences.md) | Data licences |
| [areas/pass-paywall.md](areas/pass-paywall.md) | The pass and paywall, Stripe |
| [areas/admin.md](areas/admin.md) | The admin panel |
| [areas/data-wire.md](areas/data-wire.md) | The data wire |
| [areas/deploy.md](areas/deploy.md) | Deploy |
| [areas/build-box.md](areas/build-box.md) | The build box |
| [areas/tests-checks.md](areas/tests-checks.md) | Tests and CI |

[../MAP.md](../MAP.md) maps the same areas to their code folders, handbook section and latest task reports.

## 6. Security, privacy and legal

| Read | For |
|---|---|
| [security/threat-model.md](security/threat-model.md) | Every surface modelled (STRIDE): assets, threats, controls, tests, and a ranked table of gaps, each marked with the task that closed it (T1069, updated by T1078 to T1080). |
| [security/SECRETS.md](security/SECRETS.md) | Every secret and owner account by name (never values): where it lives and how to rotate it. |
| [../Execution/P15/_OPEN-secrets-rotation.md](../Execution/P15/_OPEN-secrets-rotation.md) | The owner's rotation and MFA procedure. |
| [../Execution/P15/_OPEN-auth-settings.md](../Execution/P15/_OPEN-auth-settings.md) | The Supabase Auth settings and admin MFA, with exact Dashboard paths. |
| [../Execution/P15/_OPEN-web-hardening.md](../Execution/P15/_OPEN-web-hardening.md) | Deploying the hardened headers and functions, and the Cloudflare rate rule. |
| [legal/ARTICLE30.md](legal/ARTICLE30.md) | The GDPR record of processing: what personal data is processed, by whom, where. |
| [../Execution/P15/_OPEN-legal.md](../Execution/P15/_OPEN-legal.md) | The owner's legal steps (Terms, trademark, notices). |
| [tos/data_licenses.md](tos/data_licenses.md) | The data licence ledger (also under section 4). |

## 7. Running it: deploy, build box, incidents

| Read | For |
|---|---|
| [runbooks/README.md](runbooks/README.md) | The runbook index. |
| [runbooks/deploy.md](runbooks/deploy.md) | The deploy: build, data push to R2, Pages preview then main, prune. Only when the owner asks. |
| [runbooks/build-box.md](runbooks/build-box.md) | Running and fixing the Hetzner build box. |
| [runbooks/incident.md](runbooks/incident.md) | What to do when something breaks. |
| [../infra/hetzner/README.md](../infra/hetzner/README.md) | How the box is provisioned. |
| [../Execution/_OWNER-RUNBOOK.md](../Execution/_OWNER-RUNBOOK.md) | The older owner runbook (step B14 and others). The P15 procedure files below supersede most of it. |
| [../Execution/P3/_OPEN-hetzner.md](../Execution/P3/_OPEN-hetzner.md), [../Execution/P15/_OPEN-hetzner-box.md](../Execution/P15/_OPEN-hetzner-box.md), [../Execution/P15/_OPEN-stays-box.md](../Execution/P15/_OPEN-stays-box.md), [../Execution/P15/_OPEN-scraper-health.md](../Execution/P15/_OPEN-scraper-health.md) | Box and scraper procedures. |

## 8. How the work is organised

**The plan.** [../ROADMAP.md](../ROADMAP.md) is the plan to launch, with three layers:
- **Phases:** P0 to P5, each with a quality gate, in section 4.
- **Tracks:** A to K, for example A structure, B docs, C security, D data, E Ask, F intelligence, G design, H operations, I business, J launch, K marketing.
- **Items:** each has an ID (`C4`, `D7`), a done condition and a status.

[AUDIT-2026-11.md](AUDIT-2026-11.md) lists the pain points found on 2026-11-04 (P-01 to P-59), each mapped to a roadmap item.

**The register.** [../Execution/_OPEN.md](../Execution/_OPEN.md) holds one row per open item:
- **The row:** an ID (`T1070-a`), who raised it, what it is, whose it is (`user` is the owner, `next task` is Claude) and the status.
- **Closed rows** move to [../Execution/_OPEN-CLOSED.md](../Execution/_OPEN-CLOSED.md) and are never deleted.
- **Owner rows** are grouped into one procedure per system (section 10).

**One task, start to finish:**
1. A task gets a number (`T1078`) and a branch.
2. Claude does the work, only in the files the task names.
3. Checks run locally.
4. A report from [../Execution/_TEMPLATE.md](../Execution/_TEMPLATE.md): what changed, numbers before and after, what broke, what is open, how to undo it.
5. Register rows are added, and the handbook is updated if behaviour changed.
6. A pull request on GitHub, where CI runs and Auto-fix repairs red checks.
7. The owner merges. Deploy happens only when the owner asks.

**Batches.** Several tasks share one batch branch. Parallel tasks run as subagents, each in its own worktree, with one end check and one PR.

**Where the history lives:**

| Read | For |
|---|---|
| `Execution/P15/` | The active phase: every task report since 2026-11-04 (Appendix A lists them all). |
| `Execution/P*/_DIGEST.md` | One file per finished phase: what each task changed and what broke. Search them; do not read them whole. Phases P0 to P13 (listed in Appendix A). |
| [../Execution/P15/_BRIEF-plan-flow-v3.md](../Execution/P15/_BRIEF-plan-flow-v3.md), [../Execution/P15/_PLAN-plan-flow-v3.md](../Execution/P15/_PLAN-plan-flow-v3.md), [../Execution/P15/_RUN-plan-flow-v3.md](../Execution/P15/_RUN-plan-flow-v3.md), [../Execution/P15/_PLAN-trip-page-v4.md](../Execution/P15/_PLAN-trip-page-v4.md) | Earlier design briefs and plans for the plan flow and the trip page. |
| `Execution/P15/T834-board/` | A design board from T834. |
| git tag `archive/execution-full-2026-11-03` | Full old reports and screenshots up to 2026-11-03 (each digest entry gives the `git show` command). |

## 9. What happened on 2026-11-05

Nothing from that day is deployed; production runs the 2026-11-03 build.

| Tasks | Report | What, and why it matters |
|---|---|---|
| T1053 to T1060 | [../Execution/P15/T1053-T1060-p0-batch.md](../Execution/P15/T1053-T1060-p0-batch.md) | Vulnerable packages updated, a sign-out that can clear the device, a map bug, safer R2 prune, CI set up, the secrets inventory, positioning. The first must-dos. |
| T1061 | [../Execution/P15/T1061-ci-green.md](../Execution/P15/T1061-ci-green.md) | Seven checks had been red for weeks, so new errors went unseen. All made green. |
| T1062 to T1067 | [../Execution/P15/T1062-T1066-copy-focus-upgrades.md](../Execution/P15/T1062-T1066-copy-focus-upgrades.md) | Copy fixes, a visible focus ring, jspdf 4 and maplibre 6 (two critical advisories closed), Vercel removed. |
| T1068 | [../Execution/P15/T1068-quarantine-fixes.md](../Execution/P15/T1068-quarantine-fixes.md) | 55 of 58 broken Python tests fixed. |
| T1069 | [../Execution/P15/T1069-threat-model.md](../Execution/P15/T1069-threat-model.md) | The threat model. |
| T1070 | [../Execution/P15/T1070-upload-migration.md](../Execution/P15/T1070-upload-migration.md) | The upload database (migration 061) and the scan function. |
| T1071 | [../Execution/P15/T1071-auth-access.md](../Execution/P15/T1071-auth-access.md) | MFA for every admin function, and the audit log (migration 062). |
| T1072 | [../Execution/P15/T1072-register-triage.md](../Execution/P15/T1072-register-triage.md) | Register triage and the owner procedure files. |
| T1073 | [../Execution/P15/T1073-docs-tree.md](../Execution/P15/T1073-docs-tree.md) | The new docs tree: README, areas, architecture, runbooks, glossary. |
| T1074, T1075 | [../Execution/P15/T1074-scraper-health.md](../Execution/P15/T1074-scraper-health.md), [../Execution/P15/T1075-prices-honest.md](../Execution/P15/T1075-prices-honest.md) | Scraper health and honest prices ("not yet measured", thin beds). |
| T1076 | [../Execution/P15/T1076-seo-plumbing.md](../Execution/P15/T1076-seo-plumbing.md) | The SEO quality bar. |
| T1068 to T1076 | [../Execution/P15/T1068-T1076-p1-batch.md](../Execution/P15/T1068-T1076-p1-batch.md) | The P1 batch report. |
| T1077 | [../Execution/P15/T1077-trip-heroes.md](../Execution/P15/T1077-trip-heroes.md) | Trip hero photos all over 1600px; the trip validator went from 259 errors to 0. |
| T1078 | [../Execution/P15/T1078-rls-coverage.md](../Execution/P15/T1078-rls-coverage.md) | Every table tested for privacy; migration 063. |
| T1079 | [../Execution/P15/T1079-web-hardening.md](../Execution/P15/T1079-web-hardening.md) | Stricter headers and input checks. |
| T1080 | [../Execution/P15/T1080-supply-chain.md](../Execution/P15/T1080-supply-chain.md) | Pinned versions of outside code, Dependabot, SBOM. |
| T1081 | [../Execution/P15/T1081-admin-reasons.md](../Execution/P15/T1081-admin-reasons.md) | A reason required for admin actions (migration 064). |
| T1082 | [../Execution/P15/T1082-cleanup.md](../Execution/P15/T1082-cleanup.md) | Dead code removed, test scripts fixed. |
| T1083 | [../Execution/P15/T1083-register-triage.md](../Execution/P15/T1083-register-triage.md) | More register triage. |
| T1078 to T1083 | [../Execution/P15/T1078-T1083-security-batch.md](../Execution/P15/T1078-T1083-security-batch.md) | The security batch report. |
| T1084 | [../Execution/P15/T1084-licence-registry.md](../Execution/P15/T1084-licence-registry.md) | Every data source has a licence row; the last quarantined tests run again. |

The day before, T1050 and T1051 started the docs over and rebuilt the Claude context:
- [../Execution/P15/T1050-T1051-docs-start-over-and-claude-context.md](../Execution/P15/T1050-T1051-docs-start-over-and-claude-context.md).

The summary of 2026-11-05 is [../Execution/P15/_HANDOVER-2026-11-05.md](../Execution/P15/_HANDOVER-2026-11-05.md).

## 10. Your steps as owner

| Read | For |
|---|---|
| [The owner checklist](https://claude.ai/artifact/UZ1QJRDYdowJZEi6y5JCvF) | Every decision and step in order, with "How" per step. Your ticks are kept on the page. |
| [../Execution/P15/_HANDOVER-2026-11-05.md](../Execution/P15/_HANDOVER-2026-11-05.md), sections 3 and 4 | Your decisions (seven answered, one open) and your steps in order. |

The procedure files, one per system, in register order:

| Procedure | System |
|---|---|
| [../Execution/P15/_OPEN-secrets-rotation.md](../Execution/P15/_OPEN-secrets-rotation.md) | Keys and MFA |
| [../Execution/P15/_OPEN-auth-settings.md](../Execution/P15/_OPEN-auth-settings.md) | Supabase Auth and admin MFA |
| [../Execution/P15/_OPEN-supabase-migrations.md](../Execution/P15/_OPEN-supabase-migrations.md) | Migrations to paste, in order (061 to 064 at steps 11 and 12) |
| [../Execution/P15/_OPEN-uploads.md](../Execution/P15/_OPEN-uploads.md) | Switching on uploads |
| [../Execution/P15/_OPEN-web-hardening.md](../Execution/P15/_OPEN-web-hardening.md) | Headers, functions, rate rule |
| [../Execution/P15/_OPEN-cloudflare.md](../Execution/P15/_OPEN-cloudflare.md) | Cloudflare (status.json and others) |
| [../Execution/P15/_OPEN-stripe.md](../Execution/P15/_OPEN-stripe.md) | Stripe |
| [../Execution/P15/_OPEN-google-and-search.md](../Execution/P15/_OPEN-google-and-search.md), [../Execution/P15/_OPEN-search-console.md](../Execution/P15/_OPEN-search-console.md) | Google and Search Console |
| [../Execution/P15/_OPEN-hetzner-box.md](../Execution/P15/_OPEN-hetzner-box.md), [../Execution/P15/_OPEN-stays-box.md](../Execution/P15/_OPEN-stays-box.md), [../Execution/P15/_OPEN-scraper-health.md](../Execution/P15/_OPEN-scraper-health.md) | The build box and scrapers |
| [../Execution/P15/_OPEN-data-and-pipeline-runs.md](../Execution/P15/_OPEN-data-and-pipeline-runs.md), [../Execution/P15/_OPEN-explore-data-runs.md](../Execution/P15/_OPEN-explore-data-runs.md) | Data and pipeline runs |
| [../Execution/P15/_OPEN-legal.md](../Execution/P15/_OPEN-legal.md) | Legal |
| [../Execution/P15/_OPEN-accounts-and-signups.md](../Execution/P15/_OPEN-accounts-and-signups.md) | Accounts and sign-ups (handles and others) |
| [../Execution/P15/_OPEN-translation-review.md](../Execution/P15/_OPEN-translation-review.md) | Native review of the translations |
| [../Execution/P15/_OPEN-product-decisions.md](../Execution/P15/_OPEN-product-decisions.md) | Product decisions waiting on you |
| [../Execution/P15/_OPEN-owner-checks.md](../Execution/P15/_OPEN-owner-checks.md) | Checks only you can do |
| [../Execution/P2/_OPEN-stripe-launch.md](../Execution/P2/_OPEN-stripe-launch.md), [../Execution/P2/_OPEN-gemini-billing.md](../Execution/P2/_OPEN-gemini-billing.md), [../Execution/P9/_OPEN-paid-runs.md](../Execution/P9/_OPEN-paid-runs.md), [../Execution/P11/_OPEN-pass-subscription.md](../Execution/P11/_OPEN-pass-subscription.md) | Older procedures from earlier phases (some steps superseded; each says so at the top) |

## 11. What comes next

| Read | For |
|---|---|
| [../Execution/P15/_NEXT-50-SESSIONS.md](../Execution/P15/_NEXT-50-SESSIONS.md) | The next 50 sessions in five waves. Each has a reserved task number (T1085 to T1134), roadmap item, scope, files, model, owner gate and done condition, plus the rules for running many sessions at once and a prompt template. |
| [../Execution/P15/_SESSIONS-ROUND-2.md](../Execution/P15/_SESSIONS-ROUND-2.md) | The 50 sessions after S44 (S45 to S94, task numbers T1135 to T1178 for the new ones): AI evaluation and model strategy, data quality and catalogue gaps, the intelligence track, operations and security testing, docs, product breadth and the blog routine. |
| [../ROADMAP.md](../ROADMAP.md) | Everything after that. On 2026-11-06: 120 items, 11 done, 10 in progress. |

## 12. The reading route

Follow the steps in order. Every step stands on its own, so you can stop after any of them.

| Step | Open | You learn | Time |
|---|---|---|---|
| 1 | This guide, sections 2 to 4 | The big picture | 20 min |
| 2 | [../PRODUCT.md](../PRODUCT.md), up to "Visual brand commitment" | Who Carta is for, how it speaks, what it promises | 10 min |
| 3 | [architecture/README.md](architecture/README.md) | The parts and how a request travels | 10 min |
| 4 | [glossary.md](glossary.md) | The Carta words (wire, master, layer, tier, gem) | 10 min, or look words up as you meet them |
| 5 | [../Execution/P15/_HANDOVER-2026-11-05.md](../Execution/P15/_HANDOVER-2026-11-05.md) | Where everything stands, your decisions, your steps | 15 min |
| 6 | [The owner checklist](https://claude.ai/artifact/UZ1QJRDYdowJZEi6y5JCvF) | What you need to do, in order, with how | At your own pace |
| 7 | [areas/README.md](areas/README.md), then 2 or 3 areas you care about (for example [explore](areas/explore.md), [plan-flow](areas/plan-flow.md), [price-engine](areas/price-engine.md)) | One product area at a time: screens, files, tests, limits | 10 min per area |
| 8 | [../ROADMAP.md](../ROADMAP.md), section 4 and the tables of tracks C and D | What is left before launch | 20 min |
| 9 | [security/threat-model.md](security/threat-model.md), the gap table at the end | Where the system was exposed and what is closed | 15 min |
| 10 | One task report, start to finish: [T1077](../Execution/P15/T1077-trip-heroes.md) | How a task is recorded, and how to read one | 10 min |
| 11 | [../Execution/P15/_NEXT-50-SESSIONS.md](../Execution/P15/_NEXT-50-SESSIONS.md) | What the next sessions will do and what they need from you | 15 min |
| 12 | [HANDBOOK.md](HANDBOOK.md): search for one feature you know (for example "Destination price card") | Exactly how a feature computes, with the numbers behind it | As needed |
| 13 | [data/README.md](data/README.md) and [SCHEMA.md](SCHEMA.md) | What data exists and its exact shape | 20 min |
| 14 | [AUDIT-2026-11.md](AUDIT-2026-11.md) | The pain points that shaped the roadmap | 15 min |
| 15 | [runbooks/deploy.md](runbooks/deploy.md) | What a deploy involves, before you ask for one | 10 min |

## 13. Words that keep coming back

| Word | In plain words |
|---|---|
| Pipeline | The Python program that makes all the data |
| Master | The one large data file the pipeline makes |
| Wire | The master in small portions, as the app downloads them |
| Layer | A separate dataset: trails, beaches, lakes, mountains, cycling |
| R2 | Cloudflare storage that holds the wire and the photos |
| Pages, Pages Functions | Cloudflare serving the app, and the small server functions beside it |
| Supabase | Database, accounts, and the AI and payment functions |
| Migration | A numbered database change the owner pastes into Supabase |
| RLS | Row level security: each user sees only their own data |
| Edge Function | Server code at Supabase (AI, payments, email, upload scan) |
| Branch, pull request (PR), merge | A separate line of work, the proposal to join it, and joining it |
| CI, check | The automatic checks on GitHub; red is wrong, green is good |
| Auto-fix | Claude repairs red checks on a PR without asking first |
| Deploy | Making a version live for visitors; only when the owner asks |
| Register | The list of every open item |
| Worktree, subagent | A separate copy of the repository, and a Claude helper working in it |
| Build box | The Hetzner server that runs the pipeline on a schedule |

All the Carta-specific terms are in [glossary.md](glossary.md).

## 14. Documentation that is not Markdown

Some of the most exact documentation lives in code and config:

| Where | What it documents |
|---|---|
| `continent-app/config/pricing.json`, `rating.json`, `rating_anchors.json`, `recommend.json`, `slots.json` | The rules behind prices, ratings and recommendations: every threshold the handbook cites. |
| `continent-app/public/_headers` | The security headers and CSP actually sent, with a header comment explaining the rules. |
| `.github/workflows/*.yml` (14 files) | Every automatic check, with comments on why each step exists. |
| `supabase/migrations/*.sql` | The database, migration by migration; each file opens with a comment on what it does and how to apply it. |
| `src/ingestion/core/registry.py` | The source of the licence ledger: every source, its licence and its run schedule. |
| `run_pipeline.py` | Every pipeline task: its cadence, guards, commands and a note on what it writes. |
| `continent-app/scripts/build-pages.mjs` (header) | Each step of the deploy build. |
| `continent-app/scripts/ci/check-contract.mjs` and `contract.mjs` | What the data contract gate checks. |
| `continent-app/src/lib/dataHost.js` | Which data folders live on R2. |
| `tests/quarantine.txt`, `tests/needs_master.txt` | Which Python tests are skipped and why (quarantine is empty since T1084). |

---

## Appendix A: every Markdown file in the repository

<!-- INDEX:START -->
Generated on 2026-11-06 from `git ls-files`: 422 files outside the archive, grouped by folder, each with its first heading. Task reports are named `T<number>-<slug>.md`; phase digests `_DIGEST.md`; owner procedures `_OPEN-<system>.md`. Regenerate with `python -I scripts/docs/build_reading_guide_index.py` when files move; it also checks that every link resolves.

**(repository root)** (6)

| File | Title |
|---|---|
| [CLAUDE.md](../CLAUDE.md) | Claude Code working rules for Carta |
| [DESIGN.md](../DESIGN.md) | Carta |
| [MAP.md](../MAP.md) | Carta map |
| [PRODUCT.md](../PRODUCT.md) | Carta, the product in one page |
| [README.md](../README.md) | Carta, Europe Travel App |
| [ROADMAP.md](../ROADMAP.md) | Carta roadmap to production |

**.claude/skills/** (57)

| File | Title |
|---|---|
| [.claude/skills/carta-design/references/app-rules.md](../.claude/skills/carta-design/references/app-rules.md) | Carta app rules (reference) |
| [.claude/skills/carta-design/SKILL.md](../.claude/skills/carta-design/SKILL.md) | carta-design |
| [.claude/skills/impeccable/reference/adapt.md](../.claude/skills/impeccable/reference/adapt.md) | Assess Adaptation Challenge |
| [.claude/skills/impeccable/reference/adapt.native.md](../.claude/skills/impeccable/reference/adapt.native.md) | Assess Adaptation Challenge |
| [.claude/skills/impeccable/reference/android.md](../.claude/skills/impeccable/reference/android.md) | Android platform |
| [.claude/skills/impeccable/reference/animate.md](../.claude/skills/impeccable/reference/animate.md) | Visitor mode |
| [.claude/skills/impeccable/reference/audit.md](../.claude/skills/impeccable/reference/audit.md) | Diagnostic Scan |
| [.claude/skills/impeccable/reference/audit.native.md](../.claude/skills/impeccable/reference/audit.native.md) | Diagnostic Scan |
| [.claude/skills/impeccable/reference/bolder.md](../.claude/skills/impeccable/reference/bolder.md) | Scope is sovereign |
| [.claude/skills/impeccable/reference/clarify.md](../.claude/skills/impeccable/reference/clarify.md) | Audit the language |
| [.claude/skills/impeccable/reference/colorize.md](../.claude/skills/impeccable/reference/colorize.md) | Visitor mode |
| [.claude/skills/impeccable/reference/craft-floor.md](../.claude/skills/impeccable/reference/craft-floor.md) | Craft floor |
| [.claude/skills/impeccable/reference/craft.md](../.claude/skills/impeccable/reference/craft.md) | Craft (deprecated alias) |
| [.claude/skills/impeccable/reference/critique.md](../.claude/skills/impeccable/reference/critique.md) | Purpose |
| [.claude/skills/impeccable/reference/degraded/asset-producer.md](../.claude/skills/impeccable/reference/degraded/asset-producer.md) | Impeccable Asset Producer |
| [.claude/skills/impeccable/reference/degraded/documenter.md](../.claude/skills/impeccable/reference/degraded/documenter.md) | Impeccable Documenter |
| [.claude/skills/impeccable/reference/degraded/finish-reviewer.md](../.claude/skills/impeccable/reference/degraded/finish-reviewer.md) | Impeccable Finish Reviewer |
| [.claude/skills/impeccable/reference/degraded/manual-edit-applier.md](../.claude/skills/impeccable/reference/degraded/manual-edit-applier.md) | Impeccable Manual Edit Applier |
| [.claude/skills/impeccable/reference/delight.md](../.claude/skills/impeccable/reference/delight.md) | Visitor mode |
| [.claude/skills/impeccable/reference/distill.md](../.claude/skills/impeccable/reference/distill.md) | Assess Current State |
| [.claude/skills/impeccable/reference/doctor.md](../.claude/skills/impeccable/reference/doctor.md) | What this owns, and what it does not |
| [.claude/skills/impeccable/reference/document.md](../.claude/skills/impeccable/reference/document.md) | The frontmatter: token schema |
| [.claude/skills/impeccable/reference/extract.md](../.claude/skills/impeccable/reference/extract.md) | Extract Flow |
| [.claude/skills/impeccable/reference/harden.md](../.claude/skills/impeccable/reference/harden.md) | Assess Hardening Needs |
| [.claude/skills/impeccable/reference/hooks.md](../.claude/skills/impeccable/reference/hooks.md) | $impeccable hooks |
| [.claude/skills/impeccable/reference/init.md](../.claude/skills/impeccable/reference/init.md) | Init flow |
| [.claude/skills/impeccable/reference/ios.md](../.claude/skills/impeccable/reference/ios.md) | iOS platform |
| [.claude/skills/impeccable/reference/layout.md](../.claude/skills/impeccable/reference/layout.md) | Visitor mode |
| [.claude/skills/impeccable/reference/live-setup.md](../.claude/skills/impeccable/reference/live-setup.md) | Write the config |
| [.claude/skills/impeccable/reference/live.md](../.claude/skills/impeccable/reference/live.md) | Prerequisites |
| [.claude/skills/impeccable/reference/new-work.md](../.claude/skills/impeccable/reference/new-work.md) | New visual work |
| [.claude/skills/impeccable/reference/onboard.md](../.claude/skills/impeccable/reference/onboard.md) | Assess Onboarding Needs |
| [.claude/skills/impeccable/reference/operate.md](../.claude/skills/impeccable/reference/operate.md) | Operate mode depth (and Read notes) |
| [.claude/skills/impeccable/reference/optimize.md](../.claude/skills/impeccable/reference/optimize.md) | Assess Performance Issues |
| [.claude/skills/impeccable/reference/overdrive.md](../.claude/skills/impeccable/reference/overdrive.md) | Propose Before Building |
| [.claude/skills/impeccable/reference/polish.md](../.claude/skills/impeccable/reference/polish.md) | 1. Establish the system |
| [.claude/skills/impeccable/reference/quieter.md](../.claude/skills/impeccable/reference/quieter.md) | Visitor mode |
| [.claude/skills/impeccable/reference/routing.md](../.claude/skills/impeccable/reference/routing.md) | Command guidance |
| [.claude/skills/impeccable/reference/shape.md](../.claude/skills/impeccable/reference/shape.md) | Shape |
| [.claude/skills/impeccable/reference/typeset.md](../.claude/skills/impeccable/reference/typeset.md) | Visitor mode |
| [.claude/skills/impeccable/reference/visualize.md](../.claude/skills/impeccable/reference/visualize.md) | Visualize: Direction Comps & Asset Production |
| [.claude/skills/impeccable/SKILL.md](../.claude/skills/impeccable/SKILL.md) | impeccable |
| [.claude/skills/repo-cleanup/1-build-artifacts/SKILL.md](../.claude/skills/repo-cleanup/1-build-artifacts/SKILL.md) | repo-cleanup-1-build-artifacts |
| [.claude/skills/repo-cleanup/agent-directories/SKILL.md](../.claude/skills/repo-cleanup/agent-directories/SKILL.md) | repo-cleanup-agent-directories |
| [.claude/skills/repo-cleanup/best-practices/SKILL.md](../.claude/skills/repo-cleanup/best-practices/SKILL.md) | repo-cleanup-best-practices |
| [.claude/skills/repo-cleanup/common-hidden-folders/SKILL.md](../.claude/skills/repo-cleanup/common-hidden-folders/SKILL.md) | repo-cleanup-common-hidden-folders |
| [.claude/skills/repo-cleanup/conflict-resolution-patterns/SKILL.md](../.claude/skills/repo-cleanup/conflict-resolution-patterns/SKILL.md) | repo-cleanup-conflict-resolution-patterns |
| [.claude/skills/repo-cleanup/folders-to-delete-confirmed-safe/SKILL.md](../.claude/skills/repo-cleanup/folders-to-delete-confirmed-safe/SKILL.md) | repo-cleanup-folders-to-delete-confirmed-safe |
| [.claude/skills/repo-cleanup/for-tracked-files-use-git-rm/SKILL.md](../.claude/skills/repo-cleanup/for-tracked-files-use-git-rm/SKILL.md) | repo-cleanup-for-tracked-files-use-git-rm |
| [.claude/skills/repo-cleanup/gitignore-updates/SKILL.md](../.claude/skills/repo-cleanup/gitignore-updates/SKILL.md) | repo-cleanup-gitignore-updates |
| [.claude/skills/repo-cleanup/list-untracked-files/SKILL.md](../.claude/skills/repo-cleanup/list-untracked-files/SKILL.md) | repo-cleanup-list-untracked-files |
| [.claude/skills/repo-cleanup/pre-cleanup/SKILL.md](../.claude/skills/repo-cleanup/pre-cleanup/SKILL.md) | repo-cleanup-pre-cleanup |
| [.claude/skills/repo-cleanup/progress-tracking-commands/SKILL.md](../.claude/skills/repo-cleanup/progress-tracking-commands/SKILL.md) | repo-cleanup-progress-tracking-commands |
| [.claude/skills/repo-cleanup/references-to-remove/SKILL.md](../.claude/skills/repo-cleanup/references-to-remove/SKILL.md) | repo-cleanup-references-to-remove |
| [.claude/skills/repo-cleanup/SKILL.md](../.claude/skills/repo-cleanup/SKILL.md) | repo-cleanup |
| [.claude/skills/repo-cleanup/structure-section-updates/SKILL.md](../.claude/skills/repo-cleanup/structure-section-updates/SKILL.md) | repo-cleanup-structure-section-updates |
| [.claude/skills/repo-cleanup/version-metadata/SKILL.md](../.claude/skills/repo-cleanup/version-metadata/SKILL.md) | repo-cleanup-version-metadata |

**Execution/** (4)

| File | Title |
|---|---|
| [Execution/_OPEN-CLOSED.md](../Execution/_OPEN-CLOSED.md) | Closed register rows |
| [Execution/_OPEN.md](../Execution/_OPEN.md) | Open items register |
| [Execution/_OWNER-RUNBOOK.md](../Execution/_OWNER-RUNBOOK.md) | Owner runbook: your manual steps, in order, so the waves can run on their own |
| [Execution/_TEMPLATE.md](../Execution/_TEMPLATE.md) | T{n}: {title} |

**Execution/P0/** (3)

| File | Title |
|---|---|
| [Execution/P0/_DIGEST.md](../Execution/P0/_DIGEST.md) | P0 digest |
| [Execution/P0/T1034-repo-slim.md](../Execution/P0/T1034-repo-slim.md) | T1034: free the disk and slim the repo for fewer tokens per session |
| [Execution/P0/T1040-ship-all.md](../Execution/P0/T1040-ship-all.md) | T1040: commit, merge, push and deploy everything |

**Execution/P1/** (1)

| File | Title |
|---|---|
| [Execution/P1/_DIGEST.md](../Execution/P1/_DIGEST.md) | P1 digest |

**Execution/P10/** (1)

| File | Title |
|---|---|
| [Execution/P10/_DIGEST.md](../Execution/P10/_DIGEST.md) | P10 digest |

**Execution/P11/** (3)

| File | Title |
|---|---|
| [Execution/P11/_DIGEST.md](../Execution/P11/_DIGEST.md) | P11 digest |
| [Execution/P11/_OPEN-pass-subscription.md](../Execution/P11/_OPEN-pass-subscription.md) | The yearly plan and the 60-day Trip Pass: switching them on |
| [Execution/P11/T804-T805-flights-to-august.md](../Execution/P11/T804-T805-flights-to-august.md) | T804 to T805: flight prices out to the end of August (batch SW2) |

**Execution/P12/** (1)

| File | Title |
|---|---|
| [Execution/P12/_DIGEST.md](../Execution/P12/_DIGEST.md) | P12 digest |

**Execution/P13/** (1)

| File | Title |
|---|---|
| [Execution/P13/_DIGEST.md](../Execution/P13/_DIGEST.md) | P13 digest |

**Execution/P15/** (196)

| File | Title |
|---|---|
| [Execution/P15/_BRIEF-plan-flow-v3.md](../Execution/P15/_BRIEF-plan-flow-v3.md) | Plan flow v3: shared brief for every batch agent |
| [Execution/P15/_HANDOVER-2026-11-05.md](../Execution/P15/_HANDOVER-2026-11-05.md) | Handover, 2026-11-05: read this first |
| [Execution/P15/_NEXT-50-SESSIONS.md](../Execution/P15/_NEXT-50-SESSIONS.md) | The next 50 sessions (from 2026-11-06) |
| [Execution/P15/_OPEN-accounts-and-signups.md](../Execution/P15/_OPEN-accounts-and-signups.md) | Owner procedure: Accounts, mailboxes and programme sign-ups (T1072, ROADMAP A3) |
| [Execution/P15/_OPEN-auth-settings.md](../Execution/P15/_OPEN-auth-settings.md) | Owner procedure: Supabase Auth settings and admin MFA (T1071, ROADMAP C3, row T1071-a) |
| [Execution/P15/_OPEN-cloudflare.md](../Execution/P15/_OPEN-cloudflare.md) | Owner procedure: Cloudflare (Pages, R2, Workers, email routing) (T1072, ROADMAP A3) |
| [Execution/P15/_OPEN-data-and-pipeline-runs.md](../Execution/P15/_OPEN-data-and-pipeline-runs.md) | Owner procedure: Pipeline and data runs that wait on you (T1072, ROADMAP A3) |
| [Execution/P15/_OPEN-explore-data-runs.md](../Execution/P15/_OPEN-explore-data-runs.md) | Explore data fill: what the Monday run on the Hetzner box does (T640) |
| [Execution/P15/_OPEN-google-and-search.md](../Execution/P15/_OPEN-google-and-search.md) | Owner procedure: Google, Gemini billing and Search Console (T1072, ROADMAP A3) |
| [Execution/P15/_OPEN-hetzner-box.md](../Execution/P15/_OPEN-hetzner-box.md) | Owner procedure: Hetzner box and workers (T1072, ROADMAP A3) |
| [Execution/P15/_OPEN-legal.md](../Execution/P15/_OPEN-legal.md) | Owner procedure: Legal, tax and brand (T1072, ROADMAP A3) |
| [Execution/P15/_OPEN-owner-checks.md](../Execution/P15/_OPEN-owner-checks.md) | Owner procedure: Other owner checks and clean-ups (T1072, ROADMAP A3) |
| [Execution/P15/_OPEN-product-decisions.md](../Execution/P15/_OPEN-product-decisions.md) | Owner procedure: Product and design decisions only you can make (T1072, ROADMAP A3) |
| [Execution/P15/_OPEN-scraper-health.md](../Execution/P15/_OPEN-scraper-health.md) | Owner and box steps: scraper health (T1074, T1075) |
| [Execution/P15/_OPEN-search-console.md](../Execution/P15/_OPEN-search-console.md) | Owner procedure: Google Search Console (K2, T1076) |
| [Execution/P15/_OPEN-secrets-rotation.md](../Execution/P15/_OPEN-secrets-rotation.md) | Owner procedure: secrets rotation and MFA (T1059, ROADMAP C2 and N3) |
| [Execution/P15/_OPEN-stays-box.md](../Execution/P15/_OPEN-stays-box.md) | Owner steps: the box rebuilds stay prices each month (T1021) |
| [Execution/P15/_OPEN-stripe.md](../Execution/P15/_OPEN-stripe.md) | Owner procedure: Stripe (T1072, ROADMAP A3) |
| [Execution/P15/_OPEN-supabase-migrations.md](../Execution/P15/_OPEN-supabase-migrations.md) | Owner procedure: Supabase: SQL pastes, Edge Functions and secrets (T1072, ROADMAP A3) |
| [Execution/P15/_OPEN-translation-review.md](../Execution/P15/_OPEN-translation-review.md) | Owner procedure: Translation review by native readers (T1072, ROADMAP A3) |
| [Execution/P15/_OPEN-uploads.md](../Execution/P15/_OPEN-uploads.md) | Owner procedure: switch on the upload path (T1070, rows T333-a and T1070-a) |
| [Execution/P15/_OPEN-web-hardening.md](../Execution/P15/_OPEN-web-hardening.md) | Owner procedure: web and API hardening (T1079, C5) |
| [Execution/P15/_PLAN-plan-flow-v3.md](../Execution/P15/_PLAN-plan-flow-v3.md) | Plan flow v3: build plan |
| [Execution/P15/_PLAN-trip-page-v4.md](../Execution/P15/_PLAN-trip-page-v4.md) | Trip page v4: one page you change in place |
| [Execution/P15/_RUN-plan-flow-v3.md](../Execution/P15/_RUN-plan-flow-v3.md) | Plan flow v3: overnight run log |
| [Execution/P15/_SESSIONS-ROUND-2.md](../Execution/P15/_SESSIONS-ROUND-2.md) | Round 2: the 50 sessions after S44 |
| [Execution/P15/T1000-stale-tab-reload.md](../Execution/P15/T1000-stale-tab-reload.md) | T1000: a tab open across a deploy reloads instead of crashing |
| [Execution/P15/T1001-new-trip-trip-bar.md](../Execution/P15/T1001-new-trip-trip-bar.md) | T1001: New trip without a tile, and a trip bar that never cuts a value |
| [Execution/P15/T1002-door-fit.md](../Execution/P15/T1002-door-fit.md) | T1002: Carta's own trips door, whole photographs and its own width |
| [Execution/P15/T1003-trip-page-passes-cost-card.md](../Execution/P15/T1003-trip-page-passes-cost-card.md) | T1003: Still to book as passes, and a new What it costs card |
| [Execution/P15/T1004-compact-cost-swipe.md](../Execution/P15/T1004-compact-cost-swipe.md) | T1004: a more compact cost card, and Previous and Next on the passes |
| [Execution/P15/T1005-trip-map-journey.md](../Execution/P15/T1005-trip-map-journey.md) | T1005: the trip drawn on Europe, and Your route as a journey |
| [Execution/P15/T1006-compact-route-delta.md](../Execution/P15/T1006-compact-route-delta.md) | T1006: a more compact route, and the price change as a mark |
| [Execution/P15/T1007-itinerary-costs-tabs.md](../Execution/P15/T1007-itinerary-costs-tabs.md) | T1007: the Itinerary and Costs tabs in the Overview's language |
| [Execution/P15/T1008-compact-itinerary.md](../Execution/P15/T1008-compact-itinerary.md) | T1008: the Itinerary, compact |
| [Execution/P15/T1009-itinerary-labelled.md](../Execution/P15/T1009-itinerary-labelled.md) | T1009: the Itinerary labelled, after a research round |
| [Execution/P15/T1010-lodging-hop.md](../Execution/P15/T1010-lodging-hop.md) | T1010: the Itinerary's lodging and hop, tightened |
| [Execution/P15/T1011-dock-kit-export-before.md](../Execution/P15/T1011-dock-kit-export-before.md) | T1011: the dock, the trip kit, Export & share and Before you go |
| [Execution/P15/T1012-chips-export-prices-expenses.md](../Execution/P15/T1012-chips-export-prices-expenses.md) | T1012: between-stop chips, a quieter Export & share, prices forward, group expenses out |
| [Execution/P15/T1013-export-grid-receipt.md](../Execution/P15/T1013-export-grid-receipt.md) | T1013: Export & share structured, the Costs receipt aligned |
| [Execution/P15/T1014-export-flat.md](../Execution/P15/T1014-export-flat.md) | T1014: Export & share on the page ground |
| [Execution/P15/T1015-notes-tab.md](../Execution/P15/T1015-notes-tab.md) | T1015: the Notes tab works, as notes and documents |
| [Execution/P15/T1016-notes-lines.md](../Execution/P15/T1016-notes-lines.md) | T1016: two lines off the Notes tab |
| [Execution/P15/T1017-days-prompt-names.md](../Execution/P15/T1017-days-prompt-names.md) | T1017: the days prompt's ways by name only |
| [Execution/P15/T1018-price-feel.md](../Execution/P15/T1018-price-feel.md) | T1018: Eat and drink shows how pricey eating out is here, not seven prices to the cent |
| [Execution/P15/T1019-dest-price-card.md](../Execution/P15/T1019-dest-price-card.md) | T1019: the place page's price card in the plan tab's language |
| [Execution/P15/T1020-flights-note-off.md](../Execution/P15/T1020-flights-note-off.md) | T1020: the price card's flights drop the source line |
| [Execution/P15/T1021-stays-scrape-only.md](../Execution/P15/T1021-stays-scrape-only.md) | T1021: stay prices come from the Booking and Hostelworld scrape alone |
| [Execution/P15/T1022-when-stay.md](../Execution/P15/T1022-when-stay.md) | T1022: When to go and Where to stay, redesigned on the scrape |
| [Execution/P15/T1023-margins-stay-labels.md](../Execution/P15/T1023-margins-stay-labels.md) | T1023: wider page margins, prices on the stay bars, no stay sublines |
| [Execution/P15/T1024-place-head.md](../Execution/P15/T1024-place-head.md) | T1024: the top of the place page, redesigned |
| [Execution/P15/T1025-place-head-compact.md](../Execution/P15/T1025-place-head-compact.md) | T1025: the place page head, full-width photos and the tabs on the first screen |
| [Execution/P15/T1026-trip-card.md](../Execution/P15/T1026-trip-card.md) | T1026: the place page's price card becomes one interactive trip card |
| [Execution/P15/T1027-practical-cards.md](../Execution/P15/T1027-practical-cards.md) | T1027: the place page's Practical section as swipe cards |
| [Execution/P15/T1028-practical-one-system.md](../Execution/P15/T1028-practical-one-system.md) | T1028: Practical as one card system |
| [Execution/P15/T1029-T1030-rating-before-you-go.md](../Execution/P15/T1029-T1030-rating-before-you-go.md) | T1029-T1030: why a place rates what it rates; What to bring and Where to park |
| [Execution/P15/T1030-one-carta-trips.md](../Execution/P15/T1030-one-carta-trips.md) | T1030: one Carta's own trips, Plan's page |
| [Execution/P15/T1031-rating-sheet-plain.md](../Execution/P15/T1031-rating-sheet-plain.md) | T1031: the rating sheet in plain words; no park-and-ride subline |
| [Execution/P15/T1032-see-cards-map.md](../Execution/P15/T1032-see-cards-map.md) | T1032: What to see and Best things to do as photo cards; a photo map |
| [Execution/P15/T1033-around-tabs.md](../Execution/P15/T1033-around-tabs.md) | T1033: Around as one block of kind tabs, how far, and the Explore rail |
| [Execution/P15/T1035-near-pages.md](../Execution/P15/T1035-near-pages.md) | T1035: Around as kind tiles, each opening its own page |
| [Execution/P15/T1036-day-trips.md](../Execution/P15/T1036-day-trips.md) | T1036: Day trips as the Explore rail of photo cards |
| [Execution/P15/T1037-page-bars.md](../Execution/P15/T1037-page-bars.md) | T1037: page bars on the page's ground; Plan's inner screens without the app head |
| [Execution/P15/T1038-T1039-explore-tabs-outdoor-pages.md](../Execution/P15/T1038-T1039-explore-tabs-outdoor-pages.md) | T1038-T1039: Explore's outdoor tabs tidied; the outdoor pages follow the place page |
| [Execution/P15/T1041-desktop-widths.md](../Execution/P15/T1041-desktop-widths.md) | T1041: one desktop width system for every tab |
| [Execution/P15/T1042-prune-keep-flights.md](../Execution/P15/T1042-prune-keep-flights.md) | T1042: the deploy's prune no longer deletes the flight sweep's files |
| [Execution/P15/T1043-sweep-night-half.md](../Execution/P15/T1043-sweep-night-half.md) | T1043: the flight-sweep Worker at half speed from 22:00 to 05:00 UTC |
| [Execution/P15/T1044-plan-home-head.md](../Execution/P15/T1044-plan-home-head.md) | T1044: Plan home head and Up next, refined |
| [Execution/P15/T1045-handbook-and-roadmap.md](../Execution/P15/T1045-handbook-and-roadmap.md) | T1045: Carta Handbook and the roadmap to production |
| [Execution/P15/T1046-full-app-audit.md](../Execution/P15/T1046-full-app-audit.md) | T1046: Full app audit, November 2026 |
| [Execution/P15/T1047-launch-plan-phases.md](../Execution/P15/T1047-launch-plan-phases.md) | T1047: Launch plan in quality-first phases, marketing and affiliates |
| [Execution/P15/T1048-late-registration-diy.md](../Execution/P15/T1048-late-registration-diy.md) | T1048: Late registration, no accountant, no lawyer |
| [Execution/P15/T1049-fast-track-and-claude-context.md](../Execution/P15/T1049-fast-track-and-claude-context.md) | T1049: Fast track and lean Claude context |
| [Execution/P15/T1050-T1051-docs-start-over-and-claude-context.md](../Execution/P15/T1050-T1051-docs-start-over-and-claude-context.md) | T1050-T1051: Docs start over and lean Claude context |
| [Execution/P15/T1052-data-access-ladder.md](../Execution/P15/T1052-data-access-ladder.md) | T1052: Data access ladder and the bed-price decision |
| [Execution/P15/T1053-T1060-p0-batch.md](../Execution/P15/T1053-T1060-p0-batch.md) | T1053-T1060: P0 batch (Fix now, CI, secrets, positioning) |
| [Execution/P15/T1061-ci-green.md](../Execution/P15/T1061-ci-green.md) | T1061: CI green on GitHub |
| [Execution/P15/T1062-T1066-copy-focus-upgrades.md](../Execution/P15/T1062-T1066-copy-focus-upgrades.md) | T1062 to T1066: copy and focus fixes, jspdf 4, maplibre 6 |
| [Execution/P15/T1068-quarantine-fixes.md](../Execution/P15/T1068-quarantine-fixes.md) | T1068: quarantine fixes (T1057-a, ROADMAP H1) |
| [Execution/P15/T1068-T1076-p1-batch.md](../Execution/P15/T1068-T1076-p1-batch.md) | T1068 to T1076: P1 batch |
| [Execution/P15/T1069-threat-model.md](../Execution/P15/T1069-threat-model.md) | T1069: threat model (ROADMAP C1) |
| [Execution/P15/T1070-upload-migration.md](../Execution/P15/T1070-upload-migration.md) | T1070: the upload path's server half (register row T333-a) |
| [Execution/P15/T1071-auth-access.md](../Execution/P15/T1071-auth-access.md) | T1071: auth and access, the code half (ROADMAP C3) |
| [Execution/P15/T1072-register-triage.md](../Execution/P15/T1072-register-triage.md) | T1072: register triage (ROADMAP A3) |
| [Execution/P15/T1073-docs-tree.md](../Execution/P15/T1073-docs-tree.md) | T1073: Docs tree and area docs (ROADMAP B2) |
| [Execution/P15/T1074-scraper-health.md](../Execution/P15/T1074-scraper-health.md) | T1074: Scraper and source health (ROADMAP D5) |
| [Execution/P15/T1075-prices-honest.md](../Execution/P15/T1075-prices-honest.md) | T1075: Prices completed, the part that is not owner-gated (ROADMAP D10) |
| [Execution/P15/T1076-seo-plumbing.md](../Execution/P15/T1076-seo-plumbing.md) | T1076: SEO plumbing and the page quality gate (K2) |
| [Execution/P15/T1077-trip-heroes.md](../Execution/P15/T1077-trip-heroes.md) | T1077: trip heroes over the 1600px floor (T230-a) |
| [Execution/P15/T1078-rls-coverage.md](../Execution/P15/T1078-rls-coverage.md) | T1078: row policy coverage for every table, signed-out reads that answer, no service key in the bundle (ROADMA |
| [Execution/P15/T1078-T1083-security-batch.md](../Execution/P15/T1078-T1083-security-batch.md) | T1078 to T1083: security batch |
| [Execution/P15/T1079-web-hardening.md](../Execution/P15/T1079-web-hardening.md) | T1079: Web and API hardening (ROADMAP C5) |
| [Execution/P15/T1080-supply-chain.md](../Execution/P15/T1080-supply-chain.md) | T1080: Supply chain (ROADMAP C6) |
| [Execution/P15/T1081-admin-reasons.md](../Execution/P15/T1081-admin-reasons.md) | T1081: a required reason on ban, delete and set tier; the upload scan secrets on record |
| [Execution/P15/T1082-cleanup.md](../Execution/P15/T1082-cleanup.md) | T1082: Live-stays leftovers and admin test scripts |
| [Execution/P15/T1083-register-triage.md](../Execution/P15/T1083-register-triage.md) | T1083: register triage, second pass (ROADMAP A3, row T1072-a) |
| [Execution/P15/T1084-licence-registry.md](../Execution/P15/T1084-licence-registry.md) | T1084: licence registry current, two CI failures on PR #10 |
| [Execution/P15/T246-mobile-strategy-decision.md](../Execution/P15/T246-mobile-strategy-decision.md) | T246 Mobile strategy: stay a PWA, do not wrap |
| [Execution/P15/T605-home-research.md](../Execution/P15/T605-home-research.md) | T605: Home page research, references measured and today's page critiqued |
| [Execution/P15/T606-T610-home-v2.md](../Execution/P15/T606-T610-home-v2.md) | T606 to T610: the home page, rebuilt from scratch |
| [Execution/P15/T618-home-film-clips.md](../Execution/P15/T618-home-film-clips.md) | T618: the hero film plays licensed clips, then the home page ships |
| [Execution/P15/T619-css-routes-hold.md](../Execution/P15/T619-css-routes-hold.md) | T619: css-routes --check passes again |
| [Execution/P15/T620-home-hero-full.md](../Execution/P15/T620-home-hero-full.md) | T620: the home hero film fills the first screen |
| [Execution/P15/T621-home-hero-header.md](../Execution/P15/T621-home-hero-header.md) | T621: the home film runs the full width under a transparent header |
| [Execution/P15/T622-explore-head-refinements.md](../Execution/P15/T622-explore-head-refinements.md) | T622 Explore head refinements (owner review 2026-10-23) |
| [Execution/P15/T623-merge-and-hero-fixes.md](../Execution/P15/T623-merge-and-hero-fixes.md) | T623: merge the open branches and close T621-a, T621-b and T621-c |
| [Execution/P15/T630-T632-explore-completeness.md](../Execution/P15/T630-T632-explore-completeness.md) | T630 to T632: Explore detail sheets, step 1, completeness of information |
| [Execution/P15/T640-T648-explore-data-fill.md](../Execution/P15/T640-T648-explore-data-fill.md) | T640 to T648: Explore data fill, step 2 (set up for the Monday box run) |
| [Execution/P15/T649-T652-key-stats-dynamic.md](../Execution/P15/T649-T652-key-stats-dynamic.md) | T649 to T652: Explore step 4, dynamic key stats |
| [Execution/P15/T653-T660-trip-planner-flow.md](../Execution/P15/T653-T660-trip-planner-flow.md) | T653 to T660: the trip planner flow (batch 1 of the planner rebuild) |
| [Execution/P15/T661-T666-price-pb1-engine.md](../Execution/P15/T661-T666-price-pb1-engine.md) | T661 to T666: price engine PB1, baseline (F1) and one engine for the day price (F2) |
| [Execution/P15/T667-when-says-any-time.md](../Execution/P15/T667-when-says-any-time.md) | T667: the settings line's When says what the prices are for |
| [Execution/P15/T668-T677-day-planner.md](../Execution/P15/T668-T677-day-planner.md) | T668 to T677: the day planner, and the trip planner's open rows (batch 2 of the planner rebuild) |
| [Execution/P15/T678-v2-scan-path.md](../Execution/P15/T678-v2-scan-path.md) | T678: the V2 price scan under a path with a space |
| [Execution/P15/T689-T698-price-pb2-config-display.md](../Execution/P15/T689-T698-price-pb2-config-display.md) | T689 to T698: price engine PB2, one configuration (F3) and what the price says (F4) |
| [Execution/P15/T699-T713-price-pb3-place-trip.md](../Execution/P15/T699-T713-price-pb3-place-trip.md) | T699 to T713: price engine PB3, the price in the right place (F5) and the trip price from the engine (F6) |
| [Execution/P15/T714-T716-price-pb5-transport-activities-quality.md](../Execution/P15/T714-T716-price-pb5-transport-activities-quality.md) | T714 to T716: price engine PB5, local transport (F8), activities (F9) and data quality (F10); PB4 blocked |
| [Execution/P15/T731-T735-planner-finalize.md](../Execution/P15/T731-T735-planner-finalize.md) | T731 to T735: the planner's open calls decided, and the branch made ready to merge |
| [Execution/P15/T736-planner-merge-pb3.md](../Execution/P15/T736-planner-merge-pb3.md) | T736: price engine PB3 merged into the planner branch |
| [Execution/P15/T737-planner-merge-pb5.md](../Execution/P15/T737-planner-merge-pb5.md) | T737: price engine PB5 merged into the planner branch |
| [Execution/P15/T738-merge-push-deploy-planner.md](../Execution/P15/T738-merge-push-deploy-planner.md) | T738: every open branch looked at; the planner rebuild merged, pushed and deployed |
| [Execution/P15/T740-box-run-1-airport-gate-sea-temp.md](../Execution/P15/T740-box-run-1-airport-gate-sea-temp.md) | T740: the first Monday box run read, and its two failures fixed |
| [Execution/P15/T743-plan-opening.md](../Execution/P15/T743-plan-opening.md) | T743: the Plan opening, a page on warm paper with the planned trips to start from |
| [Execution/P15/T744-plan-opening-one-screen.md](../Execution/P15/T744-plan-opening-one-screen.md) | T744: the Plan opening on one screen, in the app's face, with photographs and one price |
| [Execution/P15/T745-plan-opening-weeks.md](../Execution/P15/T745-plan-opening-weeks.md) | T745: the Plan opening's photographs become three planned weeks in season, and a new headline |
| [Execution/P15/T746-plan-opening-play-a-day.md](../Execution/P15/T746-plan-opening-play-a-day.md) | T746: the Plan opening's two actions lead, and one planned day plays on one photograph |
| [Execution/P15/T747-plan-opening-carta-trips.md](../Execution/P15/T747-plan-opening-carta-trips.md) | T747: the Plan opening's way to Carta's own trips: a fan of trip photographs, the mark and one button |
| [Execution/P15/T748-plan-steps-no-map.md](../Execution/P15/T748-plan-steps-no-map.md) | T748: the planner steps lose the map, and the first step its booking sentence |
| [Execution/P15/T749-plan-booked-step.md](../Execution/P15/T749-plan-booked-step.md) | T749: "What have you booked already?" gets its plane icon and loses "Carta plans around it" |
| [Execution/P15/T750-plan-lifestyle-step.md](../Execution/P15/T750-plan-lifestyle-step.md) | T750: "How do you like to travel?" holds the whole Lifestyle, compact on a phone |
| [Execution/P15/T751-plan-visibility-empty-route.md](../Execution/P15/T751-plan-visibility-empty-route.md) | T751: Who can see it as three chips, the invite sentence removed, and an empty route that does not look like l |
| [Execution/P15/T752-plan-route-doors-carta-trips.md](../Execution/P15/T752-plan-route-doors-carta-trips.md) | T752: Plan your route, the country picker in Explore's language, and one page for Carta's own trips |
| [Execution/P15/T753-plan-shape-budget.md](../Execution/P15/T753-plan-shape-budget.md) | T753: What kind of trip takes several answers, and the budget is one figure for the whole trip |
| [Execution/P15/T792-T796-trip-finder-engine.md](../Execution/P15/T792-T796-trip-finder-engine.md) | T792 to T796: the trip finder engine (batch TF1) |
| [Execution/P15/T797-T801-trip-finder-screens.md](../Execution/P15/T797-T801-trip-finder-screens.md) | T797 to T801: the trip finder screens (batch TF2) |
| [Execution/P15/T802-T803-trip-finder-compare-levers.md](../Execution/P15/T802-T803-trip-finder-compare-levers.md) | T802 to T803: compare and levers on Trips for you (batch TF3) |
| [Execution/P15/T806-T808-trip-finder-keep-watch-together.md](../Execution/P15/T806-T808-trip-finder-keep-watch-together.md) | T806 to T808: keep, watch and decide together (batch TF4) |
| [Execution/P15/T809-T815-plan-flow-v2.md](../Execution/P15/T809-T815-plan-flow-v2.md) | T809 to T815: the Plan flow after Help me choose, made clean (batch Plan flow v2) |
| [Execution/P15/T816-T817-review-total-airline-names.md](../Execution/P15/T816-T817-review-total-airline-names.md) | T816 and T817: Review's total equals the planned trip's, and the summary's airline names |
| [Execution/P15/T818-finder-total-to-the-cent.md](../Execution/P15/T818-finder-total-to-the-cent.md) | T818: the trip finder's totals equal the planner's, to the cent |
| [Execution/P15/T819-T826-trip-page-v3.md](../Execution/P15/T819-T826-trip-page-v3.md) | T819 to T826: one trip page in tabs, Edit trip on one edge, Carta plans every day, Carta's trips like Explore, |
| [Execution/P15/T827-T831-trip-page-v3-fixes.md](../Execution/P15/T827-T831-trip-page-v3-fixes.md) | T827 to T831: the five open items of the trip page v3 batch |
| [Execution/P15/T832-remove-old-edit-workspace.md](../Execution/P15/T832-remove-old-edit-workspace.md) | T832: remove the old half-screen edit workspace |
| [Execution/P15/T833-merge-push-deploy-trip-page-v3.md](../Execution/P15/T833-merge-push-deploy-trip-page-v3.md) | T833: trip page v3 (T819 to T832) merged, pushed and deployed |
| [Execution/P15/T834-board/marks.md](../Execution/P15/T834-board/marks.md) | Owner marks on the trip page v4 board |
| [Execution/P15/T834-trip-page-v4-board.md](../Execution/P15/T834-trip-page-v4-board.md) | T834: trip page v4 board |
| [Execution/P15/T835-T839-trip-page-v4-a.md](../Execution/P15/T835-T839-trip-page-v4-a.md) | T835 to T839: trip page v4 Batch A, edit in place with no edit mode |
| [Execution/P15/T840-T843-trip-page-v4-b.md](../Execution/P15/T840-T843-trip-page-v4-b.md) | T840 to T843: trip page v4 Batch B, the route you can reshape |
| [Execution/P15/T844-route-flight-checked-line.md](../Execution/P15/T844-route-flight-checked-line.md) | T844: no "Google Flights, checked" line on the trip page's flight cards |
| [Execution/P15/T845-T847-trip-page-v4-c.md](../Execution/P15/T845-T847-trip-page-v4-c.md) | T845 to T847: trip page v4 Batch C, Costs, budget and Share |
| [Execution/P15/T848-costs-head-total-only.md](../Execution/P15/T848-costs-head-total-only.md) | T848: the Costs head is the total for the party only |
| [Execution/P15/T849-T851-trip-page-v4-d.md](../Execution/P15/T849-T851-trip-page-v4-d.md) | T849 to T851: trip page v4 Batch D, the Days tab |
| [Execution/P15/T852-merge-trip-page-v4.md](../Execution/P15/T852-merge-trip-page-v4.md) | T852: merge trip page v4 (Batches A to D), no deploy |
| [Execution/P15/T853-css-routes-hold-v4.md](../Execution/P15/T853-css-routes-hold-v4.md) | T853: keep the CSS route split proven for the trip page v4 deploy |
| [Execution/P15/T854-deploy-trip-page-v4.md](../Execution/P15/T854-deploy-trip-page-v4.md) | T854: trip page v4 pushed and deployed |
| [Execution/P15/T855-T856-plan-flow-v3-answers.md](../Execution/P15/T855-T856-plan-flow-v3-answers.md) | T855 to T856: plan flow v3 Batch A, carry every answer |
| [Execution/P15/T857-T859-plan-flow-v3-tell.md](../Execution/P15/T857-T859-plan-flow-v3-tell.md) | T857 to T859: plan flow v3 Batch B, Tell Carta |
| [Execution/P15/T860-T862-plan-flow-v3-from-stay.md](../Execution/P15/T860-T862-plan-flow-v3-from-stay.md) | T860 to T862: plan flow v3 Batch C, leaving from and stays |
| [Execution/P15/T863-T866-plan-flow-v3-doors.md](../Execution/P15/T863-T866-plan-flow-v3-doors.md) | T863 to T866: plan flow v3 Batch D, how much Carta plans |
| [Execution/P15/T867-T869-plan-flow-v3-results.md](../Execution/P15/T867-T869-plan-flow-v3-results.md) | T867 to T869: plan flow v3 Batch E, searching and results |
| [Execution/P15/T870-T873-plan-flow-v3-trip-page.md](../Execution/P15/T870-T873-plan-flow-v3-trip-page.md) | T870 to T873: plan flow v3 Batch F, the trip page and after the pick |
| [Execution/P15/T874-plan-flow-v3-end-to-end.md](../Execution/P15/T874-plan-flow-v3-end-to-end.md) | T874: plan flow v3 Batch G, end to end |
| [Execution/P15/T875-deploy-plan-flow-v3.md](../Execution/P15/T875-deploy-plan-flow-v3.md) | T875: plan flow v3 merged, pushed and deployed |
| [Execution/P15/T876-plan-flow-walk.md](../Execution/P15/T876-plan-flow-walk.md) | T876: plan flow walk fixes with the owner, deployed |
| [Execution/P15/T877-traveller-persona.md](../Execution/P15/T877-traveller-persona.md) | T877: the traveller persona in Help me choose and in the trip finder's scoring, deployed |
| [Execution/P15/T878-persona-design-freedom.md](../Execution/P15/T878-persona-design-freedom.md) | T878: the persona question redesigned under the owner's design freedom, ten personas, deployed |
| [Execution/P15/T879-T884-trips-for-you-v2.md](../Execution/P15/T879-T884-trips-for-you-v2.md) | T879 to T884: Trips for you v2, the free direction |
| [Execution/P15/T885-T890-trip-page-v5.md](../Execution/P15/T885-T890-trip-page-v5.md) | T885 to T890: the trip page v5, one calm page |
| [Execution/P15/T891-T894-plan-flow-studio.md](../Execution/P15/T891-T894-plan-flow-studio.md) | T891 to T894: the plan flow studio and the ten travellers |
| [Execution/P15/T895-T900-plan-days.md](../Execution/P15/T895-T900-plan-days.md) | T895 to T900: plan your days, the Carta bot as a chat, all days and one day |
| [Execution/P15/T901-T904-plan-home.md](../Execution/P15/T901-T904-plan-home.md) | T901 to T904: the Plan home and Carta's own trips |
| [Execution/P15/T905-phone-header.md](../Execution/P15/T905-phone-header.md) | T905: the phone header with the logo and Account, three places below |
| [Execution/P15/T906-T910-explore-refined.md](../Execution/P15/T906-T910-explore-refined.md) | T906 to T910: Explore, one search field and rows that read at a glance |
| [Execution/P15/T911-T914-place-pages.md](../Execution/P15/T911-T914-place-pages.md) | T911 to T914: place and trip pages on one template, the new data, the PDF guides |
| [Execution/P15/T918-T922-outdoor-pages.md](../Execution/P15/T918-T922-outdoor-pages.md) | T918 to T922: the five outdoor pages on the place template, and their data |
| [Execution/P15/T923-T927-my-trips.md](../Execution/P15/T923-T927-my-trips.md) | T923 to T927: My trips, rebuilt as the next trip, Saved lists and Your Europe |
| [Execution/P15/T928-T932-together.md](../Execution/P15/T928-T932-together.md) | T928 to T932: Together, the friends layer |
| [Execution/P15/T933-T936-account.md](../Execution/P15/T933-T936-account.md) | T933 to T936: Account rebuilt as one hub |
| [Execution/P15/T937-T947-owner-decisions.md](../Execution/P15/T937-T947-owner-decisions.md) | T937 to T947: the owner's decisions, built |
| [Execution/P15/T948-T953-home-v3.md](../Execution/P15/T948-T953-home-v3.md) | T948 to T953: the home page, three acts with Motion |
| [Execution/P15/T954-deploy-home-v3.md](../Execution/P15/T954-deploy-home-v3.md) | T954: deploy main (home page v3) to Cloudflare Pages |
| [Execution/P15/T955-T959-home-polish.md](../Execution/P15/T955-T959-home-polish.md) | T955 to T959: the home page polish (proof, tour, clips, Try it, plans) |
| [Execution/P15/T960-T966-search-dock.md](../Execution/P15/T960-T966-search-dock.md) | T960 to T966: the phone search dock, Carta's own trips, outdoor tabs on the dock |
| [Execution/P15/T967-own-trips-polish.md](../Execution/P15/T967-own-trips-polish.md) | T967: Carta's own trips, owner polish |
| [Execution/P15/T968-compact-rails.md](../Execution/P15/T968-compact-rails.md) | T968: compact rails on a phone |
| [Execution/P15/T968-T970-my-trips-clean.md](../Execution/P15/T968-T970-my-trips-clean.md) | T968-T970: My trips, cleaned up, with the dock and a real map of Europe |
| [Execution/P15/T971-T973-my-trips-map-follow-up.md](../Execution/P15/T971-T973-my-trips-map-follow-up.md) | T971-T973: My trips follow-up: tidy, tap to mark, DESIGN.md |
| [Execution/P15/T980-T983-header-explore-compact.md](../Execution/P15/T980-T983-header-explore-compact.md) | T980-T983: the phone header on My trips, an empty Trips tab, and a tighter Explore |
| [Execution/P15/T984-past-trips-empty.md](../Execution/P15/T984-past-trips-empty.md) | T984: an empty Past trips is one add tile |
| [Execution/P15/T985-migrations-052-060-live.md](../Execution/P15/T985-migrations-052-060-live.md) | T985: migrations 052 to 060 live |
| [Execution/P15/T986-together-clean.md](../Execution/P15/T986-together-clean.md) | T986: Together, cleaner and built like the proposal |
| [Execution/P15/T987-together-tidy.md](../Execution/P15/T987-together-tidy.md) | T987: Together, tidier for an account with little in it |
| [Execution/P15/T988-plan-home-clean.md](../Execution/P15/T988-plan-home-clean.md) | T988: the Plan home with trips, cleaner |
| [Execution/P15/T989-T991-plan-mytrips-together.md](../Execution/P15/T989-T991-plan-mytrips-together.md) | T989 to T991: Plan, My trips and Together, cleaner |
| [Execution/P15/T998-design-lint-plan-home.md](../Execution/P15/T998-design-lint-plan-home.md) | T998: design-lint on the Plan home and TripArt |
| [Execution/P15/T999-one-ground-tiles.md](../Execution/P15/T999-one-ground-tiles.md) | T999: one ground, no seams, and the Plan home's two tiles |

**Execution/P2/** (3)

| File | Title |
|---|---|
| [Execution/P2/_DIGEST.md](../Execution/P2/_DIGEST.md) | P2 digest |
| [Execution/P2/_OPEN-gemini-billing.md](../Execution/P2/_OPEN-gemini-billing.md) | Open items after T035 to T038: what the owner must do for the Gemini billing posture |
| [Execution/P2/_OPEN-stripe-launch.md](../Execution/P2/_OPEN-stripe-launch.md) | Open items after T030 to T034: what the owner must do before a first sale |

**Execution/P3/** (3)

| File | Title |
|---|---|
| [Execution/P3/_DIGEST.md](../Execution/P3/_DIGEST.md) | P3 digest |
| [Execution/P3/_OPEN-hetzner.md](../Execution/P3/_OPEN-hetzner.md) | Open items for the Hetzner build boxes: what the owner must do, in order |
| [Execution/P3/T1031-T1032-beach-step-cap.md](../Execution/P3/T1031-T1032-beach-step-cap.md) | T1031 to T1032: the beach step can no longer hold a Monday run for days |

**Execution/P4/** (1)

| File | Title |
|---|---|
| [Execution/P4/_DIGEST.md](../Execution/P4/_DIGEST.md) | P4 digest |

**Execution/P5/** (1)

| File | Title |
|---|---|
| [Execution/P5/_DIGEST.md](../Execution/P5/_DIGEST.md) | P5 digest |

**Execution/P6/** (1)

| File | Title |
|---|---|
| [Execution/P6/_DIGEST.md](../Execution/P6/_DIGEST.md) | P6 digest |

**Execution/P7/** (1)

| File | Title |
|---|---|
| [Execution/P7/_DIGEST.md](../Execution/P7/_DIGEST.md) | P7 digest |

**Execution/P8/** (1)

| File | Title |
|---|---|
| [Execution/P8/_DIGEST.md](../Execution/P8/_DIGEST.md) | P8 digest |

**Execution/P9/** (2)

| File | Title |
|---|---|
| [Execution/P9/_DIGEST.md](../Execution/P9/_DIGEST.md) | P9 digest |
| [Execution/P9/_OPEN-paid-runs.md](../Execution/P9/_OPEN-paid-runs.md) | Paid runs, last in the order |

**Trips/** (4)

| File | Title |
|---|---|
| [Trips/carta-trips-enhancement-spec.md](../Trips/carta-trips-enhancement-spec.md) | Carta, trips section enhancement spec |
| [Trips/gap-matrix.md](../Trips/gap-matrix.md) | Carta, coverage and gap matrix |
| [Trips/README_1.md](../Trips/README_1.md) | Carta, unified European trip dataset |
| [Trips/validation-report.md](../Trips/validation-report.md) | Carta, master dataset validation report |

**Trips/carta-unified/** (9)

| File | Title |
|---|---|
| [Trips/carta-unified/carta-unified/pipeline/prompts/k10-packing-risk.md](../Trips/carta-unified/carta-unified/pipeline/prompts/k10-packing-risk.md) |  |
| [Trips/carta-unified/carta-unified/pipeline/prompts/k2-numbers.md](../Trips/carta-unified/carta-unified/pipeline/prompts/k2-numbers.md) |  |
| [Trips/carta-unified/carta-unified/pipeline/prompts/k2-prose.md](../Trips/carta-unified/carta-unified/pipeline/prompts/k2-prose.md) |  |
| [Trips/carta-unified/carta-unified/pipeline/prompts/k2-skeleton.md](../Trips/carta-unified/carta-unified/pipeline/prompts/k2-skeleton.md) |  |
| [Trips/carta-unified/carta-unified/pipeline/prompts/k4-critic.md](../Trips/carta-unified/carta-unified/pipeline/prompts/k4-critic.md) |  |
| [Trips/carta-unified/carta-unified/README.md](../Trips/carta-unified/carta-unified/README.md) | Carta, unified European trip dataset |
| [Trips/carta-unified/carta-unified/reports/gap-matrix.md](../Trips/carta-unified/carta-unified/reports/gap-matrix.md) | Carta, coverage and gap matrix |
| [Trips/carta-unified/carta-unified/reports/validation-report.md](../Trips/carta-unified/carta-unified/reports/validation-report.md) | Carta master dataset validation report |
| [Trips/carta-unified/carta-unified/schema/SCHEMA.md](../Trips/carta-unified/carta-unified/schema/SCHEMA.md) | Carta, unified trip schema (v2.0) |

**continent-app/** (3)

| File | Title |
|---|---|
| [continent-app/README.md](../continent-app/README.md) | Carta, Europe Travel App |
| [continent-app/reports/persona_check_v5.md](../continent-app/reports/persona_check_v5.md) | Persona check, rating v5, gate 7 (T765) |
| [continent-app/workers/shared/fli/VENDORED.md](../continent-app/workers/shared/fli/VENDORED.md) | fli-js, vendored |

**data/curation/** (7)

| File | Title |
|---|---|
| [data/curation/features_review_summary.md](../data/curation/features_review_summary.md) | Natural features review, 43 countries |
| [data/curation/research/_sources_beaches.md](../data/curation/research/_sources_beaches.md) | Beaches: harvestable source research |
| [data/curation/research/_sources_images.md](../data/curation/research/_sources_images.md) | Source research: IMAGES for curated features |
| [data/curation/research/_sources_mountains.md](../data/curation/research/_sources_mountains.md) | Source research: mountains |
| [data/curation/research/_sources_ranking.md](../data/curation/research/_sources_ranking.md) | Ranking sources: how to decide "the most beautiful" defensibly |
| [data/curation/research/_sources_trails.md](../data/curation/research/_sources_trails.md) | Sources research: trails (walk, hike, trail run) |
| [data/curation/research/_sources_trips.md](../data/curation/research/_sources_trips.md) | Sources research: trips (best day trips and city days per country) |

**data/reports/** (45)

| File | Title |
|---|---|
| [data/reports/coverage/AD.md](../data/reports/coverage/AD.md) | AD: missing destinations |
| [data/reports/coverage/AL.md](../data/reports/coverage/AL.md) | AL: missing destinations |
| [data/reports/coverage/AT.md](../data/reports/coverage/AT.md) | AT: missing destinations |
| [data/reports/coverage/BA.md](../data/reports/coverage/BA.md) | BA: missing destinations |
| [data/reports/coverage/BE.md](../data/reports/coverage/BE.md) | BE: missing destinations |
| [data/reports/coverage/BG.md](../data/reports/coverage/BG.md) | BG: missing destinations |
| [data/reports/coverage/CH.md](../data/reports/coverage/CH.md) | CH: missing destinations |
| [data/reports/coverage/CY.md](../data/reports/coverage/CY.md) | CY: missing destinations |
| [data/reports/coverage/CZ.md](../data/reports/coverage/CZ.md) | CZ: missing destinations |
| [data/reports/coverage/DE.md](../data/reports/coverage/DE.md) | DE: missing destinations |
| [data/reports/coverage/DK.md](../data/reports/coverage/DK.md) | DK: missing destinations |
| [data/reports/coverage/EE.md](../data/reports/coverage/EE.md) | EE: missing destinations |
| [data/reports/coverage/ES.md](../data/reports/coverage/ES.md) | ES: missing destinations |
| [data/reports/coverage/FI.md](../data/reports/coverage/FI.md) | FI: missing destinations |
| [data/reports/coverage/FO.md](../data/reports/coverage/FO.md) | FO: missing destinations |
| [data/reports/coverage/FR.md](../data/reports/coverage/FR.md) | FR: missing destinations |
| [data/reports/coverage/GB.md](../data/reports/coverage/GB.md) | GB: missing destinations |
| [data/reports/coverage/GR.md](../data/reports/coverage/GR.md) | GR: missing destinations |
| [data/reports/coverage/HR.md](../data/reports/coverage/HR.md) | HR: missing destinations |
| [data/reports/coverage/HU.md](../data/reports/coverage/HU.md) | HU: missing destinations |
| [data/reports/coverage/IE.md](../data/reports/coverage/IE.md) | IE: missing destinations |
| [data/reports/coverage/IS.md](../data/reports/coverage/IS.md) | IS: missing destinations |
| [data/reports/coverage/IT.md](../data/reports/coverage/IT.md) | IT: missing destinations |
| [data/reports/coverage/LT.md](../data/reports/coverage/LT.md) | LT: missing destinations |
| [data/reports/coverage/LU.md](../data/reports/coverage/LU.md) | LU: missing destinations |
| [data/reports/coverage/LV.md](../data/reports/coverage/LV.md) | LV: missing destinations |
| [data/reports/coverage/MD.md](../data/reports/coverage/MD.md) | MD: missing destinations |
| [data/reports/coverage/ME.md](../data/reports/coverage/ME.md) | ME: missing destinations |
| [data/reports/coverage/MK.md](../data/reports/coverage/MK.md) | MK: missing destinations |
| [data/reports/coverage/MT.md](../data/reports/coverage/MT.md) | MT: missing destinations |
| [data/reports/coverage/NL.md](../data/reports/coverage/NL.md) | NL: missing destinations |
| [data/reports/coverage/NO.md](../data/reports/coverage/NO.md) | NO: missing destinations |
| [data/reports/coverage/PL.md](../data/reports/coverage/PL.md) | PL: missing destinations |
| [data/reports/coverage/PT.md](../data/reports/coverage/PT.md) | PT: missing destinations |
| [data/reports/coverage/RO.md](../data/reports/coverage/RO.md) | RO: missing destinations |
| [data/reports/coverage/RS.md](../data/reports/coverage/RS.md) | RS: missing destinations |
| [data/reports/coverage/SE.md](../data/reports/coverage/SE.md) | SE: missing destinations |
| [data/reports/coverage/SI.md](../data/reports/coverage/SI.md) | SI: missing destinations |
| [data/reports/coverage/SK.md](../data/reports/coverage/SK.md) | SK: missing destinations |
| [data/reports/coverage/SUMMARY.md](../data/reports/coverage/SUMMARY.md) | Catalogue coverage: what Europe has that Carta does not |
| [data/reports/coverage/XK.md](../data/reports/coverage/XK.md) | XK: missing destinations |
| [data/reports/coverage/XX.md](../data/reports/coverage/XX.md) | XX: missing destinations |
| [data/reports/field_stubs.md](../data/reports/field_stubs.md) | Field stubs |
| [data/reports/llm_runs_report.md](../data/reports/llm_runs_report.md) | Model-written intros and parking web check: final report |
| [data/reports/trails_coverage.md](../data/reports/trails_coverage.md) | Trails coverage: the famous-trail registry versus the wire |

**docs/** (8)

| File | Title |
|---|---|
| [docs/AUDIT-2026-11.md](AUDIT-2026-11.md) | Carta audit, November 2026 |
| [docs/glossary.md](glossary.md) | Glossary |
| [docs/HANDBOOK.md](HANDBOOK.md) | Carta Handbook |
| [docs/LAKES.md](LAKES.md) | The lake layer |
| [docs/reading-guide.md](reading-guide.md) | Reading guide: understanding Carta step by step |
| [docs/README.md](README.md) | Carta docs |
| [docs/REGIONS.md](REGIONS.md) | The region layer |
| [docs/SCHEMA.md](SCHEMA.md) | app_data schema |

**docs/ai/** (1)

| File | Title |
|---|---|
| [docs/ai/README.md](ai/README.md) | AI docs |

**docs/architecture/** (1)

| File | Title |
|---|---|
| [docs/architecture/README.md](architecture/README.md) | Architecture overview |

**docs/areas/** (27)

| File | Title |
|---|---|
| [docs/areas/admin.md](areas/admin.md) | Admin, moderation, telemetry |
| [docs/areas/ask-carta.md](areas/ask-carta.md) | Ask Carta (chat, RAG) |
| [docs/areas/build-box.md](areas/build-box.md) | Build box (Hetzner, scheduled runs) |
| [docs/areas/climate-crowds.md](areas/climate-crowds.md) | Climate, crowds, seasons |
| [docs/areas/data-wire.md](areas/data-wire.md) | Data wire (pipeline to app) |
| [docs/areas/day-planner.md](areas/day-planner.md) | Day planner and plan-day AI |
| [docs/areas/deploy.md](areas/deploy.md) | Deploy (Cloudflare Pages, R2) |
| [docs/areas/explore.md](areas/explore.md) | Explore (map, cards, filters, rails) |
| [docs/areas/flights.md](areas/flights.md) | Flights, fares, airports |
| [docs/areas/home.md](areas/home.md) | Home |
| [docs/areas/images.md](areas/images.md) | Images and photos |
| [docs/areas/languages.md](areas/languages.md) | Languages (6) |
| [docs/areas/licences.md](areas/licences.md) | Licences and data credits |
| [docs/areas/my-trips.md](areas/my-trips.md) | My trips, account, together |
| [docs/areas/outdoors.md](areas/outdoors.md) | Beaches, lakes, mountains, nature |
| [docs/areas/pass-paywall.md](areas/pass-paywall.md) | Pass, paywall, Stripe |
| [docs/areas/place-page.md](areas/place-page.md) | Place page and PDF |
| [docs/areas/plan-flow.md](areas/plan-flow.md) | Plan flow and wizard |
| [docs/areas/price-engine.md](areas/price-engine.md) | Price engine (bed, food, trip total) |
| [docs/areas/ratings.md](areas/ratings.md) | Ratings and For you |
| [docs/areas/README.md](areas/README.md) | Area docs |
| [docs/areas/regions.md](areas/regions.md) | Regions, countries, coverage |
| [docs/areas/stays.md](areas/stays.md) | Stays (Booking, Hostelworld scrape) |
| [docs/areas/tests-checks.md](areas/tests-checks.md) | Tests and checks |
| [docs/areas/trails-cycling.md](areas/trails-cycling.md) | Trails, cycling, routes |
| [docs/areas/trip-library.md](areas/trip-library.md) | Trip library, journeys, trip finder |
| [docs/areas/trip-page.md](areas/trip-page.md) | Trip page (the traveller's planned trip) |

**docs/brand/** (1)

| File | Title |
|---|---|
| [docs/brand/POSITIONING.md](brand/POSITIONING.md) | Carta positioning, one page (draft) |

**docs/data/** (1)

| File | Title |
|---|---|
| [docs/data/README.md](data/README.md) | Data index |

**docs/legal/** (1)

| File | Title |
|---|---|
| [docs/legal/ARTICLE30.md](legal/ARTICLE30.md) | Record of processing activities (GDPR Article 30) |

**docs/logic/** (1)

| File | Title |
|---|---|
| [docs/logic/README.md](logic/README.md) | Logic catalogue |

**docs/reference/** (1)

| File | Title |
|---|---|
| [docs/reference/README.md](reference/README.md) | Generated reference |

**docs/research/** (1)

| File | Title |
|---|---|
| [docs/research/2026-11-launch-plan-research.md](research/2026-11-launch-plan-research.md) | Launch plan research, November 2026 |

**docs/runbooks/** (4)

| File | Title |
|---|---|
| [docs/runbooks/build-box.md](runbooks/build-box.md) | Runbook: the build box |
| [docs/runbooks/deploy.md](runbooks/deploy.md) | Runbook: deploy |
| [docs/runbooks/incident.md](runbooks/incident.md) | Runbook: incident |
| [docs/runbooks/README.md](runbooks/README.md) | Runbooks |

**docs/security/** (2)

| File | Title |
|---|---|
| [docs/security/SECRETS.md](security/SECRETS.md) | Secrets and owner accounts |
| [docs/security/threat-model.md](security/threat-model.md) | Carta threat model |

**docs/tos/** (1)

| File | Title |
|---|---|
| [docs/tos/data_licenses.md](tos/data_licenses.md) | Carta data license ledger |

**infra/** (1)

| File | Title |
|---|---|
| [infra/hetzner/README.md](../infra/hetzner/README.md) | Hetzner infrastructure for Carta |

**pipeline/** (2)

| File | Title |
|---|---|
| [pipeline/intake/README.md](../pipeline/intake/README.md) | pipeline/intake/ - finding what the catalogue is missing |
| [pipeline/README.md](../pipeline/README.md) | pipeline/ - script tiers |

**reports/** (2)

| File | Title |
|---|---|
| [reports/rating_external_check_v5.md](../reports/rating_external_check_v5.md) | External check of the v5 ratings (T760) |
| [reports/rubric_spotcheck_v5.md](../reports/rubric_spotcheck_v5.md) | Rubric spot check, rating v5 (T758) |

**src/** (2)

| File | Title |
|---|---|
| [src/ingestion/CREDENTIALS.md](../src/ingestion/CREDENTIALS.md) | Credential setup, source by source |
| [src/ingestion/README.md](../src/ingestion/README.md) | Carta raw data ingestion |

**supabase/functions/** (6)

| File | Title |
|---|---|
| [supabase/functions/checkout/test_purchase_e2e.md](../supabase/functions/checkout/test_purchase_e2e.md) | End-to-end purchase test, both tiers, Stripe test mode |
| [supabase/functions/notify/README.md](../supabase/functions/notify/README.md) | notify, Carta's opt-in emails |
| [supabase/functions/parse-booking/README.md](../supabase/functions/parse-booking/README.md) | parse-booking |
| [supabase/functions/plan-day/README.md](../supabase/functions/plan-day/README.md) | plan-day, the AI day-planner function |
| [supabase/functions/suggest-city/README.md](../supabase/functions/suggest-city/README.md) | suggest-city, the Carta bot's "ask AI" town search |
| [supabase/functions/upload-scan/README.md](../supabase/functions/upload-scan/README.md) | upload-scan |

**tools/benchmark/** (2)

| File | Title |
|---|---|
| [tools/benchmark/README.md](../tools/benchmark/README.md) | Ground-cost benchmark |
| [tools/benchmark/results/2026-10-01.md](../tools/benchmark/results/2026-10-01.md) | Ground-cost benchmark, 2026-10-01 |

**tools/reachability/** (1)

| File | Title |
|---|---|
| [tools/reachability/README.md](../tools/reachability/README.md) | Reachability precompute (contract D) |

**tools/trailslab/** (2)

| File | Title |
|---|---|
| [tools/trailslab/README.md](../tools/trailslab/README.md) | trailslab: trails and daytrips content lab |
| [tools/trailslab/review/README.md](../tools/trailslab/review/README.md) | Review app: the publish gate for staged trips |

<!-- INDEX:END -->

## Appendix B: the archive

[../archive/README.md](../archive/README.md) explains the archive:
- **What it holds:** retired code, finished plans and the old docs.
- **Its status:** nothing in it runs or binds, and no session reads it to find its way.
- **The old docs:** in `archive/docs-2026-11/`.
- **The old roadmap:** in `archive/roadmap-2026-10/`.

Its Markdown files are listed by folder below, so you can still reach them.

<!-- ARCHIVE:START -->
202 files.

**archive/** (1)

| File | Title |
|---|---|
| [archive/README.md](../archive/README.md) | Archive - superseded code, kept for reference |

**archive/additional-docs/** (11)

| File | Title |
|---|---|
| [archive/additional-docs/Carta/Execution/_LONG_LEAD_TRACKER.md](../archive/additional-docs/Carta/Execution/_LONG_LEAD_TRACKER.md) | Long-lead tracker |
| [archive/additional-docs/Carta/Execution/_TEMPLATE.md](../archive/additional-docs/Carta/Execution/_TEMPLATE.md) | T###, <task title> |
| [archive/additional-docs/Carta/Plan/Architecture/CARTA_CLOUD_ARCHITECTURE.md](../archive/additional-docs/Carta/Plan/Architecture/CARTA_CLOUD_ARCHITECTURE.md) | Carta: cloud architecture and cost model |
| [archive/additional-docs/Carta/Plan/BackEnd/Carta BackEnd.md](../archive/additional-docs/Carta/Plan/BackEnd/Carta%20BackEnd.md) | **Phase 1: Database Security & RPC Hardening** |
| [archive/additional-docs/Carta/Plan/Data Quality/carta-destinations-enhancement-spec.md](../archive/additional-docs/Carta/Plan/Data%20Quality/carta-destinations-enhancement-spec.md) | Carta, Destinations enhancement spec |
| [archive/additional-docs/Carta/Plan/Data Quality/carta-trips-enhancement-spec.md](../archive/additional-docs/Carta/Plan/Data%20Quality/carta-trips-enhancement-spec.md) | Carta, trips section enhancement spec |
| [archive/additional-docs/Carta/Plan/Data Quality/Travel App UX Blueprint.md](../archive/additional-docs/Carta/Plan/Data%20Quality/Travel%20App%20UX%20Blueprint.md) | **Architectural Blueprint and Conversion Optimization Strategy for Carta Europe Travel** |
| [archive/additional-docs/Carta/Plan/Finance/CARTA_UNIT_ECONOMICS.md](../archive/additional-docs/Carta/Plan/Finance/CARTA_UNIT_ECONOMICS.md) | Carta, unit economics and financial analysis |
| [archive/additional-docs/Carta/Plan/Frontend Design/Frontend Design Tools Research.md](../archive/additional-docs/Carta/Plan/Frontend%20Design/Frontend%20Design%20Tools%20Research.md) | **Architectural Review: Elevating Front-End Design via Claude Code Extensions and Advanced UI Methodologies** |
| [archive/additional-docs/Carta/Plan/Legal/Legal.md](../archive/additional-docs/Carta/Plan/Legal/Legal.md) | **The headline correction** |
| [archive/additional-docs/Carta/Plan/Unit Economics/CARTA_UNIT_ECONOMICS_1.md](../archive/additional-docs/Carta/Plan/Unit%20Economics/CARTA_UNIT_ECONOMICS_1.md) | Carta, unit economics |

**archive/claude-outputs/** (3)

| File | Title |
|---|---|
| [archive/claude-outputs/carta-destinations-enhancement-spec-1.md](../archive/claude-outputs/carta-destinations-enhancement-spec-1.md) | Carta, Destinations enhancement spec |
| [archive/claude-outputs/carta-destinations-enhancement-spec.md](../archive/claude-outputs/carta-destinations-enhancement-spec.md) | Carta, Destinations enhancement spec |
| [archive/claude-outputs/carta-trips-enhancement-spec.md](../archive/claude-outputs/carta-trips-enhancement-spec.md) | Carta, trips section enhancement spec |

**archive/continent-app-prompts/** (3)

| File | Title |
|---|---|
| [archive/continent-app-prompts/CARTA_CLAUDE_CODE_PROMPTS.md](../archive/continent-app-prompts/CARTA_CLAUDE_CODE_PROMPTS.md) | Carta, Claude Code prompt pack |
| [archive/continent-app-prompts/CARTA_OPTIMIZATION.md](../archive/continent-app-prompts/CARTA_OPTIMIZATION.md) | Carta, optimization plan |
| [archive/continent-app-prompts/CARTA_PLANNERS_PROMPTS.md](../archive/continent-app-prompts/CARTA_PLANNERS_PROMPTS.md) | Carta, Trip planner & Day planner prompt pack |

**archive/docs-2026-11/** (87)

| File | Title |
|---|---|
| [archive/docs-2026-11/1.CARTA.md](../archive/docs-2026-11/1.CARTA.md) | Carta |
| [archive/docs-2026-11/2.SIGNIFICANCE.md](../archive/docs-2026-11/2.SIGNIFICANCE.md) | The Significance Engine |
| [archive/docs-2026-11/BACKUP.md](../archive/docs-2026-11/BACKUP.md) | Backing up the live Supabase project |
| [archive/docs-2026-11/BEACHES.md](../archive/docs-2026-11/BEACHES.md) | The beach layer |
| [archive/docs-2026-11/CATEGORY_UI_PLAN.md](../archive/docs-2026-11/CATEGORY_UI_PLAN.md) | Category UI plan: wiring the natural-features wire into the Destinations tab |
| [archive/docs-2026-11/competitors.md](../archive/docs-2026-11/competitors.md) | Carta competitor map |
| [archive/docs-2026-11/COMPONENT_ROLES.md](../archive/docs-2026-11/COMPONENT_ROLES.md) | Component roles: which outside library to read for what, and how a lifted component becomes Carta's |
| [archive/docs-2026-11/COVERAGE.md](../archive/docs-2026-11/COVERAGE.md) | Coverage and size fairness |
| [archive/docs-2026-11/CYCLING.md](../archive/docs-2026-11/CYCLING.md) | The cycling layer |
| [archive/docs-2026-11/CYCLING_RESUME.md](../archive/docs-2026-11/CYCLING_RESUME.md) | Cycling layer: what is published, and what the next session picks up |
| [archive/docs-2026-11/design-v6/briefs/account.md](../archive/docs-2026-11/design-v6/briefs/account.md) | My trips, account, sharing, passes, guides and admin: design brief |
| [archive/docs-2026-11/design-v6/briefs/dayplanner.md](../archive/docs-2026-11/design-v6/briefs/dayplanner.md) | Design brief: Day planner (key 'dayplanner') |
| [archive/docs-2026-11/design-v6/briefs/destination.md](../archive/docs-2026-11/design-v6/briefs/destination.md) | Destination (town) page: design brief |
| [archive/docs-2026-11/design-v6/briefs/destinations.md](../archive/docs-2026-11/design-v6/briefs/destinations.md) | Design brief: Destinations browse (key 'destinations') |
| [archive/docs-2026-11/design-v6/briefs/explore.md](../archive/docs-2026-11/design-v6/briefs/explore.md) | Design brief: Explore, the map tab (key 'explore') |
| [archive/docs-2026-11/design-v6/briefs/landing.md](../archive/docs-2026-11/design-v6/briefs/landing.md) | Surface brief: the landing page and the first run (key `landing`) |
| [archive/docs-2026-11/design-v6/briefs/outdoor.md](../archive/docs-2026-11/design-v6/briefs/outdoor.md) | Design brief: outdoor detail pages (key 'outdoor') |
| [archive/docs-2026-11/design-v6/briefs/shell.md](../archive/docs-2026-11/design-v6/briefs/shell.md) | Design brief: app shell, navigation and shared components (surface key `shell`) |
| [archive/docs-2026-11/design-v6/briefs/tripplanner.md](../archive/docs-2026-11/design-v6/briefs/tripplanner.md) | Design brief: Trip planner, the multi-city wizard and the planned trip (key 'tripplanner') |
| [archive/docs-2026-11/design-v6/briefs/trips.md](../archive/docs-2026-11/design-v6/briefs/trips.md) | Design brief: Trips, the journeys library and the trip page (key 'trips') |
| [archive/docs-2026-11/design-v6/DIRECTION.md](../archive/docs-2026-11/design-v6/DIRECTION.md) | Design direction v6 |
| [archive/docs-2026-11/design-v6/MORNING.md](../archive/docs-2026-11/design-v6/MORNING.md) | Carta design V6: the morning page |
| [archive/docs-2026-11/design-v6/OWNERSHIP.md](../archive/docs-2026-11/design-v6/OWNERSHIP.md) | File ownership for the design waves (v6) |
| [archive/docs-2026-11/design-v6/plans/V3-account.md](../archive/docs-2026-11/design-v6/plans/V3-account.md) | V3 plan: My trips, account, sharing, passes, guides and admin |
| [archive/docs-2026-11/design-v6/plans/V3-dayplanner.md](../archive/docs-2026-11/design-v6/plans/V3-dayplanner.md) | V3 plan: Day planner (key 'dayplanner') |
| [archive/docs-2026-11/design-v6/plans/V3-destination.md](../archive/docs-2026-11/design-v6/plans/V3-destination.md) | V3 plan: Destination (town) page |
| [archive/docs-2026-11/design-v6/plans/V3-destinations.md](../archive/docs-2026-11/design-v6/plans/V3-destinations.md) | V3 plan: Destinations browse (T384) |
| [archive/docs-2026-11/design-v6/plans/V3-explore.md](../archive/docs-2026-11/design-v6/plans/V3-explore.md) | V3 plan: Explore, the map tab (T383) |
| [archive/docs-2026-11/design-v6/plans/V3-landing.md](../archive/docs-2026-11/design-v6/plans/V3-landing.md) | V3 plan: the landing page and the first run (surface key `landing`, T382) |
| [archive/docs-2026-11/design-v6/plans/V3-outdoor.md](../archive/docs-2026-11/design-v6/plans/V3-outdoor.md) | V3 plan: outdoor detail pages (T386) |
| [archive/docs-2026-11/design-v6/plans/V3-shell.md](../archive/docs-2026-11/design-v6/plans/V3-shell.md) | V3 plan: app shell, navigation and shared components (T381) |
| [archive/docs-2026-11/design-v6/plans/V3-tripplanner.md](../archive/docs-2026-11/design-v6/plans/V3-tripplanner.md) | V3 plan: Trip planner (the multi-city wizard and the planned trip) |
| [archive/docs-2026-11/design-v6/plans/V3-trips.md](../archive/docs-2026-11/design-v6/plans/V3-trips.md) | V3 plan: Trips (the journeys library and the trip page) |
| [archive/docs-2026-11/design-v6/plans/V4-account.md](../archive/docs-2026-11/design-v6/plans/V4-account.md) | V4 plan: My trips, account, sharing, passes, guides and admin |
| [archive/docs-2026-11/design-v6/plans/V4-dayplanner.md](../archive/docs-2026-11/design-v6/plans/V4-dayplanner.md) | V4 plan: Day planner (key 'dayplanner') |
| [archive/docs-2026-11/design-v6/plans/V4-destination.md](../archive/docs-2026-11/design-v6/plans/V4-destination.md) | V4 plan: Destination (town) page |
| [archive/docs-2026-11/design-v6/plans/V4-destinations.md](../archive/docs-2026-11/design-v6/plans/V4-destinations.md) | V4 plan: Destinations browse (T394) |
| [archive/docs-2026-11/design-v6/plans/V4-explore.md](../archive/docs-2026-11/design-v6/plans/V4-explore.md) | V4 plan: Explore, the map tab (T393) |
| [archive/docs-2026-11/design-v6/plans/V4-landing.md](../archive/docs-2026-11/design-v6/plans/V4-landing.md) | V4 plan: the landing page and the first run (surface key `landing`, T392) |
| [archive/docs-2026-11/design-v6/plans/V4-outdoor.md](../archive/docs-2026-11/design-v6/plans/V4-outdoor.md) | V4 plan: outdoor detail pages (T396) |
| [archive/docs-2026-11/design-v6/plans/V4-shell.md](../archive/docs-2026-11/design-v6/plans/V4-shell.md) | V4 plan: app shell, navigation and shared components (T391) |
| [archive/docs-2026-11/design-v6/plans/V4-tripplanner.md](../archive/docs-2026-11/design-v6/plans/V4-tripplanner.md) | V4 plan: Trip planner (the multi-city wizard and the planned trip) |
| [archive/docs-2026-11/design-v6/plans/V4-trips.md](../archive/docs-2026-11/design-v6/plans/V4-trips.md) | V4 plan: Trips (the journeys library and the trip page) |
| [archive/docs-2026-11/design-v6/plans/V5-account.md](../archive/docs-2026-11/design-v6/plans/V5-account.md) | V5 plan: My trips, account, sharing, passes, guides and admin |
| [archive/docs-2026-11/design-v6/plans/V5-dayplanner.md](../archive/docs-2026-11/design-v6/plans/V5-dayplanner.md) | V5 plan: Day planner (key 'dayplanner') |
| [archive/docs-2026-11/design-v6/plans/V5-destination.md](../archive/docs-2026-11/design-v6/plans/V5-destination.md) | V5 plan: Destination (town) page |
| [archive/docs-2026-11/design-v6/plans/V5-destinations.md](../archive/docs-2026-11/design-v6/plans/V5-destinations.md) | V5 plan: Destinations browse (T404) |
| [archive/docs-2026-11/design-v6/plans/V5-explore.md](../archive/docs-2026-11/design-v6/plans/V5-explore.md) | V5 plan: Explore, the map tab (T403) |
| [archive/docs-2026-11/design-v6/plans/V5-landing.md](../archive/docs-2026-11/design-v6/plans/V5-landing.md) | V5 plan: the landing page and the first run (surface key `landing`, T402) |
| [archive/docs-2026-11/design-v6/plans/V5-outdoor.md](../archive/docs-2026-11/design-v6/plans/V5-outdoor.md) | V5 plan: outdoor detail pages (T406) |
| [archive/docs-2026-11/design-v6/plans/V5-shell.md](../archive/docs-2026-11/design-v6/plans/V5-shell.md) | V5 plan: app shell, navigation and shared components (T401) |
| [archive/docs-2026-11/design-v6/plans/V5-tripplanner.md](../archive/docs-2026-11/design-v6/plans/V5-tripplanner.md) | V5 plan: Trip planner (harden, adapt and polish) |
| [archive/docs-2026-11/design-v6/plans/V5-trips.md](../archive/docs-2026-11/design-v6/plans/V5-trips.md) | V5 plan: Trips (the journeys library and the trip page) |
| [archive/docs-2026-11/design-v6/plans/V6-consistency.md](../archive/docs-2026-11/design-v6/plans/V6-consistency.md) | V6 plan: one traveller, one trip, the consistency pass (T411) |
| [archive/docs-2026-11/design-v6/plans/V6-release.md](../archive/docs-2026-11/design-v6/plans/V6-release.md) | V6 plan: the release check, the gallery and the preview deploy (T412) |
| [archive/docs-2026-11/design-v6/TRIP-PLANNING-RESEARCH.md](../archive/docs-2026-11/design-v6/TRIP-PLANNING-RESEARCH.md) | How people plan leisure trips, and what it means for Carta |
| [archive/docs-2026-11/ESTIMATION.md](../archive/docs-2026-11/ESTIMATION.md) | Ground fare estimation + data architecture |
| [archive/docs-2026-11/FEEDBACK-LOOP.md](../archive/docs-2026-11/FEEDBACK-LOOP.md) | The feedback loop: from "this is wrong" to fixed |
| [archive/docs-2026-11/FIRST_RUN_RESULT.md](../archive/docs-2026-11/FIRST_RUN_RESULT.md) | The first-run trip result |
| [archive/docs-2026-11/GTM-ACQUISITION-CONSTRAINT.md](../archive/docs-2026-11/GTM-ACQUISITION-CONSTRAINT.md) | Carta go-to-market: the acquisition constraint |
| [archive/docs-2026-11/HANDOFF_LLM_RUNS.md](../archive/docs-2026-11/HANDOFF_LLM_RUNS.md) | Brief for Claude Cowork: run the intro rewrite and the parking web check |
| [archive/docs-2026-11/IMAGE_BRIEF.md](../archive/docs-2026-11/IMAGE_BRIEF.md) | The image brief |
| [archive/docs-2026-11/INCIDENT_RUNBOOK.md](../archive/docs-2026-11/INCIDENT_RUNBOOK.md) | Incident runbook |
| [archive/docs-2026-11/ITEM_PAGE_DATA_CONTRACT.md](../archive/docs-2026-11/ITEM_PAGE_DATA_CONTRACT.md) | Item page and trip page data contract (T430, T431) |
| [archive/docs-2026-11/JOINS.md](../archive/docs-2026-11/JOINS.md) | The cross-layer join |
| [archive/docs-2026-11/LAUNCH-METRICS.md](../archive/docs-2026-11/LAUNCH-METRICS.md) | Launch metrics and where each one is read |
| [archive/docs-2026-11/LAUNCH-OUTREACH-DRAFTS.md](../archive/docs-2026-11/LAUNCH-OUTREACH-DRAFTS.md) | Launch outreach drafts |
| [archive/docs-2026-11/MOUNTAINS.md](../archive/docs-2026-11/MOUNTAINS.md) | The mountain layer |
| [archive/docs-2026-11/ONBOARDING_AND_EMPTY_STATES.md](../archive/docs-2026-11/ONBOARDING_AND_EMPTY_STATES.md) | The first ninety seconds, and every empty state |
| [archive/docs-2026-11/PHOTOS.md](../archive/docs-2026-11/PHOTOS.md) | The photo engine |
| [archive/docs-2026-11/PIPELINE.md](../archive/docs-2026-11/PIPELINE.md) | run_pipeline.py, what it actually does |
| [archive/docs-2026-11/PRICEMAP_CHUNKS.md](../archive/docs-2026-11/PRICEMAP_CHUNKS.md) | Price-map expansion: independent chunk prompts |
| [archive/docs-2026-11/PRODUCT_ROADMAP.md](../archive/docs-2026-11/PRODUCT_ROADMAP.md) | Carta product roadmap |
| [archive/docs-2026-11/QUALITY_UPGRADE_PLAN.md](../archive/docs-2026-11/QUALITY_UPGRADE_PLAN.md) | Carta quality upgrade plan (open-data playbook, 2026-08-11) |
| [archive/docs-2026-11/RATING_RUBRIC.md](../archive/docs-2026-11/RATING_RUBRIC.md) | Carta rating rubric (v5, appeal) |
| [archive/docs-2026-11/REFUND_SOP.md](../archive/docs-2026-11/REFUND_SOP.md) | Refund procedure |
| [archive/docs-2026-11/SEO.md](../archive/docs-2026-11/SEO.md) | Carta search visibility plan |
| [archive/docs-2026-11/SHARING_FRIENDS_BUILD.md](../archive/docs-2026-11/SHARING_FRIENDS_BUILD.md) | Sharing and friends: step by step build plan |
| [archive/docs-2026-11/SHARING_FRIENDS_PLAN.md](../archive/docs-2026-11/SHARING_FRIENDS_PLAN.md) | Sharing, trip people and friends |
| [archive/docs-2026-11/SUPPORT.md](../archive/docs-2026-11/SUPPORT.md) | Support inbox and canned answers |
| [archive/docs-2026-11/tos/flix_outreach.md](../archive/docs-2026-11/tos/flix_outreach.md) | Flix outreach draft |
| [archive/docs-2026-11/tos/omio_outreach.md](../archive/docs-2026-11/tos/omio_outreach.md) | Omio outreach draft |
| [archive/docs-2026-11/trails-daytrips-setup-prompts.md](../archive/docs-2026-11/trails-daytrips-setup-prompts.md) | Trails + daytrips vertical: setup prompts |
| [archive/docs-2026-11/TRAILS.md](../archive/docs-2026-11/TRAILS.md) | The trail layer |
| [archive/docs-2026-11/TRAILS_DATA_QUALITY.md](../archive/docs-2026-11/TRAILS_DATA_QUALITY.md) | Trails data quality, the standing contract |
| [archive/docs-2026-11/TRAILS_EXPANSION_PLAN.md](../archive/docs-2026-11/TRAILS_EXPANSION_PLAN.md) | Trails expansion plan (2026-08-12) |
| [archive/docs-2026-11/trips_layer.md](../archive/docs-2026-11/trips_layer.md) | The trip layer |

**archive/execution-queue/** (67)

| File | Title |
|---|---|
| [archive/execution-queue/R4-box.prompt.md](../archive/execution-queue/R4-box.prompt.md) | Rating v5: bring the box fee harvest into the app (T761-a) |
| [archive/execution-queue/R4-finish.prompt.md](../archive/execution-queue/R4-finish.prompt.md) | Rating v5: finish Batch R4, merge R1 to R4, bring in the box fee data |
| [archive/execution-queue/R4-merge.prompt.md](../archive/execution-queue/R4-merge.prompt.md) | Rating v5: merge batches R1 to R4 (owner order, 2026-10-28) |
| [archive/execution-queue/R4-rating-v5-screens.prompt.md](../archive/execution-queue/R4-rating-v5-screens.prompt.md) | Batch R4: rating v5 on every screen (T763 to T766) |
| [archive/execution-queue/SW2-flights-to-august.prompt.md](../archive/execution-queue/SW2-flights-to-august.prompt.md) | Batch SW2: flight prices out to the end of August (T804 to T805) |
| [archive/execution-queue/T056.prompt.md](../archive/execution-queue/T056.prompt.md) |  |
| [archive/execution-queue/T057.prompt.md](../archive/execution-queue/T057.prompt.md) |  |
| [archive/execution-queue/T058.prompt.md](../archive/execution-queue/T058.prompt.md) |  |
| [archive/execution-queue/T059.prompt.md](../archive/execution-queue/T059.prompt.md) |  |
| [archive/execution-queue/T060.prompt.md](../archive/execution-queue/T060.prompt.md) |  |
| [archive/execution-queue/T061.prompt.md](../archive/execution-queue/T061.prompt.md) |  |
| [archive/execution-queue/T074.prompt.md](../archive/execution-queue/T074.prompt.md) |  |
| [archive/execution-queue/T075.prompt.md](../archive/execution-queue/T075.prompt.md) |  |
| [archive/execution-queue/T076.prompt.md](../archive/execution-queue/T076.prompt.md) |  |
| [archive/execution-queue/TF1-trip-finder-engine.prompt.md](../archive/execution-queue/TF1-trip-finder-engine.prompt.md) | Batch TF1: the trip finder engine (T792 to T796) |
| [archive/execution-queue/TF2-trip-finder-screens.prompt.md](../archive/execution-queue/TF2-trip-finder-screens.prompt.md) | Batch TF2: the trip finder screens (T797 to T801) |
| [archive/execution-queue/TF3-trip-finder-compare-levers.prompt.md](../archive/execution-queue/TF3-trip-finder-compare-levers.prompt.md) | Batch TF3: compare and levers (T802 to T803) |
| [archive/execution-queue/wave1/T078.prompt.md](../archive/execution-queue/wave1/T078.prompt.md) | T078, Unify the ingestion registry with licence compliance |
| [archive/execution-queue/wave1/T083.prompt.md](../archive/execution-queue/wave1/T083.prompt.md) | T083, RLS policy tests and Sentry on the ErrorBoundary |
| [archive/execution-queue/wave1/T084.prompt.md](../archive/execution-queue/wave1/T084.prompt.md) | T084, Write the mechanical trip validator and put it in CI |
| [archive/execution-queue/wave1/T096.prompt.md](../archive/execution-queue/wave1/T096.prompt.md) | T096, Benchmark ground costs against real listings |
| [archive/execution-queue/wave1/T107.prompt.md](../archive/execution-queue/wave1/T107.prompt.md) | T107, 6.6, Apply the title ladder across all five sections |
| [archive/execution-queue/wave1/T111.prompt.md](../archive/execution-queue/wave1/T111.prompt.md) | T111, 0.4, Implement country floors and reason codes |
| [archive/execution-queue/wave1/T192.prompt.md](../archive/execution-queue/wave1/T192.prompt.md) | T192, Fix hook dependencies and memoisation thrashing |
| [archive/execution-queue/wave1/T195.prompt.md](../archive/execution-queue/wave1/T195.prompt.md) | T195, Write PRODUCT.md and DESIGN.md as the durable context |
| [archive/execution-queue/wave1/T265.prompt.md](../archive/execution-queue/wave1/T265.prompt.md) | T265, payments and quota, SQL and functions |
| [archive/execution-queue/wave1/T266.prompt.md](../archive/execution-queue/wave1/T266.prompt.md) | T266, harness repairs |
| [archive/execution-queue/wave2/T085.prompt.md](../archive/execution-queue/wave2/T085.prompt.md) | T085, A1, Store ranges as {low, high}, render once |
| [archive/execution-queue/wave2/T113.prompt.md](../archive/execution-queue/wave2/T113.prompt.md) | T113, 6.1, Build the famous-trail registry from evidence, not memory |
| [archive/execution-queue/wave2/T126.prompt.md](../archive/execution-queue/wave2/T126.prompt.md) | T126, 2.1, Write the image brief and the vision-scoring prompt |
| [archive/execution-queue/wave2/T157.prompt.md](../archive/execution-queue/wave2/T157.prompt.md) | T157, 4.3, Enforce the banned-from-the-surface list |
| [archive/execution-queue/wave2/T177.prompt.md](../archive/execution-queue/wave2/T177.prompt.md) | T177, F1-F3, DECIDE: komoot embed or own GPX on Mapbox Outdoors |
| [archive/execution-queue/wave2/T187.prompt.md](../archive/execution-queue/wave2/T187.prompt.md) | T187, Design the first-run trip result |
| [archive/execution-queue/wave2/T201.prompt.md](../archive/execution-queue/wave2/T201.prompt.md) | T201, Write the positioning, in one sentence and one paragraph |
| [archive/execution-queue/wave2/T267.prompt.md](../archive/execution-queue/wave2/T267.prompt.md) | T267, frozen fares and housekeeping |
| [archive/execution-queue/wave2/T268.prompt.md](../archive/execution-queue/wave2/T268.prompt.md) | T268, admin follow-ups, database side |
| [archive/execution-queue/wave2/T269.prompt.md](../archive/execution-queue/wave2/T269.prompt.md) | T269, photo pipeline before stage 8 |
| [archive/execution-queue/wave3/T087.prompt.md](../archive/execution-queue/wave3/T087.prompt.md) | T087, A2, Replace the best-months sentence with a 12-cell month strip |
| [archive/execution-queue/wave3/T121.prompt.md](../archive/execution-queue/wave3/T121.prompt.md) | T121, 7.5, Do NOT ingest node networks as routes |
| [archive/execution-queue/wave3/T130.prompt.md](../archive/execution-queue/wave3/T130.prompt.md) | T130, Explicitly exclude Google Street View |
| [archive/execution-queue/wave3/T197.prompt.md](../archive/execution-queue/wave3/T197.prompt.md) | T197, Curate components by role, not by library |
| [archive/execution-queue/wave3/T202.prompt.md](../archive/execution-queue/wave3/T202.prompt.md) | T202, Competitive positioning against the four categories |
| [archive/execution-queue/wave3/T204.prompt.md](../archive/execution-queue/wave3/T204.prompt.md) | T204, The acquisition constraint, written down once |
| [archive/execution-queue/wave3/T205.prompt.md](../archive/execution-queue/wave3/T205.prompt.md) | T205, The programmatic SEO plan |
| [archive/execution-queue/wave3/T217.prompt.md](../archive/execution-queue/wave3/T217.prompt.md) | T217, The refund standard operating procedure |
| [archive/execution-queue/wave3/T246.prompt.md](../archive/execution-queue/wave3/T246.prompt.md) | T246, DECIDE the mobile strategy: this is the gate |
| [archive/execution-queue/wave3/T270.prompt.md](../archive/execution-queue/wave3/T270.prompt.md) | T270, admin UI follow-ups |
| [archive/execution-queue/wave4/T088.prompt.md](../archive/execution-queue/wave4/T088.prompt.md) | T088, A3, Difficulty as a five-segment meter, note behind the dot |
| [archive/execution-queue/wave4/T203.prompt.md](../archive/execution-queue/wave4/T203.prompt.md) | T203, Decide the audience order |
| [archive/execution-queue/wave4/T206.prompt.md](../archive/execution-queue/wave4/T206.prompt.md) | T206, Community credibility: the outdoor route |
| [archive/execution-queue/wave4/T207.prompt.md](../archive/execution-queue/wave4/T207.prompt.md) | T207, Launch channels and the launch day plan |
| [archive/execution-queue/wave4/T208.prompt.md](../archive/execution-queue/wave4/T208.prompt.md) | T208, Press, partnerships and the open-data angle |
| [archive/execution-queue/wave4/T214.prompt.md](../archive/execution-queue/wave4/T214.prompt.md) | T214, Decide the analytics stack, knowing what it costs you legally |
| [archive/execution-queue/wave4/T215.prompt.md](../archive/execution-queue/wave4/T215.prompt.md) | T215, Define the launch metrics and where each one is read |
| [archive/execution-queue/wave4/T216.prompt.md](../archive/execution-queue/wave4/T216.prompt.md) | T216, A support inbox and a response commitment |
| [archive/execution-queue/wave4/T273.prompt.md](../archive/execution-queue/wave4/T273.prompt.md) | T273, remove the frozen flight estimates from every screen |
| [archive/execution-queue/wave4/T274.prompt.md](../archive/execution-queue/wave4/T274.prompt.md) | T274, migration 046 fixes the co-planner invite in 020 |
| [archive/execution-queue/wave5/T092.prompt.md](../archive/execution-queue/wave5/T092.prompt.md) | T092, J3, Give the week-at-a-glance table a fixed row set |
| [archive/execution-queue/wave5/T176.prompt.md](../archive/execution-queue/wave5/T176.prompt.md) | T176, F4, Free, frictionless GPX on every route: never paywalled |
| [archive/execution-queue/wave5/T219.prompt.md](../archive/execution-queue/wave5/T219.prompt.md) | T219, Decide the feedback loop from users into the backlog |
| [archive/execution-queue/wave5/T220.prompt.md](../archive/execution-queue/wave5/T220.prompt.md) | T220, Write the launch runway calendar |
| [archive/execution-queue/wave5/T226.prompt.md](../archive/execution-queue/wave5/T226.prompt.md) | T226, Decide content type and platforms |
| [archive/execution-queue/wave5/T276.prompt.md](../archive/execution-queue/wave5/T276.prompt.md) | T276, remove the Travelpayouts Drive script and its CSP hosts |
| [archive/execution-queue/wave5/T277.prompt.md](../archive/execution-queue/wave5/T277.prompt.md) | T277, PRODUCT.md and ESTIMATION.md catch up with the owner decisions |
| [archive/execution-queue/wave5/T278.prompt.md](../archive/execution-queue/wave5/T278.prompt.md) | T278, typed fares price the airport transfer; drop the frozen carrier text |
| [archive/execution-queue/wave5/T279.prompt.md](../archive/execution-queue/wave5/T279.prompt.md) | T279, rewrite verify_fare_provenance for no flight prices |
| [archive/execution-queue/wave5/T280.prompt.md](../archive/execution-queue/wave5/T280.prompt.md) | T280, the trails export applies the credit gate |

**archive/plans/** (6)

| File | Title |
|---|---|
| [archive/plans/_OPEN-MASTER.md](../archive/plans/_OPEN-MASTER.md) | Everything that is open, as one plan |
| [archive/plans/_ORDER.md](../archive/plans/_ORDER.md) | Carta, execution order |
| [archive/plans/_WAVES.md](../archive/plans/_WAVES.md) | Waves from wave 6 onward |
| [archive/plans/CARTA_CLAUDE_CODE_PROMPTS.md](../archive/plans/CARTA_CLAUDE_CODE_PROMPTS.md) | Carta, Claude Code prompt pack |
| [archive/plans/CHANGELOG-explore-v4.md](../archive/plans/CHANGELOG-explore-v4.md) | explore-v4 changelog |
| [archive/plans/PARALLEL-WAVES-PLAN.md](../archive/plans/PARALLEL-WAVES-PLAN.md) | Parallel waves beside _OPEN-MASTER |

**archive/roadmap-2026-10/** (19)

| File | Title |
|---|---|
| [archive/roadmap-2026-10/1.15-navigatie-ontwerp.md](../archive/roadmap-2026-10/1.15-navigatie-ontwerp.md) | Navigatie-ontwerp: drie plekken, het accounticoon en de pass op het moment |
| [archive/roadmap-2026-10/1.15-navigatie-pass-prijsweergave.md](../archive/roadmap-2026-10/1.15-navigatie-pass-prijsweergave.md) | Navigatie, pass en prijsweergave: de eerste indruk |
| [archive/roadmap-2026-10/1.19-budgetzoeken.md](../archive/roadmap-2026-10/1.19-budgetzoeken.md) | Zoeken op totaalbudget: "Hoeveel heb je?" |
| [archive/roadmap-2026-10/1.2-baseline-audit.md](../archive/roadmap-2026-10/1.2-baseline-audit.md) | Roadmap 1.2: the baseline (before) |
| [archive/roadmap-2026-10/1.2-design-system-plan.md](../archive/roadmap-2026-10/1.2-design-system-plan.md) | Roadmap 1.2: one design system for Carta |
| [archive/roadmap-2026-10/1.2-migration-handoff.md](../archive/roadmap-2026-10/1.2-migration-handoff.md) | Roadmap 1.2: migration handoff (T426 onward) |
| [archive/roadmap-2026-10/1.3-tabs-inventaris.md](../archive/roadmap-2026-10/1.3-tabs-inventaris.md) | Tabs inventaris: wat er nu staat, naast de ontwerpbrief per tab |
| [archive/roadmap-2026-10/1.3a-app-schil.md](../archive/roadmap-2026-10/1.3a-app-schil.md) | App-schil: kop, navigatie, instellingenbalk en onderbalk |
| [archive/roadmap-2026-10/1.3b-destinations.md](../archive/roadmap-2026-10/1.3b-destinations.md) | Destinations in Explore: categorieën, filters, tripbibliotheek, land en regio |
| [archive/roadmap-2026-10/1.3c-tripplanner.md](../archive/roadmap-2026-10/1.3c-tripplanner.md) | Trip planner: de wizard en de geplande trip in één werkruimte |
| [archive/roadmap-2026-10/1.3d-dagplanner.md](../archive/roadmap-2026-10/1.3d-dagplanner.md) | Day planner: de vragen, de dag en de kaart |
| [archive/roadmap-2026-10/1.3e-mijn-trips-account-pass.md](../archive/roadmap-2026-10/1.3e-mijn-trips-account-pass.md) | My trips, Account, het passscherm en de cijferpagina |
| [archive/roadmap-2026-10/1.4-bestemmingspagina.md](../archive/roadmap-2026-10/1.4-bestemmingspagina.md) | Bestemmingspagina: eerst een overzichtstab |
| [archive/roadmap-2026-10/1.5-explore-kaart-lijst.md](../archive/roadmap-2026-10/1.5-explore-kaart-lijst.md) | Explore: kaart en lijst, met hetzelfde overzicht per plaats |
| [archive/roadmap-2026-10/2.10-seizoen-rating-prijs.md](../archive/roadmap-2026-10/2.10-seizoen-rating-prijs.md) | Seizoen, rating en prijs per maand |
| [archive/roadmap-2026-10/2.10b-rating-v5.md](../archive/roadmap-2026-10/2.10b-rating-v5.md) | Carta rating v5: a rating that makes sense, and a match that fits you |
| [archive/roadmap-2026-10/2.14-kosten-en-logistiek.md](../archive/roadmap-2026-10/2.14-kosten-en-logistiek.md) | Kosten en logistiek: waar Carta wint |
| [archive/roadmap-2026-10/2.22-budget-vervoer-dag-delen.md](../archive/roadmap-2026-10/2.22-budget-vervoer-dag-delen.md) | Totaalbudget, vervoer, dagplanner en samen kiezen |
| [archive/roadmap-2026-10/Carta roadmap.md](../archive/roadmap-2026-10/Carta%20roadmap.md) | Carta roadmap |

**archive/root-docs-2026-11/** (5)

| File | Title |
|---|---|
| [archive/root-docs-2026-11/1.CARTA.md](../archive/root-docs-2026-11/1.CARTA.md) | Carta |
| [archive/root-docs-2026-11/CARTA_TRAILS_BUILD_BRIEF.md](../archive/root-docs-2026-11/CARTA_TRAILS_BUILD_BRIEF.md) | Carta trails, build brief for Claude Code |
| [archive/root-docs-2026-11/PLAN.md](../archive/root-docs-2026-11/PLAN.md) | Carta, Explore rebuild & rating_v4 |
| [archive/root-docs-2026-11/ROUTES.md](../archive/root-docs-2026-11/ROUTES.md) | Carta, Routes layer (hiking + cycling) |
| [archive/root-docs-2026-11/user_knowledge.md](../archive/root-docs-2026-11/user_knowledge.md) | User knowledge |

<!-- ARCHIVE:END -->
