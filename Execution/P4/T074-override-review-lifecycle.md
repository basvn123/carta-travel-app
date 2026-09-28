# T074: Add a review lifecycle and expiry to content_overrides

## Task ID

T074

## Date

2026-09-28

## What changed

Every catalogue override now has to say why it exists, what kind of patch it is, and when somebody must look at it again. Migration 043 adds three NOT NULL columns to public.content_overrides: status (verified, temporary or stale), review_by (a timestamp) and author_note (the reason). The writer, admin_set_override, refuses a non-empty patch without a valid status, without a review date between now and 366 days out, or without a reason of at least ten characters. The admin Content tab shows those three fields in the editor, lists every override that is past its review date or marked stale above the grid (across all four layers and every country), counts the overdue ones in the content bar, and gives an overdue card a red border and an "overdue" flag in place of "edited". Before this task the table had no lifecycle at all, so zero of the overrides carried a review date or status and nothing on the page could say that a patch was old. After it, the table itself refuses a row without them, and the test database's two legacy rows were both backfilled.

How it works, for whoever maintains it. Overdue is never stored. It is derived from review_by against the clock, in SQL (admin_list_overrides returns overdue per row and an overdue count) and again in the browser (isOverdue in src/lib/overrides.js), so it cannot drift. Status is what the admin asserted: temporary means the patch hides a pipeline bug and should go once the pipeline is fixed; verified means a deliberate correction the pipeline cannot know about (a better photograph chosen by a person); stale means someone has decided it no longer holds and it is waiting to be reverted. Overdue wins over status in the UI, because a missed date is the more urgent fact. Neither status nor overdue changes what travellers see: a stale or overdue patch keeps applying until someone reverts it. That was deliberate. Silently dropping a correction on a date would bring back the bad photo or the wrong name with nobody watching, which is worse than a patch that outlives its welcome while a red row nags about it.

The 366-day cap means every patch, verified ones included, comes back at least once a year. The editor offers a review date from today to 365 days out and sends the end of the chosen local day, so picking today still lands after now() on the server. A new override defaults to temporary, due in 30 days. Reopening an existing override prefills its patch, status and reason, and offers the stored date unless it has passed, in which case it offers a fresh default and says when the old one was due. Saving without typing a new reason keeps the stored one, on the server as well as on the page, so confirming an overdue patch is "pick a new date, save".

Legacy rows are backfilled as temporary, due 14 days after the paste, with their old note as the reason. A row that had no note gets the sentence "Made before review dates existed; no reason was recorded. Write the real one." That sentence is refused as a reason on the next save (by the server and by the page, which does not prefill it), so the first person to touch a legacy row has to write a real one. Fourteen days rather than "already overdue" so the paste does not turn the whole list red on day one.

The old note column from 018 stays and is written with the same text as author_note. 024's export_user_data and the 033/034 audit detail read note, and rewriting those is not this task. The audit detail written by admin_set_override now also carries status, reviewBy and authorNote in both previous and new, so a future revert from the Audit tab can put the whole lifecycle back.

One privacy change came with the new column. 018 made the whole table world readable because every visitor needs the patches, which already exposed the free-text note to anyone holding the anon key, and would have exposed author_note too ("the image ranker picks car parks" is internal reasoning). 043 revokes the table-wide SELECT from anon and authenticated and grants SELECT on layer, item_id and patch only, which is exactly what overridesReady() in src/lib/overrides.js selects. The row policy is unchanged, and the admin page reads through the SECURITY DEFINER admin_list_overrides, so it still sees everything.

admin_set_override changed signature from four arguments to six (p_status and p_review_by added, both defaulting to null). The four-argument version is dropped first, because PostgREST resolves an RPC by argument names and two overloads that both accept the old four names make every such call ambiguous. adminSetOverride in src/auth/admin.js now always sends all six, even for a clear, so the page can never match a stray old overload.

## Files touched

