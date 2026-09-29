# Everything that is open, in the order it can be done

One document for the 226 open rows in `_OPEN.md`. It exists because the
register is a flat list: it tells you what is open but not what blocks what,
and the ordering is split between numeric `Order` values that stop at 62 and
relative "after T0xx-y" values that never join them.

115 rows are owned by `user`, meaning only you can do them: a Dashboard step, a
secret, a migration paste, a purchase, a product decision. 111 are owned by
`next task` and are work for a Claude Code session. This document sequences the
115 and points at the rest.

Nothing here replaces `_OPEN.md`, which stays the record of truth, or the three
procedure files that already carry the detailed commands:

- `P2/_OPEN-stripe-launch.md` for the Stripe launch (orders 1 to 6)
- `P2/_OPEN-gemini-billing.md` for Gemini billing and the telemetry migrations (orders 7 to 21)
- `P3/_OPEN-hetzner.md` for the build boxes and the CDN (orders 30 to 62, its own steps 1 to 34)

The admin chain (T063 to T077) had no procedure file. Section D below is it.

## The one line that matters most

**Migration 018 cannot be applied to the live project as committed.** Line 93
carries the regex bound `{5,600}`, which exceeds the Postgres repetition cap of
255, and the paste fails. That is row T031-d, owned by `next task`, open since
T031, and it is a one-character fix to `{5,255}`.

It blocks the entire admin migration chain, because 033 and 043 both need
`content_overrides` to exist. Nine of the twelve migration pastes below sit
behind it. Fix T031-d before you start section D.

## How the four tracks relate

The four tracks are independent of each other except where noted. You can do
them in any order, or stop after any one of them, and nothing already working
breaks.

| Track | What it gets you | Owner rows | Blocked by |
|---|---|---|---|
| A. Stripe launch | The ability to take a first payment | 13 | Nothing |
| B. Gemini billing and telemetry | Legal compliance on the AI route, plus cost and margin visibility | 23 | Nothing |
| C. Build boxes and CDN | The pipeline off your laptop, images and data served from R2 | 47 | Nothing |
| D. Admin and moderation | The admin panel, DSA moderation, and the telemetry the app already calls | 32 | T031-d, a code fix |

Track D is the cheapest by far: twelve pastes into the SQL editor, most of them
two minutes each, and the app is already written against every one of them.
Track C is the largest and the only one that costs money monthly.

A note on what "open" means for tracks A and B: the app does not break without
them. Stripe has never been live, so nothing is half-finished in production;
the Gemini route works today and the open rows are about billing posture and
measurement, not function.

---

# Track A. The Stripe launch

Full commands in `P2/_OPEN-stripe-launch.md`. Thirteen rows, orders 1 to 6.
Nothing in this track is blocked by anything else, and nothing else is blocked
by it.

The one trap: set the Stripe Dashboard Terms of service URL **before** you set
`CHECKOUT_TERMS_URL` as a secret. The secret arriving before the Dashboard
field makes every checkout return 502.

Step 1. Confirm `tax_behavior` is inclusive on both Prices (T033-a). Exclusive
makes section 3.1 of the unit economics wrong by EUR 1.21 a sale.

Step 2. Verify or create the two Stripe Prices, 699 and 1499 EUR, one_time,
eur; note the ids and the mode (T030-a).

Step 3. Dashboard Tax: Belgian origin address, Belgium-only registration,
threshold monitoring on with a read email (T033-b).

Step 4. Fill the Dashboard Terms of service URL, then set `CHECKOUT_TERMS_URL`
(T032-a). Order matters, see above.

Step 5. Paste migration 025 (T032-b), then 026 before redeploying the webhook
(T033-c), then 022 followed by 027 (T034-a). 022 was never applied and the
funnel cannot run live without it.

