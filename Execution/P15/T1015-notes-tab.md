# T1015: the Notes tab works, as notes and documents

## Task ID
T1015

## Date
2026-11-02

## What changed
The owner said the Notes tab doesn't work. They asked to make it work, simple and clean, with uploaded documents, informed by a research agent on what travellers keep on such a page.

**Why it did not work.** `TripPlannerTab.jsx` validates the trip tab against `TRIP_TABS = ['overview', 'itinerary', 'costs', 'days']`. `'notes'` was missing, so every tap on Notes fell back to the Overview, and the tab never opened. It is on the list now.

**Research.** A subagent read TripIt, Tripsy, Wanderlog, KAYAK, Google Wallet and Polarsteps help pages, the Rick Steves, Fodor's and Travelfish forums, and travel-document guides. Reddit blocked its search tool. What travellers keep, most often first:
1. booking confirmations
2. a passport scan
3. insurance (policy and assistance line)
4. tickets and boarding passes
5. emergency contacts
6. medical notes
7. visa or driving licence
8. addresses and phone numbers

The patterns taken:
- TripIt's Documents section with one + and a row per file
- Google Wallet's private, on-device documents
- notes beside documents in one place (Wanderlog, Tripsy)

**The tab** (new `trip/TripNotes.jsx`):
- **Notes.** One field that saves as it is typed, into the plan's synced trip extras (the same `notes` the old tab edited). Its hint is "Addresses, phone numbers, emergency contacts, door codes".
- **Documents:**
  - one **Add**. It accepts PDF or images; on a phone the picker offers the camera.
  - an empty state, itself a tap target, that names what goes there: bookings, a passport scan, insurance, tickets and boarding passes.
  - a row per file: a photo's own thumbnail or a PDF mark, the name, the size. A tap opens the file; if a pop-up is blocked, it saves instead.
  - a bin with a six-second Undo
  - drop to add, on a desktop
- **One quiet line:** "Only you can see these. They stay on this device, so they open offline. PDF or photos, up to 25 MB each."
- **Storage.** Files use the existing `dayFileStore` (IndexedDB in this browser, never uploaded; 25 MB a file, 200 MB a plan), keyed by the plan's id, `tripdraft` for an unsaved trip.

The bookings, the booking inbox and the packing list are no longer on this tab. Bookings and Packing are the Itinerary's trip kit (T1011).

## Files touched
**Modified:**
- `continent-app/src/planner/TripPlannerTab.jsx`: `TRIP_TABS`
- `continent-app/src/planner/TripItinerary.jsx`: the Notes tab renders TripNotes
- `continent-app/src/planner/TripSummary.css`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`: `tp.notes.title`, `tp.notes.hint`, `tp.docs.*`

**Created:**
- `continent-app/src/planner/trip/TripNotes.jsx`
- `Execution/P15/T1015-shots/`

## Commands run
- `npx eslint`: 0 errors.
- `npm test`: 1204 of 1204 pass.
- NOPUBLIC build. Playwright ran at 390 px (touch) and 1440 px:
  - opened the Notes tab
  - typed a note
  - added a PNG and a PDF through the file input
  - shot the tab empty and filled
  - reloaded
- After the reload the note was intact and both files were listed. The files appear once IndexedDB answers: they were there at 3 s; a check at 1.5 s came too early. The records were confirmed in IndexedDB under `tripdraft`.

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Notes tab opens | no (fell back to Overview) | yes |
| Note survives a reload | not reachable | yes |
| Documents a trip can hold | none | PDF or images, 25 MB each, 200 MB a plan, on this device |

## What broke and how it was fixed
Nothing in the app.

## What is still open
- **T1015-a.** Documents live only on the device that added them, by design: no upload, as `dayFileStore` already documents. A traveller who signs in on a second device will not see them there. If documents should follow the account, that needs a private storage bucket and an owner decision on holding passport scans.

## Rollback procedure
`git revert 0fb316e590`
