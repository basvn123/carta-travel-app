# P1 digest

28 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`.

### T012: Publish the statutory Imprint (2026-09-23)

The Imprint component was created and integrated into the Account panel following the PrivacyPolicy.jsx pattern. The page is now accessible from the Account panel under the Help section and displays legally required business information: legal name, geographic address, contact email, enterprise number (KBO/BCE), and VAT number. The component reuses the existing auth-modal and privacy-modal CSS, ensuring visual consistency with the Privacy Policy. Six language files were updated with the i18n key account.imprint (English: "Imprint", Dutch: "Rechtspersoon", German: "Impressum", Spanish: "Aviso legal", French: "Mentions légales", Italian: "Note legali").

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T012-imprint.md"`

### T013: Draft and publish the Terms of Service (2026-09-23)

Carta now has Terms of Service. They live in one React component, TermsOfService.jsx, built on the same overlay and modal pattern as the privacy policy and the Imprint, and they can be reached from three places: the help group of the Account panel, a line under the pass table in the pass modal, and a URL. Before this task a traveller could buy a Trip Pass or a Year Pass through Stripe without any contract text existing anywhere, and nothing in the checkout collected the waiver that ends the 14-day withdrawal right.

Broke: A Python edit rewrote AccountPanel.jsx from CRLF to LF, a 2,675-line diff / Reading with universal newlines / Reverted with git checkout, re-applied with newline='' on read and write; every later edit used the same guard; npm run build failed with ENOSPC / C: drive full, 4.7 GB of Visual Studio installer cache in Temp / Cache folder deleted, 4.7 GB...

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T013-terms-of-service.md"`

### T017: Add the lawful-basis table and retention periods to the privacy policy (2026-09-23)

The Privacy Policy component now includes two new sections that address the two gaps identified in Legal.md. First, a table under "Legal basis for processing" names the three legal grounds under GDPR Article 6 by which Carta processes personal data: Contract (Article 6(1)(b)) for email, name, saved trips and plans used for account management and sync; Legitimate interest (Article 6(1)(f)) for user signups, engagement, and destination analytics used to understand and improve the app; and Consent (Article 6(1)(a)) for location data shared only when the user explicitly requests address geocoding.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T017-lawful-basis-and-retention.md"`

### T018: Confirm vendor DPAs, especially Gemini (2026-09-23)

Nothing in the codebase. This was a verification task: read the published data processing terms for every vendor that touches traveller personal data, confirm each one is in force for Carta, and write down where it lives so the next person does not have to find it again. Four DPAs were confirmed against the vendors' own published text rather than summaries. Two of the four turned up something that needs a decision. The task named Cloudflare as a vendor. Carta does not use Cloudflare. A search across `continent-app/src`, `continent-app/vercel.json`, `continent-app/package.json`, `supabase/` and `pipeline/` returns no match for the string at all.

Broke: Task named Cloudflare as a vendor / Carta uses Vercel; Legal.md names Vercel, the prompt did not / Verified Vercel in its place and recorded why; Vercel DPA does not cover Carta / The DPA is scoped to Enterprise and Pro plans; Carta is on Hobby / Not fixed here, it needs a paid plan.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T018-vendor-dpas.md"`

### Execution Report (2026-09-23)

The MapLibre attribution control is confirmed visible on all nine map components across the app, rendering CARTO and OpenStreetMap credits on the map itself at both desktop and mobile viewports. The control is initialized with compact mode enabled and styled consistently with the app's visual language. No code changes were required; this was a verification task confirming that the legal requirement for on-map attribution is satisfied.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T019-map-attribution.md"`

### T020: GDPR Article 20 data export (2026-09-23)

A signed-in traveller can now download everything Carta holds on them as a JSON file, from a new "Your data" section in the Account panel's profile spoke. It sits directly above the danger zone, so portability and erasure are adjacent without being merged. The mechanism is a new Postgres function, `export_user_data()`, which returns the caller's trip plans, trip plan stops, paywall events and content overrides as one jsonb object. The app adds the account's own identity fields on the client side and hands the browser a download named `carta-data-YYYY-MM-DD.json`.

