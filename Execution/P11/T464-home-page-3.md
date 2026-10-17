# T464: The home page, phone first

## Task ID

T464

## Date

2026-10-17

## What changed

The owner liked T463's home page on a desktop. On a phone they found it too long ("I have to scroll too much"), not dynamic or professional enough, and wasteful with the width. On a desktop they found the screens in the hero too small to read, so the value was unclear. They also called several subcaptions generic and three persona photos weak (Without a car, City breaks, On a tight budget). They asked for market research, the impeccable workflow and an easier way back to the home page than the Carta mark.

Research came first:

- **Critique.** A dual-agent impeccable critique (design review plus detector and browser evidence) scored the T463 page at about 29/40 and measured it at 4,006 px tall at 390x844.
- **Market research.** A research agent rendered eleven home pages on a phone with Playwright and four on a desktop, then measured each. The sites were Polarsteps, Wanderlog, Komoot, Airbnb, Hopper, Stippl, Layla, Mindtrip, Roadtrippers, Revolut and Linear.
- **Findings that shaped the build:**
  - The leaders let the product phone peek about 300 px into the first screen instead of fitting a whole phone there (Polarsteps 326 px, Wanderlog about 300 px).
  - On a desktop they show the real UI near 1:1 and about 1,000 px wide. Wanderlog's itinerary is 1,118 px wide with legible 13 px text.
  - Shrinking a screenshot until its text is about 5 px (Linear on a phone) is what makes a product picture decoration instead of proof.

The page now reads in this order:

1. **Hero.** The promise, the search, the question chips and the one primary.
   - **Phone:** a cropped phone rises from a hairline under the primary, its top 300 px in view. That is the Julian Alps trip with its total, ~€1,429.75 for two people. The whole hero fits the first screen at 390x844.
   - **Desktop:** the phone is gone from the hero (it repeated the same total and neither copy was readable). One laptop runs to the page's right edge and is cut by it.
   - **New capture:** the laptop capture was reshot from the app at 1152x720 and 1.5x, so the laptop draws it at 0.80 of its size. The receipt column, with every figure, stays whole.
   - **Chips:** the chip with a budget ("Beaches in Portugal under €80 a day") now leads the row.
2. **Travellers.** The rail moved up from third place, so photography and real prices arrive on the second phone screen instead of the third.
   - The critique caught a trust bug: "From ~€60 est. a day" sat on a photo of the Matterhorn above Zermatt, one of Europe's dearest towns. The figure belonged to a town in Slovenia.
   - Each card is now one real catalogue place, and every one of them is returned by the card's own search:
     - Hikers: Bovec in the Soča valley
     - Families at the beach: Albufeira
     - Without a car: Český Krumlov
     - City breaks: Porto
     - On a tight budget: Mostar
   - The photo shows that place. The solid pill names it and gives its own day price at the traveller's Lifestyle, the same figure Explore shows for it ("Bovec ~€60 est. a day").
   - Cyclists keep their "Cycle routes" pill.
   - Photo sourcing: all five new photographs, and the cyclist's Col d'Aubisque, are Wikimedia Commons files checked by hand. Each one's Commons categories assert its subject. Each original is at least 2,912 px wide. Each carries its author and licence into the credits.
   - What they replaced: the Lisbon and Kraków photos were 960 px catalogue thumbnails with no author or licence, and the Kraków one was a 7,505 x 3,690 panorama crushed into a 4:5 crop.
3. **Story: "Follow a week in the Julian Alps".**
   - **Phone:** each chapter is a white card with its title and one line on top. The chapter's screen rises from the card's lower edge with its top half in view, so a card is about half as tall as one holding a whole phone.
   - **Desktop:** the pinned phone stays, a little larger. The chapters' empty air was cut from 18dvh of padding and 56dvh a chapter to 6dvh and 40dvh.
   - Chapter doors are verbs now: "Plan a trip", "Plan a day", "Open My trips".
4. **Passes.** On a phone each plan is one row, its name and terms on the left and its price on the right, like a fare list. The blurbs and the list of what a pass adds wait behind "Compare passes", which opens the full table. This section was the tallest on the phone page.
5. **Close, then credits.**

Copy was rewritten in all six languages so each line says a concrete outcome:

- `home.sub` is now "See what a day costs a person in each place, then plan the trip and every day of it".
- The story title names the trip it tells.
- The persona lines are shorter, and the chapter lines are about 15 words, verb first.

Section headings are title size on a phone and headline size from 769 px, one step under the h1 at every width.

The way home is named now:

- **Desktop:** a Home tab leads the header nav.
- **Phone:** a Home row tops the Account menu. It is a real link, and it works signed out.

## Files touched

**Modified (app repo, continent-app/):**
- src/browse/home/HomePage.jsx
- src/browse/home/HomeStory.jsx
- src/browse/home/HomeTravellers.jsx
- src/lib/homeDemo.js
- src/styles/61-v6-home.css
- src/styles/22-account-admin.css (a link row in the Account menu reads like its button siblings)
- src/components/AppHeader.jsx (Home in NAV_ITEMS)
- src/auth/AccountPanel.jsx (the Home row, prop onOpenHome)
- src/App.jsx (one line: onOpenHome wired to goToTab('home'))
- src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js
  - home.* copy
  - home.from renamed to home.aDay
  - new keys home.ctaDay, home.ctaTrips and nav.home
- public/home/{en,nl,de,fr,es,it}/desk.webp (reshot, 1728 x 1080)
- scripts/shoot_home_screens.mjs (desk at 1152x720 and 1.5x)
- scripts/verify_home.mjs (new checks: height, laptop, homedoor, Pixel 5 viewports, place pills)
- tests/home.test.mjs

