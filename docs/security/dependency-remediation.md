# Dependency remediation time frames

How fast a vulnerable third-party component is fixed, and how often libraries are updated when nothing is wrong. Built by T1211 (row T1164-h, ROADMAP C10) on 2026-11-07. Covers ASVS 5.0.0 V15.1.1. The tooling is from T1080 and T1088 (ROADMAP C6); the inventory of components is the CycloneDX SBOM (V15.1.2, `supply-chain.yml`).

These windows are Carta's policy from this commit. The owner may change a number; change it here, and nowhere else.

## 1. Windows

The clock starts when a tool first reports the advisory (a Dependabot alert or PR, a red `supply-chain.yml` run, an OSV result), not when someone reads it. Severity is the advisory's CVSS rating as GitHub or OSV shows it.

| Severity | Shipped code (app bundle, Pages Functions, Workers, Edge Functions) | Not shipped (dev tools, tests, pipeline on the box, trails lab review tool) |
|---|---|---|
| Critical | **7 days**; a known exploited one (CISA KEV) within **48 hours**, or turn the feature off until it is fixed | 14 days |
| High | **30 days** | 60 days |
| Moderate | **90 days** | Next routine update |
| Low | Next routine update | Next routine update |

"Fixed" means the patched version is merged to `main` and, for shipped code, deployed. If no fix exists: record a register row with the advisory, why Carta is or is not reachable through it, and the mitigation (a pin, a removed feature, a WAF rule), and look again every 30 days.

**Routine updates.** Dependabot opens grouped minor and patch PRs every Monday. Merge them within **14 days** when CI is green. Major versions arrive one PR each and are planned as their own task within **90 days** of release, or the reason to wait is written in the register.

**Exceptions.** A window may be stretched only by a register row that names the advisory, the reason (no fix, breaking change, not reachable) and a new date. "Not reachable" needs the code path checked, not assumed.

## 2. What finds the advisories

| Tool | Covers | When | Fails the build on |
|---|---|---|---|
| Dependabot (`.github/dependabot.yml`) | npm `continent-app/` (app, Pages Functions, Workers), npm `tools/trailslab/review/`, pip `/` (root requirements), pip `infra/hetzner/jobs/`, GitHub Actions | Weekly, Monday | n/a (opens PRs and alerts) |
| `npm audit` (`supply-chain.yml`) | `continent-app` shipped dependencies | PRs touching a lockfile or requirements file; weekly, Monday 05:17 UTC | Critical |
| `npm audit` (`supply-chain.yml`) | `continent-app` whole tree, dev included; `tools/trailslab/review` | Same | High |
| `pip-audit` (`supply-chain.yml`) | `constraints.txt` | Same | Any advisory |
| `pip-audit` (`supply-chain.yml`) | `requirements-ml.txt` | Same | Report only (T1088-e) |
| OSV-Scanner (`supply-chain.yml`) | Both npm lockfiles, `requirements.txt` with `constraints.txt` | Same | Any advisory |
| `npm audit` (`mcp.yml`) | `services/mcp` shipped dependencies | Pushes and PRs touching `services/mcp/` | High |
| Ubuntu unattended upgrades | Build box OS packages | Daily; reboot window Sunday 04:00 (`infra/hetzner/cax11/cloud-init.yaml`, `carta-reboot.timer`) | n/a |
| The platforms | Supabase Postgres and Edge runtime, Cloudflare Workers runtime, Stripe | Provider managed | n/a |

The CI gates are stricter than the windows on purpose: a critical advisory blocks the next lockfile change at once, so the 7 day window is mostly the time to get a fix through review and deploy.

## 3. Not covered yet

Each of these has no advisory feed today, so the windows above cannot start a clock for them:

- **Edge Function imports.** `supabase/functions/` imports `npm:@supabase/supabase-js@2` and `npm:stripe@17` with major-only ranges and no lockfile or `deno.json`; no audit or Dependabot entry reads them, and a deploy can pick up a new minor version unseen.
- **`services/mcp`** is not in `dependabot.yml` (it is audited by `mcp.yml` only when its files change), and **`services/intelligence`** has neither Dependabot nor `pip-audit` (T1154-e).
- **Container base images** (`services/intelligence/Dockerfile`: `node:24-trixie-slim`, `python:3.13-slim-trixie`; the Valhalla image in `infra/hetzner/jobs/jobs.tsv`) are not scanned.
- **Register rows still open** from T1080: `constraints.txt` pins and dev-tree npm highs (T1080-b), `maplibre-gl` in the trails lab review tool (T1080-d). `supply-chain.yml` says T1088 cleared the baseline, so both rows may only need closing; if any advisory is still live, its window starts from this commit.
