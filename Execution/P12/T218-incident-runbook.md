# T218 incident runbook and a status surface

## Task ID

T218 (mind-map M18). Branch p12-incident-runbook, branched from p12-refund-sop, root repo only.

## Date

2026-10-02

## What changed

Carta now has an incident runbook, docs/INCIDENT_RUNBOOK.md, covering the five failures the task names: the pipeline failing silently, Gemini quota exhausted, Stripe webhooks not arriving, an R2 or Cloudflare incident, and a Supabase problem. Each section says the same four things in the same order: the alert that triggers it, what the traveller sees, what to do, and what not to do. It is written for the hosting after stages 5 to 7 of _OPEN-MASTER.md (Pages, R2, the CAX11 box) and says where the steps differ before those stages land.

The status decision is an in-app line, not a public status page. Carta has one operator. A public page needs someone updating it, and a page reading "all systems operational" during an outage does more harm than no page. The vendors already publish their own. What the existing app lacks is a way to reach the people inside it, and it already has half of that: the site notice (AnnouncementBar, from site_config) and the honest failure copy on each surface, such as the global_cap message when the Gemini chain is spent and the "not switched on" message when the key is unset. The runbook uses those and nothing else. The gap it names is that the site notice lives in Supabase, so it is silent exactly when Supabase is down. The fix is a static status file on the data host that the app reads at boot; that is code, and since the data host only exists after stage 5 and the shell moves in stage 6, it is recorded as open (T218-a) rather than built here.

Writing the alert for each failure turned up which alerts exist. Of the five, only the Gemini one is live today, through the Google Cloud budget email T259 set up. The pipeline already has the hooks (the heartbeat in run_pipeline.py and the pipeline_runs row from 041) but no monitor behind the heartbeat URL and no variable set, so the dead-man's switch is an owner step (T218-b). The box's weekly wrapper exits 3 when the R2 publish or archive step fails after a good pipeline run, but by then run_pipeline.py has already pinged success, so that failure reaches nobody; the fix is in infra/hetzner, which this task may not touch (T218-c). Stripe and Supabase alert by email to the account owner once subscribed (T218-d). R2 and Cloudflare have no Carta-side alert until T235 adds uptime probes, and row-count drops after a "successful" run wait for T081. Both tasks already exist in _ORDER.md, so they are named in the runbook and not raised again here.

Two decisions in the runbook are worth knowing before an incident rather than during one. A failed pipeline week is not an outage: the box only ever uploads in phase 1 (add and replace, never delete), so the live site keeps last week's data and the fix can wait for a task branch. And a missing pass after payment is never repaired with Admin set tier, because that writes no pass_grants row and so no consent record; the repair is Resend in the Stripe Dashboard, which is safe because grant_pass is keyed on the session id.

## Files touched

**Created:**
- docs/INCIDENT_RUNBOOK.md
- Execution/P12/T218-incident-runbook.md

**Modified:**
- Execution/_OPEN.md (rows T218-a to T218-e)

No code, no migration, no app repo change.

## Commands run

```
git -C C:/Users/Gebruiker/Documents/Portfolio/wt/T217 checkout -b p12-incident-runbook
git -C C:/Users/Gebruiker/Documents/Portfolio/wt/T217 add docs/INCIDENT_RUNBOOK.md Execution/P12/T218-incident-runbook.md Execution/_OPEN.md
git -C C:/Users/Gebruiker/Documents/Portfolio/wt/T217 commit
git -C C:/Users/Gebruiker/Documents/Portfolio/wt/T217 show --stat HEAD
```

The claims in the runbook were checked against the code: the heartbeat and exit codes in run_pipeline.py and infra/hetzner/cax11/weekly.sh, the 429 handling in supabase/functions/plan-day/index.ts, the ai.quotaGlobal and ai.unavailable strings, the webhook's secret and deploy flags, useSiteConfig.js and AnnouncementBar.jsx, and which migrations carry a DOWN block (an early draft said all from 007 do; 14 of them do not, and the text was corrected).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Named failures with a written response | 0 of 5 | 5 of 5 | +5 |
| Named failures with the triggering alert identified | 0 of 5 | 5 of 5 | +5 |
| Named failures whose alert is live today | 1 of 5 | 1 of 5 | none (this task writes no alert) |
| Ways to tell travellers about an outage while Supabase is down | 0 | 0 | none (T218-a) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Runbook said every migration from 007 has a DOWN block | assumed from the recent ones | checked all files; reworded to name the exceptions |

## What is still open

The status surface itself (T218-a). A small static file on the data host, written by the owner or a script, read once at boot with a short timeout and shown through the same banner as the site notice, falling back silently when absent. It waits for the stage 5 cutover and the stage 6 move, and it must follow carta-design for the banner.

The heartbeat monitor (T218-b). Create a check at Healthchecks.io or similar with a weekly period and about a day of grace, email to the owner, and put its ping URL in CARTA_HEARTBEAT_URL in ~/.config/carta/env on the box during stage 7.3. Without it the pipeline section's alert does not exist.

The exit 3 gap (T218-c). weekly.sh should ping the heartbeat URL with /fail when run_pipeline.sh returns non-zero, so an R2 publish or archive failure after a good run is not silent. infra/hetzner is outside this task's scope.

Vendor alerts (T218-d). Subscribe the owner address to status.supabase.com, www.cloudflarestatus.com and status.stripe.com, and confirm that the Stripe account's webhook failure emails and the Supabase usage emails go to an address that is read.

A drill (T218-e). None of the five responses has been rehearsed. Once Stripe test mode, the box and R2 exist, run each one once on purpose (stop the webhook, unset the Gemini key on a branch project, kill a weekly run) and correct the runbook where reality differs.

## Rollback procedure

`git revert` the T218 commit on p12-incident-runbook, or do not merge the branch. Nothing else changed.
