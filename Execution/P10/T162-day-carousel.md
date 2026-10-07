# T162: Day by day becomes a horizontal day track

## Task ID

T162 (mind-map number T166). Branch p10-c2-day-carousel, in both repos.

## Date

2026-10-07

## What changed

Day by day on the journey page was seven stacked blocks. It is now one row of seven day cards that the reader swipes, steps or keys through. Each card carries the day number, the day title, the measured line (dayStats), the night, and the "More about this day" control from T163, which still opens the morning, afternoon and evening inside the card. The section with every day closed is now 403 px tall instead of 1,389 px on a 380 px phone, and 428 px instead of 1,033 px at 1280 px, on the Parenzana cycling week.

The track follows the Day track rule the owner put in the carta-design skill on 2026-10-07. On a phone a card is 85 percent of the track width, so the edge of the next day shows and says there is more. From 1024 px three cards sit side by side. The row uses scroll-snap-type x mandatory, so a swipe always settles on the start of a card. Above the track, right aligned, sit the position in mono ("Day 3 of 7") and two secondary buttons, Previous and Next, 44 px high. Under it are seven 6 px dots in --rule with the current one in --ink-fill; they are aria-hidden because the counter already says the same. The track itself takes focus, and while it has focus the arrow keys move one day and Home and End go to the first and last day. There is no autoplay and no looping: Previous is disabled on day 1 and Next on day 7. Under prefers-reduced-motion the buttons and keys jump instead of gliding.

How it works. The row is a generic component, browse/DayTrack.jsx, that takes the cards as children and knows nothing about journeys. The arithmetic lives in lib/dayTrack.js as pure functions with node tests: which card the scroll position is on, where to scroll for a card, and what a key does. The one subtle part is the end of the row on desktop. With three cards in view, days 5, 6 and 7 share the last scroll position, so the position cannot be read from scrollLeft alone. The current day is therefore state: Next from day 5 moves the counter and the dot to day 6 without moving the row, and a scroll reading near the end does not pull the index back below the day the reader stepped to. While a button or key glides the row, scroll events are ignored until it arrives (or 900 ms pass, in case the reader swipes mid-glide), so the counter does not flicker through the days in between. Tabbing onto a control inside a card makes that card current, so the counter follows the keyboard too. Arrow keys act only when the track itself has focus: on a button inside a card they would slide the focused button out of view.

The card itself stays in JourneyPage.jsx (the Day component), because it uses the page's Prose and EstMark. Three things changed in it.

The measured line is now split. lib/journeys.js gains dayStatsParts, which returns the line in parts with the separator that goes before each, so the parts joined are the line exactly as written (dayStatsLine is now built on it). A v2.1 object gives one mono part per figure and the note in sans, and the estimate mark sits on the one figure the ledger calls an estimate (dayFigureEstimated). That closes T143-h and T146-f. A v2.0 string is split only between its own parts (" / ", "; ", ". " and the middot the authored data uses): the run of parts that open with a figure stays mono, and from the first part that opens with a word the rest is set in sans. No word is changed, only the face. Over the 1,547 published v2.0 lines the join is exact on every one; 393 stay wholly mono, 749 split, and 405 open with a word ("approx. 8 km", a place name) and are set wholly in sans, which is what the mono rule asks for a number inside a sentence. Before, all 129,798 characters of those lines were mono, including sentences like "bring a sleeping-bag liner"; now 29,584 are.

The night shows on far more days. Only 490 of the 1,771 published days carry their own sleep line. A day without one now shows the base the week plan already reads for that night (weekBases from lib/weekShape.js, written by T170: one basecamp for the week, or basecamps placed on nights from the prose). It is labelled "Base:" rather than "Night:" on purpose. On the Bayerischer Wald week the one basecamp is Waldhäuser, but day 4 is "a night at Waldschmidthaus"; "Night: Waldhäuser" would be false there, "Base: Waldhäuser" is what the trip says.

The photograph of the day's main feature is wired but has no data. No trip on the wire carries a per-day photo; the named-highlight photos are T140's work, and T140 is gated in wave 20. The card reads itinerary[i].photo {url, w, h, name, credit, page} when it exists, with a credit line and a lazy srcset, and otherwise shows no picture. Borrowing the hero for every card would have made seven identical photos that name nothing. This is register row T162-a.

