# Run report: owner sweep (orchestrator)

- **Status:** done (owner steps left are in `docs/owner/` and the walkthrough)
- **Date:** 2026-11-12
- **Level and playbook:** L2 · deep-task per lane, run by an orchestrator session
- **Run folder:** `.work/2026-11-12-owner-sweep/` (only this report is tracked)
- **ROADMAP items:** A3, C2, C4, C5, C6, C7, D3, D24, H5, H10, H14, G14, I-f, I8, I16
- **Lane reports:** `.work/2026-11-12-owner-{security,supabase,deploy,box,decisions,review,unsorted,round2}/report.md`

## Summary
The owner asked for every owner step in the walkthrough (792 steps on 2026-11-07, 98 ticked by the owner) to be checked and, where Claude can do it, done, with decisions made by Claude. Seven headless Claude Code lanes ran the deep-task playbook in parallel worktrees, then one round-2 session took what no lane closed. The orchestrator merged all eight branches, applied migrations 063 to 075, shipped the site live and republished the walkthrough. **171 owner steps in 54 sessions remain**, each needing a login, a payment, a signature, a native reader, a real phone or the owner's own choice to spend money.

## Outcomes
| | Steps |
|---|---|
| Checked by a lane (unique ids, round 1) | 814 |
| Closed in round 1 (done 41, decided 236, already done 88, obsolete 134) | 499 |
| Round 2 (151 entries): done 8, decided 15, already done 16, obsolete 26, duplicates removed 38, human 12, handed to the orchestrator 36 | |
| Left for the owner (walkthrough) | 171 |

## Live changes (all reversible unless marked)
| System | Change | Undo |
|---|---|---|
| Supabase Carta | Migrations 063 to 075 applied in order (the orchestrator) | each has a `_down.sql`; **069's retention job deletes old rows daily (one-way)**: tables it prunes were exported first to `db-backup-before-069/` (local, 333 rows) |
| Supabase Carta | All 10 Edge Functions deployed (supabase lane) | lane report |
| Cloudflare Pages | Production deploy of `main` `345a1421ed` plus later docs commits (ship steps build, css, data, preview, main) | redeploy the previous deployment in the Pages dashboard |
| R2 | data push phase 1; `data/status.json`; data bucket CORS for Range reads (deploy lane) | lane report |
| GitHub | Dependabot alerts and security fixes on; 2 false-positive secret alerts closed; PR #25 merged; 4 PRs closed; 535 merged local branches deleted (tagged `archive/branch/<name>`) | `git branch <name> archive/branch/<name>` |
| Box | `CARTA_STAYS_SCRAPE=1`, a takedown ledger row (box lane) | `env.bak-2026-11-12-owner-box` |
| Laptop | four dead scheduled tasks off (box lane); stale `continent-app/.git` archived to the run folder tar and deleted (owner approved) | untar it back |
| Workflows | semgrep installs pytest; secret scan skips non-shipping files; three DB checks run on every PR (owner approved, protected path) | `git revert a6c52d2cca` |

## Things that did not go as planned
- The session permission check refused production secret writes (shared Edge Function secrets, Pages secrets, GitHub Actions secrets) and a box agent. Each is an owner step with one command (`set_shared_secrets.py` for the four shared secrets).
- The prerender push: the laptop's R2 key gets 403 on `carta-prerender` (owner token change). Content pages still answer 404, as before.
- The ship's build refused the laptop's master (schema 19), then the box's master (schema 20 with `destinations.*.airports`, not in the wire contract). The ship kept the live schema-20 wire instead (supported `sync-data.mjs` path). Follow-up in ROADMAP D3.
- Two network outages cut lanes off; each was resumed. Disk ran out twice (the pagefile under seven sessions, then a 20 GB prerender output): worktrees and build outputs were removed as each lane merged.
- `schema-contract` CI still fails, as before the sweep (`entry_rules.json` reported missing in CI; one non-literal `.rpc` name in `price-alerts`).

## How it was checked
CI on `main` `345a1421ed`: ci, static-analysis (first green), secret-scan (first green), design-lint, docs-site, admin checks, rls-policies, ai-guard, ask-eval, rating-tests green; schema-contract red as before. Locally: docs drift 0, entry points OK, ruff clean, lint 0 errors, fast build ok; `npm test` 2011/2072 on Windows (the 57 failures are Windows/sparse noise; the Linux app job is green). Live: home 200, CSP/COOP/permissions-policy headers present, legal pages and `/nl/` 200, `/api/ask` answers, cron jobs listed.

## Undo
Revert the merge commits of the eight `p15-owner-*` branches and this run's commits (`git revert -m 1 <merge>`); database changes have per-migration `_down.sql` files except 069's deleted rows (export above).
