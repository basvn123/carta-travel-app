# T034: Instrument the paywall funnel before launch, not after

## Date

2026-09-24

## What changed

Before this task the funnel from migration 022 could count shown, dismissed
and checkout events per reason code, but it could not answer the question the
financial model actually needs, which is not "how many people were asked" but
"how many people who were asked actually paid, and does that differ between a
gate that blocks a button and an offer that blocks nothing." Ten reason codes
were mixed into one shown total regardless of whether the traveller had just
tried to export a PDF or had merely been shown an unprompted upsell after
saving a third trip. Averaging those two kinds of event answers a worse
question than answering them separately.

After this task, migration 027 replaces `admin_paywall_funnel` with a version
that adds a `kind` (hard or soft) to every row in `byReason`, a new `byKind`
rollup, and a `conversionRate` computed against actual purchases rather than
against button presses. AdminPage.jsx renders both. A new static harness,
`verify_paywall_funnel.mjs`, checks that the hard/soft list restated in SQL
cannot silently drift from the one true list in `usePaywall.jsx`, and that
every gate GATES defines has somewhere in the app that can actually fire it.
That second check already found a real gap: `expiring` has a reason code, a
heading key in every locale, and no call site anywhere, so it can never
appear in the funnel and never will until something calls it.

Migration 022 has never been applied to the live project. `paywall_events` and
`paywall_daily_total` do not exist on `ntssxktaduxzpsmejwyv` today. This was
known going in from T033's context and was checked again directly for this
task; it still holds. Everything below that involves calling the RPC or
reading the funnel's output was done against a local Supabase stack with
migrations 019 through 027 applied (018 and 023 held aside, see below), and
against traffic written through the same `paywall_event` RPC the client calls,
because no browser session against a local stack could be assembled inside
this task's scope without adding an auth flow this task was not asked to
touch.

## How an event travels from a gate to the admin table

Start at a call site. Every gated action in the app calls either
`paywall.require(reason)` (a hard gate: it always opens, because a button that
silently does nothing reads as a bug) or `paywall.nudge(reason)` (a soft gate:
shown at most once a session, snoozed 30 days once dismissed, never shown to
someone who already pays). Both live in `hooks/usePaywall.jsx` and both end up
setting the same `reason` state, which mounts `PassModal`. A `useEffect` keyed
on the reason changing, not merely on the effect running, calls
`trackPaywall('shown', reason, tier)` exactly once per opening. This keying
matters: an entitlement read landing late while the modal is already open must
not fire a second `shown` for the same reason, or the top of the funnel
inflates against a checkout count that cannot move to match.

`trackPaywall`, in `lib/paywallEvents.js`, is fire-and-forget by design. It
never awaits its own RPC call and never throws, because an analytics write
that can fail a gate would be worse than no analytics. It de-duplicates
identical event/reason/tier triples inside a 1.5 second window, which absorbs
React strict-mode's double-invoked effects in development. It calls
`supabase.rpc('paywall_event', ...)`, which is migration 022's SECURITY
DEFINER function: it checks the event name against a hard-coded set, checks a
200,000-a-day global ceiling shared across all reasons (protection against a
runaway client loop, not against fraud), and inserts one row into
`paywall_events` with `auth.uid()` for the user (null for a guest, and null
again once an account is deleted, because the row is `on delete set null`).
`paywall_events` has row level security enabled with zero policies, so the
only way in is this function and the service role; nothing can read a row
back except the two definer RPCs.

Dismissal fires from `handleClose` in the same hook, only on a genuine close
(pressing the cross, Escape via the overlay's own click handler, or a backdrop
click, all of which route through `onClose`), never on a successful purchase,
because buying navigates the whole page away to Stripe and never calls
`onClose` at all, and never on sign-in, which goes through `close()` directly
rather than `handleClose()`. A soft gate's dismissal also writes a 30-day
snooze; a hard gate's dismissal does not, because dismissing a hard gate means
"not now", not "stop asking".

A checkout press calls `trackPaywall('checkout', reason, tier)` from
`lib/checkout.js`, before the network call to the `checkout` Edge Function.
This is intent, not outcome, and the file says so in its own header comment.
It is recorded before the round trip specifically so a checkout that dies at
Stripe, or a popup a browser blocks, still shows up as someone who tried,
which is the gap most worth seeing. The purchase itself is never claimed by
this file.

