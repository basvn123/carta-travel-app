# Owner procedure: Other owner checks and clean-ups (T1072, ROADMAP A3)

What is left here needs a person, or a system that one lane of the owner sweep did not own. On 2026-11-12 the owner sweep went through all 81 rows. It closed 49 of them as done, decided, already done or obsolete; `.work/2026-11-12-owner-review/report.md` names each one with its reason, and the engineering follow-ups moved into their ROADMAP items. When a step is done, delete it here (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

Rows: 25 steps, covering 32 of the original rows.

## Steps only you can do

1. **T033-b** Stripe Tax settings. Stripe Dashboard, Settings, Tax: set the origin address to the Belgian business address, add a registration for Belgium only, and turn threshold monitoring on with an email address you read. Done when the Tax page shows Belgium registered and monitoring on.
2. **T043-c** One month of real costs. After a month has closed, open Admin, then the margin and infrastructure panel, and enter that month's invoices: Hetzner, Cloudflare, Supabase and the domains, each with source `actual`. Then write down the ledger figure, the dashboard figure and the difference on the "not invoiced" line. Done when that line shows a month with no gap you cannot explain.
3. **T235-e** Outage drill, together with T1160-c. Follow `docs/runbooks/incident.md` sections 2, 3 and 5: Gemini key unset on a branch project, a failed webhook in Stripe test mode, and Supabase down. Then do section 1 on the box: kill a weekly run. Write the time each took, and any step that was wrong, in `docs/runbooks/drill-log.md`. Done when all four sections have a time in the log.
4. **T206-e / T207-e / T208-b** Community and press rules, at D-14. Before the first post, read the rules page of each community named in the T206 report, signed in where needed: r/Ultralight, r/trailrunning, r/Garmin, r/openstreetmap, r/ultrarunning, r/wahoofitness and every Facebook group. Do the same for each outlet's submission page (EU-Startups, Culture Routes Society, UK and EU outlets). Write the date and the rule that applies beside each one. Done when every row has a date.
5. **T220-b** Soft-launch roster, by D-21. Write 15 names in a private file outside the repo: 5 strangers, 5 hikers who start walks from towns, and 5 likely pass buyers. Add the invitation text. Done when the file has 15 names and the text.
6. **T764-a** Taste answers survive sign-in. In a private window, answer the taste questions signed out, then sign in to a real account. The answers must still be there. Only a real account can show this; the unit tests already pass.
7. **T326-b** Feedback inbox, admin side. Signed in as admin with the MFA code, open Admin, then Feedback. A report line shows "Open in Content", and clicking it opens the Content tab on that item. Done when both happen; if not, tell a session what you saw.
8. **T1000-a** Only if Plan crashes. If Plan still shows "This page stopped working" after "Reload the app" while signed in, press F12, open Console, and copy the line that starts with `App crashed:` into a session.
9. **T150-d** Read the generated notes, after the paid sidecar run (`docs/owner/paid-runs.md`). Read 20 packing and risk notes, risks first. Look for places or rules that do not exist, and set `reviewedAt` on each note you read. Done when 20 notes carry `reviewedAt` and every invented fact is fixed or reported.
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

22. **T286-e** Destination PDF guide. Run locally with `?paymock`, download the guide for a place near trails (Valbona Valley), and read the "around" rows. Done when every around row names a real nearby place with a believable distance.
23. **T335-c** Maintenance screen and announcement bar. Run locally with `?paymock` and a maintenance flag, and look at both at 375 and 1440 px. Done when both show, read correctly, and cover nothing they should not.
24. **T430-a** With network access, at 375 and 1440 px, open Lake Bled (`#lake=si-lake-bled-Q648902&lc=SI`) and Rome (`#dest=FCO`): swipe the gallery and a rail of tiles, open the 3D terrain view, and export the PDF. Done when every photo loads and the PDF carries photographs. On the same walk, look at the credit fold ("Where this comes from") on a destination with routes; T313-a never saw it in a browser.
25. **T168-b** The 20 px pack icons (`src/components/PackIcons.jsx`, shown by `PackGrid.jsx` on a trip page's packing list, e.g. `#journey=es-pilgrim-camino-sarria-santiago`). Look at each icon at 20 px and at 4x zoom. Done when every icon reads at 20 px with no clipped strokes; list the bad ones as `icon name: problem`.

## Moved from unsorted.md (owner sweep 2026-11-12)

| ID | Item | Order |
|---|---|---|
| T1071-d | The admin MFA gate and the trail page upload door were not seen in the browser (both need a signed-in account); look at them at 375 and 1440 and run scripts/verify_admin_panel.mjs after T1071-a | after T1071-a |
| T1086-c | Re-verify the Stripe, Supabase Admin and Cloudflare dashboard steps in docs/runbooks/refund.md and incident.md sections 4 and 5 (only repo objects were checked); also settle whether year-plan renewals need their own refund rows and a refund column on pass_grants |  |
| T1092-b | After T1092-a, look at the Trails card and trail page on a phone and at desktop width (Veluwe Zwerfpad reads Long, an E-path stage shows Also called); the cloud container could not load app data |  |
| T1093-b | After T1093-a, read the photo coverage per country from the rebuilt wire (before: DE 4.3, GB 11.8, IT 9.9, FR 16.1 percent), run `node scripts/ci/check-contract.mjs` (it must say the photographs carry an allowed licence and a name) and look at one credited trail page on a phone | after T1093-a |
| T1100-c | Look at the place page trip card on a real phone with a fare in the sweep (Bergen and Taormina from Brussels open on the plane; Annecy without a fare opens on the car with the why caption) |  |
| T1102-b | Look at the rail tile and the trail page on a real phone with photographs loaded (this container had no network, so images were blank) |  |
| T1103-e | Real-person usability test of the 5-screen plan flow with one first-time traveller on a phone (report T1103) |  |
| T1104-b | The real two-device check of account sync (keep and bookmark signed out on a phone, sign in, see them on a laptop, remove on one and see it go on the other, switch account on the phone), after T1104-a and a deploy | after T1104-a |
| T1106-a | Run the seeded-error browser spec and look at `?seedError=explore` in `npm run dev` with real app data (the cloud container has none) |  |
| T1110-c | Sign up with a real address on a preview, confirm from the mail, unsubscribe from the mail, and look at the form on a phone and a desktop | 3 |
| T1111-c | Run G-R1 to G-R3 (benchmark, premium feel, user struggles); the direction was written without them and is revised where they disagree (report T1111) |  |
| T1120-c | Throw one probe error on the preview, confirm one scrubbed event, then test the VITE_ERROR_TRACKING=off kill switch |  |
| T1105-b | After going live, look on a real phone at Explore rails and a destination page: sharpness at the new `STORY_SIZES` 64vw, AVIF served from cdn.carta-europetravel.com, credits under the gallery | 2 |
| T1129-b | Look at the admin Overview Funnel card on a real project after the paste, and hit each step once |  |
| T1131-a | Write the founder line in `PRESS_FOUNDER_LINE` (`continent-app/src/lib/press.js`); the press kit shows a visible placeholder until then |  |
| T1123-b | G4's scope should come from the G-R3 interviews and unmoderated test, which have not run; T1123 worked from the audit and the T1103 usability note (report T1123) |  |
| T1123-d | Look on a real phone at the reload fixes: reload on a setup question and on the priced trips, then Back to the trip home and "See your priced trips" (report T1123) |  |
| T1124-c | Look at the app with system reduced motion on, on a real phone (sheets, tabs, map camera, home film) |  |
| T1122-c | Look at the umber variant on a real phone (iOS Safari, Android Chrome) with the dark system setting and reduced motion on (report T1122) |  |
| T1128-a | Screen-reader pass on a real phone (VoiceOver on iPhone, TalkBack on Android) over Home, Explore list and map, a place, trail and beach page, the Plan wizard, the trip page and Account; axe cannot judge what is heard (carries T190-f) |  |
| T1136-g | The 142 place labels were written by one session from general knowledge of Europe and checked only against the catalogue's ids; an owner read of scripts/eval/ask-set.json (places per question) would make the recall numbers more trustworthy |  |
| T1145-e | Review the D6 expectation blend (population 0.25, area 0.25, nights 0.5) and gap thresholds before D15 adds places on them; six country gaps are not robust to the blend | 0 |
| T1148-a | Hand-label the 40 plans of `continent-app/scripts/eval/plan-day/labels.json` (pass or fail each, without opening sample-key.json), then run `run.mjs plan-day --write --dashboard`: until then the plan-day judge has no kappa against a human and may not gate ([report](P15/T1148-eval-platform.md)) | 1 |
| T1149-a | Review the taxonomy v1 node list and the 20 "not a concept" decisions in pipeline/taxonomy/mapping.yaml before labelling, so the labels are made against an agreed vocabulary (docs/ai/taxonomy.md) | 1 |
| T1143-g | sources.yaml uses LicenseRef ids for UNESCO, Numbeo, the stays scrape, Commons (per file) and US Gov data, and the ledger marks some of them "verify"; confirm each against the ledger row before the licences are shown to travellers |  |
| T1146-a | Review the D15 add list per country in docs/data/catalogue-gaps/ (142 adds, 440 stretch below the 0.40 floor, 3 merge reviews); D15 part 2 applies only what is approved | 1 |
| T1144-a | The truth set sheet (evals/truth/sheet.csv, 762 rows) is not verified by hand: the score rests on 90 seeded rows that share the data's own sources; verify the rows (evals/truth/GUIDE.md) and move the baseline | 1 |
| T1144-b | The text judge has no kappa against a human: label the 50 texts in evals/truth/judge/labels.json, then read the kappa in the truth eval | 2 |
| T1152-b | The taste verdict sync is proven against a stubbed account only; check it on two devices once 072 is live and deployed (report T1152, Owner steps) | after T1152-a |
| T1153-c | The 300-mention linking set was written by the session that built the linker, so MRR 0.997 is an upper bound; label 300 real mentions from search logs, parse-booking titles and Ask, then re-bless scripts/eval/linking/baseline.json |  |
| T1158-a | Run the k6 scripts: first locally against `wrangler pages dev` (to record local p95) and then against the Pages preview (`docs/runbooks/load-tests.md`), and paste the p95 numbers in a report |  |
| T1160-c | Run the incident drill on the live stack and add the timings to `docs/runbooks/drill-log.md` |  |
| T1190-a | Owner step: check the 48-row price hand sample by hand and run prices_sample; until then no check sees absolute euros (report T1190) |  |
| T1190-c | Owner step: enter about 20 published fare examples in fare_examples.csv, copy the sweep files to cache/flights_wire and run prices_fares; swept fares have no outside check |  |
| T1169-b | The installed app is untested on a real iPhone and Android phone: install from the hint, offline reopen of a kept trip, update after a deploy (CACHE_VERSION carta-v8); see the owner step in report T1169 |  |
| T1192-g | National lake CSVs (France, Sweden, Finland) for the lakes layer; check each licence |  |
| T1191-h | The tourism board and best-of lists and the Eurostat city nights are not compiled (network); add them under data/reports/validation/ratings/sources/ and rerun the ratings layer |  |
| T1191-l | UNESCO and Tripadvisor terms limit republication and data/rating/external/tripadvisor.json stores names and ranks; the owner decides whether it stays in git |  |
| T1175-a | The trip receipt share (My trips menu) is behind the flag ?receipt=1; look at the image on a real phone and desktop, then flip the default in continent-app/src/lib/share/flag.js; see report T1175 |  |
| T1178-e | Owner approval of the sample December 2026 draft, then set status published; wire vintage is 2026-06-07 so a fresh wire should be used first |  |
| T1193-c | Owner step: supply official tracks (`geom/EV6-AT.geojson` etc.) from open sources (France data.gouv Licence Ouverte, UK NCN, Swiss opendata) for the geometry fact; EuroVelo GPX is personal use, keep it out of git |  |
| T1193-f | National networks (D-Netz, Sustrans NCN, SchweizMobil, Bicitalia) not loaded: `national.csv` loader is built and tested, data is an owner step after terms are read |  |
| T1194-b | Copernicus sea temperature CSV not exported and T1097-a not run; sea layer has no real run |  |
| T1200-a | Fire months use a dry-heat proxy until the owner supplies cache/fire_fwi.json from the CEMS fire danger reanalysis (licence wording unverified) |  |
| T1198-f | Review the 42 heroes flagged on the whole list (Starmer portrait on Tiverton, Hythe, Rothwell; Flag of Europe on Eu; a grizzly on Fur) and approve or refuse the 12 ladder replacements before any --apply | 3 |
| T1209-b | Look at the G14 home (?home=g14) on a real phone on a preview: the doors, the example card, the share button, and how quick it feels (INP is only meaningful there) | 2 |
