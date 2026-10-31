# T955 to T959: the home page polish (proof, tour, clips, Try it, plans)

## Shared header

Owner request, 2026-10-31, after the home v3 deploy (T954): "I absolutely love it". Asked for:
- the proof blended in more cleanly, using impeccable;
- the clips up to date and correctly placed, including a recording for Together, which had none;
- "everything in one place" more compact, more dynamic, with what Carta can do standing out;
- the plan sentence removed;
- Try it cleaner and more Carta-like.

Mid-task the owner added: "you have full freedom, use /impeccable /motion and you can ignore the design rules", "more dynamic, more clean, more wow feeling", "it needs to still be one coherent top part" and "I want no pause/play icons".

Four research agents ran first, one each on the tour, the proof, Try it and the clip recorder. Their specs drove T955, T956 and T958, and their audit drove T957. Under the owner's design freedom (carta-design, 2026-10-30) these defaults were departed from:
- a count-up on the Carta total;
- a one-time sheen (a gradient) across the Carta bar;
- a soft radial glow behind the tour's phone;
- a colour tone per tour chapter (sun, lagoon, umber, mist, sea, all from existing tokens);
- a bounce of 0.25 to 0.45 on the small arrivals.

Accessibility, the money formatter, the six languages and the no-dash rule still hold.

One coherent language runs through all three sections:
- the same white card with the same soft umber shadow and foot strip, for the proof and Try it;
- the same springs from `motionKit.jsx`;
- the same cost colours.

Branch `p15-home-v3-polish` in the root repo only. Like T879 to T954, this work was not mirrored into the inner `continent-app` repo (T954-b).

**Commits:**
- 843220d4e5 (T959)
- 7014264d13 (T955, T956 and T958 together, because they share `62-home-story.css` and the six catalogues, so they revert together)
- bfe22d7f9b (T957)

**End check:** run on the dev server (`npx vite --port 5203`, seams on) at 1440x900 and 390x844, with the hero and proof's flight data mirrored from the data host into a scratch `public/_t955flights/` (deleted afterwards). The data host's CORS does not allow localhost. Not deployed.

## Task ID

T955, T956, T957, T958, T959

## Date

2026-10-31

## What changed

**T955, the proof.** The card and the loose pill row under it ("Every place, priced for your trip", three white pills, an arrow and "Your total") are now one card in three bands:
- The two bars on one scale. The flight site's row shows the rest of the week as an empty dashed track. The Carta bar has 3 px gaps, its share printed inside each segment, and one sheen that crosses it once after it lands.
- Each cost as a line with its icon, figure and share, plus what moves it: "Your airport and your dates", "How you stay, and who shares", "How you like to eat". This carries the old pills' idea, tied to the figure each one drives. Food per person does not move with the number of people, so that pill's claim was not carried over.
- A foot strip with "Every place in Carta is priced this way, for your trip.", the Lake Bled note and the one button.

The Carta total counts up from the flight's price to the week's total once, in the reader's money format, with a fixed-width ghost so the layout never shifts. Reduced motion shows the total at once.

**T956, the tour.** Five stacked chapters are now one stage:
- **Desktop:** the chapters as a vertical tablist on the left with the open chapter's panel under it, and on the right one large phone (292 px wide) on a ground tinted per chapter with a soft glow.
- **Phone:** a row of pills, the stage, then the panel.

While the section is in view the tour plays itself through once. Each tab's bar fills with its clip, and the chapter's three lines light up at a third and two thirds of the clip, the newest also shown as a note beside the phone. After one round it rests on Ask.

The owner asked for no pause or play icon, so the tabs are the control: a tap or a key on one takes over for good and its clip loops, and the tour holds its chapter while the pointer or focus is on the tabs. Arrow keys, Home and End move between tabs. Nothing plays behind a hidden browser tab. Under reduced motion nothing plays by itself, every line is lit, and no notes show.

