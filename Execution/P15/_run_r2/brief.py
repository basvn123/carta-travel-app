# brief.py <spec.json> -> writes one brief per row to scratchpad/briefs/<S>.txt
import json, sys, os
spec = json.load(open(sys.argv[1]))
out = os.path.join(os.path.dirname(sys.argv[1]), 'briefs'); os.makedirs(out, exist_ok=True)
batch = spec['batch']; rows = spec['rows']
for r in rows:
    others = '; '.join(f"S{o['s']} ({o['item']}, {o['owns']})" for o in rows if o is not r)
    t = f"""Task {r['task']} ({r['item']}), round 2 session S{r['s']}, batch {batch}. You run unattended; the round 2 orchestrator (another cloud session) merges your branch. Do not wait for the owner.

Setup: `git fetch origin && git checkout -b {r['branch']} origin/p15-round2`. Push only to `{r['branch']}` (`git push -u origin {r['branch']}`). Never push to `p15-round2`, `main` or any other branch, never merge, never deploy, never apply a migration live.

Read first: CLAUDE.md (whole), MAP.md, the S{r['s']} row in `Execution/P15/_SESSIONS-ROUND-2.md` (and its "Order and dependencies" and the rules it points to in `Execution/P15/_NEXT-50-SESSIONS.md`, "Rules for running many sessions"), the {r['item']} row in ROADMAP.md, and the reports this builds on: {r['reads']}. Grep `Execution/_OPEN.md` for this item's open rows.

Scope: {r['scope']}

Files you may touch: {r['files']}. Plus your report, appended rows in `Execution/_OPEN.md`, the {r['item']} status in ROADMAP.md, and the HANDBOOK section of the feature if its behaviour changes. Anything else becomes a register row, not an edit.
Running beside you in this batch (do not touch their files): {others}.

Gate: {r['gate']}

Done when: {r['done']}

Rules: research subagent first for any choice of tool, library, model, service, data source or method (record the comparison in the report). Never use the Claude API or Anthropic SDKs (runtime AI stays on Gemini via the gateway, `aiModels` / `ai_gateway.py`). No em or en dashes in any text you write. The cloud container cannot reach the owner's box, Supabase, Wikipedia and most hosts outside package registries: do the code half, test on fixtures, and leave the run as an owner step. Checks before each commit: `cd continent-app && npm test` when you touch app code or its scripts, eslint on touched files, `node scripts/ci/design-lint.mjs` (0 new) for anything a traveller sees, pytest for touched Python, `python -I scripts/docs/check_entry_points.py` if you touch CLAUDE.md or MAP.md. Every number the task implies gets a before and an after.

Report: `Execution/P15/{r['task']}-{r['slug']}.md` from `Execution/_TEMPLATE.md`, naming ROADMAP item {r['item']}. Register rows `{r['task']}-a`, `{r['task']}-b` and so on, appended at the end of `Execution/_OPEN.md` only (never reorder or rewrite other rows). If the owner must do something, add a section `## Owner steps (for the checklist)` with one line per step in exactly this shape:
`- [{r['task']}-x] Short title | why it matters | step one; step two; step three | file or doc where it lives`
Commit task work with messages starting `{r['task']}:`, push to `{r['branch']}`, and stop. Your last message: one line with what was done, the report path, and the owner steps count.
"""
    open(os.path.join(out, f"S{r['s']}.md"), 'w').write(t)
    print(f"S{r['s']}", len(t))
