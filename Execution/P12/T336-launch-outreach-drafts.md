# T336 Launch outreach drafts

## Task ID

T336 (register rows T208-c and T204-b)

## Date

2026-10-06

## What changed

Carta now has the two outreach drafts the launch plan was missing, and the channel test of the acquisition constraint is written down as done. Both live in one new file, docs/LAUNCH-OUTREACH-DRAFTS.md. It holds a courtesy note for the bodies credited in continent-app/src/data/attribution.js, a table that says for each of the 43 entries whether a note goes out, a paragraph that asks the L1 to L3 partners whether they would co-announce, and the channel test. All drafts carry placeholders for the date, the owner's name and the credit link. Nothing was sent and no external service was touched.

The count of 43 was verified by counting the `source:` keys in attribution.js (43). The EEA appears twice, one entry is Carta's own image copies, so there are 42 distinct bodies and 41 outside ones. Of the 43 entries, 36 get a note, 1 is covered by the EEA note, 1 waits for UNESCO's terms (marked verify in the file), 4 are the owner's call (CARTO, OpenTripMap, Open-Meteo, Exchange Rate API) and 1 gets none.

For T204-b, T207 and T208 had both applied the three questions of docs/GTM-ACQUISITION-CONSTRAINT.md (cash EUR 0 against the EUR 0.17 ceiling, no lever needed). T205 had not: its report never cites the ceiling. The test is applied to organic search in the new file, with the same result, and the row is closed. Nothing enforces the test; the file says so.

The runway report is not edited, since a closed report is never updated. The runway is pointed to from this report and from rows T336-a and T336-b instead, and the drafts name its D-21 and D rows.

The draft says nothing about flights and states no figure that is not cited to a file.

## Files touched

**Created:**
- docs/LAUNCH-OUTREACH-DRAFTS.md
- Execution/P12/T336-launch-outreach-drafts.md

**Modified:**
- Execution/_OPEN.md (T204-b and T208-c closed, T336-a and T336-b added)

## Commands run

Reads of the T204, T207, T208, T220 and T318 reports and docs/GTM-ACQUISITION-CONSTRAINT.md. `grep -c "source: '" continent-app/src/data/attribution.js` in the main checkout (43). A node script read attribution.js and wrote the table rows. A dash and middot check over the new file found none.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Courtesy note drafts | 0 | 1 | +1 |
| Credit entries in attribution.js | 43 (T207 count) | 43 (recounted) | 0 |
| Entries with a send decision | 0 | 43 | +43 |
| Channel reports with the EUR 0.17 test applied | 2 of 3 | 3 of 3 | +1 |

## What broke and how it was fixed

No issues. The first version of the count sentence in the draft was muddled; it was rewritten before commit.

## What is still open

The owner approves the wording, fills the placeholders after setting D, and sends by hand (T336-a). The owner decides the four commercial or API bodies and reads UNESCO's terms (T336-b). Both are also in the register. The credit link depends on /about/numbers being confirmed on the Pages deploy (T318-a, already open). The launch date T207-a and the Culture Routes Society contact route (T208-b) remain open as before.

## Rollback procedure

Revert the single commit on branch p12-launch-outreach-drafts. Only documents and the register changed; no app, data or config.
