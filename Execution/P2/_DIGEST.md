# P2 digest

21 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`. Owner procedures kept beside this file: _OPEN-gemini-billing.md, _OPEN-stripe-launch.md.

### T030: Audit Stripe Price objects against plan_tiers (2026-09-24)

Nothing changed. This is an audit, and the audit found the two sources it could reach already agree with each other and with the migration that defines them. The live `public.plan_tiers` table on project ntssxktaduxzpsmejwyv carries trip at 699 cents with 40 grounded searches and year at 1499 cents with 120 grounded searches, currency eur. That is exactly what the on-conflict insert in `007_passes.sql` writes, so the live table does not predate the 2026-07-28 cut from 200 grounded to 120 and the re-run the migration header offers as a safety net was not needed and was not run. No write of any kind was issued against the live database.

Broke: `supabase secrets list --linked` returned a help dump and UnrecognizedOption / On CLI v2.109.1 that subcommand takes `--project-ref` and not `--linked`, unlike `db query` / Re-ran with `--project-ref ntssxktaduxzpsmejwyv`; Live free tier ai_plans is 2 where `007_passes.sql` says 3, which reads as drift / Not drift: migration `021_free_tier_once.sql...

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T030-stripe-price-audit.md"`

### T031: End-to-end purchase test in test mode, both tiers (2026-09-24)

No real purchase was made, because no Stripe key exists on this machine or on the live project, and that is a blocker only the user can lift. But the task turned out to be far more testable than T030's finding suggested. `supabase functions serve` came up on Docker, and `supabase start` brought up a local Postgres with migrations 007 and 021 applied, which means the grant logic and both Edge Functions were exercised against a real database with real HMAC-signed Stripe events. Eleven of the twelve checks were observed running rather than read. Only the Stripe-hosted half, the card form and the Price object, stayed blocked. Two findings matter.

Broke: `supabase functions serve` exited with "supabase start is not running" / On CLI v2.109.1 serve needs the local stack, it is not standalone / Ran `supabase start` first; `supabase start` failed, invalid regular expression, SQLSTATE 2201B / Migration 018 line 93 uses `{5,600}` and Postgres caps a regex repetition count at 255 / Held 018 and the five...

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T031-stripe-purchase-e2e.md"`

### T032: Wire the 14-day withdrawal waiver into checkout (2026-09-24)

The waiver now has somewhere to land. Before this task the consent existed only as an unreachable possibility: T013 wrote the Stripe consent block into the checkout function, but it is gated on a secret nobody has set, and even if it had fired, nothing anywhere read the answer back. A buyer could have ticked the box and the fact would have evaporated the moment Stripe finished with the session. After this task there are columns to hold it, a function that writes them in the same statement as the sale, a webhook that reads the answer off the completed session, and a line above the buy buttons that tells the traveller what they are about to be asked before they leave the site.

Broke: The consent URL was stored on rows with no consent / The webhook reads CHECKOUT_TERMS_URL unconditionally, so every grant carried it, which reads as "these are the terms they accepted" when nothing was accepted / The insert now writes the URL only when a recognised consent value is present.

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T032-withdrawal-waiver.md"`

### T033: Confirm Stripe Tax and set an OSS threshold monitor (2026-09-24)

The threshold now has a number attached to it. Before this task the tax configuration was correct and entirely unwatched: automatic tax was on, the billing address was required, and nothing anywhere recorded where a buyer was or what they paid, so the one figure that decides whether Carta has to register for VAT in twenty-six other countries could not be computed at all. After this task the webhook records the buyer's country, the amount actually charged and the currency against every sale, and an admin RPC turns that ledger into a figure per calendar year against the 10,000 EUR limit, with the previous-year rule already applied. Three pieces.

Broke: The RPC returned `forbidden` even for a user in admin_users / `set local role` and `set local request.jwt.claims` are silently ignored outside a transaction block, so `auth.uid()` resolved to nothing / Wrapped the impersonation in `begin; ... commit;`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T033-stripe-tax-and-oss.md"`

### T034: Instrument the paywall funnel before launch, not after (2026-09-24)

Before this task the funnel from migration 022 could count shown, dismissed and checkout events per reason code, but it could not answer the question the financial model actually needs, which is not "how many people were asked" but "how many people who were asked actually paid, and does that differ between a gate that blocks a button and an offer that blocks nothing." Ten reason codes were mixed into one shown total regardless of whether the traveller had just tried to export a PDF or had merely been shown an unprompted upsell after saving a third trip. Averaging those two kinds of event answers a worse question than answering them separately.

