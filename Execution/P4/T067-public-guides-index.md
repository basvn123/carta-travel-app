# T067: Public guides index (read model)

## Task ID

T067

## Date

2026-09-28

## What changed

The admin page has a seventh tab, Guides, that lists every trip plan a traveller has made public, newest first, with the author's name, handle and email, the publish date, the cities and a views column. It reads a new RPC, `admin_list_public_guides()`, added by migration `supabase/migrations/036_admin_public_guides.sql`. Before this task the admin had no way to see what had been published: nothing in the admin surface read trip_plans by visibility. In the test database an admin could see 0 of 3 public guides before 036 and 3 of 3 after it. The migration is not applied to the live project.

### What "public" means here

The plan says "trip_plans where is_public = true". There is no is_public column. A plan is public when `trip_plans.visibility = 'public'`, the value 019 added to the check constraint 011 created, and 019's trigger stamps `published_at` when a plan becomes public and clears it when it stops being public. The RPC uses exactly that predicate, the same one the public gallery (`list_public_guides`) uses, and orders by `published_at desc nulls last`, then `created_at desc`, then id so the order is stable.

### The RPC

`admin_list_public_guides()` takes no arguments and returns jsonb in the shape the other admin read models use: `{ total, viewsCounted, rows }`, or `{ error }` on refusal. Each row carries id, label, userId, email, handle, displayName, avatarEmoji, inGallery, publishedAt, createdAt, updatedAt, stops (a count), cities (in stop order) and views. It does not carry the trip payload or the stop dates; a moderator reading the list does not need them and they are the private part of a plan.

It is SECURITY DEFINER with `search_path = ''`, passes `admin_guard('read')` first (a non-admin gets `forbidden`, an admin over 60 audit rows a minute gets `slow_down`), and is granted to authenticated and service_role, not anon. Like the other admin reads it writes no audit row. The email comes from `auth.users`, joined inside the function. The browser never joins to auth.users and cannot: the test shows anon, a plain user and an admin all get "permission denied" reading it directly.

### Views are not counted anywhere

I looked for a view counter before writing a column for it. There is none. trip_plans has no counter, no table records a read of a guide or of a share link, and the one hook that fires when a guide is opened, `public_guide_opened` (019), only awards the local_guide badge (013) and writes nothing countable. So `views` is always 0 and the payload says `viewsCounted: false`. The tab shows the 0 in the Views column, as the task's done condition asks, and a sentence above the table says views are not counted yet, so nobody reads 0 as a measurement. When a counter exists only the SQL for that one field changes; the tab and the payload shape stay as they are. Building the counter is T067-a.

### Public but not in the gallery

The public gallery and `get_public_guide` both INNER join profiles, so a public plan whose author has no profiles row is invisible to every visitor. That can happen: 010's signup trigger swallows its own failure so a signup never breaks, and leaves the account without a profile. The admin list LEFT joins, shows those plans too, and marks them with a "Not in gallery" chip and a one-line explanation under the table. The test builds exactly this case. Whether to repair such accounts or refuse to publish without a profile is an owner decision (T067-d).

### The tab

The tab follows the T062 split: `PublicGuides.jsx` is the view, `usePublicGuides.js` is the hook, the shell (`AdminPage.jsx`) calls the hook and routes the section, and `src/auth/admin.js` has the one-line `adminListPublicGuides` wrapper next to the other admin calls. The tab sits between Content and Feedback, so the two things a moderator reads about users' content sit next to each other.

One thing differs from the other hooks, on purpose. They all fetch at unlock; this one fetches the first time the Guides tab is shown and then keeps the list, like every other tab keeps its state across visits. T062 went to some trouble to keep the unlock request sequence identical, and the guides list has no limit, so it is only fetched by someone who opened the tab. A Refresh button reloads it. The shell's header comment says this.