The new CSS is src/styles/32-day-carousel.css, imported last in src/styles.css. In the track the day card is a bordered object (--bg-card, 1px --rule-soft, 10 px radius) instead of a hairline-divided block, the day number turns from --rate to --ink-soft (it is a position, not a rating), and the sans part of the measured line is 12.5 px --ink-soft so a long note is readable. The stacked styles in 25-feature-pages.css are untouched. The section ids sec-why, sec-budget, sec-itin, sec-sleep, sec-log and sec-pack are unchanged, so T165's rail still lands on them; each card also gets an id, jday-1 to jday-7.

scripts/verify_keyboard.mjs gained an after-check on its journey surface: with the track focused, Home then ArrowRight must move the counter to day 2 and leave focus on the track. Its Tab walk already reaches every card's control. That closes T190-a. The cards reuse T163's tday-panel accordion, which closes T163-b.

## Files touched

Modified, in continent-app: src/browse/JourneyPage.jsx, src/lib/journeys.js, src/styles.css (one import line), src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (five keys each: journey.trackPos, trackPrev, trackNext, trackAria, dayBase), scripts/verify_keyboard.mjs.

Created, in continent-app: src/browse/DayTrack.jsx, src/lib/dayTrack.js, src/styles/32-day-carousel.css, tests/dayTrack.test.mjs.

Root repo: created Execution/P10/T162-day-carousel.md; modified Execution/_OPEN.md.

## Commands run

All in the app worktree C:\Users\Gebruiker\Documents\Portfolio\wt\T162-app unless noted. The Vite dev server ran on port 5202 with a wrapper config outside the repo (wt\T162-app-vite.config.mjs) whose only change is its own cacheDir; see "What broke".

node node_modules/vite/bin/vite.js --config ../T162-app-vite.config.mjs --port 5202 --strictPort --host 127.0.0.1

node wt/T162-measure.mjs before, then the same with after (section and page heights).

node wt/T162-shots.mjs (the browser check, three runs: 380 and 1280 with reduced motion, 380 with motion).

node scripts/verify_keyboard.mjs --port 5202 --only journey --widths 380,1280 --out wt/T162-shots/keyboard

node wt/T162-nights.mjs and node wt/T162-split.mjs (the wire counts below).

npm run lint (0 errors, 72 warnings, none new: the one warning in a touched file, an unused spec in JourneyPage.jsx, was there before); npm test (221 pass, 0 fail, 8 of them new in tests/dayTrack.test.mjs); node scripts/ci/design-lint.mjs (196 violations, all in the baseline, 0 new); the six i18n files parsed with the session rule 8 loop; npm run build (passes), then dist and dist-data deleted. The dev server was stopped after the checks.

## Config and secrets set

None.

## Before/after measurements

Heights measured in a headless browser on the journey page with every day closed, with wt/T162-measure.mjs. The page height is the scroll height of the journey page.

| Metric | Before | After | Delta |
|---|---|---|---|
| Day by day section, Parenzana, 380 px | 1,389 px | 403 px | minus 986 px (71 percent) |
| Day by day section, Bayerischer Wald, 380 px | 1,460 px | 560 px | minus 900 px (62 percent) |
| Day by day section, Parenzana, 1280 px | 1,033 px | 428 px | minus 605 px (59 percent) |
| Day by day section, Bayerischer Wald, 1280 px | 1,017 px | 658 px | minus 359 px (35 percent) |
| Whole page, Parenzana, 380 px | 6,359 px | 5,374 px | minus 985 px |
| Whole page, Bayerischer Wald, 380 px | 6,207 px | 5,307 px | minus 900 px |
| Whole page, Parenzana, 1280 px | 5,469 px | 4,863 px | minus 606 px |
| Whole page, Bayerischer Wald, 1280 px | 5,168 px | 4,809 px | minus 359 px |
| Days that show a night or base, all 253 trips | 490 of 1,771 | 1,337 of 1,771 | plus 847 (all labelled Base) |
| Trips with any night shown on a day | 70 of 253 | 191 of 253 | plus 121 |
| Characters of v2.0 measured lines set in mono | 129,798 | 29,584 | minus 100,214 (now sans) |

The night and mono counts come from wt/T162-nights.mjs and wt/T162-split.mjs, run over the 253 files in continent-app/public/journeys/journey. Bayerischer Wald shrinks less at 1280 px because its day 4 measured line is 442 characters, the longest on the wire, and the tallest card sets the row's height.

