# T316 the status surface on the data host

## Task ID

T316 (register row T218-a; no mind-map prompt). Branch p12-status-surface in both repos.

## Date

2026-10-03

## What changed

Carta can now tell travellers about an outage while Supabase is down. The site notice (AnnouncementBar, read from Supabase site_config) was the only in-app line, so it went silent exactly when Supabase was the thing that failed. There is now a second source: a small file, status.json, on the data host at https://data.carta-europetravel.com/data/status.json (R2 object carta/data/status.json). The app reads it once per page load and draws it with the same bar, the same warn and info tones and the same dismiss rule as the site notice. When both are live the status file wins and the bar still shows one line, because the status file is the channel written on purpose during an incident, while the site notice may be an older routine message.

The rules live in continent-app/src/lib/statusFile.js. The file shows only when enabled is exactly true and text is a non-empty sentence (or a map by language with English as the fallback). An optional until time ends it by itself, so a file forgotten after an incident cannot keep announcing an outage that ended; an until that does not parse is ignored rather than obeyed, because a typo in a date should not swallow the line in the middle of an incident. Text goes through stripDashes like every other string. The fetch has a 3 second timeout, sends no credentials, reads text and parses it itself (so an HTML error page or a byte order mark cannot break it), and every failure means no line. Only a build with a data host asks for the file. build-pages.mjs always sets VITE_DATA_BASE for production, so production asks; dev servers, plain npm run build and the ci:smoke preview do not, which keeps a same-origin 404 out of the console and out of ci:smoke's strict same-origin JSON check.

The data host already allowed this: connect-src in public/_headers names https://data.carta-europetravel.com, and scripts/r2/data-cors.json allows GET from the www, apex and pages.dev origins. Neither file was touched. The weekly push cannot overwrite the file either, because push-data.mjs only copies and prunes the entries named in R2_TIER (src/lib/dataHost.js), and status.json is not one of them.

The owner writes the file with a new helper, continent-app/scripts/status_notice.mjs. It runs the file through the app's own parseStatus, prints the exact line a traveller will see or refuses, defaults until to 24 hours ahead, saves to the system temp folder so the file never lands in a repository, writes no byte order mark (Windows PowerShell's Out-File would add one), and prints the wrangler and rclone upload commands with the path filled in. It never uploads anything. docs/INCIDENT_RUNBOOK.md now describes both sources, the fields, the commands and how to clear the line, and sections 4 and 5 say when to use which: the status file lives on R2, so it cannot speak for an R2 outage, where the site notice (Supabase still up) is the right channel.

## Files touched

**Created (app repo):**
- continent-app/src/lib/statusFile.js
- continent-app/tests/statusFile.test.mjs
- continent-app/scripts/status_notice.mjs
- continent-app/scripts/verify_status_banner.mjs

**Modified (app repo):**
- continent-app/src/components/AnnouncementBar.jsx

**Modified (root repo):**
- docs/INCIDENT_RUNBOOK.md (the status surface section, sections 4 and 5)
- Execution/_OPEN.md (T218-a closed, T316-a added)

**Created (root repo):**
- Execution/P12/T316-status-surface.md

No CSS change: the bar reuses .site-banner and .site-banner.warn as they were. No i18n change, no migration.

## Commands run

From the app worktree (C:\Users\Gebruiker\Documents\Portfolio\wt\T316-app):

```
node --test tests/statusFile.test.mjs
node scripts/status_notice.mjs "Test line." --hours 1
node scripts/status_notice.mjs --check
node scripts/status_notice.mjs --clear
VITE_DATA_BASE=http://127.0.0.1:59999/data npx vite --config vite.t316.local.mjs --port 5206 --strictPort
node scripts/verify_status_banner.mjs
npm run lint
npm test
node scripts/ci/design-lint.mjs
node scripts/ci/banned-terms.mjs
```

vite.t316.local.mjs was a throwaway wrapper that only set a separate cacheDir; it was deleted with the cache and the log after the run, and the dev server on 5206 was stopped. The browser harness answers every request to the loopback data host itself (Playwright routing, public/ for the shards, a per-scenario status.json), so no second server and no port beyond 5206 was used. No build was run, so there was no dist/ or dist-data/ to delete.

## Config and secrets set

None. Production needs no new variable: the status URL follows VITE_DATA_BASE, which build-pages.mjs already sets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Ways to tell travellers about an outage while Supabase is down (T218 report) | 0 | 1 | +1 |
| npm test, tests passing | 104 | 115 | +11 (tests/statusFile.test.mjs) |
| verify_status_banner.mjs checks passing | none existed | 30 of 30 | +30 |
| npm run lint errors | 0 | 0 | none |
| design-lint new violations | 0 | 0 | none (550 in the baseline, 550 found) |

The harness covers the silent states (no file, the quiet {"enabled": false} file, an expired line, malformed JSON, an HTML page with 200), a live line at 1440 by 900 and at 380 by 800 (warn tone, whole text, role=status, inside the viewport, no horizontal scroll, above the phone's bottom bar at nav top 714, a 30 by 30 close button, one request per load), dismissal surviving a reload and a changed line coming back, a Dutch traveller reading the nl text, and a data host that answers after 8 seconds: the places tab was up in 2,239 ms and the late answer was ignored. Screenshots were checked by eye at both widths.

carta-design questions. No hex, no new colour, no shadow or gradient added (the bar is the existing component). No flag colour. No mono text. No button added beyond the existing close. The example copy in the runbook and helper carries no em dash and none of the banned words. Nothing to remove: the change is a data source, not a decoration.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A literal byte order mark and a literal em dash landed in two new files | the file-writing tool turned the \uFEFF and \u2014 escapes into the characters | replaced with a \u{FEFF} regex class and String.fromCharCode(0x2014); both files checked ASCII |
| Two shell edits lost a backslash | heredocs eat backslashes (known gotcha) | redone with the Edit tool |
| Vite would not start from a config wrapper in the scratchpad or in wt/ | the wrapper's import of vite resolves from its own folder | wrapper placed inside the app worktree for the run, deleted afterwards |
| First harness run timed out | the new cacheDir made Vite scan and bundle dependencies for about four minutes on a busy machine | reran once bundling finished; all 30 checks passed |

## What is still open

T316-a, owner. Before the first Pages deploy that carries this code, upload the quiet file once, so a normal day is a 200 and not a 404 line in every visitor's console: from continent-app/, `node scripts/status_notice.mjs --clear`, then the wrangler line it prints (`npx wrangler r2 object put carta/data/status.json --file <printed path> --content-type application/json --cache-control "public, max-age=60" --remote`, with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID exported), then `curl -s https://data.carta-europetravel.com/data/status.json` should print {"enabled": false}. After the deploy, posting a real line once on production and clearing it is the Supabase-down part of the T218-e drill, which stays open as it was.

Not done, on purpose. The data host's CORS rules allow only the production origins and localhost 5173 and 4173, so a dev server on any other port cannot read the real file; the harness uses a loopback stand-in instead, and scripts/r2/ is outside this task's scope. A traveller who already has the app open does not see a new line until their next page load; polling was left out because "read once at boot" is what the row asks and a status line is not worth a timer.

## Rollback procedure

Revert the app commit on p12-status-surface (`git -C continent-app revert 7df0b62`) and the root commit (`git revert <root commit>`), or do not merge either branch. Nothing else changed. If the code has already been deployed, the line can be switched off without a revert by uploading the quiet file (`node scripts/status_notice.mjs --clear` and the printed upload), or by deleting the object with `npx wrangler r2 object delete carta/data/status.json --remote`.
