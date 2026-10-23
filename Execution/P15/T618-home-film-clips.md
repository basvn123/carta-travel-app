# T618: the hero film plays licensed clips, then the home page ships

## Task ID

T618. The number follows T617 (another session's ingestion fix, branch p3-ingestion-run-shadow); the app commit was first written as T611 and renumbered before anything was pushed.

## Date

2026-10-23

## What changed

The owner approved stock clips for the hero film (D3) and asked for merge, push and deploy. The film on the rebuilt home page (T606 to T610) no longer pushes into Commons photographs: it plays five licensed clips from Pexels, each a place in the catalogue with that place's own day price and, where the sweep has one, the return fare from the traveller's airport. The order is Bled (gem:bled), Lagos (gem:lagos-pt), Dubrovnik (DBV), Porto (OPO) and Hallstatt (gem:hallstatt, no airport, so no fare pill). Each clip is an 11 second cut, H.264 at 1280 by 720 with no sound, with a WebP poster of its first frame; the shot on screen preloads its clip, the next one only its metadata. A price pill now opens its place instead of a traveller's search. The credit under the stage names the clip, its author and the Pexels License, and links to the clip's Pexels page. A playing video in Chrome showed square black corners past the stage's rounded clip; the stage now also carries `clip-path: inset(0 round var(--radius-stage))` and the shot and the video inherit the radius. With this the register's T605-b (clips) and T606-a (merge and deploy) close.

The clips, all under the Pexels License (free to use and modify, no attribution required; Carta credits them anyway):

| Shot | Pexels id | Title on Pexels | Author |
|---|---|---|---|
| Bled | 35327836 | Aerial View of Lake Bled and Church Island | Rui Veiga |
| Lagos | 36749579 | Stunning Aerial View of Ponta da Piedade, Lagos Coastline | Mike Art |
| Dubrovnik | 12079872 | Drone Footage of Dubrovnik in Croatia | Lazar Krstić |
| Porto | 34285846 | Aerial View of Porto's Historic Waterfront | K |
| Hallstatt | 37011265 | Stunning Aerial View of Hallstatt Village | Ahmet Yüksek |

The Pexels video pages sit behind a Cloudflare check; it was not clicked through. The file links came from the search page's own data and the files from videos.pexels.com directly.

## Files touched

App (continent-app, branch p15-home-v2, commit 4fc0322), mirrored into the root's continent-app/:

**Modified:**
- src/lib/homeDemo.js (FILM is the five clips with their credits)
- src/browse/home/HomeHero.jsx (FilmClip plays, pauses and rewinds with the film; pills open the place; the credit reads the clip's)
- src/browse/home/HomePage.jsx (passes onOpenDest to the hero)
- src/styles/61-v6-home.css (clip path and inherited radius on the stage)
- scripts/verify_home.mjs (the film check waits for a playing clip)
- tests/home.test.mjs (the film test checks five credited clips whose files ship)

**Created:**
- public/home/film/{bled,lagos,dubrovnik,porto,hallstatt}.mp4 and .webp

Root:

**Modified:**
- DESIGN.md (Home page exception v2, the hero film)
- .claude/skills/carta-design/SKILL.md (the film rule)
- Execution/_OPEN.md (T605-b and T606-a closed by T618)

**Created:**
- Execution/P15/T618-home-film-clips.md

## Commands run

Each clip was cut and encoded with ffmpeg (`-nostdin`, an 11 second cut scaled to 1280 wide, H.264 yuv420p, audio dropped, `+faststart`, the CRF raised per clip until it sat near or under 1.5 MB; Porto took CRF 31), and its poster is its first frame written as WebP. Then:

```bash
npx eslint src/lib/homeDemo.js src/browse/home/HomeHero.jsx src/browse/home/HomePage.jsx tests/home.test.mjs
node --test tests/home.test.mjs
node scripts/verify_home.mjs --port=5196 --host=localhost
```

Then the merge, push and deploy, in this order: app p15-home-v2 into master (after `git checkout -- src/i18n` in the main app checkout, whose changes there were line endings only), root p15-home-v2 into main, both pushed, then from the main app checkout `VITE_E2E_SEAMS= npm run build:pages`, `node scripts/css-routes.mjs --check dist/assets` and `npx wrangler pages deploy dist --project-name carta-app --branch main`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before (T610) | After | Delta |
|---|---|---|---|
| Film shots that move as video | 0 of 5 | 5 of 5 | +5 |
| Bytes of the first shot on arrival | one Commons photo | 37 KB poster + 496 KB clip | |
| Film files shipped | 0 | 6.3 MB of clips, 0.65 MB of posters | |
| verify_home.mjs | 41 of 41 | 41 of 41 | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Square black corners at the stage's bottom while a clip played on a phone | Chrome composites a playing video past a rounded `overflow: hidden` clip (paused, the corners were clean) | `clip-path: inset(0 round var(--radius-stage))` on the stage and `border-radius: inherit` on the shot and the video |
| The app commit took T611, below another session's T617 | Numbers were not re-read from `git log --all` before the commit | Amended to T618 before any push |
| Three numbersPage tests fail in the app worktree | The worktree has no public/boot.json (data lives in the main checkout) | Not a fault of this task; run there after the merge |

## What is still open

None new. The film inherits T610-a (the desktop film is a short letterbox, the owner's call).

## Rollback procedure

Before the deploy: `git revert 4fc0322` in the app and revert the T618 commit in the root. After the deploy: the previous Pages deployment stays in the carta-app project's history and can be promoted in the Cloudflare dashboard, or revert both repos' T606 to T618 commits and rebuild. Nothing in data or the database changed.
