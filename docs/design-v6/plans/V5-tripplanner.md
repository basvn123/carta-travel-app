# V5 plan: Trip planner (harden, adapt and polish)

Written by T408 (design wave V5, 2026-10-09). Audit of the V4 result on the built app: impeccable detector on the surface files found one warning (a 3 px side stripe on `.daytrip-reco` at 11-trip-planner.css:637, a day-planner class); design lint 166 of 166 baseline; a scratch walk on Pixel 5 and desktop showed no horizontal overflow, the keyboard test (Pixel 5, iPhone 13) kept the origin field and its Search visible, and `verify_keyboard` flagged the selected "Nothing yet" card with no focus ring at 1280. The plan was committed after the first app edit began, not before; the report says so.

Order, from brief V5 items 1 to 9:
1. Modal wizard as a dialog: role, aria-modal, useFocusTrap (Escape, return focus), 28 percent ink scrim, 44 px cross; CountryPickerMap card a region; focus border on the trip name. Files: GuidedTripWizard.jsx, CountryPickerMap.jsx, 67-v6-tripplanner.css.
2. Selected cards keep their focus ring (the Nothing yet finding). 67 file.
3. Labels on the extras inputs and remove buttons. TripExtras.jsx (existing keys, no new strings).
4. Tap targets on a coarse pointer and wrapping at 360 px. 67 file.
5. Harness upkeep: verify_trip_landing and verify_receipt (row T382-g), each changed assertion with a comment.
6. Weight (item 8): check whether the folds already mount on open.
Not planned for this session, to be written as rows: headings level order, arrow-key radio groups, token shadows and 999 px radii, de and nl screenshots.
Checks: eslint, npm test, design lint, detector, the planner harnesses against the dev server on 5208, verify_keyboard --only trip-planner.
