# T068: Electronic notice mechanism (content_reports and report_guide)

## Task ID

T068

## Date

2026-09-28

## What changed

Anyone reading a public guide can now report it as illegal, signed in or not, and the report lands in a private table that only an admin can read, in a new Reports tab. Before this task Carta hosted public guides with no way at all to report one: in the test database an anonymous visitor could file 0 reports before migration 037 and can file them after it. The intake is rate limited to 5 reports an hour per source. With the limit taken out of a copy of the function, one address filed 20 of 20; with it, the sixth call from one address is refused with `too_many`. Migration 037 is not applied to the live project.

This is the intake half of notice-and-action under Article 16 of the Digital Services Act, which applies to any hosting service offered in the EU whatever its size. Acting on a report (the takedown RPC, T069) and the statement of reasons and complaints route (T070) come next.

### The database side

Migration `supabase/migrations/037_content_reports.sql` adds two tables and two functions.

`content_reports` holds one row per accepted report: the plan id, the plan's owner and title as they were when reported, the reason, the contact email if one was typed, the reporter's account id if they had a session, a hash of their network source, the name of the header that source came from, and a status that is always `new` for now. There is no foreign key on the plan id, on purpose: a notice has to outlive the author deleting or retitling the guide. The reporter id is `on delete set null`, so deleting an account keeps the notices it filed. The table has RLS on, no policy, and every privilege revoked from anon and authenticated, including the identity sequence. Nothing reads it except the two definer functions.

`content_report_salt` holds one random salt, written once, so a second paste of 037 keeps the same salt and hashes stay comparable.

`report_guide(p_plan_id, p_reason, p_contact_email)` is SECURITY DEFINER with an empty search_path and is granted to anon, authenticated and service_role. It answers `{"ok": true}` or `{"error": word}`. The order of its checks matters. First it validates what was sent: a reason under 10 or over 4000 characters after trimming is `bad_reason`, and a contact email that is over 254 characters or not local@domain.tld is `bad_email`; a blank email counts as none. Then it works out the source and applies the rate limit, then it checks that the plan is public, and only then inserts. A refused call never inserts, so the rate limit can count accepted rows in content_reports itself; no separate rate table was needed. paywall_events was not used because its rows are funnel analytics with their own meaning.

"Public" means `trip_plans.visibility = 'public'`, the same predicate `list_public_guides` and `get_public_guide` use (there is no is_public column, see T067). A private plan, a link-shared plan, a missing id and a null id all get the same `not_public`, so the function cannot be used to probe which plan ids exist.

`admin_list_content_reports(p_status, p_limit, p_offset)` passes `admin_guard('read')`, is granted to authenticated and service_role only, and returns `{ total, new, rows }` newest first. Each row carries the reason, the contact email, the title as reported next to the current title, whether the plan still exists and is still public, the owner's handle and auth.users email, the reporter's handle, which header the source came from, and two counts: reports on this guide, and reports from this reporter's source. It never returns the hash. Like the other admin reads it writes no audit row.

### The rate limit, and which header is trusted

A report is refused with `too_many` when either the caller's network source or the caller's account already has 5 reports in the last hour. Counting both means signing in does not escape the address bucket and moving network does not escape the account bucket. An IPv6 address counts by its /64, because one household gets a whole /64 and can rotate inside it for free. A caller with no address header at all falls into one shared "unknown" bucket, which is the strict failure: they share 5 an hour instead of getting an unlimited path. A global ceiling of 500 an hour sits behind all of this for floods from many addresses. It is deliberately far above any real volume, because a ceiling low enough to bite would let one attacker silence every honest reporter for an hour.

Two parallel requests could both count 4 and both insert, so the function takes a transaction advisory lock on the source hash (and on the account) before counting. This is not theoretical: with the two lock lines commented out, ten parallel calls from one address stored 6 in two of three runs. With them, 5 of 10 every time.

The address comes from `current_setting('request.headers', true)`, which PostgREST fills with the request headers. The function trusts `cf-connecting-ip` first. Supabase's API sits behind Cloudflare, which sets that header itself to the connecting address and overwrites anything the client sent, so it is the one header a caller cannot choose. Only when it is absent does the function fall back to the first entry of `x-forwarded-for`. Proxies append to that list, so its first entry is whatever the client claimed and can be forged; it is a fallback so that a deployment without Cloudflare still gets per-address buckets, and the account bucket and global ceiling still hold if it is forged. A header that does not parse as an address is bucketed by its literal text rather than rejected. The test proves that a forged `x-forwarded-for` does not escape a `cf-connecting-ip` bucket. What it cannot prove is which header live Supabase traffic actually carries; every row records `source_header` so the owner can see that with one query after the first real report (T068-c).

