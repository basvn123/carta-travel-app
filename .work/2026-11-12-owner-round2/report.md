# Run report: owner sweep, round 2

- **Status:** done
- **Date:** 2026-11-12
- **Level and playbook:** L2 · deep-task (headless, no approvals, as the round-2 brief allows)
- **Run folder:** `.work/2026-11-12-owner-round2/`
- **Branch:** `p15-owner-round2` (commits `28fd4df721`, `69dcabbe65` and the report commit), based on `main` `dd9f7ddbaa`
- **ROADMAP items:** I-f, I2, H14, G14, D22, E6, A3; notes added to B8, C4, C7, C10, D7, D8, D9, D10, D15, D18, D19, D21, D23, E2, H8, H9, H10, I1, K8, K14

## Summary
Every one of the 115 round-2 ids (the 115 handoffs and the 74 `unsorted.md` rows overlap) has a ledger entry. `docs/owner/unsorted.md` is empty. 38 closed or duplicate steps were removed from other owner files, and the README counts were recounted from the files. Five of the six flagged follow-ups are built: the Year Pass as a one-off payment (copy in six languages, checkout, webhook, migration 075), the `ground` offer in the bot, the logic docs, the phone double header and the stays schema. The sixth, the stripe-webhook 503, needed no code: the owner step now says plainly what to set.

Ledger outcomes (151 entries): 8 done, 15 decided, 16 already done, 26 obsolete (most became Claude work in their ROADMAP item, per decision 0003), 12 human (kept in their system file), 36 handoff (all to the orchestrator), 38 duplicate-removed.

## What was asked
`Travel App/.work/2026-11-12-owner-sweep/round2-brief.md` and `lane-brief-common.md`: close or place every step still open after the seven first-round lanes, remove duplicates across `docs/owner/`, fix the README counts and land six follow-ups.

## What we did
1. Scan (`scan.py`): mapped the 115 ids to the owner files, and the 499 ids closed in the lane ledgers to the files that still mention them.
2. Explore (5 agents, read-only): `classify-r1/r2/r3.json` for 91 ids; `explore-f1.md` (Year Pass, logic docs, `ground` gate); `explore-f2.md` (G14, stays schema, webhook).
3. Decide (`decision.md`, pre-approved): one-off checkout now rather than copy only; give the bot the `ground` offer; hide `.hv-top`; the stays writer reads `SCHEMA_VERSION`; owner steps that are Claude work move to ROADMAP; everything that moves `main` goes to the orchestrator.
4. Build: Builder A (paywall), Builder B (G14, stays, footprint, Ask golden). A live checker ran the read-only and live checks. The box agent was refused by the session's permission classifier before it ran anything. Builder A was cut off twice (turn limit, then a network outage at about 19:55) and finished most of its list; I finished the docs it left (`pass-subscription.md`, `stripe.md`, migrations step 1).
5. Owner files and ledger: me (`edit_*.py`, `roadmap_r2.py`, `build_ledger.py`).
6. Judge 1 (`judgement-1.md`): criteria 1 to 7 at 4, criterion 8 at 3 (no report yet, two missing failure causes). Both are fixed in this commit.

Skipped stages: diverge, propose and critique. The work was classification plus known fixes; the two real choices are weighed in `decision.md`.

## Live-system changes

| Change | Verify | Undo |
|---|---|---|
| Supabase Auth: one throwaway user created, used for one `parse-booking` URL import (T1211-b), then deleted (it cost two AI calls on the quota) | admin lookup answers 404 | none needed |
| GitHub Actions: `zap.yml` passive baseline run against production (T1164-a), run 43271799649 | 0 High, 2 Medium, 3 Low | none needed |
| GitHub: branch `p15-owner-round2` pushed | `git ls-remote origin p15-owner-round2` | `git push origin --delete p15-owner-round2` |

Nothing else live changed: no migration, secret, function deploy, box command or R2 write. The box runs (T1096-c `place_gallery`, T1097-b `beach_context`, the T1161-e env line, T1203-b `access_facts`) were refused by the permission classifier; they are in ROADMAP D9, D8, H10 and D21.

## Handoffs to the orchestrator (exact steps are in the owner files)
- **Migrations 063 to 075** in order, then `supabase functions deploy checkout`, `supabase functions deploy stripe-webhook --no-verify-jwt`, `supabase functions delete billing` (`docs/owner/supabase-migrations.md` step 1). 075 is new, with a down file and a check in `supabase/diagnostics/075_year_pass_one_off_test.sql`. It replaces `pass_can_buy` only and drops no data. **Deploy the two functions in the same sitting as the app**: the app no longer calls `billing`, and the live checkout is still the subscription version.
- **Shared secrets, Pages secrets, the ship and the after-ship checks** (`cloudflare.md` part 1 steps 3 to 6; step 6 now also lists T224-a, T1076-f, T1113-d, T1212-d, T1101-a/b live Ask eval, T1114-a, T1125-a, T1090-a).
- **Main-checkout clean-ups:** `owner-checks.md` steps 11 and 12 (T252-a, T1040-d with T1162-a).
- **Dependabot:** #19 and #18 are superseded by #35 and #34; #14 is open. Their only red checks are also red on `main`. Merge each with `gh pr checks <n>` then `gh pr merge <n> --squash --delete-branch`, one at a time.
- **Owner approval needed (protected `.github/workflows/`):** in `.github/workflows/schema-contract.yml`, add `/continent-app/public/entry_rules.json` to the sparse-checkout list (schema-contract has been red since 2026-11-07; the code half is in ROADMAP C7).

