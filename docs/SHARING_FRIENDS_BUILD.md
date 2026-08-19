# Sharing and friends: step by step build plan

Companion to `docs/SHARING_FRIENDS_PLAN.md`, which is the research. This is
the running order: 18 steps, each one a single Claude Code session, each one
committable and verifiable on its own.

**One change against the research note.** Stage 2 there proposed a
`trip_people` SQL table. Do not build that. `extras.people` already exists,
already syncs (localStorage first, shadowed into `day_plans` for accounts),
already works for guests, and `pastTripMemory.js:135` already copies
`memory.companions` into it. Upgrading that one array is cheaper than a table
and it is the only version that works for guests, who are most of the app.
The SQL only starts at Phase 2.

## Running order and why

Phases are ordered so each one ships value alone, which is not the order the
research note used.

| Phase | Delivers | Needs a migration | Works for guests |
|---|---|---|---|
| 1. Who you travelled with | your Saved trips and Travel record ask | no | yes |
| 2. Share a trip read only | send a trip to anyone | yes | viewer yes, sharer no |
| 3. Profiles and handles | the thing friends need to exist | yes | no |
| 4. Friends | see each other's trips | yes | no |

Phase 1 is the whole of what you actually asked for and it has no backend.
Start there. If you stop after Phase 2 you still have a useful product.

## Guardrails (re-read before every step)

1. **Never `supabase db push`.** The live project is
   `ntssxktaduxzpsmejwyv`. Every migration is applied by hand in the Supabase
   SQL editor. Write the file into `supabase/migrations/`, then paste it.
2. **No em dashes, no en dashes, no middot or bullet separators.** Anywhere:
   UI copy, comments, commit messages. `stripDashes()` in `lib/format.js`.
3. **i18n is six files.** `src/i18n/{en,nl,fr,de,es,it}.js`. A key added to
   one and not the other five renders as the raw key.
4. **Anything visual: load the `carta-design` skill first.** Colours, radii,
   copy tone, empty states.
5. **The app is guest first.** Every social control needs `auth/AuthGate.jsx`
   or a sensible signed out state, never an error.
6. **Every step ends with** `npm run lint` and `npm run build` from inside
   `continent-app/`, then a commit on `map-transport-glyphs`.
7. **Verify scripts run from `continent-app/`**, they dismiss "Continue
   without an account", then "Got it" and "START HERE", before screenshots.

---

# Phase 1: who you travelled with

No backend. Delivers the Saved trips and Travel record ask in full.

## Step 1.1: the crew model

**Goal.** One canonical list of the people on a trip, replacing two
overlapping free text arrays.

**Touches.** New `src/auth/tripCrew.js`. Reads only, no UI yet.

**Do.** Make `extras.people` the single source of truth, upgraded from an
array of strings to an array of `{ id, name, userId }` where `userId` is
always `null` until Phase 4. Write a normaliser that accepts all three shapes
it will meet in the wild:

- legacy string entries in `extras.people` (positional, padded to group size)
- legacy `memory.companions[]` strings
- the new object entries

Position matters and must be preserved: `ExpenseLedger` uses the array index
as `paidBy` and inside `expenses[].sharers`.

**Built, with one correction.** The plan first assumed index 0 is the account
holder. It is not, and cannot be made so: the field has always been labelled
"names, so the ledger can split what it cost", so some travellers typed
themselves into it and some did not, and both files are in the wild. Renumbering
to impose the rule would silently rewrite what an existing expense meant. The
crew is therefore just the people the trip has, in the order they were typed,
and nothing guesses which one is you.

Export at least: `readCrew(extras, { groupSize, memory })`,
`writeCrew(extras, crew)`, `crewLabel(crew, t)` for the "with Sofie and
Jonas" subline, and `crewInitials(crew)` for an avatar stack.

**Do not** add a new key to extras. `people` is already whitelisted in
`dayPlanStore.loadTripExtras()`; a new key would be silently dropped there.

**Done when.** `tripCrew.js` exists with tests of the normaliser exercised by
a scratch node script, and nothing else in the app has changed.

