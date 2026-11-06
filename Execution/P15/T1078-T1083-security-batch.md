# T1078 to T1083: security batch

## Date

2026-11-05

## Shared header

The owner asked for the work Claude could do without waiting on them: the security items C4, C5 and C6, two cleanups and more register triage.
- Six tasks ran as five subagents in worktrees, from the PR #9 head (`35f1de0ab0`). The batch is therefore stacked on PR #9.
- Three subagents stopped once on a network error (ENOTFOUND) and resumed from their own transcripts. No work was lost.
- The five branches merged into `p15-p2-security`. Two clashes, both in `docs/security/threat-model.md`, were resolved by keeping both tasks' text.
- Each task has its own report beside this file.

| Task | Item | Report | Outcome |
|---|---|---|---|
| T1078 | C4, rows T1070-c and T1070-d | `T1078-rls-coverage.md` | All 34 policy tables have an isolation fixture (was 17). Migration 063: signed-out reads return zero rows, no error. `check-bundle-secrets.mjs` decodes every JWT in the build and fails on any role but anon. |
| T1079 | C5 | `T1079-web-hardening.md` | Headers: Permissions-Policy 13 features, COOP added, unused websocket host removed. Pages Functions: validation and limits on 4 of 4. Edge Functions: origin-locked CORS and body caps on 6 of 6 (were open to any site). |
| T1080 | C6 | `T1080-supply-chain.md` | Actions pinned 31 of 31 (was 4). Added `supply-chain.yml`, Dependabot and SBOMs on release. |
| T1081 | rows T1071-b and T1070-b | `T1081-admin-reasons.md` | Migration 064: admin ban, delete and set tier require a reason. The admin screen asks for it. `SECRETS.md` lists the upload scan secrets. |
| T1082 | rows T1074-b and T1070-e | `T1082-cleanup.md` | Dead live-stays code removed. The two admin harnesses get past 056. The 060 down migration tolerates no pg_cron. |
| T1083 | row T1072-a | `T1083-register-triage.md` | 42 more rows moved with evidence (1,450 to 1,408). Under 250 needs owner or ROADMAP decisions. |

## Checks on the merged branch

| Check | Before (PR #9 head) | After |
|---|---|---|
| `npm test` | 1,266 pass | 1,285 pass, 0 fail (12 skipped in the worktree for the untracked `boot.json`) |
| Lint | 0 errors, 163 warnings | 0 errors, 163 warnings |
| Design lint | 7,721, 0 new | 7,719, 0 new |
| Contract gate | pass | pass |
| Fast build plus bundle key check | not run | pass: 175 files, 0 JWT-shaped strings |
| Entry points, ruff, workflow YAML | pass | pass; every pinned action SHA confirmed to exist on GitHub |
| rls-policies (local Postgres, T1078) | 501 of 501 | 737 of 737 |
| admin-rpc-security (local Postgres, T1081) | 242 of 242 | 261 of 261 |

## End check

- **Production build, served locally and loaded headless at 375 and 1440:**
  - The destination page renders with no console errors, with "Local transport, Not yet measured" on the price card.
  - The trips list showed no prices on the local test origin, because the data host refuses that origin (CORS). This is not a regression.
- **Not checkable before a deploy:** the headers and CSP, the Pages Functions, the Edge Functions' CORS and caps, and the admin reason fields (they need a signed-in admin and migration 064). These are T1079-b, T1081-a and the admin screen check in T1071-d.
- **The browser pane hung.** A dev server started outside this session (port 5173, 22:44) began serving stale dependency files after this session's own dev server rewrote the shared Vite cache. The owner's server was not stopped; a restart of it clears this.

## Decisions for the owner

1. **Migration 064 and the app deploy go together (T1081-a).** Until both are live, ban, delete and set tier return an error and change nothing.
2. **The register target (T1083).** Getting under 250 rows needs one of these:
   - one row per owner procedure file instead of one row per item;
   - new ROADMAP text that re-plans the roughly 330 UI follow-ups;
   - the box data runs.

   A task that refreshes or retires the stale `verify_*.mjs` scripts would close about 45 rows without a decision.

## Register

- Closed: T1070-c and T1070-d (by T1078), T1071-b and T1070-b (by T1081), T1074-b and T1070-e (by T1082).
- Opened: 16 rows: T1078-a to c, T1079-a to g, T1080-a to d, T1081-a, T1082-a. T1083-a was added by T1083 itself.
- ROADMAP:
  - C4 in progress (063 to apply).
  - C5 in progress (deploy and WAF).
  - C6 done (pip-audit and OSV become gates after T1080-b).

## Rollback procedure

- Revert the merge commit of a task's branch, or the task's own commits.
- Migrations 063 and 064 are not applied anywhere live. Each has a `_down` file, tested down and up.
