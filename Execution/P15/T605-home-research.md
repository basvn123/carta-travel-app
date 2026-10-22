# T605: Home page research, references measured and today's page critiqued

## Task ID

T605

## Date

2026-10-23

## What changed

No app code changed. This task is the research before the home page is rebuilt from scratch, which the owner asked for on 2026-10-23 ("throw away everything existing on the main page and start from scratch using all skills"). It does three things. First, it records the owner's answers to the twelve decisions of the home page plan (claude.ai artifact https://claude.ai/artifact/2Jbd2LipGXYFMryXLzf6VW, built from the owner's board https://claude.ai/artifact/CK5YRnRHjhCj3WhwsmuiRd with 15 references): the owner took every recommendation. Second, it measures the six reference sites the owner pinned (Mindtrip, Komoot, Apple iPhone, Headspace, Wise, Linear) and Carta's live home page with two newly installed tools, Dembrandt (computed type, spacing, radius and motion) and the Awwwards MCP (motion DNA, scroll motion census, hover census). Third, it runs an impeccable critique of today's home page with two isolated reviewers, which scores it 20 out of 32. The finding that matters most for the rebuild: none of the six references uses GSAP, scroll pinning or scroll scrubbing; all of their motion is CSS keyframes and transitions on transform and opacity, so the rebuild needs no animation library and stays inside Carta's motion rules. What makes them feel alive is video, much larger type and longer, slower timing, not a scroll engine.

## Owner decisions (2026-10-23, all twelve recommendations taken)

D1, slogan: "A cheap flight is not a cheap trip." D2: the headline sits under the film on paper, never on it. D3: hero clips from licensed stock first (Pexels), credited, the owner's own footage later. D4: the home page exception widens to an ambient hero film, drifting price pills, app videos that play in view, tab auto-advance that stops on touch, and a route drawing of about 1.6 s; every one becomes a still under reduced motion. D5: section panels from the brown family plus one lake band, as home-only tokens. D6: one new token `--text-hero` (up to 120 px, Figtree 700, tight spacing), no second typeface. D7: "Plan a trip" stays the one primary, "Log in" quiet beside it, no "Sign up for free". D8: no cookie popup, because Carta stores nothing optional (`launchEvents.js`). D9: passes stay on the home page in plain columns, and PRODUCT.md's "the pass appears only at a paid moment" is updated in the rebuild's rules task. D10: already settled by T594, which put the site footer on every page-like tab; the rebuild reuses `SiteFooter.jsx`. D11: first visit as now, plus the logo leads home for anyone not signed in. D12: Komoot-style rails on Explore are a separate task after the rebuild.

The plan predates the Explore v6 to v8 rules now on main. Two of them change the plan's examples: the word "est." left the screen on 2026-10-22 (T590), so the pills read "~€89 a day", not "~€89 est. a day"; and Ask Carta's only door is Explore's overview (T595), so the home page hands a typed question to Explore rather than opening the chat itself, as it does today.

## Files touched

**Created:**
- Execution/P15/T605-home-research.md

Not in git: `.impeccable/critique/2026-10-22T22-40-12Z__continent-app-src-browse-home-homepage-jsx.md`, impeccable's snapshot of the critique for a later `impeccable polish`; `.impeccable/` is ignored by the repository, so it lives only in this worktree.

**Modified:**
- Execution/_OPEN.md (rows T605-a to T605-f)

## Commands run

Tools installed at user level for every session (outside the repo): MCP servers `awwwards` (`npx -y awwwards-mcp@1.11.0`) and `dembrandt` (`npx -y dembrandt@0.39.2 mcp`) added to `~/.claude.json` (backup `~/.claude.json.bak-2026-10-23`); skills `hyperframes`, `hyperframes-cli`, `hyperframes-registry`, `media-use`, `remotion-to-hyperframes`, `slideshow`, `figma` (HyperFrames) and `genjutsu` via `npx skills@1.7.4 add ... -g -a claude-code`; FFmpeg 9.0.2 via `winget install --id Gyan.FFmpeg`; Playwright Chromium 1194. Genjutsu's files were scanned: no API keys, no outside calls. None of the tools uses the Claude API.

Measurements, from a scratch folder:

```
npx -y dembrandt@0.39.2 <url> --json-only --wcag --slow > <site>.json
node call.mjs get_motion_dna '{"url":"<url>"}' out/<site>-dna.txt          # Awwwards MCP over stdio
node call.mjs analyze_scroll_map '{"url":"<url>","viewport":"desktop"}' out/<site>-scroll.txt
node call.mjs analyze_hover_census '{"url":"<url>"}' out/<site>-hover.txt
```

The Awwwards MCP was driven through a 15-line stdio client (`@modelcontextprotocol/sdk@1.32.1`) because a newly added MCP server only loads in a new session. Phone performance: chrome-devtools `performance_start_trace` at 390 by 844, Fast 4G, 4x CPU, cold cache. Lighthouse: chrome-devtools `lighthouse_audit`, mobile, snapshot mode. Critique: impeccable `critique` with two isolated subagents, `impeccable detect --json continent-app/src/browse/home`, `node scripts/ci/design-lint.mjs`, `node scripts/ci/token-contrast.mjs`.

## Config and secrets set

`~/.claude.json`: `mcpServers.awwwards` and `mcpServers.dembrandt` (user scope, no keys). No project config and no secrets.

