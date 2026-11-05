# Plan flow and wizard

Area doc for the MAP.md row "Plan flow and wizard". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

The Plan home and the guided wizard that turns settings into a trip.

Screens: Plan home, wizard steps.

## How it works

PlanFlow routes between Plan home, the wizard steps and the finder; choices are stored as draft state and handed to the trip page.

Full rules, formulas and thresholds (read these, do not copy them):

- [Plan home and the plan flow](../HANDBOOK.md#plan-home-and-the-plan-flow)

## Files

App: continent-app/src/planner/flow/PlanFlow.jsx, continent-app/src/planner/flow/PlanHome.jsx, continent-app/src/planner/wizard/, continent-app/src/planner/GuidedTripWizard.jsx

Pipeline and backend: none (app only)

MAP.md handbook column: Planning. Latest tasks: T1002, T989-T991.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/draftState.test.mjs`, `continent-app/tests/flowGraph.test.mjs`, `continent-app/tests/planAppSync.test.mjs`, `continent-app/tests/planBedNudge.test.mjs`, `continent-app/tests/planBudget.test.mjs`, `continent-app/tests/planFlowFresh.test.mjs`, `continent-app/tests/planPrefill.test.mjs`, `continent-app/tests/plannerStore.test.mjs`, `continent-app/tests/savedPlan.test.mjs`, `continent-app/tests/wizardFlightChoices.test.mjs`, `continent-app/tests/wizardSteps.test.mjs`.

DOM checks: `continent-app/scripts/verify_plan_mocks.mjs`, `continent-app/scripts/verify_plan_tiers.mjs`, `continent-app/scripts/verify_planner_t8.mjs`, `continent-app/scripts/verify_planner_v2.mjs`, `continent-app/scripts/verify_planner_v2_flow.mjs`.

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Draft state stays on the device until saved to My trips.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "plan flow|wizard|plan home" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
