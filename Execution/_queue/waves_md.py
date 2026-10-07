"""Write Execution/_WAVES.md: waves 6 onward, ten sessions each, with model, task and prompt.

Written by T300 (2026-10-02). The wave tables live in WAVES below. Plan tasks
(_ORDER.md numbers) get their mind-map prompt through xmind_prompt.py and their
model through task_model.py (the MODEL line in the map). Register-row tasks
(T281 onward, T310 onward) get a prompt built from their rows and notes, and a
fixed model chosen here. Re-run after editing a table:

    python Execution/_queue/waves_md.py
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import task_model  # noqa: E402
import xmind_prompt  # noqa: E402
import wave_prompts  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "Execution" / "_WAVES.md"
WT = r"C:\Users\Gebruiker\Documents\Portfolio\wt"
MAIN = r"C:\Users\Gebruiker\Documents\Portfolio\Travel App"

# Register-row tasks: id -> (model, title, rows). Plan tasks are looked up in the map.
REG = {
    "T281": ("sonnet", "harness repairs, round two",
             "W5-a, T276-a, T265-d, T279-a, T266-a, T266-c, T062-g, T266-e, T268-g, T267-d, T296-c, T176-c, T253-a"),
    "T282": ("sonnet", "app hygiene", "T192-a, T192-b, T192-c, T197-b, T268-e, T278-a"),
    "T283": ("opus", "audit the exhaustive-deps disable comments in the planner", "T192-d"),
    "T284": ("opus", "migration 047, three small schema fixes", "T083-b, T219-c, T217-c, T300-o"),
    "T285": ("sonnet", "the docs catch up", "T201-b, T277-a, T111-d, T084-d, T207-g, T078-a, T300-l"),
    "T286": ("opus", "one climb and one difficulty, from source to screen", "T108-d, T108-e, T108-f"),
    "T287": ("sonnet", "the shared MonthStrip on the beach, lake and mountain pages", "T087-b"),
    "T271": ("opus", "D4 speed: first paint from the boot index, CLS and INP",
             "T054-d, T055-c, T059-b, T055-d, T061-b, T059-d, T059-e, T300-g"),
    "T310": ("sonnet", "registry follow-ups", "T078-b, T078-c, T078-d, T113-c, T300-d"),
    "T311": ("opus", "pipeline code fixes, no runs",
             "T096-c, T096-b, T121-b, T113-g, T108-c, T107-b, T113-b, T269-b, T267-a, T288-c, T300-p"),
    "T312": ("opus", "exhaustive-deps disable audit, the rest of src", "T192-d"),
    "T313": ("sonnet", "credit strings into Where this comes from, and the lint parser", "T157-a, T300-q"),
    "T314": ("opus", "payments follow-ups without a migration", "T265-b, T032-d, T300-u"),
    "T315": ("opus", "migration 048: launch metrics events and the full GDPR export",
             "T215-b, T215-c, T215-d, T300-i, T270-d"),
    "T316": ("opus", "the status surface on the data host", "T218-a"),
    "T317": ("sonnet", "Pages and R2 hygiene", "T294-a, T296-b, T288-d"),
    "T318": ("sonnet", "the Where the numbers come from explainer page", "T226-b, T207-c"),
    "T319": ("opus", "legal and privacy copy matches the code", "T300-b, T300-c, T268-c, T273-b"),
    "T320": ("sonnet", "CI and queue hygiene", "T252-c, T267-e"),
    "T321": ("opus", "the rating distribution contract fails on main", "T252-b"),
    "T322": ("sonnet", "why registry routes and ranges are missing from the trails wire", "T113-d, T113-e"),
    "T323": ("sonnet", "Edge Function follow-ups", "T300-r, T040-c, T041-c, T037-d"),
    "T324": ("sonnet", "box readiness code before stage 7", "T218-c, T300-f, T269-c, T047-h"),
    "T325": ("sonnet", "carta-design skill body matches the decided state", "T195-a, T195-b"),
    "T326": ("sonnet", "the feedback front door", "T219-b"),
    "T327": ("opus", "fact store follow-ups after the pastes", "T041-d, T041-e, T041-f, T300-n"),
    "T328": ("sonnet", "box-era pipeline follow-ups", "T072-c, T072-d, T255-b, T048-h, T047-i, T047-j, T269-g, T297-a, T054-h"),
    "T329": ("opus", "D5b: every surface onto the CDN, then the CSP drops Wikimedia",
             "T052-f, T053-a, T052-d, T075-c"),
    "T330": ("opus", "refunds reach the margin and OSS figures (migration 050)", "T217-b"),
    "T331": ("sonnet", "store-era and PWA follow-ups", "T246-b, T246-c, T216-c"),
    "T332": ("sonnet", "journey data fixes the validator found", "T084-a, T084-b"),
    "T333": ("opus", "the photo upload path with the legal shape", "T206-b, T068-h"),
    "T334": ("sonnet", "route-track follow-ups after the data lane", "T177-d, T206-f, T176-a"),
    "T335": ("sonnet", "one shared Button, after the tokens", "T197-d, T197-a"),
    "T336": ("sonnet", "launch outreach drafts", "T208-c, T204-b"),
    "T363": ("opus", "the contrast tokens the owner chose to darken", "T362-a"),
    "T364": ("sonnet", "the owner's small interface calls", "T362-b"),
    "T365": ("opus", "migration 051: the owner's moderation and admin decisions", "T362-d"),
    "T366": ("sonnet", "housekeeping the owner approved", "T362-e"),
    "T367": ("opus", "the empty states from the approved onboarding document", "T211-b"),
    "T368": ("sonnet", "the owner's receipt and copy calls", "T362-c, T362-f"),
}

# Every wave: (number, title, gate, [rows]). A row: (task ids, branches, app, folder, migration, notes).
WAVES = [
 (6, "Ready now (tabled 2026-10-02, revised by T300)", "None. Stages 5 and 6 are done and merged; nothing here pastes, deploys or runs data.", [
  (["T086", "T094"], ["p5-a4-empty-sections", "p5-j6-j8-presentation-honesty"], True, "P5", None,
   "Journey lane. T086 is already guarded in code (JourneyPage.jsx renders the pack and what-could-go-wrong blocks only when the array has items): verify across all 253 trips that no section heading renders empty with a read-only count over the journeys wire in the main checkout, change code only if you find one, and close it with the count. T094 after it: J6 emphasis normalised in the trip source prose (the files T085 edited), J7 one honest coverage line on the journeys index, J8 a last-checked month from dataVintage on every trip. Read the T085, T087, T088 and T092 reports first and keep their work. Any wire build goes to a scratch folder with build_wire.py --out; never write continent-app/public/journeys. Check 380px and desktop."),
  (["T281"], ["p4-harness-repairs-2"], True, "P4", None,
   "Scripts only: continent-app/scripts/**. Do not touch src/. Start with W5-a: find why verify_trail_page.mjs fails 'trips still show the sort chips' and 'city day cards render [0 cards]'; if the cause is in src, write a register row with the evidence instead of fixing it. T276-a: verify_csp.mjs must read the real header from public/_headers (production is on Cloudflare Pages since T293; vercel.json is the rollback only), read-only, and drop emrldtp from the noise regexes. T265-d: verify_paywall.mjs honours CARTA_REPO_ROOT. T266-c: two clean back-to-back verify_admin_panel.mjs runs compared, result in the report. T267-d: npm run ci:smoke after one build; delete dist/ and dist-data/ right after. T296-c and T266-a: the unowned harness failures (destination page phone overflow, reach_filter CRL premise, REGIONS.md pointers, trips selectOption, country_brief phone click, explore 28/30, harnesses that assume port 4173). T253-a was closed by T266 only in part: test_rls_policies.mjs still carries the dead {5,255} patched-copy branch and the '018 fails' header (lines about 75 and 478). T176-c: the signed-out GPX and KML check in the browser, no code. T270-c is already closed (T300); skip it."),
  (["T282"], ["p10-app-hygiene"], True, "P10", None,
   "File ownership this wave: you own src/i18n/index.jsx, eslint.config.js, browse/CategoryRail.jsx, components/PassModal.jsx, planner/AiDayPlanModal.jsx, components/admin/ContentSection.jsx and components/BagCheck.jsx. T192-a: the disable comment with its reason at i18n/index.jsx:125. T192-b: exhaustive-deps to error in eslint.config.js, after T192-a. T192-c: the unused directive in CategoryRail.jsx:41. T197-b: useFocusTrap and an Escape handler on the shared escape stack (it listens in the capture phase) for PassModal and AiDayPlanModal. T268-e: the trails index names the field country while ContentSection.jsx filters on cc. T278-a: delete BagCheck.jsx and the itin.bag* keys in six locales once grep shows nothing else reads them; say in the report that git keeps it. T266-d is already closed by T267; skip it. npm run lint must end with 0 errors. Parse all six i18n files after editing. Check both modals by keyboard at 380px and desktop."),
  (["T283"], ["p10-hook-disable-audit"], True, "P10", None,
   "Scope: src/planner/** except AiDayPlanModal.jsx (session 3 owns it), plus useTripPlanner. GuidedTripWizard and DayPlannerTab first, then TripPlannerTab, ReadyTripsStep, DayIdeasStep, ExpenseLedger, AiPlanRoute; include useTripPlanner's per-bump suggestNextStops call. Each disable either goes, with a correct dependency list, or stays with a one-line reason. Session 3 makes exhaustive-deps an error in this same wave, so leave zero exhaustive-deps warnings in the files you touch. Count disables before and after (76 in src at T300). Leave one register row with the remaining count per file outside your scope; T312 takes them. Check the wizard, trip planner and day planner at 380px and desktop."),
  (["T284"], ["p4-migration-047"], True, "P4", "047",
   "Migration 047 in the ROOT repo, supabase/migrations/047_*.sql, with a self-check raise notice and a down block. T083-b: widen the fn and code checks on edge_errors and the two lists in log_edge_error so the ErrorBoundary's ('app', 'client_crash', 'client') call stores a row; decide and record whether client errors share the AI failures card. T219-c: 'data' in the feedback kind check, 'cycle' in the content_overrides layer check. T217-c: an audited admin_adjust_expiry RPC that moves entitlements.expires_at without resetting period_start, admin-only, written to the audit log; update the SQL-editor step in docs/REFUND_SOP.md. T300-o: a test for the admin_guard read-burst limit. GUARD: 047 must not depend on anything 044 creates and must not redefine any function 044 replaces (044 pastes later, in stage 10). State the paste position (after 045 and 046) in the report and in an owner register row for _OPEN-MASTER stage 2.2. Extend test_admin_rpc_security.mjs and test_rls_policies.mjs and run both on a throwaway PostgreSQL 18 with every migration applied in filename order."),
  (["T285"], ["p11-docs-catchup"], False, "P11", None,
   "Docs only, root repo. T201-b: PRODUCT.md is already fixed; replace the literal 1,570 destinations in docs/1.CARTA.md (lines about 3 and 49) and README.md (lines about 5 and 28) with a pointer to app_data meta.n_destinations, not a new literal. T277-a: reword PRODUCT.md 'The one rule the numbers follow' for ground costs. T111-d: docs/REGIONS.md gets the per-region code field and the contract block of coverage.json. T084-d: Trips/carta-unified/carta-unified/README.md carries the T084 validator figures (606 errors, 624 warnings at T084). T207-g: only the doc-claim half (credited sources 24 versus 43 measured; 43 entries include duplicates, count unique sources); the sitemap half waits for T222. T078-a: replace the hand-typed roster in src/ingestion/README.md with a pointer to the generated ledger. T300-l: docs/LAUNCH-METRICS.md says the visitor source is a gap; T275 chose the host's server-side dashboard (Cloudflare Pages analytics now), so write where and how the number is read. Also fix docs/SUPPORT.md's stale 'until T272-a removes' line (T273 removed the estimates). Every figure cites the file it came from."),
  (["T286"], ["p7-trail-climb-consistency"], True, "P7", None,
   "Read the T107 and T108 reports first. App: the card in DestinationsTab.jsx, the KML fact line, AroundHere.jsx and destinationPdf.js use trailStory.trailClimb().up (or both numbers) instead of the single stored ascent (+7 m on Korab 9). Pipeline code: rate.py picks bigClimb and dayOut from the uphill climb and applies the comfort gate at the source; export_wire.py stops shipping validate.py's difficulty beside f.g, or sets it to the grade where a grade exists. The app must read both the current wire and the new one, because the rebuild is a data-lane run the owner starts. Code and tests only; no rebuild, no export, no trailslab. Count affected rows read-only against the published trails wire. You own DestinationsTab.jsx, AroundHere.jsx, destinationPdf.js, trailStory.js and the KML writer this wave."),
  (["T287"], ["p7-layer-month-strip"], True, "P7", None,
   "Read Execution/P5/T087-a2-month-strip.md and src/components/MonthStrip.jsx. Adopt it on the beach, lake and mountain pages where each layer's wire already carries month data (climate, bathing season, snow); if a layer has none, leave that page as it is with a register row. No pipeline or wire change. You own the beach, lake and mountain page components this wave. Check each page at 380px and desktop. Parse all six i18n files after editing."),
  (["T196"], ["p11-design-lint"], True, "P11", None,
   "New continent-app/scripts/ci/design-lint.mjs beside T157's banned-terms.mjs, checking the carta-design never-do list and the DESIGN.md token rules. styles.css has 378 hex literals outside :root (row T195-b), so the detector needs a committed baseline and fails only on new violations. Prove the done condition with a seeded violation in a fixture, not in src. Wire it as a NEW workflow file in the root .github/workflows/ modelled on trip-validator.yml; no edits to existing workflows and not into npm run ci. T197-a waits for the first component lift after this."),
  (["T211"], ["p12-onboarding-empty-states"], False, "P12", None,
   "Design docs only, under carta-design; the owner approves before any code. Carta prices no flights (T272), so the departure airport is no longer the hinge: design the first ninety seconds around what the app prices today (ground costs, the traveller's own typed fare) and the audience order (hikers lead, T203). ALSO row T300-k: docs/FIRST_RUN_RESULT.md (T187) still builds the receipt on Carta flight estimates (receipt.flightOut, receipt.flightsNote, 'Flight out ~ EUR 58.98 est.'); revise it to ground costs plus a typed fare, keep everything else T187 designed, and raise an owner row for the re-approval; T099 builds to it. Inventory every empty state in src today (the before count) and write each one's copy in English. Write docs/ONBOARDING_AND_EMPTY_STATES.md. Read PRODUCT.md, the reason codes in coverage.json (T111, read-only) and destinations spec 1.6 and 0.4."),
 ]),
 (7, "Ready now, code", "Wave 6 merged. Nothing here pastes, deploys or runs data.", [
  (["T271"], ["p3-d4-speed"], True, "P3", None,
   "Stage 5 is live (T291): the app reads its data from data.carta-europetravel.com. First paint still waits for every country shard. Render the default screens from the boot index (put the ranking fields, cost inputs, rating and kind, in it or in a per-origin rank file) and fetch card detail through catalogue.js on demand (T054-d, T055-c, T059-b). The destination page's phone CLS of 0.309 (T011, T300-g) and the trip page INP, never measured (T300-g). The phone price-map INP on a wider sample (T055-d), tiles in viewport mode (T061-b). T059-d: the Windows EPERM rename in scripts/r2/stage-data.mjs: EXCEPTION to rule 4 for that one file, a retry or copy-then-delete only. T059-e: the sw.js comment. T059-a (viewport catalogue in production) is an owner decision; do not switch it on. Measure before and after with T011's baseline_vitals.mjs and T061's tiles_and_paint_T061.mjs, unchanged."),
  (["T143"], ["p9-k1-json-schema"], True, "P9", None,
   "Journey lane, one session per wave. The 253 journeys in Trips/carta-unified/carta-unified are the trips. Fold in three schema rows: T084-b (does a sleep reference a strategy entry; are tier alternatives exempt), T085-b (food, hotel and airport prose ranges become {low, high}), T088-a and T092-a (structured gateway: code, name, transfer minutes, written by build_wire.py so gateway.js stops parsing prose), and T092-b (whether the currency line and extended budget notes get structured fields). Generation itself is Gemini-only; never the Claude API. Any wire build goes to a scratch folder with build_wire.py --out; never write continent-app/public/journeys."),
  (["T310"], ["p4-registry-followups"], True, "P4", None,
   "T078-b: generate or check continent-app/src/data/attribution.js from the registry (app repo). T078-c: run_all --list prints cadence and licence rows. T078-d: retired rows in the generated ledger (the describe.py Claude row T264 removed) move to a closing retired chapter. T113-c: a ledger row for the Waymarked Trails route list (ODbL via waymarkedtrails.org, ids, names, refs, groups only). T300-d: T010's storable-copy verdicts were never written into the ledger; add a storable column to the registry and regenerate. The ledger check (python -m src.ingestion.core.ledger --check) must pass."),
  (["T311"], ["p7-pipeline-code-fixes"], False, "P7", None,
   "Code and tests only, no runs, no trailslab. T096-c: the Geneva CHF snapshot parses to 0.16 EUR in harvest_accommodation.py parse_listings. T121-b: drop network:type=node_network relations at ingest in ingest_osm_routes.py. T300-p: the redundant second clause in harvest_cycling.is_node_network. T113-g: famous_registry.wd_query pulls P402 and P18. T108-c: scenic.py stores names.display_name(tags, country). T288-c: pipeline/archive/pack.py refuses a FAT32 target or a projected tarball over 4 GiB. T113-b: waymarked.py ahead of famous_registry.py in run_pipeline.py's trails_registry task. T269-b: derive.py sources after the layer exports in run_pipeline.py. T096-b: the Spanish national stay prior underprices resort coast; propose the resort adjustment (or a wider island radius) in code with tests, no run. T107-b: rung 1 of the title ladder never fires because no stored Wikidata label feeds it; add the column read. T267-a: move harvest_wizzair.py, harvest_vueling.py, harvest_volotea.py and harvest_ryanair_schedules.py to pipeline/archive/ with their run_pipeline.py steps and registry RUNS/SOURCES entries removed, then python -m src.ingestion.core.ledger --write. EXCEPTION to rule 4: run_pipeline.py for exactly those task edits (T113-b, T269-b, T267-a), pipeline/archive/ for receiving the four moved scripts, and pipeline/archive/pack.py for the FAT32 guard only."),
  (["T312"], ["p10-hook-disable-audit-2"], True, "P10", None,
   "The rest of T192-d after T283: App.jsx, map/, browse/ and every other folder T283 left, using the per-file counts in T283's register row. Each disable goes with a correct dependency list or stays with a one-line reason; exhaustive-deps is an error since wave 6, so lint must stay at 0 errors. Check every screen whose effects you change at 380px and desktop."),
  (["T313"], ["p10-credit-footer"], True, "P10", None,
   "T157-a: ODbL and GLO-30 appear in dest.routesCredit and cycle.sourceNote credit strings in six locales (12 strings, not 10: T157's lint dropped French strings with an apostrophe). Move the technical licence names into the collapsed 'Where this comes from' footer and rewrite the surface copy in plain words; the credit itself must stay visible where the licence requires it. T300-q: fix the apostrophe parser in scripts/ci/banned-terms.mjs and re-run it; it stays report-only. Parse all six i18n files after editing."),
  (["T314"], ["p2-payments-followups"], True, "P2", None,
   "No migration. T265-b: a paywall left open through a tab close or hard navigation records no dismissed event; add a pagehide path with a keepalive request that skips the Stripe redirect. T032-d: an admin tile for the refund-exposure count (pass_grants without consent); if no RPC returns it, write the RPC into a register row for migration 048 instead of adding SQL. T300-u: supabase/functions/checkout/test_purchase_e2e.md (root) gets the 044 checks: a Year holder buying a Trip Pass keeps Year, a sixth purchase gets 409 pass_max, pass_grants carries reason and fee_cents. Stripe has never been live; nothing here needs a key."),
  (["T315"], ["p4-migration-048"], True, "P4", "048",
   "Migration 048 in the ROOT repo with a self-check raise notice and a down block. T215-b: one event when a traveller finishes a priced trip, read on the Overview. T215-c: a click counter by surface (subId) for the affiliate links in affiliate.js, activityAffiliates.js and omio.js, and a card. T215-d: a rate on the AI failures card (a denominator), and whether client errors are in scope. Follow T214: first-party RPCs only, no identifier, guests included, per-day caps, no script. T300-i: widen export_user_data to day plans, saved trips, profile, friends and pass grants (Article 15); 045 last redefined it, so start from 045's body. T270-d: an Audit tab revert action only if one RPC can undo every audited kind; otherwise leave the row open with the reason. GUARD: nothing 044 creates or replaces; paste position after 047. Run test_admin_rpc_security.mjs, test_rls_policies.mjs and the export test on a throwaway PostgreSQL 18 with every migration applied."),
  (["T213"], ["p12-email-lifecycle"], False, "P12", None,
   "Design doc only. No transactional email route exists and the route is an owner decision (T070-d: Supabase Auth SMTP through an EU provider, or an Edge Function with a non-Anthropic provider; never the Claude API). Write the lifecycle (which emails, when, what each says, in carta-design voice) so it can be built on whichever route is chosen, include the DSA notifier receipt (T068-d) and the statement of reasons (T070-d) among them, and raise one owner row for the route decision."),
  (["T198"], ["p11-typography-decision"], False, "P11", None,
   "Decision record. The carta-design SKILL.md banner of 2026-07-28 and DESIGN.md (T195) already state the shipped state: Fraunces, Plus Jakarta Sans, JetBrains Mono. The skill's older body still teaches Instrument Sans and IBM Plex Mono. Record the decision with its reasons, then T325 rewrites the skill body. Read the :root of continent-app/src/styles.css read-only."),
 ]),
 (8, "Ready now, unlocked by stages 5 and 6", "Wave 7 merged.", [
  (["T223"], ["p12-url-structure"], True, "P12", None,
   "Row T205-c: reserve the section words (trails, beaches, lakes, mountains, cycling, regions, trips, cost, {n}-days) inside every country namespace, check the 3,868 dossier slugs against them, put the language in the path, and turn the nine hash readers into one-shot client-side redirects to the new paths. Read Execution/P12/T205-programmatic-seo.md first. Once the paths are ratified, lift the SEO plan into docs/SEO.md (row T205-h). Production is Cloudflare Pages (T293); the prerender itself is T221."),
  (["T199"], ["p11-self-host-fonts"], True, "P11", None,
   "Rows T214-c and T195-c: self-host the remaining families beside the four files in public/fonts, drop the unused Instrument Sans, IBM Plex Mono and Inter Tight, drop the Google stylesheet and preconnects from index.html. EXCEPTION to rule 4: public/_headers and vercel.json, only to remove fonts.googleapis.com and fonts.gstatic.com from the CSP once nothing loads from them. The React 19 and Tailwind v4 half of the map text: the app is React 18 with no Tailwind (T197); record whether the upgrade is worth it and do not upgrade dependencies (rule 4)."),
  (["T212"], ["p12-brand-assets"], True, "P12", None,
   "OG images, favicon, app icon, social cards under carta-design. Row T205-b: the index.html title and og:title separate Carta from Europe Travel with a middot, which the copy rules ban; use the per-page title pattern in the T205 report. The store apps are coming (T272), so produce the icon at the sizes the Android TWA and iOS need."),
  (["T112"], ["p7-coverage-report-ci"], False, "P7", None,
   "reports/coverage.html from pipeline/regions/coverage.py and a CI gate. Row T111-e: run coverage.py --strict in a NEW workflow file (no edits to existing workflows). Do not commit continent-app/public/coverage.json; the data rerun is the owner's (data lane)."),
  (["T082"], ["p4-schema-contract-ci"], True, "P4", None,
   "Schema contract in CI, frontend to backend. T029 already added scripts/ci contract checks and T267 made the contract gate check the split wires (R2_TIER); build on them. New workflow file only."),
  (["T316"], ["p12-status-surface"], True, "P12", None,
   "Build the status surface from docs/INCIDENT_RUNBOOK.md: a static status file on the data host (data.carta-europetravel.com) read once at boot and shown through the site banner (AnnouncementBar), so travellers can be told about an outage while Supabase is down. Uploading the file to R2 is an owner step: write the exact command and raise an owner row. carta-design applies; check at 380px and desktop."),
  (["T317"], ["p1-pages-r2-hygiene"], True, "P1", None,
   "T294-a: a top-level 404.html in the Pages deploy so unknown paths return 404 (EXCEPTION to rule 4: scripts/build-pages.mjs for that one addition; check verify_data_host.mjs still passes). T296-b: push-data.mjs --prune also deletes top-level prefixes no longer in R2_TIER (EXCEPTION: scripts/r2/push-data.mjs for that change only; test with --rclone-dry-run, never --live). T288-d: any restore procedure in docs/BACKUP.md or the runbooks restores into a scratch database or uses the streamed read check from the T288 report, never pg_restore --clean against the live trailslab."),
  (["T200"], ["p11-core-web-vitals"], True, "P11", None,
   "Measure Core Web Vitals on the three heaviest pages against production (https://www.carta-europetravel.com, Cloudflare Pages since T293; network reads only). Also row T056-b: run verify_no_runtime_fares.mjs once against the live deploy; and row T059-c: measure the 238-shard full-load path against the real data host and say whether SHARD_BYTES should change. Do not change app code; findings become register rows."),
  (["T097", "T098"], ["p5-publish-accuracy", "p5-provenance-copy"], True, "P5", None,
   "T097: publish the food figure only (row T096-d: 88% of destinations within 6 euro a day, country CI 79% to 93%, from tools/benchmark/results/2026-10-01.md), not the weekly headline, until the owner hand-prices stays (T096-a). T098 after it, on its own branch: city versus country provenance and source names in product copy. Parse all six i18n files after editing. Check at 380px and desktop."),
  (["T142"], ["p8-webcams"], True, "P8", None,
   "Embed webcams live, never store the frames. Check each provider's embed terms and licence before using it and write them into the report. EXCEPTION to rule 4: public/_headers and vercel.json, only to add the chosen embed host to frame-src."),
 ]),
 (9, "Ready now", "Wave 8 merged (T223 ratified the paths).", [
  (["T221"], ["p12-prerender"], True, "P12", None,
   "Owner decision T272 (row T205-a): prerendered HTML lives on R2 behind one Pages Function, because the Pages bundle has a 20,000-file ceiling. Build the prerender and the Function; uploading to R2 and deploying are owner steps written as exact commands in the report. EXCEPTION to rule 4: wrangler.toml and a new functions/ folder. Use T223's paths and the T205-b title pattern."),
  (["T318"], ["p12-numbers-explainer"], True, "P12", None,
   "Row T226-b: one prerendered page 'Where the numbers come from' at a path T223 reserved outside the country namespaces, assembled at build time from T201's positioning (PRODUCT.md), the five provenance sentences, the per-layer counts in coverage.json and the credits in attribution.js, no sign-in. Row T207-c: confirm the Data sources credits are reachable without an account. Owner decision T226-a is still open: build it so it stands either way and say so."),
  (["T144"], ["p9-k2-three-passes"], True, "P9", None,
   "Journey lane, after T143. Generation is Gemini-only, never the Claude API. Measured runs need the stage 3 Gemini setup and cost real tokens: build and test on a handful of trips with the existing GEMINI key only if the owner has done stage 3; otherwise build, unit-test with stubs, and leave the measured run as a register row."),
  (["T319"], ["p1-legal-copy"], True, "P1", None,
   "T300-b: write docs/ARTICLE30.md from facts in the repo (T018 vendor DPAs, T020 export, T070 statements, T071 edge errors, T270 privacy paragraphs, Stripe as joint controller per T018, Cloudflare now hosting); the T022 record is wrong in six places (see the T300 report). T300-c: the privacy policy says analytics events are kept 90 days and automatically deleted; make the policy match what the code does (022 prunes at 180 days, unscheduled, unapplied), or propose the schedule. T268-c: one sentence for the guide view counter's two-day salted hash. T273-b: draft the Terms change for 'Every figure is an estimate' now that Carta prices no flights. Remove the em dash at PrivacyPolicy.jsx about line 127. All wording is a proposal the owner approves (one owner row); six locales; parse them after editing."),
  (["T320"], ["p1-ci-queue-hygiene"], False, "P1", None,
   "T252-c: the secret-scan CI job fails on placeholders (whsec_..., sk-ant-...) in Execution reports, test_purchase_e2e.md and docs/HANDOFF_LLM_RUNS.md; tighten the patterns (new or same workflow, only that job) rather than rewriting closed reports. T267-e: port run_queue.ps1's gate (a committed report plus no app-repo changes left behind) into wave_worktree.ps1 or a merge check the wave orchestrator runs. Execution/_queue/ is yours this session."),
  (["T321"], ["p7-rating-distribution"], False, "P7", None,
   "Row T252-b: the rating-tests CI job fails the distribution contract on main (curated against fitted sd gap 0.280, limit 0.18). Find whether the contract or the ratings are wrong, read the rating_v4 notes, and fix the side that is wrong in code; no catalogue rebuild (data lane). Report the gap before and after."),
  (["T322"], ["p7-trails-wire-gaps"], False, "P7", None,
   "T113-d: 1,930 Waymarked national and international routes in the registry are not in the wire (FR 317, ES 285, DE 270); find whether the curate quota, the continuity gate or the network filter drops them, read-only against the registry and the published wire, and propose the fix as code with tests, no run. T113-e: 367 GMBA ranges and 217 NUTS3 regions publish walks with no registry walk; write the seed list."),
  (["T323"], ["p2-edge-followups"], False, "P2", None,
   "Root repo supabase/functions. T300-r: plan-day awaits the fallback-chain insert before returning; make it not block the response and keep it logged. T040-c: find where the brief's 6k-input-tokens-per-plan figure came from (the T040 baseline is 1.2 to 1.5k). T041-c: re-run unit economics section 3 and the cap arithmetic with Google's published grounding price (5,000 free a month, then $14 per 1,000) instead of EUR 0.05 per unit; write the result, change no price. T037-d: real coverage of the quota branches by running the Edge Functions under Deno with a stub Supabase client (today Part C of test_ai_quota.mjs is a source pattern check). Deploys are owner steps: list them in an owner row."),
  (["T324"], ["p3-box-readiness"], False, "P3", None,
   "Code for stage 7, before the owner provisions the box. EXCEPTION to rule 4: infra/hetzner/ for these rows only. T218-c: weekly.sh pings the heartbeat /fail on any non-zero exit, including exit 3 after the R2 step. T269-c: jobs/image_transcode.sh accepts the eight wire layers derive.py reads, needs no tarball, passes --recheck now and then, and runs derive.py gc (dry run) at the end. T300-f: the pgrouting image swap to a multi-arch build and the pgrep and PowerShell uses in the trailslab scripts. T047-h: the planetiler stub: decide (keep the exit-3 stub with a reason, or remove the job) and record it. bash -n every script you touch."),
  (["T124"], ["p7-honest-stub"], True, "P7", None,
   "GATE: the owner has approved docs/ONBOARDING_AND_EMPTY_STATES.md from T211 (its owner row is closed). If not, skip this session. Ship the honest stub and the not_applicable empty state (spec 6.5 and 1.6) with the coverage reason codes from T111 and the copy T211 wrote; row T111-b (the inline coverage sentence) too. carta-design wins; 380px and desktop."),
 ]),
 (10, "Ready now, journey lane and SEO chain", "Wave 9 merged.", [
  (["T222"], ["p12-sitemap"], True, "P12", None,
   "After T221. Rows T205-d (the page floor counted at sitemap time, reported as the first line of the monthly sheet), T207-g (sitemap half: public/sitemap.xml holds 1 URL), T220-e (record the date of the first indexed pages, as an owner row once Search Console exists, T205-f). Only pages that meet the floor go in."),
  (["T224"], ["p12-cost-pages"], True, "P12", None,
   "After T221 and T222. Destination cost pages and country and trip-length pages. Carta prices no flights (T272): ground costs only, with provenance words."),
  (["T145"], ["p9-k4-critic"], True, "P9", None,
   "Journey lane, after T144. The critic runs on Gemini, never the Claude API. Same rule as T144 for measured runs."),
  (["T090"], ["p5-j1-geolocation"], True, "P5", None,
   "61 trips geolocated to the wrong place. Needs cache/journey_images.json, which is on the laptop (checked 2026-10-02). Code and trip source fixes; any wire build to a scratch folder with build_wire.py --out."),
  (["T191"], ["p10-tokens-modular-css"], True, "P10", None,
   "FREEZE: you are the only session in this wave allowed to touch continent-app/src/styles.css. Shared design tokens and a modular styles.css. Row T195-b: bring the 378 hex literals outside :root onto tokens or add missing tokens; DESIGN.md changes in the same commit as any :root change (CLAUDE.md). The T196 design lint baseline must shrink, not grow; regenerate the baseline in the same commit."),
  (["T325"], ["p11-carta-design-skill"], False, "P11", None,
   "After T198. Rows T195-a and the skill half of T195-b: the carta-design skill lives at C:\\Users\\Gebruiker\\.claude\\skills\\carta-design, outside both repos. Back it up to a dated folder beside it first. Rewrite the body to the decided state (DESIGN.md, T198), and replace or delete assets/tokens.css. The report lists every section changed."),
  (["T326"], ["p12-feedback-front-door"], True, "P12", None,
   "GATE: the owner has decided T219-a (option A, B or C in docs/FEEDBACK-LOOP.md). If not, skip this session. Row T219-b: the link on DestinationPage, TrailPage, BeachPage, LakePage, MountainPage and the cycling page, the form as a sheet, the report key in the feedback context, and the Open in Content button in FeedbackInbox.jsx. Needs migration 047's 'data' kind (T284) pasted to store the kind; until then it degrades to 'other'."),
  (["T089"], ["p5-a5-orphan-fields"], True, "P5", None,
   "GATE: the owner has answered 'surface or strip' for tags, basecamps and snapshot. If not, skip this session. Journey lane app side."),
  (["T335"], ["p11-shared-button"], True, "P11", None,
   "After T191's tokens. Row T197-d: one shared Button read from shadcn/ui and re-skinned under docs/COMPONENT_ROLES.md; adopt it in three places as proof. Row T197-a: run T196's design lint on it and report the result."),
  (["T332"], ["p9-journey-validator-data"], True, "P9", None,
   "After T143's schema. Rows T084-a (budget-sum-mismatch on 58 trips: per-night or per-day breakdowns against a weekly total) and T084-b (accommodation-not-slept on 34 trips). Fix the trip source data and re-run the validator; wire builds to a scratch folder only. If the trip-validator workflow goes green, raise an owner row to make it a required check (T084-c)."),
 ]),
 (11, "Ready now, journey and first-run chain", "Wave 10 merged.", [
  (["T091"], ["p5-j2-hero-reuse"], True, "P5", None, "Journey lane. 26 hero images reused across 53 trips. Image licences follow the photo pipeline's credit gate (pipeline/photos/credit.py)."),
  (["T146"], ["p9-k3-confidence"], True, "P9", None, "After T143 to T145. Every number carries its own confidence, and the page shows it, under carta-design."),
  (["T150"], ["p9-k10-backfill-modules"], True, "P9", None, "After T143. Start the backfill with packing and risk modules, Gemini-only."),
  (["T151"], ["p9-d3-data-sheet"], True, "P9", None, "After T143. Fill the type-specific data sheet, one trip type at a time."),
  (["T153"], ["p9-k8-golden-set"], False, "P9", None, "After T145. A golden set re-run on every prompt change."),
  (["T099"], ["p6-i1-first-run"], True, "P6", None,
   "GATE: the owner has re-approved the revised docs/FIRST_RUN_RESULT.md (row T300-k, revised by T211). If not, skip this session. Override of the map text: Carta prices no flights (T272); the departure airport is remembered for the airport transfer and the traveller's own typed fare, never to price a flight. Row T187-c: build the receipt as designed, line order, provenance rows, receipt.* keys in six catalogues, the carta.firstResultSeen flag and one Set your dates primary. Report the time-to-answer figure. Parse all six i18n files."),
  (["T093"], ["p5-j4-j5-accuracy-signals"], True, "P5", None, "GATE: the owner has OK'd the confidence model. If not, skip this session."),
  (["T327"], ["p9-fact-store-followups"], False, "P9", None,
   "Design and code without a paste: T041-d (suggest-city discoveries as store keys, option only), T041-e (the plan-day cache key folds in the newest fetched_at; bump CACHE_KEY_VERSION once, with T147), T041-f (fold the parking cache into public.facts rows and decide where the aggregator block list lives), T300-n (write the facts store migration the T041 design calls 030_facts.sql under the next free number, and the vault secret names it needs). If T147 has not run yet, write this as the input T147 builds on and leave the migration unwritten; say which."),
  (["T333"], ["p8-upload-path"], True, "P8", None,
   "GATE: the owner has decided T206-c (the OSM permission tick, checked by Legal) and the upload terms. If not, skip this session. Rows T206-b and T068-h; this is also mind-map task T141's legal shape. Report as T141 if you build the whole of T141, otherwise as T333."),
  (["T154"], ["p9-k7-review-flags"], False, "P9", None, "After T145 and T153. Spend the human review budget on flags only."),
 ]),
 (12, "Planner chain and remaining P9", "Wave 11 merged and T099 merged.", [
  (["T100"], ["p6-i3-party-size"], True, "P6", None, "After T099. Planner lane, one per wave."),
  (["T152"], ["p9-d4-cap-prose"], True, "P9", None, "After T146 and T151."),
  (["T155"], ["p9-d2-catalogue-expansion"], False, "P9", None, "Expand the catalogue batched by region. Code and plans only; every catalogue rebuild is a data-lane run the owner starts."),
  (["T159"], ["p10-m1-not-for"], True, "P10", None, "P5 to P9 are far enough along. 'Who this is not for' on every page type, under carta-design."),
  (["T160"], ["p10-coverage-footers"], True, "P10", None, "The honest coverage and provenance footers; reuse T313's 'Where this comes from' footer and T111's reason codes."),
  (["T161"], ["p10-c1-suitability-strip"], True, "P10", None, "GATE: carta-design has a written rule for the strip; if not, write the proposed rule as an owner row and stop."),
  (["T166"], ["p10-c10-one-primary"], True, "P10", None, "One primary action per view."),
  (["T169"], ["p10-m4-booking-order"], True, "P10", None, "Turn bookingWindows into a booking order."),
  (["T184"], ["p10-g1-feedback-100ms"], True, "P10", None, "Visible feedback inside 100 ms."),
  (["T189"], ["p10-loading-error-states"], True, "P10", None, "Loading and error states across every surface; use T211's empty-state copy."),
 ]),
 (13, "P10 UI, part 2", "Wave 12 merged. GATE for C-tasks: carta-design rules exist for InfoDot, carousel, slider, sticky rail and bento (owner).", [
  (["T101"], ["p6-i2-seven-days"], True, "P6", None, "GATE: the owner decided 'price two lengths, or state the assumption'. Planner lane."),
  (["T156"], ["p10-c7-infodot-glossary"], True, "P10", None, "GATE: the owner wrote the carta-design InfoDot rule."),
  (["T158"], ["p10-numbers-as-sentences"], True, "P10", None, "After T156 or in parallel if the InfoDot rule exists."),
  (["T162"], ["p10-c2-day-carousel"], True, "P10", None, "GATE: carousel rule in carta-design."),
  (["T163"], ["p10-c3-day-in-place"], True, "P10", None, "After T162 if both run; otherwise alone."),
  (["T164"], ["p10-c4-collapse-sections"], True, "P10", None, "Collapse every long section, one-line preview."),
  (["T167"], ["p10-c5-flashcards"], True, "P10", None, "GATE: carta-design rule for swipe cards."),
  (["T168"], ["p10-c6-pack-grid"], True, "P10", None, "What to pack as an icon grid; SVG icons only."),
  (["T170"], ["p10-m2-m3-m5-week-shape"], True, "P10", None, "The shape of the week, day zero, the weather fallback."),
  (["T171"], ["p10-m7-m8-m10"], True, "P10", None, "One sentence, three ways out, and the human evidence."),
 ]),
 (14, "P10 UI, part 3", "Wave 13 merged.", [
  (["T102"], ["p6-i4-rail-alternative"], True, "P6", None, "Planner lane."),
  (["T165"], ["p10-c9-sticky-rail"], True, "P10", None, "GATE: sticky rail rule in carta-design."),
  (["T172"], ["p10-e1-stacked-bar"], True, "P10", None, "GATE: the owner decided stacked bar versus carta-design's receipt rule."),
  (["T173"], ["p10-e2-lifestyle-slider"], True, "P10", None, "GATE: slider rule in carta-design. The Lifestyle panel already drives costs (lifestyle pass); extend, do not duplicate."),
  (["T174"], ["p10-e3-e4-elevation-surface"], True, "P10", None, "Elevation profile and surface mix; ElevationChart exists (T177)."),
  (["T175"], ["p10-e5-data-sheet-ui"], True, "P10", None, "After T151's data."),
  (["T178"], ["p10-f5-day-thumbnails"], True, "P10", None, "GATE: T177-b (data lane) has produced the track wire. If not, skip."),
  (["T185"], ["p10-g2-g3-transitions"], True, "P10", None, "Shared element transitions, skeletons never spinners."),
  (["T188"], ["p10-cost-length-filters"], True, "P10", None, "Cost band and trip length filters."),
  (["T190"], ["p10-keyboard-map-a11y"], True, "P10", None, "Keyboard and map accessibility."),
 ]),
 (15, "P10 UI, part 4, and P12 pages", "Wave 14 merged.", [
  (["T103"], ["p6-i5-price-by-month"], True, "P6", None, "Planner lane. Ground costs only; no flight price (T272)."),
  (["T179"], ["p10-5-1-card-bento"], True, "P10", None, "GATE: bento rule in carta-design."),
  (["T180"], ["p10-5-4-detail-skeleton"], True, "P10", None, "The shared detail-page skeleton."),
  (["T181"], ["p10-5-5-signature-visuals"], True, "P10", None, "After T180."),
  (["T182"], ["p10-derived-modules"], True, "P10", None, "After T180."),
  (["T186"], ["p10-g4-quality-floor"], True, "P10", None, "The quality floor; run T196's design lint."),
  (["T193"], ["p10-explore-planner-passes"], True, "P10", None, "Explore tab, Trip Planner and Day Planner passes."),
  (["T194"], ["p10-home-page"], True, "P10", None, "GATE: the owner decided whether the home page is the landing page (with T209)."),
  (["T209"], ["p12-landing-page"], True, "P12", None, "GATE: same decision as T194. Positioning from PRODUCT.md; hikers lead."),
  (["T225"], ["p12-editorial-linking"], True, "P12", None, "After T224. Receipt-based editorial and internal linking; row T226-c (monthly data notes page and Atom feed) if T226-a is decided."),
 ]),
 (16, "P10 last, then gates that need nothing live", "Wave 15 merged.", [
  (["T183"], ["p10-5-3-opening-screens"], True, "P10", None, "Deliberately last of P10."),
  (["T227"], ["p13-legal-gate"], False, "P13", None, "Legal gate: check T300-a, T300-b, T300-c, T300-j, T273-b, T070-e and the Imprint (T300-h) and report pass or fail per item; fixing is not this task."),
  (["T230"], ["p13-data-coverage-gate"], False, "P13", None, "Data and coverage gate."),
  (["T231"], ["p13-perf-a11y-gate"], True, "P13", None, "Performance and accessibility gate; row T207-f: produce a traffic ceiling for Supabase and the hosting; row T061-c: re-run tiles_and_paint_T061.mjs unchanged against production."),
  (["T336"], ["p12-launch-outreach-drafts"], False, "P12", None, "Row T208-c: the courtesy note to the bodies credited in attribution.js and the co-announce question for the L1 to L3 partners, added to the T220 runway. Row T204-b: check that every channel in T207 and T208 was tested against the EUR 0.17 ceiling in docs/GTM-ACQUISITION-CONSTRAINT.md and close the row. Drafts only; nothing is sent."),
  (["T235"], ["p13-uptime-alerting"], True, "P13", None, "Uptime and error alerting; rows T218-b (heartbeat), T218-e (rehearse the five runbook responses after T218-b)."),
  (["T233"], ["p13-terrain-mirror"], True, "P13", None, "Mirror the Mapterhorn terrain PMTiles to R2; this is also mind-map T135 (one task). The upload is an owner step written as commands. Row T177-c (hillshade host and credit) is the owner's choice first."),
 ]),
 ("16b", "Catch-up after the owner's decisions, part 1", "Wave 16 merged and T362 merged (the owner answered block A of Execution/_OWNER-RUNBOOK.md on 2026-10-07).", [
  (['T156', 'T158'], ['p10-c7-infodot-glossary', 'p10-numbers-as-sentences'], True, 'P10', None,
   'GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): the InfoDot rule is in the carta-design skill (Components, InfoDot). Build exactly to it; T158 after T156 in the same worktrees.'),
  (['T162'], ['p10-c2-day-carousel'], True, 'P10', None,
   'GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): the Day track rule is in the carta-design skill. T163 (day detail in place) is already merged; keep it working.'),
  (['T167'], ['p10-c5-flashcards'], True, 'P10', None,
   'GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): the Flashcards rule is in the carta-design skill: visible buttons, keyboard, Show all, square corners.'),
  (['T165'], ['p10-c9-sticky-rail'], True, 'P10', None,
   'GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): the Sticky section rail rule is in the carta-design skill.'),
  (['T173'], ['p10-e2-lifestyle-slider'], True, 'P10', None,
   'GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): the Lifestyle control rule: extend the existing Lifestyle panel control, never a second slider.'),
  (['T172'], ['p10-e1-stacked-bar'], True, 'P10', None,
   "GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): keep the receipt as the signature and add the stacked bar only as a summary above it, per 'The cost bar' in the carta-design skill."),
  (['T179'], ['p10-5-1-card-bento'], True, 'P10', None,
   'GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): NO bento grid. Build the one card with five fillings (5.1); slot 6 of the detail skeleton stays the collapsed row list (T164, T180-a).'),
  (['T099', 'T100'], ['p6-i1-first-run', 'p6-i3-party-size'], True, 'P6', None,
   'GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): docs/FIRST_RUN_RESULT.md (T211-d) and docs/ONBOARDING_AND_EMPTY_STATES.md (T211-a) are approved, including: Destinations opens on walks, default dates from the calendar (the next week starting on a Saturday at least four weeks out), the airport asked only in the flight door. Carta prices no flights (T272). Row T187-c: build the receipt as designed, receipt.* keys in six catalogues, carta.firstResultSeen, one Set your dates primary; report the time-to-answer figure. T100 after T099 in the same worktrees. Planner lane.'),
  (['T209', 'T194'], ['p12-landing-page', 'p10-home-page'], True, 'P12', None,
   "GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): the home page and the landing page are ONE page. T209 builds it (positioning from PRODUCT.md, hikers lead, the receipt demonstration, honest coverage, one primary action); T194 then makes the app's home that same page, in the same worktrees. It must agree with the approved onboarding document."),
  (['T363'], ['p10-contrast-tokens'], True, 'P10', None,
   "Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): darken the tokens. The proposed values are in DESIGN.md under 'Contrast tokens, change pending': --ink-mute #646978 and --accent #ce3823, with --accent-hover and --accent-press stepped darker; check --accent on --accent-bg too. Change src/styles/01-tokens.css and DESIGN.md in one commit (CLAUDE.md), and the carta-design skill's colour table. Before and after screenshots of Explore, a destination page, a journey page and the trip planner at 380 and 1280 px, saved beside the report. HOLD: the orchestrator merges this session only after the owner has seen the screenshots; raise an owner row asking for that look."),
 ]),
 ("16c", "Catch-up after the owner's decisions, part 2", "Wave 16b merged.", [
  (['T101', 'T188'], ['p6-i2-seven-days', 'p10-cost-length-filters'], True, 'P6', None,
   'GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): price TWO lengths: every trip also gets a short version (its 3 or 4 best days, with its own total) beside the full week, as spec I2 says. T188 then builds the cost band and trip length filters on it, in the same worktrees. Planner lane.'),
  (['T124', 'T367'], ['p7-honest-stub', 'p10-empty-states'], True, 'P7', None,
   "GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): docs/ONBOARDING_AND_EMPTY_STATES.md is approved. T124 ships the honest stub and the not_applicable empty state (spec 6.5 and 1.6) with row T111-b; T367 then implements row T211-b (every empty state in the document's tables, the coverage module, the five vanishing detail-page sections) in the same worktrees, reusing what T124 built. Six catalogues."),
  (['T326'], ['p12-feedback-front-door'], True, 'P12', None,
   "GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): option A in docs/FEEDBACK-LOOP.md, with the link beside the price chips too. Row T219-b: the link on DestinationPage, TrailPage, BeachPage, LakePage, MountainPage and the cycling page and beside the price chips, the form as a sheet, the report key in the feedback context, and the Open in Content button in FeedbackInbox.jsx. It degrades to kind 'other' until migration 047 is pasted."),
  (['T089'], ['p5-a5-orphan-fields'], True, 'P5', None,
   'GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): surface tags as filters you can scan; strip basecamps and snapshot from the build unless a screen reads them. Journey lane app side.'),
  (['T093'], ['p5-j4-j5-accuracy-signals'], True, 'P5', None,
   'GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): the K3 confidence model (sourced, derived, estimated per field) is the one source for all three accuracy signals.'),
  (['T333'], ['p8-upload-path'], True, 'P8', None,
   "GATE CLOSED. Owner decision 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A): a separate per-upload tick 'OpenStreetMap may use this track under its contributor terms', its wording to be checked against the OSMF waiver template by a lawyer before launch (owner step J4; raise the row). Rows T206-b and T068-h; this is also mind-map task T141's legal shape."),
  (['T364', 'T368'], ['p10-owner-ui-calls', 'p10-owner-copy-calls'], True, 'P10', None,
   'Rows T362-b (T364) then T362-c and T362-f (T368), in the same worktrees. Every call is decided; build exactly what the row says, under carta-design (the Compact controls and Install hint rules are in the skill).'),
  (['T365'], ['p4-migration-051'], True, 'P4', '051',
   "Row T362-d. Migration 051 carries the owner's moderation and admin decisions; 049 is reserved for T147 and 050 for T330. Self-check notice, down block, paste position after 048 in an owner row. The Terms content rule (T070-c) is drafted in TermsOfService.jsx and marked for the owner's legal review (step J4). Never touch an existing migration file."),
  (['T366'], ['p3-owner-housekeeping'], False, 'P3', None,
   'Row T362-e. EXCEPTION to rule 4: run_pipeline.py, only to move the monthly flight_times task to manual cadence (T255-a) and to add --footprint to the lodging task (T311-b); no pipeline run.'),
 ]),
 (17, "GATED: stages 2 and 3 pasted (owner)", "_OPEN-MASTER stages 2 and 3 done, with pg_cron and pg_net on.", [
  (["T147"], ["p9-k6-fact-store"], True, "P9", "049",
   "Migration 049 (the facts store T041 designed as 030_facts.sql, rows T300-n and T041-b), self-check notice and down block; build on T327. The owner then creates the vault secrets refresh_facts_url and refresh_facts_key. Gemini only."),
  (["T148"], ["p9-grounding-allowance"], True, "P9", None, "Decision made: the owner chose 10 on the Trip Pass and 30 on the Year Pass (T041-a, 2026-10-07); the wave gate (stages 2 and 3) still applies. Update only the grounded column and the six pass.featSearchOn strings; never re-run the 007 insert."),
  (["T149"], ["p9-k9-fill-mode"], True, "P9", None, "Run the pipeline in fill mode over the existing 253 first (Gemini, real tokens; the owner OKs the budget)."),
  (["T081"], ["p4-silent-failure-alerts"], False, "P4", None, "Decision made: alerts go by email to the owner, the same route as the Healthchecks.io heartbeat (T081, 2026-10-07). Live proof waits for stage 7.9."),
 ]),
 (18, "GATED: stage 7 done (the CAX11 box runs the weekly pipeline)", "_OPEN-MASTER stage 7.9 done.", [
  (["T079"], ["p4-volatility-cadence"], False, "P4", None, "EXCEPTION to rule 4: run_pipeline.py for the cadence enforcement."),
  (["T080"], ["p4-deterministic-rollbacks"], False, "P4", None, "Formalise deterministic catalogue rollbacks on the R2 archive."),
  (["T328"], ["p3-box-era-followups"], False, "P3", None, "Rows T072-c (report_pipeline_run inside a real run), T072-d (more layer counts), T255-b (TimeoutStartSec from the first real run), T048-h (monthly and quarterly tasks on arm64), T047-i (trailslab reads the built Valhalla tiles), T047-j (pin the digest SOURCE.txt recorded), T269-g (time the derive.py sources pass on the box), T297-a then T054-h (the regeneration path for continent-app/public from r2:carta/data/ or the box exports, decided and built, then the untrack retried with its runbook). EXCEPTION: infra/hetzner and run_pipeline.py for these rows."),
 ]),
 (19, "GATED: stage 8 done (images on the CDN)", "_OPEN-MASTER stage 8.6 done for beaches at least.", [
  (["T329"], ["p3-d5b-cdn-everywhere"], True, "P3", None, "Rows T052-f, T053-a, T052-d, T075-c. EXCEPTION: public/_headers and vercel.json, only removing the Wikimedia and Geograph hosts once verify_csp.mjs shows none used."),
  (["T127"], ["p8-commons-flickr-bearing"], False, "P8", None, "GATE: the owner has a Flickr API key."),
  (["T128"], ["p8-mapillary"], False, "P8", None, "Check Mapillary's licence and terms first."),
  (["T129"], ["p8-panoramax"], False, "P8", None, "The long-term bet."),
  (["T131"], ["p8-terrain-render"], False, "P8", None, "Full runs on the CAX41."),
  (["T134"], ["p8-captions-walk-order"], True, "P8", None, ""),
  (["T136"], ["p8-3d-heroes-flyover"], True, "P8", None, "After T233."),
  (["T137"], ["p8-derived-layers"], True, "P8", None, ""),
  (["T138"], ["p8-activity-heroes"], False, "P8", None, "Row T126-a: measure vision_prompt.py against the labelled set on Gemini (label the four non-lake sections first)."),
  (["T139"], ["p8-1600-floor-srcset"], True, "P8", None, ""),
 ]),
 (20, "GATED: stage 8 tail and stage 10 (Stripe live)", "Stage 10 done for T210 onward.", [
  (["T140"], ["p8-named-highlights"], False, "P8", None, ""),
  (["T334"], ["p10-route-track-followups"], True, "P10", None, "GATE: T177-b has run in the data lane. Rows T177-d, T206-f, T176-a."),
  (["T210"], ["p12-pricing-page"], True, "P12", None, "Pricing page and paywall copy from lib/pricing.js TIERS; no fabricated social proof. Row T202-b: re-read the competitor prices in T202 when the pricing.js WHY THESE NUMBERS block changes."),
  (["T330"], ["p2-refunds-migration"], True, "P2", "050", "Row T217-b: refunded_cents, refunded_at, refund_id on pass_grants, a webhook branch for charge.refunded and charge.dispute.closed, netted in admin_margin and admin_oss_threshold. 044 replaced both RPCs, so 050 starts from 044's bodies and pastes after 044 in stage 10."),
  (["T228"], ["p13-payments-gate"], False, "P13", None, ""),
  (["T229"], ["p13-ai-cost-gate"], False, "P13", None, ""),
  (["T234"], ["p13-affiliate-tracking"], True, "P13", None, "Builds on T315's click counter."),
  (["T331"], ["p12-store-pwa-followups"], True, "P12", None, "Rows T246-b (an installed-or-browser flag on paywall events), T246-c (the Stripe round trip from an installed app on a real phone, owner-assisted), T216-c (send each canned answer once)."),
 ]),
 (21, "After launch (P14)", "T236 launch done.", [
  (["T237"], ["p14-price-test"], True, "P14", None, ""),
  (["T238"], ["p14-year-pass-mix"], True, "P14", None, ""),
  (["T239"], ["p14-seo-surface"], True, "P14", None, "Rows T205-e (Duplicate count on trails and cycling sitemaps), T220-e."),
  (["T240"], ["p14-four-numbers"], False, "P14", None, "Monthly."),
  (["T241"], ["p14-tier-upgrades"], False, "P14", None, "Only when triggered."),
  (["T242"], ["p14-incremental-property"], False, "P14", None, ""),
  (["T243"], ["p14-funnel-numbers"], True, "P14", None, "Row T214-d if route-level traffic is wanted."),
  (["T244"], ["p14-break-even"], False, "P14", None, "Haiku tasks have invented figures before: cite every number to a file."),
  (["T245"], ["p14-accommodation-affiliates"], False, "P14", None, ""),
 ]),
]

DATA_LANE = [
    ("T104", "Read type=superroute (with T105 in one run)"), ("T105", "Group by cycle_network"),
    ("T120", "Ingest EuroVelo"), ("T123", "Parent pages for stage families"),
    ("T106", "Named-ways derivation everywhere (verify)"), ("T110", "HydroLAKES and GLOBathy pool"),
    ("T114", "Switzerland"), ("T115", "Norway"), ("T116", "France"), ("T117", "Spain"), ("T118", "UK"),
    ("T119", "BE, DE, IT, FI, SE, NL"), ("T122", "Three entities, peak target about 5,000 (owner, 2026-10-07)"),
    ("T133", "Pick the viewpoint from data"), ("T109", "Beaches and lakes on EEA bathing water"),
    ("T125", "Sort by fame; NO cap in any country, list broadly (owner, 2026-10-07)"),
]


def model_of(t, rows, topics, notes):
    if t in REG:
        return REG[t][0]
    return task_model.model_for(t, rows, topics, notes)


def reg_body(t, folder):
    model, title, regrows = REG[t]
    return (
        f"# {t}: {title}\n"
        f"(register rows {regrows}; no mind-map prompt exists for it)\n\n"
        f"WHAT  Read each of these rows in Execution/_OPEN.md: {regrows}. For each, read the report of the task\n"
        f"that raised it (Execution/P*/<raiser>-*.md) in full, then do what the row asks, within the scope in the\n"
        f"notes above. Mark each row you resolve as Status \"closed by {t}\" in Execution/_OPEN.md (never delete\n"
        f"rows). If a row needs the owner or a later rollout stage, leave it open and say why.\n\n"
        f"DONE WHEN  Every listed row is closed, or left open with a written reason; the tests the source reports\n"
        f"name pass; every screen you touched was checked in the browser at 380px and desktop width.\n\n"
        f"REPORT  Execution/{folder}/{t}-<short-slug>.md, following Execution/_TEMPLATE.md. Plain prose, short\n"
        f"sentences, before/after measurements where a number moved, a rollback procedure, what is still open."
    )


def header(n, k, total, row, models):
    tasks, branches, app, folder, mig, notes = row
    t1, b1 = tasks[0], branches[0]
    port = 5200 + k
    lines = [
        f"Carta. Wave {n}, session {k} of {total}: {' then '.join(tasks)}. Model: {' then '.join(models)}.",
        f"First read the SESSION RULES at the top of {MAIN}\\Execution\\_WAVES.md and follow them,",
        "then CLAUDE.md in your root worktree, and the carta-design skill before any visual change.",
        "",
        "WHERE TO WORK",
        f"Root worktree (sparse): {WT}\\{t1}    branch {b1}",
    ]
    if app:
        lines.append(f"App worktree (continent-app): {WT}\\{t1}-app    branch {b1}")
    lines.append("If it does not exist yet, create it from the main checkout, one at a time:")
    lines.append(f"  cd \"{MAIN}\"; powershell -File Execution/_queue/wave_worktree.ps1 -Task {t1} -Branch {b1}{' -App' if app else ''}")
    if len(tasks) > 1:
        lines.append(f"Two tasks in order: finish {t1} on {b1} with its report and commits, then in each worktree run")
        lines.append(f"`git checkout -b {branches[1]}` and do {tasks[1]} with its own report.")
    lines += [
        "",
        f"Task number(s): {', '.join(tasks)}. Report folder: Execution/{folder}/. Ports: Vite {port}, throwaway Postgres {55440 + k}.",
        f"New migration allowed: {mig if mig else 'none'}." + (" Self-check raise notice and a down block; state its paste position in the report and in an owner row." if mig else ""),
        "",
        "NOTES FOR THIS SESSION (these override the task text below where they disagree)",
        notes or "None beyond the session rules.",
    ]
    return "\n".join(lines)


RULES = r"""## Session rules (every prompt below starts by pointing here)

