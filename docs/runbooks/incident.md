# Runbook: incident

Owner and only responder: Bas. Condensed from `archive/docs-2026-11/INCIDENT_RUNBOOK.md` (T218, 2026-10-02) and checked where cheap against the code on 2026-11-05 (T1073). Dashboard locations and alert setups from that file are marked "not re-verified". Architecture: [../architecture/README.md](../architecture/README.md).

The rule for every incident: say what is broken, in plain words, where the traveller meets it. Never let a failure look like a working answer.

## The outage line

The app can show one sentence at the foot of the screen (`continent-app/src/components/AnnouncementBar.jsx`). Two sources, same look:

1. Site notice: Admin, Site tab, announcement on. Stored in Supabase `site_config`, so it cannot show while Supabase is down.
2. Status file `status.json` on the data host (`https://data.carta-europetravel.com/data/status.json`, read once per page load with a 3 second timeout by `continent-app/src/lib/statusFile.js`). It works with Supabase down and wins when both are live. Fields: `enabled` (true to show), `text` (a sentence or a map by language, English fallback), `tone` ("warn" or info), `until` (optional ISO time).

Write it from `continent-app/`:

```
node scripts/status_notice.mjs "Signing in and saving trips are down. Your trips are safe." --until <ISO time>
npx wrangler r2 object put carta/data/status.json --file <path the helper printed> --content-type application/json --cache-control "public, max-age=60" --remote
node scripts/status_notice.mjs --clear
```

Clear it by uploading the quiet file (`{"enabled": false}`), not by deleting the object. The weekly data push never touches `status.json`. Maintenance mode (Admin, Site tab) blocks the whole app; use it only to stop damage such as a bad data push that shows wrong prices.

## Where to look first (not re-verified)

| What | Where |
|---|---|
| Pipeline runs | Admin, Overview, pipeline card; on the box `tail -n 20 ~/logs/weekly.log` |
| AI failures and caps | Admin, Overview (edge errors, model report) and AI usage |
| Payments | Stripe Dashboard, Developers, Webhooks, failed deliveries |
| Supabase health | Supabase Dashboard; Admin, Overview |
| Data host | `node scripts/r2/verify-data.mjs` from `continent-app/` |
| Uptime | `.github/workflows/uptime.yml` runs `scripts/monitor/check.py` every 15 minutes (targets in `scripts/monitor/targets.json`) |

## 1. The pipeline fails silently

Traveller sees: nothing. The site keeps last week's data because the box uploads in phase 1 only (add and replace, never delete). Stale data, not an outage; fix within the week, no notice.

Do: read the log on the box (exit codes in [build-box.md](build-box.md)), copy the dated log from `~/carta/logs` to the laptop, hand it to a task. Fix through a branch, not on the box. Rerun by hand (see build-box). If bad data already reached R2 and prices or places are visibly wrong: maintenance mode, then push the previous good build.

## 2. Gemini quota is exhausted

Traveller sees: the AI features answer that the shared daily budget is used and the built-in planner still works (message text from the archived runbook; not re-verified in the app).

Do: in Google AI Studio or the Cloud console, tell a rate limit (clears itself) from the billing cap from a spike. Abuse from one account: Admin, AI usage, ban if needed. Slow spend by lowering `AI_GLOBAL_DAILY_CAP` (`supabase secrets set AI_GLOBAL_DAILY_CAP=<n>`; the variable is read in `supabase/functions/plan-day/index.ts` and siblings). Switch the AI off by unsetting `GEMINI_API_KEY`: every AI surface then says the bot is not switched on. Add a site notice only if it lasts more than a day.

## 3. Stripe webhooks stop arriving

Traveller sees: paid, still on the free tier. Money taken with nothing granted is the worst failure; fix it the same day.

Do: Stripe Dashboard, Developers, Webhooks, the endpoint, failed deliveries; the response code says why (from the archived runbook): 401 the function was deployed without `--no-verify-jwt`; 400 with a signature error, `STRIPE_WEBHOOK_SECRET` does not match; 500 function-not-found, a migration and the function are out of step; 5xx or timeout, Supabase itself. Fix the cause, then Resend each failed event. `grant_pass` is keyed on the Checkout session id (see `supabase/functions/_shared/passes.mjs` and the webhook), so a resend that already landed does nothing.

## 4. R2 or Cloudflare has an incident

Carried from the archived runbook (T218) and re-checked against the repo on 2026-11-05 (T1086); dashboards and alerts are still not re-verified.

Alert: `.github/workflows/uptime.yml` runs `scripts/monitor/check.py` every 15 minutes (targets in `scripts/monitor/targets.json`: the app, the data host, the Supabase project). A failure turns the scheduled run red, which emails the repository owner, and posts to `ALERT_WEBHOOK_URL` when that secret is set. Also www.cloudflarestatus.com and reports. Confirm with `node scripts/r2/verify-data.mjs` from `continent-app/`.

Traveller sees: with only R2 down, the app opens and the map draws, but destination detail, places, dossiers and trails fail to load and self-hosted photos are missing. With Cloudflare Pages or the zone down, the site does not load at all.

Do: tell Cloudflare from us. A bad publish shows as wrong or missing files with a 200; an incident shows errors or timeouts across everything. For an incident there is little to do but watch the status page. With only R2 down, Supabase still answers, so use the site notice ("Destination details and photos are not loading. The map and your saved trips still work."); the status file lives on R2 and cannot speak for it. With the whole zone down there is no in-app line. For a bad publish, push the previous good build (see [deploy.md](deploy.md)); Pages keeps earlier deployments, and the rollback steps are in that file. There is no second host.

## 5. The Supabase project has a problem

Alert: the same monitor probes `https://ntssxktaduxzpsmejwyv.supabase.co/auth/v1/health` (401 without the anon key still proves it answers). Supabase emails the owner about limits and pauses; status.supabase.com covers platform incidents. The Admin health line names missing tables after a bad paste.

Traveller sees: the catalogue, map and destination pages come from static files and keep working. Sign-in, saved trips, shared trips, the bot, booking import and checkout fail with their own error lines. The site notice is stored in Supabase and cannot show; post the status file instead (the outage line, above), for example "Signing in and saving trips are down. Your trips are safe.", and clear it with `--clear` when the project is back.

Do, by kind. A platform incident: wait. A paused or over-limit project: the Dashboard names the limit; restore the project or reduce the cause. A broken migration paste: most migrations from 024 on carry a DOWN block in their header (032 and most before 024 do not); run it in the order written, or re-paste the previous definition of each function it replaced. Function deploys follow the SQL they call. A leaked service role key: rotate it in the Dashboard, then update it in the box's `~/.config/carta/env` and in the function secrets (see [../security/SECRETS.md](../security/SECRETS.md)). Lost data: [backup-restore.md](backup-restore.md); anything newer than the last dump is gone, so say so to the affected travellers.

## After every incident

Add one admin note on any affected user, switch the site notice off, and if a fix needs code, open a task for it. Write two lines in the next task report that touches the area: what failed, how long, what changed.

## Not covered here

A leaked secret and a data breach are not covered. Secrets and rotation: [../security/SECRETS.md](../security/SECRETS.md) and `Execution/P15/_OPEN-secrets-rotation.md`. Refunds: [refund.md](refund.md).
