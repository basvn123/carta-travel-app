# T066: Scope site_config visibility with a public flag

## Task ID

T066

## Date

2026-09-28

## What changed

`site_config` now has a `public` column, and the browser can read a row only
when that column is true. Until now the table had one read policy from 014,
`site_config_read_all`, with `USING (true)`, so anyone holding the anon key
could read every row. Migration `supabase/migrations/035_site_config_visibility.sql`
adds `public boolean not null default false`, replaces the old policy with
`site_config_read_public` (`FOR SELECT TO anon, authenticated USING (public = true)`),
and marks the three keys the app reads as public. Every other key, present or
future, is private unless someone marks it otherwise. In the test database,
anon could read 4 of 4 rows before 035 and 3 of 4 after it, the fourth being
a backend number of the kind the earlier migrations tell an operator to store
there. The migration is not applied to the live project.

### Which keys are public, and why

The app reads site_config through the Supabase client in two places, and
nowhere else. `src/hooks/useSiteConfig.js` loads every row it can see, once
per page load, for every visitor. Three consumers use it:
`AnnouncementBar.jsx` reads `announcement`, `MaintenanceGate.jsx` reads
`maintenance`, and `useFeature()` reads `features`. So those three are public.
Maintenance matters most: the gate fails open, so if `maintenance` were
private the app would simply never close, and nobody would get an error to
notice. `useFeature` has no caller today, but the flags exist to gate public
surfaces, and the admin Site tab edits them, so a private `features` row would
be a trap for whoever wires the first flag.

No other key is seeded. 014 seeds `announcement` and `features`, 017 seeds
`maintenance`, and nothing else inserts rows. The migrations do name three
more keys an operator may add by hand: `ai_global_daily_cap` (030, the mirror
of the Edge Function secret that register row T042-c asks for) and
`ai_cost_plan_cents` and `ai_cost_ground_cents` (031, the AI prices on the
margin dashboard). All three stay private, which is the point of the task.

### Why the backend readers keep working

`admin_ai_usage` (030) and `admin_margin` (031) read those keys inside
SECURITY DEFINER functions. Row level security does not apply to a table's
owner unless the table is set to FORCE ROW LEVEL SECURITY, and site_config is
not. On Supabase the functions and the table are both owned by `postgres`,
which is not a superuser there, so it is the owner exemption that lets them
through, not superuser rights. The test models exactly that with a
non-superuser owner role and a definer function, and the function still reads
the private key when anon calls it. The migration's self-check also refuses
to pass if the table is ever forced. The Edge Functions under
`supabase/functions` do not read site_config at all (grep finds nothing), so
the service role question does not arise.

### admin_set_config and the flag

The current body (034) upserts with `ON CONFLICT (key) DO UPDATE SET value,
updated_at, updated_by`. It never names `public`, so an existing public key
stays public when an admin saves it, and a key an admin creates through the
RPC gets the column default, false. Both are asserted in the test. That is
the right default: a new key is most likely a backend knob, and making it
visible should be a deliberate act. No function was changed.

There is no way to flip the flag except SQL in the editor. Whether admins
need one, and whether that is an RPC, a checkbox in the Site tab or both, is
a design call left open (T066-b).

### The admin Site tab

`src/components/admin/useConfigManager.js` reads site_config through the
client as well, as the admin's `authenticated` session, not through an admin
RPC. After 035 an admin sees only public rows that way, the same as anyone.
The Site tab reads exactly `announcement`, `maintenance` and `features` and
ignores every other key, so nothing on it changes. It never showed the
private keys, and it still does not. What is lost is only the possibility of
reading a private key from the browser at all, even as an admin, which is the
same gap as the missing flag switch and is registered with it.

### Why the policy has a new name

