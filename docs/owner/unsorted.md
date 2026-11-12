# Owner steps not yet grouped into a procedure

Owner-only rows from the old register (`the retired register`, retired 2026-11-11) that no procedure file covered. Each row is one action only the owner can take. Move a row into the right procedure file when you group it, and delete it here when it is done. The ID names the old task; its report is found through `.work/INDEX.md`.

Owner sweep 2026-11-12 (unsorted lane, report `.work/2026-11-12-owner-unsorted/report.md`): 28 rows were closed or decided and removed; T1118-b and T1190-h are decided and keep only their human part. Every other row left here is handed to the lane that owns its system. Each row has a target file (`move_to` in that run's `ledger.json`); the orchestrator moves them after the merge, which empties this file.

| ID | Item | Order |
|---|---|---|
| T221-a | The prerendered pages are built but not live: create the carta-prerender bucket, build with VITE_PATH_URLS=1 (T223-c), build and verify the pages (with --cards for the share cards, about two hours), push data then pages, deploy preview then production and check with curl, then prune; exact commands in report T221, Owner procedure | after the T221 merge |
| T222-c | The sitemap URLs are absolute https://www.carta-europetravel.com/ and the Function serves /sitemap.xml and /sitemap-*.xml from the carta-prerender bucket; after T221-a, curl -sI https://www.carta-europetravel.com/sitemap.xml must show 200 and application/xml (the placeholder answers if the bucket holds no index), then submit it in Search Console (T205-f) | after T221-a |
| T222-f | Once the Search Console property exists (T205-f), write the date the first prerendered pages show as indexed into the T239 sheet, and the date the sitemap was first submitted, so T220-e can set a later launch lead from evidence | after T205-f and T221-a |
| T224-a | The cost pages (/spain/malaga/cost) and trip-length pages (/spain/4-days, /spain/4-days/under-80) and sitemap-costs-en.xml go live with the T221-a procedure unchanged; after the deploy, curl -sI on /spain/malaga/cost and /spain/4-days must show 200 and x-carta-prerender | after T221-a |
| T431-a | Owner audit of the sample hostel week ba-hostel-sarajevo-mostar-kotor (prices, buses, beds, opening details); then drop `sample` so it enters the sitemap |  |
| T643-a | The B4 verdict (Hostelworld privates are per person, doubled into a room) rests on one signal, private / dorm 1.14, because the list ignores the guest count; check one hostel's booking page by hand before the first publish (scripts/hw_unit_sample.py, cache/stays/hw_unit_sample.md) | 1 |
| T714-b | No place has a local transport fare (0 of 3,868): choose a fare source (operator fare pages, a licensed dataset) and write the pipeline layer for local_transport.fare on the box; the engine prices it as soon as it exists |  |
| T1075-d | Decide one rule for not-yet slots on the destination page: the 2026-10-30 rule hides them, D10 asks to show them; the price card now shows a Local transport Not yet measured row |  |
| T1076-b | Only 337 of 3,868 places clear the quality bar (research expected about 1,800; 3,224 without the 120 word intro test); decide the threshold before the next prerender upload, or lift intros through D9 | 1 |
| T1076-f | After the next prerender upload confirm a thin place and a trail send noindex,follow in the head and the x-robots-tag header, and that sitemap-destinations holds the expected count | after T1076-b |
| T1084-b | After the live ship that carries the T1071 MFA step-up: open /admin signed in as the owner, pass the TOTP step and see the panels load instead of mfa_required (closes with T1071-d). | |
| T1087-b | Make admin-harnesses, admin-rpc-security and rls-policies required status checks on main, so a red harness blocks a merge (GitHub settings, owner only) |  |
| T1090-a | Check the strict style-src (no 'unsafe-inline') on the preview deploy: header, console clean on the main screens, a prerendered page and the print view styled, in Chrome and iPhone Safari; re-upload the prerender if its pages lack the current STYLE (steps in the T1090 report) |  |
| T1101-a | Add the live failing query ("quiet lake with good walks in June under 120 a day") to the Ask live golden set and run `scripts/ask-eval-live.mjs` against the deployed Function; the container has no Workers AI |  |
| T1101-b | After the next deploy, ask five questions on a phone and desktop width and check the written line names only places on the first three cards |  |
| T1096-c | After T1096-a, count gallery coverage with `place_gallery.py --report` and rebuild the dossiers (`python pipeline/dossier/build_dossier.py --all`); look at one GB, RO, FR and IT place gallery at phone and desktop width |  |
| T1097-b | Check one real beach page on a phone after the box run and deploy: the strip shows and the warmest months are plausible for the sea |  |
| T1104-a | Paste supabase/migrations/065_account_things.sql (after 064) and run scripts/verify_live_policies.mjs; until then account sync of kept trips, bookmarks, trips in progress and the device trip stays off (see report T1104, owner steps) | 1 |
| T1108-a | Give the dedicated support address (and set up the mailbox with SPF, DKIM, DMARC): `SUPPORT_EMAIL` in `continent-app/src/lib/contact.js` is a placeholder equal to the general address |  |
| T1108-b | Review the Dutch support strings (`support.*`, `footer.support` in nl.js); the Dutch is a draft, and de, es, fr, it fall back to English |  |
| T1109-a | Number and paste `supabase/migrations/067_channel_counts.sql` (rename it and add a `_down` file); until then channel ticks fail silently and the admin card is hidden |  |
| T1110-a | Paste `supabase/migrations/066_waitlist.sql` in the Supabase SQL editor after 065 and look for "waitlist self-check passed" | 1 |
| T1089-f | Harnesses that SKIP here (needs account, dist, network or real data: account_panel, continue_trip, data_export, status_banner, viewport_catalogue, omio_ui, joins, google_flights, day_routes, plan_mocks U) have not run for real; run them on the owner's box with Supabase, a fast build and the full dataset |  |
| T1107-c | After the first monthly and the first quarterly box run, read `r2:carta/status/last_run.json` and `freshness_wires.json` (tier, exit 0, fewer than 8 wires over cadence) and the quarterly run's duration against its 120 h timeout; trails and cycling chains carry no est_h | 3 |
| T1113-a | Upload the new prerender; warning: indexed places drop from 3,754 to 337 (owner decision 1) and thin beaches, lakes, mountains and duplicate trips leave the sitemap |  |
| T1113-d | After the upload confirm trip canonicals and thin-page noindex,follow in Search Console and view source (follows T1076-f) | after T1113-a |
| T1114-a | Look at the price notes (Explore card grid and rail, Ask card, trip page cost card, day receipt) at 375 and 1440 wide and in Dutch; the container could not load app data |  |
| T1117-a | The AI guard (plan-day, parse-booking, /api/ask/answer) is code only: deploy both Edge Functions and the Pages build so travellers get it | 1 |
| T1117-b | The 50-attack set runs on stubbed model outputs; run `continent-app/scripts/ai/redteam_live.mjs` against a preview with a test account to record real Gemini and Workers AI outputs, and add any attack that got through | 2 |
| T1118-c | Paste 069 (after 067 and 068) in the Supabase SQL editor, enable pg_cron so carta_privacy_retention runs daily, then run a real export and a throwaway-account delete on production | 1 |
| T1119-b | Make the `static-analysis / semgrep` check required on `main` in GitHub branch protection so a red gate blocks merging |  |
| T1129-a | Paste `supabase/migrations/070_funnel_counts.sql` in the SQL editor; until then funnel ticks fail silently and the admin Funnel card is hidden |  |
| T1125-a | Look at Explore, Plan, Help and the press kit with data loaded at phone and desktop width; the type and radius token swap was not seen in a browser (report T1125) |  |
| T1126-d | Look at signed-in screens (saved trip page, day planner steps, admin, account) at 390 and 1440 after the dead-CSS removal |  |
| T1128-h | Look at the home header on the real film at 1280 px: its labels now carry a hairline ink shadow so they hold 4.5:1 without the film (the container could not load the film or photos) |  |
| T1137-a | Deploy plan-day, suggest-city, parse-booking and the Pages build so every model call runs through aiModels (and suggest-city gets its guard); until then the gateway is code only, see T1137 Owner steps |  |
| T1141-a | Reranker live check (E-R2): score the top 30 of the E1 questions with Workers AI `@cf/baai/bge-reranker-base` and time it from a deployed Worker; keep it only if nDCG@10 rises 0.03 on free-text questions, nothing drops on facet questions and added p95 stays under 300 ms (command in report T1141, Owner steps) |  |
| T1181-a | Verify and complete the trails reference list (data/reports/validation/trails_reference.json) where query.wikidata.org, en.wikipedia.org, www.era-ewv-ferp.org and the national portals are reachable: starts against Wikidata P625, P402 relation ids, the full LQT and Irish lists, every source link; then rerun and move the baseline in a report |  |
| T1173-f | Decide which live content_overrides rows (Content tab) should be promoted into data/overrides/ and cleared live; needs a read of the live table |  |
| T1140-a | Deploy plan-day, suggest-city, parse-booking and the Pages build with the prompt registry (prompts.js, prompt.mjs); the prompts are byte-identical, so it can ride on T1137-a's deploy |  |
| T1156-b | The `aiPage.*` text is English only; nl, de, fr, es, it fall back to English. Translate and have a native speaker check each (the page makes factual claims about a model, so no machine-only pass) |  |
| T1143-a | The master on the build box is still schema 19 with no stamps; the next `npm run data` stops at the sync guard until `pipeline/provenance.py --backfill app_data/app_data.json` has run once on it (owner step in report T1143) | 1 |
| T1139-a | Paste migration 071 (ai_model_events call rows, admin_ai_calls_weekly, 30 day prune); until then no event is stored and the panel is empty; steps in the T1139 report |  |
| T1139-b | Deploy the gateway with event logging and set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AI_EVENTS_SALT on the Pages project; rides on the T1137-a deploy |  |
| T1189-j | Owner step: confirm the EEA licence text and download URL (hosts were unreachable in the research) |  |
| T1152-a | Migration 072 (taste kind in account_things, taste_counts) is not live; until it is, taste verdicts stay on the device and taste_tick is silent (procedure: report T1152, Owner steps) |  |
| T1160-b | Write the SLO collector that fetches uptime runs, Sentry and function stats, `ai_model_events` and the freshness report into `src/admin/sloSnapshot.json`; needs the owner's keys |  |
| T1162-a | Delete the stale continent-app/.git on the laptop (no remote, master at T915); ship.mjs and worktree.mjs warn while it exists (procedure: report T1162, Owner steps) |  |
| T1162-c | Ship the next deploy with node scripts/ship.mjs (dry run first, then --live, --from after a fix) and report any step that differs on the laptop |  |
| T1164-a | Run the ZAP baseline against the real preview deploy (Actions, zap, job preview) after each preview deploy and record the result; only the local fast-build preview was scanned so far (0 High) |  |
| T1164-b | Live auth probes of the deployed Edge Functions (no token, expired, forged, anon key, wrong-signature stripe-webhook); the CI tests run the real handlers with stubs, the deployed gateway and Supabase Auth were never probed (also closes T1079-f) |  |
| T1161-e | Decide whether the trailslab worker promotes approved trips (CARTA_TRAILSLAB_PROMOTE=1), after one worker run with --no-install has passed | 5 |
| T1168-c | `ask_docs.mjs --model` (Workers AI via the gateway) never run live; needs CF credentials |  |
| T1176-a | Confirm where `id`, `name` and rounded `lat`/`lon` of gem places come from (GeoNames match or OpenStreetMap, which is ODbL) before the dataset goes public; if any is OSM only, drop it for those rows |  |
| T1176-b | Run the export on the box against the live wire, read the output and the datasheet, create the public GitHub repo and upload `scripts/open_data/out/` plus README and DATASHEET |  |
| T1193-a | Owner step: verify the EuroVelo seed list (route names, total km, country lists were written from memory; hosts unreachable) and set verified=yes; checks stay soft until then |  |
| T1193-b | Owner step: add official km per country (`eurovelo_countries.csv`) so the length fact and MdAPE have data |  |
| T1194-a | Climate normals CSV (DWD CLIMAT) not exported; climate layer has no real run, baseline or gap review |  |
| T1194-c | Eurostat tour_occ_nim export missing; crowds layer has no real run |  |
| T1174-b | The monthly `blog_pr` routine is a dry run until the owner sets `CARTA_BLOG_PR=1` on the box and the box has a git push credential for `blog-drafts-*` branches; see the owner steps in the report |  |
| T1196-a | Native review of the drafted strings should start from the back-translation result: 11 strings fail (9 entries in docs/i18n/review.md "Fix these first") and about 15 are borderline; the 99.7% that holds is an upper bound from a lenient, uncalibrated judge |  |
| T1197-b | Wikimedia's User-Agent and robot policy were read from secondary sources only; confirm the 0.5 s pace and the user agent in pipeline/config/link_health.yaml |  |
| T1199-a | Check the entry rules table in pipeline/entry_rules.py against the live official pages (travel-europe.europa.eu EES and ETIAS, Your Europe, EUR-Lex 2018/1806, GOV.UK ETA and entry requirements), which this session could not open, then move RULES_CHECKED to that day (owner steps in report T1199) |  |
| T1204-a | Check the footprint factors in pricing.json `footprint.factors` against the DESNZ workbook (the container could not open gov.uk; values came from secondary mirrors, coach 28 vs 39 and the petrol car row unconfirmed) |  |
| T1203-b | D21: look at the Access card in Practical on real tagged places at phone and desktop width; the card was only checked on fixtures |  |
| T1205-a | Migration 073 (price alerts, double opt-in, RLS) is written and harness-tested on a local Postgres but not pasted; see report T1205, Owner steps | 1 |
| T1205-c | Price alerts are behind two flags that are off (VITE_PRICE_ALERTS, PRICE_ALERTS_ENABLED); turn them on after a test with the owner's own account | 3 |
| T1206-e | Run the live red team (redteam_live.mjs) with the suggest-city and pipeline attacks T1206 added |  |
| T1208-g | The nl, de, fr, es and it `why.place.*` strings (14 each) were written by a session; a native read is needed (report T1208, Owner steps) |  |
| T1211-b | Before the next deploy of parse-booking, confirm the Supabase Edge runtime allows Deno.resolveDns (one link import on the preview project); without it the new check fails closed and every URL import answers url_unreachable |  |
| T1215-b | Migration 074 (ai_reports, the in-app Report button) is not live; until it is, Report falls back to the mail link (procedure: report T1215, Owner steps) |  |
| T1215-d | The taxonomy labels of 165 nodes and the de, fr, es, it, nl synonyms of 168 nodes were translated by the session (pipeline/taxonomy/carta_taxonomy.yaml 1.1.0, label_source says so); the owner checks the Dutch and a native speaker the others (Owner steps) |  |
| T1212-a | Every language page (40,350) is noindex because its strings are machine-drafted; a native review of scripts/prerender/strings.mjs and the prerender.* catalogue keys, then REVIEWED in scripts/prerender/langs.mjs, indexes them |  |
| T1212-d | Upload the prerender with the language pages (about 490 MB more in R2) and deploy the new routes, then check /nl/ on the preview |  |