**T957, the clips.**
- The recorder reached two wrong screens. The plan clip's scroller (`.map-drawer-scroll`) no longer exists on the trip page; it is now `.tpg-body`, and the day drawer is `.dayws-drawer .map-drawer-scroll`. Together recorded the hub, while the tour promises a budget and Settle up; it now records the Summer 2027 group trip (`?tab=together&tv=group&tg=g-summer&friendsmock`), waiting for its title first.
- Ask's answer now scrolls the chat (`.ac-body`) and Explore the place page (`.pt-scroll`).
- My trips hides the seam's moderation statement, which is test data for the DSA work and not a traveller's usual state, and starts from the top.
- Recorded in all six languages: ask, explore, trips and together for the first time, and day again (30 clips, 15 MB, each inside the test's 20 KB to 1.6 MB budget).
- `homeDemo.js` lists `TOUR_CLIPS`, and the clip test now covers them. The tour shows each chapter's own poster.

**T958, Try it.** The same white card as the proof:
- **The ruler.** The budget figure is set large and the slider is a price ruler: each place a dot at its own day price (saffron for best value, teal when it fits, hollow when over), the native range input over it for keys and screen readers.
- **The cards.** Photos are 4:3 rather than 4:5, with the name and price on one line. Over-budget places are no longer fully grey: they keep some colour and say "€5 over". The best-value chip moved to the photo's lower edge.
- **The foot.** The same foot strip carries "3 of these 5 fit your budget." and the door. A polite live sentence reads the budget and the fit after the drag settles.

**T959.** The home page no longer shows "Planning is free. A Trip Pass adds exports, more saved trips and more AI plans." carta-design's free-sentence rule now names five places, not six.

## Files touched

**Modified:**
- `continent-app/src/browse/home/HomeProof.jsx` (T955)
- `continent-app/src/browse/home/HomeTour.jsx` (T956)
- `continent-app/src/browse/home/HomeTry.jsx` (T958)
- `continent-app/src/browse/home/HomePlans.jsx` (T959)
- `continent-app/src/styles/62-home-story.css` (T955, T956, T958)
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (seven new home strings; five retired: `home.yoursTitle`, `home.inDates`, `home.inPeople`, `home.inStay`, `home.inTotal`)
- `continent-app/src/lib/homeDemo.js` (T957, `TOUR_CLIPS`)
- `continent-app/scripts/record_home_clips.mjs` (T957)
- `continent-app/tests/home.test.mjs` (T957 clip coverage; the five retired strings)
- `continent-app/public/home/clips/{lang}/day.mp4` and `.webp` (T957, re-recorded)
- `.claude/skills/carta-design/SKILL.md` (T959)
- `Execution/_OPEN.md`

**Created:**
- `continent-app/public/home/clips/{en,nl,de,fr,es,it}/{ask,explore,trips,together}.mp4` and `.webp` (T957)
- `Execution/P15/T955-T959-home-polish.md`
- `wt/vite.t955.mjs` (outside the repo, the fast build config)

**Deleted:** none.

## Commands run

1. `npx vite --port 5203 --strictPort` with `VITE_E2E_SEAMS=1`.
2. `node scripts/record_home_clips.mjs --port=5203 --only=explore,day,trips,together`, then `--only=ask`, then `--lang=nl,de,fr,es,it --only=trips` after the My trips fix.
3. `npm test`: 1204 pass, 0 fail.
4. `npx eslint` on the touched files: 0 errors (the usual unused-var warnings for `m.*` and JSX icon tags).
5. `PF_OUT=wt/out-t955 node node_modules/vite/bin/vite.js build --config ../../wt/vite.t955.mjs`: builds, entry `index-qq4BTubi.js`, `HomeStory` chunk 170,916 bytes.

## Config and secrets set

None.

## Before/after measurements

Section heights, measured in the browser. Before is live production (T954); after is the dev server.

| Section | Before 1440 | After 1440 | Before 390 | After 390 |
|---|---|---|---|---|
| Proof | 1,005 px | 935 px | 1,168 px | 947 px |
| Everything in one place | 3,538 px | 1,182 px | 4,755 px | 1,300 px |
| Try it | 672 px | 788 px | 982 px | 858 px |
| The three together | 5,215 px | 2,905 px | 6,905 px | 3,105 px |

Try it grew 116 px on desktop, because the ruler and the foot strip now sit inside the card rather than beside the heading. It shrank 124 px on a phone. Clips the tour plays from its own recording rose from 1 of 5 (day) to 5 of 5, in all six languages.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Together clip opened on Explore and started mid-page | The group view opens after Together's own load | The recorder waits for `.tg-head.is-sub .tg-h1` and scrolls to it |
| My trips clip showed "We took this guide off the public guides" and started scrolled | The seam's fixture carries a moderation statement | Hidden in that clip only; scroll reset before recording |
| Proof button label brown on brown | `.hm-compare-foot span` also hit the button's label | Scoped to `.hm-compare-foot p span` |
| Next chapter's lines lit for a moment after a switch | The clip fading out kept reporting progress | `useIsPresent`: a leaving clip is silent |
| Clip test failed once | It read `fr/day.mp4` while the recorder was writing it | Re-ran after recording: pass |
| Fast build failed to start | `wt/vite.t474.mjs` no longer exists | `wt/vite.t955.mjs` from the T874 pattern |

## What is still open

T956-a: the owner asked for no pause or play icon. WCAG 2.2.2 asks for a way to pause anything moving more than 5 s. The tabs stand in: a tap stops the auto-advance for good, and the tour holds while the pointer or focus is on the tabs. It plays through once only, and it plays nothing under reduced motion. A strict audit may still flag it, like the hero film (T620-a).

T957-a: the hero on a phone shows two bars, the app header and the film's own "Carta / Log in" bar. It shows on live production too (seen at 390 on 2026-10-31), so it predates this batch. It belongs to the hero (`HomeHero.jsx`, `61-v6-home.css`), outside these tasks.

T957-b: the older clips (find, place, plan, share) are now only fallbacks the tour never reaches. The plan clip's recorder path is fixed but not re-recorded. Either re-record them or retire them, with the story test that still lists them (`CHAPTERS`).

Still open from before: T953-a (`verify_home.mjs` checks retired sections) and T954-b (the inner repo behind the root). This batch closes T952-a (the four tour clips).

Not deployed. Deploying is the T954 procedure. No R2 data changed, but T954-a's data push is still pending.

## Rollback procedure

Per task: `git revert bfe22d7f9b` (T957), `git revert 7014264d13` (T955, T956 and T958 together), `git revert 843220d4e5` (T959). Revert T957 before the other two only if its test changes are unwanted. It has no code dependency on them. The branch is not merged; deleting it undoes the whole batch.