**Created:**
- supabase/migrations/043_override_review_lifecycle.sql
- continent-app/scripts/admin/test_override_review.mjs

**Modified:**
- continent-app/src/admin/ContentSection.jsx (review list, overdue count, overdue cards, status, review date and reason in the editor, editor opens overrides from any layer)
- continent-app/src/lib/overrides.js (lifecycle helpers: statuses, date bounds and conversion, isOverdue, reviewState, rowsNeedingReview, reviewProblem, BACKFILL_REASON; the traveller-side merge is unchanged)
- continent-app/src/auth/admin.js (adminSetOverride sends status and review date)
- continent-app/src/i18n/en.js (the new admin strings; the reason label and placeholder reworded)
- continent-app/src/styles.css (review list, overdue states, the editor fieldset, and a fix for the editor's preview figures at 380px)
- continent-app/scripts/verify_admin_panel.mjs (step 8e and two 380px checks)

The prompt named ContentSection.jsx, overrides.js and the migrations folder. The writer lives in auth/admin.js and the strings and styles in en.js and styles.css, so a status field and a highlighted card could not be built without those four lines of admin.js, the en.js keys and the CSS block. Each change there is confined to this feature. The same goes for the two test scripts, which follow the pattern of every P4 admin task since T063. The i18n strings are English only, as all admin.* strings already are.

## Commands run

```
cd '/c/Users/Gebruiker/Documents/Portfolio/Travel App'
git checkout -b p4-override-review-lifecycle
git -C continent-app checkout -b p4-override-review-lifecycle

# throwaway cluster (Git Bash); $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg74" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg74" -o "-p 55434" -l "$S/pg74.log" -w start
cd continent-app
PGPORT=55434 node scripts/admin/test_override_review.mjs     # 71 assertions, 71 passing
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg74" -w stop

npx eslint src/admin/ContentSection.jsx src/lib/overrides.js src/auth/admin.js   # clean
npm test                                   # 92 pass, 0 fail
npm run build                              # clean
node scripts/verify_admin_panel.mjs        # 36 ok, 1 known failure (T042-d)

# baseline for the harness, with this task's app changes stashed:
git stash push -- src scripts/verify_admin_panel.mjs
npm run build && node scripts/verify_admin_panel.mjs   # 29 ok, same 1 failure
git stash pop

git -C continent-app add <the seven files by name>
git -C continent-app commit    # d8a0761
git add <the same seven under continent-app/ and the migration>
git commit                     # 62f020725
```

The migration was not applied to the live database. That is a paste step for the owner (T074-a).

## Config and secrets set

None. No environment variable, flag or secret changed.

## Before/after measurements

The table figures come from test_override_review.mjs against the throwaway cluster, which writes two overrides through 034's writer before applying 043, the way the live table would hold them. The live row count is unknown (nobody queried the live project).

| Metric | Before | After | Delta |
|---|---|---|---|
| Lifecycle columns on content_overrides | 0 | 3 (status, review_by, author_note, all NOT NULL) | +3 |
| Overrides carrying a review date and a status (test database, 2 legacy rows) | 0 of 2 | 2 of 2 | +2 |
| Rows the table accepts without a review date or status | any | none (NOT NULL and a status check) | closed |
| content_overrides columns readable with the anon key | 6 of 6 (note included) | 3 of 9 (layer, item_id, patch) | reasons no longer public |
| Overdue overrides visible on the admin page | 0 (no such concept) | every overdue or stale row, all layers and countries | new |
| test_override_review.mjs assertions | 0 | 71 passing | +71 |
| verify_admin_panel.mjs ok lines | 29 | 36 | +7 |
| npm test | 92 pass | 92 pass | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The baseline check "anon can read note" failed in the test cluster | A bare Postgres does not have Supabase's default grants on public, so anon had no table SELECT to begin with and the harness could not see the exposure 043 closes | The test's stub block now grants usage on public and sets Supabase's default table privileges for anon, authenticated and service_role before any migration runs |
| The override editor spilled past the screen at 380px | The two preview figures sat in a 1fr 1fr grid, whose minimum is the content's min-content width; the "no photo" text kept them wide. Found by the new 380px editor check, likely present before this task | grid-template-columns: minmax(0, 1fr) minmax(0, 1fr), centred and padded placeholder text, min-width: 0 on the new fieldset |
| The first continent-app commit rewrote three whole files | The edits were written with LF line endings into files the nested repo stores with CRLF | Restored CRLF on those files and amended that commit before anything else was built on it; the final diff carries only the real changes |
| A legacy row could be re-saved on the backfill sentence alone | "Keep the stored reason when none is given" also kept the placeholder | Both ends treat the backfill sentence as no reason; the harness asserts note_required for it |

Step 11 of verify_admin_panel.mjs ("the non-admin hub changed shape") fails before and after this task, on the stashed baseline too. It is register row T042-d, in the account hub, and was left alone.

## What is still open

Migration 043 is not applied (T074-a). Paste it into the Supabase SQL editor for ntssxktaduxzpsmejwyv after 034, then look for "override review lifecycle self-check passed". It depends on 018, 033 and 034 being live, and 018 cannot apply as committed until T031-d is fixed. The app and the migration have to land together. Before the paste, the new admin page's saves fail with "could not find the function" (travellers are unaffected, since overridesReady() selects only columns that exist either way). After the paste, an admin page older than this task gets bad_status on every save until the new build is live. Re-pasting 018, 033 or 034 after 043 re-creates the four-argument writer next to the new one; pasting 043 again removes it, and the harness proves both halves of that.

Nobody is told when an override goes overdue unless they open the Content tab (T074-b). An overdue count on the Overview tiles or in admin_health would make it visible without opening the tab, which fits whichever task next edits those.

Overrides do not expire (T074-c). A temporary patch past its date keeps applying to travellers. That is the conservative choice explained above, but whether an overdue temporary patch should stop applying after some grace period is a product decision for the owner, not something to decide in code.

The old note column now duplicates author_note (T074-d). Once 024's export_user_data and anything reading the 033/034 audit detail move to author_note, a later migration can drop note and the mirroring in admin_set_override. The export should also include status and review_by at that point, since they are the admin's own data.

An override opened from the review list has no pipeline photograph beside it in the editor, because the override row does not record which country file the item lives in and the review list spans every country (T074-e). The editor shows "no photo" for the original in that case. Storing a country code on the row, or looking the id up in the layer's index, would fix it.

eslint on src/i18n/en.js fails on a duplicate key admin.colAction (line 2536 before this task) that predates T074 (T074-f). This task added keys to en.js but did not touch that one.

The row claiming T062-e (move ContentSection.jsx into src/components/admin/) is still open; it is out of this task's file scope. T064-b (the Audit tab has no revert) will now find status, reviewBy and authorNote in the override detail, which a revert should restore along with the patch.

## Rollback procedure

If 043 has been pasted and must come back out, paste this in the Supabase SQL editor:

```
drop function if exists public.admin_set_override(text, text, jsonb, text, text, timestamptz);
-- paste the admin_set_override block and its two grant lines from 034
-- paste the admin_list_overrides block from 018
grant select on public.content_overrides to anon, authenticated;
alter table public.content_overrides
  drop column if exists status,
  drop column if exists review_by,
  drop column if exists author_note;
notify pgrst, 'reload schema';
```

Dropping the columns loses the reasons, statuses and dates written since the paste. The patches and the old note column are untouched, and so is everything travellers see.

In git, nothing is merged. To drop the work, delete both branches, or revert the two commits:

```
git -C continent-app revert d8a0761
git revert 62f020725
```

Reverting the app without the migration leaves the old page calling admin_set_override with four arguments, which a pasted 043 answers with bad_status, so revert the database first or paste the down block above.
