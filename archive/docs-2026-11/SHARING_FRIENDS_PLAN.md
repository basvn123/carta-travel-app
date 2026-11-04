# Sharing, trip people and friends

Research note, 2026-08-19. What it would take to (a) share a trip with
someone, (b) record who you took a trip with, and (c) add friends and see
their trips. Written against the code as it stands on `map-transport-glyphs`.

## 1. What the app already has

Six anchors matter, because three of them mean this is much cheaper than it
looks and three of them are the real obstacles.

**Already built, reusable:**

1. `src/lib/shareLink.js` is a complete zero backend read only trip share:
   the whole draft goes JSON, deflate, base64url into the URL hash, versioned
   and whitelisted on decode. It is wired to exactly one button today
   (`planner/TripItinerary.jsx:395`). Sharing an *unsaved* trip is a solved
   problem.
2. `auth/pastTripMemory.js` already stores `companions: []`, a free text list
   of who came, per past trip. `PastTripForm.jsx:498-517` edits it and
   `TripMemoryView.jsx:132` prints it. The Travel record ask is half built.
3. `planner/ExpenseLedger.jsx` already keeps `extras.people[]`, a second free
   text list of the same humans, used to split spend. Today you type the same
   names twice.

**The obstacles:**

4. There is **no profiles table**. `auth.users` is not readable from the
   client, and `user_metadata.full_name` is visible only to its owner. So
   right now one account cannot learn another account's name at all. Nothing
   social can exist until that is fixed.
5. Data lives in three layers, and the interesting half sits in a blob:
   - `trip_plans` + `trip_plan_stops`: proper SQL rows, the trip skeleton.
   - `day_plans`: **one jsonb payload per (user_id, plan_id)** holding day
     picks, prefs and *extras*, and extras holds bookings, notes, checklist,
     the expense ledger, and the whole past trip memory including photos.
   - localStorage, which is the source of truth; the cloud row is a mirror.

   Photos are downscaled data URLs inside that jsonb (`PastTripForm.jsx:61`;
   no Supabase Storage bucket exists anywhere in the repo). So "let a friend
   read this trip" cannot be a plain RLS grant on `day_plans`: it would hand
   them the group's expense ledger and megabytes of base64 along with it.
6. RLS is uniformly `auth.uid() = user_id` on every table. There is no second
   read path anywhere yet.

## 2. The unifying idea

The three asks are not three features. They are three tiers of one primitive:
**a person attached to a trip**, where the person may or may not have an
account.

So build one table that carries both a plain name and an optional linked
account. Then:

- name only, no account: "who I did this with" in Saved trips and Travel
  record, works for guests, works for your gran who will never sign up.
- name plus linked account: that person sees the trip in their own app.
- the same rows drive the expense ledger split, so nobody types a name twice.

Everything else is visibility rules on top.

## 3. Recommended build, in cost order

### Stage 0: profiles (prerequisite, ~1 migration)

`migration 009_social.sql`:

```sql
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  handle       text unique not null,          -- lowercase, [a-z0-9_], 3..24
  display_name text,
  avatar_emoji text,
  created_at   timestamptz not null default now()
);
```

Seed it from a trigger on `auth.users` insert (handle derived from the email
local part, plus a suffix on collision), so no account can exist without one.

**Discovery must be by handle or invite link only, never by email search.**
Email search is an account enumeration oracle and a GDPR conversation you do
not want. Concretely: keep table level `select` to self plus accepted
friends, and expose one `security definer` RPC `find_profile_by_handle(text)`
that returns at most one exact match. No prefix search, no listing.

UI cost: one extra field in the profile spoke of `AccountPanel.jsx`
(`view === 'profile'`, line 501), which already has a name form.

### Stage 1: share a trip, read only (~1 migration + 1 RPC)

Two mechanisms, and you want both because they cover different cases.

**Unsaved draft:** keep the existing hash link. It costs nothing and already
works. Just surface the button in more places.

**Saved trip:** a token table, because a saved trip carries a memory with
photos that will not fit in a URL, and because a link you cannot revoke is a
link you will regret.

```sql
create table public.trip_shares (
  token         uuid primary key default gen_random_uuid(),
  trip_plan_id  uuid not null references public.trip_plans(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  scope         text not null default 'itinerary',  -- 'itinerary' | 'memory'
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
```

Read it through a `security definer` RPC `get_shared_trip(token uuid)`, not
through RLS on the underlying tables. That gives you one place to do the
**outbound whitelist**, which is the critical bit: strip `expenses`,
`bookings`, `notes` and `inbox` by default, and include `photos` only for
scope `'memory'`. This mirrors exactly what `decodeTripShare` already does on
the inbound side, so it fits an instinct the codebase already has.

No account needed to view a shared link, which matters: the app is guest
first, and a share whose first screen is a signup wall does not get opened.

### Stage 2: people on a trip (the Saved trips and Travel record ask)

> **Superseded.** `docs/SHARING_FRIENDS_BUILD.md` builds this without the
> table below. `extras.people` already exists, already syncs, and already
> works for guests, so upgrading that array is cheaper and covers more people.
> The table is kept here as the reasoning that led there.

