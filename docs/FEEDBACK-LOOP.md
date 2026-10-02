# The feedback loop: from "this is wrong" to fixed

Decision written by T219, 2026-10-02. Status: recommendation, pending the owner (register row T219-a).
Companions: docs/SUPPORT.md (the mailbox and the canned answers) and the admin page's Feedback and
Content tabs, which this document connects.

## The question

A traveller sees a wrong price, a photo of a car park, or a trail they know exists and Carta does not
list. How do they say so, and where does it land so that it gets fixed once instead of answered each
time?

## What exists today

Three pieces are already built. None of them is joined to the others from the traveller's side.

The feedback form. Account, Send feedback. One text box, one kind (Something is broken, An idea,
Something else), written to public.feedback through submit_feedback (migration 017). The client adds a
context block: the URL path, the viewport, the language and the user agent (src/lib/feedback.js). It
works signed out, is rate limited to five an hour per account and 200 an hour in total, and falls back
to a mailto: when the write is refused. The admin page reads it on the Feedback tab (FeedbackInbox.jsx),
with the statuses new, open and done set through admin_set_feedback_status, a reply link when the
sender left an email, and since T270 a count badge on the tab. This is the queue somebody reads.

The override console. Admin, Content. One row per (layer, item) in public.content_overrides
(migration 018), patching five fields the database whitelists: name, image, blurb, hidden, featured.
Since migration 043 every override carries a status (verified, temporary, stale), a review date and a
reason, overdue rows are listed first and counted on the Overview, and T075 flags rows whose item the
pipeline has since dropped. This is the path from a report to a live fix without a deploy. It covers the
layers beach, lake, mountain, trail and dest.

The coverage contract. pipeline/regions/coverage.py (T111) writes one of seven reason codes beside every
country cell and every NUTS3 region that is below its floor: no_open_data, way_only_not_derived,
failed_continuity, below_quota, not_applicable, licence_blocked, pending_partnership. The app reads
them from public/coverage.json. So for a missing trail Carta often already knows that it is missing, and
why.

The gap is the front door. The form is four taps away from the page where the fault was seen (Account
tab, Send feedback, choose a kind, type), it carries no item id, and a message like "the photo of the
lake is wrong" reaches the inbox without saying which lake. The admin then has to guess, open the
Content tab, find the country file, scroll to the item. That is the cost this decision removes.

## The three reports are three different things

They look alike to the traveller and must look alike to them, one link that says Report a problem.
Behind the link they land in three different places, because the fix lives in three different places.

A bad photo, a wrong name, a wrong blurb, an entry that should not be there. The override console fixes
these today, live, in one save. The report needs the layer and the item id and nothing else. This is
the one case where the loop can close in minutes.

A wrong price. No override can patch a price; the whitelist does not include one, on purpose, because a
hand-edited figure under a provenance chip that says "observed on" would be a lie. Carta no longer
prices flights (T272) and the remaining figures are estimates or frozen snapshots. The fix is in the
estimation or lifestyle pipeline, or in the chip's wording, so a price report is a pipeline task. The
report needs the item id, which figure (route, stay, day cost) and what the traveller paid or saw. The
canned answer in docs/SUPPORT.md section 2 already says what to reply.

A missing trail, beach, lake or mountain. There is no item id, because there is no item. The report
needs the place name, the country and ideally a link to the thing (an OSM relation, a Wikipedia page, a
tourist board page). Where the traveller is standing in a region the coverage contract already marks
thin, the report confirms a known gap and can carry the region's reason code so the admin sees at once
whether the pipeline can be expected to find it (below_quota: it can) or not (no_open_data,
licence_blocked, pending_partnership: it cannot, and the answer is different). The fix is an intake
row for the next ingest, and intake candidates are never ingested without the owner (memory rule).

## The options

A. One link on every item page and beside every price, opening the existing feedback form prefilled
with the item, landing in the existing Feedback inbox. No migration. The admin page gains one button per
inbox row that opens the Content tab on that item.

B. A dedicated reports table and RPC in the shape of migration 037's content_reports (the DSA report
form on a guide), with its own reason list, its own inbox tab and its own rate limits.

C. Email only: point the link at support@carta-europetravel.com with a prefilled subject.

B is the most complete and the most expensive: a migration, a second inbox for one reader, and a second
rate-limit regime, for messages that are feedback in every sense that matters. It also cannot ship until
the stage 2 pastes are done, because every new migration is numbered after 045. C has no queue, no
status, no item id, and depends on a mailbox that does not exist yet (T216-a). A gives the traveller one
tap, lands in the queue the owner already reads, and asks the database for nothing new.

## Recommendation: option A, in two steps

Step one, app only, no migration. A new task in the app repo adds:

