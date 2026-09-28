# T069: Takedown RPC that unpublishes without deleting

## Task ID

T069

## Date

2026-09-28

## What changed

An admin can now take a public guide out of the gallery with a written reason, from the Guides tab or from a report card in the Reports tab. The guide goes private and stays in its owner's account, whole: in the test database the number of rows in trip_plans was 4 before the takedown and 4 after, the plan, its stops and its day plan are byte for byte what they were apart from two columns, and the owner still reads and edits it through their own RLS path. The audit log gained exactly one row carrying the reason and the before and after state. The work is migration `supabase/migrations/038_admin_unpublish_guide.sql`, which is not applied to the live project.

The distinction the task turns on: unpublishing is a moderation decision about what Carta shows in public, and deleting would destroy somebody's trip, which they still own and are entitled to keep and export. So the function changes one column on one row and has no delete in it. The migration's self-check refuses to pass if the word "delete" ever appears in the function body.

### What the RPC does

`admin_unpublish_guide(p_plan_id uuid, p_reason text)` is SECURITY DEFINER with an empty search_path, granted to authenticated and service_role and not to anon, and sits on `admin_guard('destructive')` (034) because its effect is live the moment it returns. Like the functions T065 moved, it has no aal2 check written in; whether live-effect actions need MFA is still the owner's call in T063-e.

It checks in this order. The guard first (`forbidden`, `slow_down`). Then the reason: trimmed of spaces, tabs and newlines, it must be non-empty and at most 2000 characters, or the answer is `bad_reason`. Then it reads the plan with `select ... for update`, so two moderators acting on the same guide at once queue behind each other; no row, or a null id, is `not_found`. If the plan is not public it returns `{"ok": true, "changed": false, "visibility": <current>, "reportsActioned": 0}` and writes nothing at all: no column, no report status, no audit row. That is the idempotent answer for a second call, for a plan its owner already made private, and for a friends or link plan, which keeps its value. Otherwise it sets `visibility = 'private'`, moves every report on that plan still marked `new` to `actioned`, writes the audit row, and returns `{"ok": true, "changed": true, "visibility": "private", "reportsActioned": n}`.

### Which value, and what happens to published_at

The takedown sets `'private'`, the default 011 gives every new plan and the value the app already shows as only me. Not the value the plan had before it was published, because that is not recorded anywhere, and `'private'` is the only value that cannot widen the audience. The owner's read path is the RLS on trip_plans (`auth.uid() = user_id`, widened for co-planners in 020 and 023), which never looks at visibility, so nothing about the owner's own views changes.

published_at is cleared, not kept. 019's trigger stamps it when a plan becomes public and clears it when it stops being public, and the gallery's partial index and its ordering rely on that. An owner who makes their own guide private goes through the same trigger, so a takedown leaves the row in the same state an owner's unpublish would. The old stamp is not lost: it is in the audit row under `previous.publishedAt`. No other column is written. updated_at is not touched (nothing on trip_plans sets it), and the label, owner, created_at, stops, day plan and share links are left alone.

### The trap: 020's co-planner trigger

The first thing I checked was whether a plain UPDATE from a definer function would even work, and it does not. 020's `guard_coplanner_write` pins visibility, published_at and user_id back to their old values whenever the writer, `auth.uid()`, is not the plan's owner. An admin is not the owner. So a takedown written as a plain UPDATE would be silently undone and the function would still answer ok while the guide stayed public. The test proves this before 038 is applied: an UPDATE run with an admin's claims reads back `public`.

038 therefore re-creates `guard_coplanner_write` with one exception. While the transaction-local setting `carta.takedown_plan` equals the row's id, visibility may move to `'private'` and only to `'private'`; user_id stays pinned always. The RPC sets that marker immediately before its UPDATE and clears it immediately after. PostgREST gives a client no way to set an arbitrary setting, and even a session that could would only be able to make a plan it already co-plans private. As a second line, the RPC reads back the visibility the UPDATE returned and raises if it is not `'private'`, which rolls the whole call back. The test runs a copy of the function with the marker line removed and confirms it fails loudly with nothing changed rather than answering ok.

