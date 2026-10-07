"""Write the ready-to-paste session prompts into Part C of PARALLEL-WAVES-PLAN.md.

Reads every "## Wave N" table in Part B and, for each row, builds one prompt:
the session header (worktrees, rules, ports, migration number, the row's notes),
then the task body. Plan tasks get their mind-map prompt (via xmind_prompt.py,
renumbered to _ORDER.md); D-sessions (T265-T271) get the stage 9 template.
Everything between the PROMPTS:BEGIN and PROMPTS:END markers is replaced.

    python Execution/_queue/wave_prompts.py
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import task_model  # noqa: E402
import xmind_prompt  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "PARALLEL-WAVES-PLAN.md"
WT = r"C:\Users\Gebruiker\Documents\Portfolio\wt"
MAIN = r"C:\Users\Gebruiker\Documents\Portfolio\Travel App"
BEGIN, END = "<!-- PROMPTS:BEGIN -->", "<!-- PROMPTS:END -->"

MIGRATION = {"T265": "044", "T268": "045", "T274": "046", "T284": "047"}
D_GROUP = re.compile(r"\b(D\d)[a-z]?\b")


def parse_waves(text):
    part_b = text[text.index("# Part B."):text.index("# Part C.")]
    waves = []
    for m in re.finditer(r"^## Wave (\d+)\s*$(.*?)(?=^## |\Z)", part_b, re.M | re.S):
        rows = []
        for line in m.group(2).splitlines():
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) != 6 or not cells[0].isdigit():
                continue
            k, task, branch, app, folder, notes = cells
            rows.append({
                "k": int(k),
                "task_cell": task,
                # a register-row id such as T272-a names the source, not a task
                "tasks": re.findall(r"T\d{3}(?![-\d])", task.split(":")[0]),
                "branches": [b.strip() for b in re.split(r",\s*then\s+", branch)],
                "app": app.lower() == "yes",
                "folder": folder,
                "notes": notes.replace("**", ""),
            })
        if rows:
            waves.append((int(m.group(1)), rows))
    return waves


def plan_body(task_id, rows, topics):
    row, topic, score = xmind_prompt.find(task_id, rows, topics)
    if score < 0.85:
        raise SystemExit(f"{task_id}: no confident mind-map match ({topic['title']!r}, {score:.2f})")
    body = xmind_prompt.render(task_id, row, topic)
    # Keep the title lines and the map's own PROMPT section: the WHAT/WHY summary above it
    # repeats the PROMPT, and the per-task MODEL advice is superseded (the waves run on Fable).
    head, _, rest = body.partition("\n\n")
    m = re.search(r"^PROMPT\b.*$", rest, re.M)
    prompt = rest[m.end():] if m else rest
    return (no_dashes(head) + "\n\n" + no_dashes(prompt.strip())).strip()


def no_dashes(s):
    """The house rule bans em dashes; the mind map uses them as separators."""
    return s.replace(" — ", ": ").replace("—", ", ")


REG_ROW = re.compile(r"row ([A-Z0-9]+-[a-z])")
REG_ROWS = re.compile(r"rows ([A-Z0-9]+-[a-z](?:, [A-Z0-9]+-[a-z])+)")


def d_body(task_id, row):
    cell = row["task_cell"]
    title = cell.split(":", 1)[1].strip() if ":" in cell else cell
    regs = REG_ROWS.search(cell)
    if regs:
        # A task that closes several register rows (wave 6 onward): no mind-map node, no stage 9 group.
        ids = [r.strip() for r in regs.group(1).split(",")]
        listed = ", ".join(ids)
        return (
            f"# {task_id} · {title}\n"
            f"(register rows {listed}; no mind-map prompt exists for it)\n\n"
            f"WHAT  Read each of these rows in Execution/_OPEN.md: {listed}. For each, read the report of\n"
            f"the task that raised it (Execution/P*/<raiser>-*.md; W5-a was raised by the wave 5 merge, see\n"
            f"the Wave log in PARALLEL-WAVES-PLAN.md) in full, then do what the row asks, within the scope in\n"
            f"the notes above. Mark each row you resolve in Execution/_OPEN.md as Status \"closed by {task_id}\"\n"
            f"(never delete rows). If a row needs the owner or a later rollout stage, leave it open and say why.\n\n"
            f"DONE WHEN  Every listed row is closed, or left open with a written reason; the tests the source\n"
            f"reports name pass; every screen you touched was checked in the browser at 380px and desktop width.\n\n"
            f"REPORT  Execution/{row['folder']}/{task_id}-<short-slug>.md, following Execution/_TEMPLATE.md.\n"
            f"Write it plainly: short sentences, minimal markdown, before/after measurements where a number\n"
            f"moved, a rollback procedure, and what is still open."
        )
    reg = REG_ROW.search(cell)
    if reg:
        # A task born from one register row (T273 onward): no mind-map node, no stage 9 group.
        rid = reg.group(1)
        src = rid.split("-")[0]
        return (
            f"# {task_id} · {title}\n"
            f"(register row {rid}, raised by {src}; no mind-map prompt exists for it)\n\n"
            f"WHAT  Read row {rid} in Execution/_OPEN.md and the report of the task that raised it\n"
            f"(Execution/P*/{src}-*.md) in full, then do what the row asks, within the scope in the notes\n"
            f"above. Mark {rid} in Execution/_OPEN.md as Status \"closed by {task_id}\" (never delete rows).\n\n"
            f"DONE WHEN  Row {rid} is closed, or left open with a written reason; the tests the source\n"
            f"report names pass; every screen you touched was checked in the browser at 380px and\n"
            f"desktop width.\n\n"
            f"REPORT  Execution/{row['folder']}/{task_id}-<short-slug>.md, following Execution/_TEMPLATE.md.\n"
            f"Write it plainly: short sentences, minimal markdown, before/after measurements where a number\n"
            f"moved, a rollback procedure, and what is still open."
        )
    group = D_GROUP.search(cell)
    group = group.group(1) if group else "?"
    return (
        f"# {task_id} · {title}\n"
        f"(stage 9 group {group} of Execution/_OPEN-MASTER.md; no mind-map prompt exists for it)\n\n"
        f"WHAT  Read the {group} paragraph of Execution/_OPEN-MASTER.md stage 9, then every _OPEN.md row\n"
        f"listed in the notes above, then each row's source report under Execution/P*/. Fix each row.\n"
        f"If a row needs the owner or a later rollout stage, leave it open and say why in the report.\n"
        f"Mark each fixed row in Execution/_OPEN.md as Status \"closed by {task_id}\" (never delete rows).\n\n"
        f"DONE WHEN  Every listed row is closed or explicitly left open with a reason; the tests the\n"
        f"source reports name pass; every screen you touched was checked in the browser at 380px and\n"
        f"desktop width.\n\n"
        f"REPORT  Execution/{row['folder']}/{task_id}-<short-slug>.md, following Execution/_TEMPLATE.md.\n"
        f"Write it plainly: short sentences, minimal markdown, before/after measurements where a number\n"
        f"moved, a rollback procedure, and what is still open."
    )


def header(n, total, row):
    t1, b1 = row["tasks"][0], row["branches"][0]
    app_flag = " -App" if row["app"] else ""
    k = row["k"]
    mig = MIGRATION.get(t1, "none")
    lines = [
        f"Carta. Wave {n}, session {k} of {total}: {no_dashes(row['task_cell'].replace('**', ''))}.",
        "You are one of up to ten Claude sessions running in parallel on this machine.",
        "Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.",
        "",
        "WHERE TO WORK",
        f"Root worktree (sparse): {WT}\\{t1}    branch {b1}",
    ]
    if row["app"]:
        lines.append(f"App worktree (continent-app): {WT}\\{t1}-app    branch {b1}")
    lines += [
        "If the worktree does not exist yet, create it first, from the main checkout:",
        f"  cd \"{MAIN}\"; powershell -File Execution/_queue/wave_worktree.ps1 -Task {t1} -Branch {b1}{app_flag}",
        f"Read-only reference: the main checkout \"{MAIN}\" (additional docs\\, Claude outputs\\, data\\,",
        "cache\\, app_data\\ and anything the sparse worktree leaves out). Read there; never write, commit",
        "or switch branches there. The app repo's branch is master; the root repo's is main.",
        "Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'",
        "and so on) are in the main checkout under additional docs\\Carta\\Plan\\ and in",
        "additional docs\\Carta\\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).",
    ]
    if len(row["tasks"]) > 1:
        t2, b2 = row["tasks"][1], row["branches"][1]
        lines += [
            f"Two tasks, in order: finish {t1} on {b1} with its report and commits. Then, in each",
            f"worktree you used, run `git checkout -b {b2}` (it branches from {b1}) and do {t2} with its",
            "own report.",
        ]
    lines += [
        "",
        "RULES",
        "1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after",
        "   every commit and check that only in-scope files changed.",
        f"2. Your task number is {', '.join(row['tasks'])}. Branch, report and register rows use it.",
        "   Never pick another number.",
        f"3. Report in Execution/{row['folder']}/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one",
        "   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).",
        "4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,",
        "   continent-app/public/_headers, the \"ci\" script in continent-app/package.json, .gitignore,",
        "   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,",
        "   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package",
        "   dependency (node_modules is shared with the main checkout). The only exception is one your",
        "   notes below grant by name (\"EXCEPTION to rule 4\"), and then only as narrowly as they say.",
        "5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the",
        "   trailslab database (port 5433). Never commit generated continent-app/public/** output; the",
        "   public data folders in your app worktree are links to the main checkout, so treat them as",
        "   read-only.",
        f"6. New migration allowed: {mig}."
        + (" It needs a self-check raise notice like 032-043, and the report says where it goes in the"
           " owner's paste order." if mig != "none" else " Do not add one."),
        f"7. Ports: Vite dev/preview on {5200 + k}. A throwaway Postgres, if you need one, on {55440 + k}.",
        "   Never use 5432, 5433 or 55434.",
        "8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).",
        "   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner",
        "   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.",
        "   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a",
        "   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node",
        "   --input-type=module -e \"import('./src/i18n/'+'$l'+'.js')\"; done, run in the app worktree.",
        "9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,",
        "   and anything the orchestrator must know before merging.",
        "",
        "NOTES FOR THIS SESSION (these override the task text below where they disagree)",
        row["notes"],
    ]
    return "\n".join(lines)


def main():
    text = PLAN.read_text(encoding="utf-8")
    rows, topics = xmind_prompt.order_rows(), xmind_prompt.map_topics()
    notes = task_model.map_notes()
    out = []
    for n, wave in parse_waves(text):
        out.append(f"## Wave {n} prompts\n")
        for row in wave:
            bodies = []
            for t in row["tasks"]:
                if t in xmind_prompt_d_tasks():
                    bodies.append(d_body(t, row))
                else:
                    bodies.append(plan_body(t, rows, topics))
            prompt = header(n, len(wave), row) + "\n\nTHE TASK\n\n" + "\n\n---- next task ----\n\n".join(bodies)
            models = [task_model.model_for(t, rows, topics, notes) for t in row["tasks"]]
            label = " + ".join(f"{t} ({m})" for t, m in zip(row["tasks"], models))
            split = (f"\nModels differ, so run this row as two sessions: {row['tasks'][0]} on {models[0]} first "
                     f"(do only {row['tasks'][0]}), then {row['tasks'][1]} on {models[1]} in the same worktrees, "
                     f"branching {row['branches'][1]} from {row['branches'][0]}.\n"
                     if len(set(models)) > 1 else "")
            out.append(f"### Wave {n} · session {row['k']} · {label}\n{split}\n~~~~text\n{prompt}\n~~~~\n")
    block = BEGIN + "\n\n" + "\n".join(out) + "\n" + END
    start, end = text.index(BEGIN), text.index(END) + len(END)
    PLAN.write_text(text[:start] + block + text[end:], encoding="utf-8")
    print(f"wrote {sum(len(w) for _, w in parse_waves(text))} prompts for {len(parse_waves(text))} waves")


def xmind_prompt_d_tasks():
    # D-sessions and register-row tasks: the ones with a fixed model, none of them in _ORDER.md
    return set(task_model.D_MODELS)


if __name__ == "__main__":
    main()