Broke: `npm run build` could not find vite / `node_modules` absent in this checkout / `npm install`; Three packages failed to resolve at build time (rolldown binding, lightningcss binding, supabase-js, jspdf's dompurify) / Truncated downloads from the npm optional-dependency bug the rolldown error names; the rolldown binding was 1.5 MB against a real 20.8...

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T020-gdpr-data-export.md"`

### T021: Close the remaining licence ledger rows (2026-09-23)

The data_licenses.md ledger now has complete attribution information for the Belgian transport operators (SNCB, De Lijn, STIB, TEC) and updated risk assessments for the four commercial-scope open items. The corresponding entries have been added to attribution.js. One new ledger row closed explicitly, three others marked as open with specific next steps. Before this task, four Belgian operator rows in section 3 of data_licenses.md showed "MISSING" attribution status despite the collector being live since 2026-07-31. The issue was not that credit was owed but not given,the ledger itself had never settled what each operator's actual terms were.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T021-licence-ledger-close.md"`

### T022: EUIPO search and the Article 30 record (2026-09-23)

This task completed two compliance items: an assessment of the European Union Intellectual Property Office database for existing "Carta" trademarks in classes 39 and 42, and a one-page record of processing under GDPR Article 30. The EUIPO trademark assessment yielded a recommendation against registration: the term "carta" is descriptive in multiple EU languages and EUIPO examiners will likely refuse the application on absolute grounds under Article 7(1)(c) of the Trade Mark Regulation. A weak registration, even if approved, would offer poor enforcement value against competitors' use of the same descriptive term. The €850 filing fee is not justified given this outcome.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T022-trademark-and-article-30.md"`

### T023 , Reclaim tens of GB locally, for free (2026-09-23)

C: was down to 0.81 GB free at the start of this task, which is the real reason this task mattered today, not an abstract cleanup. Four things were removed: `continent-app/dist`, `continent-app/node_modules`, `continent-app/du.exe.stackdump`, and four of the five ~110 MB `app_data.*.json` masters. `app_data.json`, the current production master, stays. Before deleting the four masters, they were copied from the existing `$TEMP/carta-master-snapshot/` staging copy (made in T005) onto the USB drive at `D:\carta-backups\app_data_masters\`, and the SHA256 checksums from T005 were re-verified against that USB copy before anything local was deleted.

Broke: `Optimize-VHD` not found / This machine has no Hyper-V PowerShell module; Docker Desktop's WSL2 backing disk is a plain vhdx compacted with `diskpart`, not the Hyper-V cmdlet the task prompt assumed / Used `diskpart`'s `compact vdisk` instead, the standard non-Hyper-V route for this file type; `diskpart` refused to run in this session / Needs admin...

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T023-local-disk-reclaim.md"`

### T024 Move off Vercel Hobby to Cloudflare Pages (2026-09-23)

The app still serves from Vercel. What changed is that everything needed to move it is now written down, committed and machine-checked, and the one thing standing in the way is measured rather than assumed. The task could not finish as specified, for a reason the task itself anticipated. The DONE WHEN asks for the app to serve from Cloudflare Pages on the production domain. Cloudflare Pages refuses any deployment over 20,000 files. A production build of this app is 52,132 files. That is not close to the ceiling, it is 2.6 times past it, so a Pages deploy today would be rejected on upload and the production domain would be left pointing at nothing.

Broke: The task cannot complete as specified / Pages refuses over 20,000 files; the build is 52,132 / Stopped before deploying, per the task's own DEPENDS ON clause and §8 step 6. Prepared the config, gated the ceiling, wrote the runbook.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T024-cloudflare-pages-migration.md"`

### T025 Untrack generated build artifacts from git (2026-09-23)

Nothing in the tree. The task's own precondition, that Vercel builds and sync-data.mjs must not rely on the tracked copies of `continent-app/public`, does not hold, so the untrack was not run. This report records the evidence, the measurements the untrack would move, the exact commands to run when the precondition is met, and one production defect the verification uncovered on the way. The short version of why it is blocked. The app's boot payload is `continent-app/public/app_data.json`, written by `scripts/sync-data.mjs` from the pipeline master `app_data/app_data.json` at the repository root.

Broke: Production returns 404 for every `/poi/<id>.json` shard / `public/poi/` is ignored by the inner `.gitignore`, so it was never tracked at the root and Vercel never has it / Not fixed here. See What is still open.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T025-untrack-build-artifacts.md"`

### T026 Reclaim .git via history rewrite, gated (2026-09-23)

Nothing in git history, and nothing on disk except this report. The task was gated on manual approval and a verified backup, neither of which existed in this session, so the work was a read-only measurement of what a purge would actually buy, followed by a written execution runbook and an explicit deferral. The measurement changed the shape of the task. The premise was that about 3.1 GB of `.git` is legacy generated JSON blobs that a `git filter-repo` purge would erase. That is not what the 3.2 GB is made of. Broken down: 1.83 GB of blobs live in the pack files, 833 MB is the Git LFS object cache which filter-repo does not touch at all, and the rest is index, refs and logs.

Broke: Aggregated blob sizes came to 1,206 MB against 1,831 MB of packed blobs / `%(objectsize:disk)` from `cat-file --batch-check` under-reports for objects that serve as delta bases / Re-ran the aggregation against `git verify-pack -v`, whose size column is the true packed byte count; The 3.1 GB target did not match any measurable component / The figure...

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T026-git-history-rewrite.md"`

### T027 Delete orphaned frontend components, keep the URL logic (2026-09-23)

Six dead component modules (821 lines total) were removed from the codebase. FlightPickerMap.jsx, TrailsNearby.jsx, MapLegend.jsx, PlaceSizeToggle.jsx, ExploreFilterSheet.jsx, and ReachFilter.jsx were not imported anywhere and appear to be remnants of earlier feature iterations. No modules in the codebase reference them. The URL parameter handling for reachHours (the rh query string parameter) was preserved in urlState.js because it is live functionality, independent of any component.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T027-orphaned-components.md"`

### T028 Classify pipeline scripts into three tiers (2026-09-23)

Every `.py` file under `pipeline/` now carries a declared tier, both in a report and in the file itself. The tier is a `Tier: ...` line inserted as the first line of the module's docstring (or a `#` comment when a file has none): `Scheduled (run_pipeline task <key>)`, `Manual`, `Library`, or `One-shot, done, kept for provenance (pipeline/oneoff)`. Two scripts were moved to `archive/` as Superseded, with rows added to `archive/README.md` following its existing table format. The task's own text said 47 standalone scripts. The real numbers are larger: 82 top-level `pipeline/*.py` files and 255 `.py` files across the whole `pipeline/` tree (11 subpackages plus the root).

Broke: `pytest tests/test_rating_distribution.py` fails on `curated/fitted sd gap 0.280 >= 0.18` / Pre-existing: the test's own comment says "Phase A has not run; this suite is the contract it must meet" (rating_v4 Phase A, per CLAUDE.md's phase plan, is not finished).

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T028-classify-pipeline-scripts.md"`