The address itself is never stored. The row holds `sha256(salt | source)`, which lets a moderator see "5 from this source" without the table holding an IP. That is pseudonymous rather than anonymous: anyone who can read the salt can test guesses against it.

The distinct error word is `too_many`, the same word `submit_feedback` (017) already uses for its own limit and that AccountPanel already translates, and distinct from `slow_down`, which is the admin guard's word for admins.

### The report control on a public guide

`continent-app/src/community/ReportGuide.jsx` is rendered at the foot of every opened guide in `GuidesPanel.jsx`, under the privacy note. Closed, it is one outlined button, "Report this guide", in the same quiet style as Copy link, so it is always there and never louder than the guide. Opening it moves focus into the reason field. The form asks for what is wrong and why, and an optional email "only used to tell you what we decided"; its labels are tied to the fields, the error line is `role="alert"`, the confirmation is `role="status"`, focus rings are visible, and the send button is 44px. The form checks the reason length and email shape itself before any request, and maps the RPC's words to one sentence each: `too_many` says 5 reports in the last hour is the most accepted, `not_public` says the guide is no longer public, and anything else, including a project where 037 is not applied yet, says the report did not send and keeps what was typed.

The client call is `reportGuide()` in `src/community/guides.js`, next to the other public guide RPCs, not in `src/auth/admin.js`, which is admin only. It calls `supabase.rpc('report_guide', ...)` like every other anon-callable RPC in the app; with no session the Supabase client sends the anon key as the bearer, so PostgREST runs it as role anon. The scratch harness checked exactly that on the wire. The `?guidesmock` seam answers the first five mock reports with ok and the sixth with `too_many`.