```sql
create table public.trip_people (
  id           uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,        -- always set, even when linked
  user_id      uuid references auth.users(id) on delete set null,
  role         text not null default 'companion',  -- 'companion' | 'editor'
  created_at   timestamptz not null default now()
);
create unique index on public.trip_people (
  trip_plan_id, coalesce(user_id::text, lower(name))
);
```

`name` is always present, so an unlinked person renders identically to a
linked one. That single decision is what keeps this from splitting into two
code paths.

Where it lands, all of it in surfaces that already exist:

- `SavedTripsPanel.jsx` trip cards: an avatar stack plus "with Sofie and
  Jonas" on the subline. (Watch the middot ban; those sublines are already
  under that rule.)
- `PastTripForm.jsx:498-517`: the free text companion rows become a picker,
  "choose a friend, or type a name". Same shape, one extra branch.
- `TripMemoryView.jsx:132` already joins and prints the list, so the Travel
  record lights up with no new component.
- `ExpenseLedger.jsx`: read `extras.people` from the same list instead of
  keeping its own array.

**Migration path:** keep reading `memory.companions[]` and `extras.people[]`,
write to the new table, backfill lazily on next edit. Do not attempt a big
bang migration; most of that data is in localStorage and cannot be reached
from a SQL migration at all.

**Gotcha:** if you instead decide to keep this inside extras rather than in a
table, you must add the key to the whitelist in
`dayPlanStore.loadTripExtras()` (around line 206) or it is silently dropped
on every read. That whitelist has bitten this codebase before.

Guests: a guest can still name companions locally. Linking a companion to an
account requires sign in, so that one control sits behind the existing
`auth/AuthGate.jsx`.

### Stage 3: friends and seeing their trips (~1 migration + 3 RPCs + 2 UI surfaces)

```sql
create table public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users(id) on delete cascade,
  addressee_id  uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending','accepted','blocked')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  check (requester_id <> addressee_id)
);
-- One edge per pair, in either direction.
create unique index friendships_pair_uniq on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);
```

Plus a visibility column on the trip:

```sql
alter table public.trip_plans add column visibility text not null default 'private'
  check (visibility in ('private','friends','link'));
```

Default `private` matters: shipping this must not retroactively expose a
single existing trip.

**The RLS trap, and it is a real one.** A policy on `trip_plans` that
subqueries `friendships`, where `friendships` has a policy that subqueries
back, gives Postgres error 42P17, infinite recursion in policy. Every cross
table check has to go through a `security definer` function with an explicit
`search_path`:

```sql
create function public.are_friends(a uuid, b uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(a, b)
      and greatest(f.requester_id, f.addressee_id) = greatest(a, b)
  );
$$;
```

Mark it `stable` and call it wrapped as `(select public.are_friends(...))` in
the policy. Unwrapped it is evaluated **per row**; wrapped, Postgres caches
it per statement. On a trip list that is the difference between instant and
unusable.

**Do not open `day_plans` RLS to friends.** As established in section 1, that
blob holds the expense ledger and the photos. Read a friend's trip through a
`security definer` RPC `get_friend_trip(plan_id)` that returns a *projected*
payload: stops, day picks, cover photo, nothing else. One function, one
whitelist, one thing to audit. Same pattern as `get_shared_trip`, so Stages 1
and 3 share their projection code.

UI: a Friends spoke in `AccountPanel.jsx` (the hub already takes spokes
cleanly, it is a `view` switch), and a "Friends' trips" shelf in
`SavedTripsPanel.jsx` built from the existing `SavedSection` component.

### Stage 4: co-editing. Do not build this yet.

`day_plans` is a whole blob upsert keyed `(user_id, plan_id)`. Two people
editing one trip is last write wins on the entire payload, so one of them
loses their whole day. Making that safe means per day rows or a real merge
strategy, not an RLS change, and it is more work than Stages 0 to 3 combined.

Ship read only membership first. "Sofie can see this trip" covers most of
what people actually mean when they say they want to share a trip.

## 4. What I would deliberately cut

- **Friend search by email.** Enumeration risk, no upside over handles.
- **Realtime presence or live cursors.** Nothing here is collaborative enough
  to need it.
- **A public profile page or a social feed.** That is a different product.
- **Co-editing in v1.** See Stage 4.

## 5. Cost and sequencing

| Stage | Schema | RPCs | UI surfaces | Rough size |
|---|---|---|---|---|
| 0 profiles | 1 table + trigger | 1 | profile spoke field | half a day |
| 1 share a trip | 1 table | 1 | share sheet, viewer route | half a day |
| 2 trip people | 1 table | 0 | 4 existing components | half a day |
| 3 friends | 1 table + 1 column | 3 | Friends spoke, trips shelf | 1 to 2 days |

Stages 0 and 2 together already deliver the Saved trips and Travel record
ask, and they are the cheapest things on the list. I would ship those first,
then 1, then 3.

Two costs that apply to every stage and are easy to forget:

- **i18n.** Six locale files in `src/i18n/`. Every string lands six times.
- **Guests.** The app is guest first by design. Every social control needs an
  `AuthGate`, and every social surface needs a sensible guest state rather
  than an error.

Optional: passes exist (`007_passes.sql`, `lib/pricing.js`), so friends could
be gated to a paid tier. I would not. Sharing is how the app spreads.
