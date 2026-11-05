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

## Not covered here

An R2 or Cloudflare incident and a Supabase problem: sections 4 and 5 of the archived runbook; not carried over because they depend on dashboards and alerts not re-verified. A leaked secret and a data breach are not covered by either file. Secrets and rotation: [../security/SECRETS.md](../security/SECRETS.md) and `Execution/P15/_OPEN-secrets-rotation.md`.
