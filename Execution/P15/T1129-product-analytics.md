# T1129: Product analytics without cookies or identifiers (I11)

## Date

2026-11-06

## What changed

The app now counts six funnel steps (Explore opened, place opened, plan started, priced draft reached, trip saved, shared) as one integer per day per step, with no cookie, device or user id, IP, path or time of day. Admin Overview has a new "Funnel (weekly)" card with the counts per step and the share of Explore opened, per week. The server half is migration 070 (never applied live). Same shape as launch_counts (048) and channel_counts (067). A step counts once per page load (an in-memory Set, nothing stored), so the numbers are visits that reached a step, not clicks and not people; steps are not linked to one person, so the shares are a rough funnel. Screens got one-line `trackFunnel(...)` calls only.

## Files touched

- New: `continent-app/src/lib/funnelCounts.js`, `continent-app/src/components/admin/FunnelCounts.jsx`, `continent-app/tests/funnelCounts.test.mjs`, `supabase/migrations/070_funnel_counts.sql`, `supabase/migrations/070_funnel_counts_down.sql`
- Counter calls: `App.jsx` (tab effect, `openDetail`), `planner/GuidedTripWizard.jsx`, `planner/TripPlannerTab.jsx`, `planner/trip/ShareSheet.jsx`, `planner/TripItinerary.jsx`, `planner/DayPlannerTab.jsx`
- Admin: `auth/admin.js` (`adminFunnelWeekly`), `components/admin/Overview.jsx`, `useOverview.js`
- Harnesses: `scripts/admin/test_admin_rpc_security.mjs` (section 11b), `scripts/admin/test_rls_policies.mjs` (section 4d)
- Docs: `docs/legal/ARTICLE30.md` (row 13c, two table rows), `docs/HANDBOOK.md`, `ROADMAP.md` (I11), `Execution/_OPEN.md`

## Commands run

Throwaway Postgres 16 on port 55435; `PGHOST=127.0.0.1 PGPORT=55435 PGUSER=postgres node scripts/admin/test_admin_rpc_security.mjs` (277 pass) and `test_rls_policies.mjs` (835 pass); `npx eslint` on touched files (0 errors); `npm test` (1472 pass, 0 fail).

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

Nothing broke. The first harness run failed only because the container user is root (no initdb) and node_modules was absent; fixed by running the cluster as `postgres` and `npm ci`.

## Screens checked

None in a browser (no Supabase in the container). The card's data shaping is unit tested; the end-to-end count to admin reader path is covered by the admin harness.

## What is still open

- T1129-a, T1129-b below. "First visit to saved trip" cohorts and the `site_config` experiment flag named in the I11 roadmap row are not done; I11 stays in progress.

## Rollback procedure

`git revert` the T1129 commit. If 070 was pasted, run `070_funnel_counts_down.sql` (drops two tables and two functions; counts are lost).

## Owner steps (for the checklist)

- [T1129-a] Paste funnel counts migration | the server half of I11 is only a file | open the SQL editor; paste `supabase/migrations/070_funnel_counts.sql`; run it | supabase/migrations/070_funnel_counts.sql
- [T1129-b] Check the admin Funnel card | confirm real ticks reach the admin reader | after the paste open Explore, a place, Plan, save and share a trip once each; reload admin Overview; check the Funnel (weekly) card shows each step | continent-app/src/components/admin/FunnelCounts.jsx