```
Read docs/SHARING_FRIENDS_BUILD.md and docs/SHARING_FRIENDS_PLAN.md first.

Implement Step 1.1 only: create src/auth/tripCrew.js, the canonical model for
the people on a trip.

Context you must read before writing:
  - continent-app/src/planner/dayPlanStore.js, loadTripExtras (the whitelist)
  - continent-app/src/planner/ExpenseLedger.jsx lines 24 to 60 (positional
    people, paidBy as an index)
  - continent-app/src/auth/pastTripMemory.js line 135 (companions copied into
    extras.people today)

extras.people becomes an array of { id, name, userId }. userId is always null
for now. Preserve array position: index 0 is the account holder, ExpenseLedger
indexes into this by position. Accept and upgrade legacy string entries and
legacy memory.companions on read. Do not add any new key to extras.

Export readCrew, writeCrew, crewLabel and crewInitials. Match the file header
comment style of pastTripMemory.js. No UI changes in this step.
```

## Step 1.2: the Travel record form

**Goal.** The companion rows in "Add a past trip" edit the crew.

**Touches.** `auth/PastTripForm.jsx` (the companions block, lines 498 to 517,
and the save at 316), `auth/pastTripMemory.js` (stop writing `companions`,
derive it for back compat).

**Done when.** Typing two names into a past trip and reopening it shows both;
an old trip saved before this step still shows its companions.

```
Implement Step 1.2 only, per docs/SHARING_FRIENDS_BUILD.md.

Move the companion rows in continent-app/src/auth/PastTripForm.jsx (lines ~498
to 517, saved at ~316) onto the crew model from src/auth/tripCrew.js.

pastTripMemory.js must keep reading legacy memory.companions so trips saved
before this step still render, but new saves write the crew into extras.people
and leave companions derived. Check saveMemory at line ~135, it currently
overwrites extras.people from companions; that direction now reverses.

Load the carta-design skill before touching any markup or copy. Add every new
string to all six files in src/i18n/. Then npm run lint and npm run build.
```

## Step 1.3: the trip cards

**Goal.** Saved trips cards say who came.

**Touches.** `auth/SavedTripsPanel.jsx` (cards in all three tabs:
`favorites`, `planned`, `visited`), `auth/TripMemoryView.jsx` line 132 which
already joins and prints a list and should now read the crew.

**Built, with one correction.** The plan called for an avatar stack of
initials next to the names. It was dropped: `memoryLine` is already the card's
fact line, so the names go in there and the change needs no new markup and no
new CSS. Initials bubbles would have been the pastel-tile decoration the design
system bans, carrying nothing the words do not already carry. `crewInitials()`
exists in `tripCrew.js` if a surface ever genuinely needs it.

Names are conjoined by `Intl.ListFormat` in the reader's own language, which
also keeps the panel clear of the middot ban that its sublines are under.

**Done when.** A past trip with two companions shows both on its card in
Visited, and `TripMemoryView` shows the same names.

```
Implement Step 1.3 only, per docs/SHARING_FRIENDS_BUILD.md.

Show the trip crew on the cards in continent-app/src/auth/SavedTripsPanel.jsx
and in TripMemoryView.jsx (line ~132 already joins a companion list, point it
at readCrew instead).

An avatar stack of initials plus a subline reading "with Sofie and Jonas".
Join with commas and a localised "and". No middot, no bullet, no dash: the
sublines in this panel are already under that rule.

Load carta-design before writing markup or copy. Six i18n files. Lint, build.
```

## Step 1.4: the expense ledger

**Goal.** Stop typing the same names twice.

**Touches.** `planner/ExpenseLedger.jsx` lines 27 to 45 and the render at 114
to 125.

**Do.** Read names through `readCrew` instead of the local `people` array.
Keep `paidBy` and `sharers` as positional indices, keep the pad to
`groupSize` with "Traveller N". Renaming a person in the ledger writes back
through `writeCrew`.

**Done when.** A name typed in the past trip form appears already filled in
the ledger, and existing ledgers with recorded expenses still balance
correctly (the indices must not shift).

```
Implement Step 1.4 only, per docs/SHARING_FRIENDS_BUILD.md.

Point continent-app/src/planner/ExpenseLedger.jsx at readCrew/writeCrew from
src/auth/tripCrew.js instead of its own extras.people string array.

Critical: paidBy and expenses[].sharers are positional indices into this
array. Existing saved expenses must keep balancing, so array order cannot
shift. Keep the pad to groupSize with the "Traveller N" fallback.

Lint, build. Then manually confirm an existing trip with expenses still shows
the same settle-up lines.
```

