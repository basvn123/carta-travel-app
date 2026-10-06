# T231: Performance and accessibility gate

## Task ID

T231 (mind-map number T204). Branch p13-perf-a11y-gate in both repos. App commit 40abfd0 on top of master 6c99ebd; the root commit carries this report and the register rows.

## Date

2026-10-06

## What changed

This is a gate, and it does not pass. The accessibility floor that Carta controls passes on every screen the audits reach, but the done condition says "no AA failures" and two kinds of AA failure remain that only the owner can resolve: three colour token pairs below 4.5:1 and desktop mouse targets below 44 px. They were already known (rows T186-a, T193-b and T186-b) and this task did not touch them. The Core Web Vitals pass also has failures, on the phone profile, and production is serving a build older than T271.

What the task did change is small. An independent WCAG 2.1 AA scan (axe-core, run from outside the repo because a new dependency is not allowed) found three real problems the in-repo audits cannot see, plus one marginal contrast. They are fixed in seven files: the map pins and the Lifestyle button now carry an accessible name that contains the text they show (WCAG 2.5.3), the day photo strip on the trip page is a keyboard-focusable scroll region (2.1.1), the destination gallery count chip is darker (it measured 4.48:1 against a white photo), and the rail cards on Explore lose an aria-label that hid their visible text. No token, no i18n key and no new colour changed, so DESIGN.md is untouched.

The 3D flyover does not exist yet (row T186-d), so "reduced motion honoured including the flyover" is met only vacuously: there is nothing to honour. lib/motion.js prefersReducedMotion() is the door the flyover must use. MapLibre's easeTo and flyTo, the only camera animations in the app today, read the preference themselves, and the audit finds 0 running animations or transitions under reduced motion on every screen.

## How the gate was measured

Accessibility, three instruments, all against a vite preview of the built branch at 127.0.0.1:5204. First, scripts/verify_quality_floor.mjs (T186), 102 screens at 380 and 1280 px: horizontal scroll, h1 and heading order, phone tap targets, contrast with the three token pairs tagged apart from usage failures, reduced motion, fake controls. Second, scripts/verify_keyboard.mjs (T190), 10 surfaces at both widths. Third, a scratch axe-core 4.x scan (scripts in wt\T231-shots, axe in wt\T231-axe, neither in the repo) on the price map as grid and as map, a destination page and a trip page, at 380 and 1280 px, with the tags wcag2a, wcag2aa, wcag21a and wcag21aa. The axe scan covers EN 301 549 clause 9 only as far as WCAG 2.1 AA is automatable. No screen reader was run; that is still T190-f.

Performance is lab only, and the two environments are kept apart. "Production" means https://www.carta-europetravel.com (the Cloudflare Pages project, T293), loaded read-only from this machine with real network latency and the 4x CPU throttle the scripts apply on the phone profile. "Local" means the same scripts serving this branch's dist over loopback, so there is no network cost. Neither is field data. For row T061-c the script scripts/perf/tiles_and_paint_T061.mjs was run unchanged against the local dist, and a copy with only BASE, the port and the output folder edited was run against production, because the repo script serves its own dist and cannot be pointed at a URL. The same was done for T011's baseline_vitals.mjs.

## Before/after measurements

Accessibility, base build (master 6c99ebd, before) and this branch (after), same scripts. The runs are in T231-shots\before and T231-shots\after; counts are summed over the ten chunks of verify_quality_floor.mjs.

| Metric | Before | After |
|---|---|---|
| Screens audited, 380 and 1280 px | 102 | 102 |
| Horizontal scroll | 0 | 0 |
| Screens without exactly one h1 | 0 | 0 |
| Skipped heading levels | 0 | 0 |
| Phone targets under 44 px | 0 | 0 |
| Contrast failures, usage | 0 | 0 |
| Running motion under reduced motion | 0 | 0 |
| Fake controls, gradients, mono eyebrows | 0 | 0 |
| Contrast failures, the three token pairs | 1,092 | 1,093 |
| Desktop targets under 44 px | 971 | 906 |
| verify_keyboard | 20 of 20 | 20 of 20 |
| axe: scrollable region without a focusable child | 6 | 0 |
| axe: label does not contain visible text | 27 | 13 |
| axe: colour-contrast nodes | 156 | 154 |
| axe: any other WCAG 2.1 AA rule | 0 | 0 |

The token-pair count moved by one and the desktop target count by 65 between two runs of the same audit; both are run to run variation in what loads (T186 recorded 1,154 and 982 over the same screens with a different tally), not an effect of the fixes. The detail pages passed with the T181 and T182 modules merged, which closes T186-c.

The 154 axe contrast nodes are all one of two token pairs: --ink-mute #7d8393 on white, paper or paper-dim (113 nodes) and --accent #e05a47 as text, as a tint background or as the fill under white text (41 nodes). The one non-token pair axe found before the fix, white on a 4.48:1 chip, is gone. The 13 remaining label mismatches are axe's experimental rule failing on elements whose name already contains the visible text: the Lifestyle button (name "Lifestyle Entire place Easygoing", visible "Lifestyle", "Entire place", "Easygoing" in three block elements), the numbered pins on the destination page ("4 Gjeravica") and two Explore card buttons ("Open Rome", visible "Rome" plus a seal label). axe joins the text of block children without spaces, so it compares "LifestyleEntire placeEasygoing" with the name. Read by hand each one satisfies 2.5.3. They are reported, not hidden.