The copy is in all six languages, like every other guides string. carta-design's closing questions, answered for this diff: no hex values, only existing tokens in 45 lines of new CSS; no warm neutral, serif, gradient or shadow added beyond what the app's palette already is (see the skill's superseded note); no flag colour; mono is used on email addresses, counts and dates in the admin view and nowhere on prose; one filled button in the open form and none while it is closed; the headings carry a verb ("Report illegal content"); no em dashes and no banned words. The one thing removed in review was mono on the admin card's prose lines, which the feedback inbox's context class would have set; those lines are sans now with only the addresses and counts in mono.

### The Reports tab, and the decision on T062-d

The admin page has an eighth tab, Reports, between Guides and Feedback. It follows the T062 split: `ContentReports.jsx` is the view, `useContentReports.js` the hook, the shell calls the hook and routes the section, and `adminListContentReports` sits in `src/auth/admin.js`. Like the Guides tab it loads the first time the tab is shown, not at unlock, so the unlock request sequence T062 kept identical is still identical. It shows each report as a card (the reason is prose somebody wrote, as in the feedback inbox), a New and All filter with the new count, the three states the Guides tab distinguishes (rows, a real empty queue, a failure with the database's message and a retry), an Open guide link while the guide is still public, a Reply to reporter mailto when an email was given, and Open owner, which hands off to the Users tab. There is no action button: unpublishing is T069 and the decision with its statement of reasons is T070, so every row stays `new` until then, and the tab says so.

T062-d asked whether content reports join the feedback inbox or get their own view. They get their own view, and the inbox is renamed to what it is: `ModerationQueue.jsx` is now `FeedbackInbox.jsx` and `useModerationQueue.js` is now `useFeedbackInbox.js`, with no other change to them. The reason is that a notice and a piece of feedback differ in everything a queue is built around. A notice is filed by anyone about one hosted guide, is a legal record that has to be kept, and ends in a decision with a statement of reasons. Feedback is a note to the team about the product, ends in "done", and points at nothing. Mixing them would have a moderator triaging legal notices between bug reports, and T070's decision fields would have to be optional on feedback rows. T062-d is closed by this task. Note that register row T065-d still names `useModerationQueue.js`; the same file is now `useFeedbackInbox.js`.

## Files touched

All paths from the repo root. App files are committed in both repos.

**Created:**
- `supabase/migrations/037_content_reports.sql`
- `continent-app/src/community/ReportGuide.jsx`
- `continent-app/src/components/admin/ContentReports.jsx`
- `continent-app/src/components/admin/useContentReports.js`
- `continent-app/scripts/admin/test_content_reports.mjs`
- `Execution/P4/T068-dsa-notice-and-action.md`

**Renamed:**
- `continent-app/src/components/admin/ModerationQueue.jsx` to `FeedbackInbox.jsx` (component name and header comment)
- `continent-app/src/components/admin/useModerationQueue.js` to `useFeedbackInbox.js` (hook name)

**Modified:**
- `continent-app/src/community/guides.js` (reportGuide, mock seam)
- `continent-app/src/community/GuidesPanel.jsx` (renders ReportGuide at the foot of a guide)
- `continent-app/src/admin/AdminPage.jsx` (Reports section, hook, route, renamed imports, header comment)
- `continent-app/src/auth/admin.js` (adminListContentReports)
- `continent-app/src/styles.css` (45 lines, the .gld-report block)
- `continent-app/src/i18n/en.js` (15 guides keys, 22 admin keys), `nl.js`, `de.js`, `fr.js`, `es.js`, `it.js` (15 guides keys each)
- `Execution/_OPEN.md` (T062-d closed, rows T068-a to T068-h)

`verify_admin_panel.mjs`, `verify_guides.mjs` and `useErrText.js` are not modified. useErrText.js maps admin RPC words; the only new admin-facing words are the existing `forbidden` and `slow_down`, and the new public word `too_many` is translated in ReportGuide.jsx, where the visitor reads it.

## Commands run

```
git checkout -b p4-dsa-notice-and-action
git -C continent-app checkout -b p4-dsa-notice-and-action

# throwaway cluster (Git Bash); $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg68" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg68" -o "-p 55434" -l "$S/pg68.log" -w start
PGPORT=55434 node continent-app/scripts/admin/test_content_reports.mjs     # 4 clean runs
# lock check: the two pg_advisory_xact_lock lines commented out in a working copy, 3 runs, file restored
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg68" -w stop
rm -rf "$S/pg68" "$S/pg68.log"
PGPORT=55434 node continent-app/scripts/admin/test_content_reports.mjs     # skip path, exits 0 with SKIPPED

# from continent-app/
npx eslint src/admin/AdminPage.jsx src/components/admin/ src/auth/admin.js src/community/
VITE_E2E_SEAMS=1 npm run build
node scripts/verify_guides.mjs
node scripts/verify_admin_panel.mjs
```

The SQL test harness was not retyped: its imports, psql helpers, Supabase stubs, the migration chain and the skip block were sliced from `test_admin_public_guides.mjs` (T067) by line range, with only the database and temp directory names changed; the header, the seed and the assertions are new. It applies 002, 004, 006, 007, 009, 010, 011, 014 to 017, 018 (from a `{5,255}` patched copy, T031-d; 018 is not edited), 019, 032 to 036 and then 037. It has 106 assertions covering the anon grant, validation, not-public refusals, the per-source, per-account, IPv6, no-header, sliding-window, global and parallel limits, table and salt privacy for anon, a plain user and an admin, the admin list's content and guard, account deletion keeping notices, a copy of report_guide with the limit removed (to prove the test would notice), and a second paste.

To apply live: paste 037 into the Supabase SQL editor for ntssxktaduxzpsmejwyv after 036 and look for "content reports self-check passed". Never `db push`. The self-check requires 015, 010, 011 and 019; confirms both functions are definer with an empty search_path, that anon can execute report_guide and not the admin list, that the table has RLS on, no policy and no client privilege, that the salt is private and single; calls report_guide with a random id, a short reason and a bad email and expects `not_public` (or `too_many`), `bad_reason` and `bad_email` with nothing stored; and expects `forbidden` from the admin list with no signed-in caller.

## Config and secrets set

None. The salt is generated inside the database by the migration.

## Before/after measurements

Measured in the throwaway database. The live project was not touched.

| Metric | Before | After | Delta |
|---|---|---|---|
| Reports an anonymous visitor can file on a public guide | 0 (no mechanism) | accepted, row stored | new |
| Reports accepted from one address in one hour | 20 of 20 (037 with the per-source check removed, the unthrottled case) | 5 of 6, sixth answered `too_many` | unlimited to 5 |
| Reports accepted from one account across 6 addresses | | 5 of 6 | |
| Ten parallel calls from one address | 6 stored in 2 of 3 runs (advisory lock removed) | 5 stored in every run | |
| Client reads of content_reports or the salt (anon, user, admin) | | 0 of 9 attempts, all permission denied | |
| test_content_reports.mjs | | 106 of 106 passing | |
| verify_guides.mjs checks passing | | 17 of 17 | |
| verify_admin_panel.mjs checks passing | 29 of 30 (T067) | 29 of 30 | 0 |
| Admin page tabs | 7 | 8 | +1 |

The one admin harness failure is step 11, "the non-admin hub changed shape", the same pre-existing failure registered as T042-d.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Two Bash heredocs failed with "unexpected EOF while looking for matching quote" | The tool's shell wrapper choked on long heredocs with many apostrophes | Wrote the migration and the i18n scripts with the Write tool instead |
| The first app commit stored en.js as a whole-file rewrite (9,317 lines) | A `sed -i` on en.js in Git Bash turned its CRLF endings into LF, the same trap T067 hit; and with autocrlf the re-add then normalised to LF while the stored blob is CRLF | Restored CRLF, staged the exact bytes with `git hash-object -w --no-filters` and `git update-index --cacheinfo`, and amended the unpushed commit; en.js is now 37 added lines |
| The admin cards set "Guide by" and "Reported by" in mono | They reused `.adminpage-fbctx`, the feedback inbox's mono context line | Switched those lines to `.adminpage-muted` (sans) with only the addresses and counts in mono |
| The scratch admin step's owner hand-off could not target Zoe | The harness deletes her account in step 8 (as T067 found) | Seeded the report rows with Marco as owner |

## What is still open

The owner has to paste 037 into the live SQL editor after 036 (T068-a, after T067-c). Until then the report form on a live guide answers "The report did not send" and keeps the text, and the Reports tab shows the "could not find the function" message with a retry. Everything else works as before.

Nobody is told when a report arrives. The queue is only seen by an admin who opens the Reports tab, and the tab does not load at unlock, so there is not even a count on the overview. The DSA expects notices to be handled in a timely manner, so a notification is needed: a new-reports tile on the overview, a count on the nav button, or an email to the owner from the existing Edge Function route (never the Claude API). That is T068-b.

Which header live traffic carries is not observed (T068-c). After the first real report, run `select source_header, count(*) from public.content_reports group by 1`. If every row says `cf-connecting-ip`, the address bucket is sound. If rows say `x-forwarded-for`, the first entry is client-chosen and the address bucket can be forged; the account bucket and the 500 an hour ceiling still hold, and the fix is to take the last trusted entry instead.

Article 16(2) lists what a notice should contain: a substantiated explanation, the exact location, the notifier's name and email, and a statement of good faith. The form collects the explanation, the location (the plan id) and an optional email. It does not ask for a name or a good-faith confirmation, because making anonymous reporting harder is a legal and product call, not a design one. Article 16(4) and 16(5) also expect a confirmation of receipt and a notice of the decision to a notifier who left contact details; today the confirmation is on screen only and nothing is sent. Both are the owner's to decide, probably together with T070 (T068-d).

Every row stays `new`. Moving a row to `actioned` or `dismissed` belongs to T069 and T070, and the check constraint already allows both values; the decision itself (who decided, when, the statement of reasons) needs columns T070 adds (T068-e).

Neither harness covers the new UI. I checked it with two scratch harnesses, deleted rather than committed because the harness files are outside this task. The guide one ran the built app signed out with stubbed RPCs (no mock seam): one report button, Enter opens the form with focus in the reason field, both labels tied to fields, short reason and bad email caught with no request, `too_many`, `not_public` and a missing function each shown as their own sentence with the text kept, the confirmation as `role=status`, the request body carrying the plan id, reason and trimmed email, the call made with the anon key as bearer, and no sideways scroll at 380px with a 44px send button. The admin one was a copy of verify_admin_panel.mjs with one step added: no fetch before the tab opens, both cards with reason, owner, reporter, counts and retitle, the new count on the filter, no second fetch on a revisit, the All filter sending a null status, a failed refresh showing the message and no list, retry restoring it, and Open owner handing off. All passed and I looked at the desktop and 380px screenshots. Folding these in is T068-f.

content_reports keeps every row forever, including the reporter's email and the source hash. A notice and its outcome should be kept for a while as a record, but indefinitely is hard to justify under GDPR storage limitation. A retention period, and whether the email is cleared after the decision is sent, is the owner's call (T068-g).

Only guides can be reported. The gallery also shows the author's handle, display name and emoji as a byline, which is public content too; today a problem with those can only be reported through one of that author's guides. When photo uploads (spec 2.8) or other public surfaces arrive they need the same door (T068-h).

Not verified: anything against a real Supabase project, including the live header question above and the migration on the live database. Both need 037 pasted first.

## Rollback procedure

Live, if 037 has been pasted: this is one-way for the data. Dropping content_reports deletes every notice received, which is a record the service is expected to keep, so export it first if it has rows (`select * from public.content_reports`). Then run the down section from the header of 037:

```
drop function if exists public.admin_list_content_reports(text, int, int);
drop function if exists public.report_guide(uuid, text, text);
drop table if exists public.content_reports;
drop table if exists public.content_report_salt;
notify pgrst, 'reload schema';
```

In git:

```
git -C continent-app revert 3938a9b
git revert <the T068 report commit> 670b96749
```

or drop the branch `p4-dsa-notice-and-action` in both repos before merge. Reverting the app without the migration is safe: nothing else calls the two functions. Reverting the migration without the app leaves the form answering "did not send", which is the same state as before 037 is pasted.
