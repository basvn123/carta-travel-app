# T475: total budget, transit, day planner and group choice, audited and written into the roadmap

> Renumbered on 2026-10-21 by T477: this task first ran as T470 on branch `p11-owner-calls-t470`, in parallel with the T470 on main. Task, register and roadmap numbers below are the new ones (T470 to T475, T471 to T476, plan file 2.14 to 2.22, roadmap rows per T477). Content is otherwise unchanged.

## Task ID

T475

## Date

2026-10-20

## What changed

The owner brought five ideas: search by a total trip budget instead of a day price, explain why a place is cheap or expensive, show time and cost between the stops of a multi-city trip, make the day planner executable (stay relative to sights, walking, opening days, live effect on the trip total, comparable options), and a native compare-and-vote card for a travel group. This task audited the code and data behind each idea, researched transit partners, search architecture and share cards on the web, and wrote the systems out in a new plan file, `Roadmap/2.22-budget-vervoer-dag-delen.md` (Dutch, like the roadmap). It added rows to `Roadmap/Carta roadmap.md`: 1.19 and 1.20 in phase 1; 2.22 to 2.24 in phase 2; 3.11 in phase 3; 4.22 to 4.24 in phase 4; 5.13 to 5.15 in phase 5. It also extended 5.1 and the phase intros, and updated the week plan. No code changed. The task builds on T469 (branch p11-seasonal-truth, same day). Idea two largely overlaps T469's season plan, so this task adds only the price decomposition and the cheap-trap label (2.24) and points to T469 for the rest.

The audit found the following:

- **Prices.** The map, pin and home price is bed plus food per person per day with no month (`costIndex.js:254-291`). The defaults of 7 nights, 2 people and four weeks out apply only to the destination price card. Local transport and tickets are priced nowhere. The og description in `index.html` claims local transport is priced.
- **Guided search** snaps a typed total to a day step (`budgetStep`, `ExploreTab.jsx:580`). Date bounds come from the frozen fare window, with a return no later than 2026-12-19 for 214 of 285 origins.
- **Between-stop legs.** The trip planner already prices legs and sums them into the total (`tripTotal.js:192-225`). The model is a haversine prior: Verona to Padua is train €8.04 pp in 1.08 h, no timetable, labelled as fact on screen. The day planner prices the same leg with flat €/km rates, so the two planners disagree. There is no partner adapter in the app.
- **Transit partners.**
  - Rome2Rio's API documentation returns 404.
  - Transitous is non-commercial only, which overturns the route T102-a proposed.
  - Partner APIs (Omio, Trainline, Distribusion) need approval and traffic.
  - Self-hosted MOTIS on GTFS is the feasible zero-partner route.
- **Day planner.** It has a stay pin and real OSRM foot routing. POI shards carry no opening hours and no entry prices, and nothing chosen there changes the trip total.
- **Sharing.** Hash links (`#trip=`, `#day=`, `#dest=`, `#shared=`) and a shortlist URL (`?fav=`) exist. There is no compare view and no vote anywhere. Hash links can never get a WhatsApp preview.

Each idea in the plan gets a validation method:

- **Budget search:** 25 hand-computed budget questions must match across the search, the receipt and the planners to the euro.
- **Transit estimates:** 30 sample rides per country, time within 15% and price within 25%.
- **Day planner:** ten test days checked against official sites.
- **Share previews:** checked in WhatsApp, iMessage, Telegram and Slack, plus a meta and size script.

## Files touched

**Modified:**
- Roadmap/Carta roadmap.md
- Execution/_OPEN.md

**Created:**
- Roadmap/2.22-budget-vervoer-dag-delen.md
- Execution/P11/T475-budget-transit-share-roadmap.md

**Deleted:**
- None

## Commands run

Three sub-agents ran: two read-only code audits and one web research pass. The audits covered budget, pricing, season data and sharing, then transit and the day planner, on continent-app HEAD 2333e97. The research covered transit partners, budget search architecture and share cards. The Verona, Padua and Ferrara legs were reproduced in node with `legTransportOptions` for 2 people. The work was done in a sparse worktree so that the shared main worktree, still on T469's branch, stayed untouched:

```
git worktree add --no-checkout ../wt/t470 -b p11-budget-transit-share fc1ea0a68
MSYS_NO_PATHCONV=1 git sparse-checkout set --no-cone 'Roadmap/' 'Execution/_OPEN.md' 'Execution/P11/T469-seasonal-truth-roadmap.md'
```

## Config and secrets set

None.

## Before/after measurements

Not measured. This is a planning task. The plan file names the figures the later tasks must move:

- 25 golden budget questions equal on every screen.
- 100 budget sentences in six languages parsed to the right filter.
- 30 sample rides per country within 15% on time and 25% on price.
- Ten test days correct on opening times and prices.
- Share previews under 300 KB that render in four messengers.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The main worktree was on T469's unmerged branch and shared with another session | T469 committed on p11-seasonal-truth and did not switch back | Worked in a sparse worktree at ../wt/t470 branched from fc1ea0a68, so T475 stacks on T469 without touching the shared checkout |
| `git sparse-checkout set '/Roadmap/'` wrote `C:/Program Files/Git/Roadmap/` | Git Bash path conversion on a leading slash | Re-ran with `MSYS_NO_PATHCONV=1` and patterns without a leading slash |
| Draft rows named Castelvecchio as closed on Mondays and Cortina as cheap in November | Unverified facts written as done conditions | Done conditions rewritten to be checked against official sites and the 2.13 golden set; the illustrative tables in the plan file are labelled as illustrative |

## What is still open

Merging this branch also merges T469, because it is branched from T469's commit. Merge T469 first, or merge both together.

The owner has five calls to make:

- **T475-a:** affiliate sign-ups with Flix (Awin) and Trainline (Partnerize), next to the Omio check in T315-b.
- **T475-b:** whether guests may create a vote.
- **T475-c:** whether the headline price on cards is the group total or the per-person day price, as part of 1.8.
- **T475-d:** the default buffer.
- **T475-e:** Hetzner capacity for MOTIS once 3.11 has measured it.

Small defects belong in roadmap rows 2.22 and 2.24:

- The "Not crowded" filter keeps only tier 1 and drops the 261 Quiet places (`guidedSearch.js:43`).
- `budgetStep` snaps a typed total to a day step.
- Date bounds come from the frozen fare window.
- The day planner prices day trips with flat €/km rates (`DayPlannerTab.jsx:1272-1281`) instead of `legTransportOptions`.
- The og and twitter description promises local transport (`index.html:27,36`).

T102-a still proposes Transitous for real rail durations. Transitous forbids commercial use, so roadmap 3.11 replaces it with self-hosted MOTIS. The row stays open until 3.11 lands.

The day planner's compare step and the stay picker would multiply calls to the public OSRM and Nominatim, which have no SLA. The plan keeps comparisons on the matrix and straight lines and routes only what the traveller picks. An own pedestrian router on the box is a later step if load grows.

## Rollback procedure

`git revert` the T475 commit. It touches only the two roadmap files, this report and the register rows. Remove the worktree with `git worktree remove ../wt/t470` once the branch is merged or dropped.
