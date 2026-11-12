# Owner steps not yet grouped into a procedure

Owner-only rows from the old register (`the retired register`, retired 2026-11-11) that no procedure file covered. Each row is one action only the owner can take. Move a row into the right procedure file when you group it, and delete it here when it is done. The ID names the old task; its report is found through `.work/INDEX.md`.

Owner sweep 2026-11-12 (unsorted lane, report `.work/2026-11-12-owner-unsorted/report.md`): 28 rows were closed or decided and removed; T1118-b and T1190-h are decided and keep only their human part. Every other row left here is handed to the lane that owns its system. Each row has a target file (`move_to` in that run's `ledger.json`); the orchestrator moves them after the merge, which empties this file.

| ID | Item | Order |
|---|---|---|
| T221-a | The prerendered pages are built but not live: create the carta-prerender bucket, build with VITE_PATH_URLS=1 (T223-c), build and verify the pages (with --cards for the share cards, about two hours), push data then pages, deploy preview then production and check with curl, then prune; exact commands in report T221, Owner procedure | after the T221 merge |
| T222-c | The sitemap URLs are absolute https://www.carta-europetravel.com/ and the Function serves /sitemap.xml and /sitemap-*.xml from the carta-prerender bucket; after T221-a, curl -sI https://www.carta-europetravel.com/sitemap.xml must show 200 and application/xml (the placeholder answers if the bucket holds no index), then submit it in Search Console (T205-f) | after T221-a |
| T222-d | The page floor needs a licensed image and no trail or cycling route has one on the wire (3,554 of 17,619 rated trails have a photo URL with no licence, 0 of 506 rated cycling routes have an image), so all 17,619 trail pages and 501 cycling pages are written noindex and none is in the sitemap; decide before the T221-a upload whether to resolve photo licences into the wire (pipeline task) or to waive the image criterion for route kinds, then rebuild; the first option keeps SEO.md as written, the second needs an edit to it and to floor.mjs | before T221-a |
| T222-f | Once the Search Console property exists (T205-f), write the date the first prerendered pages show as indexed into the T239 sheet, and the date the sitemap was first submitted, so T220-e can set a later launch lead from evidence | after T205-f and T221-a |
| T224-a | The cost pages (/spain/malaga/cost) and trip-length pages (/spain/4-days, /spain/4-days/under-80) and sitemap-costs-en.xml go live with the T221-a procedure unchanged; after the deploy, curl -sI on /spain/malaga/cost and /spain/4-days must show 200 and x-carta-prerender | after T221-a |
| T152-a | 236 of the 253 catalogue trips are over a word cap (41 summaries, 943 day blocks, 334 pro tips); bringing them within needs a model rewrite of the prose, which is a paid Gemini run and stage 3 of _OPEN-MASTER.md is not done, so the done condition "every trip within the caps" holds for generated trips only | LAST (paid, see docs/owner/paid-runs.md); after stage 3 |
| T333-b | Legal review (owner step J4) of the OpenStreetMap tick wording 'OpenStreetMap may use this track under its contributor terms' against the OSMF waiver template, and of the Terms section 'Photos and tracks you share' (the indemnity asked of a consumer, irrevocable next to removal on request); a changed wording bumps OSM_TICK_VERSION or UPLOAD_TERMS_VERSION in src/community/uploads.js | before T333-a goes live |
| T431-a | Owner audit of the sample hostel week ba-hostel-sarajevo-mostar-kotor (prices, buses, beds, opening details); then drop `sample` so it enters the sitemap |  |
| T530-b | Licence posture: Booking.com and Hostelworld terms restrict commercial scraping (owner states permission, 2026-10-21) and Xotelo publishes no terms; only medians are published; keep the permission on file or drop the scrape |  |
| T643-a | The B4 verdict (Hostelworld privates are per person, doubled into a room) rests on one signal, private / dorm 1.14, because the list ignores the guest count; check one hostel's booking page by hand before the first publish (scripts/hw_unit_sample.py, cache/stays/hw_unit_sample.md) | 1 |
| T645-a | The first real publish after F0: build from the R2 state on Actions (the laptop's journal.sqlite has 1,327 Xotelo rows and fails the gate with 6,832 lines), then review cache/stays/gate_report.md and list right moves in pipeline/stays/gate_explain.json before apply_stays | 2 |
| T714-b | No place has a local transport fare (0 of 3,868): choose a fare source (operator fare pages, a licensed dataset) and write the pipeline layer for local_transport.fare on the box; the engine prices it as soon as it exists |  |
| T738-a | Five stale branches are not merged: p0-next-steps-docs (deletes live docs such as _OPEN-MASTER.md and the P2/P3/P9 procedures), explore-v4 and three claude/* cloud branches of 2026-09-04 (superseded); delete them, or name what to keep |  |
| T1046-a | Pause the hourly CartaStaysBooking and CartaStaysHostelworld tasks (0 prices every hour since Oct 30), remove CartaFlightsAll and CartaFlightsNow, drop VITE_E2E_SEAMS=1 from continent-app/.env (ROADMAP N1) | 1 |
| T1071-d | The admin MFA gate and the trail page upload door were not seen in the browser (both need a signed-in account); look at them at 375 and 1440 and run scripts/verify_admin_panel.mjs after T1071-a | after T1071-a |
| T1075-b | Local transport fare table for 741 places: choose the fare source (T714-b), then write the layer; D10 fare half not built |  |
| T1075-d | Decide one rule for not-yet slots on the destination page: the 2026-10-30 rule hides them, D10 asks to show them; the price card now shows a Local transport Not yet measured row |  |
| T1076-b | Only 337 of 3,868 places clear the quality bar (research expected about 1,800; 3,224 without the 120 word intro test); decide the threshold before the next prerender upload, or lift intros through D9 | 1 |
| T1076-f | After the next prerender upload confirm a thin place and a trail send noindex,follow in the head and the x-robots-tag header, and that sitemap-destinations holds the expected count | after T1076-b |
| T1080-a | Enable Dependabot alerts and security updates, and set the Actions default token to read-only, in GitHub repository settings |  |
| T1084-b | After the live ship that carries the T1071 MFA step-up: open /admin signed in as the owner, pass the TOTP step and see the panels load instead of mfa_required (closes with T1071-d). | |
| T1086-a | Dry-run the backup and restore runbook on the owner's laptop: take one hand dump, restore it with ops/restore_supabase.sh, and stream-check the newest supabase dump in R2; nothing in it has been run against a live service |  |
| T1086-c | Re-verify the Stripe, Supabase Admin and Cloudflare dashboard steps in docs/runbooks/refund.md and incident.md sections 4 and 5 (only repo objects were checked); also settle whether year-plan renewals need their own refund rows and a refund column on pass_grants |  |
| T1087-b | Make admin-harnesses, admin-rpc-security and rls-policies required status checks on main, so a red harness blocks a merge (GitHub settings, owner only) |  |
| T1087-c | Run the SECURITY DEFINER search_path query from report T1087 in the live SQL editor once 064 is pasted, to confirm live matches the harness (120 pinned, 0 unsafe) |  |
| T1090-a | Check the strict style-src (no 'unsafe-inline') on the preview deploy: header, console clean on the main screens, a prerendered page and the print view styled, in Chrome and iPhone Safari; re-upload the prerender if its pages lack the current STYLE (steps in the T1090 report) |  |
| T1092-a | Rebuild the trails wire on the box (trails_attributes, then trails_rate which exports; difficulty_gate must pass) and push the data, so the per-day difficulty, f.d, wire_name and src_name reach travellers; steps in report T1092 |  |
| T1092-b | After T1092-a, look at the Trails card and trail page on a phone and at desktop width (Veluwe Zwerfpad reads Long, an E-path stage shows Also called); the cloud container could not load app data |  |
| T1088-a | Watch the first GitHub run of supply-chain.yml now that pip-audit, OSV-Scanner and npm audit are gates (OSV and api.osv.dev were unreachable from the build container); fix a failing step or its lockfile args. Continues T1080-c |  |
| T1093-a | Run the trail photo harvest on the trails lab box (DE, IT, GB, FR worst first), then rebuild the trails wire so every card photo carries lic, by, licUrl and page; the container cannot reach Commons or the lab (procedure: report T1093, Owner steps) | after T1092-a |
| T1093-b | After T1093-a, read the photo coverage per country from the rebuilt wire (before: DE 4.3, GB 11.8, IT 9.9, FR 16.1 percent), run `node scripts/ci/check-contract.mjs` (it must say the photographs carry an allowed licence and a name) and look at one credited trail page on a phone | after T1093-a |
| T1095-a | Run the real intro harvest (needs Wikipedia and Wikivoyage, not reachable from the cloud box): `python pipeline/dossier/harvest_place_intros.py`, then read the report and spot-check rejected rows | 1 |
| T1095-b | After T1095-a, rebuild the dossiers (`python pipeline/dossier/build_dossier.py --all`, or the dossier task) and run the prerender to count places that now clear the 120-word bar | 2 |
| T1098-a | Prepare cache/uk_crowds_nights.csv (geo,name,year,month,nights) from the ONS / VisitBritain regional monthly nights tables (ITL1) and the national offices for BA, FO, MD, XK; none can be downloaded from the cloud box | 1 |
| T1098-b | Download ONS ITL1 boundaries (Open Geography Portal, OGL v3) to cache/uk_itl1_boundaries.geojson | 2 |
| T1098-c | Run `python run_pipeline.py --only crowding_uk` after `crowding`, then count GB places with crowding.monthly (before: about 2 of 526) and check 5 places in the app | 3 |
| T1100-a | Run the D13 50-pair way-there check on the real flight sweep (`node scripts/way_choice_pairs.mjs --flights-dir <dir>` from continent-app/ with BRU, AMS, CDG, MUC, MAD sweep files) and attach the table to the report; the container could only use fixture fares; steps in report T1100 |  |
| T1100-b | Decide or confirm the way.choice values in config/pricing.json (fly 700 km, EUR 15 an hour of door-to-door travel, 3 h airport overhead); they are estimates, not measured |  |
| T1100-c | Look at the place page trip card on a real phone with a fare in the sweep (Bergen and Taormina from Brussels open on the plane; Annecy without a fare opens on the car with the why caption) |  |
| T1101-a | Add the live failing query ("quiet lake with good walks in June under 120 a day") to the Ask live golden set and run `scripts/ask-eval-live.mjs` against the deployed Function; the container has no Workers AI |  |
| T1101-b | After the next deploy, ask five questions on a phone and desktop width and check the written line names only places on the first three cards |  |
| T1094-a | Rebuild the trails on the box with the T1094 recovery rules (registry re-harvest, derive all countries, reorder splice, curate to export, then coverage, recover_walks and the famous check) and send the counts; nothing was recovered in the container (procedure: report T1094, Owner steps) |  |
| T1096-a | Run the gallery pass on the owner box (Commons not reachable from the cloud box): `python pipeline/photos/place_gallery.py`, then rebuild dossiers; about 1,130 places, 20 to 25 minutes |  |
| T1096-b | Run the POI description harvest on the owner box (needs Wikipedia and the LFS master `app_data/app_data.json`): `python pipeline/poi_descriptions.py --report`, run, `--report` again, then `apply` |  |
| T1096-c | After T1096-a, count gallery coverage with `place_gallery.py --report` and rebuild the dossiers (`python pipeline/dossier/build_dossier.py --all`); look at one GB, RO, FR and IT place gallery at phone and desktop width |  |
| T1097-a | Run the sea_temp harvest on the box (about 6 h of ERDDAP calls), then the climate and beach exports, so beaches carry `sea_temp` and destinations `water_c` (command and checks in report T1097, Owner steps) |  |
| T1097-b | Check one real beach page on a phone after the box run and deploy: the strip shows and the warmest months are plausible for the sea |  |
| T1102-b | Look at the rail tile and the trail page on a real phone with photographs loaded (this container had no network, so images were blank) |  |
| T1103-c | The trip-kind sheet now shows only while a trip is under way, so "I'm on a trip now" and "Add a past trip" are mostly reached from My trips; owner decides whether Plan home needs a quiet link (report T1103) |  |
| T1103-e | Real-person usability test of the 5-screen plan flow with one first-time traveller on a phone (report T1103) |  |
| T1103-f | Confirm BROAD_TYPES (city, culture, food), the ranking the finder uses while "What are you up for" is unasked (lib/recommend/candidates.js) |  |
| T1104-a | Paste supabase/migrations/065_account_things.sql (after 064) and run scripts/verify_live_policies.mjs; until then account sync of kept trips, bookmarks, trips in progress and the device trip stays off (see report T1104, owner steps) | 1 |
| T1104-b | The real two-device check of account sync (keep and bookmark signed out on a phone, sign in, see them on a laptop, remove on one and see it go on the other, switch account on the phone), after T1104-a and a deploy | after T1104-a |
| T1106-a | Run the seeded-error browser spec and look at `?seedError=explore` in `npm run dev` with real app data (the cloud container has none) |  |
| T1099-a | Refresh the stale wires on the box (app_data 151 days, destinfo 71, trails 53, trips 52, region 50, coverage, joins, reach) so each is inside its cadence |  |
| T1099-d | Decide the cadence per wire; 35/45/90 days in `WIRES` are placeholders |  |
| T1108-a | Give the dedicated support address (and set up the mailbox with SPF, DKIM, DMARC): `SUPPORT_EMAIL` in `continent-app/src/lib/contact.js` is a placeholder equal to the general address |  |
| T1108-b | Review the Dutch support strings (`support.*`, `footer.support` in nl.js); the Dutch is a draft, and de, es, fr, it fall back to English |  |
| T1109-a | Number and paste `supabase/migrations/067_channel_counts.sql` (rename it and add a `_down` file); until then channel ticks fail silently and the admin card is hidden |  |
| T1110-a | Paste `supabase/migrations/066_waitlist.sql` in the Supabase SQL editor after 065 and look for "waitlist self-check passed" | 1 |
| T1110-b | Set the secrets `RESEND_API_KEY`, `WAITLIST_FROM`, `WAITLIST_SECRET`, verify the sending domain in Resend, deploy `waitlist` with `--no-verify-jwt` | 2 |
| T1110-c | Sign up with a real address on a preview, confirm from the mail, unsubscribe from the mail, and look at the form on a phone and a desktop | 3 |
| T1110-d | The privacy policy and docs/legal/ARTICLE30.md must name the waitlist (purpose, legal basis consent, retention, processor Resend) before the form goes live; owner/legal call |  |
| T1111-a | Approve the design direction `docs/design/direction.md` or say what to change, including its three open decisions (plan tab follows the place trip card, count-up only on home, 28 px radius on the app cost card); G3 (T1122) and G5 (T1124) wait on it (report T1111) | 1 |
| T1111-c | Run G-R1 to G-R3 (benchmark, premium feel, user struggles); the direction was written without them and is revised where they disagree (report T1111) |  |
| T1112-a | Run the Aviasales coverage probe with the owner token and the sweep export; steps in the report (D14) |  |
| T1089-f | Harnesses that SKIP here (needs account, dist, network or real data: account_panel, continue_trip, data_export, status_banner, viewport_catalogue, omio_ui, joins, google_flights, day_routes, plan_mocks U) have not run for real; run them on the owner's box with Supabase, a fast build and the full dataset |  |
| T1107-c | After the first monthly and the first quarterly box run, read `r2:carta/status/last_run.json` and `freshness_wires.json` (tier, exit 0, fewer than 8 wires over cadence) and the quarterly run's duration against its 120 h timeout; trails and cycling chains carry no est_h | 3 |
| T1113-a | Upload the new prerender; warning: indexed places drop from 3,754 to 337 (owner decision 1) and thin beaches, lakes, mountains and duplicate trips leave the sitemap |  |
| T1113-d | After the upload confirm trip canonicals and thin-page noindex,follow in Search Console and view source (follows T1076-f) | after T1113-a |
| T1114-a | Look at the price notes (Explore card grid and rail, Ask card, trip page cost card, day receipt) at 375 and 1440 wide and in Dutch; the container could not load app data |  |
| T1117-a | The AI guard (plan-day, parse-booking, /api/ask/answer) is code only: deploy both Edge Functions and the Pages build so travellers get it | 1 |
| T1117-b | The 50-attack set runs on stubbed model outputs; run `continent-app/scripts/ai/redteam_live.mjs` against a preview with a test account to record real Gemini and Workers AI outputs, and add any attack that got through | 2 |
| T1118-a | Legal review of docs/legal/ARTICLE30.md as brought current (section 2a retention lines, rows 20 to 24, Resend) and of the six-language "What we keep" and delete strings; the day counts in 069 are drafts |  |
| T1118-b | Ask the accountant to confirm the Belgian VAT record period for pass_grants (draft: 10 years after the end of the year of sale); tell a session the answer so it writes the sweep line. | |
| T1118-c | Paste 069 (after 067 and 068) in the Supabase SQL editor, enable pg_cron so carta_privacy_retention runs daily, then run a real export and a throwaway-account delete on production | 1 |
| T1118-d | Read and accept Resend's DPA, record its version and transfer basis in ARTICLE30.md section 3 |  |
| T1119-b | Make the `static-analysis / semgrep` check required on `main` in GitHub branch protection so a red gate blocks merging |  |
| T1120-a | Create the Sentry EU (or GlitchTip) project, turn on "Prevent storing of IP addresses", sign the DPA, copy the DSN (report T1120) |  |
| T1120-b | Add the exact ingest host to connect-src in public/_headers, set VITE_ERROR_DSN and the SENTRY_DSN Pages secret, redeploy |  |
| T1120-c | Throw one probe error on the preview, confirm one scrubbed event, then test the VITE_ERROR_TRACKING=off kill switch |  |
| T1105-a | Self-hosted first paint is built but ships not live: derive the `dest` and `dossier` layers to R2, then re-run `pipeline/photos/hero_ladder.py --manifests` so `continent-app/src/lib/heroLadder.json` says live; see the T1105 report's owner steps | 1 |
| T1105-b | After going live, look on a real phone at Explore rails and a destination page: sharpness at the new `STORY_SIZES` 64vw, AVIF served from cdn.carta-europetravel.com, credits under the gallery | 2 |
| T1115-a | Decide the local transport fare source (curated operator pages vs licensed dataset); comparison in reports/local_fares_source_options.md, decision 4 is "Not now" |  |
| T1129-a | Paste `supabase/migrations/070_funnel_counts.sql` in the SQL editor; until then funnel ticks fail silently and the admin Funnel card is hidden |  |
| T1129-b | Look at the admin Overview Funnel card on a real project after the paste, and hit each step once |  |
| T1130-a | Review the K5 drafts (`docs/brand/data-stories/europe-week-2027.nl.md`, `.en.md`), pick the headline, add a quote and the release date, and decide where they go (press list K10, blog) |  |
| T1130-b | The basket has no way there: the flight sweep lives on R2, not in the shipped catalogue; export the sweep fares from BRU and AMS to a local file so a next task can add "getting there" to the script |  |
| T1130-c | Confirm that publishing aggregated Booking.com scrape prices in a press story is fine under the source terms and the licence ledger (T1021-e still credits other sources) | 1 |
| T1130-d | Decide whether Walloon press gets a French version (ROADMAP K5 names Flemish and Walloon press; owner decision 6 says Dutch and English) |  |
| T1130-f | Rerun `node scripts/stories/basket_per_country.mjs` after the next stays build and before release (Sunshine Saturday, 2 Jan 2027); if `--check` fails, update every figure in both drafts | 2 |
| T1131-a | Write the founder line in `PRESS_FOUNDER_LINE` (`continent-app/src/lib/press.js`); the press kit shows a visible placeholder until then |  |
| T1131-b | Fill the journalist list: names and public editorial addresses per `docs/marketing/journalist-list.md`, grow it to about 40 rows (UK outlets later) and keep the filled copy out of the repo |  |
| T1131-c | Review the Dutch press strings (`press.*`, `support.pressLink` in nl.js); de, es, fr, it fall back to English. Replace the screenshot slot (`PRESS_SCREENSHOT`, today the site OG image) with a real product screenshot |  |
| T1127-a | Trail photos: 2,886 walks (16%) still show the route glyph and 14,065 have no photo of their own; run the Commons trail-photo harvest (`pipeline/trails/trail_images.py`, wider radius and Wikipedia article images) |  |
| T1127-b | 27 gem destinations (Sadali, Estaing, Sudbury and others) have no licensed hero; harvest Commons geosearch for them, then re-run `hero_ladder.py` |  |
| T1125-a | Look at Explore, Plan, Help and the press kit with data loaded at phone and desktop width; the type and radius token swap was not seen in a browser (report T1125) |  |
| T1134-b | Run `scripts/quality/scorecard.py --write` on the box after the next full run and `npm run data`, and push the card with the data; the first card is from the shipped wires only (report T1134) |  |
| T1134-g | Decide which fields count per quality layer (`APP_LAYERS`, `SHARD_LAYERS`); tags 2%, wikidata 1% and transfer 3% may be optional by design (report T1134) |  |
| T1123-b | G4's scope should come from the G-R3 interviews and unmoderated test, which have not run; T1123 worked from the audit and the T1103 usability note (report T1123) |  |
| T1123-d | Look on a real phone at the reload fixes: reload on a setup question and on the priced trips, then Back to the trip home and "See your priced trips" (report T1123) |  |
| T1126-d | Look at signed-in screens (saved trip page, day planner steps, admin, account) at 390 and 1440 after the dead-CSS removal |  |
| T1124-b | G5 richer motion (springs, shared-element photo move, INP before and after) stays gated on the owner approving the T1111 direction |  |
| T1124-c | Look at the app with system reduced motion on, on a real phone (sheets, tabs, map camera, home film) |  |
| T1122-a | Approve the T1111 direction (row T1111-a), then flip `COST_CARD_UMBER` to true in continent-app/src/planner/trip/costCardVariant.js; compare first with `?cc=umber` vs `?cc=arc` on a trip page (report T1122) | 2 |
| T1122-c | Look at the umber variant on a real phone (iOS Safari, Android Chrome) with the dark system setting and reduced motion on (report T1122) |  |
| T1116-a | Owner picks the register option (a 1,157 rows, b 1,437, c 877, d 1,717 of 1,717; none gets under 250) and whether the 250 target stays; A3 waits (report T1116) |  |
| T1128-a | Screen-reader pass on a real phone (VoiceOver on iPhone, TalkBack on Android) over Home, Explore list and map, a place, trail and beach page, the Plan wizard, the trip page and Account; axe cannot judge what is heard (carries T190-f) |  |
| T1128-b | The home film and the home tour move by themselves with no pause control, which WCAG 2.2.2 (Level A) does not allow for motion over 5 s; decide on a small pause control or stopping after 5 s (carries T620-a, T956-a) |  |
| T1128-d | The wizard's country picker map is pointer only; the card grid beside it is the keyboard path; decide whether the map needs its own keyboard layer (carries T190-d) |  |
| T1128-h | Look at the home header on the real film at 1280 px: its labels now carry a hairline ink shadow so they hold 4.5:1 without the film (the container could not load the film or photos) |  |
| T1135-f | CAX41 CPU speed is inferred from Ampere A1 figures; run llama-bench with Qwen3-30B-A3B Q4_K_M on the box before moving batch jobs |  |
| T1135-h | Ask's free Workers AI Neurons cover about 560 answers a day (about 2,800 MAU); past that switch on the Workers paid plan or Ask answers with facts only |  |
| T1135-i | At about 10,000 MAU grounded searches pass 80 percent of Gemini's free 5,000 a month; review the grounded allowance per tier in plan_tiers against USD 14 per 1,000 searches |  |
| T1136-a | The Ask eval gate scores dense and hybrid only where public/search/ask/ is built (not in git, not in CI); run `node scripts/eval/ask-eval.mjs --bless` in the main checkout with the index built and commit the baseline, or the gate never guards the dense half |  |
| T1136-g | The 142 place labels were written by one session from general knowledge of Europe and checked only against the catalogue's ids; an owner read of scripts/eval/ask-set.json (places per question) would make the recall numbers more trustworthy |  |
| T1142-c | Confirm the must_see and must_have split and the floors in scripts/quality/rules.yaml (carries T1134-g: tags, wikidata, transfer must_have at floor 0) |  |
| T1142-d | The Data health panel imports its snapshot at build time and the box's reset restores the committed one; decide a run-time path for panel.json (R2 status/ or a box commit) and fetch it |  |
| T1145-e | Review the D6 expectation blend (population 0.25, area 0.25, nights 0.5) and gap thresholds before D15 adds places on them; six country gaps are not robust to the blend | 0 |
| T1179-e | After the trails rebuild (T1092-a, T1094-a) rerun `python pipeline/trails/summaries.py` and commit the output: the top band, names and grades move with the rebuild, and test_trail_summaries.py fails on a stale file | 1 |
| T1180-a | Re-rate the trails on the box with the lab up so the relief fix reaches the wire: `python run_pipeline.py --only trails_rate`, then `--only rating_v5_profile`, then `python pipeline/nature_tiers.py --check` (wire matches frozen True; never `--recalibrate`); about 265 of the 503 downhill walks move up a band (report T1180) | 1 |
| T1180-b | After T1180-a about 37 walks enter the top band T1179 summarised, so rerun `python pipeline/trails/summaries.py` and its test and commit the output (with T1179-e); not rerun now because summaries read the wire, which only moves after the re-rate | 2 |
| T1148-a | Hand-label the 40 plans of `continent-app/scripts/eval/plan-day/labels.json` (pass or fail each, without opening sample-key.json), then run `run.mjs plan-day --write --dashboard`: until then the plan-day judge has no kappa against a human and may not gate ([report](P15/T1148-eval-platform.md)) | 1 |
| T1148-b | Install the prepared Langfuse stack on the build box (`continent-app/scripts/eval/langfuse/README.md`): compare with the official compose file, pin digests, fill `.env`, tunnel only; the E4 tracing work starts after it | 2 |
| T1148-e | Run the Gemini judge (`node scripts/eval/plan-day/judge.mjs --backend gemini`, a model outside plan-day's chain) on the pipeline key; the key is not in the cloud container, so only the session judge has verdicts | 3 |
| T1137-a | Deploy plan-day, suggest-city, parse-booking and the Pages build so every model call runs through aiModels (and suggest-city gets its guard); until then the gateway is code only, see T1137 Owner steps |  |
| T1141-a | Reranker live check (E-R2): score the top 30 of the E1 questions with Workers AI `@cf/baai/bge-reranker-base` and time it from a deployed Worker; keep it only if nDCG@10 rises 0.03 on free-text questions, nothing drops on facet questions and added p95 stays under 300 ms (command in report T1141, Owner steps) |  |
| T1141-b | Rebuild the Ask index on the box (`python run_pipeline.py ask_index`) so bm25.json stores the country code and bm25-beach/lake/peak.json exist, check bm25.json stays under the 400 KB gzip budget (about 13 KB more), then run the eval with sparse, dense and hybrid and bless (with T1136-a) |  |
| T1141-g | The highlight source gave 0 passages from this checkout's dossiers (no `fact` on highlights), so BM25 over highlights could not be measured; check on the box after T1141-b |  |
| T1149-a | Review the taxonomy v1 node list and the 20 "not a concept" decisions in pipeline/taxonomy/mapping.yaml before labelling, so the labels are made against an agreed vocabulary (docs/ai/taxonomy.md) | 1 |
| T1149-b | Hand-label the 400 rows of continent-app/scripts/eval/taxonomy/gold.csv per docs/ai/taxonomy-labelling-guide.md, then run the taxonomy eval with --write --dashboard; until then the eval scores a 15-item seed set labelled by the session, which proves it runs and says nothing about quality | 2 |
| T1181-a | Verify and complete the trails reference list (data/reports/validation/trails_reference.json) where query.wikidata.org, en.wikipedia.org, www.era-ewv-ferp.org and the national portals are reachable: starts against Wikidata P625, P402 relation ids, the full LQT and Irish lists, every source link; then rerun and move the baseline in a report |  |
| T1181-b | 33 reference trails miss for broken OSM geometry (failed_continuity), led by the Moselsteig, Offa's Dyke Path and 10 Irish National Waymarked Trails; repair them in T1183 and T1184 and rerun scripts/validation/trails_external.py |  |
| T1181-e | Decide whether the v5 shape term (0 for one-way) and per-km scenery should hold long certified trails below the top band (Lechweg LQT 7.5, Peddars Way 7.0, Thames Path 7.7) |  |
| T1181-i | Run trails_registry and coverage_report on the box so the 34 new famous_registry seeds (SEEDS_T1181) resolve, then rerun the trails external check |  |
| T1173-f | Decide which live content_overrides rows (Content tab) should be promoted into data/overrides/ and cleared live; needs a read of the live table |  |
| T1173-g | The Overrides tab reads a build-time snapshot; on the box the weekly git reset puts the committed snapshot back before each build (same as T1142-d), so outcomes from the box run are not shown until the snapshot is fetched at run time; the owner's T1142-d decision (R2 status/ or a box commit) settles both (T1214) |  |
| T1140-a | Deploy plan-day, suggest-city, parse-booking and the Pages build with the prompt registry (prompts.js, prompt.mjs); the prompts are byte-identical, so it can ride on T1137-a's deploy |  |
| T1167-a | Create the private Cloudflare Pages project `carta-docs` behind Cloudflare Access and deploy the built site (`.docs-site`) to it; the decision on site visibility is T1045-i |  |
| T1187-h | Run the first trails validation on the box after the next trails export and commit data/reports/validation/ (owner steps in report T1187) |  |
| T1156-a | Owner: a lawyer reads the public AI page and the EU AI Act sections of the model cards (the Article 50 reading, "not high-risk", provider versus deployer duties) before launch sign-off J1 |  |
| T1156-b | The `aiPage.*` text is English only; nl, de, fr, es, it fall back to English. Translate and have a native speaker check each (the page makes factual claims about a model, so no machine-only pass) |  |
| T1156-f | Owner: the privacy policy (PrivacyPolicy.jsx) names Google's Gemini but not Ask Carta's processing by Cloudflare Workers AI (question and up to 14 notes, cached 7 days in KV); add it, with the EU or non-EU processing answer from T1135-a |  |
| T1143-a | The master on the build box is still schema 19 with no stamps; the next `npm run data` stops at the sync guard until `pipeline/provenance.py --backfill app_data/app_data.json` has run once on it (owner step in report T1143) | 1 |
| T1143-g | sources.yaml uses LicenseRef ids for UNESCO, Numbeo, the stays scrape, Commons (per file) and US Gov data, and the ledger marks some of them "verify"; confirm each against the ledger row before the licences are shown to travellers |  |
| T1138-a | Box CPU runs: llama-bench Qwen3-30B-A3B Q4_K_M on the CAX41 (replaces the inferred speeds in ai_models.json box_cpu, with T1135-f) and each batch job's eval on the box; a job that passes goes into BOX_PASSED and box_passed in one commit | 1 |
| T1138-e | Ask quality for Gemini Flash-Lite and OVHcloud Mistral Small 3.2 is an owner run (ask-eval-live.mjs needs wrangler pages dev and a key); also rerun Qwen3, whose 88.7 percent is from T563 on 2026-10-22 |  |
| T1146-a | Review the D15 add list per country in docs/data/catalogue-gaps/ (142 adds, 440 stretch below the 0.40 floor, 3 merge reviews); D15 part 2 applies only what is approved | 1 |
| T1146-e | cache/place_signals.json measures Wikipedia attention for 4,083 of 90,393 candidates; run harvest_place_signals.py with a wider --undesignated-top on the box, rebuild candidates and rerun catalogue_gaps.py |  |
| T1139-a | Paste migration 071 (ai_model_events call rows, admin_ai_calls_weekly, 30 day prune); until then no event is stored and the panel is empty; steps in the T1139 report |  |
| T1139-b | Deploy the gateway with event logging and set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AI_EVENTS_SALT on the Pages project; rides on the T1137-a deploy |  |
| T1139-c | Optional: switch on the Langfuse export (AI_TRACE_LANGFUSE=on plus three keys) after T1148-b; the ingestion body is unverified against Langfuse's docs |  |
| T1144-a | The truth set sheet (evals/truth/sheet.csv, 762 rows) is not verified by hand: the score rests on 90 seeded rows that share the data's own sources; verify the rows (evals/truth/GUIDE.md) and move the baseline | 1 |
| T1144-b | The text judge has no kappa against a human: label the 50 texts in evals/truth/judge/labels.json, then read the kappa in the truth eval | 2 |
| T1144-c | Run the truth text judge once on Gemini through the gateway (judge.mjs --backend gemini) to compare it with the blind session judge | 3 |
| T1183-a | Run the routed continuity repair (route_bridge.py) on the box per country with BRouter tiles staged, compare against the expected counts in the report, then curate, coverage and trails_external; see report T1183 | 1 |
| T1183-d | Relations with parts out of order AND a real break are refused as gap_too_long since route_bridge keeps relation order; a reorder-then-route pass needs an owner rule on what keeping the order allows |  |
| T1189-d | 76 matched beaches print a class that differs from the register because several register sites lie on one beach; decide whether the page shows the worst reading or each site |  |
| T1189-h | Owner step: refresh the EEA register on the box and rerun beaches (`report T1189`) |  |
| T1189-i | Owner step: export the Wikidata Blue Flag list to CSV and run beaches_blueflag (FEE's own list must not be scraped) |  |
| T1189-j | Owner step: confirm the EEA licence text and download URL (hosts were unreachable in the research) |  |
| T1150-a | The tagger's verifier (Gateway feature tagging, Gemini) has never run: run it on the 400 gold items, score it against the lexical run, and only then on the full corpus; the container has no key | 1 |
| T1150-b | The bi-encoder list (--dense, bge-small-en-v1.5 through fastembed) needs a model download the container cannot make; on the box install fastembed, run --items gold with and without --dense and keep it only if R-precision at 5 or recall at 10 rises | 2 |
| T1184-a | The trek records are built in code and fixtures only; the trails export (end of trails_rate, or the trails publish task) must run where the lab is to put `treks[]` and `trek{}` on the wire, then the counts be checked against the T1184 expected numbers (procedure: report T1184, Owner steps) | after T1183-a if both run in one session |
| T1152-a | Migration 072 (taste kind in account_things, taste_counts) is not live; until it is, taste verdicts stay on the device and taste_tick is silent (procedure: report T1152, Owner steps) |  |
| T1152-b | The taste verdict sync is proven against a stubbed account only; check it on two devices once 072 is live and deployed (report T1152, Owner steps) | after T1152-a |
| T1152-f | Legal read of the cookieless taste counter under EDPB Guidelines 2/2023 (ePrivacy 5(3) can cover a ping without cookies) together with the other counters, ARTICLE30 row 13d (report T1152, Owner steps) |  |
| T1153-a | The place linker answers the Explore search only behind ?link=1; turning it on for everyone is a product call after the owner tries it (flip the default in continent-app/src/lib/linking/flag.js) |  |
| T1153-c | The 300-mention linking set was written by the session that built the linker, so MRR 0.997 is an upper bound; label 300 real mentions from search logs, parse-booking titles and Ask, then re-bless scripts/eval/linking/baseline.json |  |
| T1157-a | Create the rate limit namespaces in Cloudflare (RL_ASK, RL_FLIGHTS, RL_STAYS, RL_FORECAST in wrangler.toml), confirm Pages accepts `[[ratelimits]]` on the first preview deploy, else add one WAF rate rule |  |
| T1158-a | Run the k6 scripts: first locally against `wrangler pages dev` (to record local p95) and then against the Pages preview (`docs/runbooks/load-tests.md`), and paste the p95 numbers in a report |  |
| T1159-a | Run the live drill: install the backup timer on the box, run it once, then `ops/restore_drill.sh --latest` on the laptop and write the total seconds in the runbook; nothing here ran against Supabase or R2 |  |
| T1185-a | Run the trails export on the box so `wb` reaches the wire (needs the lab with `transit_stops`); until then pages with no record say "we do not know" |  |
| T1154-a | The Intelligence API is not running on the box: make a key, write services/intelligence/.env, run the full tagger, start compose (owner step in the T1154 report) | 1 |
| T1186-a | Run fill_water.py on the box (EEA cache, OSM swim tag sweep, --apply) and record the water class and unknown swim counts; optionally drop national CSVs in cache/lakes/national_water/ |  |
| T1186-b | Run fill_route_up.py --harvest --apply on the box and record the routes count |  |
| T1160-b | Write the SLO collector that fetches uptime runs, Sentry and function stats, `ai_model_events` and the freshness report into `src/admin/sloSnapshot.json`; needs the owner's keys |  |
| T1160-c | Run the incident drill on the live stack and add the timings to `docs/runbooks/drill-log.md` |  |
| T1162-a | Delete the stale continent-app/.git on the laptop (no remote, master at T915); ship.mjs and worktree.mjs warn while it exists (procedure: report T1162, Owner steps) |  |
| T1162-b | Run scripts/worktree.mjs add and remove once on Windows with --link-node-modules and check the main node_modules keeps its entries; the tests proved it with a Linux symlink only |  |
| T1162-c | Ship the next deploy with node scripts/ship.mjs (dry run first, then --live, --from after a fix) and report any step that differs on the laptop |  |
| T1164-a | Run the ZAP baseline against the real preview deploy (Actions, zap, job preview) after each preview deploy and record the result; only the local fast-build preview was scanned so far (0 High) |  |
| T1164-b | Live auth probes of the deployed Edge Functions (no token, expired, forged, anon key, wrong-signature stripe-webhook); the CI tests run the real handlers with stubs, the deployed gateway and Supabase Auth were never probed (also closes T1079-f) |  |
| T1161-a | Set CARTA_BOX_ML=all on the box and check the first ask_index and guided_search runs there (RAM, minutes, golden set); neither has run on the box yet (report T1161, owner steps) | 2 |
| T1161-b | Switch on the box stays scrape for Hostelworld: R2 write on carta-stays-state for the box token, playwright install-deps, install.sh, a one-town test, then CARTA_STAYS_SCRAPE=1 before March (report T1161) | 3 |
| T1161-c | Decide where Booking scrapes (home device recommended, residential proxy the alternative) and install stays_scrape.sh there; Booking turns away the box's datacenter address (report T1161, Research) | 4 |
| T1161-e | Decide whether the trailslab worker promotes approved trips (CARTA_TRAILSLAB_PROMOTE=1), after one worker run with --no-install has passed | 5 |
| T1190-a | Owner step: check the 48-row price hand sample by hand and run prices_sample; until then no check sees absolute euros (report T1190) |  |
| T1190-b | Owner step: download prc_ppp_ind A011101 and A011102 (and 2025) and refresh reference_pli.json; beds are checked against restaurants and hotels together today |  |
| T1190-c | Owner step: enter about 20 published fare examples in fare_examples.csv, copy the sweep files to cache/flights_wire and run prices_fares; swept fares have no outside check |  |
| T1190-h | Contact Numbeo for a data licence covering the cost anchors (cache/costs.json, meta.cost_validation); sign and pay; record the licence in docs/tos/data_licenses.md. | |
| T1188-a | The text judge does not count: its only labels are seeded (T1144's blind session verdicts plus the planted key, two model raters); label the 50 texts (T1144-b) and run `python -I scripts/validation/judge.py calibrate --write` to see whether the session judge passes the threshold rule ([report](P15/T1188-llm-judge.md)) | 1 |
| T1188-b | The Gemini judge has never run (no key in the cloud container): run it on the D4 sample through the gateway, check that `gemini-pro-latest` resolves (else set AI_JUDGE_MODELS), and calibrate it ([report](P15/T1188-llm-judge.md)) | 2 |
| T1168-a | The docs workflow must run `node scripts/docs/ask_docs.mjs build` before `mkdocs build`, else the Ask box has no index on the site (index.js is generated, git-ignored) |  |
| T1168-b | Dense half of Ask the docs (model2vec potion + RRF with BM25) not built: container has no model; adopt only if the eval gains |  |
| T1168-c | `ask_docs.mjs --model` (Workers AI via the gateway) never run live; needs CF credentials |  |
| T1168-d | The ask-docs question set was written by its builder; replace with real questions and measure Material's built in search on the same set |  |
| T1170-a | Native review of the machine-drafted nl, de, fr, es, it strings listed in docs/i18n/review.md (about 3,200 strings, admin.* last) |  |
| T1170-e | French register is mixed (tu on home, vous elsewhere); owner picks one, then align fr.js |  |
| T1182-b | After the first monthly run with the box lab up, record free -m and the run minutes of the trails_* tasks, and lower TRAILSLAB_MEM_LIMIT or move the lab to a CAX21 if the box swaps hard; the 1.5 GB cap and the tuning are planning figures, not measured on the box | after T1182-a |
| T1172-a | Register the affiliate programmes and set the four partner ids; until then partner links stay plain (owner step) |  |
| T1172-b | Approve the partner disclosure wording against the I-R5 legal checklist and PRODUCT.md (I-e) |  |
| T1169-b | The installed app is untested on a real iPhone and Android phone: install from the hint, offline reopen of a kept trip, update after a deploy (CACHE_VERSION carta-v8); see the owner step in report T1169 |  |
| T1169-c | Store apps (Play, App Store) wait for the I-R3 route decision (stay a PWA, Capacitor or native); store masters already exist in continent-app/brand/store/ |  |
| T1171-a | The Pass moment is built behind PASS_MOMENT (off); the closed beta tests it with ?pm=on and the owner decides whether to set the flag true (procedure in docs/design/pass-moment.md, Turning it on) |  |
| T1176-a | Confirm where `id`, `name` and rounded `lat`/`lon` of gem places come from (GeoNames match or OpenStreetMap, which is ODbL) before the dataset goes public; if any is OSM only, drop it for those rows |  |
| T1176-b | Run the export on the box against the live wire, read the output and the datasheet, create the public GitHub repo and upload `scripts/open_data/out/` plus README and DATASHEET |  |
| T1176-c | Post the Show HN draft (`report T1176`) only once the free part of Carta needs no signup |  |
| T1192-a | Mountains layer has only a 21-summit seed: export Wikidata (and OSM, national lists), take a baseline, then make coverage and fact.height hard checks |  |
| T1192-g | National lake CSVs (France, Sweden, Finland) for the lakes layer; check each licence |  |
| T1192-h | Rerun the lakes layer on the box after the T1186-a water fill and take a new baseline if the move is intended |  |
| T1191-c | Two proposed appeal changes from the ratings gap review wait for the owner: Dannewerk 6.8 to 6.2, Bleggio Superiore 6.5 to 6.1 (data/reports/validation/ratings/gap_verdicts.json) |  |
| T1191-g | The Wikivoyage status tier is not fetched (network); run layer_ratings.py fetch-wikivoyage and rerun the ratings layer |  |
| T1191-h | The tourism board and best-of lists and the Eurostat city nights are not compiled (network); add them under data/reports/validation/ratings/sources/ and rerun the ratings layer |  |
| T1191-j | Listed places with no catalogue row: Skanor-Falsterbo, Tipperary, and Sicily, Sardinia, the Veneto as regions; the owner decides whether any get a row |  |
| T1191-l | UNESCO and Tripadvisor terms limit republication and data/rating/external/tripadvisor.json stores names and ranks; the owner decides whether it stays in git |  |
| T1175-a | The trip receipt share (My trips menu) is behind the flag ?receipt=1; look at the image on a real phone and desktop, then flip the default in continent-app/src/lib/share/flag.js; see report T1175 |  |
| T1175-b | The cheapest week calendars need the stays wire (month curves), which is not in the cloud container; run scripts/share/share_assets.mjs --stays DIR --png on the owner box and pick the places to share |  |
| T1175-c | The 100 a day map and the calendars print "Carta's own samples of list prices" as a price source; confirm the credit and that the aggregates may be published (same question as T1130-c) before posting them | before publishing K7 images |
| T1178-d | The pipeline task needs a current app_data.json on the box and a scheduled pull request routine (K14 step 3); not set up |  |
| T1178-e | Owner approval of the sample December 2026 draft, then set status published; wire vintage is 2026-06-07 so a fresh wire should be used first |  |
| T1193-a | Owner step: verify the EuroVelo seed list (route names, total km, country lists were written from memory; hosts unreachable) and set verified=yes; checks stay soft until then |  |
| T1193-b | Owner step: add official km per country (`eurovelo_countries.csv`) so the length fact and MdAPE have data |  |
| T1193-c | Owner step: supply official tracks (`geom/EV6-AT.geojson` etc.) from open sources (France data.gouv Licence Ouverte, UK NCN, Swiss opendata) for the geometry fact; EuroVelo GPX is personal use, keep it out of git |  |
| T1193-f | National networks (D-Netz, Sustrans NCN, SchweizMobil, Bicitalia) not loaded: `national.csv` loader is built and tested, data is an owner step after terms are read |  |
| T1194-a | Climate normals CSV (DWD CLIMAT) not exported; climate layer has no real run, baseline or gap review |  |
| T1194-b | Copernicus sea temperature CSV not exported and T1097-a not run; sea layer has no real run |  |
| T1194-c | Eurostat tour_occ_nim export missing; crowds layer has no real run |  |
| T1194-e | Wire lacks climate.elev; rebuild so the elevation guard works |  |
| T1174-b | The monthly `blog_pr` routine is a dry run until the owner sets `CARTA_BLOG_PR=1` on the box and the box has a git push credential for `blog-drafts-*` branches; see the owner steps in the report |  |
| T1195-a | The trips layer runs on a hand seed of 81 legs; download the open GTFS feeds (procedure in report T1195, Owner steps), run `trips_timetables.py gtfs`, rerun the runner and move the baseline once |  |
| T1195-b | Car legs (1,021) have no reference: route them on a self-hosted OSRM or the BRouter in tools/brouter (the OSRM demo server's policy forbids bulk use) with `trips_timetables.py osrm` | after T1195-a |
| T1195-e | No confirmed open timetable licence for Italy, Czechia, Poland, the Netherlands and Denmark; Belgium needs the SNCB licence contract, Sweden and Ireland a free key: decide per country and add each feed used to the licence registry (src/ingestion/core/registry.py, docs/tos/data_licenses.md) | before T1195-a for those countries |
| T1196-a | Native review of the drafted strings should start from the back-translation result: 11 strings fail (9 entries in docs/i18n/review.md "Fix these first") and about 15 are borderline; the 99.7% that holds is an upper bound from a lenient, uncalibrated judge |  |
| T1196-f | Cross-check with a second model family: run the Gemini judge (and a Gemini blind back-translation) on data/reports/validation/texts/items.json and the 2,056 flagged strings; the session judges share the drafting model's family |  |
| T1200-a | Fire months use a dry-heat proxy until the owner supplies cache/fire_fwi.json from the CEMS fire danger reanalysis (licence wording unverified) |  |
| T1200-b | Run `python run_pipeline.py --only heat_fire` and rebuild the wire so the shipped data carries climate.heat and climate.fire |  |
| T1197-a | Link and page health (D16) has not run against the real hosts; the cloud proxy blocks them. Run it on the box, read the broken list |  |
| T1197-b | Wikimedia's User-Agent and robot policy were read from secondary sources only; confirm the 0.5 s pace and the user agent in pipeline/config/link_health.yaml |  |
| T1197-e | The box schedule must keep logs/status/links across its git reset; confirm the new weekly task link_health is picked up by the Hetzner box (--max-cadence weekly) |  |
| T1198-b | Photo check first box run with Commons metadata, review, then write the D23 photos baseline; until then the hero flag rate is measured but not gated in D2 (report T1198, Owner steps) | 1 |
| T1198-d | One photo check vision run with GEMINI_API_KEY to confirm calls, answers and cost; the research could not reach Google's price page | 2 |
| T1198-f | Review the 42 heroes flagged on the whole list (Starmer portrait on Tiverton, Hythe, Rothwell; Flag of Europe on Eu; a grizzly on Fur) and approve or refuse the 12 ladder replacements before any --apply | 3 |
| T1199-a | Check the entry rules table in pipeline/entry_rules.py against the live official pages (travel-europe.europa.eu EES and ETIAS, Your Europe, EUR-Lex 2018/1806, GOV.UK ETA and entry requirements), which this session could not open, then move RULES_CHECKED to that day (owner steps in report T1199) |  |
| T1199-b | Run the entry_rules task on the box (python run_pipeline.py entry_rules, or python pipeline/entry_rules.py --refresh) so each country's advice carries the GOV.UK page's own update date; the Content API fields public_updated_at and details.parts are tested on a fixture only | after T1199-a |
| T1201-b | Run the trails chain on the box (hierarchy, curate, scenic, attributes, rate with export, summaries) so the T1201 fixes reach the wire, and record their numbers; see report T1201, Owner steps | after T1182-a |
| T1204-a | Check the footprint factors in pricing.json `footprint.factors` against the DESNZ workbook (the container could not open gov.uk; values came from secondary mirrors, coach 28 vs 39 and the petrol car row unconfirmed) |  |
| T1203-a | D21: run `python run_pipeline.py access_facts` on the box (Overpass is unreachable from the build container) and ship destinfo; record how many destinations get an `access` row |  |
| T1203-b | D21: look at the Access card in Practical on real tagged places at phone and desktop width; the card was only checked on fixtures |  |
| T1202-a | Run the seasons harvest (python run_pipeline.py seasons) on the box with the Geofabrik extracts, then npm run data; until then no place carries open months (report T1202, Owner steps) | 1 |
| T1205-a | Migration 073 (price alerts, double opt-in, RLS) is written and harness-tested on a local Postgres but not pasted; see report T1205, Owner steps | 1 |
| T1205-b | The price-alerts Edge Function is not deployed and its secrets (PRICE_ALERTS_FROM, PRICE_ALERTS_LINK_SECRET, PRICE_ALERTS_BOX_SECRET) and the box env (PRICE_ALERTS_URL) are not set; the Resend custom-header support was read from search snippets only | 2 |
| T1205-c | Price alerts are behind two flags that are off (VITE_PRICE_ALERTS, PRICE_ALERTS_ENABLED); turn them on after a test with the owner's own account | 3 |
| T1205-g | The T944 client-side price-drop email (notify, migration 060) overlaps with I17 price alerts; decide whether to retire it once alerts are live |  |
| T1206-d | First live run of Gateway.batch (Gemini Batch Mode) on the pipeline key; the request shape is coded from memory because the docs host was blocked |  |
| T1206-e | Run the live red team (redteam_live.mjs) with the suggest-city and pipeline attacks T1206 added |  |
| T1206-f | Record plan-day plans per provider with continent-app/scripts/eval/plan-day/record.mjs against a local supabase functions serve plan-day, then score them with run.mjs plan-day --plans |  |
| T1207-i | Check the laptop's gitignored logs/run_*.cmd for the 17 moved script paths (owner step in the T1207 report) |  |
| T1208-g | The nl, de, fr, es and it `why.place.*` strings (14 each) were written by a session; a native read is needed (report T1208, Owner steps) |  |
| T1209-a | The G14 home is built behind HOME_G14 (off): after T1111-a, compare ?home=g14 with ?home=v3 and flip the flag in continent-app/src/browse/home/homeVariant.js or keep v3 (report T1209) | 1 |
| T1209-b | Look at the G14 home (?home=g14) on a real phone on a preview: the doors, the example card, the share button, and how quick it feels (INP is only meaningful there) | 2 |
| T1211-b | Before the next deploy of parse-booking, confirm the Supabase Edge runtime allows Deno.resolveDns (one link import on the preview project); without it the new check fails closed and every URL import answers url_unreachable |  |
| T1213-a | Read the official scraping, caching and storage clauses of the partner terms (research could not fetch them) |  |
| T1213-d | Add the stop flag to the late sweep on the Hetzner box |  |
| T1213-f | Travelpayouts Data API signup and token for the P1 coverage run |  |
| T1213-g | Set LADDER_STOP_GOOGLE_FLIGHTS=1 before the first paid sale |  |
| T1213-i | Partner applications at the milestones in docs/data/access-ladder.md |  |
| T1216-c | Rerun the ratings layer on the box with the real World Heritage cache (`runner.py ratings --write`) now that serial sites count at every component, and move the fact.unesco_join baseline once on purpose (75.6% to about 57% in the container, a wider reference, not a regression) ([report](P15/T1216-sweep-validation.md)) |  |
| T1214-d | The crowding fix (own-country NUTS 3 region first, 10 border places moved, 11 proxies labelled) reaches the wire only after the box reruns the crowding task |  |
| T1215-b | Migration 074 (ai_reports, the in-app Report button) is not live; until it is, Report falls back to the mail link (procedure: report T1215, Owner steps) |  |
| T1215-d | The taxonomy labels of 165 nodes and the de, fr, es, it, nl synonyms of 168 nodes were translated by the session (pipeline/taxonomy/carta_taxonomy.yaml 1.1.0, label_source says so); the owner checks the Dutch and a native speaker the others (Owner steps) |  |
| T1212-a | Every language page (40,350) is noindex because its strings are machine-drafted; a native review of scripts/prerender/strings.mjs and the prerender.* catalogue keys, then REVIEWED in scripts/prerender/langs.mjs, indexes them |  |
| T1212-d | Upload the prerender with the language pages (about 490 MB more in R2) and deploy the new routes, then check /nl/ on the preview |  |
| T1212-f | At / the app writes the prefix of a stored or detected language into the address (replaceState, no reload); owner decides whether to keep it or show a dismissible language banner instead |  |
