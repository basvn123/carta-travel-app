You are one of 50 Carta sessions run overnight by an orchestrator session. Work autonomously; nobody will answer questions tonight, so make sensible calls and write them down.

READ FIRST: CLAUDE.md, MAP.md, Execution/P15/_HANDOVER-2026-11-05.md, and your row (S{S}) in Execution/P15/_NEXT-50-SESSIONS.md. Follow CLAUDE.md, with these cloud overrides:
- You run in a Linux cloud container, not the owner's Windows laptop. Ignore the Windows worktree paths and `cmd /c` junction rules. You have one checkout; you may use subagents but keep it simple.
- Network: only package registries (npm, PyPI...) and api.cloudflare.com are reachable. Wikipedia, ERDDAP, ONS, Aviasales, Supabase, the build box are NOT. Whatever needs them, the owner's box or an owner key: build and test the code with fixtures or a dry run, then write the run as an owner step.
- Large pipeline inputs in `cache/` or the 140 MB master may be missing (LFS). If so, work from what exists and say so.
- Base: the branch you were checked out on (`claude/relaxed-dirac-l8enoy` = PR #10 plus earlier waves). Your task number is fixed: {T}. Do NOT take another number.
- Commit your work (messages start `{T}:`) on the branch you are on and push it (`git push -u origin HEAD`). Do NOT merge into, rebase onto or push to `main` or `claude/relaxed-dirac-l8enoy`; do NOT open a PR. The orchestrator merges your branch.
- Execution/_OPEN.md: append your rows only (at the end of the table), never reorder or edit others. ROADMAP.md: change only your item's Status line. HANDBOOK: only your feature's section.
- Never: the Claude API, em dashes, a deploy, a live migration, destructive edits to cache/, continent-app/public/ (except generated data your task owns) or tools/.
- Checks per CLAUDE.md: lint touched files, `npm test` in continent-app/ when app code changed, pytest for Python you touched, the fast build when you promise a number. Screenshots only in the gitignored shots folder.
- Done means: report `Execution/P15/{T}-{slug}.md` from `_TEMPLATE.md`, register rows in the same commit, HANDBOOK and ROADMAP status if behaviour changed, checks green.

OWNER STEPS (important): everything only the owner can do (a Dashboard step, a key, a migration paste, a box or laptop run, a network run, a decision, a look on a real phone) goes in (a) a register row with Owner `user`, and (b) a section at the end of your report, exactly titled `## Owner steps (for the checklist)`, one bullet each in this form:
`- [ID] Title | why (one sentence) | how (steps separated by ;) | where (file)`
Use your register row IDs ({T}-a, {T}-b...). The orchestrator copies this section to the owner's checklist.

If you hit a usage limit, simply continue when you can. If your task is fully gated, do the ungated half, write the rest as owner steps, and still finish with a report.

The last line of your final message must be: `DONE {T} branch=<your branch> owner_steps=<count>` (or `BLOCKED {T} <reason>`).

YOUR TASK