Two consequences worth knowing. Postgres fires BEFORE triggers in name order, so the guard runs before 019's stamp trigger, not after it as 020's comment says (T069-g); that order is what makes the exception work, because the guard lets `'private'` through and the stamp then clears published_at. And if 020 is ever pasted after 038, its create or replace puts the old guard back and every takedown fails with "the plan is still public after the update"; paste 038 again after it (T069-b). If 020 is not applied on the live project at all (I could not tell from here), the re-created function has no trigger calling it and the takedown works the same; I checked that on a second database built without 020 and 023.

### The linked reports, and what is left to T070

The signature is `(plan_id, reason)` as the plan asks, so there is no report id argument. A takedown resolves every notice on that guide that is still `new`, whichever card the moderator started from, because the guide is down and each of those notices has been acted on. Reports on other guides are never touched. Their ids go into the audit row, which until T070 is the only record of who decided and when. A no-change call leaves reports as they are, because nothing was done in response to them.

That is the part of register row T068-e this task covers. T068-e stays open for the rest: the `dismissed` path (a report on a guide that is not public, or one that is not illegal, has no button yet and stays `new`), the decided-by and decided-at columns, the statement of reasons to the owner under Article 17, and the complaints route. T070 owns all of those (T069-e).

### The audit row

One `admin_audit_log` row per takedown, action `unpublish_guide`, actor the admin, `target_user` the plan's owner so it shows in that account's history on the Users tab, and detail in the 033 shape:

```
{"table": "trip_plans", "planId": ..., "label": ..., "reason": ...,
 "previous": {"visibility": "public", "publishedAt": ...},
 "new":      {"visibility": "private", "publishedAt": null},
 "reports":  [ids moved to actioned]}
```

A revert by hand is in the header of 038: set visibility back to public in the SQL editor, then put the original published_at back in a second update.

### The admin panel

Both tabs share one hook, `useUnpublishGuide.js`, called in the shell like every other hook since T062, and one view, `UnpublishGuide.jsx`. The hook keeps one form open on the page at a time, keyed by where it was opened (`guide:<id>` or `report:<id>`). The flow copies the account actions: the first click on the outlined danger button "Unpublish" opens a form that says what will happen (private, nothing deleted, new reports marked actioned), asks for the reason for the audit log with a label tied to the field, and moves focus into it; "Unpublish guide" stays disabled until the reason has text; "Keep it public" closes the form. Errors show inside the form as `role="alert"` and keep what was typed. `bad_reason` goes through `useErrText.js` like every other admin word; `not_found` is worded in the hook instead ("That trip no longer exists"), because `admin_get_user` answers `not_found` for a deleted account and a global mapping would say the wrong thing there. After a takedown a `role="status"` line at the top of the tab reports it with the number of reports actioned, the Guides list and the Reports queue reload if they were already loaded (a tab never opened stays unloaded, as T067 and T068 keep it), and the audit trail reloads.

On the Guides tab the button sits in a new Action column, and the open form takes a full-width row under the guide because a table cell is too narrow for a reason field. On the Reports tab it sits with Open guide and Open owner, only on cards whose guide is still public. Table cells do not wrap and on a phone the table scrolls inside its frame, so 11 lines of CSS let the form's prose wrap and hold it to the visible width while the columns scroll. The Reports hint and both views' header comments now describe the action rather than saying it does not exist yet.

The copy is English only, as all admin strings are; en.js got 12 keys and one changed. carta-design's closing questions, answered for this diff: no hex values, only existing tokens; no warm neutral, serif, gradient or shadow added (the admin page's existing palette is untouched, see the skill's superseded note); no flag colour; mono only on the field label, which uses the admin's existing field label class, the same one the delete confirmation uses; no filled button anywhere in the form, the send is the outlined danger style the suspend action uses; no em dashes and no banned words. The one thing I removed was a per-row notice, which vanished on reload because the guide leaves the list; the notice is at the top of the tab instead.

## Files touched

All paths from the repo root. App files are committed in both repos.

**Created:**
- `supabase/migrations/038_admin_unpublish_guide.sql`
- `continent-app/src/components/admin/UnpublishGuide.jsx`
- `continent-app/src/components/admin/useUnpublishGuide.js`
- `continent-app/scripts/admin/test_admin_unpublish_guide.mjs`
- `Execution/P4/T069-takedown-rpc.md`