A Report a problem link on the five item pages (DestinationPage, TrailPage, BeachPage, LakePage,
MountainPage), in the action row that already holds Share, drawn as a secondary action in the sans at
UI label size, never a primary button and never red. Beside a price surface the same link reads Report
this price. The cycling route page gets the link too, even though the override console cannot patch a
cycle route yet (see step two); the report still lands.

The link opens the existing feedback form as a sheet over the page instead of switching to the Account
tab, so the traveller does not lose where they were. The form shows one extra line above the text box:
the item it is about, in the product's own words ("About: Lago di Braies, lake"), and a choice of what
is wrong, as radio rows in sentence case: The photo, The name or description, A price, It is missing
something, Something else. The kind sent to submit_feedback stays bug for the first four and other for
the last, so the existing check constraint holds. Placeholder: a real example, "The photo shows the car
park, not the beach".

The context block gains one key, report, next to the path and viewport it already carries:

    report: { layer: 'lake', id: 'si-lake-bled-Q207302', cc: 'SI', what: 'photo',
              name: 'Lake Bled', region: 'SI042', code: 'below_quota' }

layer and id are the override console's own keys (the same kind:cc/id scheme favorites.js uses, split
into fields), cc is the country file, what is one of photo, text, price, missing, other, name is for the
inbox row to read without a lookup, and region and code are present only on a missing report, taken from
coverage.json for the region the page or map is showing. Context is capped at 4096 bytes by
submit_feedback and this adds under 200. Nothing about the person is added.

On the admin side, FeedbackInbox.jsx shows the report line on each row ("Lake Bled, lake, photo") and,
when context.report has a layer the console knows, a button Open in Content that switches to the Content
tab with that layer, country and item preselected. ContentSection.jsx already opens an editor from a
review-list row by layer and item id (openFromReview), so the shell passes the same three values. The
admin fixes the photo, saves the override with status temporary or verified and a review date, comes
back and marks the feedback done. Two screens, no search.

That is the loop for the first kind of report, and it is the only one that closes inside the app.

Step two, one migration, after 045 and numbered by the orchestrator (T219-c). It does two small things
017 and 018 did not foresee. It adds 'data' to the kind check on public.feedback so a data report can be
filtered on its own in the inbox (today it hides among bug reports), and widens the layer check on
content_overrides to include 'cycle', because cycling routes are the one shortlistable layer with a page
and no override path. Both are one-line constraint changes with the usual self-check and down block.
Until it is pasted, the app sends kind bug and the inbox filters by the report key in context, which is
enough for one reader.

## Where each report goes after the inbox

The inbox is a queue, not a backlog. The statuses mean:

new: nobody has looked. The badge on the tab and the Overview count carry this number.

open: looked at, and work exists somewhere else. For a photo or text report, that somewhere is an
override row, and the override's review date is the reminder; the feedback row can go straight to done
once the override is saved, because the override lifecycle carries it from there. For a price report
or a missing item, the somewhere is a task: one row in Execution/_OPEN.md in the shape SUPPORT.md
already asks for ("log every wrong-data finding as a task, so the fault is fixed once rather than
answered each time"), or an intake candidate CSV row for the next ingest. The feedback row stays open
until that task closes, so the inbox's open count is the honest size of the data backlog.

done: fixed, or answered with a reason it will not be. If the sender left an email, the reply link
sends the SUPPORT.md section 2 answer in the chip's own words.

The reply promise is the one SUPPORT.md makes: a first human answer within two working days when an
email was left. A report without an email gets no reply and no promise, and the form says so in one
sentence under the email field, as the guide report form does.

A weekly triage, five minutes, in the same Monday look at the oldest unanswered support message: open
the Feedback tab on new, read each row, press Open in Content or write the task row, mark it. The count
to write down beside the support count is the number of rows older than seven days still new.

## What this is not

It is not a public issue tracker, a vote, or a "was this helpful" widget. One reader cannot run those
and the product's voice is to state coverage plainly, not to crowdsource it. It is not a way to let
travellers edit anything: every report is a message, and every change is a human's override with a
reason and a review date. It is not a second channel beside support@: a report with an email is
answered from the inbox's reply link, which opens the same mailbox.

## What the owner decides

Accept option A as written, or choose B or C. If A: whether the link also appears beside each price
chip on the Explore and trip pages (recommended, since the price is the number trust rests on and the
report form already carries the path), or only on the item pages for the first release.

## Measurements the build task must report

Taps from an item page to a sent report: 4 today (Account, Send feedback, kind, send), 2 after
(Report a problem, send). Reports carrying an item id: 0 of every message today; all of the new kind
after. Layers the console can patch from a report: 5 of 6 after step one, 6 of 6 after step two.