## Before/after measurements

This task measures the "before" for the rebuild. There is no "after" yet.

Carta's live home page, phone (390 by 844, Fast 4G, 4x CPU, cold): LCP 1,473 ms, of which render delay 1,283 ms and TTFB 190 ms; CLS 0.00. Lighthouse snapshot, mobile: accessibility 100, best practices 100, SEO 100. A Lighthouse navigation run under 4x CPU stopped with PAGE_HUNG (row T605-d). Impeccable critique: 20 of 32 (Nielsen 7 and 10 not applicable on a Persuade surface), 1 P0, 2 P1, 2 P2.

Type, radius and motion, measured by Dembrandt at 1920 by 1080:

| Site | Largest heading | Line height | Letter spacing | Large radius | Motion |
|---|---|---|---|---|---|
| Mindtrip | 128 px, 400 | 0.81 | -6% | 36 to 48 px | 700 ms reveal, floats of 7, 8 and 9 s |
| Komoot | 72 px, 500 | 1.25 | +1% | 24 px | 200 to 300 ms ease-in-out |
| Apple iPhone | 80 px, 600 | 1.05 | -1.5% | 28 px | 320 ms (35 elements), 800 ms |
| Headspace | 72 px, 700 | 1.00 | -3% | 32 px | 300 to 500 ms, ease (0.32, 0.94, 0.6, 1) |
| Wise | 78 px, 600 | 1.10 | -3% | 20 px, pills | 350 ms ease (0.8, 0.05, 0.2, 0.95) |
| Linear | 72 px, 510 | 1.00 | -2.2% | pills, 12 px | 420 ms staggered (124 elements), 700 ms |
| Carta today | 40 px, 700 | 1.20 | -2% | 16 px | 120 and 200 ms only |

Motion stack, measured by the Awwwards MCP: GSAP ScrollTrigger 0, CSS scroll timelines 0, view timelines 0, pinned sections 0, scrubbed animations 0 on all six. Animated properties are transform and opacity everywhere (Apple adds one colour and one width). CSS keyframe animations counted: Mindtrip 25, Komoot 2, Apple 41 plus 32 SVG, Headspace 3, Wise 2, Linear 200. Hover rules: Komoot 173, Apple 116, Headspace 109. Frameworks: Mindtrip, Headspace, Wise and Linear are React on Next.js; Komoot React; Apple Preact.

## The critique, in short

Today's page uses a layout any trip planner could ship: headline, search pill, chips, a laptop mockup, a persona rail, a sticky phone, three plan cards, the search again. Only the price pills on the persona photos and the receipt inside the device are Carta's own, and both are small. The page tells its idea and never shows it. Priority issues: [P0] the device captures show UI the app no longer has (the old Home, Destinations, Trip planner, Day planner nav, "Get a pass", "Add your fare" against live Google Flights prices), a trust break on a page whose only asset is trust; [P1] there is no hero moment, so no visitor sees a cheap flight turn into the true total; [P1] the hero has three competing actions and on a phone the Ask placeholder truncates and the chips overflow sideways; [P2] the pass block contradicts PRODUCT.md and makes the page's low point; [P2] the desktop story leaves about 290 px of empty paper between chapters while the phone's text is about 9 px. Worth keeping: the real place prices from `searchRows()`, every door as a real `<a href>`, the idle-deferred photos and the reduced-motion branches. The detector found nothing in the home JSX (it does not read CSS), design lint shows no new violation in the home files, contrast has 0 pairs under the floor, and the overlay could not run against production because its CSP allows only same-origin scripts.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The new MCP servers could not be called | MCP servers load when a session starts | A stdio client script called the Awwwards server directly |
| Awwwards live tools refused | They import `playwright` from their own folder | Playwright 1.56.1 installed beside the client |
| The worktree could not merge main | Main changes `.claude/skills/carta-design/SKILL.md`, a sandbox-protected file, and the repository origin was pinned before the app asked | Not fixed; the owner confirms the origin in the app (Help, Troubleshooting, Review Pinned Git Origins), row T605-c. The research branch does not need main's code |
| Lighthouse navigation mode hung | Under 4x CPU the page stopped responding within Lighthouse's window | Snapshot mode used for the scores; the hang is row T605-d |

## What is still open

The rebuild itself, from scratch on app master, as one batch from T606 on (row T605-a). The hero film needs licensed clips, which means downloading video files, which the owner approves file by file (row T605-b). Until then the hero runs on Carta's own licensed Commons photographs. Lighthouse's navigation run hanging under 4x CPU needs a look at the main thread on first load (row T605-d). The trip planner's total in Wise's style (row T605-e) and Komoot-style rails on Explore (row T605-f) are follow-ups the board raised for other screens.

## Rollback procedure

Delete `Execution/P15/T605-home-research.md` and remove rows T605-a to T605-f from `Execution/_OPEN.md`, or `git revert` this task's commit. To remove the tools: delete `mcpServers.awwwards` and `mcpServers.dembrandt` from `~/.claude.json` (or restore `~/.claude.json.bak-2026-10-23`), `npx skills@1.7.4 remove genjutsu hyperframes hyperframes-cli hyperframes-registry media-use remotion-to-hyperframes slideshow figma -g`, and `winget uninstall Gyan.FFmpeg`.