## Step 1.5: verify Phase 1

**Touches.** New `continent-app/scripts/verify_trip_crew.mjs`.

**Do.** Model it on `scripts/verify_past_trip.mjs`, which already knows how
to enter the app as a guest, open My trips, and reach the Visited tab
(`.saved-tabs button` index 2).

Cover: guest logs a past trip with two companions; the names come back on the
card; they survive a reload; they are pre-filled in the ledger; mobile width
has no sideways scroll.

```
Implement Step 1.5 only: continent-app/scripts/verify_trip_crew.mjs.

Model it exactly on scripts/verify_past_trip.mjs (same server spawn, same
enterApp helper that dismisses "Continue without an account", "Got it" and
"START HERE", same fail/ok reporting, same shots dir).

Cover, as a guest:
  1. log a past trip with two companions, both names come back on the card
  2. the names survive a reload (they live on the device)
  3. the same names are pre-filled in the expense ledger
  4. at 390px wide nothing scrolls sideways

Run it from inside continent-app/ and make it pass before you finish.
```

---

# Phase 2: share a trip, read only

First SQL. A share is a revocable token, and the read goes through one RPC so
there is exactly one place that decides what leaves the account.

**Built and applied, 2026-08-19.** Migration 009 is live on
`ntssxktaduxzpsmejwyv`. Its self-check block passed on apply (the Supabase SQL
editor does not surface `NOTICE`, but every assertion is a `raise exception`,
so "Success" is the pass). Verified against the live database as `anon`:
`get_shared_trip` with an unknown token returns zero rows rather than an error;
`project_trip_payload` is `42501 permission denied`, so the projection cannot
be called around; `trip_shares` reads back empty and an insert is refused by
RLS. Browser side, `verify_trip_share.mjs` passes 12 checks off the `?sharemock`
seam.

Still unverified: the happy path on real data, which needs an owner session
(create a share in the app, then read the token back as `anon` and confirm the
ledger really is absent from a trip that has one).

## Step 2.1: the share token

**Touches.** New `supabase/migrations/009_trip_shares.sql`.

**Do.** The `trip_shares` table from the research note, plus a
`security definer` RPC `get_shared_trip(token uuid)`.

The RPC is where the whole design lives. It returns the plan, its stops, and
a **projected** day_plans payload. Whitelist on the way out, exactly the way
`decodeTripShare` whitelists on the way in:

- always drop `expenses`, `bookings`, `inbox`, `notes`
- include `memory.photos` only when `scope = 'memory'`
- return nothing at all when `revoked_at` is set or `expires_at` has passed

Grant `execute` to `anon` as well as `authenticated`: a share whose first
screen is a signup wall does not get opened.

**Done when.** The file exists, has been pasted into the SQL editor by hand,
and `select * from get_shared_trip('<token>')` returns a trip with no expense
rows in it.

```
Implement Step 2.1 only, per docs/SHARING_FRIENDS_BUILD.md and section 3
Stage 1 of docs/SHARING_FRIENDS_PLAN.md.

Write supabase/migrations/009_trip_shares.sql. Do NOT run supabase db push,
the live project is ntssxktaduxzpsmejwyv and migrations there are applied by
hand. Write the file and tell me to paste it.

Read supabase/migrations/004_day_plans.sql first for the payload shape, and
007_passes.sql for the house comment style (these migrations explain their
reasoning, match that).

Table trip_shares plus a security definer RPC get_shared_trip(token uuid) with
search_path pinned. The RPC does the outbound whitelist: always strip
expenses, bookings, inbox and notes from the day_plans payload; include
memory.photos only when scope = 'memory'; return zero rows when revoked_at is
set or expires_at has passed. Grant execute to anon and authenticated.
```

## Step 2.2: creating and revoking a share

**Touches.** New `src/auth/tripShares.js`, and a share control on the trip
cards in `auth/SavedTripsPanel.jsx` (there is already a `CardMenu` popover
component at the top of that file, put it there).

**Do.** Create, list and revoke. The copy button pattern already exists in
`AccountPanel.jsx` (`handleShare`, `shareCopied`), reuse its shape.

**Done when.** A signed in account can create a link from a saved trip, see
it listed, and revoke it.

