# T219 feedback loop from users into the backlog

## Task ID

T219 (mind-map M19). Branch p12-feedback-loop, root repo only.

## Date

2026-10-02

## What changed

Carta now has a written decision on how a traveller reports a wrong price, a bad photo or a missing trail, and where that lands: docs/FEEDBACK-LOOP.md. The session notes made this a decision document with the recommendation pending the owner, so no app file, no migration and no database were touched. Nothing is different for a traveller yet.

The decision rests on what is already built. The feedback form in the account panel writes to public.feedback through submit_feedback (017), with a context block holding the path, viewport, language and user agent; the admin page reads it on the Feedback tab with new, open and done statuses and, since T270, a count badge. The override console (018 plus 043) patches five whitelisted fields on beach, lake, mountain, trail and dest items, each override carrying a status, a review date and a reason. The coverage contract (T111) stamps one of seven reason codes on every thin region. None of these is reachable from the page where a traveller sees the fault, and a message arrives without an item id, which is the cost the decision removes.

The recommendation is option A: one Report a problem link on the five item pages and beside price surfaces, opening the existing form as a sheet prefilled with the item, sending the existing kinds (bug for photo, text, price and missing; other otherwise) with one new key in the context block, report, holding layer, id, cc, what, name and, on a missing report, the region and its coverage code. The inbox shows that line and gets one button, Open in Content, that opens the override editor on that item. Photo and text reports close inside the app in two screens; price reports and missing items become a task row or an intake candidate, and the feedback row stays open until that closes, so the inbox's open count is the honest size of the data backlog. A second step, one migration after 045, adds a data kind to feedback and the cycle layer to content_overrides. Options B (a dedicated reports table in the shape of 037) and C (email only) are written up and rejected, with the reasons.

The copy in the document follows carta-design: sentence case, verb first, a real example as placeholder, no primary button, no red, no banned words.

## Files touched

**Created:**
- docs/FEEDBACK-LOOP.md
- Execution/P12/T219-user-feedback-loop.md

**Modified:**
- Execution/_OPEN.md (rows T219-a to T219-d)

No app repo change, no migration.

## Commands run

    git -C C:/Users/Gebruiker/Documents/Portfolio/wt/T219 add docs/FEEDBACK-LOOP.md Execution/P12/T219-user-feedback-loop.md Execution/_OPEN.md
    git -C C:/Users/Gebruiker/Documents/Portfolio/wt/T219 commit

The mind-map note for M19 was read with a short Python zipfile read of additional docs/Carta/Carta-Master-Plan.xmind, because xmind_prompt.py looks tasks up by their _ORDER.md number and M19 is not in _ORDER.md.

## Config and secrets set

None.

## Before/after measurements

The task implies numbers for the front door, but the front door is not built in this task. The figures below are the state today and what the build task (T219-b) must report when it ships.

| Metric | Before | After (this task) | Delta |
|---|---|---|---|
| Taps from an item page to a sent report | 4 (Account, Send feedback, kind, send) | 4; 2 once T219-b ships | none yet |
| Feedback rows that name an item | 0 of every message (free text only) | 0; all report rows once T219-b ships | none yet |
| Layers the override console can patch from a report | 5 of 6 (no cycle) | 5 of 6; 6 of 6 after T219-c | none yet |
| Written decision on the loop | 0 | 1 | +1 |

## What broke and how it was fixed

No issues.

## What is still open

The owner accepts option A, or chooses B or C, and says whether the link also sits beside each price chip in the first release (T219-a). A build task in the app repo adds the link, the sheet, the report key in the context block and the Open in Content button (T219-b), after T219-a. One migration after 045 adds the data kind to public.feedback and the cycle layer to content_overrides (T219-c), after T219-b. The document assumes 017 is live, as _OPEN-MASTER does (stage 2 does not paste it), but no session has run the check; the owner runs select to_regclass('public.feedback') once and, if it returns null, 017 joins the stage 2 pastes before 045 (T219-d).

## Rollback procedure

Delete docs/FEEDBACK-LOOP.md and this report and remove rows T219-a to T219-d from Execution/_OPEN.md, or revert the one commit. Nothing else was changed.
