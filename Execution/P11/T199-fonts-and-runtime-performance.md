# T199: Self-host fonts and take the React 19 / Tailwind v4 wins

## Task ID

T199 (mind-map number T195). Branch p11-self-host-fonts in both repos.

## Date

2026-10-03

## What changed

Carta no longer asks Google for anything. The three families the tokens name, Fraunces for `--display`, Plus Jakarta Sans for `--ui` and JetBrains Mono for `--mono`, are now served from `continent-app/public/fonts` as variable woff2 files, latin and latin-ext only (six files, 218,820 bytes together). The `@font-face` rules sit inline in `continent-app/index.html`, so there is no stylesheet request, and the latin files of Plus Jakarta Sans and Fraunces are preloaded because every first paint uses them. The Google stylesheet link, the two preconnects, the unused Instrument Sans, IBM Plex Mono and Inter Tight families and the old comment that described a palette swap are gone. Once nothing loaded from `fonts.googleapis.com` or `fonts.gstatic.com`, both were also removed from the Content-Security-Policy in `public/_headers` and `vercel.json` (`style-src` and `font-src`), as the session notes allowed. This closes rows T214-c, T195-c and T198-a. A visitor's address is no longer sent to Google before the app runs, which was the point of T214-c.

How it works. Each family has two `@font-face` blocks, one per unicode-range subset, with a weight range (Fraunces 300 to 700, Plus Jakarta Sans 400 to 700, JetBrains Mono 400 to 600) so one file covers every weight the stylesheet uses, including the 550 that appears twice. Fraunces keeps its optical-size axis, so `font-optical-sizing: auto` behaves as before. The browser downloads a subset only when a character in its range appears, so English, German, Spanish, French, Italian and Dutch pages normally cost the latin file, plus latin-ext on the first accented capital. Other scripts (Cyrillic, Greek, Vietnamese) fall back to the system face; no catalogue language needs them. The files are the same bytes Google served (the three latin files measured identical sizes before and after), fetched once with a current Chrome user agent so the CSS API returned woff2. The four TTF files already in `public/fonts` are for the PDF exporters (`src/lib/destinationPdf.js`) and are untouched. `public/_headers` already gave `/fonts/*` a one-year immutable cache, so no header was added. DESIGN.md had one sentence saying fonts load from Google and T199 would change it; that sentence now records the self-hosted state.

The React 19 and Tailwind v4 half of the task is a finding, not a change. The app is React 18.3 with no Tailwind (T197), session rule 4 forbids changing a dependency, and the measurements below say the interaction that is slow is slow for a reason a compiler would not touch. React Compiler also needs React 19 or an extra runtime package, which is a dependency either way. The recommendation is in the open section. OKLCH: styles.css has no `oklch(` anywhere and uses `color-mix(in srgb, ...)` three times in the places I grepped; the palette is locked hues, so there is nothing to generate and nothing was added.

## Files touched

Modified, app repo (continent-app):
- index.html
- public/_headers (CSP only)
- vercel.json (CSP only)

Created, app repo:
- public/fonts/Fraunces-latin.woff2 and Fraunces-latin-ext.woff2
- public/fonts/PlusJakartaSans-latin.woff2 and PlusJakartaSans-latin-ext.woff2
- public/fonts/JetBrainsMono-latin.woff2 and JetBrainsMono-latin-ext.woff2

Modified, root repo: DESIGN.md (one sentence), Execution/_OPEN.md.
Created, root repo: this report and Execution/P11/T199-inp-measure.mjs, the measurement script (kept beside the report so the numbers can be repeated; it is not part of the app).

## Commands run

App worktree wt/T199-app. The fonts came from the Google CSS API with a Chrome user agent, parsed with a short Python script that kept the latin and latin-ext blocks, downloaded each woff2 into `public/fonts` and rewrote the `url()` to `/fonts/<name>`. The generated blocks were pasted into `index.html`. For the measurement the app was built twice (`npm run build` on the new tree, and again after `git stash` for the old one), each dist was served by a plain static server on port 5202, and Playwright ran the script against each:

```
APP=<app worktree> DISTDIR=dist-after OUT=after.json PORT=5202 RUNS=3 node Execution/P11/T199-inp-measure.mjs
node scripts/ci/design-lint.mjs
```

The script resolves Playwright from the app worktree. `dist` is deleted afterwards (the build writes about 50,000 files; one build hit ENOTEMPTY on a half-deleted `dist/region`, and a retry after `rm -rf dist` worked). design-lint reports 550 found, 550 in the baseline, 0 new.

## Config and secrets set

