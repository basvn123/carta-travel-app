# T169: Booking order, bookingWindows as a ticked checklist

## Task ID

T169 (mind-map number T173). Branch p10-m4-booking-order in both repos.

## Date

2026-10-03

## What changed

The booking windows paragraph on a journey page is now a "Book in this order" section. Each clause that carries a lead time becomes a step with the lead time in mono ("3-4 mo", "2-4 wk") and a tick box, sorted with the furthest lead time first so the first row is the one to act on today. Ticks are kept in localStorage on the device, one key per trip (carta.booked.<tripId>), and the closed section header shows "1 of 3 booked". Clauses with no lead time ("unstaffed refuges cannot be booked at all") are not dropped; they sit under the steps as "Also worth knowing". Because the section carries every authored word, the old Booking windows row in Good to know is hidden when the section shows. No flight price appears anywhere: a flight clause is only ever a lead time.

It works on the existing text with no new data. src/lib/bookingOrder.js splits the paragraph on sentence ends and semicolons, reads each clause for a range ("3-4 months", "three to four weeks", en dashes included), a single span ("a week"), or a loose phrase (months, a few days, as soon as the season opens, same day), and keeps the longest span in a clause as its sort key. A hyphenated length such as "a 7-day pass" is deliberately not read as a lead time. src/browse/BookingOrder.jsx renders it inside the shared Fold, placed above Good to know, closed by default like the other written sections.

For trips with no bookingWindows paragraph, the same parser also reads typeSpecific.bookingTimeline and typeSpecific.hutBooking, and those two rows are hidden from the data sheet when steps exist, so nothing prints twice.

Checked in a browser at 380px and 1280px (one Vite server on 5208, stopped afterwards): the section opens, a tick strikes the row through, the key is written, and the page has no horizontal scroll at either width. The lead column sits on its own line under the box at phone width.

## Files touched

Modified (continent-app, branch p10-m4-booking-order, commit b3837a6): src/browse/JourneyPage.jsx, src/styles/25-feature-pages.css (appended block, styles.css import list untouched), src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (twelve journey.book* and journey.lead* keys each; all six parse).

Created: src/browse/BookingOrder.jsx, src/lib/bookingOrder.js, tests/bookingOrder.test.mjs (four cases, pass).

Root repo: this report and the register rows only.

## Commands run

node --test tests/bookingOrder.test.mjs; npx eslint on the four JS files (clean); the six-file i18n parse from the session rules; a throwaway coverage script (kept out of the repo) that ran bookingOrder over the 253 files in Trips/carta-unified/carta-unified/data/trips; a Playwright pass against http://127.0.0.1:5208. npm run build was not run: the laptop has under 1 GB of free RAM and the orchestrator runs the build at merge.

## Config and secrets set

None.

## Before/after measurements

Figures come from running the parser over Trips/carta-unified/carta-unified/data/trips (253 trips), the same trips the app serves from public/journeys/journey.

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips showing a tickable booking checklist | 0 | 175 of 253 | +175 |
| Trips whose booking text is only notes (no lead time found) | not applicable | 12 | |
| Trips with no booking text at all (logistics.bookingWindows null, no data-sheet slot) | 66 | 66 | 0 |
| Steps produced / notes kept | not applicable | 471 steps, 336 notes | |

187 trips have a source text (186 with bookingWindows, plus one that only has a data-sheet slot).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Ranges never matched in the first test run | A shell heredoc ate the backslashes in the regex strings | Rewrote them with String.raw |
| i18n files showed a 7,000-line diff and two failed to parse | My first write converted CRLF to LF, and French and Italian apostrophes were unescaped | Reverted and rewrote the six files byte-wise, keeping CRLF, with escaped apostrophes |

## What is still open

The brief says a checklist on every trip, but 66 of the 253 trips have no booking text, and inventing steps would be fabricated advice. Those trips show no section. Filling them is an authoring job, and it is in the register. The parser is heuristic: 336 clauses had no recognisable lead time and show as notes, and a clause that names two lead times is ordered by the longer one. A reviewer sampling steps may want a flag on unsure ones; that is not built. Ticks are per device, not synced to an account.

## Rollback procedure

Revert commit b3837a6 on continent-app master (git revert b3837a6) and drop this report and its register rows from the root. No data, schema or migration is involved, and the localStorage keys are harmless if left behind.
