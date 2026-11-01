# T985: migrations 052 to 060 live

## Task ID
T985

## Date
2026-11-01

## What changed
The owner pasted migrations 052 to 060 in the Supabase SQL editor (project ntssxktaduxzpsmejwyv), in order, on 2026-11-01. With them live, Together (group trips, friend visibility, ask to join, shared costs, shared lists, email preferences), copy invite links and Ask Carta chats are backed by the database.

Two things came up during the paste:
- 036 failed with "admin_list_public_guides() is not unique", because 045, which replaces it, was already live. 036 is superseded and must not be pasted on live.
- 052 failed its own self-check ("anon must not run accept_coplan_link"). Supabase grants EXECUTE on a new function to `anon` directly, so `revoke ... from public` alone leaves anon able to run it. The four revokes in `052_coplan_links.sql` now name `public, anon`, as 053 to 060 already did. The owner pasted the fixed file and it passed.

Branch `p15-migrations-live` (root repo), commit `470852de4e`.

## Files touched
**Modified:** `supabase/migrations/052_coplan_links.sql`, `Execution/_OPEN.md`

**Created:** this report, `Execution/P15/T985-together-375.png`, `Execution/P15/T985-together-1440.png`

## Commands run
- A liveness query in the SQL editor: one object per migration from 013 to 060. Before the paste, 052 to 060 were false.
- `node scripts/verify_live_policies.mjs`: all checks passed.
- Anonymous REST reads of the twelve new tables. Every table exists. Six refuse anon (401: coplan_links, ask_chats, group_trips, group_trip_votes, group_trip_expenses, shared_lists). Six answer an empty list (group_trip_budgets, friend_visibility, trip_join_requests, pay_links, email_prefs, email_log). `list_friend_shares` refuses anon.
- Playwright on https://carta-app.pages.dev/?tab=together at 375 px (touch phone) and 1440 px. The signed-out page shows its title, a line and Sign in. There is no horizontal scroll, no page error and no Supabase response of 400 or higher.

## Config and secrets set
None by this task. The owner pasted the migrations.

## Before/after measurements
| Metric | Before | After |
|---|---|---|
| Migrations 052 to 060 live | 0 of 9 | 9 of 9 |

## What broke and how it was fixed
- 052's self-check refused the first paste. Fixed in the file as described above.
- The first paste list included 036. It was dropped after the error, and a liveness query is now run before any paste list.

## What is still open
- T985-a: it is not known whether the paste of 060 printed its notice that pg_cron, pg_net or the Vault secrets are missing. If it did, the email cron job is not scheduled until those are set and 060 is pasted again. This comes before T944-b (the Resend secrets and the notify deploy).
- The signed-in Together screens were not walked live, because this session has no account. The fixture `?friendsmock` is off in the production build. The owner should sign in and open Together once.
- T460-a (the Stripe steps after 053) and T938-a (travel in the group budget) stay open, as before.

Closes T434-a, T575-a, T931-a, T932-a and T937-a.

## Rollback procedure
`git revert 470852de4e` restores the old revokes in the file. On the live database, each of 055 to 060 has a `_down.sql`. Pasting them in reverse order (060 first) removes the Together tables. That is one-way for any rows travellers have written since.
