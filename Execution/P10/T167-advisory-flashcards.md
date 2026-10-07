# T167: Advisory sections become swipeable flashcards

## Task ID

T167 (mind-map number T171)

## Date

2026-10-07

## What changed

On the journey page, Good to know, Pro tips and What could go wrong now run as three decks of small cards. One card is in view. Each card has a 20 px line icon and at most 35 words. The icon follows the words of the card: a warning triangle for a risk, a coin for money, a cloud for weather, a clock for booking timing, a bulb for a plain tip. Good to know keeps the row's own label (Money, Weather and so on) above the text. Previous and Next are visible secondary buttons, the position reads "2 of 9" in mono, the arrow keys move one card when the deck has focus, and a swipe of 48 px or more is a shortcut for the same two buttons. A "Show all" link turns the deck into a plain list, and printing shows the list. The card is the carta-design deck card: white fill, 1 px rule border, square corners, no flip, no stacked shadow, a 250 ms transform that is switched off under reduced motion. What could go wrong stays outside a fold, as T164 decided, so a safety advisory is still on the page without a tap.

The cap is met by splitting, never by cutting. The source prose is still over the cap (T152-a, T152-b), so src/lib/flashcards.js splits each item at render time: first at sentence ends, joining two neighbours only when one is under eight words and both fit, then an over-long sentence at the semicolon, colon or comma nearest its middle, and as a last resort at the middle word. A bold run that crosses a split is closed and reopened so no card leaks a stray marker. Every word of the source survives, in reading order. The icon is chosen from the card's own words (weather first, then money, then timing), falling back to the deck's default; this is English only, which matches the trip content, which is English only.

Before and after, counted over all 253 journey files in public/journeys/journey with the same split function the page uses (a throwaway script, run from the app worktree). Items are what the page rendered as one block before: each Good to know slot, each pro tip, each risk with its What to do line.

| Metric | Before | After | Delta |
|---|---|---|---|
| Good to know blocks over 35 words | 928 of 1,972 | 0 of 4,208 cards | -928 |
| Pro tips over 35 words | 309 of 1,771 | 0 of 2,793 cards | -309 |
| Risks over 35 words | 113 of 469 | 0 of 812 cards | -113 |
| All advisory blocks over 35 words | 1,350 of 4,212 | 0 of 7,813 cards | -1,350 |
| Longest deck on one trip | not applicable | 36 cards | |

Show all exists because a 36 card deck is slow to swipe. In the browser the sample trip (The Donauradweg) rendered 3 decks and 34 cards, none over 35 words, at both widths.

## Files touched

**Modified (continent-app):**
- src/browse/JourneyPage.jsx
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js
- src/styles.css (one import line)

**Created (continent-app):**
- src/browse/FlashDeck.jsx
- src/lib/flashcards.js
- src/styles/33-flashcards.css
- tests/flashcards.test.mjs

**Modified (root):**
- Execution/_OPEN.md

**Created (root):**
- Execution/P10/T167-advisory-flashcards.md

JourneyPage.jsx lost the LogRow component, which only Good to know used, and the DetailRow import with it. DetailRow itself is untouched and still serves the other pages. The old list styles in 25-feature-pages.css (.jpage-lrows, .jpage-tips li) are now dead for this page but were left alone, because the task named no stylesheet and the other detail pages may share them.

## Commands run

Run from the app worktree: `node --test tests/flashcards.test.mjs`, `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs`, `npm run build` (then dist/ and dist-data/ deleted), and each of the six i18n files parsed with `node --input-type=module -e "import('./src/i18n/xx.js')"`. A Vite server on port 5203 and a headless Chromium script drove the journey page at 380 and 1280 px; the server was stopped afterwards. Screenshots are in C:\Users\Gebruiker\Documents\Portfolio\wt\T167-shots.

## Config and secrets set

None. The shell's Supabase variables were unset and the live project was never contacted.

## Before/after measurements

See the table under What changed. Lint went from 72 warnings, 0 errors to the same. Tests are 219 of 219 passing, seven of them new. design-lint reports 196 violations, all in the baseline, 0 new.

## carta-design, the seven questions

1. No hex value was added; every colour is a token.
2. No gradient, no new colour, no second saturated hue.
3. Ochre, teal and danger are not used. The icons are `--ink-soft`.
4. The only mono text is the position counter, a count. Card text is the UI face.
5. There is no primary button on the decks; Previous and Next are both secondary.
6. No em dashes or banned words in the diff. The new labels are Previous, Next, Show all, Show as cards and the number "of" number counter.
7. Removed: the per-row chevrons and six-word previews of Good to know, which a deck makes redundant, and any flip or peek of the next card.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The mono counter rendered in the UI face | The `.mono` class carries no font on this page | `.flash-pos` sets `font-family: var(--mono)` itself |
| Headless run failed to find the Trips category | At 1280 px the left rail uses `.side-cat`, at 380 px `.places-cat` | The check script picks the selector by width |
| Console warning validateDOMNesting, a paragraph inside a paragraph | Not from this task: the hook line at JourneyPage.jsx line 581 puts a Prose paragraph inside a p. It appeared on the page before and after | Left alone, raised as T167-c |

## What is still open

The destination, lake and mountain pages still print their own tips and hazards as lists (T167-a). The journey verify script still only checks that the pro tips fold exists, not that three decks render (T167-b). The nested paragraph warning above is T167-c. The source prose is still over the cap on most trips, so cards come from splitting; the rewrite is T152-b and when it lands the splitter will mostly do nothing. Splitting a long item can leave a card that begins mid-thought; a rewrite fixes that better than any splitter.

## Rollback procedure

Revert the two merge commits, app repo first, then root. Nothing in data, schema or the wire changed, so nothing else needs undoing. To roll back in place, restore the removed JSX from the parent commit: the `LogRow` component and the three list blocks in JourneyPage.jsx.
