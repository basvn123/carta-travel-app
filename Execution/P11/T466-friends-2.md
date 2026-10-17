# T466: Friends, on the kit and across the app

## Task ID

T466

## Date

2026-10-17

## What changed

The owner asked for the Friends area (invites, milestones, a friend's trips) to be optimised, modernised and cleaned up, to line up with the rest of the app, and to show up in other sections where it makes sense. On 2026-10-17 they chose where:

- on destination pages
- on My trips cards
- behind one Friends door

Market research (the T464 research agent) looked at how Polarsteps, Strava, Komoot, Wanderlog and Been present friends:

- a follow request with an accept gate
- a secret link that works without an account
- an invite button that opens the messaging apps
- avatar stacks beside a trip's dates (Wanderlog's "+4")
- friend comparisons and quiet milestones
- a feed of friends' trips that leads the page, not strangers' content

The anti-patterns it found were Facebook-connect discovery, auto-accept by default and a feed of strangers. Carta already avoided all three: you add somebody by their exact handle, and the page shows only trips a friend set to "My friends".

**The Friends page** (auth/FriendsSpoke.jsx) is now on the Lagoon kit and reads like My trips and Account:

- **The invite card.** Your handle in title size, one line on what it does ("Send it to a friend. You each see only the trips you choose to show."), Invite a friend and Copy. Invite is the page's primary only while you have nobody and nothing is waiting, as before.
- **Groups.** Each group sits under a real heading in the house label style. Waiting on you, the co-plan invitations, waiting on them, the plans and your friends are each one bordered card of hairline rows.
- **Faces.** People are drawn as faces (their emoji, or the initials of their name on the sunken disc), not a person glyph.
- **The plans come before the people.** "From your friends" is a list of photo rows: the first stop's catalogue photograph, the trip's name with its New mark, the friend's face and "Shown by", when it moved, the dates and the flags. Each row opens the trip in place, read only, as before.
- **Buttons.** Every button is the kit's, with Accept the one primary while a request waits. A co-plan Join steps down to secondary when a friend request is also waiting, so the page never carries two primaries.
- **Milestones.** They are a strip of five in one card. Earned is ink with a solid edge, and locked is a dashed --text-3 outline (carta-design "Small text"). This replaces the grey "ochre" seal and its hard-coded halo colour. A badge earned during the visit settles in once with a fade instead of a pop.
- **Load failure.** If the friends list fails to load, the page says so with a retry (`state.friendsFailed`, half of T189-b) instead of showing an empty list.

**Friends elsewhere:**

- **Destination pages.** Under the price card, signed in, a destination page shows the faces of the friends showing you a trip that stops there, with "Sofie Vermeulen has a trip here" (or "Ana and 2 more friends have trips here"). It opens in place into those trips, each one read only. For a guest, or where no friend trip stops, it shows nothing at all.
- **My trips.** The friends line is now the faces of the friends showing you trips, the count and "See them in Friends", and the whole line is one button.
- **The shared hook.** Both read one cached copy of `list_friend_trips` (auth/useFriendTrips.js, one request a minute per user). The Friends page drops that copy whenever it re-reads, which is the moment an accepted friend's trips appear.

**One door.** The header Friends button is gone (it was the "Friends twice" the T461 critique named). Friends is reached from the Friends row in Account, from the My trips line, from the destination page line and from `#friend=` invite links. No migration was needed: `list_friend_trips` already returned each trip's destination ids.

The CSS moved out of 23-places-pages.css, 479 lines of T190-era rules on legacy aliases, into a new src/styles/71-friends.css written on Lagoon roles only. That file also fixes the white-on-tan hover of the old Accept and Invite buttons. The guides strip at the foot of the page is on Lagoon roles, and its door is a kit quiet button.

## Files touched

**Created (app repo):**
- src/styles/71-friends.css
- src/auth/useFriendTrips.js (the shared, cached read, plus tripsAt, ownersOf and initialsOf)
- src/auth/FriendFaces.jsx (Face, FaceStack)
- src/components/FriendsWentHere.jsx (the destination page line)

**Modified (app repo):**
- src/auth/FriendsSpoke.jsx (the page on the kit, reordered, load failure)
- src/auth/FriendBadges.jsx (a real heading; ink for earned)
- src/community/GuidesStrip.jsx (kit button)
- src/browse/DestinationPage.jsx (mounts FriendsWentHere under the price card)
- src/auth/mytrips/MyTripsTabs.jsx and src/auth/SavedTripsPanel.jsx (the faces line)
- src/components/AppHeader.jsx and src/App.jsx (the header Friends button and toggleFriends removed)
- Styles:
  - src/styles.css (imports 71)
  - src/styles/23-places-pages.css (the Friends rules removed)
  - src/styles/25-feature-pages.css (guides strip)
  - src/styles/60-v6-shell.css (header button rules removed)
  - src/styles/69-v6-account.css (dead touch selectors removed)
  - src/styles/70-mytrips.css (the line)
