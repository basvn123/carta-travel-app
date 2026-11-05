# Build box (Hetzner, scheduled runs)

Area doc for the MAP.md row "Build box (Hetzner, scheduled runs)". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

The Hetzner build box: scheduled pipeline runs, on-demand heavy workers.

Screens: None (operator).

## How it works

systemd timers start weekly.sh, which runs run_pipeline.py in the order of weekly_tasks.txt, pushes to R2 and can deploy; the late sweep and heavy jobs have their own units.

Full rules, formulas and thresholds (read these, do not copy them):

- [The build box (Hetzner scheduled runs)](../HANDBOOK.md#the-build-box-hetzner-scheduled-runs)

## Files

App: none

Pipeline and backend: infra/hetzner/, scripts/stays_scrape_task.ps1, run_pipeline.bat

MAP.md handbook column: Platform. Latest tasks: T992-T996, T740.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: none matched by name (not verified whether another test covers this area).

DOM checks: none matched by name (not verified whether another test covers this area).

Python tests matched by file name: `tests/test_pipeline_code_fixes.py`.

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Key-only SSH, firewall with port 22 only, secrets file mode 600 (infra/hetzner/README.md).

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first. The README says the boxes existed as code only when written; whether they run today is not verified here (see the handbook section and Execution/P3/_OPEN-hetzner.md).

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "hetzner|build box|box" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
