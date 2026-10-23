# T620: the home hero film fills the first screen

## Task ID

T620

## Date

2026-10-23

## What changed

The home page's hero is now a film that fills the first screen, after the owner's two references (Mindtrip and Komoot). On a phone it runs edge to edge under the mark and Log in; from 769 px it is inset by `--space-2` with `--radius-stage` corners. Its height is the home page's own visible box (`100cqh`, `.hv-page` is now a size container), less a 40 px peek of the credit line on a wider screen. The five licensed clips from T618 now play as one continuous cut: the progress bars, the drifting price pills and the pause control are gone. One even tint, `--home-film-tint` (`--neutral-900` at 40 percent, no gradient), lies over the whole film, and the slogan ("A cheap flight is not a cheap trip"), the one line of what Carta does, Ask Carta's field and "Plan a trip" stand on it, centred and in white. The words have a soft shadow under them for busy stretches like Dubrovnik's roofs. The film still stops off screen and in a hidden tab, and under reduced motion it shows the first poster. The credit stays on the caption line under the film.

Before building, the owner made four decisions (2026-10-23, in the session):

- An even dark tint, not the Mindtrip fade and not a bare text shadow.
- No pause control. It was offered as a tiny corner icon, with the WCAG 2.2.2 cost explained.
- Ask Carta's field plus Plan a trip on the film.
- Drop the price pills.

These replace T606's decision D2 ("the slogan under the film, never on it") and the T606/T618 rule that a pause control is always there. carta-design, DESIGN.md and PRODUCT.md now carry the new rule.

Reverse engineering of the reference: dembrandt read mindtrip.ai's type. Its headline is 108 to 128 px at line height about 0.8 and -0.06em tracking, its subline 20 px, with one button. Carta keeps its own `--text-hero` (up to 112 px, Figtree 700, -0.035em, inside the craft floor's -0.04em limit). It keeps the subline at `--text-title` on desktop. The awwwards structure tools need Playwright installed where that MCP server runs, so they did not run.

## Files touched

