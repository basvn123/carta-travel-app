# My trips, account, together

Area doc for the MAP.md row "My trips, account, together". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Sign-in, the account panel, My trips storage and Together (shared trips).

Screens: My trips, Account, Together.

## How it works

Supabase auth and tables hold trips and shares under row level security; a device store keeps trips for signed-out travellers.

Full rules, formulas and thresholds (read these, do not copy them):

- [Sign-in and account](../HANDBOOK.md#sign-in-and-account)
- [My trips (saving and storage)](../HANDBOOK.md#my-trips-saving-and-storage)
- [Together, sharing and collaborative trips](../HANDBOOK.md#together-sharing-and-collaborative-trips)
- [Past trips](../HANDBOOK.md#past-trips)

## Files

App: continent-app/src/auth/mytrips/, continent-app/src/auth/account/, continent-app/src/together/TogetherPage.jsx, continent-app/src/auth/tripStorage.js

Pipeline and backend: supabase/migrations/

MAP.md handbook column: Platform. Latest tasks: T984-T987, T933-T936.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/deviceTripStore.test.mjs`, `continent-app/tests/myTrips.test.mjs`, `continent-app/tests/myTripsHub.test.mjs`, `continent-app/tests/shareLinkDay.test.mjs`, `continent-app/tests/shareLinkHostile.test.mjs`, `continent-app/tests/sharedLists.test.mjs`, `continent-app/tests/togetherGroupBand.test.mjs`, `continent-app/tests/togetherOverlaps.test.mjs`, `continent-app/tests/togetherSettle.test.mjs`.

DOM checks: `continent-app/scripts/verify_account_panel.mjs`, `continent-app/scripts/verify_trip_share.mjs`.

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Row level security is checked by .github/workflows/rls-policies.yml; Article 30 record in docs/legal/ARTICLE30.md.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "my trips|together|account" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
