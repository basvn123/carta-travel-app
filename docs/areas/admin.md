# Admin, moderation, telemetry

Area doc for the MAP.md row "Admin, moderation, telemetry". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

The admin panel, moderation and launch telemetry.

Screens: Admin, moderation.

## How it works

AdminPage reads Supabase tables and admin RPCs that are guarded by role checks; launchEvents.js records product events.

Full rules, formulas and thresholds (read these, do not copy them):

- [Admin panel, moderation and telemetry](../HANDBOOK.md#admin-panel-moderation-and-telemetry)

## Files

App: continent-app/src/admin/AdminPage.jsx, continent-app/src/components/admin/, continent-app/src/auth/moderation.js, continent-app/src/lib/launchEvents.js

Pipeline and backend: supabase/migrations/

MAP.md handbook column: Platform. Latest tasks: T365, T315.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: none matched by name (not verified whether another test covers this area).

DOM checks: `continent-app/scripts/verify_admin_panel.mjs`.

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Admin RPCs are checked by .github/workflows/admin-rpc-security.yml; docs/legal/ARTICLE30.md lists the data processed.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "admin|telemetry|moderation" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