**Modified (root repo):**
- Execution/_OPEN.md

**Created (root repo):**
- Execution/P11/T464-home-page-3.md
- Execution/P11/T464-shots/ (before, after, research)

## Commands run

```
cd continent-app
npx vite --port 5210 --strictPort
node scripts/shoot_home_screens.mjs --port=5210 --only=desk          # it timed out once and was rerun with --lang=it
node --test tests/home.test.mjs
npm test
node scripts/ci/design-lint.mjs
node scripts/verify_home.mjs --port=5210
& impeccable.cmd detect --json src/browse/home src/components/AppHeader.jsx src/auth/AccountPanel.jsx
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before (T463) | After | Delta |
|---|---|---|---|
| Phone page height, 390x844 | 4,006 px | 2,639 px | -1,367 px (-34%) |
| Phone hero height | 885 px | 629 px | -256 px |
| Phone passes section | 1,118 px | 509 px | -609 px |
| First photograph on the phone page (top of the travellers rail) | y 1,987 | y 693 | -1,294 px |
| Desktop laptop screen width, 1440x900 | 586 px (capture at 0.41) | 922 px (capture at 0.80) | +336 px |
| Desktop page height, 1440x900 | 5,324 px | 4,120 px | -1,204 px |
| Critique (design review, heuristics renormalised to /40) | about 29/40 | about 31/40 (25/32), before the follow-up fixes below | +2 |
| Persona photos with author and licence | 4 of 6 | 6 of 6 | +2 |
| Persona prices that belong to the place in the photo | 0 of 5 | 5 of 5 | +5 |
| verify_home | 44/44 (old checks) | 50/50 | +6 checks |
| Unit tests | 453/453 | 451/451 | two cheapest-day tests replaced by one place-price test |
| Design lint, new violations | 0 | 0 | 0 |
| impeccable detect on the changed markup | [] | [] | 0 |

Entry bundle size and LCP were not measured. The eager desktop capture grew from 79 KB to 98 KB (100,014 bytes) for English, because it is drawn twice as large.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The desktop page scrolled sideways (verify_home hscroll) | The bleeding laptop widened the scroll container | `.home-page` is a size container, and the hero reaches its right edge in `cqw` and clips there with `overflow-x: clip` |
| The pinned phone was pushed up at the last chapter (verify_home pinned) | The shorter chapter padding left less scroll under the last chapter than the pin is tall | Bottom padding of the chapters 26dvh, the pinned phone `min(360px, (100dvh - 230px) / 2.25)` |
| A screen reader heard "Bovec~€60" | The place and the price were two spans with only a CSS gap between them | A real space between the spans |
| The Home row in the Account menu drew as a blue underlined link | `.account-menu-row` was only ever a button | `a.account-menu-row` takes the text colour, no underline and a focus ring |
| The second critique found three of five phone chapter cards showed only the top of their capture (status bar and app header), so "See what a day there costs" showed no price and "Take it with you" no export | Every capture keeps its point at a different depth | Each chapter carries a `peek` offset (CHAPTERS[].peek, a share of the capture's height) and its screen rises inside a clipped phone view; the hero trip rises 9% past its header. The second critique's other fixes went in too: the chip row runs to the screen edge on a phone, Free keeps its one line, the desktop story is 32dvh a chapter, the rail reaches into the first desktop screen, the rail heading is "Start from how you travel", and the Albufeira photo shows the sea and the town |
| The Italian desktop capture timed out once | A cold page on the dev server | Rerun with `--lang=it` |
| A Python rewrite of AppHeader.jsx turned CRLF into LF, so the whole file showed as changed | The file is CRLF in the index | The line endings were restored; the diff is the two lines |

## What is still open

T464-a:

- The new persona photographs and places need the owner's eye:
  - Bovec: the ridge above the Soča valley looking at Jalovec, Johann Jaritz, CC BY-SA 4.0
  - Albufeira: Praia dos Pescadores with the sea and the town, Kolforn, CC BY-SA 4.0
  - Český Krumlov: from the castle, Jakub Hałun, CC BY 4.0
  - Porto: the Ribeira with rabelo boats, Jakub Hałun, CC BY 4.0
  - Mostar: Stari Most, Berthold Werner, CC BY-SA 4.0
- The card prices follow the Lifestyle, so they move with it.

T464-b: the research found that the leading pages keep the product story vertical, one chapter about a screen tall, and keep swipe rails for collections. The owner's first complaint was scrolling, so the story stays a compact swipe track on a phone, with Previous, Next and the position. If the owner prefers the vertical form, it adds about 1,500 px to the phone page.

T464-c: `.home-page` now carries `container-type: inline-size`. Layout containment makes it the containing block of any `position: fixed` descendant (memory note "Fixed containing block gotcha"). Nothing fixed renders inside the home page today; a future fixed element there must be portalled out.

T464-d: T463-c (the copy bugs "1 tips" and "A long walk.Bus or tram" that show in the day captures) lives in the day planner files, outside this task's scope. T435, the whole-app finish review, fixes the strings and reshoots the day and share captures.

T464-e: LCP and CLS on a throttled phone are still unmeasured (T463-f). The desktop hero's eager capture is now 98 KB (100,014 bytes).

## Rollback procedure

In the app repo: `git revert -m 1 <merge of p11-home-page-3>`. The desk captures come back with the revert, because they are tracked files. In the root repo, revert the report commit. No data, schema or deploy state depends on this task until the deploy at the end of T435.