Broke: `supabase start` failed applying 023 locally with `permission denied for table trip_plans` / 023's self-check runs `set local role authenticated` outside a `begin;/commit;` block on this local Postgres, so the role change did not take and the proof query ran as a role that cannot read the table / Held 023 aside alongside 018 for this task's local r...

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T034-paywall-funnel-instrumentation.md"`

### T035: Attach billing to the Gemini project and prove the posture (2026-09-24)

The three headers that carry Carta's Gemini billing posture now state how to prove the posture, not only what the posture is. They already said the right thing: that GEMINI_API_KEY must sit on a Google Cloud project with an active Cloud Billing account, that this follows from the Gemini API Additional Terms effective 2026-03-23, and that "Paid Services" is defined by the billing account existing rather than by money changing hands. T034 and the migrations before it had written that much. What none of them said was how a maintainer checks it, which meant the claim could only be believed, never tested.

Broke: Could not verify billing state / gcloud CLI not installed on this machine, and the prompt forbids changing billing state anyway / Recorded the exact read command in all three headers and raised T035-a for the owner; 006 header asserts the key project must never have billing / Written under the pre-2026-03-23 zero-billing posture and never revisited...

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T035-gemini-billing-posture.md"`

### T036: Set hard budget caps and alerts in Google Cloud (2026-09-24)

The global daily AI ceiling is now tested against real SQL rather than described in prose. `continent-app/scripts/ai/test_global_cap.mjs` was rewritten from a file of `console.log` statements into a test with 49 assertions and a non-zero exit code on failure, in the house style of `test_plan_logic.mjs`. The first version of this script asserted nothing. It printed a specification and ended with a line claiming all six specifications passed. That claim was false: a print-out cannot fail, so it cannot pass either. The done condition for this task is a global-cap rejection tested end to end, and the earlier report recorded a test that had never run.

Broke: The previous version of this task shipped a test that could not fail, and a report that read its output as six passing specifications. That is the thing this task fixed. The lesson generalises: a script whose only verb is `console.log` has no verdict, and any report that quotes one as evidence is quoting itself.

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T036-gemini-budget-caps.md"`

### T037: Verify ai_consume, ai_refund and the grounded counter (2026-09-24)

The three claims that hold the AI cost ceiling up are now tested rather than commented. Before this task one script exercised the quota layer, `test_global_cap.mjs` from T036, and it tested the global daily ceiling: 49 assertions, of which 21 ran without a database. It did not test a grant, it did not test `ai_refund` at all, and it did not touch the separation between the `plan` and `ground` counters. After this task a second script, `continent-app/scripts/ai/test_ai_quota.mjs`, adds 112 assertions covering exactly those gaps. None of the bugs the prompt named exists. All the call sites already branch correctly and plan-day's grounded path already asks for kind `ground`.

Broke: `ai_refund` takes its `ai_daily_total` decrement from `current_date` whatever day the unit was spent / The spend records no day. `ai_usage` is period-keyed, so the day is simply not available to the refund / Not fixed here: it needs a schema decision and its own task.

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T037-ai-quota-enforcement-tests.md"`

### T038: Log the model fallback chain (2026-09-24)

Plan-day now logs every successful generation to a new ai_model_events table, recording which model produced the answer and whether it was a fallback. Before this task, silent fallbacks to weaker models looked like the product degrading for no reason. Now the admin panel shows per-day model distribution with fallback rate computed as (fallbacks / total generations per day), surfacing when the primary budget or quota is exhausted. Migration 028 adds the event table with appropriate RLS (service_role write, admin read) and an RPC that aggregates per-day counts, per-model counts over the window, and total fallbacks.

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T038-model-fallback-logging.md"`

### T039: Normalise the ai_plan_cache key (2026-09-24)

The plan-day cache key no longer forks on distinctions that nothing downstream can see, and the hit rate it produces is now recorded and shown in the admin panel instead of being unknowable. Before this task the key was already doing the two obvious things: candidate ids were sorted, and a non-events request keyed on the month rather than the exact date. What it was not doing was normalising the human end of the request.

Broke: `cache key: group band 5-6 vs 7+ differ` failed / The test asserted the exact fork this task removes / Replaced with five checks that pin the new band: 6 equals 7, 5 equals 20, 4 differs from 5, 3 equals 4, 1 differs from 2; The first measurement reported a 95.7% baseline / The cross-product population repeats intents, so both rates were near-satur...

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T039-cache-key-normalisation.md"`

### T040: Trim the plan-day prompt, not the output (Lever 3) (2026-09-24)

