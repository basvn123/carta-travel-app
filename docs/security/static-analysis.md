# Static analysis (ROADMAP C7, T1119)

Semgrep runs on every pull request and on pushes to `main` (`.github/workflows/static-analysis.yml`).

## Why Semgrep, local rules only

ROADMAP research item C-R4 was never written, so the choice is made here. Semgrep fits a mixed JS, Python and SQL repo and runs in about 25 seconds with no build step and no GitHub Advanced Security needs. CodeQL would be stronger on data flow, but it cannot read SQL or our Deno Edge Functions well and needs a build for each language. The rules are all local (`.semgrep/carta.yml`) because the Semgrep registry is not reachable from every environment and a rule change should be a reviewed diff. Registry packs can be added later as a second `--config`. Semgrep is pinned (`semgrep==1.184.0`) and the actions are SHA-pinned like the other workflows.

## What the rules catch

Carta-specific: `service_role` in `continent-app/src`, any Claude API import or `api.anthropic.com` (CLAUDE.md rule), SECURITY DEFINER SQL without a pinned `search_path`, grants of write or all privileges to `anon`/`public`, `EXECUTE` of concatenated SQL.
General: `eval`/`new Function`, string timers, `innerHTML`/`insertAdjacentHTML`/`dangerouslySetInnerHTML` with non-literals, shell `exec`, disabled TLS verification, SQL from template strings or f-strings, `shell=True`, unsafe deserialisation, `requests` without a timeout, md5/sha1.

Not scanned (`.semgrepignore`): `node_modules`, builds, `cache/`, `public/`, `tools/`, generated `*.bundle.mjs`, `.claude/`, and the stale `Trips/` copy.

## The baseline

`.semgrep/baseline.json` lists today's findings as fingerprints (rule, path, hash of the matched source text, not the line number) with a count, plus a `triage` note per rule explaining why it is accepted. `scripts/ci/semgrep_gate.py` fails on any fingerprint that is missing or whose count went up, so moving code is free but a second copy of a baselined line is new.

When the gate fails on your PR: fix the finding. If it is a real false positive, say why in the PR, run `python scripts/ci/semgrep_gate.py --update-baseline`, and review the baseline diff. Never baseline a finding you have not read. When a finding is fixed, run the same command to shrink the baseline (the gate prints a note when entries are stale).

## Self-test

`tests/test_semgrep_gate.py` proves the gate: green on the repo with its baseline, red on a seeded `eval` and `service_role`, green again once baselined, red on a duplicate. It skips when semgrep is not installed, and the workflow runs it with semgrep installed.

## Triage of the first scan (29 findings, 0 high)

| Rule | Count | Verdict |
|---|---|---|
| carta-dom-inner-html | 11 | Noise: constant SVG strings and static markup; dynamic names pass `esc()` |
| carta-py-sql-fstring | 8 | Noise today: local DuckDB/SQLite on the build box, identifiers from our own schema; parameterised rewrite is a low-priority row (T1119-a) |
| carta-py-weak-hash | 9 | Noise: cache keys and dedupe ids |
| carta-js-exec-shell | 1 | Noise: fixed `npx esbuild` build command |

No finding was an exploitable issue. The report lists the open follow-ups.
