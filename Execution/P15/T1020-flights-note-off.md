# T1020: the price card's flights drop the source line

## Task ID
T1020

## Date
2026-11-03

## What changed
The owner asked to remove "Google Flights, checked 31 Oct 2026. Prices may have changed." from under the flight passes on the place page's price card (T1019). Under the passes there is now only the Book button, on the right. It still opens the return on Google Flights in a new tab, and its accessible name says "Find on Google Flights".

This departs from the carta-design rule that every external booking link says in words that the price may have moved. The owner decided against it here.

## Files touched
**Modified:**
- `continent-app/src/browse/DestPriceCard.jsx`
- `continent-app/src/styles/88-place-template.css` (`.dpc-flt-note`)

## Commands run
- `npx eslint`: 0 errors. The one warning is the known destructured-`Icon` false positive.
- `node --test tests/flights.test.mjs`: 0 fail.

No browser round: one line of text was removed, and the remaining button keeps its T1019 styles.

## Config and secrets set
None.

## Before/after measurements
Not measured.

## What broke and how it was fixed
Nothing.

## What is still open
Nothing new.

## Rollback procedure
`git revert` the T1020 commit.