`plan-day` now caps the candidate list it hands to Gemini at 30 places, ranked by rating and proximity to the day's centroid, and strips the `desc` field from every candidate that is not guaranteed a place in the plan. Two new pure functions in `logic.mjs`, `dayCentroid` and `selectCandidates`, do the work; `index.ts` calls them once, right after the request is sanitized, and everything downstream, the prompt, the model-output validation and the cache key, now runs on the trimmed deck instead of the full one. The mechanics matter more than the headline number, so read this section before the measurement table.

Broke: `execFileSync('npx', ...)` threw `spawnSync npx ENOENT` in `measure_prompt_tokens.mjs` / Windows resolves `npx` to `npx.cmd`, which `execFileSync` cannot spawn directly without a shell / Added `shell: true`; esbuild then failed with "Must use outdir when there are multiple input files" / `shell: true` on Windows runs the command through `cmd.exe`,...

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T040-prompt-token-trim.md"`

### T041: Design per-fact grounding (Lever 1), design now, build in P9 (2026-09-24)

Nothing in the runtime. This task produces the design that T147 (build the volatile fact store and the expiry job) and T148 (the live-grounding allowance) implement in P9. The design is grounded in what the code does today, and where the brief and the code disagree it says which one wins. The short version. Today every grounded Gemini call happens inside a user's request, spends one unit of that user's `ground` allowance, and its result is thrown away after the seven-day `ai_plan_cache` window.

Broke: The brief says grounding fetches prices and timetables in the request path; plan-day grounds only for events and suggest-city only for discoveries / The K6 facts live in the static trips data, which never grounds at request time / Design serves both: events through the store now, K6 fields through the same store in the P9 numbers pass; the 60 to 80...

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T041-per-fact-grounding-design.md"`

### T042: AI usage rollup RPC and admin view (2026-09-24)

The AI surface has been measuring itself since migration 007 and none of it reached a reader. The quota ledger counted every unit spent, the daily total counted the shared ceiling, 028 counted model fallbacks and 029 counted cache lookups, and the admin panel showed exactly one number out of all of it: `aiToday`, a bare integer in `admin_stats` with nothing to compare it against. An owner could not tell whether the cache change from T039 had worked, whether anyone was near a cap, or whether one account was eating the margin.

Broke: `verify_admin_panel.mjs` step 8b failed with a strict-mode violation on `.adminpage-spark` / The overview had one sparkline chart and the check selected it unscoped; the new section adds a second / Scoped the signups assertions to the Signups card by heading text, and the provider split to its own card; `suggest-city` would have logged a ground ref...

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T042-ai-usage-telemetry.md"`

### T043: The margin dashboard (2026-09-24)

`CARTA_UNIT_ECONOMICS.md` is a model. It asserts a blended contribution of EUR 6.85 per purchase and then hangs the whole commercial strategy on that one figure: the EUR 0.17 a visitor is worth, the conclusion that paid acquisition cannot work at any plausible conversion rate, the ranking of the seven levers in section 4, the decision that destination coverage is the customer acquisition strategy rather than a data quality project. Until this task, nothing had ever checked that number against a sale, and nothing could have. The admin panel could show one AI figure after T042 and no money at all.

Broke: `docker cp` failed with "GetFileAttributesEx C:\c:" / Git Bash rewrites the Windows source path even with `MSYS_NO_PATHCONV=1`, which only covers the container side / Piped the files in on stdin with `docker exec -i psql` instead, which needs no path translation at all; The first draft summed gross for the month and applied one Stripe rate to it /...

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T043-margin-dashboard.md"`

### T259: Gemini billing attached, budget set, key rotated (2026-10-01)

The Google Cloud project behind GEMINI_API_KEY now has a paid billing account, which is the compliance step the Gemini API Additional Terms of 2026-03-23 require for users in the EEA, Switzerland and the UK. A EUR 50 monthly budget with alerts at 50, 90 and 100 percent watches that project. The key was rotated the same day: the old key appeared in full in a session screenshot, so the owner deleted it, created a new one in the same project and set it as the GEMINI_API_KEY secret on the live Supabase project, and a signed-in day plan on the live site came back normally.

Broke: The first billing evidence pointed at the wrong project / Two projects share the display name Carta, and the linked-projects page listed only carta-503222 / Read the key's project from AI Studio (gen-lang-client-0445365032) and matched its billing tier to account ...2847; Budget first covered the whole billing account / No project ticked in Scope /...

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T259-gemini-billing-proof.md"`

### T264: rewrite_intros.py and parking_check.py run on Gemini only (2026-10-01)

Stage 4 of `Execution/_OPEN-MASTER.md`, item 10 (T041-g). Two manual dossier scripts, `pipeline/dossier/rewrite_intros.py` and `pipeline/dossier/parking_check.py`, each had a `Claude` provider on the `anthropic` SDK, picked automatically whenever `ANTHROPIC_API_KEY` was set. CLAUDE.md forbids the Claude API in this project. Both classes are gone, and both scripts now always use their existing `Gemini` provider: the AI Studio REST API, with Google Search grounding for the parking check.

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T264-remove-anthropic-provider.md"`

