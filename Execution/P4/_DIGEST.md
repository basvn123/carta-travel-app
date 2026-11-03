# P4 digest

35 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`.

### T062: Split AdminPage.jsx into domain modules (2026-09-28)

`continent-app/src/admin/AdminPage.jsx` was one component of 2,033 lines. The plan in "Carta BackEnd.md", Phase 5, calls it 1,347 lines; that figure predates T042 and T043, which added the AI usage, cache hit rate and margin sections. It is now 151 lines and does three things only: it shows the lock until the owner re-authenticates, it draws the top bar with the six tabs, and it picks which view goes in the body. Everything else moved into 24 files under `continent-app/src/components/admin/`. Nothing a user or the database can observe changed. The same RPCs are called with the same arguments at the same moments, and every class name and i18n key is where it was.

Broke: The first app commit stored `AdminPage.jsx` with mixed line endings / The slicing script read the inner repo's CRLF blob and joined with LF / Rewrote all 25 files with CRLF in the working tree; committed the one file whose stored form changed (`c8538c4`); The first draft of the shell dropped the `{section === 'feedback' && (` line / An off-by-one i...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T062-admin-component-split.md"`

### T063: Enforce MFA (AAL2) on destructive admin actions (2026-09-28)

The two admin actions that cannot be undone, deleting an account and banning one, now refuse any session that has not passed a second factor. Migration `supabase/migrations/032_admin_mfa_destructive.sql` re-creates `admin_delete_user` and `admin_ban_user` from their 015 definitions with four added lines each. Right after `admin_guard('destructive')` they read the Authenticator Assurance Level from the caller's token with `auth.jwt() ->> 'aal'`, and unless it is `aal2` they raise `MFA required for this action`. Nothing else in either function moved; a diff of the 015 bodies against the 032 bodies shows only those four lines. Before this task no admin RPC looked at the assurance level.

Broke: The assertion that 032's self-check printed its notice failed on the first run / `execFileSync` drops stderr when the process exits 0, and psql writes NOTICE to stderr / The test runs psql through `spawnSync`, which keeps stderr on success

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T063-mfa-on-destructive-actions.md"`

### T064: Make the audit log hold rollback state (2026-09-28)

The two admin functions that change what every visitor sees without a deploy, `admin_set_config` and `admin_set_override`, now write the row as it was and the row as it became into the audit trail. Before this task a `set_config` audit row held `{key, value}` and an `override_set` row held `{layer, item, patch}`: the new value only. When a bad banner or a wrong photograph went live, the trail said what it had become and nothing about what it had been, so there was no way back short of a backup. Now every such row carries a `previous` and a `new` object, and a maintainer can put the old row back from the audit row alone.

Broke: Migration 018 as committed does not apply on PostgreSQL 18.1 / Its image regex uses the bound `{5,600}` and Postgres caps a repetition count at 255; 018's own self-check raises (known, T031-d) / The test applies a `{5,255}` copy from a temp directory for the test only and says so in its output; 018 in the repo is untouched

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T064-audit-log-rollback.md"`

### T065: Elevate guard tiers on the three live-effect RPCs (2026-09-28)

`admin_set_config`, `admin_set_override` and `admin_set_feedback_status` now call `admin_guard('destructive')` instead of `admin_guard('read')`. These are the admin functions whose effect is live the moment they return: the site notice, maintenance mode and feature flags, the catalogue corrections laid over the static layers, and the feedback inbox. The change ships as a new migration, `supabase/migrations/034_admin_guard_tiers.sql`, not applied to the live project. A test against a throwaway database proves that all three now hit the destructive gate where they did not before.

Broke: The first attempt to write 034 through a Git Bash heredoc did not run / The Bash tool rejected the command while parsing the quoted SQL comments; nothing was written / Wrote the header and footer with the file tool and assembled 034 with a node script; Migration 018 as committed does not apply on PostgreSQL 18 / Regex bound `{5,600}` exceeds the ca...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T065-guard-tier-elevation.md"`

### T066: Scope site_config visibility with a public flag (2026-09-28)

`site_config` now has a `public` column, and the browser can read a row only when that column is true. Until now the table had one read policy from 014, `site_config_read_all`, with `USING (true)`, so anyone holding the anon key could read every row. Migration `supabase/migrations/035_site_config_visibility.sql` adds `public boolean not null default false`, replaces the old policy with `site_config_read_public` (`FOR SELECT TO anon, authenticated USING (public = true)`), and marks the three keys the app reads as public. Every other key, present or future, is private unless someone marks it otherwise.

Broke: 018 as committed does not apply on PostgreSQL 18 / The `{5,600}` regex bound is over the cap of 255 (T031-d, already registered) / The test applies a `{5,255}` copy from a temp directory; 018 is unchanged

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T066-config-visibility-scoping.md"`

### T067: Public guides index (read model) (2026-09-28)

The admin page has a seventh tab, Guides, that lists every trip plan a traveller has made public, newest first, with the author's name, handle and email, the publish date, the cities and a views column. It reads a new RPC, `admin_list_public_guides()`, added by migration `supabase/migrations/036_admin_public_guides.sql`. Before this task the admin had no way to see what had been published: nothing in the admin surface read trip_plans by visibility. In the test database an admin could see 0 of 3 public guides before 036 and 3 of 3 after it. The migration is not applied to the live project.

Broke: The first test seed failed with a duplicate key on profiles / 010's signup trigger creates a profile for every auth.users insert / Update author A's profile and delete author B's, which also models the real way an account ends up with none; A scratch-harness check for "Not in gallery" failed / `.adminpage-chip` is `text-transform: uppercase`, so in...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T067-public-guides-index.md"`

### T068: Electronic notice mechanism (content_reports and report_guide) (2026-09-28)

Anyone reading a public guide can now report it as illegal, signed in or not, and the report lands in a private table that only an admin can read, in a new Reports tab. Before this task Carta hosted public guides with no way at all to report one: in the test database an anonymous visitor could file 0 reports before migration 037 and can file them after it. The intake is rate limited to 5 reports an hour per source. With the limit taken out of a copy of the function, one address filed 20 of 20; with it, the sixth call from one address is refused with `too_many`. Migration 037 is not applied to the live project.

Broke: Two Bash heredocs failed with "unexpected EOF while looking for matching quote" / The tool's shell wrapper choked on long heredocs with many apostrophes / Wrote the migration and the i18n scripts with the Write tool instead; The first app commit stored en.js as a whole-file rewrite (9,317 lines) / A `sed -i` on en.js in Git Bash turned its CRLF end...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T068-dsa-notice-and-action.md"`

### T069: Takedown RPC that unpublishes without deleting (2026-09-28)

An admin can now take a public guide out of the gallery with a written reason, from the Guides tab or from a report card in the Reports tab. The guide goes private and stays in its owner's account, whole: in the test database the number of rows in trip_plans was 4 before the takedown and 4 after, the plan, its stops and its day plan are byte for byte what they were apart from two columns, and the owner still reads and edits it through their own RLS path. The audit log gained exactly one row carrying the reason and the before and after state. The work is migration `supabase/migrations/038_admin_unpublish_guide.sql`, which is not applied to the live project.

Broke: A reason of spaces and a newline was accepted and took the guide down / `trim()` in Postgres strips spaces only, so a newline survived and the reason counted as non-empty / Strip all whitespace with `regexp_replace(..., '^[[:space:]]+\ / [[:space:]]+$', '')`; the test has a blank-with-newline case; A plain UPDATE from the admin session left the gui...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T069-takedown-rpc.md"`

### T070: Statement of reasons and an internal complaints route (2026-09-28)

When a moderator takes a guide down, the owner is now told why, in the app, and can contest the decision from the same place. In the test database a takedown under 038 produced 0 statements and there was no way for the owner to complain; under 039 every takedown produces exactly 1 statement, and the owner files a complaint with one call as an ordinary signed-in user. A moderator answers the complaint from the Reports tab by upholding or reversing it with a written answer the owner reads. A report the moderator decides not to act on can now be dismissed, and every closed report records who decided, when and why.

Broke: A Bash heredoc holding the translation script failed with "unexpected EOF" / The same wrapper problem T068 and T069 hit with long heredocs full of apostrophes / Wrote the scripts with the Write tool; The scratch owner harness would not parse / The line range sliced from verify_saved.mjs stopped one line short of a closing brace / Added the brace in...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T070-statement-of-reasons.md"`

### T071: Edge error telemetry through a first-party RPC (2026-09-28)

An AI failure the traveller sees is now also written down. Before this task the three client wrappers turned ai_timeout, ai_bad_output, url_unreachable and ai_error into a message and stored nothing: loaded with the Supabase client stubbed, 0 of 3 wrappers made any write, and there was no table to write to. Now each wrapper sends the failure to a database function, `log_edge_error`, on its way out, and in the test database 8 of 8 failures sent through the real wrapper code arrive as rows in `public.edge_errors`. The work is migration `supabase/migrations/040_edge_errors.sql`, which is not applied to the live project, one small client module and three edited wrappers.

Broke: A Bash heredoc holding the migration failed with "unexpected EOF" / The known wrapper problem with long heredocs full of apostrophes (T068 to T070 hit it too) / Wrote the file with the Write tool and spliced 016's admin_health body in by line range with a script; `aiDayPlan.js` showed a 350-line diff after the first edit / Python's text mode read C...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T071-error-telemetry.md"`

### T072: Pipeline health metrics on admin_health() (2026-09-28)

Before this task the pipeline's own health lived only in a terminal window and in logs/pipeline_state.json on whoever's machine ran it. If run_pipeline.py had a bad week nobody outside that terminal would know, and admin_health had nothing to say about the catalogue's freshness: 16 fields, one boolean per table, edge_errors the newest. Now run_pipeline.py writes one row to a new Supabase table, pipeline_runs, at the end of every run, whether the run succeeded or not, and admin_health carries a 17th field naming that table.

Broke: service_role's insert into pipeline_runs was refused by RLS in the test harness / The STUBS block created `service_role` as a plain role; real Supabase's service_role has BYPASSRLS, set at provisioning, not by any migration / `create role service_role nologin bypassrls` in the stub, reverted to `nobypassrls` in the harness's `finally` block because...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T072-pipeline-health-metrics.md"`

### T073: Build the parse-failure queue (2026-09-28)

The parse-booking Edge Function now reports structural failure reasons (json_parse, missing_key, wrong_shape, empty_result) alongside ai_bad_output. The client captures input metadata and queues parse failures with a new RPC into a dedicated parse_failures table with 30-day retention. Before this task, only edge_errors (140) recorded that parsing failed; nothing said whether the failure was malformed JSON, a missing required field, wrong types, or empty results. Nothing said whether the input was a URL, a PDF, an image, or text, how large it was, or what app version sent it. That metadata lets the parsing prompt be improved without storing documents or URLs.

Broke: json_parse/missing_key/wrong_shape never logged / logParseFailure was called from the success path, checking `data.reason`, but the function only sets `reason` in a 502 error body / Moved the call into the `error` branch of `requestBookingImport`, reading `reason` from `error.context.json()` alongside `code` and `upstream`; logic.mjs sanitizeParsed...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T073-parse-failure-queue.md"`

### T074: Add a review lifecycle and expiry to content_overrides (2026-09-28)

Every catalogue override now has to say why it exists, what kind of patch it is, and when somebody must look at it again. Migration 043 adds three NOT NULL columns to public.content_overrides: status (verified, temporary or stale), review_by (a timestamp) and author_note (the reason). The writer, admin_set_override, refuses a non-empty patch without a valid status, without a review date between now and 366 days out, or without a reason of at least ten characters.

Broke: The baseline check "anon can read note" failed in the test cluster / A bare Postgres does not have Supabase's default grants on public, so anon had no table SELECT to begin with and the harness could not see the exposure 043 closes / The test's stub block now grants usage on public and sets Supabase's default table privileges for anon, authenticate...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T074-override-review-lifecycle.md"`

### T075: Add orphan patch detection (2026-09-28)

Orphaned content overrides, those targeting catalogue items the pipeline has since dropped, are now detected and listed in a dedicated section in the admin Content tab. A new utility function fetchValidItemIds() scans all catalogue files (beaches, lakes, mountains, trails) across all countries, extracting every item ID the pipeline currently publishes. orphanOverrides() filters the active overrides to keep only those whose item_id is missing from that set. ContentSection displays them in a separate section with red borders and an orphan chip, appearing only if orphans exist. The feature is non-blocking: network failures silently skip detection rather than stalling the admin page.

Broke: verify_admin_panel.mjs failed with "strict mode violation: locator resolved to 2 elements" / The `.adminpage-reviewlist` selector now matched both the due review list and the orphan list, making the selector ambiguous / Updated test selectors to use `.adminpage-review:not(.adminpage-orphans) .adminpage-reviewlist` to target only the due reviews sec...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T075-orphan-patch-detection.md"`

### T076: JSON diff viewer for overrides (2026-09-28)

The override editor already showed the raw patch fields as a form and a live preview of whatever the admin was typing, but nothing showed what an override already saved is doing to production right now. A new component, OverrideDiffViewer.jsx, reads the catalogue item the pipeline wrote (the same object ContentSection already has loaded in its grid) beside the stored content_overrides.patch, and renders a before/after pair for every field the patch actually sets: name, blurb, photo, plus a one-line sentence each for the hidden and featured flags. Nothing else is listed, because a patch has no opinion about a field it does not carry.

Broke: The diff viewer said "This override sets no field a traveller would see" while a changed Name row was visible directly beneath it / The row-list only kept a field when it had a base value or had changed, but the "nothing to show" message fired whenever no row's `changed` flag was true, and a row with a patch value equal to the base value (the orpha...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T076-override-diff-viewer.md"`

### T077: Automated RPC security tests (2026-09-29)

There is now a test that fails when a future migration adds an admin function without an admission check. It applies the whole admin migration stack to a throwaway PostgreSQL database, asks `pg_proc` which functions in `public` are named `admin_*`, and asserts on every one it finds. Today that is 37 functions, 34 of them callable by `authenticated` and 3 internal only, and the run makes 123 assertions, all passing. The design decision worth understanding is why the list of functions is not written down in the test. A hardcoded array of the 37 names would have been easier to read and would have been worthless for the job this test exists to do.

Broke: 036 aborted the run with "trip_plans has no visibility or published_at column; apply 011 and 019 first" / The sibling harnesses only apply migrations up to 034, so their migration list was missing the guide and social chain that 036 to 039 build on / Added 002, 003, 004, 008, 009, 011, 012, 019 and 020 to `MIGRATIONS`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T077-pgtap-rpc-security-tests.md"`

### T078: Registry and licence unification (2026-10-01)

`docs/tos/data_licenses.md` is no longer written by hand. It is rendered from `src/ingestion/core/registry.py`, which now carries two tables that used to live in different places and drift apart: what runs (cadence, the `run_pipeline.py` task, the failure mode) and what each source is licensed for (licence, attribution, share-alike, where the credit renders). A CI workflow fails the build when a collector or a `pipeline/harvest_*.py` script exists without its row, when the committed ledger is stale, or when a cadence in the registry disagrees with `run_pipeline.py`. The hand-written ledger had 147 rows and about 230 lines of prose across twenty sections.

Broke: First parse of the ledger produced a nine-cell row / The lakes OSM row carries `water=lake\ / reservoir\ / lagoon\ / pond` inside backticks and the splitter cut on every pipe / The converter and the renderer treat pipes inside backticks as text; the renderer writes cells verbatim; The NASA POWER `season.py` row had five cells / A missing share-alik...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T078-registry-licence-unification.md"`

### T082 Schema contract in CI, frontend to backend (2026-10-03)

There is now one contract gate that covers the three places a field name can drift apart, and a GitHub workflow that runs it. The gate is still `continent-app/scripts/ci/check-contract.mjs`, the script T029 wrote and T267 extended to the split wires; this task built on it rather than beside it, so `npm run ci:contract` and the new workflow run the same code. The first new half pins the whole top level of the wire to `docs/SCHEMA.md`. Until now the gate checked six meta keys and seven destination fields, which is what the boot path cannot live without.

Broke: A first heredoc append to `contract.mjs` aborted and the scratch extractor lost its backslashes / Git Bash heredocs in this environment eat backslashes and quotes (known, memory) / Wrote the block with the Write tool into scratch and appended it with `cat`; checked the escapes survived; The Edge Functions showed 0 table chains / Their client is nam...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T082-schema-contract-ci.md"`

### T083: Row policy tests and a recorded crash on the ErrorBoundary (2026-10-01)

Two things that were invisible are now checked or written down. The row level security on the tables themselves is now tested as a whole. Until this task the only database security test was T077's, which proves the admin_* functions refuse a normal user. Nothing exercised the table policies, which are what stand between one traveller's saved trips and another's, because the client reads and writes trip_plans, day_plans, friendships and the rest directly through PostgREST with no function in between. Each migration's own self-check runs as the database owner, which bypasses RLS, so a policy that let a second user read the first user's rows would have passed every check in the repo.

Broke: The spec's first page load timed out waiting for domcontentloaded, then the first crash was not seen / On a cold start Vite optimises dependencies and then reloads the page; module scripts delay domcontentloaded behind that / Navigate with waitUntil commit, wait for the crash panel, and do one unasserted warm-up load before the checks; The "error t...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T083-rls-tests-and-errorboundary.md"`

### T253: Migration 018 applies on a fresh Postgres (2026-10-01)

`supabase/migrations/018_content_overrides.sql` no longer uses a regex repetition bound above 255. Line 93 checked an override's image URL with `'^https://[^[:space:]]{5,600}$'`. Postgres caps a repetition count at 255 (`RE_DUP_MAX`), so `CREATE FUNCTION` failed on every fresh database, which broke `supabase start` locally and forced every admin test harness since T064 to apply a patched copy from a temp directory (register row T031-d). The session plan (`_OPEN-MASTER.md` stage 1 step 1) said to change the bound to `{5,255}`.

Broke: The planned `{5,255}` would reject image URLs between 264 and 608 characters / A regex bound is also the length cap / Length moved into `char_length`, regex keeps `{5,}`; The first test run hung in the background / `pg_ctl start` in the same shell job kept the job's stdout pipe open / Ran the test as its own command against the already-started serv...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T253-migration-018-regex-bound.md"`

### T254: The admin page steps a session up to aal2 before ban and delete (2026-10-01)

Migration 032 (T063) makes `admin_delete_user` and `admin_ban_user` refuse any token that is not `aal2`, but the admin page had no way to get one. Pasting 032 would have locked both buttons for everyone. The page can now enrol a TOTP factor and step the session up, so stage 2 of `_OPEN-MASTER.md` can go ahead: the owner enrols (T063-b), then pastes 032 (T063-c). When ban or delete is armed and the session is below `aal2`, a step-up block appears inside the armed box, above the confirm button, and the danger button stays disabled until the step-up succeeds. An account with no verified factor first sees "Set up an authenticator app".

Broke: QR image rendered as broken alt text / `#` in the unencoded SVG data URL starts a fragment / Re-encode the markup in `useMfa.qrSrc`; harness asserts `naturalWidth > 0`; Step 11 of the harness fails / Pre-existing account hub issue, register row T042-d, failing since T042 / Left alone, out of scope

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T254-admin-mfa-step-up.md"`

### T255: Every fare harvest leaves the weekly schedule (2026-10-01)

No fare source is live any more. Wizz Air, Vueling, Volotea and Travelpayouts were retired on 2026-09-27, and on 2026-10-01 the owner retired Ryanair too. Until this task the scheduler still treated all of them as weekly work, so the first run on the Hetzner box would have spent about 30 hours calling fare APIs that are no longer meant to be called. It would also have re-archived and retrained on the same frozen fares every week. Seven tasks in `run_pipeline.py` moved from the `weekly` cadence to `manual`: `tp_stage`, `fares`, `wizz_fares`, `vueling_fares`, `volotea_fares`, `fare_history` and `fare_model`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T255-retire-fare-harvests.md"`

### T256: Every flight price reads as an estimate (2026-10-01)

The fares in the app are frozen. No harvest runs any more (T255), and the shipped slices are 49 to 57 days old (T048-m). Until this task most of them still rendered as plain prices, which reads as a quote. T058-e asked the owner for the age N past which a stored fare should render with the estimate styling. The answer in `_OPEN-MASTER.md` stage 1 step 4 is in effect N = 0: every flight price is an estimate, never a quote. This is the one user-facing change in session A. "The estimate styling Explore already has" no longer exists on Explore. Commit `a91562b` removed the old map, results list, detail breakdown and compare panel, and Explore has not shown fares since.

Broke: `verify_places_tab.mjs` dies at line 96 with "Element is not a `<select>`" / The country filter became a button and listbox (CountryPicker) after the harness was written / Not fixed here (out of scope); row T256-a; No `.places-card-price` could be reached in the browser / The city-day card renders under the trips category, but the trips index and t...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T256-flight-prices-as-estimates.md"`

### T257: provision.sh writes its R2 objects to the real bucket (2026-10-01)

`continent-app/scripts/r2/provision.sh` makes three `wrangler r2 object put` calls: the four prefix markers (`img`, `data`, `tiles`, `archive`) and one test object each under `img/_test/` and `data/_test/`. Without `--remote`, current wrangler writes objects to the local Miniflare store instead of the bucket, as T045 found (row T045-f). The script would have printed success, the bucket would have stayed empty, and the R2 verify in stage 5 of `_OPEN-MASTER.md` (`verify.mjs`, row T044-c) would have failed against the real bucket for a reason nowhere in its output. All three calls now pass `--remote`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T257-r2-provision-remote.md"`

### T258: Every task branch merged into main, in both repositories (2026-10-01)

Since the `prod-2026-09` baseline, every task from T001 to T077 had lived on its own stacked branch, and `main` (both locally and on `origin`) had fallen behind. This task is step 8 of `_OPEN-MASTER.md` stage 1: merge them all, then add session A's own fixes (T253 to T257) on top. Root repository. The p0 to p4 stack was linear: every task branch was already an ancestor of `p4-open-master-rewrite` except three side branches holding only reports. `main` was fast-forwarded to the stack tip. Then `p2-stripe-price-audit` (T030) and `p2-stripe-purchase-e2e` (T031) were merged with `--no-ff`, because their reports and `supabase/functions/checkout/test_purchase_e2e.md` were missing from the stack.

Broke: Checking out a branch in one repository left the other with 3 to 66 "modified" files / Both repositories track `continent-app/`; one writes LF where the other wrote CRLF / Each time, confirmed `git diff --ignore-cr-at-eol` is empty, then stashed.

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T258-session-a-merge.md"`

### T266: Harness repairs (stage 9, group D3) (2026-10-02)

A dozen screen and admin harnesses in continent-app/scripts were brought back in line with the app as it is now, and the checks that were only ever run from scratch copies became permanent harness steps. No app source file changed. Everything is under scripts/ in the app repo. Repaired because the app moved on: verify_explore.mjs (the bar has no count any more, and the phone rail is now the shared Filters sheet), verify_mountains.mjs (a bare .places-filter-btn found the hidden Explore button first), verify_places_tab.mjs and verify_trips.mjs (the country filter is the CountryPicker button and listbox, there is no General tab, the sight photos sit behind "more about the day", near mode needs...

Broke: Explore phone pass found 0 cards / The bottom nav mounts after the catalogue boots, later than the 2.5 s the harness waited, so the Explore tab was never clicked / Wait for the nav item; Explore "narrows live" check read a count that is gone / The bar has no count since Explore v5, and the tier legend counts the whole catalogue / Count the non-vill...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T266-harness-repairs.md"`

### T268 · admin follow-ups, database side (2026-10-02)

One new migration, `supabase/migrations/045_admin_followups.sql`, closes fourteen register rows on the database side of the admin and moderation surface. It is not applied to the live project. A refused delete or ban below aal2 now leaves an audit row. 032 raised, and the raise rolled back any write, so the attempt most worth recording left nothing in our own trail. 045 returns `{error: 'mfa_required'}` instead and writes one `mfa_refused` row (target, function, aal claim). The check still sits after the guard and before any read of the target, so an aal1 session learns nothing new. The app maps both the old hint and the new code to the same sentence (T063-d).

Broke: A maintenance value with no message was accepted / jsonb_typeof of a missing key is NULL and IF treats the NULL chain as false; present since 015 for announcement and since 017 for maintenance / coalesce on every jsonb_typeof in 045, asserted in the test; Re-pasting 036 after 045 fails / 036's self-check calls admin_list_public_guides() and two ver...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T268-admin-followups-db.md"`

### T270: admin UI follow-ups (2026-10-02)

Seventeen open rows from the admin and moderation work are now closed or have a stated reason for staying open. The admin page now shows what is waiting for a person: a count badge on the Reports and Content tabs, and two tiles on the Overview for new DSA reports and overdue overrides. The Overview also gets two cards, import parse failures (admin_parse_failures) and the VAT One Stop Shop figure (admin_oss_threshold). The Site tab lists every config key with a Public or Private switch (the 045 RPCs); the three keys the app reads signed out are locked public. The Guides tab loads 100 and has Show more. The Audit tab draws previous and new side by side.

Broke: Whole-file diffs on the first commit / autocrlf rewrote CRLF blobs to LF / recommitted with core.autocrlf=false and restored each file's own endings; Harness never reached the admin row / dev server had no Supabase env / passed the two public VITE values through the environment; Section 9 of the harness would fail with the new key switches / select...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T270-admin-ui-followups.md"`

### T274: Migration 046 fixes the co-planner invite in 020 (2026-10-02)

Once migration 020 is live, a traveller can invite a friend to co-plan a trip. Before this task, that invite could never work. 020's insert policy on trip_collaborators, `coplan_insert_owner`, checks the friendship with `are_friends(a, b)`. Migration 011 revoked that function from the client roles. An RLS policy runs with the caller's privileges, so every invite from the client would fail with 42501 "permission denied for function are_friends". 020 is not on the live project yet, so nobody has hit this. T083's row policy test found it. New migration `supabase/migrations/046_coplanner_invite_fix.sql` fixes it the same way 012 fixed profiles and 023 fixed trips.

Broke: The first before run aborted with "role service_role already exists" / I ran it at the same time as the after run on the same cluster, and roles are cluster-wide, so the two stub scripts raced / Re-ran it on its own; it passed 334 of 334; supabase/migrations was missing from the root worktree / The worktree is a sparse checkout that leaves out supa...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T274-coplanner-invite-fix.md"`

### T279: verify_fare_provenance rewritten for no flight prices (2026-10-02)

scripts/verify_fare_provenance.mjs predates T256 and T273. It drove the removed map results list, expected a baseline with no tildes and no chips that T256 reversed, and expected flight rows to carry prices that T273 removed. It is rewritten. It now asserts the T273 rule on the trip receipt: with no typed fare, the flight out and home are two route rows with no figure, no tilde, no est. tag, no age chip and no value cell, and the total carries no tilde; with a typed fare of EUR 240, that figure shows as the traveller's own, untagged, with no tilde and no unpriced flight row beside it. Ground legs keep their booking note.

Broke: A first draft also loaded the Destinations tab and expected a city-day price to render; it never did, and one run crashed the page / The city-day cards sit behind the Trips category, the composed door, the one-day chip and a country pick; a plain load does not reach them / Dropped that part.

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T279-fare-provenance-harness.md"`

### T281: Harness repairs, round two (2026-10-02)

Thirteen register rows about screen and admin harnesses were worked through. Nothing under src/ changed; every edit is in continent-app/scripts. Eleven rows are closed, one is closed in part with the remainder split out, and one earlier row (T253-a) is now closed in full. The two failures in verify_trail_page.mjs (W5-a) were a stale harness, not an app bug. Trips now opens on the ten-card style grid of the Journeys library, which has no sort chips and no cards, and the composed itineraries sit behind the "composed" door at its end. The harness looked for chips and day cards on the grid. It now goes through that door, sets the length slider to one day first, and then picks Albania.

Broke: Dev server took 50 s or more per request for the first minutes, so the first harness runs timed out / Cold dependency cache while other sessions were building; it settled to under a second / Waited, warmed the server with curl, reran; verify_regions.mjs reported "0 pointers" / The fence regex expects LF and a Windows checkout has CRLF / Normalise l...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T281-harness-repairs-2.md"`

### T284: migration 047, three small schema fixes (2026-10-02)

One new migration, supabase/migrations/047_small_schema_fixes.sql, makes three changes that three earlier tasks could not make because no migration was allowed to them. A fourth row, a missing test, is closed in the admin harness. Nothing is pasted anywhere: the owner pastes 047 at _OPEN-MASTER stage 2.2 row 16, after 045 and 046 (row T284-a). Client crashes are stored (T083-b). Since T083 the ErrorBoundary calls log_edge_error('app', 'client_crash', 'client') once per render crash, and 040 refused both words in the table checks and again in the writer, so every call was dropped.

Broke: test_rls_policies.mjs did not parse after the first edit / An apostrophe in a single-quoted check name ("caller's") / Reworded to "caller id"; The register showed every line changed / The rewrite wrote CRLF over a file the index holds as LF, plus one stray carriage return / Rewrote the file with LF only; the diff is the four status cells and four n...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T284-migration-047-small-schema-fixes.md"`

### T310: registry follow-ups (2026-10-02)

Five register rows raised by T078, T113 and T300 are closed. The licence registry (`src/ingestion/core/registry.py`) now carries a storable-copy verdict for every ledger row, and the generated ledger shows it as a seventh column, Storable copy. The registry also holds a new `APP_CREDITS` table that names, for each of the 43 entries in `continent-app/src/data/attribution.js`, the ledger row that obliges it, and the ledger tool can check the app file against it. Retired rows that sat inside live chapters (WorldClim, the Wikivoyage description signal, the Claude/Gemini describe.py row) now close the ledger in a new chapter 15, "Retired rows (history)".

Broke: First `STORABLE` literal had a stray closing brace / The generator script appended it twice / Removed one; `validate()` and import passed; `--check-app` found 0 entries / A back-reference in the regex was turned into a control character by a shell heredoc / Rewrote the pattern; the tests now pin it

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T310-registry-followups.md"`

### T315: migration 048, launch metrics and the full GDPR export (2026-10-03)

One new migration, supabase/migrations/048_launch_metrics_and_full_export.sql, gives the three missing launch numbers an instrument and widens the GDPR export to every table that holds a traveller's rows. The app writes the three numbers and the admin Overview reads them. Nothing is pasted anywhere: the owner pastes 048 after 047 at _OPEN-MASTER stage 2.2 (row T315-a). The three numbers live in one table, public.launch_counts, which holds one integer per day per (event, target, surface) and nothing else. There is no user column, no time of day, no page and no device, so it is not personal data and is not in the export.

Broke: 048's first apply stopped in its self-check ("could refer to either a PL/pgSQL variable or a table column") / The self-check declared a variable n, and launch_counts has a column n / Renamed the variable to v_cnt; The RLS export check failed on the victim's display name / The profiles fixture's owner control updates display_name to 'tampered' / Com...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T315-migration-048-launch-metrics-full-export.md"`

### Execution Report: T365 (2026-10-07)

The eleven decisions the owner took on 2026-10-07 in block A3 of `Execution/_OWNER-RUNBOOK.md` (rows T063-e, T065-b, T067-d, T068-d, T068-g, T069-c, T069-d, T070-c, T070-g, T074-c, T217-d) now exist as one migration, `supabase/migrations/051_moderation_and_admin_decisions.sql`, and the app screens that use it. Before, a hijacked aal1 admin session could hand out a pass, ten bans in a minute blocked every config save, an overdue temporary override applied forever, a taken-down guide could be republished at once and its share links kept working, a takedown named no ground, a notice needed no good-faith statement, reports and statements were kept forever, and deleting an account erased its purc...

Broke: 048 did not apply in the stage 2 order of `_OPEN-MASTER.md` (028 to 030 and 025, 026 not yet in) / 048 needs `ai_model_events` (028), and its self-check calls `export_user_data`, which reads `pass_grants.amount_cents` and `currency` (026) and the consent columns (025) / The test chain pastes 028 to 030 and 025, 026 before 048; 051 inherits the same...

Full: `git show archive/execution-full-2026-11-03:"Execution/P4/T365-moderation-admin-decisions-051.md"`
