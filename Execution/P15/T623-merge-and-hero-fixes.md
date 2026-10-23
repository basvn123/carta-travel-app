# T623: merge the open branches and close T621-a, T621-b and T621-c

## Task ID

T623

## Date

2026-10-23

## What changed

**The merges.** The owner asked for the other branches to be merged, then the three open hero items fixed, then a commit, push and deploy.

- **Root `main`** now holds the home hero (T620, T621), T617 (ingestion collectors callable again, a finished branch with its own report; it closes T617-b), and the Explore head refinements.
- **Renumbering.** The Explore head refinements branch had taken T620 24 seconds after the home hero film's T620 (10:55:56 against 10:55:32). As the later one it is now **T622**: its report is renamed `Execution/P15/T622-explore-head-refinements.md` with a note, its register rows are T622-a to T622-e, and every T620 in its code comments reads T622. The home hero's T620 stays.
- **App repo.** T622 had edited `continent-app` as a plain folder inside a root worktree, so its app half existed only as the root mirror. It is now app commit `6db179e` on its own branch, merged into app `master` with the hero branches. App `master` and the root mirror were compared file by file, ignoring line endings, and match.
- **Not merged:** `p0-next-steps-docs` (10 days old, 243 commits behind) and the stale feature worktrees. Neither was asked for, and both have nothing open.

**The three fixes:**

- **T621-a, header contrast.** While the app header lies on the film it now sits on one flat bar, `--home-film-bar` (`--neutral-900` at 30 percent, no gradient). With the film's tint under it, white labels on the sky measure at least 4.9:1 on the brightest tenth of the pixels on every clip, 5.6 to 7.8:1 at the median. Before, with no bar, it was 3.8 to 6.9:1 at the median and failed 4.5:1 on Bled and Dubrovnik. The phone's own top line (mark and Log in) sits on the same bar. The new token is in DESIGN.md.
- **T621-b, phone placeholder.** A 360 px phone has only 136 px beside "Ask Carta", and no three-part placeholder fits in any language. A two-part one would drop "budget". So no new copy: on a phone the field now takes the whole width and "Ask Carta" stands under it at full width, and the whole placeholder shows. From 769 px the button stays inside the pill. In the markup the glyph and input share a box (`.hv-ask-box`, `display: contents` everywhere except the phone hero).
- **T621-c, chat title ring.** The chat's title takes focus only from code (`tabIndex={-1}`, so a screen reader names the dialog on a phone), but `.ac-title:focus-visible` drew a square ring after a keyboard open. It now draws none. Tab never reaches the title, so nothing is lost for keyboard users.

## Files touched

**App repo (`continent-app`, branch `p15-t623-hero-fixes`):**
- src/browse/home/HomeHero.jsx: `.hv-ask-box` around the glyph and the input.
- src/styles/61-v6-home.css: the bar under the header and the phone top line, and the phone hero field and button stacked.
- src/styles/01-tokens.css: `--home-film-bar`.
- src/styles/76-ask-chat.css: no ring on the title.
- scripts/verify_home.mjs: `hero` fails on a cut placeholder, `header` expects the see-through bar, and `ask` fails on a ring on the title.
- Also merged in the app repo: T622, as commit `6db179e` from the root mirror (25 files; see its own report).

**Root:** DESIGN.md, .claude/skills/carta-design/SKILL.md, PRODUCT.md, Execution/_OPEN.md, this report, the mirror of the files above; the merge commits for T620-T621, T617 and T622 (with the renumber).

## Commands run

```
git checkout main; git merge --no-ff p15-home-hero-header; git merge --no-ff p3-ingestion-run-shadow   # register conflict: both sides kept
git merge --no-ff p15-explore-head-refinements       # register conflict; T620 -> T622 in report, rows, comments
git -C continent-app checkout -b p15-explore-head-refinements; commit T622 (6db179e); merge into master
diff -rq --strip-trailing-cr <app master src> continent-app/src     # identical
python lum_top2.py frames                             # bar strength chosen: combined 58 percent
npm test                                              # 655 pass
vite build (NOPUBLIC) + node scripts/css-routes.mjs --check   # all route-only
node scripts/verify_home.mjs --port=5202              # 44 pass, 0 fail
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before (T621) | After | Delta |
|---|---|---|---|
| White header labels on the clips' sky, brightest tenth, worst clip | 3.2:1 (Lagos) | 4.9:1 | +1.7 |
| Same, median, worst clip | 3.8:1 (Dubrovnik) | 5.6:1 | +1.8 |
| Hero placeholder width shown at 360 px, en | 136 of 206 px (cut) | 206 of about 270 px (whole) | not cut |
| Ring on the chat title after a keyboard open | 2 px square | none | |
| verify_home | 44 pass | 44 pass, three checks stricter | |

## What broke and how it was fixed

- **Line endings.** Checking out root `main` rewrote the shared `continent-app` folder in CRLF, so the app repo showed five files as modified. They were line endings only (`git diff --ignore-cr-at-eol` was empty for them) and were reset before the T622 commit.
- **Register conflicts.** Both merges conflicted in `_OPEN.md`, which every branch appends to. I kept both sides in order and renumbered the T622 rows.

## End check: screens and states looked at

At 1440 x 900: the hero on Bled with the header on its bar, and the bar giving way to the usual header once scrolled past. At 360 x 760: the field at full width with the whole placeholder, "Ask Carta" under it, and the top line on the bar. The chat opened from the hero by keyboard at both widths, with one question and no ring on the title. Under reduced motion the film stands still, and the six languages at 360 x 740 pass (all in verify_home).

## What is still open

- **T623-a:** `src/browse/ExploreMap.jsx:901` has a lint error from T600 (`react-hooks/exhaustive-deps`, `collectKpins` missing from a `useCallback`). It's older than today and was untouched here. Fix it in a task that may touch ExploreMap.

## Rollback procedure

- **App repo:** `git revert` the T623 commit on master. The T622 commit `6db179e` and the hero commits can each be reverted on their own.
- **Root:** revert the T623 commit. Reverting a merge commit (`git revert -m 1 <merge>`) undoes T617, T622 or T620-T621 one at a time.
- **Deploy:** promote the previous Cloudflare Pages deployment of `carta-app` in the dashboard.
