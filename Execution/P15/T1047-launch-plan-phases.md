# T1047: Launch plan in quality-first phases, marketing and affiliates

## Date

2026-11-04

## What changed

`ROADMAP.md` is now ordered as a launch, not an engineering programme. A new section 4 sets six phases (P0 Fix and start, P1 Surface data and flow, P2 Clean look by about 18 January, P3 Business and closed beta, P4 Breadth, hardening and open beta, P5 Launch), each with an exit gate. It defines the **marketing surface**: Home, Explore, the top 300 places, top-band trails, the plan flow, and the trip and shared views. A measurable gate covers data completeness, a plan in 5 screens or fewer, phone speed, and zero S1/S2 bugs, and no campaign may link into the app before that gate passes. Section 4 also splits the work into must for launch and what can follow (about 140 to 200 sessions). Every item now carries a Phase instead of weeks. Other additions:
- **Track K: marketing.** Thirteen items and three research items, with a creative slot every two weeks, a page quality gate for SEO (thin pages `noindex,follow`), a waitlist with referral, data stories (Europe Cost Index, Sunshine Saturday on 2 January 2027), an open dataset with Show HN, and closed and open betas.
- **Affiliates.** I4 sets the apply order. I15 covers disclosure, `rel="sponsored"` and no partner scripts, so no cookie banner is needed.
- **I14.** The paywall moment the review found missing.
- **D14.** Licensed data sources: the Aviasales Data API for fares, Viator and Tiqets for activities.

Documentation, security and UI stay before launch at the owner's request, applied to the marketing surface first. Four research lanes back the changes, saved with their sources in `docs/research/2026-11-launch-plan-research.md`.

## Files touched

- Modified: `ROADMAP.md`, `Execution/_OPEN.md` (row T1047-a)
- Created: `docs/research/2026-11-launch-plan-research.md`, `Execution/P15/T1047-launch-plan-phases.md`

## Commands run

None that change the system. Web research and a read-only roadmap review ran in subagents; the roadmap was restructured by a script in the session scratchpad.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Week the marketing surface looks finished | about W12 (March) | W3 (about 18 Jan) | 9 weeks earlier |
| First marketing work | W14 (April) | W45 (now) | 21 weeks earlier |
| Tracks | 10 | 11 (K added) | +1 |
| Build items | 94 | 110 | +16 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First run of the restructure script failed in Bash | Nested quotes inside a heredoc | Script written to a file with the Write tool and run with `python -I` |

## Screens checked

None: documentation only.

## What is still open

- T1047-a: owner decisions added to ROADMAP.md section 19 (F-b Carta Intelligence timing, I-e affiliate wording in PRODUCT.md, J-a open beta in March, K-a launch market, K-b waitlist reward).

## Rollback procedure

`git revert` of the T1047 commit. Documentation only.
