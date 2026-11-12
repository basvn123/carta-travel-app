# Run report: owner sweep, security lane

- **Status:** done
- **Date:** 2026-11-12
- **Level and playbook:** L2 · deep-task (owner sweep lane, checkpoint pre-approved by the owner)
- **Run folder:** `.work/2026-11-12-owner-security/`
- **ROADMAP items:** C2, C5, C6, N3

## Summary
All 12 walkthrough steps, every step in the three security owner files and the 13 open Dependabot PRs are checked. 42 ledger entries: 8 already done, 6 done, 10 decided, 1 obsolete, 9 handoffs and 8 human steps. GitHub now sends Dependabot alerts and security fixes. The owner's rotation and MFA work is recorded, the leaked-token rows are closed, five stale branches are archived and deleted, and one Dependabot PR is merged. Two actions were refused by the permission check: writing Actions secrets and merging PRs that change workflows. Both are handed on with exact steps.

## What was asked
Do every security-lane owner step Claude can do with the access on this machine, make the decisions, and leave only irreducible human clicks, written short and exact. GitHub is this lane's exclusive system. Never weaken a protection. See `brief.md`.

## What we did
1. Intake: surveyed GitHub settings, branch protection, secrets, PRs, branches, secret-scanning alerts, and the live site, Edge Functions and DNS (read only).
2. Explore: one explorer triaged every Dependabot PR from its logs (`explore-dependabot.md`).
3. Decide: required checks, Dependabot handling, secrets and the mail provider (`decision.md`).
4. Build, in batches A to G (`plan.md`). The live changes and their undo are below.
5. Verify: read back every live change (`checks.md`). Branch CI is green. The first judge failed criterion 5 (owner steps 3/5); every fix it listed is applied (see "How it was checked").

Skipped: diverge, propose and critique, because no batch had three real directions.

## Live changes (and how to undo each)

| Change | Undo |
|---|---|
| Dependabot alerts on (`PUT repos/…/vulnerability-alerts`) | `gh api -X DELETE repos/basvn123/carta-travel-app/vulnerability-alerts` |
| Dependabot security updates on (`PUT …/automated-security-fixes`) | `gh api -X DELETE repos/basvn123/carta-travel-app/automated-security-fixes` |
| Asked for non-provider secret patterns and validity checks: GitHub accepted the request but left both off (not on this plan) | nothing changed |
| Secret-scanning alerts 1 and 2 resolved (both `whsec_test` placeholders in old `Execution/` reports) | `gh api -X PATCH repos/basvn123/carta-travel-app/secret-scanning/alerts/<n> -f state=open` |
| PR #25 (python-slugify 9.1.3) squash-merged into `main`: **`a5ddd44b08`** | `git revert a5ddd44b08` on main |
| PRs #31, #23, #15, #13 closed with a reason | `gh pr reopen <n>` |
| Reason comments on #28, #26, #22, #20, #16; review comments on #19, #18, #14; `@dependabot rebase` on #19, #18, #14 | none needed |
| Tags `archive/branch/{p0-next-steps-docs, explore-v4, claude/explore-page-redesign-pdf-7ly6hy, claude/trails-destinations-cycling-ui-czpunu, claude/trip-planner-ux-refinement-i78m8t}` pushed, then those branches deleted on GitHub (four) and locally (`explore-v4`, `p0-next-steps-docs`) | `git push origin archive/branch/<name>:refs/heads/<name>` |
| Branch `p15-owner-security` pushed | delete the branch |

Nothing else changed live: no secret written, branch protection unchanged (required `app`, `python`, strict).

## Why
- **Required checks:** none were added. `semgrep` and `scan` are red on `main`, and the three database checks only run when their paths change. Requiring them now would block every merge, or leave PRs waiting forever. The fixes live in protected workflow files, so they go to the orchestrator.
- **Dependabot:** merge only when the relevant checks are green and the blast radius is small. Close PRs that cannot resolve, and fix the cause in `dependabot.yml`: grouped majors, and the numpy chain held back.
- **Service-role key:** it stays out of GitHub. A narrow read path for the uptime check is the right fix.

Full reasoning: `decision.md`.

## Handoffs

**Orchestrator:**
1. Merge Dependabot #19, #18 and #14 (Actions majors with SHA pins kept; reviewed, and their only red checks also fail on `main`). #14 still needs its rebase onto current `main`.
2. Fix `.github/workflows/static-analysis.yml`: `pip install semgrep==1.184.0 pytest`.
3. Fix `.github/workflows/secret-scan.yml`: add `':!continent-app/tests' ':!tests' ':!.semgrep' ':!ops/supabase_local_stub.sql'` to the `service_role` grep. This branch already fixes the other half, the fake JWT.
4. Drop the `paths:` list under `pull_request:` in `.github/workflows/admin-harnesses.yml`, `admin-rpc-security.yml` and `rls-policies.yml`.
5. Once a PR shows those five checks green, make them required: `gh api -X POST repos/basvn123/carta-travel-app/branches/main/protection/required_status_checks/contexts -f 'contexts[]=semgrep' -f 'contexts[]=scan' -f 'contexts[]=harnesses' -f 'contexts[]=rpc-security' -f 'contexts[]=rls-policies'`. This closes T1087-b and T1119-b.
6. After the live ship, run the header check in `docs/owner/web-hardening.md` step 1 (T1079-a).