```
Implement Step 2.2 only, per docs/SHARING_FRIENDS_BUILD.md.

Create continent-app/src/auth/tripShares.js (create, list, revoke against the
trip_shares table) and add a "Share this trip" entry to the CardMenu popover
in SavedTripsPanel.jsx.

Follow auth/tripPlanStorage.js for the storage-module style, and reuse the
copy-to-clipboard pattern from AccountPanel.jsx (handleShare, shareCopied).
This is account only, so gate it with auth/AuthGate.jsx and give guests a
sensible prompt rather than a hidden control.

Load carta-design. Six i18n files. Lint, build.
```

## Step 2.3: the viewer

**Touches.** `App.jsx` (the hash reader at line ~226 already handles
`#trip=`, add `#shared=`), plus a read only trip view.

**Do.** Reuse the existing decode-and-open path. The shared payload arrives
already projected from the RPC, so the viewer's job is only to render it
without any edit affordances. Keep the existing hash hygiene: read once at
startup before `useUrlSync` replaces state, strip from the address bar, and
ignore hashes that carry Supabase auth params.

**Done when.** Opening a share link in a private window, signed out, shows
the trip and offers no edit controls.

```
Implement Step 2.3 only, per docs/SHARING_FRIENDS_BUILD.md.

Teach continent-app/src/App.jsx to open a #shared=<token> link, alongside the
existing #trip= reader at line ~226. Read src/lib/shareLink.js first: match
its hash hygiene exactly (read once at startup before useUrlSync's first
replaceState, strip from the address bar, ignore hashes carrying Supabase
auth params like type=recovery).

The payload comes back already projected from get_shared_trip, so the viewer
only renders. No edit affordances anywhere, and it must work signed out.

Load carta-design. Six i18n files. Lint, build.
```

## Step 2.4: verify Phase 2

```
Implement Step 2.4 only: continent-app/scripts/verify_trip_share.mjs, modelled
on scripts/verify_past_trip.mjs.

Cover: a share link opens signed out; it shows the trip; it shows no edit
controls; a revoked token shows a clean "this link no longer works" state
rather than an error or a blank screen.

Use a fixture seam in the style of ?savedmock (SavedTripsPanel.jsx line ~50)
if you need one, rather than requiring live Supabase credentials.
```

---

# Phase 3: profiles and handles

Nothing social can exist before this: today one account cannot learn another
account's name at all.

**Built and applied, 2026-08-19.** Migration 010 is live on
`ntssxktaduxzpsmejwyv`. Its self-check passed, which also proves the backfill:
one of its assertions is that zero accounts are left without a profile, so an
account that the trigger could not reach would have aborted the apply.

Verified against the live database as `anon`: `profiles` reads back empty and
an insert is refused by RLS; `find_profile_by_handle` is `42501 permission
denied`, since the lookup is for signed-in callers only; and the three internal
helpers (`claim_handle`, `fold_handle`, `handle_reserved`) are all denied too,
so the handle namespace cannot be probed from outside.

Two things worth knowing about what was built. `find_profile_by_handle` is
granted to `authenticated` only, not to `anon` the way `get_shared_trip`
deliberately is: you have to be signed in to look anyone up, which keeps the
enumeration surface as small as a handle system allows. And the signup trigger
swallows its own errors on purpose, because a failure there would block account
creation entirely; a missing profile is repairable, a signup that returns an
error is not.

`verify_account_panel.mjs` grew a `3b. handle` section (6 checks) off a stubbed
`public.profiles`, including the 23505 taken-handle path.

## Step 3.1: the profiles table

**Touches.** New `supabase/migrations/010_profiles.sql`.

**Do.** `profiles` keyed on `user_id`, with a unique `handle`, seeded by a
trigger on `auth.users` insert so no account can exist without one. Derive
the handle from the email local part with a numeric suffix on collision.

Discovery is one `security definer` RPC `find_profile_by_handle(text)`
returning at most one **exact** match. No prefix search, no listing, and
never an email lookup: that is an account enumeration oracle.

Table level select stays self only for now; Phase 4 widens it to accepted
friends.