### T029 Audit run_pipeline.py and expand the CI gates (2026-09-24)

Two things, one per half of the task. `docs/PIPELINE.md` now exists and describes what `run_pipeline.py` actually does: the five cadence tiers and the exact rule that decides "due", how the state file, the lock file and the five flags interact, the three separate mechanisms that carry task ordering, every guard and what quiet degradation it exists to prevent, the two different things that happen when a task fails, the Windows assumptions, and a row per task for all 65 with its cadence, scripts, what it writes, its guard, the wall time where one was ever recorded, and whether it is safe on unattended cron. Nothing in `run_pipeline.py` was touched.

Broke: `npm run ci` was already red before this task, at the test step / `"test"` globbed `tests/*.mjs`, which includes `explore.spec.mjs`, a Playwright harness that needs a server on 4173. With no server it fails with `ERR_CONNECTION_REFUSED`. Confirmed pre-existing by reading `package.json` on the parent branch `p1-orphaned-components`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T029-pipeline-audit-and-ci.md"`

### T252: gc and LFS prune, no history rewrite (2026-10-01)

The root repository's `.git` went from 3,215 MB to 1,151 MB, a saving of 2,064 MB. No commit hash changed and nothing was force-pushed. The thirteen packs, which had never had a full gc, are now one pack of 528 MiB. The 522 MiB of loose objects are gone, and the LFS cache lost 35 objects (227 MB) that no recent commit references. That is more than T026 forecast (901 MB). Even without the reflog expiry (see below), `gc --aggressive` re-deltified the whole object store and threw away the unreachable objects nothing points to. T026 counted only the unreachable blobs and the LFS cache, not what a full repack saves on reachable data.

