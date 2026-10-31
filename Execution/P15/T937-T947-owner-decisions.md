# T937 to T947: the owner's decisions, built

## Task ID

T937 to T947, one batch (CLAUDE.md "Batches"), branch `p15-decisions`.

## Date

2026-10-31

## Shared header

The owner made 17 decisions on the "Carta Decisions and Launch List" page (https://claude.ai/artifact/GhGe5cK9aYDna3bh6MibeQ). The choices were read back from the page's database. They also ticked launch step 1, the deploy access, which reaches only new sessions.

Decisions that change nothing in the code:

- Together stays in the header and keeps its name.
- No age check (the owner's choice).
- The bolder looks stay.
- Claude deploys from now on.

The other eleven were built as three parallel tracks in worktrees, merged into the batch, followed by one fix commit. The owner's notes were built too:

- "focus on the total trip budget, instead of a day" became T938;
- "make sure across the app this is shown in the necessary settings so people know that this exists" became T947.

**How it was checked.**

- **Static checks:** eslint has 0 errors. `npm test` passes all 1,199 tests, including new tests for settle-up, the trip band, shared lists, saved-to-plan, the plan bed nudge and notify. design-lint reports 168 violations, the same count as `main`.
- **Track checks:** each track agent looked at its screens at 390 and 1,440 through the seams.
- **Coordinator end check:** the dev server at 390 and 1,440, through the `?friendsmock`, `?accountmock` and `?savedmock` seams and the `?legal=cookies` address. Screens checked:
  - the group trip, Settle up, the friend page and the Together hub
  - Account Preferences and Your travel
  - the cookie page
  - a shared list

## Migrations for the owner, in order

None is applied yet. Paste each in the Supabase SQL editor (never `db push`) and look for its self-check line. To undo, run the `_down.sql` files in reverse order; `058_down` must run before `055_down`.

| Order | File | Self-check line |
|---|---|---|
| 1 | `055_group_trips.sql`, after 054 (edited in this batch: `max_trip`, a trip-total band) | "group trips self-check passed" |
| 2 | `056_friend_visibility.sql` (edited: no cost switch or cost; tips come from `friendTip`) | "friend visibility self-check passed" |
| 3 | `057_join_requests.sql` | "join requests self-check passed" |
| 4 | `058_group_expenses.sql` | "group expenses self-check passed" |
| 5 | `059_shared_saved_lists.sql` | "shared saved lists self-check passed" |
| 6 | `060_email_prefs.sql` (its cron needs pg_cron, pg_net and the Vault secrets `notify_url` and `notify_secret`; paste again after setting them) | "email prefs self-check passed" |

## T937: friends never see costs; a separate tip for friends

- The Costs switch is gone, and so is every friend cost: on the Explore card, in Friends here, on the friend page and in Account's Friends see.
- 056 neither stores nor returns a cost, and its self-check fails if a cost or the story comes back.
- A new "Tip for friends" field (`memory.friendTip`, 160 characters) on a past trip is shown only while Tips is on. The story stays private.
- **Commits:** `634c1829e1`, `d6ca5c5d2b`.
- **Rollback:** `git revert d6ca5c5d2b 634c1829e1`.

## T938: the group budget is a total for the trip

- Each member sets a private maximum for the whole trip, a person (`max_trip`).
- The band reads "Up to €X for the trip". It is rounded down to €10 and still needs three budgets.
- Each option shows its trip total: day price times nights, beds plus food. Getting there is excluded, and the page says so.
- **Commit:** `272702afab`.
- **Rollback:** `git revert 272702afab`.
- **Open:** should the trip budget also count travel from each member's home (T938-a)?

## T939: Ask to join (migration 057)

- "Ask to join" sits on Friends' plans and the friend page; once sent, it reads "Requested".
- The trip owner sees the request under To answer and in the header count.
- Accepting writes an accepted co-planner row (the same row 052 writes); declining is a silent delete.
- `urlState.js` gains `settle` for T940.
- **Commit:** `146df91052`.
- **Rollback:** `git revert 146df91052`, then `057_down`.

## T940: Settle up (migration 058)

- Members log shared costs: who paid, the amount, and an equal split among the chosen members.
- "Who pays whom" shows the fewest transfers (`src/together/settle.js`: exact up to 14 people, greedy beyond).
- Each transfer shows the payee's own https payment link (set in Together, Privacy) and "Mark as paid". Euro only.
- **Commit:** `b02d3aaef9`.
- **Rollback:** `git revert b02d3aaef9`, then `058_down`.

## T941: shared Saved lists (migration 059)

- A list can be shared with accepted friends. Members add saves, edit a shared note per item and vote; each item shows who added it.
- Only the owner manages members; a member may leave.
- Sharing moves the list to the server; the device copy is deleted only after the server confirms.
- There is no realtime refresh: the list reloads after your own change and when the tab opens (T941-a).
- **Commit:** `de87eb742f`.
- **Rollback:** `git revert de87eb742f`, then `059_down`.

## T942: Plan a trip with these, for every kind

- Places stay 2-night stops.
- A trail, beach, lake, mountain or cycling route becomes a day activity at the nearest catalogue town within 80 km. That town is added as a stop if needed, with an extra night per extra activity, up to 7.
- Picks with no town near enough are counted and left out.
- **Commit:** `00f4c713cc`.
- **Rollback:** `git revert 00f4c713cc`.

## T943: bed price stored at planning

- Saving a trip stores each stop's bed price a night (`choices.planBed`).
- My trips' nudge reads "Beds in Porto 8% under your plan" when a price falls at least 3% and at least a euro a night.
- Older trips keep the first-seen comparison.
- Stops with their own stay tier are not compared, because My trips prices every stop at the trip's tier (T943-a).
- **Commit:** `247b2d94ed`.
- **Rollback:** `git revert 247b2d94ed`.

## T944: opt-in emails (migration 060, Edge Function `notify`)

- **Account:** Preferences gets an Emails group with Trip reminders and Price drops, both off by default and saved at once.
- **Sending:** `notify` sends through Resend: a reminder 7 days before a trip, and a price drop on saved places. Each email has a signed one-click unsubscribe, and an email log keeps anything from being sent twice.
- **Price drops:** day prices are computed in the browser. The page reports a clear drop (at least €5 and 10%) at most once in 20 hours. The server sends at most one price email a day, a place at most once a week, and five places an email.
- **Secrets:** `RESEND_API_KEY`, `NOTIFY_FROM`, `NOTIFY_SECRET`, and optionally `APP_URL`.
- **Deploy:** `supabase functions deploy notify --no-verify-jwt`.
- **Commit:** `6d140aa665`.
- **Rollback:** `git revert 6d140aa665`, then `060_down`.
- **Open:**
  - the data export does not include `email_prefs` or `email_log` (T944-a);
  - there has been no live send (T944-b).

## T945: Cookies and storage page, no banner

- **Inventory:** no cookies at all, and no analytics or tracking scripts (the CSP allows scripts from 'self' only).
- **What is stored:** `carta.*` and `continent.*` local storage; the Supabase session in local storage; the `carta-files` IndexedDB; the service worker cache; the on-device model cache. Stripe's cookies stay on Stripe's domain.
- **The page:** at `?legal=cookies`, linked from the footer's Legal column and from Account.
- **Commit:** `80d1cac312`.
- **Rollback:** `git revert 80d1cac312`.

## T946: Google connect and disconnect

- `linkGoogle` and `unlinkGoogle` in AuthContext.
- Disconnect shows only when another sign-in method exists, and each error has one plain sentence.
- **Commit:** `e9ca79734e`.
- **Rollback:** `git revert e9ca79734e`.
- **Owner:** turn on manual identity linking in Supabase (T946-a).

## T947: "Your travel style" wherever travel settings are edited

- The chip is gone from Explore.
- The same row opens TasteSheet in: Filters (desktop pane and phone sheet), the Lifestyle panel, Plan's lifestyle step and Account's Your travel.
- Place pages show a "Set your travel style" link while it is unset.
- **Commit:** `6e29b39cae`.
- **Rollback:** `git revert 6e29b39cae`.
- **Open:**
  - in Plan's trip settings the sheet opens over a sheet, which breaks the one-sheet rule (T947-a);
  - the wizard's `LifestyleChoices` has no travel-style row yet (T947-b).

## Batch

- **Deploy:** the owner added the Cloudflare access, but it reaches only new sessions. A new session runs the deploy steps from the launch list (T918-c).