The old policy is dropped and a new one is created under a new name,
`site_config_read_public`, rather than redefined under the old name. The
reason is 014. If 014 is ever pasted again, it drops and re-creates
`site_config_read_all` with `USING (true)`. Under the old name that would
silently undo this task and 014's self-check would still pass. Under the new
name the table ends up with two policies and 014's self-check fails with
"site_config should carry exactly the read policy, found 2". That is loud,
but not safe on its own: the test shows that under psql's per-statement
commits the `USING (true)` policy survives the failed paste, and because
permissive policies are OR-ed, every row is readable again. Pasting 035 after
it closes the table again (also tested). Whether the Supabase SQL editor
rolls a failed script back as a whole was not checked, so the rule is simply:
after any re-paste of 014, paste 035 again. This is in register row T066-a.

### The test

`continent-app/scripts/admin/test_site_config_visibility.mjs` reuses the T065
harness: a throwaway PostgreSQL 18 cluster on port 55434, stubs for schema
auth, `auth.users`, `auth.uid()`, `auth.jwt()` and the roles anon,
authenticated and service_role, migrations applied through psql with
spawnSync so the self-check notices are kept, and 018 applied from a patched
`{5,255}` copy in a temp directory (T031-d; 018 is not edited). One thing was
added to the stubs: Supabase grants every table in `public` to the three API
roles by default, and the harness now does the same with `alter default
privileges`. Without it an anon read would fail on a missing GRANT before RLS
was ever consulted, and the test would prove nothing about the policy.

Section 0 guards against a vacuous result. It asserts from `pg_roles` that
anon and authenticated are neither superuser nor bypassrls, that a `set role`
really changes `current_user`, and that RLS is on and not forced. Then it
reads the table as anon, as a plain signed-in user and as an admin through
the client, before and after 035, inserts a private key as the superuser and
checks that none of the three can see it even when asking for it by key,
checks that neither role can UPDATE the flag, runs admin_set_config on
existing and new keys, pastes 035 twice, runs the definer probe, and finally
re-pastes 014 to show the hazard above. 67 assertions, all passing. The skip
path was also run against a stopped server and prints SKIPPED, exits 0, and
prints no pass line.

The real output:

```
site_config is readable by anon and authenticated only where public = true (migration 035)
-----------------------------------------------------------------------------------------
  ok  migration applied: 006_ai_day_planner.sql
  ok  migration applied: 007_passes.sql
  ok  migration applied: 010_profiles.sql
  ok  migration applied: 014_admin.sql
  ok  migration applied: 015_admin_hardening.sql
  ok  migration applied: 016_admin_resilient.sql
  ok  migration applied: 017_admin_analytics.sql
  note  018 as committed fails here: ERROR:  2201B: invalid regular expression: invalid repetition count(s)
  ok  018 carries the {5,600} bound the failure points at
  note  applying a copy with {5,255} from a temp dir, for this test only
  ok  migration applied: 018_content_overrides.sql (patched copy, {5,255})
  ok  migration applied: 032_admin_mfa_destructive.sql
  ok  migration applied: 033_admin_audit_rollback.sql
  ok  migration applied: 034_admin_guard_tiers.sql
  ok  034 self-check ran and passed

  The readers are subject to RLS:
  ok  anon is neither superuser nor bypassrls (pg_roles rolsuper,rolbypassrls = false,false)
  ok  authenticated is neither superuser nor bypassrls (pg_roles rolsuper,rolbypassrls = false,false)
  ok  a read as "anon" runs as current_user anon
  ok  a read as "authenticated" runs as current_user authenticated
  ok  a read as "authenticated admin" runs as current_user authenticated
  ok  site_config has row level security on
  ok  site_config does not force row level security (the owner is exempt)

  Before 035:
  ok  the seeds plus the backend key are present: ai_global_daily_cap, announcement, features, maintenance
  ok  before 035: exactly one read policy, site_config_read_all, USING (true)
  ok  before 035: "anon" reads every row, the backend key included (4 of 4)
  ok  before 035: "authenticated" reads every row, the backend key included (4 of 4)
  ok  before 035: "authenticated admin" reads every row, the backend key included (4 of 4)
  measure  before 035: rows in site_config 4; readable by anon 4, by authenticated 4, by an admin through the client 4

  ok  migration applied: 035_site_config_visibility.sql
  ok  035 self-check ran and passed

  After 035:
  ok  site_config.public exists as boolean, not null, default false (boolean,NO,false)
  ok  still exactly one policy on site_config (the 014 self-check invariant)
  ok  the policy is site_config_read_public, FOR SELECT, TO anon and authenticated, USING (public = true)
  ok  announcement is public
  ok  features is public
  ok  maintenance is public
  ok  ai_global_daily_cap is private
  ok  no value, updated_at or updated_by moved
  ok  after 035: "anon" reads exactly the three app keys (announcement, features, maintenance)
  ok  after 035: "authenticated" reads exactly the three app keys (announcement, features, maintenance)
  ok  after 035: "authenticated admin" reads exactly the three app keys (announcement, features, maintenance)
  measure  after 035: rows in site_config 4; readable by anon 3, by authenticated 3, by an admin through the client 3
  ok  a key inserted by the superuser without a flag defaults to private
  ok  "anon" cannot read the private test key, not even by name
  ok  "authenticated" cannot read the private test key, not even by name
  ok  "authenticated admin" cannot read the private test key, not even by name
  ok  anon cannot flip the flag (permission denied for table site_config)
  ok  authenticated cannot flip the flag (permission denied for table site_config)
  ok  the private test key is still private after the refused updates

  admin_set_config after 035:
  ok  admin_set_config on announcement succeeds
  ok  announcement took the new value and is still public
  ok  admin_set_config on maintenance succeeds and it stays public
  ok  admin_set_config on features succeeds and it stays public
  ok  anon still reads the updated features row
  ok  admin_set_config creates a new key
  ok  the new key is private (public = false, from the column default)
  ok  "anon" cannot read the new key through the client
  ok  "authenticated" cannot read the new key through the client
  ok  "authenticated admin" cannot read the new key through the client
  ok  a second admin_set_config on the new key updates it and leaves it private
  ok  still exactly one policy after the RPC calls

  Pasting 035 again:
  ok  migration applied: 035_site_config_visibility.sql
  ok  035 pasted twice still passes its self-check
  ok  no flag changed (ai_global_daily_cap=false,announcement=true,features=true,maintenance=true,t066_new_key=false,t066_private=false)

  SECURITY DEFINER readers (030, 031):
  ok  the probe owner is neither superuser nor bypassrls
  ok  a SECURITY DEFINER function owned by the table owner reads the private ai_global_daily_cap when anon calls it (got 200)
  ok  while anon still cannot read ai_global_daily_cap directly

  Ordering hazard:
  ok  re-pasting 014 after 035 fails 014's own self-check (site_config should carry exactly the read policy, found 2)
  note  after that failed re-paste, under psql's per-statement commits, the policies are site_config_read_all (true) and site_config_read_public ((public = true)) and anon reads 6 rows: ai_global_daily_cap, announcement, features, maintenance, t066_new_key, t066_private
  ok  so a failed 014 re-paste left to stand makes the table world-readable again
  ok  migration applied: 035_site_config_visibility.sql
  ok  pasting 035 after it closes the table again: self-check passes and anon reads the three app keys only

  rows readable by anon: 4 of 4 before 035, 3 of 4 after

67 assertions, 67 passing, 0 failing.
All site_config visibility tests passed.
```

## Files touched

All paths from the repo root. The test is committed in both repos.

**Created:**
- `supabase/migrations/035_site_config_visibility.sql`
- `continent-app/scripts/admin/test_site_config_visibility.mjs`
- `Execution/P4/T066-config-visibility-scoping.md`

**Modified:**
- `Execution/_OPEN.md` (rows T066-a to T066-c)