Broke: `git clone --mirror .git D:/...` stalled, upload-pack idle for over 10 minutes / Not diagnosed; local transport over to the USB drive / Replaced by `git bundle create --all`, verified; The background job was killed at its 90-minute limit during the LFS step / `du` over thousands of files on the USB drive took longer than the copy itself / The copy...

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T252-git-gc-and-lfs-prune.md"`

### T260: _truncate_lc.py no longer truncates on import (2026-10-01)

`pipeline/cycling/_truncate_lc.py` ran its whole body at module level: an import, a `python -c "import ..."`, a test collector or a linter that imports modules would connect to the trailslab lab and run `TRUNCATE TABLE cycle_landcover`. T028 found it, the one script in the tree that could lose data just by being imported. The body now sits in `main()` behind an `if __name__ == "__main__"` guard, and `main()` truncates only when given `--yes`; without it the script prints what it would do and exits 0. The `cycle_sources` import moved inside `main()` too, so importing the file opens no connection and loads nothing from the lab code.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T260-truncate-lc-guard.md"`

### T261: run_pipeline.py fails loudly, in order, and keeps backfill manual (2026-10-01)

Stage 4 of `Execution/_OPEN-MASTER.md`, items 2 to 5: the orchestrator fixes that matter once the pipeline runs on a timer on the CAX11, where nobody reads a traceback. All four come from the T028 and T029 audits. A task that raises is now a failed task. The guard, the rescore hold, the master backup and the task's `run(ctx)` or `cmds` sit in one `try` per task. An exception logs `RAISED <type>: <message>` and the traceback, then takes the same soft or hard path as a task that returns false. The state file, the ship decision, the freshness report, the `pipeline_runs` row and the heartbeat `/fail` all still happen.

Broke: A real `--only poi_enrich` run from this session passed the new backfill refusal and was stopped only by the other-python guard (nothing ran: the worktree holds no master) / On Windows, CPython's `isatty()` returns True for `NUL`, which this shell gives as stdin / `stdin_is_terminal()` also asks `GetConsoleMode` on Windows; re-run refused as intend...

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T261-pipeline-unattended-fixes.md"`

### T276: Remove the Travelpayouts Drive script and its CSP hosts (2026-10-02)

The Travelpayouts Drive snippet is gone from continent-app/index.html. The Content-Security-Policy in vercel.json and public/_headers no longer allows emrldtp.com, www.travelpayouts.com or sentry.avs.io, and the script hash that matched the snippet is removed from script-src. No third-party script loads on any page now. The "no consent banner needed" position from T214 is true again. Affiliate links built in src/lib/affiliate.js are untouched: they are plain URLs with a marker and need no script.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T276-remove-travelpayouts-drive.md"`

