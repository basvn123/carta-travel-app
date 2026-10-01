# T264: rewrite_intros.py and parking_check.py run on Gemini only

## Task ID

T264

## Date

2026-10-01

## What changed

Stage 4 of `Execution/_OPEN-MASTER.md`, item 10 (T041-g). Two manual dossier
scripts, `pipeline/dossier/rewrite_intros.py` and
`pipeline/dossier/parking_check.py`, each had a `Claude` provider on the
`anthropic` SDK, picked automatically whenever `ANTHROPIC_API_KEY` was set.
CLAUDE.md forbids the Claude API in this project. Both classes are gone, and
both scripts now always use their existing `Gemini` provider: the AI Studio
REST API, with Google Search grounding for the parking check. The
`--provider` flag stays, with `gemini` as its only choice, so a command that
already says `--provider gemini` keeps working, and `--provider claude` now
fails at argument parsing instead of reaching the API. No Python file in the
repository imports `anthropic` any more.

`docs/HANDOFF_LLM_RUNS.md`, the runbook for these two scripts, told its
reader to install `anthropic`, put an `ANTHROPIC_API_KEY=sk-ant-...` line in
`.env`, and expect `claude-sonnet-5` at Claude prices. Its provider-specific
parts now describe Gemini:

- `GEMINI_API_KEY` replaces the Anthropic key, and the preflight no longer
  checks for a package;
- the model chain the scripts actually use replaces `claude-sonnet-5`;
- the timing comes from the scripts' 6.5 second rate floor;
- the euro figures are removed, with a pointer to the token and search counts
  the scripts print and to row T041-c for Google's grounding price.

Removing the `sk-ant-` placeholder also takes one hit off the secret-scan
failure in T252-c. The rows for both scripts in `pipeline/README.md` and the
comment in `infra/hetzner/cax11/env.example` no longer say the scripts use
the Anthropic SDK.

Data already produced is untouched. Entries in
`cache/dossier/intros_llm.json` or `parking_web.json` whose `model` field
names a Claude model stay as they are; a later run re-does them only with
`--redo`.

## Files touched

**Modified:**
- pipeline/dossier/rewrite_intros.py
- pipeline/dossier/parking_check.py
- docs/HANDOFF_LLM_RUNS.md
- pipeline/README.md (the two scripts' rows)
- infra/hetzner/cax11/env.example (the ANTHROPIC_API_KEY comment)
- Execution/_OPEN.md (T041-g closed)

**Created:**
- Execution/P2/T264-remove-anthropic-provider.md

## Commands run

```
python -m py_compile pipeline/dossier/rewrite_intros.py pipeline/dossier/parking_check.py
python pipeline/dossier/rewrite_intros.py --provider claude   # invalid choice: 'claude' (choose from 'gemini')
python pipeline/dossier/parking_check.py --provider claude    # same
python pipeline/dossier/rewrite_intros.py --help              # --provider {gemini}
# both modules imported: no Claude attribute, Gemini present
grep -rni anthropic --include=*.py .                          # no import left; only comments naming the rule
```

Neither script was run against Gemini: that spends money and is the owner's
procedure in `docs/HANDOFF_LLM_RUNS.md`. The Gemini code path is unchanged
from what was there before.

## Config and secrets set

None. `ANTHROPIC_API_KEY`, if one is still in the laptop's repo-root `.env`,
is now read by nothing in the repository and can be deleted there.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Python files importing `anthropic` | 2 | 0 | -2 |

## What broke and how it was fixed

No issues.

## What is still open

None new. T252-c (the secret-scan job) stays open for its other hits.

## Rollback procedure

```
git revert <this task's commit>
```

Rolling back would bring a Claude API path back, which CLAUDE.md forbids, so
do it only to recover a bug in the Gemini path, then re-apply.