```
Implement Step 3.1 only, per docs/SHARING_FRIENDS_BUILD.md and section 3
Stage 0 of docs/SHARING_FRIENDS_PLAN.md.

Write supabase/migrations/010_profiles.sql. Do NOT run supabase db push, write
the file and tell me to paste it into the SQL editor.

profiles(user_id pk, handle unique, display_name, avatar_emoji, created_at),
seeded by a trigger on auth.users insert, handle from the email local part
with a numeric suffix on collision. Constrain handle to lowercase
[a-z0-9_]{3,24}.

One security definer RPC find_profile_by_handle(text) returning at most one
exact match, search_path pinned. No prefix search, no listing, no email
lookup. Table level select is self only in this migration.

Match the commented reasoning style of 007_passes.sql.
```

## Step 3.2: the handle in the account panel

**Touches.** `auth/AccountPanel.jsx` profile spoke (`view === 'profile'`,
line 501, which already has a name and email form), new
`src/auth/profiles.js`.

**Do.** Show the handle, allow one edit of it, validate against the same
regex as the check constraint, and report a taken handle without revealing
who took it.

```
Implement Step 3.2 only, per docs/SHARING_FRIENDS_BUILD.md.

Create continent-app/src/auth/profiles.js and add a handle field to the
profile spoke of AccountPanel.jsx (view === 'profile', line ~501, which
already has the name and email form and its own busy/error/notice state).

Validate client side against the same [a-z0-9_]{3,24} rule as the DB check
constraint. A taken handle reports "that handle is taken" and nothing about
who holds it.

Load carta-design. Six i18n files. Lint, build.
```

## Step 3.3: verify Phase 3

```
Implement Step 3.3 only: extend continent-app/scripts/verify_account_panel.mjs
rather than writing a new script, since the profile spoke is already covered
there. Add: the handle field renders, rejects an invalid handle inline, and
survives a reload.
```

---

# Deep security review, 2026-08-19 (second pass)

Ran over the whole pending branch after phase 4 was built. Five findings, all
fixed; the SQL ones travel inside migration 011, which also `create or
replace`s 009's two live functions.

| # | Severity | Finding | Fix |
|---|---|---|---|
| F1 | high | `get_shared_trip`/`get_friend_trip` returned `stop.choices` whole; the first stop carries `anchorOrigin`, the traveller's HOME ADDRESS, plus own-booking details | `project_stop_choices` whitelist (lat, lon, past, custom, nights), shared by both readers via `project_trip_stops`; self-checked |
| F2 | high | either side could delete a friendship row, so a blocked requester could delete the block and ask again | delete policy: a blocked row is deletable only by the addressee; self-checked |
| F3 | medium | photos in a client-writable payload rendered as `<img src>`; a remote URL becomes a tracking pixel reporting who viewed the trip | SQL: only `data:image/` srcs survive, capped at 8; client: `TripMemoryView` filters the same way; both verified |
| F4 | medium | the visibility control seeded from empty state could show "Only me" over a trip actually visible to friends | seeded from the fetched trip row |
| F5 | low | 011 was not re-paste-safe | `drop policy if exists` before every create |

Accepted risks, deliberately not fixed: handle lookup lets a signed-in user
dictionary-scan handles one exact guess at a time (rate limiting needs infra
this project does not have; the namespace is unlistable); a freed handle can
be re-claimed by someone else; `claim_handle` has a narrow signup race whose
worst case is an account without a profile, repaired by re-running 010's
backfill loop.

The friends page (count + their trips in the Friends spoke) and the ledger's
friend chips landed in the same pass. The chips have no headless coverage of
their own; they compose `readCrew`/`writeCrew`, whose positional contract is
unit-tested, and `fetchFriendLinks`, which `verify_friends` covers.

# Phase 4: friends

**Built, 2026-08-19. Migration 011 is written but NOT yet applied.**

The security review in step 4.6 found two real holes in the first draft of
that migration, both of which the browser tests could never have caught
because they stub the database. Both are fixed, and both are now asserted by
the migration's own self-check so they cannot come back:

1. **Every first friend request would have been refused.** The insert policy
   checked that the addressee had a profile. That subquery runs under the
   caller's own RLS, and the profiles policy hides a stranger until a link
   exists, so the check was false in exactly the case it was meant to permit.
   Removed: `addressee_id` is a foreign key into `auth.users`, so the check
   bought nothing anyway.