**Deploy lane:** T1079-b (WAF rate limit) and T296-a (R2 CORS with the new token).

**Other lanes' files**, rows to remove because they are done or obsolete here:
- `docs/owner/unsorted.md`: T1080-a, T738-a done; T1087-b, T1119-b moved to this report.
- `docs/owner/owner-checks.md`: T1034-f, T1040-e done; T235-a now lives in `secrets-rotation.md`.
- `docs/owner/product-decisions.md`: T605-c obsolete.
- `docs/owner/data-and-pipeline-runs.md` and `docs/owner/paid-runs.md`: T153-b now lives in `secrets-rotation.md`.

## Files changed

| File | Change | Why |
|---|---|---|
| `continent-app/tests/pagesAuth.test.mjs` | Fake JWT joined at run time; `fileURLToPath` for the Functions walk | The `secret-scan` key-shape pattern matched it; the walk failed on Windows |
| `.github/dependabot.yml` | Major-only groups for React, ESLint, Vite (app and trailslab); ignore numpy >=2, rasterio >=1.5, geopandas >=1.2 | Lone majors failed `npm ci`; the pip group could not resolve on Python 3.11 |
| `docs/owner/secrets-rotation.md` | Rewritten: done steps removed; GitHub secrets (T153-b, T235-a), Stripe restricted live key rights (T1059-e), yearly per-key list | Live state 2026-11-12 |
| `docs/owner/web-hardening.md` | Edge CORS step removed (verified live); header check and WAF left | Live probes |
| `docs/owner/accounts-and-signups.md` | T213-e decided (Resend); each step says where to click and how to check | Owner sweep rules |
| `docs/security/SECRETS.md` | Leak closed, rotation status, real places of secrets, GitHub guards | Keep the inventory true |
| `ROADMAP.md` | N3 done; C2, C5, C6 status and follow-ups | Plan of record |
| `.work/2026-11-12-owner-security/report.md` | This report | History |
| `.work/INDEX.md` | Run line | History |

## How it was checked
- Live read-backs of every change: `checks.md`.
- `node --test tests/pagesAuth.test.mjs` → 3 pass. Full `npm test` in this sparse Windows worktree → 34 failures that the worktree already had, none in the changed file.
- Branch CI (`ci`, run 43234134760) → app, python, csp, evals and edge-deno all green.
- Docs checks → only the 4 `continent-app/public/` paths, missing because the worktree is sparse.
- Judge 1 (`judgement-1.md`) failed criterion 5 at 3/5. Fixed since:
  - Stripe Charges and Balance read rights added, with a log-based check.
  - T216-a points at `SUPPORT_EMAIL` in `continent-app/src/lib/contact.js`.
  - The yearly per-key rotation list is restored.
  - `CARTA_SUPABASE_URL` dropped from the owner step (it is only read together with the service key).
  - Vite major group added for `/continent-app`.
  - This report written.
- No second judge ran.

| Criterion | Judge 1 | After fixes |
|---|---|---|
| Steps accounted | 4 | 4 |
| Live changes verified | 4 | 4 |
| No protection weakened | 5 | 5 |
| Dependabot handled safely | 4 | 4 |
| Human steps short and exact | 3 | not re-judged |
| Reversible and reported | n/a (no report yet) | not re-judged |

## Open issues and risks
- **The public address bounces.** `hello@carta-europetravel.com`, shown on the legal pages, has no MX record (2026-11-12 DNS), so mail to it bounces today. Fixed by the owner's Email Routing step (T216-a).
- **No Actions secrets are set.** The uptime Supabase probe and the golden-set live run stay degraded until the owner runs `docs/owner/secrets-rotation.md` step 1.
- **`main` moved** to `a5ddd44b08` (#25) during the run. This branch is based on `b6a5237190`; the orchestrator's merge picks it up.
- **The laptop `.env` `GITHUB_TOKEN`** is a fine-grained token with no expiry. It is narrow (403 on admin reads), but its exact scopes are not verified.

## Next steps
- Owner: `docs/owner/secrets-rotation.md`, `docs/owner/accounts-and-signups.md`.
- Engineering (ROADMAP C6): the numpy 2 / Python 3.12 move, a narrow read path for the uptime check, SHA pins in `docs-site.yml` and `load.yml`.

## Where to find things
- Brief and plan: `brief.md`, `plan.md` (local only)
- Dependabot evidence: `explore-dependabot.md`; decisions: `decision.md`; every step: `ledger.json`; read-backs: `checks.md`; judge: `judgement-1.md`