**Modified:**
- `continent-app/src/components/admin/PublicGuides.jsx` (Action column, form row, notice, header comment)
- `continent-app/src/components/admin/ContentReports.jsx` (Unpublish on still-public report cards, notice, header comment)
- `continent-app/src/admin/AdminPage.jsx` (the shared hook, passed to both tabs, header comment)
- `continent-app/src/auth/admin.js` (adminUnpublishGuide)
- `continent-app/src/components/admin/useErrText.js` (bad_reason)
- `continent-app/src/i18n/en.js` (12 admin keys added, the Reports hint changed)
- `continent-app/src/styles.css` (11 lines, the form inside a table)
- `Execution/_OPEN.md` (rows T069-a to T069-g)

`verify_admin_panel.mjs` is not modified; see What is still open.

## Commands run

```
git checkout -b p4-takedown-rpc
git -C continent-app checkout -b p4-takedown-rpc

# throwaway cluster (Git Bash); $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg69" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg69" -o "-p 55434" -l "$S/pg69.log" -w start
PGPORT=55434 node continent-app/scripts/admin/test_admin_unpublish_guide.mjs
PGPORT=55434 node continent-app/scripts/admin/test_content_reports.mjs      # 037 still green
# a second database without 020 and 023: chain to 038, one takedown by psql
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg69" -w stop
rm -rf "$S/pg69" "$S/pg69.log"
PGPORT=55434 node continent-app/scripts/admin/test_admin_unpublish_guide.mjs   # skip path, exits 0 with SKIPPED

# from continent-app/
npx eslint src/admin/AdminPage.jsx src/components/admin/ src/auth/admin.js
VITE_E2E_SEAMS=1 npm run build
node scripts/verify_admin_panel.mjs
node scripts/verify_guides.mjs
```

The SQL harness was not retyped: its imports, psql helpers, Supabase stubs, 018 patch and skip block were sliced from `test_content_reports.mjs` (T068) by line range with only the database name and messages changed; the header, seed and assertions are new. It applies 002, 004, 006, 007, 009, 010, 011, 014 to 017, 018 (from a `{5,255}` patched copy, T031-d; 018 is not edited), 019, 020, 023, 032 to 037 and then 038. 020 and 023 are in the chain on purpose, since the co-planner trigger is the thing most likely to make a takedown do nothing. It has 86 assertions: the naive UPDATE pinned before 038; anon, plain user, reason and id refusals with nothing changed; the takedown itself with a fingerprint of every other column, the stops and the day plan; row count and audit count; the audit row's shape and original published_at; the owner reading the plan, both stops and the day plan and editing it through RLS as role authenticated; another user not reading it; the gallery, get_public_guide and report_guide no longer reaching it; the reports actioned with their ids in the audit row and the other guide's report untouched; three idempotent calls writing nothing; the co-planner guard still refusing to publish, unpublish or take over a plan; the no-marker copy failing loudly; and a second paste.

To apply live: paste 038 into the Supabase SQL editor for ntssxktaduxzpsmejwyv after 037 and look for "admin unpublish guide self-check passed". Never `db push`. The self-check requires 015, 019 and 037; confirms the function is definer with an empty search_path, passes `admin_guard('destructive')`, contains no delete, records previous and new, is not executable by anon, that the co-planner guard has the takedown exception, and that calling it with no signed-in caller returns `forbidden`.

## Config and secrets set

None.

## Before/after measurements

Measured in the throwaway database. The live project was not touched.

