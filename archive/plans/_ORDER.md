# Carta — execution order

Every task in the plan, in the order to do them. Work down this list.

The only things NOT in this list are the ten long-lead items (L1-L10), which you
start in week 1 and which land on someone else's clock, and the gated items in
P15, which wait for a named trigger.

One task, one Claude Code session, one report. Tick a line when its report exists.

| # | Task | Phase | Model | Effort | Report |
|---|---|---|---|---|---|
| T001 | Create the Execution folder structure | P0 | Haiku 4.5 | 1 h | `Execution/P0/T001-report-convention.md` |
| T002 | Write CLAUDE.md working rules for this plan | P0 | Haiku 4.5 | 1 h | `Execution/P0/T002-claude-code-working-rules.md` |
| T003 | Branch and tag the current production state | P0 | Haiku 4.5 | 30 min | `Execution/P0/T003-git-baseline.md` |
| T004 | Full Supabase pg_dump, encrypted, off the laptop | P0 | Opus 5 | 1 h | `Execution/P0/T004-database-backup.md` |
| T005 | Preserve the five app_data masters before deleting four | P0 | Haiku 4.5 | 30 min | `Execution/P0/T005-master-snapshot-preservation.md` |
| T006 | Verify arm64 coverage for every pinned container | P0 | Fable 5.1 | 3 h | `Execution/P0/T006-arm64-coverage-audit.md` |
| T007 | Count the real image corpus from the caches, not the wire | P0 | Opus 5 | 2 h | `Execution/P0/T007-image-corpus-count.md` |
| T008 | Measure real AVIF sizes on 200 of your own photographs | P0 | Haiku 4.5 | 2 h | `Execution/P0/T008-avif-size-measurement.md` |
| T009 | Count files in continent-app/public against the 20,000 Pages ceiling | P0 | Haiku 4.5 | 30 min | `Execution/P0/T009-pages-file-count.md` |
| T010 | Re-read the licence ledger for storable-copy rights | P0 | Haiku 4.5 | 2 h | `Execution/P0/T010-storable-copy-licence-audit.md` |
| T011 | Record the pre-migration baseline | P0 | Opus 5 | 2 h | `Execution/P0/T011-performance-and-cost-baseline.md` |
| T012 | Publish the statutory Imprint | P1 | Haiku 4.5 | 1 h | `Execution/P1/T012-imprint.md` |
| T013 | Draft and publish the Terms of Service | P1 | Fable 5.1 | 4 h + lawyer | `Execution/P1/T013-terms-of-service.md` |
| T014 | Decide and register the business entity | P1 | you, not Claude | 3 h | `Execution/P1/T014-entity-registration.md` |
| T015 | Get the VAT answer in writing from an accountant | P1 | you, not Claude | 1 h | `Execution/P1/T015-vat-treatment.md` |
| T016 | Set up bookkeeping and a cost ledger | P1 | you, not Claude | 2 h | `Execution/P1/T016-bookkeeping-and-cost-ledger.md` |
| T017 | Add the lawful-basis table and retention periods to the privacy policy | P1 | Haiku 4.5 | 1 h | `Execution/P1/T017-lawful-basis-and-retention.md` |
| T018 | Confirm vendor DPAs, especially Gemini | P1 | Opus 5 | 1 h | `Execution/P1/T018-vendor-dpas.md` |
| T019 | Verify the map attribution control is visible | P1 | Haiku 4.5 | 15 min | `Execution/P1/T019-map-attribution.md` |
| T020 | Build the GDPR Article 20 data export | P1 | Opus 5 | 4 h | `Execution/P1/T020-gdpr-data-export.md` |
| T021 | Close the remaining licence ledger rows | P1 | Haiku 4.5 | 2 h | `Execution/P1/T021-licence-ledger-close.md` |
| T022 | EUIPO search and the Article 30 record | P1 | Haiku 4.5 | 1.5 h | `Execution/P1/T022-trademark-and-article-30.md` |
| T023 | Reclaim tens of GB locally, for free | P1 | Sonnet 5 | 3 h | `Execution/P1/T023-local-disk-reclaim.md` |
| T024 | Move off Vercel Hobby to Cloudflare Pages | P1 | Opus 5 | 6 h | `Execution/P1/T024-cloudflare-pages-migration.md` |
| T025 | Untrack generated build artifacts from git | P1 | Haiku 4.5 | 2 h | `Execution/P1/T025-untrack-build-artifacts.md` |
| T026 | Reclaim 3.1 GB of .git via history rewrite — GATED | P1 | Opus 5 | 4 h | `Execution/P1/T026-git-history-rewrite.md` |
| T252 | Reclaim about 900 MB of .git with gc and LFS prune, no history rewrite, after a verified mirror backup (decided 2026-09-24 from the T026 measurements) | P1 | Sonnet 5 | 1 h | `Execution/P1/T252-git-gc-and-lfs-prune.md` |
| T027 | Delete orphaned frontend components, keep the URL logic | P1 | Haiku 4.5 | 3 h | `Execution/P1/T027-orphaned-components.md` |
| T028 | Classify 47 pipeline scripts into three tiers | P1 | Sonnet 5 | 4 h | `Execution/P1/T028-classify-pipeline-scripts.md` |
| T029 | Audit run_pipeline.py and expand the CI gates | P1 | Opus 5 | 8 h | `Execution/P1/T029-pipeline-audit-and-ci.md` |
| T030 | Audit Stripe Price objects against plan_tiers | P2 | Opus 5 | 2 h | `Execution/P2/T030-stripe-price-audit.md` |
| T031 | End-to-end purchase test in test mode, both tiers | P2 | Opus 5 | 3 h | `Execution/P2/T031-stripe-purchase-e2e.md` |
| T032 | Wire the 14-day withdrawal waiver into checkout | P2 | Opus 5 | 2 h | `Execution/P2/T032-withdrawal-waiver.md` |
| T033 | Confirm Stripe Tax and set an OSS threshold monitor | P2 | Opus 5 | 2 h | `Execution/P2/T033-stripe-tax-and-oss.md` |
| T034 | Instrument the paywall funnel before launch, not after | P2 | Sonnet 5 | 3 h | `Execution/P2/T034-paywall-funnel-instrumentation.md` |
| T035 | Attach billing to the Gemini project and prove the posture | P2 | Opus 5 | 2 h | `Execution/P2/T035-gemini-billing-posture.md` |
| T036 | Set hard budget caps and alerts in Google Cloud | P2 | Haiku 4.5 | 2 h | `Execution/P2/T036-gemini-budget-caps.md` |
| T037 | Verify ai_consume, ai_refund and the grounded counter | P2 | Opus 5 | 3 h | `Execution/P2/T037-ai-quota-enforcement-tests.md` |
| T038 | Log the model fallback chain | P2 | Haiku 4.5 | 2 h | `Execution/P2/T038-model-fallback-logging.md` |
| T039 | Normalise the ai_plan_cache key (Lever 2) | P2 | Opus 5 | 6 h | `Execution/P2/T039-cache-key-normalisation.md` |
| T040 | Trim the prompt, not the output (Lever 3) | P2 | Sonnet 5 | 4 h | `Execution/P2/T040-prompt-token-trim.md` |
| T041 | Design per-fact grounding (Lever 1) — design now, build in P9 | P2 | Fable 5.1 | 6 h design | `Execution/P2/T041-per-fact-grounding-design.md` |
| T042 | Build the AI usage rollup RPC and admin view | P2 | Opus 5 | 6 h | `Execution/P2/T042-ai-usage-telemetry.md` |
| T043 | Build the margin dashboard | P2 | Opus 5 | 4 h | `Execution/P2/T043-margin-dashboard.md` |
| T044 | Create the R2 bucket, four prefixes, two custom domains | P3 | Sonnet 5 | 4 h | `Execution/P3/T044-r2-bucket-and-domains.md` |
| T045 | Move the cold archive to R2 and stop the laptop being the system of record | P3 | Sonnet 5 | 4 h | `Execution/P3/T045-archive-to-r2.md` |
| T046 | Provision the always-on CAX11 orchestrator | P3 | Sonnet 5 | 6 h | `Execution/P3/T046-cax11-orchestrator.md` |
| T047 | Build the on-demand CAX41 spawn-and-destroy flow | P3 | Opus 5 | 8 h | `Execution/P3/T047-on-demand-cax41.md` |
| T048 | Port the Windows Scheduled Task to cron, task by task | P3 | Opus 5 | 6 h | `Execution/P3/T048-pipeline-cron-migration.md` |
| T049 | Build derive.py: content-addressed AVIF and WebP ladder | P3 | Opus 5 | 14 h | `Execution/P3/T049-image-derivative-ladder.md` |
| T050 | Extend takedown.py to reach R2 in the same change | P3 | Sonnet 5 | 3 h | `Execution/P3/T050-takedown-reaches-r2.md` |
| T051 | Keep attribution attached to the pixels | P3 | Opus 5 | 3 h | `Execution/P3/T051-attribution-follows-pixels.md` |
| T052 | Switch the app to <picture> + srcset, behind a flag, one layer at a time | P3 | Opus 5 | 12 h | `Execution/P3/T052-picture-srcset-rollout.md` |
| T053 | Tighten the CSP once Wikimedia hosts are unused | P3 | Haiku 4.5 | 2 h | `Execution/P3/T053-csp-tighten.md` |
| T054 | Split the wire by access pattern and move shards to R2 | P3 | Opus 5 | 12 h | `Execution/P3/T054-wire-shards-to-r2.md` |
| T055 | Re-measure and close the phase | P3 | Sonnet 5 | 3 h | `Execution/P3/T055-post-migration-measurement.md` |
| T056 | Remove fare runtime reads | P3 | Opus 5 | 6 h | `Execution/P3/T056-remove-fare-runtime-reads.md` |
| T057 | Remove obsolete fare metadata from the payload | P3 | Haiku 4.5 | 4 h | `Execution/P3/T057-remove-obsolete-fare-metadata.md` |
| T058 | DECIDE the flight-cost input structure | P3 | Fable 5.1 | 4 h | `Execution/P3/T058-flight-cost-input-decision.md` |
| T059 | Shard app data by region and viewport | P3 | Opus 5 | 8 h | `Execution/P3/T059-shard-by-region-viewport.md` |
| T060 | Reduce the POI payload and lazy-load map layers | P3 | Sonnet 5 | 6 h | `Execution/P3/T060-reduce-poi-payload.md` |
| T061 | Measure mobile first paint and map tiles per session | P3 | Sonnet 5 | 3 h | `Execution/P3/T061-mobile-paint-and-tiles.md` |
| T062 | Split AdminPage.jsx into domain modules | P4 | Opus 5 | 10 h | `Execution/P4/T062-admin-component-split.md` |
| T063 | Enforce MFA (AAL2) on destructive admin actions | P4 | Opus 5 | 5 h | `Execution/P4/T063-mfa-on-destructive-actions.md` |
| T064 | Make the audit log hold rollback state | P4 | Opus 5 | 4 h | `Execution/P4/T064-audit-log-rollback.md` |
| T065 | Elevate guard tiers on the three live-effect RPCs | P4 | Opus 5 | 2 h | `Execution/P4/T065-guard-tier-elevation.md` |
| T066 | Scope site_config visibility with a public flag | P4 | Opus 5 | 3 h | `Execution/P4/T066-config-visibility-scoping.md` |
| T067 | Public guides index (read model) | P4 | Opus 5 | 4 h | `Execution/P4/T067-public-guides-index.md` |
| T068 | Electronic notice mechanism: content_reports + report_guide RPC | P4 | Opus 5 | 6 h | `Execution/P4/T068-dsa-notice-and-action.md` |
| T069 | Takedown RPC that unpublishes without deleting | P4 | Opus 5 | 3 h | `Execution/P4/T069-takedown-rpc.md` |
| T070 | Add a statement of reasons and an internal complaints route | P4 | Opus 5 | 4 h | `Execution/P4/T070-statement-of-reasons.md` |
| T071 | Wire Sentry (or an RPC equivalent) for edge error telemetry | P4 | Opus 5 | 5 h | `Execution/P4/T071-error-telemetry.md` |
| T072 | Add pipeline health metrics to admin_health() | P4 | Sonnet 5 | 4 h | `Execution/P4/T072-pipeline-health-metrics.md` |
| T073 | Build the parse-failure queue | P4 | Haiku 4.5 | 4 h | `Execution/P4/T073-parse-failure-queue.md` |
| T074 | Add a review lifecycle and expiry to content_overrides | P4 | Opus 5 | 5 h | `Execution/P4/T074-override-review-lifecycle.md` |
| T075 | Orphan patch detection | P4 | Haiku 4.5 | 4 h | `Execution/P4/T075-orphan-patch-detection.md` |
| T076 | JSON diff viewer for overrides | P4 | Sonnet 5 | 5 h | `Execution/P4/T076-override-diff-viewer.md` |
| T077 | Automated RPC security tests with pgTap | P4 | Opus 5 | 6 h | `Execution/P4/T077-pgtap-rpc-security-tests.md` |
| T078 | Unify the ingestion registry with licence compliance | P4 | Opus 5 | 8 h | `Execution/P4/T078-registry-licence-unification.md` |
| T079 | Codify volatility-driven ingestion cadence | P4 | Sonnet 5 | 5 h | `Execution/P4/T079-volatility-cadence.md` |
| T080 | Formalise deterministic catalogue rollbacks | P4 | Opus 5 | 6 h | `Execution/P4/T080-deterministic-rollbacks.md` |
| T081 | Alert on silent failures, row-count drops and distribution drift | P4 | Opus 5 | 6 h | `Execution/P4/T081-silent-failure-alerting.md` |
| T082 | Schema contract in CI, frontend to backend | P4 | Opus 5 | 5 h | `Execution/P4/T082-schema-contract-ci.md` |
| T083 | RLS policy tests and Sentry on the ErrorBoundary | P4 | Opus 5 | 5 h | `Execution/P4/T083-rls-tests-and-errorboundary.md` |
| T084 | Write the mechanical trip validator and put it in CI | P5 | Opus 5 | 8 h | `Execution/P5/T084-trip-validator.md` |
| T085 | A1 · Store ranges as {low, high}, render once | P5 | Sonnet 5 | 6 h | `Execution/P5/T085-a1-number-ranges.md` |
| T086 | A4 · Stop rendering two empty sections on 60% of trips | P5 | Haiku 4.5 | 3 h | `Execution/P5/T086-a4-empty-sections.md` |
| T087 | A2 · Replace the best-months sentence with a 12-cell month strip | P5 | Sonnet 5 | 5 h | `Execution/P5/T087-a2-month-strip.md` |
| T088 | A3 · Difficulty as a five-segment meter, note behind the dot | P5 | Sonnet 5 | 4 h | `Execution/P5/T088-a3-difficulty-meter.md` |
| T089 | A5 · Surface tags, basecamps and snapshot, or strip them | P5 | Haiku 4.5 | 4 h | `Execution/P5/T089-a5-orphan-fields.md` |
| T090 | J1 · Fix 61 trips geolocated to the wrong place | P5 | Opus 5 | 6 h | `Execution/P5/T090-j1-geolocation.md` |
| T091 | J2 · 26 hero images are reused across 53 trips | P5 | Sonnet 5 | 4 h | `Execution/P5/T091-j2-duplicate-heroes.md` |
| T092 | J3 · Give the week-at-a-glance table a fixed row set | P5 | Haiku 4.5 | 3 h | `Execution/P5/T092-j3-glance-table.md` |
| T093 | J4+J5 · Make the three accuracy signals agree | P5 | Fable 5.1 | 6 h | `Execution/P5/T093-j4-accuracy-signals.md` |
| T094 | J6+J7+J8 · Bold, coverage honesty, and the age of the numbers | P5 | Sonnet 5 | 5 h | `Execution/P5/T094-j6-j7-j8-presentation-honesty.md` |
| T095 | Price 40 to 50 destinations by hand and compare | P5 | you, not Claude | 10 h | `Execution/P5/T095-manual-price-holdout.md` |
| T096 | Benchmark ground costs against real listings | P5 | Fable 5.1 | 8 h | `Execution/P5/T096-ground-cost-benchmark.md` |
| T097 | Publish the accuracy figure in the product | P5 | Sonnet 5 | 4 h | `Execution/P5/T097-publish-accuracy-figure.md` |
| T098 | Show city versus country provenance, and name sources in product copy | P5 | Sonnet 5 | 5 h | `Execution/P5/T098-provenance-and-sources-in-copy.md` |
| T099 | I1 · Ask for the departure airport once, remember it, price the trip | P6 | Opus 5 | 16 h | `Execution/P6/T099-price-the-trip.md` |
| T100 | I3 · Add a party-size control and stop assuming two people silently | P6 | Sonnet 5 | 6 h | `Execution/P6/T100-party-size.md` |
| T101 | I2 · Break the seven-day assumption | P6 | Sonnet 5 | 8 h | `Execution/P6/T101-trip-lengths.md` |
| T102 | I4 · Show the rail alternative | P6 | Sonnet 5 | 6 h | `Execution/P6/T102-rail-alternative.md` |
| T103 | I5 · Add a price-by-month row under the weather row | P6 | Sonnet 5 | 4 h | `Execution/P6/T103-price-by-month.md` |
| T104 | 7.1 · Read type=superroute, which is why Italy is zero | P7 | Opus 5 | 8 h | `Execution/P7/T104-superroute-extraction.md` |
| T105 | 7.2 · Group by cycle_network, not by network level | P7 | Sonnet 5 | 5 h | `Execution/P7/T105-cycle-network-grouping.md` |
| T106 | 6.2 · Run the named-ways derivation everywhere, not in five countries | P7 | Sonnet 5 | 8 h | `Execution/P7/T106-named-ways-derivation.md` |
| T107 | 6.6 · Apply the title ladder across all five sections | P7 | Sonnet 5 | 6 h | `Execution/P7/T107-title-ladder.md` |
| T108 | 6.8 · Fix the five user-visible trail data bugs | P7 | Opus 5 | 6 h | `Execution/P7/T108-trail-data-bugs.md` |
| T109 | 8.1 + 9.2 · Rebuild beaches and lakes on the EEA bathing water dataset | P7 | Opus 5 | 10 h | `Execution/P7/T109-eea-bathing-water.md` |
| T110 | 9.1 · Pool from HydroLAKES + GLOBathy, publish from a scored gate | P7 | Sonnet 5 | 8 h | `Execution/P7/T110-hydrolakes-globathy.md` |
| T111 | 0.4 · Implement country floors and reason codes | P7 | Fable 5.1 | 10 h | `Execution/P7/T111-coverage-contract.md` |
| T112 | 1.7 · Build reports/coverage.html and the CI gate | P7 | Sonnet 5 | 8 h | `Execution/P7/T112-coverage-dashboard-and-gate.md` |
| T113 | 6.1 · Build the famous-trail registry from evidence, not memory | P7 | Opus 5 | 12 h | `Execution/P7/T113-famous-trail-registry.md` |
| T114 | Switzerland: Wanderland + Veloland + live closures | P7 | Sonnet 5 | 6 h | `Execution/P7/T114-ingest-switzerland.md` |
| T115 | Norway: Kartverket Turrutebasen + NVE lakes | P7 | Sonnet 5 | 6 h | `Execution/P7/T115-ingest-norway.md` |
| T116 | France: IGN BD TOPO + ON3V + refuges.info | P7 | Sonnet 5 | 6 h | `Execution/P7/T116-ingest-france.md` |
| T117 | Spain: CNIG Vias Verdes + MITECO Guia de Playas | P7 | Sonnet 5 | 5 h | `Execution/P7/T117-ingest-spain.md` |
| T118 | UK: Sustrans NCN + DoBIH hills | P7 | Sonnet 5 | 5 h | `Execution/P7/T118-ingest-uk.md` |
| T119 | Belgium, Germany, Italy, Finland, Sweden, Netherlands | P7 | Opus 5 | 10 h | `Execution/P7/T119-ingest-remaining-tier-b.md` |
| T120 | 7.3 · Ingest EuroVelo, open under ODbL since October 2024 | P7 | Sonnet 5 | 5 h | `Execution/P7/T120-eurovelo.md` |
| T121 | 7.5 · Do NOT ingest node networks as routes | P7 | Sonnet 5 | decision | `Execution/P7/T121-node-networks-decision.md` |
| T122 | 10.1 + 10.2 · Three entities, and a 3,000-5,000 target | P7 | Fable 5.1 | 12 h | `Execution/P7/T122-mountain-entities-and-targets.md` |
| T123 | 6.3 · Publish parent pages for stage families | P7 | Sonnet 5 | 8 h | `Execution/P7/T123-stage-family-parents.md` |
| T124 | 6.5 + 1.6 · Ship the honest stub and the not_applicable empty state | P7 | Sonnet 5 | 6 h | `Execution/P7/T124-honest-stubs-and-empty-states.md` |
| T125 | 6.10 + 6.11 · Sort by fame, cap Germany, uncap everyone else | P7 | Sonnet 5 | 8 h | `Execution/P7/T125-fame-sort-and-german-cap.md` |
| T126 | 2.1 · Write the image brief and the vision-scoring prompt | P8 | Sonnet 5 | 3 h | `Execution/P8/T126-image-brief.md` |
| T127 | Commons and Flickr with a known camera bearing (rung 1) | P8 | Opus 5 | 10 h | `Execution/P8/T127-commons-flickr-bearing.md` |
| T128 | Mapillary for the view along a route (rung 2) | P8 | Sonnet 5 | 8 h | `Execution/P8/T128-mapillary-views.md` |
| T129 | Panoramax as the long-term bet (rung 3) | P8 | Sonnet 5 | 5 h | `Execution/P8/T129-panoramax.md` |
| T130 | Explicitly exclude Google Street View | P8 | Haiku 4.5 | decision | `Execution/P8/T130-excluded-imagery-sources.md` |
| T131 | 2.3 · Build the terrain view render pipeline | P8 | Opus 5 | 16 h | `Execution/P8/T131-synthetic-view-render.md` |
| T132 | One licence trap: never ship s2maps.eu cloudless tiles | P8 | Haiku 4.5 | 15 min | `Execution/P8/T132-sentinel-licence-check.md` |
| T133 | 2.4 · Pick the viewpoint from data, not from the middle | P8 | Sonnet 5 | 8 h | `Execution/P8/T133-viewpoint-selection.md` |
| T134 | 2.5 + 2.6 · Caption every view, order the gallery as a walk | P8 | Sonnet 5 | 6 h | `Execution/P8/T134-captions-and-gallery-order.md` |
| T135 | 3.2 · MapLibre terrain + Mapterhorn, mirrored to your own R2 | P8 | Opus 5 | 10 h | `Execution/P8/T135-maplibre-terrain.md` |
| T136 | 3.4 + 3.5 · Pre-rendered 3D card heroes and the flyover | P8 | Opus 5 | 10 h | `Execution/P8/T136-3d-heroes-and-flyover.md` |
| T137 | 3.6 · Draw the derived layers, because that is where you win | P8 | Opus 5 | 10 h | `Execution/P8/T137-derived-3d-layers.md` |
| T138 | B1 + B2 · Activity-matched heroes, accuracy over beauty | P8 | Opus 5 | 10 h | `Execution/P8/T138-activity-matched-heroes.md` |
| T139 | B3 + B4 · A 1600px floor and correct derivative widths | P8 | Haiku 4.5 | 5 h | `Execution/P8/T139-hero-resolution-floor.md` |
| T140 | B5 · Three to five named-highlight photographs per trip | P8 | Opus 5 | 10 h | `Execution/P8/T140-trip-highlight-galleries.md` |
| T141 | 2.8 · Build the photo upload path, with the legal shape right | P8 | Opus 5 | 12 h | `Execution/P8/T141-user-photo-uploads.md` |
| T142 | 2.7 · Embed webcams live, never store the frames | P8 | Haiku 4.5 | 4 h | `Execution/P8/T142-webcam-embeds.md` |
| T143 | K1 · Generate into a JSON Schema, never into prose | P9 | Opus 5 | 8 h | `Execution/P9/T143-generation-schema.md` |
| T144 | K2 · Split generation into three passes with different jobs | P9 | Fable 5.1 | 12 h | `Execution/P9/T144-three-pass-generation.md` |
| T145 | K4 · Run a separate adversarial critic with no memory of the writing | P9 | Opus 5 | 8 h | `Execution/P9/T145-adversarial-critic.md` |
| T146 | K3 · Every number carries its own confidence, and the page shows it | P9 | Sonnet 5 | 8 h | `Execution/P9/T146-per-field-confidence.md` |
| T147 | K6 + Lever 1 · Build the volatile fact store and the expiry job | P9 | Opus 5 | 14 h | `Execution/P9/T147-per-fact-grounding.md` |
| T148 | Keep a small live-grounding allowance for genuinely user-specific questions | P9 | Sonnet 5 | 3 h | `Execution/P9/T148-live-grounding-allowance.md` |
| T149 | K9 · Run the pipeline in fill mode over the existing 253 first | P9 | Sonnet 5 | 8 h | `Execution/P9/T149-fill-mode-backfill.md` |
| T150 | K10 + D1 · Start the backfill with packing and risk modules | P9 | Sonnet 5 | 6 h | `Execution/P9/T150-packing-and-risk-backfill.md` |
| T151 | D3 · Fill the type-specific data sheet, one trip type at a time | P9 | Sonnet 5 | 8 h | `Execution/P9/T151-type-specific-fields.md` |
| T152 | D4 · Cap the prose and let the structure carry the load | P9 | Sonnet 5 | 5 h | `Execution/P9/T152-prose-caps.md` |
| T153 | K8 · Keep a golden set and re-run it on every prompt change | P9 | Sonnet 5 | 6 h | `Execution/P9/T153-golden-set.md` |
| T154 | K7 · Spend the human review budget on flags only | P9 | Sonnet 5 | 4 h | `Execution/P9/T154-flag-only-review.md` |
| T155 | D2 · Expand the catalogue, batched by region | P9 | Opus 5 | 10 h | `Execution/P9/T155-catalogue-expansion.md` |
| T156 | C7 + 4.1 · One InfoDot and one glossary for the whole product | P10 | Sonnet 5 | 8 h | `Execution/P10/T156-infodot-and-glossary.md` |
| T157 | 4.3 · Enforce the banned-from-the-surface list | P10 | Haiku 4.5 | 4 h | `Execution/P10/T157-banned-surface-terms.md` |
| T158 | 4.2 · Translate every number into a sentence a person would say | P10 | Sonnet 5 | 8 h | `Execution/P10/T158-number-translations.md` |
| T159 | M1 + 4.5 · 'Who this is not for', on every page type | P10 | Sonnet 5 | 6 h | `Execution/P10/T159-who-this-is-not-for.md` |
| T160 | 4.6 + K3 · The honest coverage and provenance footers | P10 | Sonnet 5 | 5 h | `Execution/P10/T160-honest-footers.md` |
| T161 | C1 · Suitability strip pinned under the hero | P10 | Sonnet 5 | 5 h | `Execution/P10/T161-suitability-strip.md` |
| T162 | C2 · Day by day becomes a horizontal swipe carousel | P10 | Opus 5 | 12 h | `Execution/P10/T162-day-carousel.md` |
| T163 | C3 · Day detail opens in place, not as more page | P10 | Sonnet 5 | 6 h | `Execution/P10/T163-day-detail-in-place.md` |
| T164 | C4 · Collapse every long section, with a one-line preview | P10 | Sonnet 5 | 8 h | `Execution/P10/T164-collapsed-sections.md` |
| T165 | C9 · Sticky section rail | P10 | Sonnet 5 | 5 h | `Execution/P10/T165-sticky-section-rail.md` |
| T166 | C10 · One primary action per view | P10 | Haiku 4.5 | 3 h | `Execution/P10/T166-one-primary-action.md` |
| T167 | C5 · Advisory sections become swipeable flashcards | P10 | Sonnet 5 | 8 h | `Execution/P10/T167-advisory-flashcards.md` |
| T168 | C6 · What to pack becomes an icon grid | P10 | Sonnet 5 | 8 h | `Execution/P10/T168-packing-icon-grid.md` |
| T169 | M4 · Turn bookingWindows into a booking ORDER, not a paragraph | P10 | Sonnet 5 | 5 h | `Execution/P10/T169-booking-order.md` |
| T170 | M2 + M3 + M5 · The shape of the week, day zero, and the weather fallback | P10 | Opus 5 | 10 h | `Execution/P10/T170-week-shape-and-fallbacks.md` |
| T171 | M7 + M8 + M10 · One sentence, three ways out, and the human evidence | P10 | Sonnet 5 | 6 h | `Execution/P10/T171-hook-exits-evidence.md` |
| T172 | E1 · Cost breakdown as one stacked bar, not four rows | P10 | Sonnet 5 | 6 h | `Execution/P10/T172-cost-stacked-bar.md` |
| T173 | E2 + M6 · The lifestyle slider, and the trade-off in words | P10 | Opus 5 | 10 h | `Execution/P10/T173-lifestyle-slider.md` |
| T174 | E3 + E4 · Elevation profile and surface mix | P10 | Opus 5 | 10 h | `Execution/P10/T174-elevation-and-surface.md` |
| T175 | E5 · A type-specific data sheet that reorders itself | P10 | Sonnet 5 | 8 h | `Execution/P10/T175-type-specific-data-sheet.md` |
| T176 | F4 · Free, frictionless GPX on every route — never paywalled | P10 | Sonnet 5 | 5 h | `Execution/P10/T176-free-gpx.md` |
| T177 | F1-F3 · DECIDE: komoot embed or own GPX on Mapbox Outdoors | P10 | Fable 5.1 | decision + 12 h | `Execution/P10/T177-routing-integration-decision.md` |
| T178 | F5 · Per-day map thumbnails on the itinerary cards | P10 | Sonnet 5 | 6 h | `Execution/P10/T178-per-day-map-thumbnails.md` |
| T179 | 5.1 + 5.2 · One card with five fillings, and a bento grid | P10 | Opus 5 | 12 h | `Execution/P10/T179-destination-card-and-grid.md` |
| T180 | 5.4 · The shared detail-page skeleton | P10 | Opus 5 | 14 h | `Execution/P10/T180-detail-page-skeleton.md` |
| T181 | 5.5 · Per-section signature visuals, one visual family | P10 | Opus 5 | 16 h | `Execution/P10/T181-signature-visuals.md` |
| T182 | Derived modules that turn a listing into an instrument | P10 | Opus 5 | 20 h | `Execution/P10/T182-derived-modules.md` |
| T183 | 5.3 · The section opening screens — deliberately LAST | P10 | Opus 5 | 12 h | `Execution/P10/T183-section-opening-screens.md` |
| T184 | G1 · Visible feedback inside 100 ms, on touch, before data | P10 | Sonnet 5 | 6 h | `Execution/P10/T184-touch-feedback.md` |
| T185 | G2 + G3 · Shared element transitions, skeletons never spinners | P10 | Sonnet 5 | 8 h | `Execution/P10/T185-transitions-and-skeletons.md` |
| T186 | G4 + 5.7 · The quality floor, and respect the design system | P10 | Opus 5 | 8 h | `Execution/P10/T186-quality-floor-and-accessibility.md` |
| T187 | Design the first-run trip result | P10 | Fable 5.1 | 8 h | `Execution/P10/T187-first-run-result.md` |
| T188 | Cost band and trip length filters | P10 | Sonnet 5 | 6 h | `Execution/P10/T188-cost-and-length-filters.md` |
| T189 | Loading and error states across every surface | P10 | Sonnet 5 | 6 h | `Execution/P10/T189-loading-and-error-states.md` |
| T190 | Keyboard and map accessibility | P10 | Opus 5 | 8 h | `Execution/P10/T190-keyboard-and-map-accessibility.md` |
| T191 | Shared design tokens, and modularise styles.css | P10 | Sonnet 5 | 8 h | `Execution/P10/T191-design-tokens-and-css-modules.md` |
| T192 | Fix hook dependencies and memoisation thrashing | P10 | Opus 5 | 6 h | `Execution/P10/T192-hook-dependencies.md` |
| T193 | Explore tab, Trip Planner and Day Planner passes | P10 | Opus 5 | 16 h | `Execution/P10/T193-explore-planner-passes.md` |
| T194 | The home page | P10 | Sonnet 5 | 8 h | `Execution/P10/T194-home-page.md` |
| T195 | Write PRODUCT.md and DESIGN.md as the durable context | P11 | Sonnet 5 | 6 h | `Execution/P11/T195-product-and-design-context.md` |
| T196 | Put a generic-pattern detector in CI | P11 | Sonnet 5 | 6 h | `Execution/P11/T196-design-lint-in-ci.md` |
| T197 | Curate components by role, not by library | P11 | Opus 5 | 10 h | `Execution/P11/T197-component-curation.md` |
| T198 | DECIDE the typography conflict, explicitly | P11 | Fable 5.1 | 1 h | `Execution/P11/T198-typography-decision.md` |
| T199 | Self-host fonts and take the React 19 / Tailwind v4 wins | P11 | Sonnet 5 | 8 h | `Execution/P11/T199-fonts-and-runtime-performance.md` |
| T200 | Measure Core Web Vitals on the three heaviest pages | P11 | Sonnet 5 | 4 h | `Execution/P11/T200-core-web-vitals.md` |
| T201 | Write the positioning, in one sentence and one paragraph | P12 | Fable 5.1 | 4 h | `Execution/P12/T201-positioning.md` |
| T202 | Competitive positioning against the four categories | P12 | Fable 5.1 | 6 h | `Execution/P12/T202-competitive-positioning.md` |
| T203 | Decide the audience order | P12 | Fable 5.1 | 3 h | `Execution/P12/T203-audience-order.md` |
| T204 | The acquisition constraint, written down once | P12 | Haiku 4.5 | 1 h | `Execution/P12/T204-acquisition-constraint.md` |
| T205 | The programmatic SEO plan | P12 | Fable 5.1 | 8 h | `Execution/P12/T205-programmatic-seo.md` |
| T206 | Community credibility: the outdoor route | P12 | Fable 5.1 | 6 h | `Execution/P12/T206-community-credibility.md` |
| T207 | Launch channels and the launch day plan | P12 | Sonnet 5 | 6 h | `Execution/P12/T207-launch-channels.md` |
| T208 | Press, partnerships and the open-data angle | P12 | Haiku 4.5 | 4 h | `Execution/P12/T208-press-and-partnerships.md` |
| T209 | The landing page | P12 | Opus 5 | 10 h | `Execution/P12/T209-landing-page.md` |
| T210 | The pricing page and the paywall copy | P12 | Sonnet 5 | 6 h | `Execution/P12/T210-pricing-page-and-paywall-copy.md` |
| T211 | First-run onboarding and the empty states | P12 | Fable 5.1 | 8 h | `Execution/P12/T211-onboarding-and-empty-states.md` |
| T212 | Brand assets: OG images, favicon, app icon, social cards | P12 | Sonnet 5 | 6 h | `Execution/P12/T212-brand-assets.md` |
| T213 | Email and lifecycle | P12 | Sonnet 5 | 6 h | `Execution/P12/T213-email-lifecycle.md` |
| T214 | Decide the analytics stack, knowing what it costs you legally | P12 | Fable 5.1 | 4 h | `Execution/P12/T214-analytics-decision.md` |
| T215 | Define the launch metrics and where each one is read | P12 | Sonnet 5 | 3 h | `Execution/P12/T215-launch-metrics.md` |
| T216 | A support inbox and a response commitment | P12 | Sonnet 5 | 3 h | `Execution/P12/T216-support-inbox.md` |
| T217 | The refund standard operating procedure | P12 | Opus 5 | 2 h | `Execution/P12/T217-refund-sop.md` |
| T218 | Incident runbook and a status surface | P12 | Opus 5 | 4 h | `Execution/P12/T218-incident-runbook.md` |
| T219 | Decide the feedback loop from users into the backlog | P12 | Fable 5.1 | 2 h | `Execution/P12/T219-user-feedback-loop.md` |
| T220 | Write the launch runway calendar | P12 | Sonnet 5 | 3 h | `Execution/P12/T220-launch-runway.md` |
| T221 | Add static prerendering | P12 | Opus 5 | 8 h | `Execution/P12/T221-static-prerendering.md` |
| T222 | Generate the sitemap from app data | P12 | Haiku 4.5 | 4 h | `Execution/P12/T222-sitemap-generation.md` |
| T223 | Create the destination URL structure | P12 | Sonnet 5 | 6 h | `Execution/P12/T223-url-structure.md` |
| T224 | Destination cost pages and country/trip-length pages | P12 | Opus 5 | 10 h | `Execution/P12/T224-cost-and-country-pages.md` |
| T225 | Receipt-based editorial and internal linking | P12 | Sonnet 5 | 8 h | `Execution/P12/T225-receipt-editorial.md` |
| T226 | Decide content type and platforms | P12 | Fable 5.1 | 4 h | `Execution/P12/T226-content-strategy.md` |
| T227 | Legal gate | P13 | Haiku 4.5 | 2 h | `Execution/P13/T227-legal-gate.md` |
| T228 | Payments gate | P13 | Opus 5 | 3 h | `Execution/P13/T228-payments-gate.md` |
| T229 | AI cost gate | P13 | Haiku 4.5 | 2 h | `Execution/P13/T229-ai-cost-gate.md` |
| T230 | Data and coverage gate | P13 | Haiku 4.5 | 2 h | `Execution/P13/T230-data-coverage-gate.md` |
| T231 | Performance and accessibility gate | P13 | Sonnet 5 | 3 h | `Execution/P13/T231-performance-accessibility-gate.md` |
| T232 | Supabase Free → Pro | P13 | you, not Claude | 30 min | `Execution/P13/T232-supabase-pro.md` |
| T233 | Mirror the Mapterhorn terrain PMTiles to your own R2 | P13 | Sonnet 5 | 4 h | `Execution/P13/T233-mirror-terrain-tiles.md` |
| T234 | Turn on affiliate click and conversion tracking | P13 | Sonnet 5 | 4 h | `Execution/P13/T234-affiliate-tracking.md` |
| T235 | Set up uptime and error alerting | P13 | Sonnet 5 | 3 h | `Execution/P13/T235-uptime-and-alerting.md` |
| T236 | Launch | P13 | you, not Claude | milestone | `Execution/P13/T236-launch.md` |
| T237 | Run the price test you already scaffolded | P14 | Fable 5.1 | 8 h | `Execution/P14/T237-price-test.md` |
| T238 | Push the Year Pass mix | P14 | Opus 5 | 6 h | `Execution/P14/T238-year-pass-mix.md` |
| T239 | Build the SEO surface deliberately | P14 | Sonnet 5 | ongoing | `Execution/P14/T239-organic-acquisition.md` |
| T240 | Watch the four numbers that can change the plan | P14 | Opus 5 | monthly | `Execution/P14/T240-monthly-metrics-review.md` |
| T241 | Tier upgrades, when and only when triggered | P14 | Opus 5 | as needed | `Execution/P14/T241-tier-upgrades.md` |
| T242 | Guard the incremental property as the catalogue grows | P14 | Sonnet 5 | ongoing | `Execution/P14/T242-incremental-harvest-guard.md` |
| T243 | Complete the conversion funnel with real numbers | P14 | Sonnet 5 | ongoing | `Execution/P14/T243-conversion-funnel.md` |
| T244 | Calculate the real monthly break-even | P14 | Haiku 4.5 | 2 h | `Execution/P14/T244-break-even.md` |
| T245 | Reassess accommodation affiliates | P14 | Sonnet 5 | 4 h | `Execution/P14/T245-affiliate-mix.md` |
| T246 | DECIDE the mobile strategy — this is the gate | P15 | Fable 5.1 | decision | `Execution/P15/T246-mobile-strategy-decision.md` |
| T247 | App Store work — GATED on T246 | P15 | Opus 5 | gated | `Execution/P15/T247-app-store.md` |
| T248 | Play Store — GATED on T246, and it is the long pole | P15 | Haiku 4.5 | gated | `Execution/P15/T248-play-store.md` |
| T249 | PMTiles pin tiles — GATED on ~5,000 destinations | P15 | Sonnet 5 | gated | `Execution/P15/T249-pmtiles-pins.md` |
| T250 | Cycling node-network routing — a separate product | P15 | Fable 5.1 | gated | `Execution/P15/T250-node-network-product.md` |
| T251 | Self-hosted basemap — GATED on Carto changing terms | P15 | Fable 5.1 | gated | `Execution/P15/T251-self-hosted-basemap.md` |
