# T281: Harness repairs, round two

## Task ID

T281

## Date

2026-10-02

## What changed

Thirteen register rows about screen and admin harnesses were worked through. Nothing under src/ changed; every edit is in continent-app/scripts. Eleven rows are closed, one is closed in part with the remainder split out, and one earlier row (T253-a) is now closed in full.

The two failures in verify_trail_page.mjs (W5-a) were a stale harness, not an app bug. Trips now opens on the ten-card style grid of the Journeys library, which has no sort chips and no cards, and the composed itineraries sit behind the "composed" door at its end. The harness looked for chips and day cards on the grid. It now goes through that door, sets the length slider to one day first, and then picks Albania. All 50 checks pass.

verify_csp.mjs (T276-a) no longer holds three hard-coded copies of the old policy. It reads the "/*" stanza of public/_headers, read only, which is what Cloudflare Pages sends. It keeps one pass criterion (the real header) and one reference run (the same header without the Wikimedia and Geograph image hosts). The emrldtp host is gone from the noise regexes of about fifty scripts (four comments and one host classifier that mention it stay).

verify_paywall.mjs (T265-d) and verify_regions.mjs now honour CARTA_REPO_ROOT, so they run in a sibling worktree pair. The regions harness also needed the REGIONS.md fence regex to accept CRLF, which a Windows checkout produces; that was the cause of "REGIONS.md pointers" in T296-c. It resolves 100 percent of its pointers now. The fourteen admin database tests that read the repo root got the same override.

verify_country_brief.mjs asked the phone for a 36px info button, but the Q1 phone audit draws it at the 44px tap size on 768px and under. The harness now expects 44 on a phone and 36 on desktop. verify_explore.mjs gained the no-tilde check from T279-a: no Explore card carries a tilde fare, an "est." tag or a "not a live quote" title.

verify_admin_panel.mjs carries four changes. Every ten-second wait is now 30 seconds (CARTA_WAIT_MS overrides it); this is T268-g. It has the two missing T268 checks: a grid save sends a two-letter p_country, and a review-list row saved with a country (a real lake, Lake Como in IT) opens with the pipeline photo and Lake Como in the diff before-column. The stub owner of the reports and complaints is now an account that still exists, so the "Open owner" hand-off is tested: it opens the owner account and Reports is still there. The earlier stub owner was the account the Users step deletes. verify_guides.mjs now sends six notices, back to the list and into the guide each time, and checks the sixth is refused with the "5 reports in the last hour" sentence and keeps what was typed.

T176-c is a new harness, verify_trail_free_gpx.mjs. It opens a loop (Llogara Circle) and the one-way border trail Korab 9/1 as a signed-out guest with no paywall seam, presses GPX and KML, and checks a file arrives and no pass dialog does. It runs at 390 and 1280px and reads the border-trail subtitle. All 18 checks pass: the subtitle reads "Albania", with no ISO code, and neither width scrolls sideways.

test_rls_policies.mjs (T253-a) lost the dead "{5,255}" patched-copy branch and the "018 as committed fails" header. 018 is applied as committed, as the other twelve scripts already do.

T062-g and T266-c: two clean back-to-back runs of verify_admin_panel.mjs on a dev server, 24 admin-*.png files each. 22 files are byte-identical. admin-overview.png differs in 5 pixels and admin-detail.png in 15, each by one level out of 255 in a single channel, which is anti-aliasing rounding on a curved edge, not content or motion. Determinism is now shown: a gate can compare these files with a tolerance of two levels.

T267-d: after one `npm run build` (71 s, exit 0) `npm run ci:smoke` passed all nine routes in 52 s wall time, with the served index.html matching dist byte for byte.

