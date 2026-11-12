# Owner procedure: Other owner checks and clean-ups (T1072, ROADMAP A3)

What is left here needs a person, or a system that one lane of the owner sweep did not own. On 2026-11-12 the owner sweep went through all 81 rows. It closed 49 of them as done, decided, already done or obsolete. They are listed in `.work/2026-11-12-owner-review/report.md`, and the engineering follow-ups moved into their ROADMAP items. When a step is done, delete it here (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

Rows: 25 steps, covering 32 of the original rows.

## Steps only you can do

1. **T033-b** Stripe Tax settings. Stripe Dashboard, Settings, Tax: set the origin address to the Belgian business address, add a registration for Belgium only, and turn threshold monitoring on with an email address you read. Done when the Tax page shows Belgium registered and monitoring on.
2. **T043-c** One month of real costs. After a month has closed, open Admin, then the margin and infrastructure panel, and enter that month's invoices: Hetzner, Cloudflare, Supabase and the domains, each with source `actual`. Then write down the ledger figure, the dashboard figure and the difference on the "not invoiced" line. Done when that line shows a month with no gap you cannot explain.
3. **T235-e** Outage drill, together with T1160-c. Follow `docs/runbooks/incident.md` sections 2, 3 and 5: Gemini key unset on a branch project, a failed webhook in Stripe test mode, and Supabase down. Then do section 1 on the box: kill a weekly run. Write the time each took, and any step that was wrong, in `docs/runbooks/drill-log.md`.
4. **T206-e / T207-e / T208-b** Community and press rules, at D-14. Before the first post, read the rules page of each community named in the T206 report, signed in where needed: r/Ultralight, r/trailrunning, r/Garmin, r/openstreetmap, r/ultrarunning, r/wahoofitness and every Facebook group. Do the same for each outlet's submission page (EU-Startups, Culture Routes Society, UK and EU outlets). Write the date and the rule that applies beside each one. Done when every row has a date.
5. **T220-b** Soft-launch roster, by D-21. Write 15 names in a private file outside the repo: 5 strangers, 5 hikers who start walks from towns, and 5 likely pass buyers. Add the invitation text.
6. **T764-a** Taste answers survive sign-in. In a private window, answer the taste questions signed out, then sign in to a real account. The answers must still be there. Only a real account can show this; the unit tests already pass.
7. **T326-b** Feedback inbox, admin side. Signed in as admin with the MFA code, open Admin, then Feedback. A report line shows "Open in Content", and clicking it opens the Content tab on that item.
8. **T1000-a** Only if Plan crashes. If Plan still shows "This page stopped working" after "Reload the app" while signed in, press F12, open Console, and copy the line that starts with `App crashed:` into a session.
9. **T150-d** Read the generated notes, after the paid sidecar run (`docs/owner/paid-runs.md`). Read 20 packing and risk notes, risks first. Look for places or rules that do not exist, and set `reviewedAt` on each note you read.
10. **T154-c** Confidence notes. 130 curated trips (northern-baltics 30, western-central 100) have no `sources.confidenceNotes`. Read each trip's sources and write one line on how sure the figures are. A session can draft them for you to correct.

## Waiting on a data run (the box lane runs it; delete the step when the run has shipped)

11. **T102-b** (also closes T175-a and T151-a) Rebuild `public/journeys` with `build_wire.py`, with fetching on (T090-a). The 61 capital-pinned trips then get their rail lines, the data sheet shows the T151 numbers, and the owner sweep's trip fixes (T151-g, T431) reach the app.
12. **T169-a / T170-a / T170-b / T174-b / T174-c** The trip authoring pass. Write booking windows for 66 trips, a bad-weather fallback for every outdoor day, arrival, departure and sleeping facts (with new schema slots), descent on every moving day, and a surface and traffic-free split for every cycling trip. This is one owner-started generation run, followed by a spot check.
13. **T179-d** Fill beach length (288 rows), beach orientation (168) and lake area (39).
14. **T103-a** More measured monthly stay curves. Only 54 destinations have one, so only 50 of 253 trips get a price row.
15. **T154-a** After the first measured run, tune `ESTIMATE_MIN_EUR` (150) and the estimate wording against the share of figures a person changed, together with the critic hit rate from T145-a.
16. **T645-b** After the first box publish of stays, check the live stays wire's Chamonix prices (it showed 439 a dorm bed and 471 a private room, against 44 and 92 in the new build).

## For the orchestrator or another lane (Claude can do these; they touch shared or owned systems)

17. **T252-a** (orchestrator, only when no other session is active) In the main checkout, expire every reflog except `refs/stash`, one ref at a time (not `--all`, which drops the stash), then run `git gc --prune=now`.
18. **T1040-d** (orchestrator) Delete the stale nested repo `continent-app/.git` in the main checkout. Bundle it outside the tree first if disk allows.
19. **T1040-e / T1034-f** (orchestrator, then security) Tag `explore-v4` and `p0-next-steps-docs` as `archive/*`, delete them locally, then run `git push origin --delete explore-v4`. `p11-flights-to-august` is already gone.
20. **T235-a** (supabase, then security; two values from you) Once migration 041 is live, set the Actions secrets `CARTA_SUPABASE_URL` and `SUPABASE_ANON_KEY` from `continent-app/.env`. You supply `CARTA_SUPABASE_SERVICE_KEY` and `ALERT_WEBHOOK_URL` (a Slack hook or an ntfy topic URL).
21. **T887-b** (after the next ship) On a live trip page, note the total, tap "Add a hire car, +€…", and check that the total grows by exactly that amount.

## Checks Claude can do but the 2026-11-12 sweep did not reach

22. **T286-e** Destination PDF guide. Run locally with `?paymock`, download the guide for a place near trails (Valbona Valley), and read the "around" rows.
23. **T335-c** Maintenance screen and announcement bar. Run locally with `?paymock` and a maintenance flag, and look at both at 375 and 1440 px.
24. **T430-a** Galleries, swiped rail tiles, 3D terrain and PDF photographs, with network access, at 375 and 1440 px. On the same walk, look at the credit fold ("Where this comes from") on a destination with routes; T313-a never saw it in a browser.
25. **T168-b** Design review of the 20 px pack icons at full size.
