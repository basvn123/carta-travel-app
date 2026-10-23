# T621: the home film runs the full width under a transparent header

## Task ID

T621

## Date

2026-10-23

## What changed

The owner looked at T620 and asked for three things: the film across the whole width, the app header blended into the film, and the credit line gone. They also asked for Ask Carta to be the only action on the film, with Carta "popping up" right after a question.

Now:

- **Full width.** The film has no inset and no rounded corners at any width. The home page hides its scrollbar (`scrollbar-width: none`), so no scrollbar column stands to the right of the film. The wheel, the keys and touch still scroll.
- **Header on the film.** From 769 px the home page starts at the window's top, and the app header lies on the film. HomePage sets `data-home-film="under"` on the root while the film is under the header, and the header is then transparent: no ground, no rule, white labels with the words' soft shadow, and white focus rings and hover. Once the film has scrolled past, or a page opens over the home page, it switches to `past` and the usual bar comes back in `--dur-2`. Leaving the home page removes the attribute. On a phone the home page's own top line (mark and Log in) was already on the film; its mark's ring is now white too.
- **Credit removed.** The clips' credit line under the film is gone. The Pexels License asks for no attribution, and the title, author and licence stay in `src/lib/homeDemo.js` as provenance.
- **Ask Carta alone.** The field is the only action on the film. Its button now reads "Ask Carta" with the spark and is the page's one primary. "Plan a trip" left the film (the page still links to the planner further down). Pointing at or touching the field now also fetches the chat's code, not only Explore's vocabulary, so the chat opens without a wait.
- **The pop-up bug.** Measuring the hand-off showed the question being asked **twice** in the chat: two bubbles and two "typing" answers. ExploreTab's hand-over effect made a new seed on each run, and AskChat asked again whenever its effect re-ran. StrictMode does that in development, and in production `ask` takes a new identity as the catalogue arrives. Both now take each seed once, through a ref. Measured from Enter on the home field until the chat shows the question: 753 to 1074 ms on a phone and 881 to 923 ms on desktop, asked once (before: 881 / 1326 ms, asked twice).

## Files touched