- src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (friends.meLine, friends.hereOne, friends.hereMany)
- scripts/verify_friends.mjs (destination page checks: guest, named friend with a face, opens in place, nothing where no trip stops; two screenshots)
- scripts/verify_friend_badges.mjs (the door is Account now; CARTA_PORT honoured)
- scripts/ci/design-lint.baseline.json (shrunk to the new totals)

**Created (root repo):**
- Execution/P11/T466-friends-2.md
- Execution/P11/T466-shots/

## Commands run

```
cd continent-app
npx vite --port 5210 --strictPort
CARTA_PORT=5210 node scripts/verify_friends.mjs
CARTA_PORT=5210 node scripts/verify_friend_badges.mjs
npm test
node scripts/ci/design-lint.mjs
node scripts/ci/design-lint.mjs --meter Friend
node scripts/ci/design-lint.mjs --update-baseline
& impeccable.cmd detect --json src/auth/FriendsSpoke.jsx src/auth/FriendBadges.jsx src/auth/FriendFaces.jsx src/components/FriendsWentHere.jsx src/auth/mytrips/MyTripsTabs.jsx
```

## Config and secrets set

None. No migration.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Raw buttons in the Friends files (FriendsSpoke, FriendBadges, GuidesStrip) | 15 | 2 | -13 |
| Friends CSS on legacy aliases in 23-places-pages.css | 479 lines | 0 | -479 |
| Doors to Friends that duplicate each other | 2 (header button and Account row) | 1 | -1 |
| Surfaces outside the Friends page that show friends | 1 (a text line in My trips) | 2 (destination page, My trips faces line) | +1 |
| verify_friends | all passing (count not recorded) | 54/54 | +6 checks: the guest on a destination page, the named friend, the face, the trip opening in place, nothing where no trip stops |
| verify_friend_badges | could not reach the page (it clicked the removed header button) | all pass | fixed |
| Design lint, whole app | 7,951 | 7,818 | -133 |
| Meter: raw-button, font-size, radius, legacy-token | 437, 1,777, 801, 4,759 (start of the session) | 424, 1,752, 783, 4,683 | -13, -25, -18, -76 |
| npm test | 451/451 | 451/451 | 0 |
| impeccable detect on the changed markup | | [] | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The design lint called three new raw buttons (the destination line, its trip rows, the My trips line) | New code may not add a raw `<button>` outside the kit | All three are kit Buttons (quiet or secondary, block) with a row layout on `.btn.<class> .btn-label` |
| The destination line drew centred and brown | A scripted CSS replace matched inside text it had just inserted and cut the block | The section was rewritten whole; the rows take ink and the row hover |
| The lint called `outline: none` on the handle field | The ring is drawn on the field's frame with :focus-within | `outline: 2px solid transparent` on the input |
| verify_friend_badges timed out at its phone step | The header avatar is hidden on a phone | It opens Account from the visible avatar or the bottom bar, as verify_friends does |

## What is still open

T466-a:

- The Friends page and the destination page line were reviewed from the harness screenshots at 1360 and 390, not through a formal impeccable critique, because a signed-in page needs the fake-session harness.
- T435, the whole-app finish review, covers Friends.
- On a phone a friend's trip row is crowded: the flags and the chevron share the line with a wrapping "Shown by" line.

T466-b: two raw buttons remain on the Friends surfaces, the trip row toggle in FriendsSpoke and the medallion in FriendBadges. They are full-width disclosure rows and medallions, which the kit has no component for.

T466-c: T189-b is half done. The Friends page now shows `state.friendsFailed` with a retry. The ReadyTripsStep and wizard failure states in the same row are not this task's files.

T466-d: T390-f's "Alongside your friends" ledger is still not on the Friends page. It needs the record counts that only SavedTripsPanel computes.

T466-e: the owner sees the new Friends page, the destination line and the My trips line on a real phone and confirms the direction.

## Rollback procedure

In the app repo: `git revert -m 1 <merge of p11-friends-2>`. This brings back the header Friends button, the old page and its CSS in 23-places-pages.css, and the old lint baseline. In the root repo, revert the report commit. No data or schema changed.
