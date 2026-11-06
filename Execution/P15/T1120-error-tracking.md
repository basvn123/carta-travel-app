# T1120: Error tracking with a privacy-safe setup (S36, ROADMAP H2)

## Date

2026-11-06.

## What changed

Front-end errors (both crash boundaries, `window.onerror`, unhandled rejections) and Pages Function errors now go to one tracker through a small home-made reporter. Nothing is sent, and no listener is installed, until the owner sets a DSN.

**Tracker choice: Sentry EU (de.sentry.io), GlitchTip as the drop-in alternative.** Why: Sentry EU has a free tier (5k errors a month), EU data residency, no box to run and no upkeep, and its envelope format is the one GlitchTip also accepts, so moving to a self-hosted GlitchTip on the box later is a DSN change, not a code change. Cloudflare's own logs were rejected: Pages Functions logs are live-tail only, keep nothing, and say nothing about browser errors. We do not ship the Sentry SDK: its defaults (IP capture, breadcrumbs, request data, replay) are what we must avoid, and it adds about 25 KB gzipped. The reporter is about 150 lines and builds the envelope itself.

What an event carries: error type, scrubbed message (max 300 chars), up to 30 stack frames (path only, no origin, no query), release, environment, and tags `source` (boundary, window.onerror, unhandledrejection, pages-function), `name` (boundary or route), and for functions the method and path without query. It never carries a user, IP, cookies, headers, request body, breadcrumbs, URL query or hash (the hash holds routes and trip state). Free text is scrubbed of e-mails, JWTs, UUIDs, IPv4/IPv6 and long tokens, and URLs inside it lose their query and fragment.

Controls: DSN must be https and well formed, else no-op. Kill switch: `VITE_ERROR_TRACKING=off` (app, needs a redeploy) or `SENTRY_OFF` (functions, a Pages variable) or delete the DSN. Sampling: `VITE_ERROR_SAMPLE` (default 0.5) and `SENTRY_SAMPLE` (default 1). At most 5 events per page load, and one per distinct error. Global Privacy Control, Do Not Track and `localStorage carta.errorTracking = 'off'` also switch it off. Dev builds never send.

Function wrapper: `withTracking(name, handler, { fallback })` in `functions/_lib/track.js` wraps `api/ask`, `api/flights`, `api/forecast` (an unexpected throw is reported through `waitUntil` and answered with `{"error":"server"}` 500) and the prerender route (`[[path]].js`, falls back to `next()` as before, so a crash still serves the static page).

## ARTICLE30 register row (for the privacy session; I did not edit the file)

| Field | Value |
|---|---|
| Activity | Error monitoring of the web app and Pages Functions |
| Processor | Sentry (Functional Software, Inc.), EU region (de.sentry.io), or self-hosted GlitchTip: owner picks when creating the DSN |
| Data | Error type, scrubbed message, code file paths and line numbers, release, environment, browser-reported event time. No user id, e-mail, IP stored (project setting "Prevent storing of IP addresses" must be on), URL query or hash, cookies or request bodies |
| Purpose, basis | Keeping the service working; legitimate interest (Art. 6(1)(f)); respects GPC and DNT |
| Retention | Tracker default 90 days; set to 30 in the project |
| Transfer | None outside the EU on the EU region; Sentry DPA to be signed |
| Code | `continent-app/src/lib/errorEvent.js`, `errorReporter.js`, `functions/_lib/track.js` |

## Files touched

- `continent-app/src/lib/errorEvent.js` (new: scrubber, DSN parse, event and envelope builder)
- `continent-app/src/lib/errorReporter.js` (new: browser reporter, global listeners, limits)
- `continent-app/functions/_lib/track.js` (new: `captureFunctionError`, `withTracking`)
- `continent-app/src/components/ErrorBoundary.jsx`, `src/main.jsx` (hook-up)
- `continent-app/functions/api/ask.js`, `flights.js`, `forecast.js`, `functions/[[path]].js` (wrapped; handlers renamed, exports unchanged in name)
- `continent-app/public/_headers` (comment only; see Owner steps), `continent-app/.env.example`
- `continent-app/tests/errorTracking.test.mjs` (new, 6 tests)
- `ROADMAP.md` (H2 status), `Execution/_OPEN.md`

## Commands run

`npm ci`; `node --test tests/errorTracking.test.mjs` (6 pass); `npx eslint` on touched files (0 errors); `npm test` (1381 pass, 0 fail).

## Config and secrets set

None. Variables the owner will set are in Owner steps.

## Before/after measurements

Not measured. No SDK added, so the bundle grows by the reporter only (about 3 KB before gzip).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `securityHeaders` test failed after adding `https://*.ingest.de.sentry.io` to connect-src | Wildcard hosts must be on a reviewed list | Dropped the wildcard: the exact host from the owner's DSN is added with the DSN instead (safer, one project only) |
| Dedupe test failed | Two `new Error('same')` at different lines have different top frames, so they are different errors | Test reuses one error object |

## Screens checked

None; no screen changed. Boundary behaviour is covered by `sectionBoundary.test.mjs`, still green.

## What is still open

- T1120-a to T1120-c: owner steps below.
- T1120-d: Supabase Edge Functions (`plan-day`, `parse-booking`, the rest) and the pipeline are not wired: the Deno side needs its own thin wrapper over `errorEvent.js` and a `SENTRY_DSN` secret. H2 stays `partly done`.
- T1120-e: source maps are not uploaded on deploy, so frames show minified lines until `build-pages.mjs` uploads them.

## Rollback procedure

`git revert` the T1120 commits. With no DSN the feature is already inert, so unsetting the variables is a faster off switch.

## Owner steps (for the checklist)

- [T1120-a] Create the error-tracking project and set its DSN | nothing is reported until a DSN exists | sign up at sentry.io, choose region EU (de.sentry.io); create a Browser JavaScript project; Project Settings, Security and Privacy: turn on "Prevent storing of IP addresses" and "Data scrubber", set retention to 30 days; sign the DPA; copy the DSN | continent-app/.env.example
- [T1120-b] Allow the tracker host and set the variables | the CSP blocks an unlisted host and the app reads the DSN at build time | add the exact ingest host from the DSN (`https://oNNN.ingest.de.sentry.io`, no wildcard) to connect-src in continent-app/public/_headers; set VITE_ERROR_DSN (and optionally VITE_ERROR_SAMPLE, VITE_RELEASE) in the Pages project variables; set SENTRY_DSN as a Pages secret; redeploy | continent-app/public/_headers
- [T1120-c] Check the kill switch and a live event | proves the setup before real traffic | open the preview with `?seedError=explore` in a dev build against the real DSN (dev builds do not send, so instead throw once in the console of the preview: `setTimeout(()=>{throw new Error('probe')})`); see one scrubbed event with no IP; set VITE_ERROR_TRACKING=off and confirm nothing arrives | Execution/P15/T1120-error-tracking.md
