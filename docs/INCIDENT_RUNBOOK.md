# Incident runbook

Owner and only responder: Bas. Written by T218, 2026-10-02, for the hosting described in
Execution/_OPEN-MASTER.md after stages 5 to 7: the app shell on Cloudflare Pages (Vercel until stage 6),
app data on R2 at data.carta-europetravel.com, images on cdn.carta-europetravel.com, the weekly pipeline
on the Hetzner CAX11 box, Supabase project ntssxktaduxzpsmejwyv for accounts, AI and payments, Gemini
behind the plan-day, parse-booking and suggest-city functions, and Stripe for passes.

The rule for every incident is the one Carta already follows when the AI is off: say what is broken, in
plain words, where the traveller meets it. Never let a failure look like a working answer.

## The status surface: an in-app line, not a public status page

Carta has one operator and a small audience. A public status page needs someone updating it, and one
that says "all systems operational" during an outage is worse than none. The vendors already run their
own pages (status.supabase.com, www.cloudflarestatus.com, status.stripe.com, aistudio.google.com/status).
So the surface is a line inside the app, shown to the people who are affected.

The line has two sources and one look. Both draw the same bar at the foot of the screen (AnnouncementBar):
one sentence, warn or info tone, and a close button that remembers the exact text it waved away, so a
changed sentence shows again.

The site notice: Admin, Site tab, announcement on, tone warn, one sentence such as "Saving trips is down,
your trips are safe, back within the hour." It is read from Supabase site_config, so it cannot show while
Supabase itself is down. Use it for everything that is not a Supabase outage.

The status file (T316): status.json on the data host, at
https://data.carta-europetravel.com/data/status.json (R2 object carta/data/status.json). The app reads it
once per page load with a 3 second timeout and shows it in place of the site notice when both are live,
so it works with Supabase down. Use it for a Supabase outage, and for anything else when the Admin panel
cannot be reached. Only a build with a data host asks for it (build-pages.mjs always sets one); a dev
server or a plain npm run build never does. Its fields:

| Field | Meaning |
|---|---|
| enabled | must be true to show anything; the quiet state is {"enabled": false} |
| text | the sentence, or a map by language {"en": "...", "nl": "..."} with English as the fallback |
| tone | "warn" for the warning look, anything else for info |
| until | optional ISO time; after it the line stops showing by itself |

Write the file with the helper, from continent-app/. It checks the file against the app's own parser,
prints the line a traveller will see, sets until 24 hours ahead unless told otherwise, saves it to the
system temp folder (never inside a repository) without the byte order mark PowerShell's Out-File adds,
and prints the upload command with that path filled in:

    node scripts/status_notice.mjs "Signing in and saving trips are down. Your trips are safe." --until 2026-10-04T18:00Z
    npx wrangler r2 object put carta/data/status.json --file <the path it printed> --content-type application/json --cache-control "public, max-age=60" --remote
    curl -s https://data.carta-europetravel.com/data/status.json

wrangler needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID exported. The helper also prints the rclone
equivalent, for when the RCLONE_CONFIG_R2_* variables of scripts/r2/push-data.mjs are set instead. With
max-age=60 a change reaches new page loads within about a minute; a traveller who already has the app
open sees it on their next load. To take it down, write the quiet file and upload it the same way:

    node scripts/status_notice.mjs --clear

Prefer the quiet file to deleting the object: it keeps a normal day a 200, where a missing file is a 404
in every visitor's browser console. The weekly data push never touches status.json, because
push-data.mjs only copies and prunes the entries named in R2_TIER.

Maintenance mode (Admin, Site tab) blocks the whole app for visitors. Use it only to stop damage, for
example a bad data push that shows wrong prices, never to announce an outage of one feature.

## Where to look first

| What | Where |
|---|---|
| Pipeline runs | Admin, Overview, pipeline card (migration 041); on the box `tail -n 20 ~/logs/weekly.log` |
| AI failures and fallbacks | Admin, Overview: edge errors by code and upstream status, model report with fallback rate |
| AI caps hit | Admin, AI usage: global_cap against user_cap refusals (ai_cap_events) |
| Payments | Stripe Dashboard, Developers, Webhooks, the endpoint's failed deliveries |
| Supabase health | Supabase Dashboard, project home and Reports; Admin, Overview, health line |
| Data host | `node scripts/r2/verify-data.mjs` from continent-app/ |

## 1. The pipeline fails silently

Alert. The heartbeat in run_pipeline.py pings CARTA_HEARTBEAT_URL at start, on success and on /fail. An
external dead-man's switch (Healthchecks.io, weekly period, one day of grace) emails when the success
ping does not arrive. That covers a run that never started (box off, timer disabled, lock stuck) and a
run that failed. It is not live yet: the check and the variable are an owner step (T218-b). Two failures
it does not catch: an R2 publish or archive failure after a good run (exit 3, the heartbeat has already
said success, T218-c), and a run that succeeds with bad data, which waits for the row-count and drift
alerts of T081. Until those exist, glance at the Overview pipeline card every Monday evening.

What the traveller sees. Nothing. The site keeps serving last week's data, because the box uploads in
phase 1 only (add and replace, never delete). A failed week is stale data, not an outage, so it is
fixed within the week, not tonight. No site notice.

Response. On the box, read the last lines of ~/logs/weekly.log. The exit code says which kind: 1 a task
failed, 2 the run refused (a guard or the lock), 3 the archive or R2 publish failed, 75 a run was
already going. Copy the dated log under ~/carta/logs to the laptop and hand it to a Claude session. Do
not edit code on the box; fixes go through a task branch and the box pulls main. Rerun by hand with
`CARTA_PIPELINE_ENABLED=1 bash ~/carta/infra/hetzner/cax11/weekly.sh`. If bad data already reached R2,
switch on maintenance mode only if prices or places are visibly wrong, then push the previous good
build (stage 5.3 push from a laptop build of the last good master, pulled with
`python pipeline/archive/push.py --pull --only master-current` from the snapshot before).