### T292 The root repository stops tracking the generated app data (2026-10-02)

The root repository no longer tracks the 48,211 generated files under `continent-app/public` (1,070 MB of blobs). Those files are `sync-data.mjs` output: the catalogue, its shards and the layer directories. They are served from R2 since T291, no deploy reads them from git any more, and the inner continent-app repository never tracked them. The 15 static files the inner repository does track stay tracked in the root as well: `_headers`, `_redirects`, the icons, the four fonts, `manifest.webmanifest`, `robots.txt`, `sitemap.xml` and `sw.js`. The root `.gitignore` gains 23 `continent-app/public/...` rules, copied from the inner `.gitignore`, so nothing reappears as untracked.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T292-untrack-public-data.md"`

### T293 carta-europetravel.com is served by Cloudflare Pages (2026-10-02)

Production is no longer on Vercel. `www.carta-europetravel.com` is served by the Cloudflare Pages project `carta-app`. The bare domain answers 308 to `www`, with the path and query kept. The data comes from R2, as it has since T291. This is stage 6 of `_OPEN-MASTER.md` and the cut-over runbook in the T024 report, with one deliberate change: Pages takes direct uploads of the prebuilt `dist/` and is not connected to git. A git build cannot make `boot.json` (T290-a), so a git-connected Pages project would repeat the 2026-10-01 outage, exactly as a Vercel git build would. A side effect closes T291-a: a `git push` of main now only builds on Vercel's own URL, never on the domain.

Broke: The apex served the site with 200 instead of redirecting / Pages ignores the domain-level line in `_redirects` / Zone Redirect Rule; T293-b for the dead line; The apex had no record for a few minutes / The Vercel CNAME was deleted before the Pages custom domain was added / Added the custom domain; delete-then-add is the order the dashboard forces,...

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T293-pages-cutover.md"`

### T294 _redirects says what Pages really does, and the Pages config files stay LF (2026-10-02)

`continent-app/public/_redirects` no longer carries the domain-level apex rule (`https://carta-europetravel.com/* https://www.carta-europetravel.com/:splat 308`). Cloudflare Pages only matches paths in `_redirects`, so it ignored that line. The apex served the site with 200 until T293 added the zone Redirect Rule "apex to www", which is now the one place the apex redirect lives. The file now holds only comments, and those comments name the rule. They also correct a second claim. The old comment said that leaving out an SPA catch-all keeps missing paths at a clean 404.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T294-pages-config-hygiene.md"`

### T295 The production build has one command, and ci ends with it (2026-10-02)

`npm run build:pages` is the production build. It runs `npm run build` with `VITE_DATA_BASE` set to `https://data.carta-europetravel.com/data`, so `stage-data.mjs` moves the R2 shards out of `dist/`. It then runs `check-pages-limits.mjs` on `dist/`. The variable is set by `scripts/build-pages.mjs` for its child process, so the command is the same in Git Bash, PowerShell and cmd, and nobody has to type the data base by hand before a deploy. A `VITE_DATA_BASE` already in the environment wins, for a staging host. `npm run ci` keeps its offline same-origin build and smoke test, which need the shards locally, and now ends with `build:pages`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T295-ci-pages-gate.md"`

### T296 Pages previews have one fixed origin the data host admits (2026-10-02)

The data host's CORS rule (`continent-app/scripts/r2/data-cors.json`) now lists `https://preview.carta-app.pages.dev` beside the production origins, `carta-app.pages.dev` and the two local Vite ports. Six origins in all. Cloudflare Pages gives every deploy its own `<hash>.carta-app.pages.dev` origin, and the rule matches exact origins only, so a preview could never read R2. A deploy with `--branch preview` also gets the stable alias `preview.carta-app.pages.dev`, and that alias is now the preview origin. The deploy sequence (data, preview, production, prune) is written once, in the header of `scripts/build-pages.mjs`, where the production build already lives.

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T296-pages-preview-cors.md"`

