# T326 the feedback front door

## Task ID

T326. Branch p12-feedback-front-door in both repos (root, and continent-app). Closes register rows T219-b and T284-d.

## Date

2026-10-07

## What changed

A traveller can now report a problem from the page where they see it. A quiet text link, Report a problem, sits in the action area of the destination page and of the trail, beach, lake, mountain and cycling route pages. Beside the priced surfaces the same component reads Report this price: under the first-run receipt and in the cost fold on the destination page, in the cost fold on the trip page, and under the budget on the journey page. The link opens the existing feedback form as a sheet (SheetShell) over the page, so the traveller keeps their place. The sheet says what the report is about ("About: Lake Como, lake"), asks what is wrong as five radio rows (the photo, the name or description, a price, it is missing something, something else), takes one sentence and an optional email with the plain note that without one we cannot reply, and sends.

The send goes through the existing submit_feedback with kind data and a context block that carries one new key, report, holding layer, id, cc, what and name. Until migration 047 is pasted the database turns the unknown kind into other, so nothing is refused (read in 017 and 047). The pure key builder lives in src/lib/reportKey.js so a test can import it without the Supabase client.

On the admin side the Feedback inbox shows a report line on each row ("Lake Como, lake, the photo") and, when the report names a layer the override console can patch, an Open in Content button. The shell switches to the Content tab and ContentSection opens the editor on that item once the layer index has loaded, the way a review-list row does. This also closes T284-d: ContentSection and fetchValidItemIds in lib/overrides.js now know the cycle layer (cycling/index.json names the field country, and the cycling files keep unrated rows under listed, so both are read), and the label keys account.feedbackKind.data and admin.layer.cycle exist. Trail behaviour in fetchValidItemIds is unchanged on purpose.

Design: the link is text in the UI face with an underline, never a filled button and never red, 44px tall (32px on a fine pointer). The sheet has one primary button, Send report. New CSS is in src/styles/42-feedback.css. The sheet's scrim is raised above the full pages (z 240) with a :has rule, because SheetShell takes no scrim class and the first build showed the sheet hidden behind the page.

The seven carta-design questions. One: no hex value in the diff, only tokens. Two: no gradient, no new colour, the accent is used for the single primary button and the error rule. Three: ochre, teal and danger are not used. Four: no mono text. Five: one primary button in the new view (Send report); the pages' own primaries sit under the scrim. Six: labels are verbs or plain questions, no banned words, no em dashes or middots. Seven: a planned Report this price link beside the day-cost fact strip was dropped, because the receipt link already covers it.

## Files touched

App repo (continent-app), commit ec99e7f.

**Created:**
- src/components/ReportProblem.jsx
- src/lib/reportKey.js
- src/styles/42-feedback.css
- tests/feedbackReport.test.mjs

**Modified:**
- src/lib/feedback.js (sendReport, re-export of the key builder)
- src/lib/overrides.js (cycle in fetchValidItemIds)
- src/browse/BeachPage.jsx, LakePage.jsx, MountainPage.jsx, TrailPage.jsx, CyclePage.jsx, DestinationPage.jsx, TripPage.jsx, JourneyPage.jsx
- src/components/admin/FeedbackInbox.jsx, ContentSection.jsx
- src/admin/AdminPage.jsx
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (additions only, 26 report.* keys each; en also admin.layer.cycle, admin.fbOpenContent, account.feedbackKind.data)
- src/styles.css (one import line)

Root repo: this report and Execution/_OPEN.md.

## Commands run

In wt/T326-app: npm run lint (0 errors, 71 older warnings), npm test (282 pass, 0 fail, including 2 new), node scripts/ci/design-lint.mjs (196 violations, 196 in the baseline, 0 new), npm run build (passes; dist and dist-data deleted afterwards), npx vite preview --port 5213 (stopped afterwards), then scripts/verify_beaches.mjs, verify_lakes.mjs, verify_mountains.mjs, verify_trail_page.mjs and verify_cycling.mjs against the preview. Screenshot helpers are in wt/T326-shots, with the screenshots. All six i18n files were parsed after the edit and git diff --stat shows only added lines.

## Config and secrets set

None. The shell had the live Supabase variables unset. No migration. Nothing contacted the live project.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Taps from an item page to a sent report | 4 (Account, Send feedback, kind, send) | 2 (Report a problem, Send report) | -2 |
| Report rows that name an item | 0 | every report sent from the link carries layer and id | all |
| Layers ContentSection can open from a report | 4 (beach, lake, mountain, trail) | 5 (cycle added) | +1 |

The tap count is read from the code path, not from a live send. The layer figure counts the LAYERS list in ContentSection.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Sheet invisible on every page, send button "covered" by the page | SheetShell scrim is z 60, full pages are z 240 | scrim holding .report-sheet raised to 330 |
| Report this price wrapped onto two lines in the destination action row on a phone | narrow pill row | white-space nowrap |
| verify_cycling reports 70 of 72 | the two failures are data checks (a repeated country count, zero Scottish tours in the shipped data), not UI | none; unrelated to this task, the other four harnesses pass fully |

## What is still open

The missing-item report does not carry the region and coverage reason code the doc describes, because the shipped coverage.json holds a status per region and not the seven reason codes, and the pages have no region id to hand (T326-a). The browser check covered the destination, trip, journey, beach, lake, mountain, trail and cycling pages at 380 and 1280 px with no page errors and no horizontal scroll, but not the admin screens, which sit behind the admin lock and a live session (T326-b). A real send was not run, because there is no Supabase project here; the owner sends one report after migration 047 and confirms the row shows kind data and the report key, then presses Open in Content once (T326-c). The admin strings added in English only (admin.fbOpenContent, admin.layer.cycle, account.feedbackKind.data) match their neighbours (T326-d).

## Rollback procedure

Revert the app commit ec99e7f (git revert ec99e7f) and the root commit that carries this report. Nothing was migrated and no data was written, so no other step is needed.