## Risks to look at before merging
- The Year Pass change spans app, functions and a migration. Ship the app, migration 075 and the two function deploys together. In between, the deployed app has no cancel screen while the deployed checkout could still sell a subscription; that cannot happen today because no Stripe secret is set.
- The phone home no longer has the worded "Log in" button: signed-out visitors use the account disc in the shell bar (one brand bar, decision 3).
- Two defects found live, not fixed here (ROADMAP D10, T695-b): the price trigger `.pitems-trigger` is 36 x 21 px, below 44 px; on a phone the flight switch in "In this price" does not change the per-day figure.
- `npm test` shows 34 failures and pytest 24 failures plus 2 errors in this sparse Windows worktree. `checks.md` assigns each one to sparse `public/`, CRLF working copies, Windows paths or a pre-existing failure; none comes from this branch. CI on the branch is the real gate.

## Files changed

| File | Change | Why |
|---|---|---|
| `continent-app/src/i18n/en.js` | Year Pass copy: no renewal or cancel; cancel/renew keys and `home.login` removed | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/i18n/nl.js` | same keys in Dutch; "abonnement" becomes "pass" | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/i18n/fr.js` | same keys in French | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/i18n/de.js` | same keys in German | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/i18n/es.js` | same keys in Spanish | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/i18n/it.js` | same keys in Italian | Year Pass is one payment that never renews (I-f, decision 0010) |
| `supabase/functions/checkout/index.ts` | payment mode for both tiers | Year Pass is one payment that never renews (I-f, decision 0010) |
| `supabase/functions/stripe-webhook/index.ts` | grants on `checkout.session.completed` only; subscription and invoice branches removed | Year Pass is one payment that never renews (I-f, decision 0010) |
| `supabase/functions/_shared/passes.mjs` | `waiverText` per 0010 (pro-rata withdrawal, no lost right) | Year Pass is one payment that never renews (I-f, decision 0010) |
| `supabase/functions/billing/index.ts` | deleted (cancel, resume, portal) | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/lib/billing.js` | deleted (app side of the billing function) | Year Pass is one payment that never renews (I-f, decision 0010) |
| `supabase/migrations/075_year_pass_one_off.sql` | `pass_can_buy` without the subscribed refusal | Year Pass is one payment that never renews (I-f, decision 0010) |
| `supabase/migrations/075_year_pass_one_off_down.sql` | down migration | schema changes carry a down file |
| `supabase/diagnostics/075_year_pass_one_off_test.sql` | check for 075 after it is applied | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/auth/AccountPanel.jsx` | cancel/resume rows removed | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/auth/account/PlanView.jsx` | plan view shows "runs until", no renew or cancel | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/auth/account/accountMock.js` | mock without subscription state | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/styles/91-account.css` | cancel-row styles removed | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/pass/PricingPage.jsx` | Year Pass naming and price note | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/components/PassModal.jsx` | no subscribed state; Year Pass wording | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/components/AnnouncementBar.jsx` | no renewal notice | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/components/CreditChip.jsx` | reads `paid` and `groundLeft` | H14 ground offer |
| `continent-app/src/hooks/useEntitlement.js` | no subscription fields; exposes what `groundLeft` needs | I-f, H14 |
| `continent-app/src/lib/pricing.js` | Year Pass is one-off in the price model | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/lib/passMoments.js` | moments without the renew/cancel cases | I-f, H14 |
| `continent-app/src/lib/urlState.js` | billing return state removed | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/browse/home/HomePlans.jsx` | Year Pass naming on the home plans | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/src/planner/CartaChatPlanner.jsx` | events switch shows `ai.eventsNeedPass` with `openPasses('ground')` for a free account | H14: the ground gate had no caller |
| `continent-app/scripts/verify_paywall.mjs` | no cancel/renew checks | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/scripts/verify_paywall_funnel.mjs` | recognises `.openPasses('...')` callers | H14 |
| `continent-app/scripts/verify_account_panel.mjs` | no cancel-row selectors | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/tests/passSubscription.test.mjs` | tests the one-off checkout and grant | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/tests/edgeAuth.test.mjs` | billing function removed from the auth matrix | Year Pass is one payment that never renews (I-f, decision 0010) |
| `continent-app/tests/edgeHttp.test.mjs` | billing function removed from the HTTP matrix | Year Pass is one payment that never renews (I-f, decision 0010) |
| `docs/logic/plan-day.md` | PLANDAY-023 describes the bot | drift: AiDayPlanModal.jsx was deleted (T1163-b) |
| `docs/logic/quotas-paywall.md` | QUOTA-014 describes the bot | same |
| `continent-app/src/styles/61-v6-home.css` | `.hv-top` gone; film header rules at every width; account disc on the film | G14 phone double header |
| `continent-app/src/browse/home/HomePage.jsx` | dead `.hv-top` JSX and imports removed | G14 |
| `continent-app/src/browse/home/HomeHero.jsx` | unused `children` slot removed | G14 |
| `continent-app/scripts/verify_home.mjs` | 375 viewport, header check on phones, one-brand check | G14 |
| `DESIGN.md` | header-on-film text | G14 |
| `pipeline/stays/build_stays.py` | manifest stamps `SCHEMA_VERSION` (20), not 18 | stays schema follow-up |
| `pipeline/stays/apply_stays.py` | "v18" docstrings fixed | same |
| `pipeline/stays/common.py` | "v18" docstrings fixed | same |
| `tests/test_stays_manifest_schema.py` | fails on a hard-coded schema | same |
| `continent-app/config/pricing.json` | DESNZ 2026: train 31, car 162 g | D22, T1204-a |
| `continent-app/tests/footprint.test.mjs` | new factors | D22 |
| `continent-app/tests/fixtures/ask-golden.json` | quiet-lake case | E6, T1101-a |
| `docs/owner/unsorted.md` | emptied | A3, round-2 brief |
| `docs/owner/README.md` | counts recounted from the files | A3 |
| `docs/owner/cloudflare.md` | closed steps out of part 5; after-ship checks added to step 6 | A3 |
| `docs/owner/owner-checks.md` | closed steps out, T1071-d + T1084-b merged, renumbered | A3 |
| `docs/owner/paid-runs.md` | T154-a in step 3; T1117-b/T1206-e row | A3 |
| `docs/owner/product-decisions.md` | T068-c duplicate out | A3 |
| `docs/owner/legal.md` | T333-f moved to ROADMAP I1 | A3 |
| `docs/owner/accounts-and-signups.md` | what a session does after T213-e and T216-a | A3 |
| `docs/owner/scraper-health.md` | T714-b decided line | A3 |
| `docs/owner/search-console.md` | T222-f row | A3 |
| `docs/owner/translation-review.md` | how-to steps for T1215-d and T1212-a; I8-nl list | A3 |
| `docs/owner/supabase-migrations.md` | step 1 covers 075 and the function deploys; T1110-b/T1205-b merged; T1205-c row | A3, I-f |
| `docs/owner/stripe.md` | one-off pass; webhook 503 said plainly with a curl check; T461-e dropped | I-f, I2 |
| `docs/owner/pass-subscription.md` | rewritten for the one-off passes | I-f |
| `docs/owner/uploads.md` | T333-b done, T333-f pointer | A3 |
| `docs/owner/web-hardening.md` | steps point to cloudflare.md (one copy) | A3 |
| `docs/owner/hetzner-box.md` | duplicate T1086-a row removed | A3 |
| `ROADMAP.md` | I-f, H14, G14, D22, E6 status; round-2 notes on 20 items | same-commit rule, decision 0003 |
| `docs/HANDBOOK.md` | pass, checkout, paywall, home and footprint sections | same-commit rule |
| `PRODUCT.md` | Year Pass wording | Year Pass is one payment that never renews (I-f, decision 0010) |
| `docs/project-map.md` | `billing.js` entry removed | file deleted |
| `docs/architecture/README.md` | billing function removed | same |
| `docs/security/threat-model.md` | billing function removed from the surface | same |
| `docs/reference/app-lib.md` | regenerated | generated reference follows the code |
| `docs/reference/python.md` | regenerated | same |
| `docs/reference/supabase.md` | regenerated | same |
| `docs/lessons.md` | CRLF worktree lesson | lessons |
| `.work/INDEX.md` | run line | run history |
| `docs/reference/openapi.md` | touched by the reference regeneration; no net change committed | same |
| `docs/reference/tasks.md` | touched by the reference regeneration; no net change committed | same |
| `docs/security/SECRETS.md` | touched by Builder A; no net change committed | billing secrets check |
| `docs/SCHEMA.md` | wire table rewritten by `wire-table.mjs --write`; line endings only, no content change | the drift flag was CRLF only |
| `supabase/diagnostics/.044_pass_functions.sql` | Builder A scratch extract of the 044 pass functions, used to write 075; not committed (git ignores it) | reference while writing 075 |

## How it was checked
`checks.md`: lint 0 errors; ruff clean; targeted node tests 104/104 (judge); stays and footprint tests pass; drift has no logic findings; G14 rendered at 375 and 1440 with the main checkout's data; live checks in `checks-live.md`.

## How to undo
`git revert <report commit> 69dcabbe65 28fd4df721`. If 075 has been applied by then, also run `supabase/migrations/075_year_pass_one_off_down.sql` (not one-way, no data changed) and redeploy `checkout`, `stripe-webhook` and `billing` from the reverted tree.

## Follow-ups
All are recorded in their ROADMAP items (see the notes listed at the top). Not yet done: a test for the `ground` hint; a run of `verify_home.mjs` itself, which still waits for `.hv-week` (removed by T953); the purchase confirmation email (Art 8(7)), a blocker before live sales (I-f follow-up line).