| Metric | Before | After | Delta |
|---|---|---|---|
| Ways for an admin to take a guide off the gallery | 0 (no RPC; a plain UPDATE under an admin session is pinned back to public by 020) | 1 | new |
| Rows in trip_plans across one takedown (test DB) | 4 | 4 | 0 |
| Rows in admin_audit_log across one takedown | 0 | 1 | +1 |
| Columns of the plan changed by a takedown | | 2 (visibility, published_at by 019's trigger) | |
| Owner reads of the plan, its 2 stops and its day plan after the takedown | | 3 of 3 | |
| Audit rows written by a repeat or no-op call | | 0 of 3 calls | |
| test_admin_unpublish_guide.mjs | | 86 of 86 passing | |
| test_content_reports.mjs | 106 of 106 | 106 of 106 | 0 |
| verify_admin_panel.mjs checks passing | 29 of 30 (T068) | 29 of 30 | 0 |
| verify_guides.mjs checks passing | 17 of 17 | 17 of 17 | 0 |

The one admin harness failure is step 11, "the non-admin hub changed shape", the same pre-existing failure registered as T042-d.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A reason of spaces and a newline was accepted and took the guide down | `trim()` in Postgres strips spaces only, so a newline survived and the reason counted as non-empty | Strip all whitespace with `regexp_replace(..., '^[[:space:]]+\|[[:space:]]+$', '')`; the test has a blank-with-newline case |
| A plain UPDATE from the admin session left the guide public | 020's co-planner guard pins visibility for any writer who is not the owner | The takedown marker and the read-back check described above |
| A Bash heredoc for the scratch admin harness failed with "unexpected EOF" | The same wrapper problem T068 hit with long heredocs | Wrote the patch script with the Write tool |
| The scratch harness would not load: `cards` declared twice | The copied harness already has a `cards` in the analytics step | Renamed the new one |
| At 380px the open form's text ran off to the right inside the table | Admin table cells are `white-space: nowrap`, and the colspan cell is as wide as the scrolled table | The 11 lines of CSS: normal wrapping, sticky left, held to the visible width |

## What is still open

The owner has to paste 038 into the live SQL editor after 037 (T069-a, after T068-a). Until then the Unpublish button answers with the database's "could not find the function" message inside the form, and nothing changes. If 020 is ever pasted again after 038, 038 has to be pasted again after it (T069-b).

The owner of a taken-down guide can publish it again immediately: their own update policy allows it and the test shows it. A takedown is therefore a removal, not a lock. Whether a takedown should block republishing until a decision or an appeal, and how, is an owner decision best built together with T070's decision record (T069-c).

Share links keep working. 009's `get_shared_trip` does not look at visibility, so anyone holding an old share link to a taken-down guide still reads the itinerary. That may be right (a share link is the owner's private sharing, not publication) or wrong (the content was judged illegal); it is the owner's call (T069-d).

The owner is not told. There is no statement of reasons, no notice to the owner and no dismiss path for reports on guides that are not public; those are T070 (T069-e, with T068-e still open for the decision columns).

`verify_admin_panel.mjs` does not know about the action. I checked it with a scratch copy that added stubs for the guides list, the reports list and the takedown, and a step that asserted: two Unpublish buttons with accessible names, focus in the reason field, the label tied to it, one form at a time, send disabled while the reason is empty or blank, no request before a reason, cancel closing the form, the reason sent trimmed with the right plan id, the status notice, one reload of the guides list and none of the unopened Reports tab, `not_found`, `slow_down` and `bad_reason` each shown as their own sentence with the reason kept, the button only on report cards whose guide is still public, a takedown from a report card reloading both lists and the report leaving the New filter, and at 380px no sideways page scroll with a 44px send button. All passed and I looked at the desktop and 380px screenshots. The copy was deleted, not committed, because the harness is outside this task's files. Folding it in is T069-f.

020's comment about trigger order is wrong (T069-g).

Not verified: anything against a real Supabase project, including whether 020 is applied there, and the migration on the live database. Both need 038 pasted first. The UI was checked against stubbed RPCs, not against the real function.

## Rollback procedure

Live, if 038 has been pasted: drop the function and put 020's guard back.

```
drop function if exists public.admin_unpublish_guide(uuid, text);
-- then re-run the "create or replace function public.guard_coplanner_write()"
-- block from 020_coplanners.sql
notify pgrst, 'reload schema';
```

Takedowns already made stay made: those plans stay private until their owners publish them again, the reports stay `actioned`, and the audit rows stay. Each one can be reversed by hand from its audit row as the 038 header shows. No row was ever deleted, so there is nothing to restore.

In git:

```
git -C continent-app revert 36e5cdf
git revert <the T069 report commit> c46bd6b4f
```

or drop the branch `p4-takedown-rpc` in both repos before merge. Reverting the app without the migration is safe: nothing else calls the function. Reverting the migration without the app leaves the Unpublish button answering with the missing-function message, the same state as before 038 is pasted.
