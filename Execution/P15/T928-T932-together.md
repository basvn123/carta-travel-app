# T928 to T932: Together, the friends layer

## Task ID

T928 to T932, one batch (CLAUDE.md "Batches"), branch `p15-together`.

## Date

2026-10-31

## Shared header

The owner asked for /impeccable research on how comparable apps build a community and where they place it on phone and desktop. They wanted it:

- clean, professional and not intrusive;
- exciting and innovative;
- with a decision on whether it belongs in the main navigation.

The artifact "Carta Together" (https://claude.ai/artifact/UC5v5c3Hzn49wZgj1E2JFk) followed. On version 1 the owner asked for less text, no subsections or subcaptions, and crystal-clear functions; version 2 did that. Then: "Go, if done merge".

The open questions took the artifact's defaults:

- **Placement:** a door in the header, not a fourth tab.
- **Name:** Together.
- **Costs:** hidden from friends until switched on.
- **Alerts:** none by email or push, only the page and the header count.

**How it was checked.**

- **Static checks:** eslint has 0 errors. `npm test` passes all 1,165 tests, including the new `togetherOverlaps` and `togetherGroupBand` tests. design-lint reports 168 violations, the same count as `main`.
- **End check:** the real app with the dev-only `?friendsmock` seam, at 1,440 and 390. Screens checked:
  - Together hub
  - friend page
  - group trip
  - Add a friend and Friends see
  - no friends yet
  - Porto's place page with Friends here

  There was no overflow and no page errors.
- **Not walked in the browser:** the Plan date step (T929-a).

## T928: the Together page and the header door

### What changed

**The header door.** A people icon sits beside the account on every device. Its badge counts what waits on you: friend requests, co-plan invites, group invites and votes you owe.

**The Together page** is an overlay with its own address (`?tab=together`; `tv=` for the sub-screen, `tg=` for a friend or group). In order:

1. Title and Add a friend.
2. To answer.
3. Plans that meet.
4. Group trips.
5. Friends' plans.
6. Friends.
7. Badges.
8. Guides.
9. Privacy.

**Migration from the old page.** FriendsSpoke is gone and its jobs moved here. Account keeps one row to Together, and old `view=friends` and `#friend=` links open Together.

### Files touched

- `continent-app/src/together/` (new): TogetherPage, AddFriend, FriendView, MeetCard, GroupTrips, Privacy, signals, parts, useTogether, overlaps, groupBand, friendsMock.
- `src/styles/90-together.css`.
- `App.jsx`, `lib/urlState.js` (and `tests/urlPlaces.test.mjs`), `components/AppHeader.jsx`, `auth/AccountPanel.jsx`.
- `i18n/*.js` (88 `tg.*` keys after `coplan.ownedBy`).

### What is still open

- `scripts/verify_friends.mjs` still targets the old Account spoke and needs rewriting (T928-a).
- On a phone the page covers the slim header, as My trips does.

### Rollback procedure

`git revert 3a7280e844`, together with the later tasks.

## T929: plans that meet and friends across Carta

### What changed

**Plans that meet.** Overlaps are computed on the device. Each compares your dated trips with the trips accepted friends show, at city level, only when your "Plans that meet" switch is on. They appear as the dark card with two date lanes, with "Plan a day together" (opens the day planner on that date) and "Hide" (remembered on the device).

**Friends across Carta,** one line each, only where the data exists:

- Explore cards: "Sam went", plus a cost a day only if Sam shares costs.
- The place page: "Friends here", right after Good to know.
- The Plan date step: a friend's stay.
- My trips: "Sam joins".

### Files touched

`together/overlaps.js`, `together/signals.jsx`, `components/FriendsWentHere.jsx`, `browse/ExploreRails.jsx`, `browse/ExploreCards.jsx`, `planner/flow/setupScreens.jsx`, `auth/mytrips/MyTripsTabs.jsx`, `planner/DayPlannerTab.jsx`.

### What broke and how it was fixed

The end check, `edff9ece2a`:

1. Friends here sat at the foot of the place page, after Places like this. It now follows Good to know.
2. Food price labels broke mid-word ("Cappuccin o"), a leftover from T912. They now wrap at words.

### What is still open

The Plan date step was not walked in a browser (T929-a).

### Rollback procedure

`git revert edff9ece2a 04cc373921`.

## T930: the friend page

### What changed

- Face, name and handle, Invite to a trip, and a menu with a silent Remove and Block.
- "You and Sam": a three-colour tile map of Europe (both, you, them).
- "Sam in {country}": their cost a day and tip, only if shared.
- "You both saved", only if they share saves, with Plan together.
- Next.

### Files touched

`together/FriendView.jsx`.

### What is still open

"Ask to join" was left out here and on Friends' plans. Carta has no way to request to join someone else's trip (T930-a).

### Rollback procedure

`git revert 2d05f53d13`.

## T931: group trips (migration 055, owner-applied)

### What changed

**The tables.** `supabase/migrations/055_group_trips.sql` adds group trips, date and place options, one vote per member per question, and a private budget per member. RLS is on every table, and a self-check prints "group trips self-check passed". The undo file is `055_group_trips_down.sql`, which deletes all group trips, votes and budgets.

**The budget band** comes only from the SECURITY DEFINER function `group_trip_band()`:

- It is the lowest maximum any member set, rounded down to €5.
- It is returned only once three members have set one.
- Nobody can read another member's budget row.

**The client** (`auth/groupTrips.js`, `together/GroupTrips.jsx`, `together/groupBand.js`):

- When and Where polls, each option priced through `lib/price/`, with voters' faces.
- The band, with "Yours: €X, private".
- "Book it for N", which creates the trip with the members as co-planners.

It shows nothing when the tables do not exist.

### What is still open

- **Apply 055 in the Supabase SQL editor, after 054** (T931-a). Until then group trips do not show.
- The band needs three budgets, a privacy floor the owner may want to change (T931-b).
- Settle up, group chat and "Ask Sam" need servers and were not built (T931-c).

### Rollback procedure

`git revert 0391b108fb 736de6bd8d`, and run `055_group_trips_down.sql` if 055 was applied.

## T932: Add a friend and privacy (migration 056, owner-applied)

### What changed

**Add a friend:** a handle with Find, the found profile with Send request, and "Your link" with Copy, Share and a QR code (`qrcode-generator`, loaded on first use).

**"Friends see" switches:**

| Switch | Default |
|---|---|
| Trips | Per trip, as today |
| Countries | On |
| Saves | Off |
| Costs | Off |
| Tips | On |
| Plans that meet | On |

**The tables.** `056_friend_visibility.sql`:

- stores the switches;
- adds `list_friend_shares()`, which applies each person's switches on the server;
- adds `block_friend_link()`, which blocks silently;
- prints "friend visibility self-check passed".

The undo file is `056_friend_visibility_down.sql`. Requests are never accepted automatically.

### Files touched

`together/AddFriend.jsx`, `together/Privacy.jsx`, `auth/friendVisibility.js`, and the two migration files.

### What is still open

- **Apply 056 after 055** (T932-a). Until then the switches do not save, and friends share nothing beyond their shown trips.
- There is no age signal in the app, so friends cannot be turned off for accounts under 16 (GDPR Article 8). This needs a decision and a source for age (T932-b).
- The friends' "tip" reads a trip memory's story field; the owner should confirm that is the right text (T932-c).

### Rollback procedure

`git revert f9f42c76b4`, and run `056_friend_visibility_down.sql` if 056 was applied.

## Batch

- **Design departures for the owner to review** (named in the CSS header, existing tokens only):
  - the dark meet card;
  - four quiet face tones;
  - the three-colour tile map.
- **Deploy:** not possible from this session (T918-c).
