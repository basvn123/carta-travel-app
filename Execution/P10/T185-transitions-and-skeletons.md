# T185: G2 + G3: Shared element transitions, skeletons never spinners

## Task ID

T185 (mind-map T189). Branch p10-g2-g3-transitions in both repos.

## Date

2026-10-03

## What changed

Opening a destination from an Explore card or a rail card, or a trip from a Destinations trip card, now grows the card's photograph into the header photograph of the page it opens, instead of the page appearing over the grid. It uses the browser's View Transitions API. Where that API is missing, or the traveller has asked for reduced motion, the page opens exactly as before.

The mechanism is two small functions in continent-app/src/lib/sharedElement.js. openShared runs at the click: it gives the card's img a view-transition-name, starts the transition and commits the state change inside it. claimShared runs in the new page: the first gallery photo of DestinationPage, or the hero img of TripPage, takes the same name when it mounts, which is what lets the browser treat the two pictures as one. The transition waits up to 450 ms for that claim, because the trip page fetches its detail after opening and its photograph is not there on the first frame. If it never arrives the transition simply cross-fades. The card's name is removed before the new snapshot is taken, because two elements with one name would make the browser skip the transition; the page photo's name is removed 700 ms later so nothing lingers. The 260 ms duration and a reduced-motion branch that sets every view-transition animation to none sit at the end of src/styles/27-states.css, the file T189 added.

G3, skeletons never spinners, was finished by T189 (wave 12): its report records the five spinner rules deleted and every loading state moved to LoadingBlock at final dimensions. I re-grepped src for rotating rings, spin keyframes and Spinner components and found none, so nothing more was needed for the done condition, and I did not redo that work. The destination page's gallery already reserves its box in CSS before the photo lands.

## Files touched

Modified, in continent-app: src/browse/ExploreTab.jsx, ExploreRails.jsx, DestinationsTab.jsx, DestinationPage.jsx, TripPage.jsx, src/styles/27-states.css.

Created: continent-app/src/lib/sharedElement.js, this report. Deleted: nothing.

## Commands run

npm run lint (0 errors, 72 warnings, the same count as T189), npm test (156 pass), npm run build (passes, dist and dist-data deleted), and a headless Playwright run on a Vite on port 5208 (strictPort), stopped afterwards. Screenshots are in C:\Users\Gebruiker\Documents\Portfolio\wt\T185-shots\.

## Config and secrets set

None. No i18n key was added, so the six catalogues are untouched.

## Before/after measurements

Measured in headless Chromium at 380 and 1280 px by wrapping document.startViewTransition and opening the first Explore card.

| Metric | Before | After | Delta |
|---|---|---|---|
| View transitions started on opening a destination | 0 | 1, finished (both widths) | +1 |
| Elements left holding a view-transition-name afterwards | not applicable | 0 | none |
| Horizontal scroll at 380 and 1280 px (scrollWidth minus clientWidth) | 0 | 0 | none |
| Spinner rules and components in src | 0 (after T189) | 0 | none |

The mid-transition screenshot at 1280 px shows the Trevi Fountain card photo in flight over the opening Rome page.

## What broke and how it was fixed

The first browser run found no cards because the app opens on Destinations; the harness now loads ?tab=map. Nothing else.

## carta-design pre-ship questions

1. No hex value added. 2. No gradient, no new colour. 3. Ochre, teal and danger untouched. 4. No mono text added. 5. No button added or changed. 6. No copy added, no em dashes. 7. The one thing removed: I dropped a planned reverse transition on closing, because it would have needed a second named element and the default cross-fade is calm enough. Motion is 260 ms on the browser's transform and opacity morph, with a reduced-motion branch.

## What is still open

The day card opening into a full map has no photograph to expand: in this app a day is picked from a sheet (WhichDaySheet) and the workspace opens on a map, so there is no shared image. That half of G2 needs a design decision on what the day card shows first (T185-a). Closing a page does not reverse the morph (T185-b). Browsers without the View Transitions API, notably Firefox at the time of writing, get the old behaviour. The beach, lake, mountain and region cards were not wired because their pages do not carry a photo header of the same shape.

## Rollback procedure

Revert the app commit on branch p10-g2-g3-transitions, or reset master to eea4eee before merge. Code and CSS only; no migration, no data.