2. **The person who was asked could rewrite who asked them.** The update
   policy pinned `addressee_id` after the write, but a `WITH CHECK` cannot see
   the OLD row, so `requester_id` was still writable and an accepted
   friendship could be manufactured with a third party. This is the same shape
   of hole migrations 003 and 008 closed for `trip_plan_stops`. Fixed with
   column privileges rather than another policy: `requester_id` and
   `addressee_id` are simply not updatable, so nothing has to defend them.

`verify_friends.mjs` passes 15 checks, and `verify_account_panel`,
`verify_trip_crew`, `verify_trip_share`, `verify_saved` and `verify_past_trip`
all still pass. Two harness gotchas worth remembering: Playwright matches
routes in REVERSE registration order, so a catch-all must be registered first
or it silently swallows every specific route; and `.section-title` is
uppercased in CSS, which `innerText` reports, so headings need
case-insensitive matching.

## Step 4.1: the friendship graph

**Touches.** New `supabase/migrations/011_friends.sql`.

**Do.** The `friendships` table and the `least/greatest` unique pair index
from the research note, the `visibility` column on `trip_plans` defaulting to
`private`, and the `are_friends(a, b)` `security definer` function.

**The trap.** A policy on `trip_plans` that subqueries `friendships`, where
`friendships` has a policy subquerying back, is Postgres error 42P17,
infinite recursion in policy. Every cross table check goes through a
`security definer` function with `set search_path = public`. Mark it `stable`
and call it wrapped as `(select public.are_friends(...))` in the policy, so
it is evaluated once per statement instead of once per row.

**Do not** widen `day_plans` RLS to friends. That blob holds the expense
ledger and base64 photos.

```
Implement Step 4.1 only, per docs/SHARING_FRIENDS_BUILD.md and section 3
Stage 3 of docs/SHARING_FRIENDS_PLAN.md, which has the SQL sketch.

Write supabase/migrations/011_friends.sql. Do NOT run supabase db push.

friendships table with the least/greatest unique pair index so A->B and B->A
cannot both exist. visibility column on trip_plans, default 'private', so
shipping this exposes nothing retroactively. are_friends(a,b) as a stable
security definer function with search_path pinned.

Two hard rules:
  - every cross-table RLS check goes through the security definer function and
    is called wrapped as (select public.are_friends(...)), never inlined as a
    subquery, or you get error 42P17 and a per-row evaluation
  - do NOT widen day_plans RLS to friends, that payload carries the expense
    ledger and base64 photos. Friend reads go through an RPC in step 4.2.
```

## Step 4.2: requests, acceptance, and reading a friend's trip

**Touches.** `supabase/migrations/011_friends.sql` (or a `012`), new
`src/auth/friends.js`.

**Do.** RPCs for request, respond, unfriend, list. Plus
`get_friend_trip(plan_id)` returning a **projected** payload: stops, day
picks, cover photo, nothing else. This is the same projection as
`get_shared_trip`, so factor the projection into one SQL function both call.

**Two privacy rules, and they are the point of this step.**

*The friend list is private.* `friendships` rows are readable only by the two
people named in them. There is no friends-of-friends browsing, at any depth,
ever. Who travels with whom is exactly the kind of thing that should not be
inferable by walking a social graph.

*Crew on someone else's trip is a name, never a link.* The projection above
excludes extras today, so crew does not leak. That is currently luck rather
than design, and step 4.5 creates the pressure to change it: the natural wish
is to show "with Sofie and Jonas" on a friend's trip card. If crew ever enters
the projection, strip `userId` from every entry unless the viewer is also
friends with that person. Otherwise viewer A learns that B was on the trip
while A and B have never met, and the private friend list above is undone
through the back door. A name tells you about the journey; a link tells you
about somebody's social graph.

```
Implement Step 4.2 only, per docs/SHARING_FRIENDS_BUILD.md.

RPCs for friend request, respond, unfriend and list, plus
get_friend_trip(plan_id) which returns a projected payload: stops, day picks,
cover photo, nothing else.

get_shared_trip from migration 009 already does this projection. Factor the
projection into one shared SQL function that both RPCs call, do not write the
whitelist twice; two copies of a whitelist is how one of them drifts and leaks.

Two privacy rules to enforce in the SQL:
  - friendships rows are readable only by the two people named in them. No
    friends-of-friends listing exists, at any depth.
  - if crew ever enters the projection, strip userId from every entry unless
    the viewer is also friends with that person. Name yes, link no.

Then create continent-app/src/auth/friends.js as the client layer, styled on
auth/tripPlanStorage.js. Migration file only, do not push it.
```