The view reuses the existing admin classes only (`adminpage-table adminpage-table-static`, `adminpage-namebtn`, `adminpage-chip`, `adminpage-err` with `adminpage-retry`) and adds no CSS. It tells three states apart the way the Users tab does: rows, a real empty list ("Nobody has published a guide yet..."), and a failure, which shows the database's message with a retry and draws no table. Before 036 is pasted, that failure is what the live tab will show. The author cell is a button that opens the author's account through the same hand-off the feedback inbox uses. Measured facts (email, date, views, count) are mono with tabular figures; titles, cities and names are sans. There is no action button on a row: unpublishing is the takedown RPC of the plan's Phase 2 and belongs to its own task.

The copy is English only, as every other admin string is; en.js got 14 keys. carta-design's closing questions, answered for this diff: no hex values and no new CSS at all; no warm neutral, serif, gradient or shadow added (the admin page's existing app palette is untouched, see the skill's superseded note); no flag colour; mono only on measured facts; the only button on the tab is the secondary Refresh; the heading is the tab name, matching every other admin tab; no em dashes and no banned words. The one thing I removed was a hover-only tooltip on the chip, replaced by a visible sentence.

### Register rows

T062-f is closed by this task. Its AdminPage.jsx part is fixed: the header now describes seven sections, not four. The other two files it names (AiUsage.jsx, Margin.jsx) are outside this task's scope, so their stale comments are carried forward as T067-e. T062-d (the feedback inbox named ModerationQueue) and T062-e (moving ContentSection.jsx) were read and left open: neither is in this task's scope, and T062-d belongs to the notice-and-action tasks.

## Files touched

All paths from the repo root. App files are committed in both repos.

**Created:**
- `supabase/migrations/036_admin_public_guides.sql`
- `continent-app/src/components/admin/PublicGuides.jsx`
- `continent-app/src/components/admin/usePublicGuides.js`
- `continent-app/scripts/admin/test_admin_public_guides.mjs`
- `Execution/P4/T067-public-guides-index.md`

**Modified:**
- `continent-app/src/admin/AdminPage.jsx` (section list, hook call, route, header comment)
- `continent-app/src/auth/admin.js` (adminListPublicGuides)
- `continent-app/src/i18n/en.js` (14 admin keys)
- `Execution/_OPEN.md` (T062-f closed, rows T067-a to T067-f)

`verify_admin_panel.mjs` is not modified; see below for how the tab was checked.

## Commands run

```
git checkout -b p4-public-guides-index
git -C continent-app checkout -b p4-public-guides-index

# throwaway cluster (Git Bash); $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg67" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg67" -o "-p 55434" -l "$S/pg67.log" -w start
PGPORT=55434 node continent-app/scripts/admin/test_admin_public_guides.mjs
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg67" -w stop
rm -rf "$S/pg67" "$S/pg67.log"
PGPORT=55434 node continent-app/scripts/admin/test_admin_public_guides.mjs   # skip path

# from continent-app/
npx eslint src/admin/AdminPage.jsx src/components/admin/ src/auth/admin.js
npm run build
node scripts/verify_admin_panel.mjs
```

The test harness was not retyped: its imports, psql helpers and Supabase stubs were sliced from `test_site_config_visibility.mjs` (T066) by line range, with only the database name changed. It applies 002, 004, 006, 007, 009, 010, 011, 014 to 017, 018 (from a `{5,255}` patched copy, T031-d; 018 is not edited), 019, 032 to 035 and then 036.

To apply live: paste 036 into the Supabase SQL editor for ntssxktaduxzpsmejwyv after 035 and look for "admin public guides self-check passed". Never `db push`. The self-check requires 015, 010, 011 and 019 to be in place, confirms the function is definer with an empty search_path, calls admin_guard('read'), is not executable by anon, and that calling it with no signed-in caller (as the SQL editor does) returns `forbidden`.

## Config and secrets set

None.

## Before/after measurements

Measured in the throwaway database with three public plans (one by an author without a profile) and one private, one friends-only and one link-shared plan. The live table was not queried, so the live number of public guides is unknown.

