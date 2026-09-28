# T070: Statement of reasons and an internal complaints route

## Task ID

T070

## Date

2026-09-28

## What changed

When a moderator takes a guide down, the owner is now told why, in the app, and can contest the decision from the same place. In the test database a takedown under 038 produced 0 statements and there was no way for the owner to complain; under 039 every takedown produces exactly 1 statement, and the owner files a complaint with one call as an ordinary signed-in user. A moderator answers the complaint from the Reports tab by upholding or reversing it with a written answer the owner reads. A report the moderator decides not to act on can now be dismissed, and every closed report records who decided, when and why. The work is migration `supabase/migrations/039_statement_of_reasons.sql`, which is not applied to the live project, plus the owner view in My trips and the admin actions.

Notice-and-action has two halves. T068 and T069 built the half that feels like the whole job: a way to report and a way to take down. Article 17 of the DSA adds that the person whose content was restricted gets a statement of reasons, and Article 20 that they can contest it internally, free of charge. Those are what this task adds.

### The statement

A statement is a row in the new table `moderation_statements`, written by `admin_unpublish_guide` inside the same transaction as the takedown, so there is no takedown without one. It is stored as fields rather than as a paragraph, so the app can show it in the owner's language; the only free text is the moderator's own. Against Article 17(3) it holds: which content (plan id, the title as it was, the owner); the restriction (`removed_from_gallery`, which the app words as removed from the public guides everywhere with no end date, the trip kept and nothing deleted); the facts relied on (the moderator's reason, the same text that goes into the audit log, so the takedown form now says the reason is shown to the owner); whether it came from notices (`source` is `notice` when the takedown closed at least one open report, with the count, and `own_initiative` otherwise); that no automated means were used (`automated` is always false); the date; and the redress, which the app renders from `contest_until`, six months after the decision, plus out-of-court dispute settlement and the courts. The notifier is never named: nothing about a reporter is copied onto the statement.

One Article 17 item is not covered. The article wants the legal ground (which law) kept apart from the contractual ground (which clause of the terms). The takedown form asks for one reason, and nothing in the data says which kind it is, so the statement shows the reason as the ground. Splitting it needs a decision about the terms and a change to the form (T070-c).

The table also keeps, out of the owner's sight, who took the decision, the guide's original `published_at`, and a fingerprint of what the public could read at the moment it came down. The fingerprint is `moderation_guide_fingerprint(plan)`: an md5 over the title, 019's public stop projection and 019's public day plan projection, which is exactly what `get_public_guide` hands a reader minus the author's profile. It has no client grant.

### How the owner sees it

The owner reads their statements straight from the table. RLS has one policy, select for authenticated where `owner_id = auth.uid()`, and a column grant leaves out `decided_by`, `content_hash`, `previous_published_at` and `complaint_decided_by`. Because of the column grant a client must name its columns; `select *` is refused. `src/auth/moderation.js` does that. The test proves the owner reads their own four statements, another owner reads only their one, a stranger reads none (also when asking by plan id), anon has no privilege at all, the hidden columns are refused, and no client can insert or update a row.

There is no route in the project that sends transactional email to a user. The Edge Functions are checkout, stripe-webhook, plan-day, parse-booking and suggest-city, and Supabase Auth mail is for sign-in only. So the in-app statement is the delivery. `SavedTripsPanel.jsx` loads the statements once with the trips and renders `ModerationNotice.jsx` under the card of the affected plan, attached the way the share panel is, because My trips is where the owner manages who can see a trip and the one place in the app they will certainly look. Closed, the notice is a heading ("We took this guide off the public guides"), the date in mono, one line on where things stand, and a secondary button to read the statement. Open, the statement is a run of labelled facts divided by hairlines, and below it "Contest this decision" opens a form with one labelled field, focus moved into it, and the view's only filled button. The line changes with the complaint: contested, upheld, reversed and back in the gallery, or reversed but left as the owner has it. A failure to load statements is logged and hides the notices only; the trips still show. The owner copy is in all six languages (34 keys each). An owner is never pushed a notification, which is what an email would have done (T070-d).

### The complaint

`contest_moderation_decision(statement, text)` is SECURITY DEFINER with an empty search_path, granted to authenticated and not to anon. It costs nothing and needs no pass. With no signed-in caller it answers `forbidden`; a text under 10 or over 4000 characters after trimming spaces, tabs and newlines is `bad_reason`; a statement that does not exist and one that belongs to somebody else both answer `not_found`, so the RPC cannot be used to find out whose statements exist; a second complaint is `already_contested`; after `contest_until` it is `too_late`. One complaint per statement, and the complaint lives on the statement row itself (text, time, status `open`). One row per case keeps the owner's read path to one select and one policy, and a decision on a complaint is the end of the internal route; after it the owner has the out-of-court body and the courts, which the statement names.

### The decision on a complaint, and the reinstate rule

Complaints are listed at the top of the Reports tab by `admin_list_moderation_complaints` (read tier), above the notices, not in a tab of their own. A complaint is the last step of the same case a report starts, the moderator deciding it wants the notices beside it, and an owner who contested is waiting on an answer about their own trip, so it goes first. Each card shows the guide, the owner, who took it down and why, the owner's complaint, and whether reversing would put the guide back.

`admin_decide_complaint(statement, outcome, reason)` sits on `admin_guard('destructive')`, takes `upheld` or `reversed` and a required reason, which is the answer the owner reads, and writes one `decide_complaint` audit row with the owner as target and the previous and new state. Upholding changes nothing on the plan. Reversing republishes only if three things hold: the plan still exists, it is still `private` (the value the takedown left), and its fingerprint still equals the one taken at the takedown. In words: only if the owner has changed neither who can see it nor anything a public reader would see. The moderator reviewed the guide that came down, not whatever the plan holds today, and republishing edited content as the result of a moderation decision would publish something nobody reviewed; it would also override an owner who has since chosen friends or deleted the trip. When the rule does not hold the decision is still reversed, the statement says so and why, and the plan is left exactly as the owner has it; they can publish it themselves, which their own update policy already allows (T069-c). Edits the public never sees, such as transport notes, dates inside the same month or spend, do not count, and the test proves an owner's transport note does not block reinstatement. On reinstatement `published_at` goes back to the original stamp so the guide returns to its old place in the gallery. Reports on the guide stay `actioned`: they record that a notice led to a takedown, which is still true.

Reinstating is an update by an admin, and 020's co-planner guard pins visibility for anyone who is not the owner, the trap T069 found. 039 therefore re-creates the guard from 038's body with a second marker, `carta.reinstate_plan`, which lets visibility move to `public` and lets `published_at` through for that one row. The function makes two updates under the marker (the first goes public and 019's trigger stamps now, the second puts the original date back, which 019 leaves alone on a public to public update), then reads back and raises "the plan did not come back after the update" if it is not public, which rolls everything back. The same safety argument as 038 holds: PostgREST gives a client no way to set the marker.

### The dismissed path

`admin_dismiss_content_report(report, reason)` moves one report from `new` to `dismissed`, fills the new columns `decided_by`, `decided_at` and `decision_note`, and writes a `dismiss_report` audit row with the plan owner as target and previous and new status. It touches no plan and writes no statement: nothing was restricted, so there is nothing for the owner to be told. A report that is not `new` answers changed false and writes nothing, so an actioned report cannot be dismissed over. The takedown now fills the same three columns on the reports it actions. It is on the destructive tier, like the feedback status change 034 moved there. On the Reports tab every new report has Dismiss, including a report on a guide that is no longer public, which until now had no way out of the New filter, and every decided card says who decided, when and why.

### The takedown itself

`admin_unpublish_guide` in 039 is 038's body with four additions: the fingerprint is taken before the update, the actioned reports get their decision columns, the statement is inserted, and the statement id goes into the audit row and the answer. Its signature is unchanged, so the app's call is unchanged. The never-delete promise is kept and widened: the self-check refuses to pass if the word "delete" appears in the takedown, dismiss, complaint or decision function bodies.

### The admin panel

Dismiss, Uphold and Reverse share one hook, `useModerationDecision.js`, and one view, `DecisionForm.jsx`, built the way T069's Unpublish is: an outlined button opens a form that says what will happen, asks for the reason with a tied label, moves focus into it, keeps the send disabled until there is text, and shows an error in place with the text kept. `useModerationComplaints.js` loads the queue the first time the Reports tab is shown, like the reports list. The shell wraps the two arm functions so that arming an Unpublish form closes a decision form and the other way round, keeping one moderation form open on the page. Admin copy is English only, as all admin strings are: 43 keys added and 4 changed in en.js.

carta-design's closing questions, answered for this diff: no hex values, only the app's existing tokens in 41 lines of CSS; no warm neutral, serif, gradient or shadow added beyond what the app's palette already is (the skill's superseded note); no flag colour; mono only on dates, emails and counts, the complaint field label reuses the app's existing field label class as the report form does; one filled button in the owner's open form and none in the admin forms; every heading carries a verb; no em dashes and no banned words in any language. The one thing removed was a card box around the complaints section, which put an h2's top margin inside a border; it is a plain section with a heading now, like the notices below it.

## Files touched

All paths from the repo root. App files are committed in both repos.

**Created:**
- `supabase/migrations/039_statement_of_reasons.sql`
- `continent-app/src/auth/moderation.js`
- `continent-app/src/auth/ModerationNotice.jsx`
- `continent-app/src/components/admin/DecisionForm.jsx`
- `continent-app/src/components/admin/ModerationComplaints.jsx`
- `continent-app/src/components/admin/useModerationComplaints.js`
- `continent-app/src/components/admin/useModerationDecision.js`
- `continent-app/scripts/admin/test_statement_of_reasons.mjs`
- `Execution/P4/T070-statement-of-reasons.md`

**Modified:**
- `continent-app/src/auth/SavedTripsPanel.jsx` (loads statements, renders the notice under both plan card lists, mock statement for the `?savedmock` seam)
- `continent-app/src/components/admin/ContentReports.jsx` (complaints section, Dismiss, decided line, header comment)
- `continent-app/src/admin/AdminPage.jsx` (two hooks, the one-form wrapper, header comment)
- `continent-app/src/auth/admin.js` (three RPC calls)
- `continent-app/src/i18n/en.js` (34 owner keys, 43 admin keys added, 4 admin keys changed), `nl.js`, `de.js`, `fr.js`, `es.js`, `it.js` (34 owner keys each)
- `continent-app/src/styles.css` (41 lines, the `.modnote` block)
- `Execution/_OPEN.md` (T068-e and T069-e closed, rows T070-a to T070-h)

Not modified: `useErrText.js` (the new words are worded in the hook, as T069 did with not_found), `verify_saved.mjs` and `verify_admin_panel.mjs` (see What is still open), and `useUnpublishGuide.js`, whose comment still says the statement does not exist yet (T070-h).

## Commands run

```
git checkout -b p4-statement-of-reasons
git -C continent-app checkout -b p4-statement-of-reasons

# throwaway cluster (Git Bash); $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg70" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg70" -o "-p 55434" -l "$S/pg70.log" -w start
PGPORT=55434 node continent-app/scripts/admin/test_statement_of_reasons.mjs     # 2 clean runs
# mutation checks, each on a working copy of 039, restored after:
#   the owner policy widened to using (true); the owner filter removed from
#   contest_moderation_decision; the fingerprint comparison removed
PGPORT=55434 node continent-app/scripts/admin/test_admin_unpublish_guide.mjs    # 038 still green
PGPORT=55434 node continent-app/scripts/admin/test_content_reports.mjs          # 037 still green
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg70" -w stop
rm -rf "$S/pg70" "$S/pg70.log"
PGPORT=55434 node continent-app/scripts/admin/test_statement_of_reasons.mjs     # skip path, exits 0 with SKIPPED

# from continent-app/
npx eslint src/admin/AdminPage.jsx src/components/admin/ src/auth/admin.js src/auth/moderation.js src/auth/ModerationNotice.jsx src/auth/SavedTripsPanel.jsx
VITE_E2E_SEAMS=1 npm run build
node scripts/verify_saved.mjs
node scripts/verify_admin_panel.mjs
```

The SQL harness was not retyped: its imports, psql helpers, Supabase stubs, the migration chain up to 037 and the skip block were sliced from `test_admin_unpublish_guide.mjs` (T069) by line range, with the database and temp names changed; the header, constants, seed and assertions are new. It applies 002, 004, 006, 007, 009, 010, 011, 014 to 017, 018 (from a `{5,255}` patched copy, T031-d; 018 is not edited), 019, 020, 023, 032 to 038, takes one guide down under 038 to measure the before state, and then applies 039. It has 133 assertions: before 039, a takedown returns no statement and the complaint RPC does not exist; anon and plain-user refusals on every new function; the statement's content, ground, source and count, automated flag, dates, original stamp and fingerprint, and that it copies nothing about reporters; the reports' decision columns; own initiative with no reports; no statement on a repeat call; the RLS cases above; every complaint refusal and the accepted complaint; the admin queue and its reinstate outlook; every decision refusal; reverse with an unseen edit reinstating with the original date and back in the gallery; reverse after a title edit and after a switch to friends not republishing; upheld; the dismissed path and its refusals; the co-planner guard with both markers; 038 pasted after 039 making a reversal fail loudly with nothing changed and a second paste of 039 fixing it; and nothing deleted anywhere. Each mutation above was caught: the widened policy is refused by the migration's own self-check, the other two fail 4 and 2 assertions.

The UI was checked with two scratch harnesses, deleted rather than committed because the harness files are outside this task. The owner one ran the built app on `?savedmock` at 1360px and 380px: one notice, in the same row as its plan card; the heading; the statement listing what, why, source, who, when and redress; the toggle's aria-expanded both ways; focus in the labelled complaint field; a short complaint refused with a sentence; a 44px send button; the confirmation as `role="status"` and no second contest button; no sideways scroll; no network calls from the seam. The admin one was a copy of `verify_admin_panel.mjs` with one step added before the audit step, stubbing the reports list, the complaints list, dismiss and decide: the complaint card's content and reinstate outlook, a decided report showing who and why, Dismiss arming with focus, send disabled on empty and blank, one form at a time across Dismiss and Reverse, no request before send, the trimmed reason and report id in the body, the status notice, a `slow_down` shown in the form with the answer kept, the statement id and outcome in the body, and the decided complaint showing who decided. All passed and I looked at the desktop and 380px screenshots.

To apply live: paste 039 into the Supabase SQL editor for ntssxktaduxzpsmejwyv after 038 and look for "statement of reasons self-check passed". Never `db push`. The self-check requires 015, 019, 034 and 037; confirms every definer function has an empty search_path, is not executable by anon and is executable by authenticated; the guard tiers; no "delete" in the four writing functions; that the takedown writes a statement; that the guard has both markers; that the fingerprint has no client grant; that the statements table has RLS on, exactly one owner read policy, no client write, and the hidden columns hidden; and that every function refuses a caller with no session.

## Config and secrets set

None.

## Before/after measurements

Measured in the throwaway database. The live project was not touched.

| Metric | Before | After | Delta |
|---|---|---|---|
| Statements of reasons written per takedown | 0 (038, no table) | 1 | +1 |
| Owner can file a complaint | no (no RPC) | yes, as a plain signed-in user | new |
| Complaints from a stranger, another owner, anon accepted | | 0 of 3 | |
| Statements a stranger can read | | 0 of 5 | |
| Ways to close a report without acting | 0 | 1 (dismiss) | +1 |
| Closed reports carrying who and when | 0 (audit row only) | all | |
| Reversals republishing an edited or re-scoped guide | | 0 of 2 | |
| test_statement_of_reasons.mjs | | 133 of 133 | |
| test_admin_unpublish_guide.mjs | 86 of 86 | 86 of 86 | 0 |
| test_content_reports.mjs | 106 of 106 | 106 of 106 | 0 |
| verify_saved.mjs | all checks | all checks | 0 |
| verify_admin_panel.mjs failing checks | 1 (T042-d) | 1 (T042-d) | 0 |

The one admin harness failure is step 11, "the non-admin hub changed shape", the pre-existing failure registered as T042-d.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A Bash heredoc holding the translation script failed with "unexpected EOF" | The same wrapper problem T068 and T069 hit with long heredocs full of apostrophes | Wrote the scripts with the Write tool |
| The scratch owner harness would not parse | The line range sliced from verify_saved.mjs stopped one line short of a closing brace | Added the brace in the scratch copy |
| The scratch admin step reported the decided cards missing | The step read the New and Open filters, which rightly hide decided rows, and matched a phrase that is also in the section hint | Switched both lists to All before checking, as a moderator would |
| "Taken down by @owner ..., reports 2" read as a broken sentence | Too short a key for the count | Reworded to "after reports: 2" |
| One scratch admin run failed step 8, "the deleted account still matches its own search" | Not reproduced in the second scratch run or in the run of the committed harness; the step is untouched by this task | Noted as a flake, nothing changed |

## What is still open

The owner has to paste 039 into the live SQL editor after 038 (T070-a, after T069-a). It is best pasted straight after 038, before any real takedown: a takedown made under 038 alone gets no statement, and 039 does not backfill, so such a statement would have to be written by hand from its `unpublish_guide` audit row. Until 039 is pasted, the notice never shows (the statement query fails and is logged), and the complaints section, Dismiss and the decision forms show the "could not find the function" message.

039 re-creates three things other migrations also define. Pasting 038 after it puts back the takedown without a statement and the guard without the reinstate exception (a reversal then fails loudly); pasting 037 after it drops the decision fields from the report list; pasting 020 after it breaks takedown and reinstatement. In each case paste 039 again (T070-b).

The statement does not separate the legal ground from the contractual ground (Article 17(3)(d) and (e)), because the takedown form asks for one reason. Deciding whether Carta's terms carry a content rule that moderators can cite, and then asking the moderator which ground applies, is the owner's call and then a small migration and form change (T070-c).

There is no email route, so the owner is not told until they open My trips. Article 17 expects the statement to be provided, and the in-app notice does provide it, but an owner who never comes back will not see it. An email through an Edge Function and a non-Anthropic mail provider, or Supabase Auth's SMTP, is the owner's decision; never the Claude API (T070-d). The same route would serve the notifier's decision notice T068-d asks about, which this task does not send.

Article 20 (the internal complaint system) and Article 24(5) (submitting statements to the Commission's transparency database) sit in the section of the DSA for online platforms, from which micro and small enterprises are exempt. The complaint route is built anyway because it is cheap and fair. Whether Carta must also submit statements to the transparency database depends on its size and is the owner's to confirm (T070-e).

Neither harness covers the new UI. The two scratch harnesses above checked it and were deleted because the harness files are outside this task; folding them into verify_saved.mjs and verify_admin_panel.mjs is T070-f.

Statements and complaints are kept forever, like the reports in T068-g. A retention period for both belongs in the same decision (T070-g).

`useUnpublishGuide.js` still has a comment saying the reason is "the only record of why until the statement of reasons exists (T070)". The file is outside this task, so the stale comment waits for the next task that edits it (T070-h).

T069-c stays open and matters more now: the owner can publish a taken-down guide again while their complaint is still open. Nothing in 039 changes that.

Not verified: anything against a real Supabase project, including the RLS path through PostgREST (the test uses `set role` with claims, the way PostgREST does, but not PostgREST itself) and the column grant as seen by supabase-js; the UI against the real functions (it ran against stubs and the mock seam); and the translations by a native speaker.

## Rollback procedure

Live, if 039 has been pasted: the statements and complaints are records the service is expected to keep, so export them first (`select * from public.moderation_statements`). Then run the down section from the header of 039:

```
drop function if exists public.admin_list_moderation_complaints(text, int, int);
drop function if exists public.admin_decide_complaint(bigint, text, text);
drop function if exists public.contest_moderation_decision(bigint, text);
drop function if exists public.admin_dismiss_content_report(bigint, text);
drop table if exists public.moderation_statements;
-- paste 038 again (takedown body and guard), then 037's
-- admin_list_content_reports block, then:
drop function if exists public.moderation_guide_fingerprint(uuid);
alter table public.content_reports
  drop column if exists decided_by, drop column if exists decided_at,
  drop column if exists decision_note;
notify pgrst, 'reload schema';
```

Dismissed reports keep status `dismissed`; guides reinstated by a reversal stay public until their owners change them.

In git:

```
git -C continent-app revert e4101b8
git revert <the T070 report commit> 2e96c78dd
```

or drop the branch `p4-statement-of-reasons` in both repos before merge. Reverting the app without the migration is safe: nothing else calls the new functions or reads the table. Reverting the migration without the app leaves the notice hidden and the new admin controls answering with the missing-function message, the same state as before 039 is pasted.