None. CSP change: `https://fonts.googleapis.com` removed from `style-src` and `https://fonts.gstatic.com` removed from `font-src`, in both `public/_headers` and `vercel.json`.

## Before/after measurements

Method: a cold browser context per run, a buffered event-timing observer (events with an interactionId), INP read as the slowest interaction in the step (what web-vitals does under 50 interactions), median of three runs. Desktop is 1440 by 900; phone is 390 by 844 with 4x CPU throttle, as in `scripts/perf/baseline_vitals.mjs`. Slider means the trip-length slider on the Destinations tab (Trips, composed door, `.trip-slider-input`), driven by ten arrow keypresses and a pointer drag. Map means opening the Explore map from the view toggle, then three pointer drags and a double click on the canvas. The phone before figure is the median of two runs because the third run's process died.

| Metric | Before | After | Delta |
|---|---|---|---|
| Font requests on first Destinations load | 4 (Google stylesheet 36,043 B plus 3 woff2) | 3 (3 woff2, same origin) | -1 |
| Font bytes on first load | 162,127 | 126,084 | -36,043 |
| Third-party hosts contacted for fonts | 2 (fonts.googleapis.com, fonts.gstatic.com) | 0 | -2 |
| Families requested in index.html | 6 | 3 | -3 |
| Slider INP, desktop | 232 ms (runs 200, 232, 320) | 232 ms (runs 232, 200, 304) | 0 |
| Map INP, desktop | 192 ms (runs 200, 120, 192) | 136 ms (runs 136, 224, 136) | within run noise |
| Slider INP, phone at 4x CPU | 864 ms (runs 1112, 864) | 1360 ms (runs 3696, 1224, 1360) | noise, first run cold |
| Map INP, phone | not measured | not measured | |

Done condition, stated plainly. The fonts are self-hosted. INP is measured and it is not under 200 ms everywhere: the Explore map is at 136 ms on desktop in this run (though single runs reached 224 ms), the trip-length slider is at 232 ms on desktop and near or over a second on a throttled phone. Fonts did not move interaction latency in either direction, which is expected since they loaded in parallel with the app before. The slider is a filter that re-ranks and re-renders the itinerary list on every step, and `src/browse/DestinationsTab.jsx` is not in this task's scope, so the fix is left for a named task (T199-a).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first slider probe found no slider | It looked for `.dual-range-input`, which no live screen renders; the only range input on screen is `.trip-slider-input`, behind Trips and the composed door | Probe rewritten to open that door first |
| Font counts in the interaction runs were inflated (13 to 17) | The counter also matched map glyph files under `/fonts/` | Fonts counted separately with a dedicated probe on `.woff2` and `.ttf` names only (the table above) |
| The phone map step records no interaction | The view toggle's click produced no event entry in the throttled phone context | Left unmeasured, row T199-c |

## What is still open

T199-a: the trip-length slider's INP is 232 ms on desktop and 864 to 1360 ms on a throttled phone. The work to cut is in `DestinationsTab.jsx` (the days value drives the whole filtered list on each step); the target of under 200 ms is not met until that changes, probably by committing the value on release or deferring the list with `useDeferredValue`, both of which work on React 18.

T199-b: `DualRange` in `src/components/FilterControls.jsx` has no caller anywhere in `src`. The pricing slider the task text mentions no longer exists in the shipped Explore, so either the component is dead code to delete or a price control is missing; the owner should say which.

T199-c: the phone pass of the map step recorded zero interactions. Repeat it with a tap on the phone's map control, or measure from `baseline_vitals.mjs`.

T199-d: `--ui` in styles.css still lists `'Inter Tight'` as a fallback name. It is never loaded now, so it only names a face the visitor will not have; remove it the next time styles.css is open for another reason.

T199-e (owner): after the next deploy, load the live site once with the console open and confirm no font or style is blocked by the tightened CSP. I could not exercise the real headers from a static server.

T199-f: React 19 and Tailwind v4. Recommendation: not now. INP on the one slow control is a rendering design problem, the app has no Tailwind and one hand-written stylesheet, and an upgrade is a dependency change with its own regression surface. Revisit React 19 after T199-a if the slider is still slow once its work is deferred.

## Rollback procedure

Revert the app commit on p11-self-host-fonts (index.html returns to the Google stylesheet, the CSP returns to naming the two Google hosts, the six woff2 files go) and the root commit (DESIGN.md sentence, register rows and this report). Nothing else depends on either. If only the CSP is a problem in production, re-adding the two hosts to `style-src` and `font-src` is safe on its own while the self-hosted files keep working.
