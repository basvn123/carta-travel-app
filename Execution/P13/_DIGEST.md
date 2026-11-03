# P13 digest

5 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`.

### T227: Legal gate (2026-10-06)

Nothing in the app or the database. The ten items of the legal gate were checked one by one, in source and, where a page can be loaded, on production (https://www.carta-europetravel.com, served by Cloudflare Pages since T293). The production checks were a headless Playwright page load with no sign-in and no form submits. A plain curl proves nothing here, because the site is a single page app and curl only returns the empty shell. The result is 3 pass, 6 fail and 1 cannot-verify-here. The finding that matters most: production serves an older build than main.

Broke: The first report (54cc9c9e6) checked a list of its own instead of the ten items, and its counts disagreed with its own list / Written without the task text beside it / Rebuilt around the ten items with one verdict each; It said checkout has a confirmation_url field pointing at ?legal=terms / Not read from checkout/index.ts / Corrected in item 2; It...

Full: `git show archive/execution-full-2026-11-03:"Execution/P13/T227-legal-gate.md"`

### T230: Data and coverage gate (2026-10-06)

No code or data changed. T230 is an audit of the eight criteria in its prompt against the two gates that already exist, the trip validator (T084, extended by T091) and the coverage gate (T112). Neither gate is green. Both tools are sound, since the validator self-test and the coverage self-test pass. What fails is the data they judge, and in one case the data they would judge does not exist yet. The trip validator reports 517 errors on 253 trips (stdout: TRIPS:253 ERRORS:517 WARNINGS:713 NOTICES:30). The errors are hero-below-floor 253, comma-range-wire 209, hero-duplicate 53 and accommodation-not-slept 2. The first three are counts of trips.

Broke: accommodation-not-slept stated as 2 trips / It is 2 errors on 1 trip / Corrected throughout; "No documented gate" before / T084, T085 and T112 had built and documented both gates / Before and after now cite their reports; "€1,200, €1,850" shown as a real finding / That string is the validator's own seeded fault in validate.py / A real hit is "€430,...

Full: `git show archive/execution-full-2026-11-03:"Execution/P13/T230-data-coverage-gate.md"`

### T231: Performance and accessibility gate (2026-10-06)

This is a gate, and it does not pass. The accessibility floor that Carta controls passes on every screen the audits reach, but the done condition says "no AA failures" and two kinds of AA failure remain that only the owner can resolve: three colour token pairs below 4.5:1 and desktop mouse targets below 44 px. They were already known (rows T186-a, T193-b and T186-b) and this task did not touch them. The Core Web Vitals pass also has failures, on the phone profile, and production is serving a build older than T271. What the task did change is small.

Broke: sed -i rewrote four CRLF files with LF / sed in Git Bash / Converted back with sed 's/\r$//; s/$/\r/'; the diff then showed only the intended lines; The first "after" audit never ran, and about 50 minutes went on waiting for it / The driver script lives in wt\ and was launched from wt\T231-shots / Started it from wt\; check the log exists a minute...

Full: `git show archive/execution-full-2026-11-03:"Execution/P13/T231-performance-accessibility-gate.md"`

### T233 Mirror the Mapterhorn terrain tiles to your own R2 (2026-10-06)

The app now has one place that decides where 3D terrain tiles come from, `src/lib/terrainSource.js`, and one config value that flips it. With `VITE_TERRAIN_PMTILES_URL` unset it returns Mapterhorn's public XYZ tiles (`https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`, terrarium, 512 px, maxzoom 13). With it set to an https `.pmtiles` URL it returns a `pmtiles://` source on that URL. The Mapterhorn credit is attached in both modes. Bad values (plain http, a query string, a non-pmtiles path) are ignored and fall back to Mapterhorn, the same rule `dataHost.js` uses. Two facts changed the shape of the task. First, the app does not read Mapterhorn anywhere today.

Full: `git show archive/execution-full-2026-11-03:"Execution/P13/T233-mirror-terrain-tiles.md"`

### T235: Uptime and error alerting (2026-10-06)

Carta now has a monitor that does not depend on the laptop or the box. scripts/monitor/check.py is a standard-library Python script that runs every 15 minutes in a new GitHub Actions workflow, .github/workflows/uptime.yml. It makes three kinds of check and turns every failure into one line of an alert payload. First, HTTP probes listed in scripts/monitor/targets.json: the app (status 200 and the React root in the body), the R2 data host (beaches/index.json must be 200 and valid JSON), the Supabase project (auth/v1/health, where 401 is accepted without the anon key because any answer proves the gateway is up, and 200 is required when the key is set), and the cdn host, which is listed but swit...

Broke: First two attempts to write files from the shell failed / heredoc quoting / wrote the files with the editor tool

Full: `git show archive/execution-full-2026-11-03:"Execution/P13/T235-uptime-and-alerting.md"`
