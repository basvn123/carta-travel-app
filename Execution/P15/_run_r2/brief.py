# brief.py <spec.json> -> writes one brief per row to scratchpad/briefs/<S>.txt
import json, sys, os
spec = json.load(open(sys.argv[1]))
out = os.path.join(os.path.dirname(sys.argv[1]), 'briefs'); os.makedirs(out, exist_ok=True)
batch = spec['batch']; rows = spec['rows']; rnd = spec.get('round', 2); integ = spec.get('integration', 'p15-round2')
for r in rows:
    others = '; '.join(f"S{o['s']} ({o['item']}, {o['owns']})" for o in rows if o is not r)
    t = f"""Task {r['task']} ({r['item']}), round {rnd} session S{r['s']}, batch {batch}. You run unattended; the round {rnd} orchestrator (another cloud session) merges your branch. Do not wait for the owner.

Setup: `git fetch origin && git checkout -b {r['branch']} origin/{integ}`. Push only to `{r['branch']}` (`git push -u origin {r['branch']}`). Never push to `{integ}`, `main` or any other branch, never merge, never deploy, never apply a migration live.

Read first: CLAUDE.md (whole), MAP.md, the S{r['s']} row in `Execution/P15/_SESSIONS-ROUND-{rnd}.md` (and its "Order and dependencies" and the rules it points to in `Execution/P15/_NEXT-50-SESSIONS.md`, "Rules for running many sessions"), the {r['item']} row in ROADMAP.md, and the reports this builds on: {r['reads']}. Grep `Execution/_OPEN.md` for this item's open rows.

Scope: {r['scope']}

Files you may touch: {r['files']}. Plus your report, appended rows in `Execution/_OPEN.md`, the {r['item']} status in ROADMAP.md, and the HANDBOOK section of the feature if its behaviour changes. Anything else becomes a register row, not an edit.
Running beside you in this batch (do not touch their files): {others}.

Gate: {r['gate']}
{r.get('extra','')}

Done when: {r['done']}

Rules: research subagent first for any choice of tool, library, model, service, data source or method (record the comparison in the report). Never use the Claude API or Anthropic SDKs (runtime AI stays on Gemini via the gateway, `aiModels` / `ai_gateway.py`). No em or en dashes in any text you write. The cloud container cannot reach the owner's box, Supabase, Wikipedia and most hosts outside package registries: do the code half, test on fixtures, and leave the run as an owner step. Checks before each commit: `cd continent-app && npm test` when you touch app code or its scripts, eslint on touched files, `node scripts/ci/design-lint.mjs` (0 new) for anything a traveller sees, pytest for touched Python, `python -I scripts/docs/check_entry_points.py` if you touch CLAUDE.md or MAP.md. Every number the task implies gets a before and an after.

Lessons from round 2 (bind every session): commit and push early and often, so work survives a usage limit (the orchestrator sends a continue message after a limit). Before your last push run what CI runs: `cd continent-app && npm test` and `npm run lint`; the full pytest (`python -m pytest tests -q` minus `tests/quarantine.txt`); ruff 0.14.3 if you touch Python; for anything a traveller sees, `node scripts/ci/design-lint.mjs`, the fast build and `CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/verify_csp.mjs --dist ../.fastbuild`; `python -I scripts/docs/build_reference.py --check`, `build_lineage.py --check`, `config_reference.py --check` and `drift.py` when you add a task, config key, wire field or move code. New i18n keys go into all six language files (a parity test fails otherwise). Every model prompt lives in the prompt registry (`prompts/`, `node scripts/prompts/registry.mjs`), never as a string in code. In `run_pipeline.py` add tasks before `photo_sources` and `trailslab_worker`, which stay last. A validation layer adds only its own line to the runner's LAYERS. Never edit a test only to make it pass; fix the cause or record why the test is wrong.

Report: `Execution/P15/{r['task']}-{r['slug']}.md` from `Execution/_TEMPLATE.md`, naming ROADMAP item {r['item']}. Register rows `{r['task']}-a`, `{r['task']}-b` and so on, appended at the end of `Execution/_OPEN.md` only (never reorder or rewrite other rows). If the owner must do something, add a section `## Owner steps (for the checklist)` with one line per step in exactly this shape:
`- [{r['task']}-x] Short title | why it matters | step one; step two; step three | file or doc where it lives`
Commit task work with messages starting `{r['task']}:`, push to `{r['branch']}`, and stop. Your last message: one line with what was done, the report path, and the owner steps count.
"""
    open(os.path.join(out, f"S{r['s']}.md"), 'w').write(t)
    print(f"S{r['s']}", len(t))