Step 6. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_TRIP`, `STRIPE_PRICE_YEAR` as
Supabase secrets, then deploy `checkout` and `stripe-webhook` (the webhook with
`--no-verify-jwt`) (T030-b).

Step 7. Make the real test purchases per
`supabase/functions/checkout/test_purchase_e2e.md`, on fresh accounts, never
the owner account (T031-a).

Step 8. Confirm on a real purchase that the Stripe page shows Carta's waiver
wording and `pass_grants` reads consent accepted (T032-c), and that tax
resolves in test mode: a German and a Belgian address both show the Belgian
rate, `amount_tax` 121 on 699 (T033-d).

Two decisions that are not steps and have no deadline: the Article 16(m)
classification in the terms is unreviewed by anyone qualified (T032-e), and
T015, the accountant's VAT answer, does not exist as a file although the
Belgian registration must match it (T033-g).

---

# Track B. Gemini billing, telemetry and margin

Full commands in `P2/_OPEN-gemini-billing.md`. Twenty-three rows, orders 7 to 21.

The legal one first, then the measurement. Each migration here pairs with an
Edge Function redeploy, and the order within each pair is not optional:
redeploying before the paste records nothing, and the loss is silent.

Step 9. Attach an active Cloud Billing account to the Google Cloud project that
issued `GEMINI_API_KEY` (T035-a). This is required by the Gemini API Additional
Terms of 2026-03-23 for EEA, CH and UK users, so it is a compliance step rather
than a spending one. Prove it with `gcloud billing projects describe
PROJECT_ID` showing `billingEnabled: true`.

Step 10. Google Cloud budget alerts: EUR 50 a month, thresholds at 50, 90 and
100 percent (T036-a).

Step 11. Test the 429 rejection live: set `AI_GLOBAL_DAILY_CAP` to 1, call
`plan-day` twice, confirm the second returns 429 with code `global_cap`, then
restore the cap to 200 (T036-b). In the same sitting, force a `plan-day`
failure after quota is spent on a test account and confirm `ai_usage` returns
to its prior value (T037-b); the live refund path has never been checked.

Step 12. Migration 028, then redeploy `plan-day` (T038-a, T038-b).

Step 13. Before the cron block in migration 030 runs: enable `pg_cron` and
`pg_net` under Database, Extensions, and create the vault secrets
`refresh_facts_url` and `refresh_facts_key` (T041-b). Without them the block
silently schedules nothing and the store never refreshes.

Step 14. Migration 029, then redeploy `plan-day` (T039-a, T039-b). Note that
the SQL in 029 was never executed anywhere, only read, so a syntax error would
first surface at paste time (T039-d).

Step 15. Migration 030, then redeploy `plan-day`, `parse-booking` and
`suggest-city` (T042-a, T042-b).

Step 16. Migration 031 (T043-a). No redeploy is needed here, unlike 028 to 030,
because nothing in the request path writes to anything 031 adds.

Step 17. A week after the redeploys, in one sitting: read the live cache hit
rate off the admin panel and record it (T039-c), and read the cap refusal
counts (T042-e). Both start empty and neither first week is a usable baseline.

Watch one thing after step 15: the daily percentages assume a global cap of 200
because `AI_GLOBAL_DAILY_CAP` lives in the Edge Function environment where SQL
cannot read it. If you ever change that secret, set the `site_config` key
`ai_global_daily_cap` to match, or every percentage in the section goes quietly
wrong (T042-c).

Optional, and only if a real before-and-after matters more than a week of the
saving: no live v4 cache baseline exists, so you could apply 029 and redeploy
holding the key at v4 first, then ship v5 (T039-e).

Two measurement runs with written procedures in the T040 report, both needing a
real Gemini key: the live A/B on the prompt trim (T040-a) and the 20-real-plan
side-by-side quality check (T040-b).

One decision: the live-grounding allowance for T148, proposed as 10 on the Trip
Pass and 30 on the Year Pass in place of 40 and 120 (T041-a). The number is
printed in the pass offer in six locales, so it changes what a buyer is
promised.

Two items about the ledger that only become real once you have invoices: T016
has never been done, so migration 031 defines the ledger contract instead and
seeds it with modelled figures (T043-b), and T043's own done condition, one
reconciled month, cannot be met until real invoices are entered (T043-c).

---

# Track C. Build boxes, R2 and the CDN

Full commands in `P3/_OPEN-hetzner.md`, which numbers its own steps 1 to 34 and
maps them to orders 30 to 62, with the R2 groundwork (orders 22 to 29) ahead of
them. Forty-seven owner rows, the largest track and the only one with a
recurring bill.

Read that file rather than this section for anything you are about to run. What
follows is the shape, so you can see what you are committing to before you
start.

The order inside the track is strict, because each stage's verification depends
on the previous stage existing:

1. **R2 first** (orders 22 to 29). Create the bucket, attach
   `cdn.carta-europetravel.com` and `data.carta-europetravel.com`, verify both,
   then rclone, the lifecycle rules, the first real push, the gpg backup key and
   the first restore test. Fix T045-f before T044-a: `provision.sh` calls
   `wrangler r2 object put` without `--remote`, so its markers go to local
   Miniflare storage and T044-c's verify will fail against the real bucket.

2. **The CAX11 orchestrator** (orders 30 to 36). Decide IPv4 first: an
   IPv6-only box cannot reach GitHub, so the clone and the hcloud download both
   fail, and the fix is about EUR 0.60 a month (T046-a). Then make
   `infra/hetzner/` clonable, because origin main is still at 8b53babed and the
   box clones from it (T046-b).

3. **Moving the weekly schedule onto the box** (orders 37 to 43). Verify the
   twelve weekly steps one at a time, then a full run, then compare the box's
   wire against a laptop build and get SAME SHAPE. Two things must be settled
   before you disable the laptop's scheduled task: how the box's output reaches
   production (T048-j, a real decision, because the box rewrites tracked files
   and builds dist but nothing commits, pushes or deploys them), and T048-d
   passing. After the switch, always pull the box's master before any laptop
   master write (T048-f).

4. **The on-demand worker** (orders 44 to 48), then **the image ladder**
   (orders 49 to 52), then **takedown, attribution and the picture switch**
   (orders 53 to 56), then **the data shards and the cutover** (orders 58 to
   61).

Two notes worth carrying into the track. The fare data has not refreshed since
2026-07-23 because the 2026-09-21 run exited 1 on the Windows any-python guard,
so every shipped fare slice is 46 to 54 days old while being presented as a
quote (T048-m, and the decision in T058-e). And the Tier 0 monthly bill, about
EUR 9.50 to 10.90, is still unconfirmed against an invoice because nothing is
provisioned yet (T055-b).

---

# Track D. The admin panel, moderation and telemetry

This is the track with no procedure file, so it is written out in full here.
Thirty-two owner rows, twelve of them pastes into the Supabase SQL editor.

**Before anything in this track: fix T031-d.** Migration 018 line 93 has the
regex bound `{5,600}`; change it to `{5,255}`. Without it, 018 cannot be
applied, and 033 and 043 both need `content_overrides` to exist. This row is
owned by `next task`, so it is a Claude Code job, not yours.

Two rules for the whole track, from the project's own working rules. Never
`db push` against `ntssxktaduxzpsmejwyv`; paste by hand. And after every paste,
look for the self-check notice named below. Each migration ends with a block
that raises if the schema is not what it expects, so the notice is the
difference between "it ran" and "it is right".

## The paste order

Strictly sequential. Each one's self-check asserts the previous one landed.

| # | Migration | Row | Look for | Until it is pasted |
|---|---|---|---|---|
| 1 | 018 | T031-d first | (see above) | 033 and 043 cannot apply |
| 2 | 032 | T063-c | admin MFA self-check passed | delete and ban need only aal1 |
| 3 | 033 | T064-a | admin audit rollback self-check passed | no rollback, no previous/new audit detail |
| 4 | 034 | T065-a | admin guard tiers self-check passed | config and override saves stay on the read tier |
| 5 | 035 | T066-a | site config visibility self-check passed | every site_config key is world-readable |
| 6 | 036 | T067-c | admin public guides self-check passed | the Guides tab shows a missing-function error |
| 7 | 037 | T068-a | content reports self-check passed | the report form answers "did not send" |
| 8 | 038 | T069-a | admin unpublish guide self-check passed | Unpublish errors and nothing changes |
| 9 | 039 | T070-a | statement of reasons self-check passed | a takedown gets no statement |
| 10 | 043 | T074-a | override review lifecycle self-check passed | the new admin page cannot save |
| 11 | 040 | T071-a | (self-check notice) | each AI failure makes one dropped RPC call |
| 12 | 041 | T072-b | pipeline health self-check passed | the Overview card reads hasRun:false |
| 13 | 042 | T073-a | parse failures self-check passed | nothing records structural parse failures |

Steps 11 to 13 are independent of each other and of steps 2 to 10; they are
last only because they are the least urgent. Step 10 (043) formally needs only
034, so it can be done any time after step 4, but leaving it in place keeps the
sequence single-file.

Two pastes in this track pair with other work. Before 032, enrol a TOTP factor
on the owner account and confirm TOTP is enabled in the project Auth settings
(T063-b); pasting 032 before that locks both destructive buttons. And 043 needs
the app build from the T074 branch deployed with it: the new admin page cannot
save before the paste, and an older build gets `bad_status` after it (T074-a).

## The re-paste hazards

These are the subtlest trap in the whole register, because nothing fails at
paste time. A later migration silently reverts an earlier one's work, and you
find out when a feature stops working.

- Re-paste 014 at any point, and 035's visibility rules are gone (it re-creates
  the `USING (true)` policy). Paste 035 again.
- Re-paste 033, and 034's destructive-tier settings are gone (033's own
  self-check asserts the read tier, so it still passes). Paste 034 again.
- Re-paste 018, 033 or 034, and 043 is undone. Paste 043 again.
- Re-paste 020, and 038's takedown exception to `guard_coplanner_write` is
  gone, so every takedown fails with "the plan is still public after the
  update". Paste 038 again (T069-b).
- Re-paste 038, 037 or 020, and 039's takedown body, report list and co-planner
  guard are undone, so reversals fail loudly and the report list loses its
  decision fields. Paste 039 again (T070-b).
- Re-paste 016 after 040, and `edge_errors` comes off the health list. Paste
  040 again (T071-a).

The rule that covers all six: after pasting any migration by hand, re-paste
every later migration that names it.

## One environment pair, not a migration

Set `CARTA_SUPABASE_URL` and `CARTA_SUPABASE_SERVICE_KEY` on the machine that
runs `run_pipeline.py` (T072-a). Without them `report_pipeline_run()` logs a
skip line and no row is ever written, so migration 041's card stays empty even
after the paste.

And one redeploy: `parse-booking` was changed to return reason codes but was
never deployed (T073-b).

## After the first real report and the first real takedown

Two checks that can only be done once real data exists. After the first content
report, run `select source_header, count(*) from public.content_reports group
by 1`: `cf-connecting-ip` means the address bucket is sound, `x-forwarded-for`
means its first entry is client-chosen and `report_guide` should take the last
trusted entry instead (T068-c).

## The decisions in this track

None of these blocks a paste. All of them are product or legal calls that only
you can make, and several are best made together.

Moderation and DSA, best taken as one sitting:

- The notice form asks for no name and no good-faith statement (Art. 16(2)),
  and no receipt or decision is sent to a notifier who left an email (Art.
  16(4) and 16(5)) (T068-d).
- The statement shows one reason, but Art. 17(3)(d) and (e) want the legal
  ground apart from the contractual one, which means the terms need a content
  rule moderators can cite (T070-c).
- No transactional email route exists, so a statement of reasons reaches the
  owner only in My trips. An Edge Function with a non-Anthropic provider, or
  Auth SMTP, and never the Claude API (T070-d). This one also serves T068-d.
- Confirm Carta's size against Arts. 20 and 24(5), which bind online platforms
  that are not micro or small enterprises, to settle whether statements must
  also go to the Commission's DSA transparency database (T070-e).
- Retention: `content_reports` keeps every row forever including the reporter's
  email and the source hash (T068-g), and `moderation_statements` keeps every
  statement and complaint forever (T070-g). Set both together.

Takedown behaviour, also best taken together:

- The owner can republish a taken-down guide immediately (T069-c).
- A takedown does not revoke the plan's share links, because 009's
  `get_shared_trip` ignores visibility, so content off the gallery stays
  readable by anyone holding an old link (T069-d).

Admin surface:

- `admin_set_tier`, `admin_reset_quota` and `admin_unban_user` stay on aal1;
  decide whether handing out a pass or resetting quota also needs aal2
  (T063-e).
- `admin_guard` counts only five action names toward the destructive budget, so
  config, override and feedback saves are not limited by their own count;
  decide whether to add them to the shared budget or give them their own list
  (T065-b).
- An overdue temporary override keeps applying to travellers indefinitely;
  decide whether it should stop after a grace period (T074-c).
- A public plan whose author has no `profiles` row is public by its column but
  absent from the gallery; decide whether to repair missing profiles or refuse
  publishing without one (T067-d).

## The two rows T077 raised for you

The new CI job has not run yet, because no GitHub Actions run exists until the
branch is pushed; confirm it goes green on the first push (T077-d).

And the suite proves the migrations as committed produce a closed admin
surface, not that the live project matches them. With 021, 022, 024 to 027 and
029 to 043 recorded as unapplied, the live surface is known to differ. Checking
it for real means reading `pg_proc` from the live project with a credential no
CI job should hold (T077-b). Working through the paste order above is what
closes that gap.

---

# The rows this document names only in summary

Track C is summarised rather than enumerated, because `P3/_OPEN-hetzner.md`
already writes out each of its steps with the commands. Thirty-five owner rows
live there and nowhere else, listed in full so a search for any one of them
lands here: T044-b, T045-a, T045-b, T045-c, T045-d, T045-e, T046-c, T046-d,
T046-e, T046-f, T047-a, T047-b, T047-c, T047-d, T047-e, T047-f, T048-a,
T048-b, T048-c, T048-e, T048-g, T049-a, T049-b, T049-c, T049-d, T049-e,
T050-a, T051-a, T052-a, T054-a, T054-b, T054-c, T055-a and T059-a. Work that
track from that file, not from this one.

Four more sit outside all four tracks. They are real, they are yours, and no
procedure file carries them:

- The Travelpayouts Drive script (emrldtp.com in `continent-app/index.html`) is
  vendor-controlled code making eight requests per page load. None asks for a
  price today, but `verify_no_runtime_fares.mjs` can only check that on the day
  it runs. Decide whether it stays (T056-a).
- Commit 4b2d8e19f carries T011 to T056's work under a T057 message, 84 files,
  all genuinely absent from main, so reverting T057 would revert eight tasks'
  app code. Decide before merging P3 whether to leave it as a recorded
  attribution defect or fold it into T026's planned history rewrite, which
  already lists these paths (T062-a).
- Task number T062 is used twice, once in P3 for the uncommitted work and queue
  runner and once in P4 for the admin component split. Decide whether to
  renumber one (T062-c).
- First paint and tile counts were measured with Chromium's 4x CPU throttle on
  loopback, not on a real device or a throttled network; a field measurement is
  the more honest number (T061-a).

And one local-tooling note that blocks a test rather than a feature:
`test_global_cap.mjs` Part A needs a writable PostgreSQL server, and the local
5432 server rejects every credential available to a session with no pgpass
file, so the recorded run used a Docker container (T036-c). The admin harnesses
hit the same wall and solve it the same way, with a throwaway trust-auth
cluster.

---

# The shortest useful path

If you want the most result for the least time, in this order:

1. Fix T031-d. It is a one-character change and it unblocks nine pastes.
2. Track D steps 11 to 13 (migrations 040, 041, 042). Three pastes, no
   dependencies, and they switch on telemetry the app is already calling and
   currently dropping on the floor.
3. Track D steps 2 to 10. Twelve minutes of pasting turns on the admin panel,
   moderation and the override lifecycle, all of which are already built.
4. Track A. Thirteen steps to a first sale.
5. Track B. Compliance first (step 9), then the rest as measurement.
6. Track C. The largest, and the only one that changes your monthly bill.

Tracks A, B and C can also be handed to a next task up to the point where a
Dashboard, a secret or a purchase is needed; the 111 `next task` rows in
`_OPEN.md` are where that work is listed.

---

**Sources.** `Execution/_OPEN.md` at 245 rows, 226 open, read 2026-09-29, plus
the three `_OPEN-*.md` procedure files and the P4 reports T063 to T077. Row
ids are the join: every claim here is one row there, and the reasoning behind
each row stays in the report that raised it.
