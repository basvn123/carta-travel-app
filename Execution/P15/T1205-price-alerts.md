# T1205: Price alerts (ROADMAP I17)

Round 3 session S121, batch 14. Branch `p15-s121-price-alerts` from `p15-round3`.

## Date

2026-11-07

## What changed

A signed-in traveller can now save a price alert on a place from the destination page's price card: they pick the share the total must fall by (5, 10 or 20 percent), tick an unticked consent box, and save. Migration 073 adds `price_alerts` and `price_alert_consent` with RLS (owner reads, owner deletes, every write through definer functions). The first save records the consent request and the new `price-alerts` Edge Function mails one plain confirmation link (double opt-in); no alert email goes out before that click or after an unsubscribe. On the box, the new weekly pipeline task `price_alerts` (after `stays` in the table, so a monthly run prices the new stays wire) asks the function for the open alerts, prices each with one formula from the stays wire and the flight sweep files, and posts whole-euro totals back with its own secret (the box never holds the service role key). The first total is the baseline; a later total at or below `floor(baseline x (1 - share))` fires once, marked in the same locked statement so a retry cannot mail twice, and the email (Resend, the I6 route) names both totals, the first check date and that the figure is Carta's estimate, with a one-click unsubscribe (RFC 8058 headers). Everything is behind two flags that are off: `VITE_PRICE_ALERTS=1` for the control and `PRICE_ALERTS_ENABLED=1` for the function. Article 30 gains row 25. Nothing is live: the paste, the secrets, the deploy and the flags are owner steps.

## Research

A research subagent compared the options (2026-11-07):

