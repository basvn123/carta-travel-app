# T369: the impeccable skill and the design waves V1 to V6

## Task ID

T369

## Date

2026-10-07

## What changed

The owner asked for an overnight design pass over every page, button and visual setting of the app, led by the impeccable skill, keeping the colour scheme and styling but making Carta more modern, visual, professional and dynamic, with how travellers plan a trip as the first priority, and a deploy at the end. This task adds the tools and the plan for that pass. It changes no app code.

The impeccable skill (v4.3.1, the copy in riga-hackathon/.agents/skills/impeccable) now sits beside carta-design in .claude/skills/impeccable. The riga-autopilot-demo copy is the same skill without the Windows engine binary, so the hackathon copy was the one to take. The 14.7 MB binary stays out of git: .gitignore drops scripts/bin/, and the binary was copied once to %USERPROFILE%\.impeccable\bin\0.1.5\impeccable.exe, which is where the launcher looks for engine version 0.1.5 (scripts/VERSION). .gitattributes keeps the sh launcher on LF, because a CRLF checkout breaks it under Git Bash. `impeccable context` was run against this repo and reads PRODUCT.md and DESIGN.md as they are; `impeccable detect --json` runs on app files.

docs/design-v6/TRIP-PLANNING-RESEARCH.md is new: desk research on how people plan leisure trips, what they rank first, which planning patterns work in comparable products, how budget travellers judge a price, and phone against desktop, with a section of implications per Carta surface. Every figure in it carries the link it came from. A research subagent wrote it in this session; it read PRODUCT.md and four plan documents under additional docs/Carta/Plan first, so it adds evidence rather than repeating them.

The six design waves live in a new module, Execution/_queue/design_waves.py, which waves_md.py imports, so `python Execution/_queue/waves_md.py` writes them into Execution/_WAVES.md between wave 16c and the gated wave 17. They are named V1 to V6, not D1 to D6, because D4 and D5b already name stage 9 work in this plan. The shape:

| Wave | Sessions | Tasks | What |
|---|---|---|---|
| V1 | 10, opus, docs only | T370 to T379 | One brief per surface: inventory of every control, impeccable critique and audit, the traveller's job, a shape plan for V3, V4 and V5, and proposals that need a rule |
| V2 | 1, fable | T380 | The direction, accept or reject every proposed rule into carta-design and DESIGN.md, motion tokens, ten v6 stylesheets, the file ownership map |
| V3 | 10, opus | T381 to T390 | Structure, information and flow per surface |
| V4 | 10, opus | T391 to T400 | Visual and dynamic per surface |
| V5 | 10, sonnet | T401 to T410 | Harden, adapt and polish per surface, harnesses updated |
| V6 | 1 row, opus then sonnet | T411, T412 | One traveller, one trip: the consistency pass; then the release, the before and after gallery and the preview deploy |

The ten surfaces are the shell and shared components, the landing page and first run, Explore, Destinations browse, the town page, the outdoor detail pages, curated trips, the trip planner, the day planner, and My trips with account, sharing, passes, guides and admin.

Four choices carry the design of the waves. First, parallel sessions never edit the same stylesheet: T380 creates one v6 file per surface, imported after every existing file, and docs/design-v6/OWNERSHIP.md gives each source file to exactly one surface, so ten sessions can work at once and still merge (wave 13 lost time to append conflicts in one shared stylesheet). Second, carta-design stays the authority: every prompt says it wins over impeccable, the research and taste, and a pattern it does not cover is built only after T380 writes the rule. Third, the run is unattended: impeccable normally probes the user with a decision page, so every prompt states that the owner told the sessions to proceed, which is the case its AUTONOMY_DIRECTIVE_CHECK allows, and bans the decision page and live mode. Fourth, planning mode: each session runs impeccable's planning command and commits the plan (the brief in V1, docs/design-v6/plans/<wave>-<surface>.md later) before its first edit, and uses the harness's plan mode where one exists without waiting for approval.

The deploy is a preview, by the owner's answer in this session: after V3, V4 and V5 merge, the orchestrator deploys the merged state to https://design.carta-app.pages.dev (`wrangler pages deploy --branch design`), and T412 repeats it after its checks. Production stays the owner's step through block C of the runbook; `PRODUCTION_DEPLOY` in design_waves.py is the switch if that changes. Screenshots go to C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots, outside both repos, so 40 sessions of JPEGs never enter git.

waves_md.py dropped the hand-written wave log at every run (it rewrote the log from scratch with the waves 1 to 5 line only). It now keeps every log line already in _WAVES.md. A line-by-line check against the committed file found 0 lines lost.

## Files touched

**Created:**
- .claude/skills/impeccable/ (56 files: SKILL.md, agents/, reference/, scripts/ without bin/)
- docs/design-v6/TRIP-PLANNING-RESEARCH.md
- Execution/_queue/design_waves.py
- Execution/P0/T369-impeccable-design-waves.md

**Modified:**
- .gitignore (the engine binary folder and .impeccable/)
- .gitattributes (LF for the sh launcher)
- Execution/_queue/waves_md.py (import the design waves, keep the wave log)
- Execution/_WAVES.md (regenerated)
- Execution/_OPEN.md (rows T369-a to T369-c)

Outside the repos: %USERPROFILE%\.impeccable\bin\0.1.5\impeccable.exe (the engine binary, copied from riga-hackathon).

## Commands run

```
sh .claude/skills/impeccable/scripts/impeccable engine-probe        # impeccable-engine 0.1.5
sh .claude/skills/impeccable/scripts/impeccable context --target src/browse/ExploreTab.jsx   (an app file)
sh .claude/skills/impeccable/scripts/impeccable detect --json <ExploreTab.jsx> <10-shell.css>   # []
python Execution/_queue/waves_md.py
```

## Config and secrets set

None. Wrangler on this laptop is already logged in to Cloudflare (checked with `npx wrangler whoami`); the preview deploys use that login.

## Before/after measurements

| Measure | Before | After | Source |
|---|---|---|---|
| Waves in _WAVES.md | 18 | 24 | waves_md.py output |
| Sessions in _WAVES.md | 160 | 202 | waves_md.py output |
| Wave log lines kept by a regeneration | 0 of 13 | 13 of 13 | diff against the committed _WAVES.md |
| Project skills in .claude/skills | 1 | 2 | git ls-files |

## What broke and how it was fixed

The first regeneration wiped the wave log for waves 6 to 16c, which is how waves_md.py always behaved; the file was restored from git and the generator now carries the log over. A patch applied through a Bash heredoc lost its backslashes (the known heredoc trap) and matched nothing; it was rerun from a script file.

## What is still open

Starting the run is the owner's: paste the kickoff line from the "Design waves V1 to V6" section of _WAVES.md into a Fable session in the main checkout (T369-a). Forty-two sessions, most on opus, is a large draw on the account: earlier waves stopped on the session and weekly limits (waves 7, 10, 13 and 15), so the night may end part way, and the waves resume where they stopped.

A newer impeccable (v4.5.0) is installed in the owner's personal skills and shares the name, so a session that loads the skill by name may get that copy instead; the prompts read the project copy by path to avoid it (T369-b). The preview may lack data the newest code reads (T271-c's dest/_rank.json is on the runbook's C3 push); T412 checks and reports rather than pushing data. Native review of the strings the waves translate is raised by each session itself.

## Rollback procedure

Revert the T369 merge commit on main. That removes the skill, the research, the design waves and the generator change; regenerating _WAVES.md afterwards keeps the log. Delete %USERPROFILE%\.impeccable\bin\0.1.5 if the engine is no longer wanted. Nothing in the app or the data changed.