## Step 4.3: the Friends spoke

**Touches.** `auth/AccountPanel.jsx`. The hub is a `view` switch (line 152)
with a `MenuRow` list (line ~495), so a fifth spoke drops in cleanly.

**Do.** Add someone by handle, pending requests in and out, the accepted
list, and unfriend. Note the existing `.account-avatar` class is already
taken by the header, so pick another name.

```
Implement Step 4.3 only, per docs/SHARING_FRIENDS_BUILD.md.

Add a 'friends' spoke to continent-app/src/auth/AccountPanel.jsx. The panel is
a hub with a view switch (line ~152) and a MenuRow list (line ~495); follow
the shape of the existing spokes exactly, including the scroll-to-top effect
and the sign-out guard that bounces you back to 'home'.

Contents: add by handle, incoming and outgoing pending requests, the accepted
list, unfriend. Account only, so AuthGate it.

The class name .account-avatar is already taken by the header, pick another.
Load carta-design. Six i18n files. Lint, build.
```

## Step 4.4: link the crew to real friends

**Goal.** Closes the loop from Phase 1: a companion becomes a person who can
see the trip.

**Touches.** `auth/tripCrew.js` (`userId` stops being always null),
`auth/PastTripForm.jsx` companion rows.

**Do.** The companion row becomes "choose a friend, or type a name". Typing a
name still works and still stores, which is the point of the model: an
unlinked person renders identically to a linked one.

```
Implement Step 4.4 only, per docs/SHARING_FRIENDS_BUILD.md.

Let a crew member link to a real account: userId in src/auth/tripCrew.js stops
being always null, and the companion rows in PastTripForm.jsx become "choose a
friend, or type a name".

The unlinked path must keep working unchanged and must render identically to
the linked one. That is the whole point of the model, do not split it into two
code paths or two components.

Load carta-design. Six i18n files. Lint, build.
```

## Step 4.5: friends' trips

**Touches.** `auth/SavedTripsPanel.jsx`, using its existing `SavedSection`
component (top of the file) for the shelf.

**Do.** A shelf of trips friends have set to `friends` visibility, read
through `get_friend_trip`. Plus a visibility control on your own trip cards,
defaulting to private.

```
Implement Step 4.5 only, per docs/SHARING_FRIENDS_BUILD.md.

Add a friends' trips shelf to SavedTripsPanel.jsx using the existing
SavedSection component at the top of that file. Read through get_friend_trip,
never by querying day_plans directly.

Also add a visibility control (private / friends / link) to your own trip
cards, in the CardMenu popover. It must default to private and must show the
current value, not a status word.

If you show the crew on a friend's trip card, it is names only. Never render a
handle, a profile link, or an avatar that resolves to an account, unless the
viewer is also friends with that person. See the privacy rules in step 4.2.

Load carta-design. Six i18n files. Lint, build.
```

## Step 4.6: verify and review

```
Two things, in this order.

1. continent-app/scripts/verify_friends.mjs, modelled on
   verify_account_panel.mjs. Cover: the Friends spoke opens, an invalid handle
   is rejected inline, a guest sees the AuthGate rather than an error, and a
   friend's trip card renders without any edit control.

2. Then run /security-review over the whole branch. Specifically confirm:
     - no RLS policy inlines a cross-table subquery (error 42P17 risk)
     - day_plans RLS was never widened to friends
     - both projections come from the one shared SQL function
     - no RPC accepts a user id from the client where auth.uid() would do
     - handle lookup is exact match only and cannot enumerate accounts
     - friendships rows are readable only by the two people named in them, and
       no query path lists a third party's friends at any depth
     - crew shown on someone else's trip carries names only, with userId
       stripped unless the viewer is friends with that person too
```

---

## After the plan

Deliberately not built, and I would keep it that way: co-editing a trip
(`day_plans` is a whole blob upsert keyed on `(user_id, plan_id)`, so two
people editing one trip is last write wins and one of them loses a whole
day), realtime presence, public profile pages, and friend search by email.

If co-editing ever becomes the ask, it is per day rows or a real merge
strategy, not an RLS change, and it is more work than these four phases
combined.