The purchase side of the ledger is entirely separate. `pass_grants` gets one
row per completed Stripe Checkout Session, written only by the
`stripe-webhook` Edge Function calling `grant_pass`, which nothing on the
client can reach. `admin_paywall_funnel`'s top-level `purchased` figure has
always read `count(*) from pass_grants where granted_at > since`, unchanged by
this task. What migration 027 adds is a *per-reason* purchase count, and that
is the harder half of this task, covered next.

## What "converted" means, and why

There were two candidate definitions available before this task, and the
choice was not obvious from the schema alone. One: converted means a
`checkout` event, which is recorded the instant the buy button is pressed. Two:
converted means an actual `pass_grants` row, written only once Stripe has
confirmed payment. The top-level funnel already picked the second definition
for its overall `purchased` count; migration 022's own comment is explicit
that a client saying "I bought it" is worthless. What migration 022 had not
done is extend that same choice down to the per-reason breakdown: `byReason`
in the original RPC reported `checkout` counts per gate, but no `bought`
figure per gate at all, so nobody could actually compute "did the export gate
convert better than the plans gate" without joining `pass_grants` by hand
outside the RPC, using a reason code that `pass_grants` does not carry.

Migration 027 keeps `checkout` as its own field, unrenamed, because the gap
between checkout and bought is itself useful: it is the size of the drop-off
Stripe's own page causes, which the app has no other way to see. But
`conversionRate` on every row, per-reason and per-kind, is computed against
`bought`, which reads from `pass_grants`, not against `checkout`. A rate that
is going to feed a financial model has to answer "how many people who saw this
gate actually paid," not "how many pressed a button that sometimes leads
nowhere." This is the least-surprising choice on offer: it is what the
top-level funnel already did, and changing it would have meant either
inventing a new meaning for "converted" that disagrees with the field right
next to it, or quietly redefining `purchased` itself, which migration 022's
comment specifically warns against doing from the client side.

Attribution from a purchase back to a reason is the part that has no clean
join key. `pass_grants` carries no reason column, because the webhook only
ever receives a tier from Stripe, never the gate that sent the buyer there.
Rather than widen `grant_pass`'s argument list again for a value the webhook
genuinely does not have, or trust a client-supplied reason on the one table
that exists specifically so nothing client-supplied is trusted, migration 027
attributes a grant to the nearest preceding `checkout` event from the same
user, for the same tier, inside a one-hour window. This is an estimate, not a
foreign key, and the RPC says so plainly: the returned shape carries
`"attribution": "nearest_checkout_1h"` so nobody mistakes the `bought` figure
for something joined on an id. One hour is generous against how long a real
Stripe Checkout session takes and short enough that an unrelated second
purchase on the same tier days later is not misattributed to a stale gate.

## Per-gate coverage: where shown, dismissed and converted are tracked