### T265 payments and quota, SQL and functions (2026-10-02)

One new migration, 044_payments_quota.sql, plus the two Stripe Edge Functions and a few app files, closing eleven of the thirteen D1 register rows. A Year Pass holder who buys a Trip Pass now keeps tier year and the allowance they are inside, and gets 30 more days (T031-b, the first of the three candidates in the T031 report). No pass can end more than 1,095 days (three years) from now: grant_pass clamps to that, and a new service-role RPC, pass_can_buy, lets the checkout function refuse with 409 pass_max before Stripe charges for days the cap would take away (T031-c). The modal has a sentence for that refusal in all six locales.

Broke: Two earlier sessions stopped before committing / usage limit, then a process exit / reviewed their uncommitted work line by line against 007, 021, 026, 027 and 031, kept it, committed early; test_ai_quota and test_global_cap pattern checks failed on plan-day / T042 put logging between the branch and the return / patterns allow the gap; A pass_can_b...

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T265-payments-quota.md"`

### T314: payments follow-ups without a migration (2026-10-03)

Three rows were taken. Two are closed and one is left open with its RPC written down. T265-b is closed. Before this task, the funnel counted an offer as shown and never as dismissed if the traveller closed the tab, reloaded, or typed a new address while the pass modal stood open. That happened because only the modal's close handler sent the dismissed event. The paywall provider now listens for pagehide while a gate is open and sends the dismissed event with a new function, trackPaywallOnExit in src/lib/paywallEvents.js. It does not use supabase-js. supabase-js reads the session through a promise and sends with an ordinary fetch, and a page that is being unloaded cancels both.

Broke: A Vite config in the scratchpad could not import vite / the scratchpad has no node_modules above it / the config sits in the wt folder and imports vite by absolute path from the main checkout's node_modules; paywallEvents.js came out with LF endings on the first write / the edit went through a script that wrote LF / rewritten with CRLF, so the diff...

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T314-payments-followups.md"`

### T323: Edge Function follow-ups (2026-10-03)

Four register rows from the P2 AI batch are closed. The plan-day model-event insert no longer blocks the response (T300-r). The origin of the "about 6k input tokens per plan" figure is found, and it is an unmeasured estimate (T040-c). The grounding cost and cap arithmetic is re-run with Google's published price (T041-c), with the result below and no price changed. The three AI Edge Functions are now executed, not pattern-checked, against a stub Supabase client (T037-d), with 145 assertions. T300-r.

Broke: Worktree script failed on the app pair / Root worktree already existed, so `git worktree add` for the root failed / Created the app worktree by hand; A repo-wide grep in the main checkout ran past the timeout / Searched the whole tree including data / Stopped it, used `git grep` instead

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T323-edge-function-followups.md"`

### Execution Report: T415 (2026-10-08)

The Carta bot's day plan failed for the owner twice in a row on 2026-10-08 with "The Carta bot had a hiccup". The edge_errors table, live since migration 040, recorded the cause: code ai_timeout, origin edge, HTTP 504, no upstream status. So Gemini never answered with an error. plan-day itself gave up after waiting 45 seconds for the first model in its chain, gemini-flash-latest. That is a thinking model, and on a paid account the request also carries live Google search. The 45 s limit ended the whole request at once, by design, although the lite models behind it in the chain answer a day in seconds. Now the whole chain shares one time budget of 80 s.

Broke: Every day plan failed with "had a hiccup" / A 45 s timeout on the thinking model with live search ended the whole request / One 80 s budget across the chain; a timeout falls over

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T415-plan-day-time-budget.md"`

### Execution Report: T416 (2026-10-09)

The global daily cap on the Carta bot is now proven on production, not only by reading the code. The owner set the Edge Function secret AI_GLOBAL_DAILY_CAP to 1 and asked plan-day for a day plan with new answers. The app showed the shared-budget refusal ("...fully used. It resets tomorrow; the built-in planner still works right now."), with Try again and Plan it myself instead, and no hiccup. That is the global_cap path of ai_consume (007) through plan-day's 429. The secret was then deleted (confirmed by `supabase secrets list`), so the cap is back to its default of 200.

Broke: The first cap test let two plans through / The secret was saved as AI_GLOBAL_DAILY_CAPValue / Deleted and re-added under the exact name

Full: `git show archive/execution-full-2026-11-03:"Execution/P2/T416-global-cap-proof.md"`