## 2. Gemini quota is exhausted

Alert. The Google Cloud budget email (EUR 50 a month at 50, 90 and 100 percent, live since T259) for
money. For quota, the Admin model report: a fallback rate climbing above its normal level means the
primary model's quota is going, and edge errors with code ai_error and upstream 429 or a run of
global_cap refusals mean the whole chain is spent. There is no push alert on these yet; T235 owns one.

What the traveller sees. When every model in the chain answers 429, plan-day answers global_cap and the
app says "Carta's shared Carta bot budget for today is fully used. It resets tomorrow; the built-in
planner still works right now." The unit is refunded. This is already the honest message; nothing to
add unless it lasts more than a day.

Response. In Google AI Studio or the Cloud console, check whether it is a rate limit (per minute or per
day, clears by itself), the project's billing cap, or a spike. A spike from one account is abuse: look
at the top users in Admin, AI usage, and ban if needed. To slow spend, lower AI_GLOBAL_DAILY_CAP
(`supabase secrets set AI_GLOBAL_DAILY_CAP=<n>`). To switch the bot off entirely, unset GEMINI_API_KEY;
every AI surface then says the bot is not switched on, which is true. Raise a cap or a budget only after
reading the Margin panel, since every pass holder's allowance is paid from the same key. Add a site
notice only if the bot will be off for more than a day.

## 3. Stripe webhooks stop arriving

Alert. Stripe emails the account owner when deliveries to an endpoint keep failing, and disables the
endpoint after several days of failures. The earlier signal is usually a customer: "I paid and have no
pass." Reconcile any time with the number of successful Checkout payments in the Stripe Dashboard for a
day against `select count(*) from public.pass_grants where granted_at::date = '<day>'`.

What the traveller sees. They pay, return to the app, and still hold the free tier. Money taken with
nothing granted is the worst failure Carta can have, so this one is fixed the same day.

Response. Dashboard, Developers, Webhooks, the endpoint, failed deliveries: the response code says why.
401 means the function was deployed without --no-verify-jwt. 400 with a signature error means
STRIPE_WEBHOOK_SECRET does not match the endpoint's signing secret. 500 with a function-not-found error
means a migration and the function are out of step (044 must be pasted before the webhook is deployed).
5xx with no body or a timeout means Supabase itself, see section 5. Fix the cause, then press Resend on
each failed event. grant_pass is keyed on the Checkout session id, so a resend that already landed does
nothing. Stripe retries by itself for about three days; after that, resend by hand from the event list.
Do not grant missing passes with Admin set tier: that leaves no pass_grants row and no consent record.
While checkout is broken, set the site notice: "Buying a pass is paused. Nothing you paid for is lost."

## 4. R2 or Cloudflare has an incident

Alert. None of Carta's own until T235 adds an uptime probe on the site and on data and cdn hosts.
Until then: a user report, or www.cloudflarestatus.com. Confirm with `node scripts/r2/verify-data.mjs`.

What the traveller sees. With only R2 down, the app opens and the map draws, but destination detail,
places, dossiers and trails fail to load, and self-hosted photos are missing. With Cloudflare Pages or
the zone down (after stage 6), the site does not load at all.

Response. Check that it is Cloudflare and not us: a bad publish shows as wrong or missing files with a
200, an incident as errors or timeouts across everything. For an incident, there is little to do but
wait and watch the Cloudflare status page. Between stage 5 and stage 6 (data on R2, shell on Vercel) the
rollback is to remove VITE_DATA_BASE in Vercel Production and redeploy, which serves everything
same-origin again. In the week after the Pages move, Vercel stays deployed and repointing DNS to it is
the rollback (T024 runbook). After that week there is no second host. The status file lives on the
same R2 host, so it cannot speak for an R2 outage; with only R2 down, Supabase still answers, so use the
site notice ("Destination details and photos are not loading. The map and your saved trips still
work."). With the whole zone down nothing of Carta's loads, and there is no in-app line to post.

## 5. The Supabase project has a problem

Alert. Supabase emails the owner about usage limits and project pauses; subscribe to status.supabase.com
for platform incidents (T218-d). The Admin health line names missing tables after a bad paste.

What the traveller sees. The catalogue, map and destination pages come from static files and keep
working. Sign-in, saved trips, shared trips, the bot, booking import and checkout fail with their own
error lines. The site notice is stored in Supabase and cannot be shown; post the status file instead
(the status surface, above), for example "Signing in and saving trips are down. Your trips are safe.",
and clear it with --clear when the project is back.

Response, by kind. A platform incident: wait, nothing local fixes it. A paused or over-limit project:
the Dashboard says which limit; restore the project or reduce the cause, and plan the move to Pro
(T232). A migration paste that broke something: most migrations from 024 on carry a DOWN block in their
header (032 does not, nor do most before 024); run it in the order written, or for a file without one,
re-paste the previous definition of each function it replaced. Function deploys always follow the SQL
they call.
A leaked service role key: rotate it in the Dashboard, then update it in the box's
~/.config/carta/env and in the function secrets. Lost data: restore from the weekly encrypted dump in
r2:carta/archive/db/ into a new project with the T045 report's commands; anything newer than the last
dump is gone, so say so to the affected users.

## After every incident

Add one admin note on any affected user, switch the site notice off, and if a fix needs code, open a
task for it. Write two lines in the next task report that touches the area: what failed, how long, what
changed so it does not happen the same way twice.
