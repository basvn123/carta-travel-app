# T1046: Full app audit, November 2026

## Date

2026-11-04

## What changed

Carta has a full, ranked audit of the app as it is today: `docs/AUDIT-2026-11.md`, 59 pain points (P-01 to P-59) in eight areas (business and legal, security, operations and pipeline, data, traveller experience, code and performance, product completeness, register), each with severity, evidence, impact, fix and the roadmap item that carries it. The audit had six read-only lanes: the live site walked at 1440 and 375 px, every shipped wire counted field by field, pipeline and operations health, code health with a fast build and `npm audit`, the open-items register classified (1,592 rows), and a product-completeness review of what a full-time app needs. `ROADMAP.md` now opens with a **Fix now** block (N1 to N8). It also gains a completeness target table and items D7 to D13 in Track D, plus E6, G12, G13 and H9 to H14. A new **Track I: product and business** (I1 to I13, research I-R1 to I-R3) covers company and VAT, payments, data source licensing, affiliates, accounts, retention email, mobile, languages, support, business ops, analytics, growth and content operations. Launch moved to Track J.

## Files touched

- Created: `docs/AUDIT-2026-11.md`, `Execution/P15/T1046-full-app-audit.md`
- Modified: `ROADMAP.md`, `Execution/_OPEN.md` (rows T1046-a to T1046-f)

## Commands run

Read only: `npm test` (1,229 of 1,229 pass), `npm run lint` (1 error, 163 warnings), the fast build into the session scratchpad, `npm audit --omit=dev` (3 critical), data counting scripts in the session scratchpad, a curl of the public `status.json` (404). No pipeline task, scrape, deploy or data write.

## Config and secrets set

None.

## Before/after measurements

Not measured: the audit changes no behaviour. Its baselines (trails 20.2% photo, 2.6% summary; sea temperature 0%; local transport fare 0%; entry chunk 224 KB gzip; first load 477 KB gzip JS; 1,592 open register rows) are the "before" for D7 to D13, H12 and A3.

## What broke and how it was fixed

No issues.

## Screens checked

Live site, 2026-11-04: Home and Explore (Places and Trails tabs) at 1440 px; a trail page (BergeSeen Trail L1); the Hallstatt place page; Ask Carta with one query; Plan home and the first wizard step at 375 px. What was seen is in the audit, section 2.5. Screenshots stayed in the session, not in git.

## What is still open

- T1046-a: pause the failing hourly stays tasks, remove dead flight tasks, drop the E2E seam flag from `.env` (owner, N1).
- T1046-b: rotate the leaked R2 admin token (owner, N3).
- T1046-c: publish `status.json` and make the prune keep it (N2).
- T1046-d: dompurify bump and plans for jspdf and maplibre majors (N4).
- T1046-e: clear personal data from the device on sign-out (N5).
- T1046-f: the `ExploreMap.jsx:911` lint error (N7).
- Everything else is an item in ROADMAP.md, not a register row, to avoid growing the register before the A3 triage.

## Rollback procedure

`git revert` of the T1046 commit. Documentation only.
