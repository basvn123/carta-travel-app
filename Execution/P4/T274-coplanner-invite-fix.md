# T274: Migration 046 fixes the co-planner invite in 020

## Task ID

T274 (register row T083-a, raised by T083)

## Date

2026-10-02

## What changed

Once migration 020 is live, a traveller can invite a friend to co-plan a trip. Before this task, that invite could never work. 020's insert policy on trip_collaborators, `coplan_insert_owner`, checks the friendship with `are_friends(a, b)`. Migration 011 revoked that function from the client roles. An RLS policy runs with the caller's privileges, so every invite from the client would fail with 42501 "permission denied for function are_friends". 020 is not on the live project yet, so nobody has hit this. T083's row policy test found it.

New migration `supabase/migrations/046_coplanner_invite_fix.sql` fixes it the same way 012 fixed profiles and 023 fixed trips. It adds `is_friend_me(other uuid)`. The function takes one argument and gets the caller from auth.uid(), so it only answers "am I an accepted friend of this person". The caller can already learn that by reading their own friendships rows, so the function reveals nothing new. It is security definer, stable, revoked from public and granted to anon and authenticated only. It returns false when there is no session. 046 then redefines `coplan_insert_owner` with 020's four conditions, and only the friendship check changes. are_friends and friend_link_status stay revoked.

Granting are_friends was rejected. It would let any signed-in account ask about any pair of users, which is what 011's revoke prevents.

046 redefines nothing that 044 or 045 replaces. Neither file touches trip_collaborators or its policies; 045 only corrects a comment about 020's trigger order.

The migration has a self-check that ends in `raise notice 'co-planner invite policy self-check passed'`. It asserts:

- trip_collaborators still has 020's four policies.
- The invite policy no longer names are_friends. It names is_friend_me and keeps the owner, pending and own-plan conditions.
- Both client roles can execute is_friend_me.
- is_friend_me exists once and takes one argument.
- are_friends and friend_link_status are still out of reach of the client roles.
- friendships does not force RLS. The definer function relies on its owner being exempt.

A second block calls is_friend_me as `authenticated` and aborts the paste if that call is refused, as 023 does.

`continent-app/scripts/admin/test_rls_policies.mjs` now treats the invite as a normal pass, not a known fault:

- KNOWN_UNCALLABLE is empty. Its comment says why.
- The trip_collaborators fixture now seeds the invite as the victim through the policy, not as the database owner, so the invite path itself is under test.
- One new check: the same owner, on the same plan, cannot invite somebody who is not an accepted friend. The refusal must be a row-level security violation, not a 42501. This proves the friendship check still blocks non-friends and is not just callable.

Paste order: paste 046 right after 020, which needs 011 and 019 first. If 020 is ever pasted again, paste 046 again after it, because 020 recreates the broken policy. 019 and 020 are on no `_OPEN-MASTER` paste list yet. Adding 019, 020 and 046 there is owner row T274-a.

## Files touched

**Created:**
- `supabase/migrations/046_coplanner_invite_fix.sql` (root repo)
- `Execution/P4/T274-coplanner-invite-fix.md` (root repo)

**Modified:**
- `continent-app/scripts/admin/test_rls_policies.mjs` (app repo, 18 insertions, 15 deletions)
- `Execution/_OPEN.md` (T083-a closed, T274-a added)

The test script is committed in the app repo only. The root repo's tracked copy is mirrored at merge time, as after T272.

## Commands run

```
# root worktree is sparse; supabase/ was not checked out
git -C wt/T274 sparse-checkout add supabase

# throwaway cluster on 55442, Git Bash, $S = session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg274" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg274" -o "-p 55442" -l "$S/pg274.log" -w start

# after: new script, migrations 001 to 046 from the worktree
cd wt/T274-app
PGPORT=55442 CARTA_TEST_DB=carta_t274_after CARTA_MIGRATIONS=wt/T274/supabase/migrations node scripts/admin/test_rls_policies.mjs
PGPORT=55442 CARTA_MIGRATIONS_DIR=wt/T274/supabase/migrations node scripts/admin/test_admin_rpc_security.mjs

# before: main checkout's script and migrations (001 to 045)
cd "Travel App/continent-app"
PGPORT=55442 CARTA_TEST_DB=carta_t274_before CARTA_MIGRATIONS="Travel App/supabase/migrations" node scripts/admin/test_rls_policies.mjs

# negative control: new script, migrations without 046
cd wt/T274-app
PGPORT=55442 CARTA_TEST_DB=carta_t274_neg CARTA_MIGRATIONS="Travel App/supabase/migrations" node scripts/admin/test_rls_policies.mjs

"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg274" -w stop
rm -rf "$S/pg274"
```

No app screen changed, so no browser check was needed at 380px or desktop width. Nothing was applied to the live project.

## Config and secrets set

None.

## Before/after measurements

Measured on a throwaway PostgreSQL 18 on port 55442.

| Metric | Before | After | Delta |
|---|---|---|---|
| Policies that call a function their caller cannot execute | 1 (coplan_insert_owner, known) | 0 | -1 |
| KNOWN_UNCALLABLE entries in test_rls_policies.mjs | 1 | 0 | -1 |
| Co-planner invite by the trip owner as `authenticated` | refused, 42501 | accepted | fixed |
| Invite of a non-friend by the trip owner | 42501 (never reached the policy) | refused by RLS | now a real refusal |
| test_rls_policies.mjs assertions | 334 of 334 passing | 335 of 335 passing | +1 |
| test_admin_rpc_security.mjs | not run in this task | 138 of 138 passing, 046 applied | |
| New script against migrations without 046 | | 7 failing (are_friends 42501) | negative control holds |

The +1 net is three changes: one assertion for applying 046, one for the non-friend invite, and the "known entry still broken" assertion removed.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first before run aborted with "role service_role already exists" | I ran it at the same time as the after run on the same cluster, and roles are cluster-wide, so the two stub scripts raced | Re-ran it on its own; it passed 334 of 334 |
| supabase/migrations was missing from the root worktree | The worktree is a sparse checkout that leaves out supabase/ | `git sparse-checkout add supabase` in the worktree |

## What is still open

T274-a (user): 019, 020 and 046 are on no `_OPEN-MASTER` paste list. Add them in the order 019, 020, 046, with 046 right after 020. If 020 is pasted again, paste 046 again. Until 046 is live after 020, co-planner invites from the app fail.

The CI job rls-policies (T083-c) reads every file in supabase/migrations, so it will apply 046 automatically on the first push. Nothing is needed there.

## Rollback procedure

Nothing is applied anywhere, so there is no data to undo. Root repo: `git revert` the T274 commits. App repo: `git -C continent-app revert` the T274 commit. If 046 has been pasted into the live project and must be undone, paste 020's `coplan_insert_owner` block again and run `drop function public.is_friend_me(uuid);`. Invites then fail again with 42501. This rollback does not delete any rows.