**Modified (app repo, branch p15-home-hero-full, commit 97ea472):**
- continent-app/src/browse/home/HomeHero.jsx: the film behind the words. Pills, bars and the pause button removed. Takes children (the phone's top line).
- continent-app/src/browse/home/HomePage.jsx: the hero moves out of the 1240 px `.hv-wrap` and carries the phone's top line.
- continent-app/src/styles/61-v6-home.css: the hero block rewritten, and `.hv-page` became the size container. The drift keyframes, pill, step and pause rules are gone, along with their wide-screen and reduced-motion lines.
- continent-app/src/styles/01-tokens.css: `--home-film-tint` added, `--dur-drift` removed.
- continent-app/scripts/verify_home.mjs: a new `hero` check (width, height share, words on the film, no extras, tint). `film` no longer needs a pill, and the `pause` check is gone.

**Modified (root):**
- DESIGN.md: Home page exception v2, the hero film and words on it, the token table, the Do line and the sync line.
- .claude/skills/carta-design/SKILL.md: the Photography exception, the hero height rule, the home motion exception and the ten-things item 4.
- PRODUCT.md: the Motion line.
- Execution/_OPEN.md: rows T620-a to T620-d.
- continent-app/ mirror of the five app files above.

**Created:**
- Execution/P15/T620-home-hero-full.md (this report)

## Commands run

```
git checkout -b p15-home-hero-full            # root and continent-app
ffmpeg -i public/home/film/<clip>.mp4 -vf fps=1,scale=320:180 -f rawvideo ...   # 11 frames a clip, scratchpad
python lum.py frames                           # contrast of white on the tinted film where the words sit
npx eslint src/browse/home/
npm test                                       # 655 pass, 0 fail
npx vite build --config <scratch NOPUBLIC config>   # 8.7 s
node scripts/css-routes.mjs --check <scratch dist>/assets   # 2312 route selectors, all route-only
npx vite --port 5202 --strictPort
node scripts/verify_home.mjs --port=5202       # 41 pass, 0 fail (phone, desktop, reduced, six languages)
impeccable detect --json HomeHero.jsx 61-v6-home.css   # []
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Hero film height, desktop 1440 x 800 | 320 px (`40svh`, computed from the old CSS) | 93% of the page box (verify_home) | about 2.3 times taller |
| Hero film width gap to the page box, desktop 1440 | about 233 px (1240 px wrap less padding, computed) | 31 px (16 px inset plus the scrollbar gutter, measured) | -202 px |
| Hero film on a phone, 390 x 844 | 320 px (`38svh`, capped at 360, computed) | 100% of the page box, 0 px width gap (measured) | full screen |
| Things on the film besides the words | 2 pills, 5 progress bars, 1 pause button | 0 (verify_home `hero`) | -8 |
| White on the film, median over five clips where the words sit | (no words on the film) | 5.7:1 (Bled, the lowest) to 10.3:1 (Lagos) | |
| White on the film, brightest tenth of pixels | (no words on the film) | 3.4:1 (Bled, Dubrovnik) to 6.3:1 (Hallstatt) | large-text floor 3:1 met everywhere |
| verify_home | 33 checks (T618) | 41 pass, 0 fail | |

Tint strengths measured before choosing 40 percent: at 30 percent the brightest tenth falls to 2.8:1 on Bled and Dubrovnik, under the large-text floor. 50 percent reaches 4.2:1 but flattens the footage.

## What broke and how it was fixed

- The first verify run failed `hero` on both widths. The geometry was fine; my own check expected `rgba(`, but the tint computes as `color(srgb ...)`. I fixed the regex.
- The first screenshot showed the subline thin over Dubrovnik's roofs on a phone. I added a soft text shadow under the words only, with no scrim, then ran one confirmation round, which passed.
- A cut in the stylesheet left a stray `}` after the drift keyframes were removed. It was fixed before the build.

## End check: screens and states looked at

Screenshots at 1440 x 900 and 390 x 844, two different clips each (Lagos and Dubrovnik). Desktop: the app header, the inset film to the window's edge, the slogan on two lines, the subline, the Ask field beside Plan a trip, and the credit under the film. Phone: the film to the screen's edges, the mark and Log in in white at the top, and the words, field and full-width primary above the bottom nav (the `fold` check: primary ends at 740, nav at 780). Reduced motion: the film does not run and nothing animates. Six languages at 360 x 740: no sideways scroll and no cut text.

Carta-design's seven questions:

1. **Tokens only:** yes. The one new colour is `--home-film-tint`, made from `--neutral-900`.
2. **Gradient:** none. The tint is flat. No colour outside DESIGN.md, and brown stays on the one primary.
3. **Type:** one face. The slogan uses `--text-hero` as before, and nothing is uppercase.
4. **Motion:** the crossfade and the one-time rise use the motion tokens, with transform and opacity only. Under reduced motion it stands still.
5. **Primary and text on a photograph:** there is one primary. The words on a photograph are the owner's new exception, now written into carta-design.
6. **Targets:** 44 px everywhere (the `taps` check passes).
7. **Copy:** no new copy, no dashes or middots (the `copy` check passes).

## What is still open

- **T620-a (owner):** the film has no pause control, so the home page does not meet WCAG 2.2.2 ("Pause, Stop, Hide": moving content that starts on its own and lasts over 5 seconds needs a way to stop it). The owner chose this knowingly. A tiny corner icon would restore it without bars on the film.
- **T620-b:** the clips are 1280 x 720. Across a 1424 px desktop film they are upscaled, and they look a little soft under the tint. 1920 x 1080 sources from the same Pexels pages would fix that, at about 2.5 times the bytes.
- **T620-c:** three i18n keys are now unused: `home.filmPause`, `home.filmRole` and `home.filmLabel` (`home.returnFlight` and `home.aDayUnit` are still read elsewhere on the page). Remove them from the six language files in a task that may touch them.
- **T620-d:** the home surface brief (`continent-app/.impeccable/surfaces/continent-app-src-browse-home.md`) still describes the T463 pinned-phone home. Rewrite it for home v2 and T620.

## Rollback procedure

1. In the app repo, `git revert <T620 commit>` on master once it is merged, or delete the branch before merge. This brings back the stage, the pills, the bars and the pause control.
2. In the root repo, revert the T620 commit. That restores DESIGN.md, carta-design, PRODUCT.md and the mirror, and reopens nothing in the register, since T620 closes no row.

No data, schema or deploy is involved.