| Metric | Before | After | Delta |
|---|---|---|---|
| Public guides visible to an admin (test DB) | 0 of 3 (no RPC) | 3 of 3 | +3 |
| Public guides the public gallery shows (same DB) | 2 of 3 | 2 of 3 | 0 |
| Non-public plans in the admin list | | 0 of 3 | |
| RPC rows at 503 public plans | | 503 of 503, 216 KB JSON, 124 ms incl. psql start | |
| Admin page tabs | 6 | 7 | +1 |
| Fetches of the guides list at unlock (harness copy) | | 0 | |
| test_admin_public_guides.mjs | | 55 of 55 passing | |
| verify_admin_panel.mjs checks passing | 29 of 30 (T062) | 29 of 30 | 0 |

The one harness failure is step 11, "the non-admin hub changed shape", the same failure T062 recorded before its split and already registered as T042-d.

The SQL test was also checked against a broken function: with the order flipped to ascending and the profiles join made INNER, 6 of the 55 assertions failed (row count, order, the no-profile row, the restamp, the 503-row count, the bulk order), so it does catch the two things most likely to go wrong. The file was restored before commit.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first test seed failed with a duplicate key on profiles | 010's signup trigger creates a profile for every auth.users insert | Update author A's profile and delete author B's, which also models the real way an account ends up with none |
| A scratch-harness check for "Not in gallery" failed | `.adminpage-chip` is `text-transform: uppercase`, so innerText reads NOT IN GALLERY | Count the chip by locator instead of matching body text |
| The scratch author hand-off check first failed | The harness deletes Zoe's account in step 8, so opening her returns not_found | Hand off from Marco's row instead |
| `sed -i` on en.js turned its CRLF endings into LF | Git Bash sed on Windows | Rewrote the file with CRLF; the diff is 14 added lines only |

## What is still open

There is no view counter, so every guide shows 0 views and the tab says so (T067-a). The counter wants a decision on what counts as a view (one per visitor per day, not the author), so it is a task of its own; `public_guide_opened` is the place to bump it, since it already fires on every open by someone other than the author.

The RPC has no paging and returns every public guide. At 503 guides that was 216 KB of JSON and fast enough, but it will not stay that way. `p_limit` and `p_offset` like admin_list_feedback, plus a "Show more" in the tab, is T067-b.

The owner has to paste 036 into the live SQL editor after 035 (T067-c). Until then the Guides tab shows the database's "could not find the function" message with a retry, and every other tab works as before.

Public plans whose author has no profile are invisible to the public although their column says public. The tab now shows them. Whether to repair the missing profiles or refuse to publish without one is the owner's call (T067-d).

T062-f is closed; its remaining two stale comments are T067-e.

`verify_admin_panel.mjs` does not know about the Guides tab. I checked the tab with a scratch copy of the harness that added a stub for the RPC and a step that asserted: no fetch at unlock, three rows newest first with name, handle, email and cities, views 0 with the not-counted sentence, exactly one not-in-gallery chip, one fetch across two visits, a failed refresh showing the message and no table, retry restoring it, the author button opening the account, and no sideways page scroll at 380px (the table scrolls inside its frame, as the Users table does). All passed and I looked at the desktop and 380px screenshots. The copy was deleted, not committed, because the harness is outside this task's files. Folding those checks into the harness is T067-f.

Not verified: the tab against a real Supabase project, and the migration on the live database. Both need 036 pasted first.

## Rollback procedure

Live, if 036 has been pasted: run the down section from the header of 036 in the SQL editor (`drop function if exists public.admin_list_public_guides(); notify pgrst, 'reload schema';`). No table or row was changed, so nothing else needs restoring.

In git:

```
git -C continent-app revert a243bc1
git revert <the T067 report commit> 2a07b9440
```

or drop the branch `p4-public-guides-index` in both repos before merge. Reverting the app commit without the migration is safe: nothing else calls the RPC.