- **Where the check runs.** (a) a pipeline task on the box after each refresh that posts due totals to an Edge Function which sends; (b) an Edge Function on pg_cron reading the R2 wire files; (c) a Postgres-only job. Chosen: (a). The prices live on the box, so the total is computed once from the data the refresh just built; (b) duplicates the formula in Deno and wakes on a timer whether prices moved or not; (c) means loading prices into Postgres. Refinement adopted: the box holds only a dedicated `PRICE_ALERTS_BOX_SECRET`, and the database sets `fired_at` in the same statement that decides the fire (idempotent on retry).
- **Double opt-in for a verified account.** GDPR does not itself require double opt-in, but German courts treat it as the standard proof of consent ([BGH I ZR 164/09 summary](https://www.it-recht-kanzlei.de/newsletter-einwilligung-nachweis.html)); a confirmation email that carries promotion is itself unlawful advertising ([LG Berlin](https://www.it-recht-kanzlei.de/lg-berlin-werbung-double-opt-in-bestaetigungsmail-unzulaessig.html)). The CJEU's C-654/23 soft opt-in for freemium accounts ([Reed Smith](https://www.reedsmith.com/our-insights/blogs/viewpoints/102luvt/ecj-rules-on-soft-opt-in-for-freemium-newsletters-no-separate-gdpr-legal-basis-r/)) was rejected as the basis. Chosen: an unticked box at save time with the wording version logged, then one plain confirmation per account (not per alert); the test asserts the opt-in email carries no price.
- **One-click unsubscribe.** [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058) (`List-Unsubscribe` HTTPS plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`), required by Gmail and Yahoo for bulk senders since 2024 ([summary](https://customer.io/learn/deliverability/email-sending-requirements-gmail-yahoo)); Resend accepts custom headers on a send ([Resend docs](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails)). The subagent could not open resend.com from this container and read it from search snippets: owner step T1205-b checks it. Chosen: implement it now, the POST answers a bare 200.
- **Alert semantics.** Google Flights publishes no threshold ([help](https://support.google.com/travel/answer/6235879)); Kayak expires alerts after the travel date ([help](https://www.kayak.com/c/help/pricing/)). Chosen: baseline at the first check, default 10 percent with 5 and 20, fire once then done (save again to re-arm), expiry at 90 days or the first travel date, skip when any price is missing.
- **Email provider.** Not chosen here: Resend is the I6 route the brief names.

## Files touched

- Created: `supabase/migrations/073_price_alerts.sql`, `supabase/migrations/073_price_alerts_down.sql`, `supabase/functions/price-alerts/index.ts`, `supabase/functions/price-alerts/logic.mjs`, `supabase/functions/price-alerts/README.md`, `pipeline/price_alerts.py`, `tests/test_price_alerts.py`, `continent-app/src/lib/priceAlerts.js`, `continent-app/src/components/PriceAlertControl.jsx`, `continent-app/src/styles/97-price-alert.css`, `continent-app/tests/priceAlerts.test.mjs`, this report.
- Modified: `run_pipeline.py` (task `price_alerts`, before `photo_sources`), `continent-app/src/browse/DestPriceCard.jsx` (mounts the control), `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (15 `alerts.*` keys each), `continent-app/scripts/admin/test_rls_policies.mjs` (two fixtures and a 073 section), `docs/legal/ARTICLE30.md` (row 25, and two lines in its retention table), `docs/HANDBOOK.md` ("Price alerts (double opt-in)"), `ROADMAP.md` (I17 status), `Execution/_OPEN.md` (rows T1205-a to T1205-g), generated `docs/reference/{app-lib,python,supabase,tasks}.md` and `docs/architecture/lineage.md`.

## Commands run

```
node continent-app/scripts/admin/run_harnesses.mjs     # local Postgres 16, port 55436, before and after
node continent-app/scripts/admin/test_rls_policies.mjs
cd continent-app && npm ci && npm test && npm run lint
node --test tests/priceAlerts.test.mjs
node scripts/ci/design-lint.mjs
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs   # branch and base worktree
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/verify_csp.mjs --dist ../.fastbuild
python -m pytest tests -q (minus tests/quarantine.txt); python -m ruff check (0.14.3)
python -I scripts/docs/build_reference.py; build_lineage.py; config_reference.py --check; drift.py
npm run data -- --split-only; vite on 5191; playwright look at #dest=LIS?pricealerts=mock (generated boot.json and dest/ removed after)
```

## Config and secrets set

None set. New, all owner steps: Edge Function secrets `PRICE_ALERTS_FROM`, `PRICE_ALERTS_LINK_SECRET`, `PRICE_ALERTS_BOX_SECRET`, `PRICE_ALERTS_ENABLED` (plus the existing I6 `RESEND_API_KEY`); box env `PRICE_ALERTS_URL`, `PRICE_ALERTS_BOX_SECRET`; build env `VITE_PRICE_ALERTS`. No config key added to `config/pricing.json`; the box reads `stay.people_per_room` and `stay.weekend_nights` from it.

## Before/after measurements

| What | Before | After |
|---|---|---|
| RLS harness assertions (`test_rls_policies.mjs`) | 856 | 937 (81 new, all green) |
| Database harnesses green | 16 of 17 (`test_edge_errors` failed: `continent-app/node_modules` not installed in the container) | 17 of 17 (after `npm ci`, and the two 073 tables added to the Article 30 retention table, which `test_privacy_gdpr` requires) |
| App tests passing (`npm test`) | 1901 | 1912 (11 new), 0 failing, 12 skipped |
| Python tests for this task | 0 | 16 |
| Pipeline tasks in `run_pipeline.py` | 88 | 89 |
| Entry chunk (fast build), raw / gzip | 858,003 / 276,984 bytes | 863,093 / 278,834 bytes (+1,850 gzip: the control lives on the destination card, which is in the entry chunk) |
| Main stylesheet, gzip | 137,722 bytes | 137,827 bytes |
| `alerts.*` keys per language | 0 | 15 in each of six |
| Design lint new violations | 0 | 0 |
| CSP violations over 40 screen loads | not measured on base | 0 |
| Alerts priced, emails sent | not live | not live (owner steps) |

## What broke and how it was fixed

| Symptom | Cause | Fix |
|---|---|---|
| The first RLS run aborted at import | My section reused `const capped` and `again`, already declared in the same scope | Prefixed every name in the 073 section with `pa` |
| Three 073 checks failed | `'...' || x || '...'::jsonb` cast only the last literal; the cap test then had 19 rows not 20; the "unknown account" probe used an account that had just saved | Parenthesised the cast; used an id with no rows |
| The node test could not import the app lib | `supabaseClient.js` reads `import.meta.env` at load, undefined under node | `priceAlerts.js` loads the client on use; the tests inject a stub |
| `test_privacy_gdpr` failed: "all 73 tables are listed with a retention line" | The harness requires every table in the Article 30 retention table | Added `price_alert_consent` and `price_alerts` lines there |
| The dev page said "couldn't load travel data" | `public/boot.json` and `public/dest/` are generated, not in the checkout (as T1201 recorded) | `npm run data -- --split-only`, looked, removed the generated files |
| After a save the control said "Price alert on" before the opt-in click | Wording | `alerts.active` now reads "Saved: we email you once ..." in all six languages |

## Screens checked

Destination page price card (`#dest=LIS?pricealerts=mock`), at 390 and 1280 px: the collapsed button; the form (share 5/10/20, consent box unticked, estimate note, Save disabled until the box is ticked); after a save, the "Saved" line with Remove and the "Check your inbox" status; after Remove, "Alert removed." and the button back. No horizontal scroll (scrollWidth 390 and 1280). Without the seam and signed out, the control is absent. No page errors. Screenshots in `Execution/P15/T1205-shots/` (not committed).

Carta-design brief, the seven questions: one quiet secondary button under the card's primary, so the page keeps one primary; tokens only, no new colour; the copy is short, names what is compared and says the figure is an estimate (honest numbers); the share picker reuses Segmented; the consent box is a real checkbox with a tap-height label; status lines are `role="status"`; nothing moves.

## Checks at the end

- Database harnesses, local Postgres 16 on port 55436: 17 of 17 green (`test_rls_policies` 937 of 937, `test_privacy_gdpr` 69 of 69).
- `npm test`: 1912 passing, 0 failing, 12 skipped. `npm run lint`: 0 errors (36 warnings, none in touched files). eslint on touched files: clean. Design lint: 0 new.
- Fast build: built; `verify_csp.mjs`: 0 violations over 40 screen loads.
- Pytest minus quarantine: 1065 passed, 11 skipped, 2 failed: `test_rating_inputs.py::test_beauty_v2_reads_no_register` and `test_rating_stability.py::test_adding_places_moves_nobody_else` (a JSON decode error in `beauty_layer.unesco_near`). Both fail the same way on `origin/p15-round3` in this container, and this branch touches neither file nor the rating code; not quarantined by this task. The 16 new tests pass. Ruff 0.14.3 and the CI ruff selection: clean.
- `build_reference.py --check`, `build_lineage.py`, `config_reference.py --check`, `drift.py`: ok (generated docs regenerated for the new task, files and functions).

## What is still open

- T1205-a (user): paste 073 in the Supabase SQL editor.
- T1205-b (user): Resend sender check, the function secrets, the deploy and the box env.
- T1205-c (user): turn the two flags on after a test with your own account.
- T1205-d (next task): a trip-level control (My trips or the planner summary). The table, the save function, the spec (`stops`, `start`) and the box formula already handle a multi-stop trip; only the button on a trip screen is missing (outside this task's files).
- T1205-e (next task): privacy plumbing outside this task's files: `export_user_data()` does not include 073's two tables and the privacy policy page does not mention price alerts. (The Article 30 retention table does list them: `test_privacy_gdpr` requires a line per table, so two lines were added beside row 25.)
- T1205-f (next task): the alert total is the box's formula, not the card's `bedPrice()` (no peak factors, no home fees, a home sleeps 4), so the email's figures differ from the card's; and a weekly check sees a flight drop up to a week late. Consider showing the alert total in the control once armed, and a daily cadence for flight alerts.
- T1205-g (user): the T944 client-side price-drop email (`notify`, 060) overlaps with I17; decide whether to retire it once alerts are live.
- No Claude API anywhere: the check is arithmetic, the emails are templates.

## Rollback procedure

`git revert` the T1205 commits. If 073 was pasted, paste `073_price_alerts_down.sql` (one-way for the data: export the two tables first, as its header says). Remove the `price-alerts` function and its secrets; remove `PRICE_ALERTS_URL` and `PRICE_ALERTS_BOX_SECRET` from the box env. With the flags off nothing needs rolling back in the app: the control hides, and a missing table hides it too.

## Owner steps (for the checklist)

- [T1205-a] Paste migration 073 | the price alert tables, their RLS and the save, opt-in and check functions do not exist until then | open the Supabase SQL editor; paste supabase/migrations/073_price_alerts.sql after 072; look for "price alerts self-check passed" | supabase/migrations/073_price_alerts.sql
- [T1205-b] Set the price alert secrets and deploy the function | without them the function answers "off" and the box checks nothing | in Resend confirm the sender alerts@carta-europetravel.com is on the verified domain and that a send accepts custom List-Unsubscribe headers; run supabase secrets set PRICE_ALERTS_FROM, PRICE_ALERTS_LINK_SECRET and PRICE_ALERTS_BOX_SECRET (two different openssl rand -hex 32 values); supabase functions deploy price-alerts --no-verify-jwt; add PRICE_ALERTS_URL and PRICE_ALERTS_BOX_SECRET to ~/.config/carta/env on the box | supabase/functions/price-alerts/README.md
- [T1205-c] Turn price alerts on after a test | both flags are off, so no traveller sees the control and no email is sent | build a preview with VITE_PRICE_ALERTS=1 and set PRICE_ALERTS_ENABLED=1; save an alert on a place with your own account, click the confirmation email, run python pipeline/price_alerts.py --dry-run then without it on the box; when happy, build production with VITE_PRICE_ALERTS=1 | docs/HANDBOOK.md "Price alerts (double opt-in)"
- [T1205-g] Decide on the older price-drop email | the T944 notify email on saved places (060) and I17 alerts both mail about cheaper places, which may double up | keep both, or retire the price-drop switch in Account once alerts are live and say so in a task | supabase/functions/notify/README.md
