# T989 to T991: Plan, My trips and Together, cleaner

Batch of three tasks on root branch `p15-plan-mytrips-together`. The owner sent these points on 2026-11-01 and 2026-11-02, in Dutch, through the impeccable skill:
- New trip must sit under the title.
- Deleting trips does not work.
- The question for deleting 5 empty drafts is ugly.
- A trip with no image needs a nicer view.
- The empty Trips and Saved tabs need work.
- The signed-out Together screen should be cleaner.
- Remove the "My trips" and "Your trips" titles so the tabs move up.

Commits:
- `3c3d8ab414` (T989)
- `aa820d2d00` (T990)
- `00fee01fbd` (T991)

**End check** (once, on the batch). Dev server with `VITE_E2E_SEAMS=1`, Dutch interface, Playwright Chromium at 375 px (touch) and at 1440 px. The seed was two dated trips without a photo, one with a photo, and five empty drafts. The screens checked were the Plan home, the In planning tab, the clear question, My trips (Trips and Saved, both empty) and Together signed out.
- **Scroll:** no horizontal scroll anywhere.
- **Deleting:** a trip goes through ⋯, Delete and confirm, and the store drops from 7 trips to 6. Delete on the five empty drafts takes it from 6 to 1.
- **`npm test`:** 1204 of 1204 pass.
- **Lint:** 0 errors. The 12 warnings were there before.
- **Screenshots:** `Execution/P15/T989-T991-shots/` (before and after).
- **Not checked:**
  - WebKit (Safari): the installed Playwright WebKit does not match the version this Playwright wants.
  - Deleting an account trip: needs a signed-in account.
  - Both are in T989-a.

TripArt, the new no-photo view, is map geometry: contour lines, a dashed route and its two ends, on umber, lagoon or ink. It is not a picture. This goes beyond the two-colour contract (lagoon and ink grounds, a slow route animation), under the owner's design-freedom decision of 2026-10-30. Reduced motion holds the route still.

---

## T989: the Plan home

### Task ID
T989

### Date
2026-11-02

### What changed
- **No visible title.** "Your trips" is an `sr-only` h1. The page opens on two equal tiles:
  - New trip: a white tile with the plus on a brown disc.
  - Carta's own trips: the umber door. On a phone its name comes first and the deck runs out of the tile's right edge, with no arrow. From 769 px both tiles are 80 px tall.
- **Deleting trips** had two faults:
  - (a) A trip kept in the account (any trip once signed in, or a device trip with a `planId`) had no ⋯ menu at all (`del` returned `null` for `trip.account`). Every trip now has the menu. `PlanFlow`'s `useHomeTrips` gains `removePlan`, which drops the row at once and calls `deleteTripPlan` (the call My trips already uses). If that call fails, the list is read again. An account trip asks "Delete this trip from your account?" (new key `pf.home.deleteAskAccount`).
  - (b) The menu closed on any blur whose next focus was outside it. Safari does not focus a tapped button, so `relatedTarget` is null and the menu closed before the tap on Delete landed. Now only a blur to a real element outside closes it. A tap outside still closes it through the pointerdown listener.
- **The empty-drafts question.** "Delete 5 empty drafts" is a quiet line under the list. Pressed, it becomes one small white card: a red trash disc, the question, and Cancel and Delete as two equal buttons (new key `pf.home.clearGo`). Before, the right-aligned text sat next to "Delete trip".
- **No photo.** `Cover` and Up next draw `TripArt` (new component, `src/components/TripArt.jsx` and `src/styles/98-trip-art.css`) in place of the letter tile. The ground (umber, lagoon or ink) comes from the trip id, so a list of new trips is not one colour. A row thumbnail uses the compact form, with the route only.

### Files touched
**Created:**
- `continent-app/src/components/TripArt.jsx`
- `continent-app/src/styles/98-trip-art.css`

**Modified:**
- `continent-app/src/planner/flow/PlanHome.jsx`
- `continent-app/src/planner/flow/PlanFlow.jsx`
- `continent-app/src/styles/planners/90-plan-home.css`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (two keys)

### Commands run
- `npx eslint`
- `npm test`
- `scratchpad/del-test.mjs` (Playwright: delete one trip, then clear the empty drafts)

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After |
|---|---|---|
| Trips in store after ⋯, Delete, confirm on a device trip (Chromium) | 7 to 6 | 7 to 6 |
| Account trips with a delete | 0 | all |
| Trips in store after clearing 5 empty drafts | not measured | 6 to 1 |
| Label on the clear button | "Reis verwijderen" | "Verwijderen" |

### What broke and how it was fixed
- **Wrong repo.** A `git checkout --` run inside `continent-app/` used the nested repo, which is stuck at T915, and put back an old `PlanHome.jsx`. It was restored with `git checkout HEAD --` from the root before any commit. Run git for app files only from the root.
- **Phone tile.** On a phone "Carta's eigen reizen" broke over three lines beside the deck. The name now comes first and the deck runs out of the tile.
- **Chip clash.** On a narrow card the countdown chip ran under the ⋯ button. The chip now sits at the photo's bottom left.

### What is still open
T989-a: the owner checks on their phone (Safari, signed in) that deleting an account trip works and stays deleted after a reload.

### Rollback procedure
`git revert 3c3d8ab414`. This also takes TripArt away, so revert T990 and T991 first, because they import it.

---

## T990: My trips

### Task ID
T990

### Date
2026-11-02

### What changed
- **No visible title.** "My trips" is an `sr-only` h1. The tab bar (Trips, Saved, Your Europe) is now the first thing under the shell header. Add a booking sits at the bar's right end: an icon on a phone, and from 700 px buttons together with New trip. The header lost its 16 px top padding (12 px from 769 px), and the kit tabs' own bottom line went, so one hairline runs under the whole bar.
- **Empty tabs.** `Empty` is now one white card with TripArt across its top (16:9) and an icon disc, then the title and the one action.
  - Trips: umber, the route icon, Plan a trip with a plus.
  - Saved: lagoon, the bookmark icon, Browse destinations with an arrow.
  - No new text.

### Files touched
**Modified:**
- `continent-app/src/auth/mytrips/MyTripsTabs.jsx`
- `continent-app/src/auth/mytrips/SavedTab.jsx`
- `continent-app/src/styles/70-mytrips.css`

### Commands run
`npx eslint`, `npm test`

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After |
|---|---|---|
| Top of the tab bar on a 375 px phone (under the 60 px header) | about 128 px | about 64 px |

### What broke and how it was fixed
Two lines ran under the tabs: the kit's own, which stopped before the booking icon, and the bar's. The kit's line was removed inside `.mt-tabs`.

### What is still open
Nothing.

### Rollback procedure
`git revert aa820d2d00`.

---

## T991: Together, signed out

### Task ID
T991

### Date
2026-11-02

### What changed
Signed out, Together is one card: TripArt on ink with the Together mark, the title "Together" as the h1 (focus target unchanged), the one existing line, and Sign in. Sign in is full width on a phone and its own width from 560 px.

### Files touched
**Modified:**
- `continent-app/src/together/TogetherPage.jsx`
- `continent-app/src/styles/90-together.css`

### Commands run
`npx eslint`, `npm test`

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
Nothing.

### What is still open
Nothing.

### Rollback procedure
`git revert 00fee01fbd`.