**Not modified:** 014, 017, 018 and 034; every app source file, including
`useSiteConfig.js` and `useConfigManager.js`.

## Commands run

```
git checkout -b p4-config-visibility-scoping
git -C continent-app checkout -b p4-config-visibility-scoping

# throwaway cluster (Git Bash); $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg66" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg66" -o "-p 55434" -l "$S/pg66.log" -w start

PGPORT=55434 node continent-app/scripts/admin/test_site_config_visibility.mjs

"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg66" -w stop
rm -rf "$S/pg66" "$S/pg66.log"
PGPORT=55434 node continent-app/scripts/admin/test_site_config_visibility.mjs   # skip path, server stopped
```

The migration was applied only to the throwaway cluster. To apply it live,
paste the file into the Supabase SQL editor for ntssxktaduxzpsmejwyv after
034 and look for the notice "site config visibility self-check passed". Never
`db push`. Then run `select key, public from public.site_config order by key;`
on the live project. Any key there other than the three will now be private;
if one of them turns out to be something the public app needs, that is a
reason to set its flag, but the app code read for this task found none.

## Config and secrets set

None.

## Before/after measurements

Measured in the throwaway database with the three seeded keys plus one
backend key (`ai_global_daily_cap`) inserted as an operator would. The live
table was not queried, so its row count is unknown.

| Metric | Before | After | Delta |
|---|---|---|---|
| site_config rows readable by anon | 4 of 4 | 3 of 4 | -1 |
| Rows readable by a signed-in non-admin | 4 of 4 | 3 of 4 | -1 |
| Rows readable by an admin through the client | 4 of 4 | 3 of 4 | -1 |
| Private rows readable by any client role | 1 | 0 | -1 |
| Read policies on site_config | 1 | 1 | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 018 as committed does not apply on PostgreSQL 18 | The `{5,600}` regex bound is over the cap of 255 (T031-d, already registered) | The test applies a `{5,255}` copy from a temp directory; 018 is unchanged |

Nothing else broke.

## What is still open

The owner has to paste 035 into the live SQL editor after 034 (T065-a) and
check the self-check notice and the `select key, public` list. The same
paste is needed after any later re-paste of 014, because 014 re-creates the
old `USING (true)` policy under its old name and the table becomes
world-readable again even though 014's own self-check fails (T066-a).

Admins have no way to mark a key public or private, and no way to read a
private key from the admin page, because the Site tab reads through the
client and not through an admin RPC. Nothing breaks today, since the Site
tab only reads the three public keys, but the first time someone wants to
show or edit a private threshold from the panel, or expose a new key to the
app, it will take SQL in the editor. The candidate is an admin RPC behind
`admin_guard` that lists every row with its flag and one that sets the flag
with an audit row in the 033 shape, plus a column in the Site tab. That is a
UI and RPC design call and was not built here (T066-b).

Three comments now describe the table as world-readable: the header of
`src/hooks/useSiteConfig.js` ("The table is world-readable"), the site_config
block in 014, and the "why it is world readable" paragraph in 018 that
compares content_overrides to site_config. The code is right and the
comments are stale. They belong to whichever task next touches those files;
014 and 018 are applied migrations and should get at most a note in a later
migration, not an edit in place (T066-c).

No earlier register row is closed by this task. T042-c, which asks the owner
to mirror the AI cap into site_config, still works as written: the key stays
private and `admin_ai_usage` still reads it.

## Rollback procedure

Live, if 035 has been pasted: run the down section from the header of 035 in
the SQL editor. It drops `site_config_read_public`, re-creates
`site_config_read_all` with `USING (true)`, drops the `public` column and
reloads the PostgREST schema. No value is lost; the column only carried the
flag. After that 014's self-check shape holds again (one policy).

In git:

```
git -C continent-app revert <the T066 test commit>
git revert <the T066 report commit> <the T066 migration commit>
```

or drop the branch `p4-config-visibility-scoping` in both repos before merge.
