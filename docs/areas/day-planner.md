# Day planner and plan-day AI

Area doc for the MAP.md row "Day planner and plan-day AI". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Day by day planning, the AI day plan, town suggestions and magic import of bookings.

Screens: Day planner, AI day plan, Magic import.

## How it works

DayPlannerTab builds days locally (day*.test files cover the builders); plan-day, suggest-city and parse-booking are Supabase Edge Functions on Gemini behind per-user and global caps.

Full rules, formulas and thresholds (read these, do not copy them):

- [Day planner](../HANDBOOK.md#day-planner)
- [AI day plan (plan-day)](../HANDBOOK.md#ai-day-plan-plan-day)
- [AI town suggestions (suggest-city)](../HANDBOOK.md#ai-town-suggestions-suggest-city)
- [Magic import (parse-booking)](../HANDBOOK.md#magic-import-parse-booking)

## Files

App: continent-app/src/planner/DayPlannerTab.jsx, continent-app/src/planner/days/, continent-app/src/planner/aiDayPlan.js, continent-app/src/planner/dayPlanStore.js

Pipeline and backend: supabase/functions/plan-day/, supabase/functions/suggest-city/

MAP.md handbook column: Planning. Latest tasks: T1015-T1016, T895-T900.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/dayBands.test.mjs`, `continent-app/tests/dayBuild.test.mjs`, `continent-app/tests/dayIdeas.test.mjs`, `continent-app/tests/dayNames.test.mjs`, `continent-app/tests/dayRoute.test.mjs`, `continent-app/tests/daySpread.test.mjs`, `continent-app/tests/dayStats.test.mjs`, `continent-app/tests/dayTrack.test.mjs`, `continent-app/tests/planAppSync.test.mjs`, `continent-app/tests/planBedNudge.test.mjs`, `continent-app/tests/planBudget.test.mjs`, `continent-app/tests/planFlowFresh.test.mjs`, `continent-app/tests/planPrefill.test.mjs`, `continent-app/tests/plannerStore.test.mjs` and 2 more.

DOM checks: `continent-app/scripts/verify_day_dates.mjs`, `continent-app/scripts/verify_day_ideas.mjs`, `continent-app/scripts/verify_day_landing.mjs`, `continent-app/scripts/verify_day_overview.mjs`, `continent-app/scripts/verify_day_routes.mjs`, `continent-app/scripts/verify_day_start_point.mjs`, `continent-app/scripts/verify_day_steps.mjs`, `continent-app/scripts/verify_day_workspace.mjs`, `continent-app/scripts/verify_plan_mocks.mjs`, `continent-app/scripts/verify_plan_tiers.mjs`, `continent-app/scripts/verify_planner_t8.mjs`, `continent-app/scripts/verify_planner_v2.mjs`, `continent-app/scripts/verify_planner_v2_flow.mjs`.

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Edge Functions check the pass tier and the AI caps; keys are Supabase secrets, never in the app (docs/security/SECRETS.md). Never the Claude API.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "day planner|plan-day|parse-booking|suggest-city" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
