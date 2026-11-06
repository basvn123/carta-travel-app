# T1080: Supply chain (ROADMAP C6)

## Date

2026-11-05

## What changed

All 31 workflow action uses are now pinned to full commit SHAs with the tag in a trailing comment (4 were before), and the 10 workflows without a `permissions` block now declare `contents: read`. A new `supply-chain.yml` audits dependencies on lockfile and requirements pull requests, every Monday and on demand: `npm audit --omit=dev --audit-level=critical` fails on a critical (green today: 0 shipped vulnerabilities), while `pip-audit` and OSV-Scanner report only, because a hard gate would be red on day one. `.github/dependabot.yml` opens weekly grouped minor and patch PRs for npm, pip and github-actions. `scripts/ci/sbom.sh` builds CycloneDX SBOMs (npm via npx, Python via cyclonedx-py, CI only, no new dependency) and the workflow uploads them as an artifact on tags, releases and manual runs. Dependabot was chosen over Renovate because it needs no app install. No application code or dependency was changed.

## Files touched

- Added: `.github/workflows/supply-chain.yml`, `.github/dependabot.yml`, `scripts/ci/sbom.sh`, this report.
- Modified: the 12 other workflows in `.github/workflows/` (SHA pins; `permissions: contents: read` added to `admin-rpc-security`, `coverage-contract`, `data-licences`, `design-lint`, `golden-set`, `rating-tests`, `rls-policies`, `schema-contract`, `secret-scan`, `trip-validator`), `docs/HANDBOOK.md` (CI and checks), `docs/security/threat-model.md` (gaps closed).

## Commands run

- `gh api repos/<action>/commits/<tag>` to resolve SHAs (upload-artifact v4.6.2 `ea165f8d`, osv-scanner-action v2.7.0 `b1d267ae`; checkout, setup-node and setup-python reuse the SHAs already in `ci.yml`).
- `npm audit --omit=dev --json` in `continent-app` and `tools/trailslab/review`; `pip-audit -r constraints.txt --no-deps --disable-pip` (pip-audit 2.10.1 in a temp venv).
- `npx @cyclonedx/cyclonedx-npm@4.0.2` and `cyclonedx_py requirements` (cyclonedx-bom 8.0.1) run locally: 71 npm and 72 Python components.
- YAML load of every workflow and `dependabot.yml`; `python -I scripts/docs/check_entry_points.py`.

## Config and secrets set

None. Owner steps (GitHub settings) are in "What is still open".

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Action uses pinned to a full SHA | 4 of 31 (tags: checkout@v4 x13, setup-python@v5 x7, setup-node@v4 x5, upload-artifact@v4 x2) | 31 of 31 (plus 6 in the new workflow) | +27 |
| Workflows with explicit `permissions` | 3 of 13 | 13 of 13 | +10 |
| `npm audit --omit=dev`, `continent-app` | not run in CI | 0 vulnerabilities (gate: critical) | gate added |
| `npm audit` whole tree, `continent-app` | not run | 9 (1 moderate, 8 high, 0 critical), dev only | report only |
| `npm audit --omit=dev`, `tools/trailslab/review` | not run | 1 critical: maplibre-gl, GHSA-jrc7-96c5-q579, fix is a major bump to 6.16.0 | report only |
| `pip-audit constraints.txt` | not run | 12 of 72 packages with advisories (anyio, bleach, certifi, geopandas, idna, jupyter-core, lxml, protobuf, python-dotenv, requests, soupsieve, urllib3); all have fixes except one bleach advisory | report only |
| Lockfile enforced | `npm ci` in `ci.yml` and `secret-scan.yml` | unchanged; SBOM reads the lockfile | none |
| Dependabot, SBOM | none | configured | added |

pip-audit cannot read `requirements.txt` (floors with `>=`, not exact), so it audits `constraints.txt`, the exact pins the pipeline runs. It has no severity filter, so the step is report-only; the reason is written on the step.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `pip-audit -r requirements.txt` errors out | Floor pins are not exact versions | Audit `constraints.txt` instead |
| `cyclonedx-bom==7.2.1` does not exist | Guessed version | Pinned 8.0.1, the version installed and tested |
| The workflows were not run on GitHub | No push allowed in this task | First run happens on the owner's push; OSV args and the action input format are unverified in CI (T1080-c) |

## Screens checked

None (CI configuration only).

## What is still open

- Enable Dependabot alerts and security updates, and set the repository Actions default token to read, in GitHub settings (owner only).
- pip-audit and OSV are report-only until the 12 vulnerable Python pins and the dev-tree npm findings are bumped.
- `tools/trailslab/review` has a critical maplibre-gl advisory whose fix is a major bump.
- First CI run of `supply-chain.yml` has not happened.

Register rows to add:

| T1080-a | T1080 | Enable Dependabot alerts and security updates, and set the Actions default token to read-only, in GitHub repository settings. | user | open |  |
| T1080-b | T1080 | Bump the 12 Python pins in constraints.txt that pip-audit flags (requests, urllib3, lxml, certifi and others) and clear the dev-tree npm highs, then make pip-audit and OSV-Scanner fail the build. | next task | open |  |
| T1080-c | T1080 | Watch the first run of supply-chain.yml on GitHub and fix the OSV-Scanner lockfile arguments or the SBOM step if they fail there (not runnable locally). | next task | open |  |
| T1080-d | T1080 | tools/trailslab/review pins maplibre-gl with a critical XSS advisory (GHSA-jrc7-96c5-q579); the fix is the major bump to 6.16.0, to take with the app's maplibre task. | next task | open |  |

## Rollback procedure

`git revert` the T1080 commits. Nothing is deployed and no data changed.