Left open, with reasons: the destination page really does overflow sideways on a phone (T281-a, a CSS fix in src, outside this task's scope), the browser-level statement of reasons through a real RPC (T281-b, needs 036 and 039 live), and one end-to-end run of verify_csp.mjs against a fresh build (T281-c).

## Files touched

All in continent-app (branch p4-harness-repairs-2, commits 8005640 and dd18f7f). The root repo carries this report and the register.

**Modified:**
- scripts/verify_trail_page.mjs
- scripts/verify_csp.mjs
- scripts/verify_paywall.mjs, scripts/verify_regions.mjs
- scripts/verify_country_brief.mjs, scripts/verify_explore.mjs
- scripts/verify_admin_panel.mjs, scripts/verify_guides.mjs
- scripts/admin/test_rls_policies.mjs and fourteen more scripts/admin/test_*.mjs (CARTA_REPO_ROOT)
- about fifty more verify, scenario and shoot scripts, one line each (emrldtp out of the noise regex), including scripts/ci/smoke.mjs

**Created:**
- scripts/verify_trail_free_gpx.mjs

**Deleted:**
- None

Root repo: Execution/P4/T281-harness-repairs-2.md, Execution/_OPEN.md.

## Commands run

From continent-app in the worktree wt/T281-app. A dev server on 5202 with the Supabase variables from the main checkout's .env exported into its environment only (never copied), using a throwaway vite config that moves cacheDir (deleted afterwards).

    CARTA_PORT=5202 node scripts/verify_trail_page.mjs
    CARTA_PORT=5202 node scripts/verify_trail_free_gpx.mjs
    CARTA_PORT=5202 node scripts/verify_explore.mjs
    CARTA_PORT=5202 node scripts/verify_country_brief.mjs
    CARTA_PORT=5202 node scripts/verify_trips.mjs
    CARTA_PORT=5202 node scripts/verify_guides.mjs
    CARTA_PORT=5202 node scripts/verify_admin_panel.mjs        (four times, shots hashed after runs 1 and 2)
    CARTA_REPO_ROOT=../T281 node scripts/verify_paywall.mjs
    npm run build ; npm run ci:smoke
    node scripts/verify_destination_page.mjs                   (against dist, its own preview on 4207)
    CARTA_REPO_ROOT=..\T281 node scripts/verify_regions.mjs    (from PowerShell, against dist)
    initdb -D <scratch>/pg442 -U postgres --auth=trust ; pg_ctl -o "-p 55442" start
    PGPORT=55442 CARTA_MIGRATIONS=../T281/supabase/migrations node scripts/admin/test_rls_policies.mjs
    PGPORT=55442 CARTA_REPO_ROOT=../T281 node scripts/admin/test_statement_of_reasons.mjs (also test_admin_followups, test_override_review)

dist/ and dist-data/ were deleted afterwards, the dev server and preview servers stopped, and the throwaway cluster stopped.

## Config and secrets set

None committed. New optional variables: CARTA_WAIT_MS (verify_admin_panel.mjs wait, default 30000) and CARTA_REPO_ROOT in the scripts named above.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| verify_trail_page.mjs failing checks | 2 | 0 (50 of 50) | -2 |
| verify_country_brief.mjs | 67 of 68 | 68 of 68 | +1 |
| verify_explore.mjs checks | 67 | 68 (the no-tilde check) | +1 |
| verify_admin_panel.mjs shots identical across two runs | not known | 22 of 24, the other two differ by 1 of 255 in 5 and 15 pixels | proven |
| ci:smoke routes passed | not run end to end | 9 of 9, 52 s wall, build 71 s | n/a |
| test_rls_policies.mjs on a fresh cluster | not run here | 335 of 335, 018 as committed | n/a |
| test_statement_of_reasons.mjs | not run here | 132 of 132 | n/a |
| Files with emrldtp in a noise regex | 55 | 0 (four comments and one host classifier stay) | -55 |

Figures come from the run outputs named above; the build and smoke times are from the logs of this session.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Dev server took 50 s or more per request for the first minutes, so the first harness runs timed out | Cold dependency cache while other sessions were building; it settled to under a second | Waited, warmed the server with curl, reran |
| verify_regions.mjs reported "0 pointers" | The fence regex expects LF and a Windows checkout has CRLF | Normalise line endings before matching |
| verify_regions.mjs could not read quotas.py in the sibling pair | Hard-coded ../pipeline path | One REPO_ROOT constant for both reads |
| New admin step 8g found no review row | The override list loads once when the panel unlocks, so a row added to the stub later never appears | Seed the row not due, make it due just before the revert, whose save reloads the list |
| Admin step 8g then could not reach the nav | The open editor dialog covered it | Press the editor's own Cancel before moving on |
| My first edits turned CRLF files to LF and made one-file diffs of thousands of lines | sed and a Python write dropped the carriage returns | Restored CRLF per file; the commit shows 178 insertions for 21 files |
| Destination page harness still fails at 390px | A real overflow in src, not the harness | Left failing on purpose, row T281-a with the measurements |

## What is still open

T281-a: at 390px the destination page scrolls sideways by 52 px (scrollWidth 427 against clientWidth 375). The probe named .destp-pdf (413 px wide) and a .panel-fav (159 px, right edge at 427). The cause is in src/styles.css, in the phone grid near line 31625 and the later 44px padding rule near line 32529. verify_destination_page.mjs fails "no horizontal scroll on phone" until that is fixed, which is correct.

T281-b: the statement of reasons is covered through the real RPC only at database level. The browser path stays on ?savedmock until migrations 036 and 039 are live.

T281-c: verify_csp.mjs was parsed and its header reader and host filter were checked on the real file, but it was not run end to end after the rewrite, because dist was deleted. Run it once after the next build.

Also noted, no row: about forty harnesses with their own fixed port (for example 4191 to 4199) start their own server, so they never assumed 4173; the five that did were fixed by T266. verify_reach_filter.mjs was already deleted by T266.

## Rollback procedure

In the app repo, revert dd18f7f and 8005640 on p4-harness-repairs-2 (or reset the branch to 6e6eec8). In the root repo, revert the report commit, which also restores the register rows to open. No data, schema, source or build setting changed.
