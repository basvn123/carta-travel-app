# Run report: the toolkit for a professional Viantra logo

- **Status:** done
- **Date:** 2026-11-26
- **Level and playbook:** L2 · research (crew:deep-task)
- **Run folder:** `.work/2026-11-26-logo-toolkit/`

## Summary
The owner asked for in-depth, practitioner-backed research on the tools and context Claude Code needs to make a professional, trademark-ready logo for Viantra. The answer is in `docs/research/2026-11-26-viantra-logo-toolkit.md`: no tool does it alone; use Recraft's MCP for concepts, two skills for process and tests, a small local render toolchain (tested here), and a person for the vector and kerning finish. A third judge passed it at 64 of 80; nothing is committed.

## What was asked
A cited, ranked recommendation (MCPs, skills, CLI tools, fonts, briefing) with install commands, risks and evidence of what works and fails, including Reddit. Constraints: Windows; no image generator in the session; the name is Viantra with a known Viantro risk (decision 0018).

## What we did
1. Intake and plan: `brief.md`, `plan.md` (7-criterion rubric, 4 areas, 3 critic lenses).
2. Explore: 4 parallel explorers wrote `explore-generators.md`, `explore-skills.md`, `explore-practitioners.md`, `explore-pipeline-legal.md`.
3. Reddit: blocked for WebSearch, WebFetch and the built-in browser by policy; not worked around. Hacker News read directly through its Algolia API.
4. Critique: source quality, coverage and contradictions critics (`critique-*.md`); the orchestrator checked the installed image skills (they need an image tool the session lacks) and computed WCAG contrast for the umber.
5. Synthesise: wrote the research document.
6. Verify: judge 1 FAIL 54/80, judge 2 FAIL 61/80, judge 3 PASS 64/80; 33 claims checked at source across rounds. Built and ran the contact-sheet render script on `continent-app/public/favicon.svg`.

Skipped: Diverge and Propose (research playbook); Decide became the synthesis, so no owner checkpoint was needed before writing.

## Why
Every source that actually tested AI logos ended with a render step and a person deciding; the legal sources add that a logo merely picked from AI output is probably not protected by copyright in the EU (Munich, 2026-02-13). So the toolkit pairs a generator with a visible render loop, strict tests and a human finish, and keeps the name risk separate from the picture.

## Files changed

| File | Change | Why |
|---|---|---|
| `docs/research/2026-11-26-viantra-logo-toolkit.md` | New research document | The deliverable |
| `docs/lessons.md` | One lesson: research tool questions in depth from the start; Reddit is blocked, HN via Algolia | Owner correction ("do better, research, in depth") |
| `.work/INDEX.md` | Run line | Run history |
| `.work/2026-11-26-logo-toolkit/*` | Brief, plan, explore, critique, judgement, report files | Run record (only `report.md` is tracked) |

Earlier in the same session, before this run (same work, not committed): `docs/decisions/0018-name-viantra.md` (new), `docs/decisions/README.md` (index row), `ROADMAP.md` (K1 status), `docs/owner/accounts-and-signups.md` (steps T1060-c and T1060-d).

Outside the repo: `@resvg/resvg-js` 2.6.2 and `sheet.mjs` in the session scratchpad (`logo-lab`), not committed.

## How it fits together
The research feeds ROADMAP K1 and the next owner steps: connect Recraft, pick the skills, then the logo work itself, then `BRAND.md`, `DESIGN.md` and the carta-design skill. Decision 0018 holds the name and its risks.

## How it was checked
- `python -I scripts/docs/check_entry_points.py` → OK, 350 paths (after the decision and owner-step edits).
- `python -I scripts/docs/drift.py` → 0 drift.
- Render script → 972 x 2124 PNG from the current favicon, read by Claude and re-run by judge 2.
- Judge round 3 → PASS (`judgement-3.md`).

| Criterion | Score |
|---|---|
| Answers the question | 4 |
| Accurate and cited | 4 |
| Practitioner evidence | 4 |
| Complete | 4 |
| Current | 4 |
| Actionable | 4 |
| Honest about uncertainty | 4 |

## Open issues and risks
- Reddit evidence is second-hand only; the owner can paste threads.
- Recraft's real logo quality has no neutral test; its terms (changed 2026-08-24) and Ideogram's were not read in full.
- EUTMR text could not be fetched (EUR-Lex returned empty); the claim is worded cautiously.
- neonwatty's skill runs subagents with `bypassPermissions` and has an optional push-and-PR phase.
- Umber on the ink colour is 2.72:1 and fails 3:1: a dark version of the mark needs another colour.
- The brand.md repo has moved to `caiopizzol/brand.md` (judge 3 note), not updated in the doc.

## Next steps
- Owner: choose whether to connect Recraft (paid plan before keeping anything) and which skills to install.
- Owner: decide whether the umber and the blaze stay.
- Then the logo run itself (crew:design), with the context pack from the research document.

## Where to find things
- Brief and plan: `brief.md`, `plan.md`
- Evidence: `explore-*.md`, `critique-*.md`
- Verdicts: `judgement-1.md`, `judgement-2.md`, `judgement-3.md`
- Lasting decision on the name: `docs/decisions/0018-name-viantra.md`
