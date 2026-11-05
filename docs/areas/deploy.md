# Deploy (Cloudflare Pages, R2)

Area doc for the MAP.md row "Deploy (Cloudflare Pages, R2)". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Cloudflare Pages for the shell, R2 for data and prerendered pages.

Screens: None (operator).

## How it works

build-pages.mjs builds with the data host set, stages data, checks Pages limits; push-data.mjs copies to R2; wrangler deploys. Only when the owner asks.

Full rules, formulas and thresholds (read these, do not copy them):

- [Deploy (Cloudflare Pages, R2, prerender, SEO)](../HANDBOOK.md#deploy-cloudflare-pages-r2-prerender-seo)

## Files

App: continent-app/scripts/build-pages.mjs, continent-app/scripts/r2/, continent-app/wrangler.toml

Pipeline and backend: app/scripts/prerender/

MAP.md handbook column: Platform. Latest tasks: T954, T875.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/dayRoute.test.mjs`, `continent-app/tests/prerenderDerived.test.mjs`, `continent-app/tests/prerenderShell.test.mjs`, `continent-app/tests/routeEffort.test.mjs`, `continent-app/tests/routeFigures.test.mjs`, `continent-app/tests/routeLinks.test.mjs`.

DOM checks: `continent-app/scripts/verify_booked_route.mjs`, `continent-app/scripts/verify_carta_route.mjs`, `continent-app/scripts/verify_day_routes.mjs`, `continent-app/scripts/verify_prerender.mjs`, `continent-app/scripts/verify_route_page.mjs`, `continent-app/scripts/verify_routes_block.mjs`.

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Deploy needs Cloudflare credentials in the environment (docs/security/SECRETS.md).

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "deploy|pages|r2" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