| Gate | Kind | Call site (file:line) | shown | dismissed | converted (checkout intent) |
|---|---|---|---|---|---|
| export | hard | `TripItinerary.jsx:408,414,933`, `TrailPage.jsx:492,499`, `DayPlannerTab.jsx:2080,2091,2102`, `DestinationPage.jsx:391` | via `require()` effect | via `handleClose` | via `PassModal.buy` -> `startCheckout` |
| import | hard | `MagicImportZone.jsx:35` | yes | yes | yes |
| share | hard | `TripSharePanel.jsx:89,235` | yes | yes | yes |
| save | hard | `TripPlannerTab.jsx:606` | yes | yes | yes |
| plans | hard | `AiDayPlanModal.jsx:378` via `onOpenPass('plans')` -> `DayPlannerTab.jsx:3755` `paywall.require(reason)` | yes | yes | yes |
| ground | hard | `AiDayPlanModal.jsx:252` via the same `onOpenPass` indirection | yes | yes | yes |
| browse | hard | `AccountPanel.jsx:872`, `AppHeader.jsx:64`, `AnnouncementBar.jsx:84` via `openPrices()` | yes | yes | yes, but rarely bought directly from a price-table browse |
| plansLow | soft | `AiDayPlanModal.jsx:278` via `onOpenPass('plansLow')` | yes | yes | yes |
| celebrate | soft | `TripPlannerTab.jsx:303` via `nudge('celebrate')` | yes | yes | yes |
| expiring | soft | none found | **no call site anywhere in src/** | n/a | n/a |

Every gate except `expiring` has all three legs wired through the one shared
path in `usePaywall.jsx`, which is exactly the point of that hook: `require`,
`nudge` and `openPrices` are three doors into one modal, and all three run
through the same `shown` effect and the same `handleClose` dismissal, so
nothing downstream of the hook itself can forget to report. `plans`, `ground`
and `plansLow` are reachable only through `AiDayPlanModal`'s `onOpenPass`
prop, which is itself wired to `paywall.require(reason || 'browse')` in
`DayPlannerTab.jsx`; that indirection is easy to miss on a first read (a grep
for `require('plans')` finds nothing, because the literal string only appears
as `onOpenPass('plans')` one component away) and is exactly the kind of thing
`verify_paywall_funnel.mjs` now checks for automatically, following the prop
through by name rather than requiring a human to remember the indirection
exists.

`expiring` is the one real gap. It has a reason code in `GATES`, a heading key
(`pass.headingExpiring`) present and non-empty in all six locales (confirmed
by the existing `verify_paywall.mjs`), and REASON_COPY entry in
`PassModal.jsx`, but nothing in the application ever calls
`paywall.require('expiring')` or `paywall.nudge('expiring')`. It is dead code
that looks, from the schema and the copy alone, like a feature that ships.
This task did not wire it up: doing so would mean deciding where and when a
pass-about-to-expire nudge should fire (on app open? on a specific screen? how
many days before expiry?), which is a product decision this task's scope does
not cover and CLAUDE.md's rule against touching files outside a task's
declared scope would rule out doing quietly as a side effect of an
instrumentation task. It is recorded here and left open.

No dismissal path was found that skips the `dismissed` event for a gate that
did fire `shown`. The overlay's `onClick={onClose}` on the outer
`day-saved-overlay pass-overlay` div, the explicit cross button, and any route
change that unmounts `PaywallProvider`'s children while `reason` is still set
would each eventually call `handleClose` or simply unmount without it; the
former is covered, the latter (an unmount without `handleClose` running, for
instance a hard navigation) was not exercised directly in this task and is
noted under what is still open, though it is unlikely in practice because the
provider mounts high in the tree and outlives route changes.

## Dynamic verification

Migration 022's absence on the live project made a live check of the RPC
impossible, as anticipated. `supabase db query "select table_name from
information_schema.tables where table_schema='public' and table_name in
('paywall_events','paywall_daily_total','pass_grants','entitlements',
'plan_tiers')" --linked` returned only `entitlements`, `pass_grants` and
`plan_tiers`. `paywall_events` and `paywall_daily_total` are absent. No RPC
call was attempted against the live project as a result, per the standing
rule.

A local Supabase stack was started with `018_content_overrides.sql` held
aside, matching T031 through T033's precedent for its `{5,600}` POSIX regex
bound. `023_coplanner_policy_fix.sql` also had to be held aside for this run,
which is new: its self-check runs `set local role authenticated` inside a
`do $$ ... $$` block without a surrounding `begin; ... commit;`, and on this
local Postgres that produced `permission denied for table trip_plans` and
aborted the whole `supabase start`. This is unrelated to anything in scope
here (023 only touches `trip_collaborators` and `trip_plans` policies, never
paywall or pass_grants), and holding it aside does not affect any of this
task's evidence, since 022 through 027 all applied cleanly with 023 out of the
way. Both 018 and 023 were restored to `supabase/migrations/` before this
report was written and before anything was committed;
`git status --porcelain supabase/` at that point showed only the new
`027_paywall_funnel_kinds.sql`.

With 022 applied locally, a signed-in test user and a separate test admin
were created directly in `auth.users` (there is no signup flow to drive from
SQL, and standing up a browser session against a local stack was judged out
of this task's proportion given the RPC-level evidence is what the funnel
actually needs verified). Sixteen `shown` events were written through
`paywall_event()` exactly as `trackPaywall` calls it, impersonating the test
user inside `begin; set local role authenticated; set local request.jwt.claims
= '...'; ... commit;`, covering every gate in GATES except `expiring` (which
cannot be exercised because it has no call site, which is itself the finding).
Two of the nine hard-gate reasons and one of the two soft-gate reasons were
carried through to a `checkout` event, and two matching `pass_grants` rows
were written via `grant_pass` (a trip pass attributed to `export`, a year pass
attributed to `share`) to give the attribution logic something real to find.
Two guest `shown` events (no JWT claims, so `auth.uid()` is null) were added
for `export` and `browse` to exercise `shownGuest`.

`admin_paywall_funnel(30)` was then called as a plain authenticated user
(non-admin) and returned `{"error": "forbidden"}`, confirming `admin_guard`
still refuses a non-admin caller after the rewrite. Called as the test admin,
inside the same transaction-wrapped impersonation pattern, it returned:

| Field | Value |
|---|---|
| shown | 16 |
| dismissed | 7 |
| checkout | 3 |
| purchased | 2 |
| shownGuest | 2 |

byReason (nine rows, one per gate that has a call site; no `expiring`, no
`unknown`):

| reason | kind | shown | dismissed | checkout | bought | conversionRate |
|---|---|---|---|---|---|---|
| export | hard | 5 | 1 | 1 | 1 | 20.0% |
| browse | hard | 2 | 1 | 0 | 0 | 0.0% |
| plans | hard | 2 | 1 | 0 | 0 | 0.0% |
| share | hard | 2 | 0 | 1 | 1 | 50.0% |
| plansLow | soft | 1 | 1 | 0 | 0 | 0.0% |
| celebrate | soft | 1 | 0 | 1 | 0 | 0.0% |
| import | hard | 1 | 1 | 0 | 0 | 0.0% |
| save | hard | 1 | 1 | 0 | 0 | 0.0% |
| ground | hard | 1 | 1 | 0 | 0 | 0.0% |

byKind:

| kind | shown | dismissed | checkout | bought | conversionRate |
|---|---|---|---|---|---|
| hard | 14 | 6 | 2 | 2 | 14.3% |
| soft | 2 | 1 | 1 | 0 | 0.0% |

Every sanity condition the task asked for holds. Shown counts match the
traffic generated exactly (16 total, matching the per-reason breakdown one for
one). `dismissed + checkout` never exceeds `shown` for any reason (export:
1+1=2 of 5; the others are all within bounds by inspection above). No reason
code outside GATES appears anywhere in the output; there is no `unknown` row,
because every event this task wrote carried a real reason. Migration 022's
`check (event in ('shown', 'dismissed', 'checkout'))` constraint was not
touched by this task and continues to accept every event
`lib/paywallEvents.js`'s `EVENTS` set can send, which `verify_paywall.mjs`
checks statically on every run and which passed both before and after this
task's changes. `celebrate`'s checkout shows 0 bought, correctly: no
`pass_grants` row was written to match it, so the attribution logic correctly
reports an unconverted checkout rather than inventing a purchase, which is the
behaviour the "estimate, not a join key" design in the migration's header
comment is meant to produce.

Migration 027 was applied twice in a row locally with `ON_ERROR_STOP=1` and
succeeded both times, `create or replace` leaving exactly one definition of
each function.

## Files touched

**Created, root repo:**
- supabase/migrations/027_paywall_funnel_kinds.sql
- Execution/P2/T034-paywall-funnel-instrumentation.md

**Created, continent-app repo:**
- continent-app/scripts/verify_paywall_funnel.mjs

**Modified, continent-app repo:**
- continent-app/src/admin/AdminPage.jsx
- continent-app/src/i18n/en.js
- continent-app/src/styles.css

`continent-app/src/auth/admin.js` was read and not touched: `adminPaywallFunnel`
already binds `admin_paywall_funnel` with no arguments beyond `p_days`, and
migration 027 keeps that same signature, so no new binding was needed.

Admin-surface strings (`admin.funnel*`) were added to `en.js` only, following
the existing convention documented in `verify_paywall.mjs`'s own comment
("English only, like the rest of the admin panel: one operator, one
language") and confirmed by the fact that none of the pre-existing
`admin.funnel*` keys exist in `de.js`, `es.js`, `fr.js`, `it.js` or `nl.js`
either. The task prompt's instruction to add six locale keys per new string
applies to traveller-facing copy (the `pass.*` keys checked by
`verify_paywall.mjs`); no new `pass.*` strings were needed for this task,
since the hard/soft split and conversion rate are entirely an admin-surface
change and the pass modal itself was not touched.

## Commands run

```
# root repo
git checkout -b p2-paywall-funnel-instrumentation p2-stripe-tax-and-oss

# continent-app repo, from its own HEAD (also p2-stripe-tax-and-oss)
cd continent-app && git checkout -b p2-paywall-funnel-instrumentation

# local stack, 018 and 023 held aside (023 newly, see above)
export PATH="/c/Users/Gebruiker/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"
mv supabase/migrations/018_content_overrides.sql <scratchpad>/held/
mv supabase/migrations/023_coplanner_policy_fix.sql <scratchpad>/held/
supabase start -x realtime,storage-api,imgproxy,studio,logflare,vector,supavisor,mailpit,postgres-meta

# live check first
supabase db query "select table_name from information_schema.tables where table_schema='public' and table_name in ('paywall_events','paywall_daily_total','pass_grants','entitlements','plan_tiers') order by 1;" --linked

# test user and admin, then sixteen paywall_event() calls impersonating the
# user inside begin;/commit;, then two grant_pass() calls, then two guest
# shown events, then admin_paywall_funnel(30) as non-admin and as admin
docker exec -i supabase_db_Travel_App psql -U postgres -d postgres < ...

# migration 027, applied and re-applied for idempotency
docker exec -i supabase_db_Travel_App psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/migrations/027_paywall_funnel_kinds.sql
docker exec -i supabase_db_Travel_App psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/migrations/027_paywall_funnel_kinds.sql

# funnel re-read after the migration, as admin

supabase stop --no-backup
mv <scratchpad>/held/*.sql supabase/migrations/

cd continent-app
node scripts/verify_paywall.mjs
node scripts/verify_paywall_funnel.mjs
npx eslint src/admin/AdminPage.jsx
npx vite build
npx vite preview --port 4173 --strictPort &
curl -s http://127.0.0.1:4173/ -o served_index.html
md5sum served_index.html dist/index.html   # matched, dist is not stale
```

Nothing was run against the live project beyond the one read-only
`information_schema` query. No `supabase db push`, no live RPC call, no
secret set, no function deployed.

## Config and secrets set

None. No new secret is required by this task.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `paywall_events` present live | no | no | unchanged, expected |
| Migration 022 applied live | no | no | unchanged, this task did not apply it |
| `admin_paywall_funnel` fields | days, shown, dismissed, checkout, purchased, shownGuest, byReason (reason/shown/dismissed/checkout), byTier, daily | adds byKind, attribution, and kind + bought + conversionRate on every byReason row | additive, no field removed or renamed |
| Gates with a working shown/dismissed/converted path | 9 of 10 (all but `expiring`) | 9 of 10 (unchanged; `expiring` documented, not wired) | 0 |
| Local 30-day funnel, shown | no local traffic existed before this task | 16 | +16 (synthetic, generated by this task) |
| Local 30-day funnel, checkout | none | 3 | +3 |
| Local 30-day funnel, purchased (pass_grants) | 0 | 2 | +2 |
| Local hard-gate conversionRate (shown to bought) | not computable | 14.3% | new metric |
| Local soft-gate conversionRate (shown to bought) | not computable | 0.0% | new metric |
| Static verify scripts covering the funnel | 1 (verify_paywall.mjs) | 2 (adds verify_paywall_funnel.mjs) | +1 |

The local traffic figures are synthetic, generated by this task to exercise
the RPC end to end; they say nothing about real purchase intent and are not
meant to. Nobody has bought anything from Carta yet, live or otherwise, so
there is no real "before" figure for purchase rate to report, which is the
whole reason this task exists ahead of T038's price test rather than after it.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `supabase start` failed applying 023 locally with `permission denied for table trip_plans` | 023's self-check runs `set local role authenticated` outside a `begin;/commit;` block on this local Postgres, so the role change did not take and the proof query ran as a role that cannot read the table | Held 023 aside alongside 018 for this task's local runs, restored both before committing. Filed as a local-stack quirk for whoever next needs 023 locally, not fixed in place, since 023 is outside this task's declared file scope |
| `CREATE TABLE AS is not allowed in a non-volatile function` on the first draft of the attribution query | The RPC is declared `stable`, correctly (it is read-only), and the draft used a temporary table for the nearest-checkout join, which is DDL and Postgres refuses inside anything but a `volatile` function | Rewrote the attribution as a `with` CTE inline in each query instead of a temp table; no function volatility changed |
| `column g.id does not exist` on the first attribution query | `pass_grants` has no surrogate id column; its primary key is `session_id` | Used `g.session_id` as the row identity for `distinct on` and for counting distinct attributed grants |
| `subquery uses ungrouped column "e.reason" from outer query` | A correlated scalar subquery inside a `jsonb_build_object` referenced a column from before the `group by` | Split into two CTEs (`events_by_reason`, `bought_by_reason` / `events_by_kind`, `bought_by_kind`) and joined them, rather than correlating inside the aggregate |
| `verify_paywall_funnel.mjs`'s first draft flagged all seven hard gates as missing a case in `t034_gate_kind` | The SQL function only lists the three soft reasons explicitly and defaults everything else to hard, which is correct and documented, but the checker assumed every gate needed an explicit case | Rewrote the check to be one-directional: only reasons GATES calls soft need an explicit soft case in the SQL, and only reasons the SQL calls soft need to still be soft in GATES. A hard gate needing no case at all is the intended shape |

## What is still open

`expiring` has no call site and cannot appear in the funnel until one exists
or the gate is removed. This is a product decision (when should a
pass-about-to-expire prompt fire, and to whom) outside this task's scope, and
`verify_paywall_funnel.mjs` now fails loudly on it by design, the same way
`verify_paywall.mjs` fails loudly on a missing locale key, so it will not be
silently rediscovered. Whoever picks this up next should either wire a call
site (most likely from wherever `entitlement.expiresAt` is read for a paying
user close to renewal) or remove the gate, its copy, and its locale keys
together.

Migration 022 has not been applied to the live project, confirmed directly for
this task, not merely inherited from T033's note. Migration 027 depends on
022 and cannot be applied live before 022 is. Until both are pasted into the
Supabase SQL editor, `admin_paywall_funnel` cannot be called against
`ntssxktaduxzpsmejwyv` at all, and the admin panel's funnel section will show
whatever `adminPaywallFunnel(30).catch(() => setFunnel(null))` does on a
missing table, which based on the RPC's own SECURITY DEFINER guard is a thrown
Postgres error mapped to `null`, rendering nothing rather than a wrong number.
That fails safe, but it also means nobody sees a warning that the funnel is
not yet running; the AdminPage.jsx section simply does not appear at all,
because it is gated on `funnel && !funnel.error`.

Attribution is a one-hour nearest-checkout estimate, not a foreign key, by
design (see the migration's own header comment for why a precise join is not
available). It will slightly undercount in a genuinely unusual case: a
traveller who opens Checkout, abandons it, reopens a different gate, and
completes a purchase from the second attempt within the same hour would have
that purchase attributed to whichever checkout event is nearest, which is
usually but not always the one they actually completed. This was not
observed in testing (nothing in the sixteen events created that pattern) and
is flagged here as a known edge the estimate does not resolve rather than as
a bug.

The dismissal path was not tested for every possible exit: a hard browser
navigation or tab close while a gate is open was not exercised, only the
in-app close paths (cross button, backdrop click). `PaywallProvider` mounts
high enough in the tree that an in-app route change should not unmount it
mid-gate, but this was reasoned about rather than directly observed.

No UI shows the live `admin_oss_threshold` tile T033 left open; that remains
genuinely optional per T033's own report and was not revisited here, since it
is unrelated to the funnel.

Whether `admin_guard`'s rate limit could ever be tripped by rapid funnel
reads (for instance an admin refreshing the page repeatedly) was not tested
under load; the single-call check confirmed no audit log row is written by a
funnel read at all, which is the mechanism that protects against this, but a
burst of many reads inside the guard's own window was not simulated.

## Rollback procedure

Local: `docker exec -i supabase_db_Travel_App psql -U postgres -d postgres -c "drop function if exists public.admin_paywall_funnel(int); drop function if exists public.t034_gate_kind(text);"` restores nothing by itself; re-running migration 022 unmodified after that recreates the original three-argument-shape `admin_paywall_funnel`. In practice: `supabase db reset` replays every migration in `supabase/migrations/` from scratch and is the clean way to undo this locally, since 027 has not shipped anywhere that holds state worth preserving.

Live: migration 027 was never applied to the live project, so there is nothing to roll back there. If it is pasted into the SQL editor later and needs reverting, re-paste migration 022's `create or replace function public.admin_paywall_funnel` block verbatim (it is `create or replace`, so this fully restores the pre-027 three-field-per-reason shape) and `drop function if exists public.t034_gate_kind(text);`. AdminPage.jsx reads `funnel.byKind` and `r.kind`/`r.conversionRate` defensively (falling back to the client-side GATES kind and to a locally computed percentage when those fields are absent), so reverting the SQL without reverting the app code degrades gracefully rather than breaking the page.

`continent-app`: `git revert 4250541` on the `p2-paywall-funnel-instrumentation` branch removes the AdminPage, i18n, styles and verify script changes cleanly, since nothing else was committed on top of them in this task.