**Modified (app repo, branch p15-home-hero-header, commit 744e4d8, on top of T620's 97ea472):**
- continent-app/src/browse/home/HomeHero.jsx: Ask Carta alone, `AskField primary`, the chat chunk warmed, FilmCredit removed.
- continent-app/src/browse/home/HomePage.jsx: the `data-home-film` root flag, from the page's own scroll.
- continent-app/src/browse/ask/AskChat.jsx: a seed is asked once.
- continent-app/src/browse/ExploreTab.jsx: one hand-over makes one seed.
- continent-app/src/styles/61-v6-home.css: no inset, corners or scrollbar. Adds the header-on-film block, the white `--focus` on the film, the hero field and primary, and the phone field fit. The credit rules are gone.
- continent-app/scripts/verify_home.mjs: `hero` now needs 0 px to the window and no spill. New `header` and `ask` checks; `fold` reads the new primary.

**Modified (root):** DESIGN.md, .claude/skills/carta-design/SKILL.md, PRODUCT.md, Execution/_OPEN.md, and the continent-app mirror of the six files above.

**Created:** Execution/P15/T621-home-hero-header.md

## Commands run

```
git checkout -b p15-home-hero-header       # root and continent-app, from T620
node <scratch>/ask timing script            # the hand-off measured, the double ask found
python <scratch>/lum_top.py frames          # white on the tinted sky band, five clips
npx eslint src/browse/home src/browse/ask/AskChat.jsx src/browse/ExploreTab.jsx   # one older warning (TitleTag, ExploreTab:1667), not this task's
npm test                                    # 655 pass, 0 fail
npx vite build --config <scratch NOPUBLIC config>; node scripts/css-routes.mjs --check <dist>/assets   # all route-only
node scripts/verify_home.mjs --port=5202    # 44 pass, 0 fail
impeccable detect --json HomeHero.jsx HomePage.jsx 61-v6-home.css   # []
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before (T620) | After | Delta |
|---|---|---|---|
| Film width gap to the window, desktop 1440 | 31 px (16 px inset plus the scrollbar column) | 0 px | -31 px |
| Film top, desktop | under the 64 px header | at the window's top, the header on it | +64 px of film |
| Film height share of the page box, desktop | 93% | 100% | +7 points |
| Credit line under the film | 1 | 0 | -1 |
| Actions on the film | Ask field and Plan a trip | Ask field ("Ask Carta" primary) | -1 |
| Times Home's question is asked in the chat | 2 (dev, measured) | 1 | -1 |
| Enter to question shown in the chat, desktop / phone | 1326 / 881 ms | 881 to 923 / 753 to 1074 ms | about -400 ms on desktop |
| White header labels on the sky band, median per clip | (header was opaque) | 3.8 (Dubrovnik) to 6.9:1 | under 4.5:1 on Bled and Dubrovnik, T621-a |
| verify_home | 41 | 44 pass, 0 fail | +3 checks |

## What broke and how it was fixed

- **Phone field.** The "Ask Carta" button pushed the field past the right edge of a 390 px phone, and the subline with it. The input's built-in width set the row's minimum. The `hscroll` check could not see it because the page hides sideways overflow. Fixed with `width: 0` on the input, a single `minmax(0, 1fr)` track and a smaller button on a phone. `hero` now also fails when anything in the hero ends outside the film.
- **Route CSS.** css-routes flagged my two new `:focus-visible` rules: they tied in specificity with planner and admin focus rules. I dropped both rules and set the `--focus` token to white inside the header-on-film block and the hero copy instead. The check then passed.

## End check: screens and states looked at

At 1440 x 900: the hero at the top (the film edge to edge, the transparent header with white mark, tabs and account disc, the field with "Ask Carta"), and then scrolled past the film (the usual bar back). At 390 x 844: the hero with the field inside the film. Then the chat after asking from the hero at both widths: one question, answered with three places on a phone. Under reduced motion the film stands still, and in six languages at 360 x 740 there is no sideways scroll and no cut text.

Carta-design's seven questions:

1. **Tokens only:** yes. The header's white comes from `--home-ink-on-deep` through local token overrides.
2. **Gradient:** none.
3. **Type:** one face.
4. **Motion:** only the bar's ground and rule fade, in `--dur-2`.
5. **Primary:** one, "Ask Carta". The words on a photograph are the owner's exception, now including the header.
6. **Targets:** 44 px everywhere (`taps` passes).
7. **Copy:** no new copy.

## What is still open

- **T621-a (owner):** the transparent header's white labels on the sky band measure 3.8 to 6.9:1 at the median per clip. Bled (4.3) and Dubrovnik (3.8) are under WCAG's 4.5:1 for small text, so the formula fails even though the shadow keeps them readable to the eye. Two fixes without a gradient: a flat 30% ink bar behind the header while it is on the film, which brings the label area to about 58% tint, or brighter clips swapped for darker skies.
- **T621-b:** on a phone the field's placeholder ("A place, a month or a budget") is cut beside the "Ask Carta" button. Add a shorter phone placeholder in the six languages.
- **T621-c:** when the chat opens from the keyboard (Enter in the hero), its title shows a square focus ring. It's the chat's own focus target, not this task's code. Give it a ring that matches the design, or no visible ring for programmatic focus.
- **T621-d (owner):** the home page hides its scrollbar so the film can reach the window's edge. On desktop Windows that removes the page's position indicator. This was the owner's call, recorded here so a later task does not "fix" it back.

## Rollback procedure

1. App repo: `git revert 744e4d8`. That brings back T620's inset film, credit line, Plan a trip on the film and the opaque header. Note it also brings back the double ask, so keep the two seed guards in AskChat.jsx and ExploreTab.jsx if only the look is rolled back.
2. Root: revert the T621 commit. That covers the rules, the report, the register rows and the mirror.

No data, schema or deploy is involved.