## Browser check

Headless Chromium against the dev server, at 380 px and 1280 px, on the Parenzana cycling week and the Bayerischer Wald nature week, with screenshots in C:\Users\Gebruiker\Documents\Portfolio\wt\T162-shots\. Every check passed at both widths: seven cards and seven aria-hidden dots; no horizontal scroll on the document or the page scroller; card width 274 px in a 330 px track on the phone (85 percent of the width inside its 4 px padding) and 211 of 666 px on desktop; Previous disabled on day 1; Next to day 2 and Previous back; two ArrowRight presses to day 3; End to day 7 with day 7 fully in view and Next disabled; a further ArrowRight stays on day 7; Home back to day 1 with scrollLeft 0; the focus ring on the track (2px --accent); a free scroll stopped 70 percent of the way to day 2 snaps to day 2's start and the counter follows; T163's detail opens in the first card (212 to 605 px tall on the phone, 235 to 754 px on desktop for Parenzana) with no horizontal scroll and closes back to the same height; Tab from the track enters the first card. No page errors. A third run at 380 px without reduced motion confirmed the smooth glide lands on day 2. The keyboard audit passed on the journey surface at both widths: 55 stops, none without a ring, none covered or invisible, nothing pointer-only, and both new track checks true.

## The seven carta-design questions

1. No hex value: the new CSS uses tokens only.
2. No gradient, no new colour, no second saturated hue; the only --accent is the focus ring.
3. Ochre is now used less: the day number in the track turns from --rate to --ink-soft. No teal, no --danger.
4. Mono carries the position, the day number and the figures of the measured line; the words of that line and every label are sans. A v2.0 line that opens with a word is wholly sans, so a few figures inside those lines read in sans, which the mono rule allows for a number in a sentence.
5. No primary button: Previous and Next are secondaries. The page's one primary is unchanged.
6. No new headline. The new strings are "Day {n} of {total}", "Previous", "Next", "Base:" and the track's screen-reader name; no em dash, no middot, no banned word. The one middot in the code is a regex escape that reads the authored data, written as \xB7 so the code carries no middot character.
7. Removed: the stacked day's top hairline inside the track (each card has its own border) and the ochre on the day number. I considered a highlight on the current card at desktop width and left it out, since the counter and the dots already say where you are.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The dev server served a blank page with "504 Outdated Optimize Dep" | node_modules in the app worktree is a link to the main checkout, so the Vite dependency cache is shared by every session's dev server and each rebuild invalidates the others | Ran Vite through a wrapper config outside the repo that sets its own cacheDir (wt/T162-vitecache); register row T162-d |
| The first desktop browser run failed "the counter follows a swipe" | The check scrolled by 70 percent of a card's offsetLeft, which includes the page margin on desktop, so it scrolled two cards | Fixed the check to use the distance between two cards; the component already measured it that way |
| design-lint reported one new middot | The separator regex held a literal middot character | Wrote it as \xB7 |
| One keyboard-audit run at 380 px stopped after one stop | The style card click timed out with four sessions loading the laptop | Re-ran; it passed |

## What is still open

The photo of each day's main feature has no data until T140 writes per-day photos (T162-a). The Day track rule wants every day reachable as a link from the page's own list or rail; the cards have ids jday-1 to jday-7 and nothing links to them yet, which the week plan strip or T165's rail can do once T165 is merged (T162-b). The composed trip page (TripPage.jsx) still stacks its days; DayTrack.jsx would carry them unchanged, and whether to is the owner's call (T162-c). The shared Vite cache trap is T162-d.

T170-d (label the cards by the condition they need on winter and water weeks) is not taken: the cards still read Day 1 to Day 7, and that row stays open. The base fallback is only as good as weekBases; per-day sleep lines are missing from 1,281 days, which T170-b already asks the owner to fill.

Spec items around the track that this task did not build: F5 (a small map per day card) and G2 (a card thumbnail growing into a full view).

## Rollback procedure

Revert the single app commit on p10-c2-day-carousel (git revert, or reset to its parent f05e901). The root commit carries only this report and the register rows; reverting it reopens T143-h, T146-f, T163-b and T190-a. No data, schema or migration is touched.