1. Work only in your worktrees under `C:\Users\Gebruiker\Documents\Portfolio\wt\`. The main checkout
   is read-only reference: never write, commit or switch branches there (a haiku session wrote
   register rows into it in wave 5 and blocked the merge). Root repo branch is `main`; the app repo
   (`continent-app/`, a separate git tree) is `master`.
2. Commit in both repos if you changed both. Run `git show --stat` after every commit and check that
   only in-scope files changed.
3. Use only your task number(s) for the branch, report and register rows. Report in
   `Execution/P{n}/<TASK>-<slug>.md` per `Execution/_TEMPLATE.md`. Append one register row per open
   item at the bottom of `Execution/_OPEN.md` (ID, Raised by, Item, Owner, Status, Order). Mark rows
   you resolve `closed by <TASK>`; never delete a row.
4. Never touch, unless your notes grant an "EXCEPTION to rule 4" by name and then only as narrowly as
   they say: existing files in `supabase/migrations/` (001 to 047 and any migration another wave
   added), `continent-app/vercel.json`, `public/_headers`, `public/_redirects`, `wrangler.toml`,
   `scripts/build-pages.mjs`, `scripts/check-pages-limits.mjs`, `scripts/r2/`, the `ci` and
   `build:pages` scripts in `package.json`, `.gitignore`, `infra/hetzner/`, `pipeline/archive/`,
   `run_pipeline.py`, `Execution/_OPEN-MASTER.md`, `Execution/_ORDER.md`, `Execution/_WAVES.md`,
   `PARALLEL-WAVES-PLAN.md`, or any package dependency (`node_modules` is shared).
5. No data writes: no `run_pipeline.py`, nothing into `app_data/`, `cache/`, `data/`, the trailslab
   database (port 5433), R2 or production. Never commit generated `continent-app/public/**`,
   `dist/` or `dist-data/`; delete `dist/` and `dist-data/` after any build (the disk once hit 0
   bytes). The laptop no longer holds `data/raw` or eleven cache layers (T045-e, partial); if a task
   needs them, stop and write an owner row (`python pipeline/archive/push.py --pull` restores them).
6. Ports: Vite on 5200 + session number, a throwaway Postgres on 55440 + session number. Never 5432,
   5433 or 55434.
7. Never push, never deploy, never paste a migration into the live project. Never call the
   Claude/Anthropic API; runtime and pipeline AI is Gemini only. carta-design wins every visual call.
   No em dashes and no middot separators anywhere. A step that needs the owner (a Dashboard, a
   secret, a paste, a deploy, a decision) becomes an open register row with Owner `user`; carry on.
8. If you edit any `src/i18n` file, parse all six before committing, in the app worktree:
   `for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done`
9. Every figure you write cites the file it came from; grep it there first (haiku sessions invented
   figures in waves 3 and 4).
10. Finish with: branch names, commit hashes in both repos, report path(s), register row ids, and
    anything the orchestrator must know before merging.
"""

HOWTO = r"""# Waves from wave 6 onward

Written 2026-10-02 by T300, after every report up to T294 was fact-checked
(`Execution/P0/T300-factcheck-and-open-consolidation.md`). Each wave is ten
sessions (fewer where a gate leaves fewer ready). One Fable orchestrator runs a
wave; each session runs as a subagent on the model named in its heading. The
model comes from the task's MODEL line in the mind map (via
`Execution/_queue/task_model.py`); register-row tasks use the model fixed in
`Execution/_queue/waves_md.py`. Regenerate this file with
`python Execution/_queue/waves_md.py` after editing a table there.

The owner's tasks are not here; since 2026-10-07 they are in `Execution/_OWNER-RUNBOOK.md`
(blocks A to K, with the owner's answers in block A), which supersedes
`Execution/_OPEN-MASTER.md` Part E for reading. A wave marked GATED waits for the
rollout stage or owner decision in its gate line. A session marked GATE inside a ready wave is skipped (and moved to the
next wave) when its owner decision is still open.

Where things stand at the time of writing: waves 1 to 5 merged; stages 0, 1, 4,
5 and 6 of `_OPEN-MASTER.md` done (production on Cloudflare Pages, data on R2),
root `main` and app `master` NOT pushed (main is about 160 commits ahead of
origin); stages 2, 3, 7, 8 and 10 not started. Task numbers T281 to T287 and
migration 047 are reserved for wave 6, T310 to T334 for the register-row tasks
below, migrations 048 to 050 as marked. T298 and T299 are left free for other
sessions.

## How the orchestrator runs a wave ("do wave N from Execution/_WAVES.md")

Part A of `PARALLEL-WAVES-PLAN.md` is the detailed version; this is the short one.

1. Preflight, stop and tell the owner if any check fails: no modified tracked
   files in either repo (`git status --porcelain`, `git -C continent-app status
   --porcelain`); no `run_pipeline.py` or `run_queue.ps1` running; the previous
   wave is merged; the gate line of this wave is met; at least 20 GB free on C:.
   Record both bases (`git rev-parse main`, `git -C continent-app rev-parse master`).
2. Create the worktrees one after another with `wave_worktree.ps1` (never in
   parallel; git locks the repository).
3. Launch every session of the wave in one message as background subagents, each
   with its prompt below copied verbatim and the model in its heading. A row with
   two tasks on two models runs as two sessions, one after the other, in the same
   worktrees. If a model hits its usage limit, relaunch after the reset and tell
   it to review the uncommitted work it finds.
4. For each session: `git log --stat <base>..<branch>` in both repos; every path
   must fit the row's scope and rule 4; a report must exist. Then run
   `powershell -File Execution/_queue/wave_gate.ps1 -Task <TASK> -Branch <branch>`
   (add `-App` when the row has an app worktree); it must exit 0. Otherwise hold it
   and say why in the wave log at the end of this file.
5. Merge in table order with `bash Execution/_queue/merge_branch.sh` (root into
   `main`, then the app into `master`), run `python Execution/_queue/dedupe_open.py`,
   make the root mirror commit (`git add -u continent-app`), then in continent-app
   `npm run build` and `npm run lint` must pass; delete `dist/` and `dist-data/`.
   Parse the six i18n files again. Run the safety diff: nothing in rule 4's list
   changed except where a row granted an exception.
6. Remove the worktrees, write the wave log line, report to the owner (merged or
   held per session, new migrations and their paste position, new owner rows),
   and ask before any push. Production is Cloudflare Pages by direct upload
   (T293), so a push no longer deploys by itself, but `origin/main` is what a
   future box clone and any git-based build read.

The data lane is never inside a wave: one session at a time, owner-started, with
the inputs pulled back from R2 first (see the end of this file).
"""


def main():
    rows, topics, notes = xmind_prompt.order_rows(), xmind_prompt.map_topics(), task_model.map_notes()
    out = [HOWTO, RULES, "## The waves at a glance\n"]
    for n, title, gate, wrows in WAVES:
        out.append(f"### Wave {n}: {title}\n\nGate: {gate}\n")
        out.append("| k | Task | Model | Branch | App | Folder | Migration |")
        out.append("|---|---|---|---|---|---|---|")
        for k, r in enumerate(wrows, 1):
            tasks = r[0]
            ms = [model_of(t, rows, topics, notes) for t in tasks]
            label = []
            for t in tasks:
                if t in REG:
                    label.append(f"{t} {REG[t][1]}")
                else:
                    label.append(f"{t} {rows[t]['title']}")
            out.append(f"| {k} | {' then '.join(label)} | {' then '.join(ms)} | {', then '.join(r[1])} | "
                       f"{'yes' if r[2] else 'no'} | {r[3]} | {r[4] or ''} |")
        out.append("")
    out.append("## Data lane (never inside a wave, one session at a time, owner-started)\n")
    out.append("Each needs `data/raw` and the trailslab, which the T045-e clean-out removed from the laptop: first "
               "`python pipeline/archive/push.py --pull` (owner), and no laptop pipeline run active. Each rebuild is "
               "the owner's call. After stage 7 these move to the box or a CAX41. Also in this lane, as owner rows: "
               "the journeys wire rebuild (T085-a, T087-a), trail titles and fixes going live (T107-a, T108-g), the "
               "famous registry rescan (T113-a), the coverage rerun (T111), the trails export with the credit gate "
               "(T280-a), the route track wire (T177-b), and reading the title rung mix from the first real attributes.py run (T107-c).\n")
    out.append("| Order | Task | Model | What |")
    out.append("|---|---|---|---|")
    for i, (t, what) in enumerate(DATA_LANE, 1):
        out.append(f"| {i} | {t} | {task_model.model_for(t, rows, topics, notes)} | {what} |")
    out.append("\nThe prompt for any data-lane task: `python Execution/_queue/xmind_prompt.py <TASK>`; add the line "
               "'Data lane: you may run the pipeline for this task only, in the main checkout, after the owner "
               "confirms the inputs are pulled; nothing else runs meanwhile.'\n")
    out.append("## Not in any wave\n")
    out.append("T135 is done as T233 (wave 16, one task) and T141 as T333 (wave 11). Owner only: T014 entity, T015 VAT answer, T016 bookkeeping, T095 hand pricing, T232 Supabase Pro, "
               "T236 launch. Gated in P15: T247 App Store and T248 Play Store after the owner's store accounts "
               "(T272-b; Android first), T249 at about 5,000 destinations, T250 node-network routing (T121-a), "
               "T251 if Carto changes its terms.\n")
    out.append("---\n\n# The prompts\n")
    for n, title, gate, wrows in WAVES:
        out.append(f"## Wave {n} prompts\n")
        for k, r in enumerate(wrows, 1):
            tasks = r[0]
            ms = [model_of(t, rows, topics, notes) for t in tasks]
            bodies = []
            for t in tasks:
                if t in REG:
                    bodies.append(reg_body(t, r[3]))
                elif t == "T197":
                    bodies.append("# T197b: one shared Button (row T197-d)\nSee the notes above; the original T197 "
                                  "prompt is done and must not be redone.")
                else:
                    bodies.append(wave_prompts.plan_body(t, rows, topics))
            prompt = header(n, k, len(wrows), r, ms) + "\n\nTHE TASK\n\n" + "\n\n---- next task ----\n\n".join(bodies)
            prompt = wave_prompts.no_dashes(prompt).replace(" · ", ": ")
            split = ""
            if len(set(ms)) > 1:
                split = (f"\nModels differ: run {tasks[0]} on {ms[0]} first (only {tasks[0]}), then {tasks[1]} on "
                         f"{ms[1]} in the same worktrees.\n")
            out.append(f"### Wave {n}, session {k}: {' + '.join(f'{t} ({m})' for t, m in zip(tasks, ms))}\n{split}\n"
                       f"~~~~text\n{prompt}\n~~~~\n")
    out.append("---\n\n# Wave log\n\nThe orchestrator adds one line per wave: date, merged and held sessions with the "
               "reason, new migrations and their paste position, push yes or no.\n\n"
               "- Waves 1 to 5: see the wave log in PARALLEL-WAVES-PLAN.md (all merged 2026-10-02, not pushed).\n")
    text = "\n".join(out)
    text = text.replace("\u2014", ", ").replace("\u2013", " to ").replace(" \u00b7 ", ": ")
    OUT.write_text(text, encoding="utf-8")
    n_sessions = sum(len(w[3]) for w in WAVES)
    print(f"wrote {OUT} with {len(WAVES)} waves and {n_sessions} sessions")


if __name__ == "__main__":
    main()
