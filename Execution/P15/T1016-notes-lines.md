# T1016: two lines off the Notes tab

## Task ID
T1016

## Date
2026-11-02

## What changed
The owner asked to remove two lines from the Notes tab:
- the description under the documents' empty state ("Booking confirmations, a passport scan, …")
- the line about where the files are kept ("Only you can see these. …")

Both are gone. The empty state keeps its plus and its title, "Keep your travel papers here". The two strings stay in the i18n files, unused, in case either line comes back.

## Files touched
**Modified:** `continent-app/src/planner/trip/TripNotes.jsx`

**Created:** `Execution/P15/T1016-shots/`

## Commands run
- `npx eslint`: 0 errors.
- NOPUBLIC build. Playwright at 390 and 1440 px: the tab empty, then with a note and two files.
- No unit test touches this component (T1015: 1204 of 1204).

## Config and secrets set
None.

## Before/after measurements
Not measured.

## What broke and how it was fixed
Nothing.

## What is still open
Nothing new. T1015-a (documents on one device only) stands. Its reasoning no longer appears on screen; it is in the T1015 report.

## Rollback procedure
`git revert 5eb2c878f8`