Core Web Vitals, median of 3 cold runs (T011's script, RUNS=3), thresholds LCP 2.5 s, INP 200 ms, CLS 0.1.

| Page | Device | Production LCP / INP / CLS | Local LCP / INP / CLS |
|---|---|---|---|
| Price map (Explore) | desktop | 2,872 ms / 104 ms / 0.0285, pass | 1,020 / 88 / 0.002, pass |
| Destination page | desktop | 3,592 / 56 / 0.0905, LCP fail | 1,740 / 40 / 0.0044, pass |
| Trip page | desktop | 3,712 / no interaction / 0.0047, LCP fail | 2,692 / none / 0.0045, LCP fail |
| Price map | phone, 4x CPU | 8,856 / 1,248 / 0.1442, all fail | 2,648 / 720 / 0.0254, LCP and INP fail |
| Destination page | phone | 9,068 / 272 / 0.3088, LCP, INP, CLS fail | 5,140 / 72 / 0, LCP fail |
| Trip page | phone | 1,580 / none / 0.0087, pass | 684 / none / 0.0194, pass |

Production still returns 404 for /dest/_rank.json, and its destination page CLS (0.3088) is the pre-T271 figure T271 recorded as 0.309. So production is serving a build from before T271, and the T271 fixes (rank tier, destination page layout shift) are not live. Local CLS on the same page is 0 on the phone. The local phone price-map INP of 720 ms is the map toggle mounting MapLibre, the interaction T011 and T271 already named as the expensive one; it was not worked on here.

Row T061-c, FCP and tiles per session on the phone profile (5 runs each):

| Metric | T061 original | Production now | Local branch dist |
|---|---|---|---|
| First paint, median | 912 ms | 908 ms | 664 ms |
| Grid ready, median | 8,246 ms | 8,306 ms | 7,331 ms |
| Carto tiles, initial view | 2 | 2 | 2 |
| Carto tiles, pan and zoom | +15 | +15 | +15 |
| Carto tiles, session | 17 | 17 | 17 |
| Style, sprite, glyph requests | 1, 2, 10 | 1, 2, 10 | 1, 2, 10 |

Production reproduces T061 almost exactly, which fits it being the same build. The 17-tile figure is unchanged by everything since.

## Traffic ceiling (row T207-f)

Measured requests per cold first visit on production, phone viewport, three runs (identical each run), counted from Chrome DevTools Network events: open Explore, scroll, open the destination page for Valbona, open the Salzburg to Vienna itinerary. 47 requests and 0.80 MB to Cloudflare Pages, 729 requests and 2.39 MB to the R2 data host data.carta-europetravel.com, 8 requests and 4.7 KB to Supabase (a guest session, no sign-in), 22 requests and 0.65 MB to Carto, 155 requests and 4.5 MB to Wikimedia for pictures, 13 font requests to fonts.gstatic.com. The data host answers with cf-cache-status DYNAMIC on both coverage.json and a missing file, so nothing on it is served from Cloudflare's edge cache and each request is an R2 operation. The raw numbers are in T231-shots\session-prod.json.

Limits, each from the vendor's page fetched 2026-10-06. Cloudflare Pages: "requests to static assets are free and unlimited" on free and paid plans (developers.cloudflare.com/pages/functions/pricing). So the hosting has no traffic ceiling for ordinary sessions. Pages Functions are the exception: the free plan allows 100,000 requests a day combined with Workers (same page). functions/[[path]].js is routed by public/_routes.json only to country pages, /trips/*, /journeys/*, /og/p/*, and sitemaps; a session that opens the app at / does not invoke it, but shared links and crawlers do, so the ceiling there is 100,000 such requests a day. R2: free tier 1,000,000 Class A and 10,000,000 Class B operations a month, egress free, then $0.36 per million Class B (developers.cloudflare.com/r2/pricing). Supabase (supabase.com/pricing): Free has 50,000 MAU, 5 GB egress, 500,000 Edge Function invocations; Pro has 100,000 MAU, 250 GB egress, 2 million invocations, spend cap on by default.

What that gives. The only limit a cold guest session approaches is R2 Class B: 10,000,000 / 729 = 13,717 cold sessions a month inside the free tier, about 457 a day. It is a price, not a wall: past it each cold session costs 729 x $0.36 / 1,000,000 = $0.00026, so 100,000 cold sessions a month is 72.9 million operations and about $22.6. Supabase egress is not a limit for browsing: 4.7 KB a session means 5 GB covers about 1.05 million sessions on Free and 250 GB about 52.8 million on Pro. Supabase's real ceilings are signed-in users (50,000 MAU Free, 100,000 Pro, then $0.00325 each) and Edge Function calls, which the guest session does not make. Not measured, so not claimed: database compute and connection limits for the Supabase plan T232 will pick, and the request cost of a signed-in or AI session. Browser cache lowers every figure for a returning visitor; these are first visits. Wikimedia and Carto are third parties with no Carta bill but also no Carta control: 155 image requests a session is the largest single dependency.

The cheap lever is a Cloudflare Cache Rule on the data host, which would turn most of the 729 operations into edge hits; that is a dashboard change and an owner row.

## Files touched

App repo, branch p13-perf-a11y-gate, commit 40abfd0.

Modified: src/browse/CountryPage.jsx and src/browse/ExploreRails.jsx (the rail card button drops aria-label so its name is its visible text; ExploreRails also drops the now unused t argument, keeping lint at the base's 72 warnings), src/browse/DestMap.jsx (highlight pin name "4 Gjeravica" not "4. Gjeravica"), src/map/TripMap.jsx (a pinName helper: a numbered pin is named "2 Vienna"), src/browse/LifestyleButton.jsx (aria-label without punctuation), src/browse/TripDayPhotos.jsx (tabIndex 0 on the scrolling strip), src/styles/24-destination-workspace.css (gallery count chip background alpha 0.55 to 0.72).

Outside the repo, in C:\Users\Gebruiker\Documents\Portfolio\wt\T231-shots and wt\T231-axe: the axe scan, the production copies of the two perf scripts, the session request counter, both audit runs with screenshots and logs, the perf JSON for local and production. The reports the unchanged T011 and T061 scripts rewrite under continent-app/reports were copied out and restored with git checkout, so the tracked JSON is untouched.

Root repo: this report and Execution/_OPEN.md. Nothing deleted.

## Commands run

In wt\T231-app: node node_modules/vite/bin/vite.js build --config ../vite.t231.mjs (a private cacheDir), vite preview on port 5204, bash wt\T231-run-audit.sh before|after (the ten chunks of verify_quality_floor.mjs, then verify_keyboard.mjs), node wt\T231-shots\axe_scan.mjs, RUNS=3 node scripts/perf/baseline_vitals.mjs, RUNS=5 node scripts/perf/tiles_and_paint_T061.mjs, the same two from wt\T231-shots with BASE set to production, node session_requests.mjs. Then npx eslint src, npm test, node scripts/ci/design-lint.mjs, and a last build, followed by rm -rf dist dist-data. The preview server was stopped.

## Config and secrets set

None.

## carta-design pre-ship questions

1. No hex added; the chip change is the alpha of an existing rgba.
2. No gradient and no new colour.
3. Ochre, teal and --danger untouched.
4. No mono or sans change.
5. No primary button added or changed.
6. No headline or string changed; pin and button names lost a full stop and a colon only.
7. The aria-label on the rail cards was the decoration that carried nothing and is removed.

Checks: npm run lint 0 errors, 72 warnings (the base's 72); npm test 201 pass, 0 fail; design-lint 196 found, 196 in the baseline, 0 new; npm run build passes; verify_keyboard 20 of 20; verify_quality_floor no floor check fails.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| sed -i rewrote four CRLF files with LF | sed in Git Bash | Converted back with sed 's/\r$//; s/$/\r/'; the diff then showed only the intended lines |
| The first "after" audit never ran, and about 50 minutes went on waiting for it | The driver script lives in wt\ and was launched from wt\T231-shots | Started it from wt\; check the log exists a minute after launching |
| ExploreRails raised one new lint warning | Removing the aria-label left the t argument unused | Removed the argument; back to 72 warnings |
| axe still flags the Lifestyle button after the name was fixed | The experimental rule joins block children without spaces | Left as is, documented above as a false positive; the name contains the visible words |

## What is still open

The gate has no pass without owner decisions. T186-a and T193-b (the three token pairs: 1,093 failing runs in the floor audit, 154 nodes in axe) and T186-b (906 desktop targets) are the AA failures; row T231-a points at them and sequences the gate after them. Core Web Vitals failures on the phone profile (price-map LCP and INP, destination page LCP, trip page desktop LCP) are row T231-b. Production runs a pre-T271 build, so the T271 fixes cannot be judged live until it is redeployed (T231-c, owner). The R2 data host is not edge-cached, which is the one soft spot in the traffic ceiling (T231-d, owner). The signed-in and AI session request cost and the Supabase compute limits are not measured (T231-e). A screen reader pass (T190-f), the flyover (T186-d), and putting verify_quality_floor.mjs, verify_keyboard.mjs and the axe scan into the gate (T186-h, which needs a dependency decision for axe) remain; the 13 experimental-rule axe nodes are for a person with a screen reader to confirm (T231-f). Rows T061-c, T207-f and T186-c are closed by this task.

## Rollback procedure

In continent-app, git revert 40abfd0 (or drop the branch before merging). In the root repo revert the report commit, which removes the T231 rows and reopens T061-c, T207-f and T186-c. CSS and JSX only; no migration, data, wire, i18n or token change.
