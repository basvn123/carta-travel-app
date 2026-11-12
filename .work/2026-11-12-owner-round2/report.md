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
| `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` | Year Pass copy: no renewal, no cancel; 15+ cancel/renew keys and `home.login` removed | I-f, decision 0010 |
| `supabase/functions/checkout/index.ts`, `stripe-webhook/index.ts`, `_shared/passes.mjs`; `supabase/functions/billing/` and `src/lib/billing.js` deleted | payment mode for both tiers; webhook grants on `checkout.session.completed` only; waiver text per 0010 | I-f, I2 |
| `supabase/migrations/075_year_pass_one_off{,_down}.sql`, `supabase/diagnostics/075_year_pass_one_off_test.sql` | `pass_can_buy` without the subscribed refusal | I-f |
| `continent-app/src/auth/*`, `pass/PricingPage.jsx`, `components/{PassModal,CreditChip,AnnouncementBar}.jsx`, `hooks/useEntitlement.js`, `lib/{pricing,passMoments,urlState}.js`, `styles/91-account.css`, tests and `verify_paywall*.mjs` | cancel/resume UI gone, Year Pass naming; `groundLeft` | I-f, H14 |
| `continent-app/src/planner/CartaChatPlanner.jsx` | events switch shows `ai.eventsNeedPass` with `openPasses('ground')` for a free account | H14 |
| `docs/logic/plan-day.md`, `docs/logic/quotas-paywall.md` | PLANDAY-023, QUOTA-014 describe the bot | drift |
| `continent-app/src/styles/61-v6-home.css`, `browse/home/HomePage.jsx`, `HomeHero.jsx`, `scripts/verify_home.mjs`, `DESIGN.md` | one brand bar at every width; check at 375 | G14 |
| `pipeline/stays/{build_stays,apply_stays,common}.py`, `tests/test_stays_manifest_schema.py` | manifest stamps `SCHEMA_VERSION` | stays schema |
| `continent-app/config/pricing.json`, `tests/footprint.test.mjs` | DESNZ 2026 train 31, car 162 | D22, T1204-a |
| `continent-app/tests/fixtures/ask-golden.json` | quiet-lake case | E6, T1101-a |
| `docs/owner/*.md` (16 files) | closed steps out, `unsorted.md` emptied, new rows T222-f, T1205-c, T1117-b; one-off pass docs; webhook 503 plain; README recount | A3 |
| `ROADMAP.md`, `docs/HANDBOOK.md`, `PRODUCT.md`, `docs/project-map.md`, `docs/architecture/README.md`, `docs/security/threat-model.md`, `docs/reference/*.md` | status and notes, same-commit rule | above |
| `docs/lessons.md` | CRLF worktree lesson | lessons |

## How it was checked
`checks.md`: lint 0 errors; ruff clean; targeted node tests 104/104 (judge); stays and footprint tests pass; drift has no logic findings; G14 rendered at 375 and 1440 with the main checkout's data; live checks in `checks-live.md`.

## How to undo
`git revert <report commit> 69dcabbe65 28fd4df721`. If 075 has been applied by then, also run `supabase/migrations/075_year_pass_one_off_down.sql` (not one-way, no data changed) and redeploy `checkout`, `stripe-webhook` and `billing` from the reverted tree.

## Follow-ups
All are recorded in their ROADMAP items (see the notes listed at the top). Not yet done: a test for the `ground` hint; a run of `verify_home.mjs` itself, which still waits for `.hv-week` (removed by T953); the purchase confirmation email (Art 8(7)), a blocker before live sales (I-f follow-up line).