### T297 Revert T292: the generated app data goes back into the root repository (2026-10-02)

T292 untracked the 48,211 generated files under `continent-app/public` and said `npm run data` (sync-data.mjs) would regenerate them after the merge. That was wrong for most of them. sync-data.mjs writes `app_data.json`, `boot.json`, `dest/`, `poi/`, `fares/` and `country_insights.json`. The rest are the outputs of the pipeline's layer exports: `trails/` (17,716 files), `cycling/` (17,048), `region/` (4,849), `trips/` (3,994), `dossier/` (3,869), `journeys/`, `mountains/`, `lakes/`, `destinfo/`, `beaches/`, `reach/`, `search_index.json`, `poi_credits.json`, `coverage.json`, `country_shapes.json` and `joins.json`.

Broke: 15 of 21 generated data entries missing from disk after the merge / T292 untracked pipeline export outputs on the false premise that sync-data.mjs regenerates them / This revert; The revert deleted the T292 report and undid its register rows / Both were in the reverted commit / Restored from HEAD before committing; reports are never edited or remov...

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T297-retrack-public-data.md"`

### T317 Pages and R2 hygiene: a real 404, a prune that sees removed prefixes, a safe restore note (2026-10-03)

Three register rows are closed. T294-a: `scripts/build-pages.mjs` now copies `dist/index.html` to `dist/404.html` after the build and before the Pages limit gate. With a top-level 404.html Pages answers an unknown path with that page and status 404, instead of index.html with 200. The app is one client-rendered URL and its asset links are absolute (`/assets/...`), so a mistyped deep path still renders the app, now with a true 404 status. The copy is made in the build script, not in `public/`, so `npm run build` and the dev server are unchanged.

Broke: First `build-pages` run was killed, the second failed in vite's `prepare-out-dir` after 3 minutes / The first run died halfway and left a partly cleared `dist/` of 52,000 files / Removed `dist/` and `dist-data/` with PowerShell, third run passed; My first edit of `push-data.mjs` wrote a literal CR and LF into a regex / A heredoc ate the backslashes...

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T317-pages-r2-hygiene.md"`

### T319: legal and privacy copy matches the code (2026-10-03)

The privacy policy, the Terms of Service and the export hint now describe what the code does, and the Article 30 record exists as a file. All of the wording is a proposal: the owner approves or edits it in one review (row T319-a). It is in the components already, so the branch ships it unless the owner changes it first. The privacy policy (`src/components/PrivacyPolicy.jsx`, English only like the other legal texts) had five statements the code contradicts and eight things it did not disclose.

Broke: The first i18n script did not compile / A Bash heredoc ate the backslashes in the regex (the known heredoc trap) / Wrote the script with the Write tool and matched the line by its prefix instead of a regex; Vite would not load the session config / The config in wt/ imported 'vite' from a folder with no node_modules / Imported vite by its absolute f...

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T319-legal-copy-matches-code.md"`

### T320: CI and queue hygiene (2026-10-03)

One of the two rows is done. T267-e is closed: `Execution/_queue/wave_gate.ps1` ports the queue runner's gate (a committed report, and no app-repo changes left behind) to the wave runners. It reads the worktree pair that `wave_worktree.ps1` makes, prints one `ok`, `FAIL` or `WARN` line per check, and exits 0 (pass), 1 (hold) or 2 (bad input). It only reads; it never commits, merges or deletes.

Broke: First test hung and failed to diff / A helper function named `Git` called itself, because PowerShell function names are case-insensitive / Renamed it `GitOut`; "0 commits" passed the app check / A one-item array unrolled to a string, and `[int]` of a character is its code / The helper returns the array with a leading comma and drops empty lines; Te...

Full: `git show archive/execution-full-2026-11-03:"Execution/P1/T320-ci-queue-hygiene.md"`
