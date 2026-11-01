# T986: Together, cleaner and built like the proposal

## Task ID
T986

## Date
2026-11-01

## What changed
The owner asked for three things on 2026-11-01:
- the Together title sits higher;
- Add a friend, and whatever else acts on a page, sits under the title on every Together view;
- the page is cleaner and more inviting, and includes every part of the "Carta Together.html" proposal in a similar layout.

The work went through the impeccable skill. Branch `p15-together-clean` (root repo).

**Every view**
- Page top padding went down to 12 px on a phone and 16 px on a desktop.
- `.tg-head` is now a column: the title, then the actions.
  - On Friend this is Invite to a trip and the "..." menu.
  - On Group it is the faces.
- The Invite menu panel opens to the right (`left: 0`). It used to run off the left edge of the screen, which is the bug in the owner's screenshot.

**Home**
- To answer is one card with dividers. Decline is a quiet close icon, and the row icons are hidden under 420 px so every row fits on one line.
- Plans that meet: "Plan a day together" is now the brown primary button, as in the proposal. Hide stays the quiet button.
- Friends' plans:
  - On a desktop the shelf shows three cards across.
  - With more than three plans, a "See all" button (`aria-expanded`) wraps every card into a grid, and "Show fewer" folds it back.
- Friends is one card of rows, each with a chevron.
- Guides is now a "Guides" block with two photo cards (picture, title, @handle) and "See all", replacing the one-line strip. It is absent when nothing is published, as the strip was.
- Empty account: the Friends block offers the share card (link, Share, QR) straight away.

**Friend**
- The two-colour map sits in a white card with "You and Sam" inside it.
- "You both saved" and "Next" stay separate cards. A card-in-card from the new list rule was fixed by scoping that rule to `.tg-wait.tg-list`.

**Add a friend**
- The handle form is a white card. The found person shows under a divider inside it.
- The share card has a warm tint (`--umber-50`) and no shadow.

**Group trip**
- The vote fill bars now show. `.tg-opt-fill` had `inset: 0 auto 0 0`, which made it zero wide, so `scaleX` had nothing to scale. It is now `inset: 0`.
- The date and place fields are hidden behind quiet "+ Add dates" and "+ Add a place" buttons. The field opens with focus and closes after it is added.

Two parts of the proposal are left out on purpose, following the owner's decisions of 2026-10-31 (no friend costs):
- the "€61 a day" line on the tip card;
- the Costs switch under Friends see.

## Files touched
**Modified:**
- `continent-app/src/together/TogetherPage.jsx`
- `continent-app/src/together/AddFriend.jsx`
- `continent-app/src/together/FriendView.jsx`
- `continent-app/src/together/GroupTrips.jsx`
- `continent-app/src/together/MeetCard.jsx`
- `continent-app/src/styles/90-together.css`
- `continent-app/src/i18n/{en,de,es,fr,it,nl}.js`: new keys `tg.guides` and `tg.fewer`.

**Created:** `Execution/P15/T986-shots/` (after screenshots)

## Commands run
- `npx eslint src/together/`: 0 errors. There are 8 warnings, all of them existing react-refresh warnings in files this task did not change in that way.
- `npm test`: 1204 of 1204 pass.
- Playwright on the dev server with `VITE_E2E_SEAMS=1`, `?friendsmock&guidesmock=some`, at 375 px (touch) and 1440 px.
  - Views: home, empty, add, privacy, friend, group, newgroup, settle.
  - None scrolls sideways.
  - The proposal was rendered with the same tool, and each screen was compared side by side.
- `scripts/verify_guides.mjs` checks the Explore strip, which this task does not touch.
- `verify_friends` still finds `.frn-yes` in AddFriend.

## Config and secrets set
None.

## Before/after measurements
| Metric | Before | After |
|---|---|---|
| Title top, Group, 1440 px (from the before and after screenshots) | about 143 px | 117 px |
| Add a friend | beside the title | under the title, on every view |
| Vote fill bar width | 0 px | share of votes |
| Proposal home blocks present (out of 8) | 6 (no Guides cards, no See all) | 8 |

## What broke and how it was fixed
- The new `.tg-list` card rule also matched FriendView's "You both saved" list and turned it into a card inside a card. It is now scoped to `.tg-wait.tg-list`.
- The first Guides cards collapsed, because HeroImage needs a box with a fixed aspect ratio around it. Also, `.tg-gd span` restyled HeroImage's own placeholder. Fixed with `.tg-gd-ph` and a `.tg-gd-by` class.

## What is still open
Nothing new. The signed-in screens can only be seen live by the owner, because `?friendsmock` is off in production builds (T985).

## Rollback procedure
`git revert` the T986 commit.
