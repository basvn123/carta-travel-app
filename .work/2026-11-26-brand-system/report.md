# Run report: Viantra brand system, positioning and site wording, the research and the plan

- **Status:** done (research); the build is the page-by-page work that follows, step by step with the owner
- **Date:** 2026-11-26
- **Level and playbook:** L2 · research (crew:deep-task)
- **Run folder:** `.work/2026-11-26-brand-system/`
- **ROADMAP:** K1

## Summary
The owner asked for in-depth research on the tools that brand a website and keep its style easy to change, with their saved Instagram reels as a source, and a concrete plan to rework `BRAND.md`, `DESIGN.md`, `PRODUCT.md` and then the site page by page. The answer is `docs/research/2026-11-26-brand-system-toolkit.md`:
- Keep plain CSS tokens and add a brand role layer; no token build tool.
- Add a short `BRAND.md` that owns strategy and voice.
- Position on the cost of a day: none of about 14 competitor pages read shows it.
- Use the house style skill with impeccable, plus three tools from the reels.
- Start with four owner decisions, then go page by page.

Nothing is committed and no app code changed.

## What was asked
1. Use crew.
2. In-depth research on branding and customisation tools, including the owner's saved reels.
3. A concrete plan, followed by a step-by-step, page-by-page pass on branding, wording and positioning.

## What we did
1. **Intake and plan:** `brief.md`, `plan.md` (7 criteria, 5 areas).
2. **Explore:** 4 explorers in parallel (customizable style, Claude skills, positioning and voice, repo audit). Then a gap-filler for the Dutch market, user testing, SEO, six-language voice and the name read.
3. **Reels:**
   - The built-in browser and Claude in Chrome were not signed in or not connected; the owner signed in to Instagram in the DevTools Chrome window.
   - Claude read the captions of all 178 saved posts (65 from 2025-12 to 2026-11, 113 older, 20 of those sampled).
   - An explorer checked every tool the reels name at its source.
   - Ten "comment X and I'll DM you" reels were not followed, because commenting posts on the owner's behalf.
4. **Critique:** source quality, contradictions and coverage critics. Blockers: no reels yet, the palette not decided, the home page switched off.
5. **Synthesise:** wrote the research doc, with one recomputed figure: terracotta contrast on stone, on white and against umber.
6. **Verify:** 4 judge rounds. Round 1 FAIL 45/75, round 2 FAIL 51/75, round 3 FAIL 57/75 (two claims wrong, both fixed), round 4 PASS 60/75 (every criterion at 4). Over 35 claims were checked at source.

Skipped: Diverge and Propose (research playbook).

## The reels, per post (the tracked record; `explore-reels.md` is not tracked)

| Saved from (date) | Points to | Verdict |
|---|---|---|
| bernardrb_ (2026-11-25) | Impeccable, Taste skill, Figma MCP, Playwright MCP | Confirms the stack; no Figma file |
| stinisai (2026-11-04) | Awesome Design MD, Taste, Impeccable live mode, Playwright CLI, img2threejs | Awesome Design MD: template only |
| stinisai (2026-11-25) | reverse-engineer-marketing (53 marketing skills), Agent Reach | Use for competitor teardowns; Agent Reach YouTube only |
| imaginetechz (2026-10-20) | Emil Kowalski's skills, Impeccable, Taste, Figma, Playwright | Emil Kowalski: use for motion |
| jesseeisenbart (2026-10-13) | Emil Kowalski's apple-design skill | Use for motion |
| volkan.js (2026-11-24) | Unslop, Stack Diagram, pixelfx | Unslop: audit only |
| charliehills (2026-10-19) | "REA" skill, DESIGN.md from a URL | Not found; dembrandt does it |
| bendoescareer (2026-11-16) | Motion Primitives, Watermelon, Coconut, Backlit UI, anime.js | Skip (Tailwind kits); anime.js only if needed |
| hugomxnning (2026-11-20) | Inspiration sites (Scrolltide, Bencho) | Skip |
| janm_ux (2026-10-30) | design-critique, design-handoff, figma-use-motion | design-critique: use |
| leadwithzoe (2026-10-11), anjela.marketing (2026-10-01, 10-12) | Claude Design, Claude motion; references in, principles out | Method used; Claude Design maybe |
| diego.a.does (2026-11-07) | Two calm colours plus one that pops on the button | Feeds palette decision 1 (b) |
| aiyana_creative (2026-11-22) | Real references in a skill, not adjectives | Step B: references in the house style skill |
| ose.builds (2026-10-22) | Five hero layouts | Options for decision 2 |
| muhammadalim_s (2026-11-24) | 20 AI tells checklist (by DM) | Compare with the AI-slop catalogue if found |
| mutazdotdev (2026-11-14, 11-15) | Bottom sheets, haptics; native tabs | Already done; no glass |
| guhmp4 (2026-11-08), viralapplaunch (2026-10-19) | First-run walkthrough; a "building your plan" moment before the paywall | Notes for later passes |
| nuhushaik (x3), divwitholly, julianxuofficial, brochbuilds, nateherkai, rishithakor.creates, uiux.build, raycfu | Sources only by DM | Not followed |

The other recent posts are AI engineering, prompts, security, video, sport, news, coaching and humour: not relevant.

## Why
- **No new build tools.** The owner works alone and Claude builds, so a token build step or Figma round trip costs more than it saves. Tokens stay in one CSS file with a role layer.
- **No design skill as a builder.** Every one that brings its own fonts or palette would fight the house style, which decision 0012 makes the winner.
- **Positioning on cost.**
  - The cost of a day is the one claim no readable competitor makes.
  - "Everything in one app" is said by four of six.
- **Decisions first.** The colour, the front door, the lead claim and the master language each change every later page, so they come before any copy or page work.

## Files changed

| File | Change | Why |
|---|---|---|
| `docs/research/2026-11-26-brand-system-toolkit.md` | New research doc with the plan | The deliverable |
| `.work/INDEX.md` | Run line | Run history |
| `.work/2026-11-26-brand-system/*` | Brief, plan, explore, critique, citations, judgement, report | Run record (only `report.md` is tracked) |

Outside the repo: the DevTools Chrome window is signed in to the owner's Instagram (the owner's own sign-in; nothing was posted, liked or commented).

## How it fits together
This feeds ROADMAP K1 after decision 0018 (the name) and the logo kit (`continent-app/brand/viantra/`). The next work is the four owner decisions, then `BRAND.md`, then the page pass in the doc's section 6.

## How it was checked
- `python -I scripts/docs/check_entry_points.py`: OK, 350 paths.
- `python -I scripts/docs/drift.py`: 0 drift.
- No em or en dashes in the doc.
- Judges: `judgement-1.md` to `judgement-4.md`.

## Open issues and risks
- Method descriptions for StoryBrand are from memory; Dunford and Neumeier rest on secondary pages.
- The white space rests on about 14 readable pages; Omio, TripIt, Lonely Planet and Google Travel were not read.
- The ten DM-only reels are a gap.
- Claude Design's price is not known.

## Undo
Delete `docs/research/2026-11-26-brand-system-toolkit.md` and this run's line in `.work/INDEX.md`, or `git revert` the commit that adds them.
