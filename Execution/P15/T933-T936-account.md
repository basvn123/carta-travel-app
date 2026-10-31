# T933 to T936: Account rebuilt as one hub

## Task ID

T933 to T936, one batch (CLAUDE.md "Batches"), branch `p15-account`.

## Date

2026-10-31

## Shared header

The owner asked for /impeccable deep research on the account page and a clean artifact. The page had to be complete, to the point and clear, fit the style of the other tabs, and be clean on mobile and desktop. "Carta Account" (https://claude.ai/artifact/3YgCMF58e3b6JL3FhYfcCH) followed, and the owner answered: "I love it go".

The open questions took these defaults:

- **Your travel:** edits the same settings store as Explore's settings line.
- **Emails:** shown only if real. Carta sends none, so Emails was left out.
- **The three numbers:** kept.

One agent built T933 to T936 in sequence; the coordinator merged them and ran one end check.

**How it was checked.**

- **Static checks:** eslint has 0 errors. `npm test` passes all 1,165 tests. design-lint reports 168 violations, the same count as `main`.
- **End check:** the real app with the dev-only `?accountmock` seam (`=trip`, `=free` and `=guest` give the other states), at 1,440 and 390. States checked:
  - Overview, Your travel, Plan, Cancel
  - Sign-in and security, Your data
  - signed out

  There was no overflow and no page errors.
- **Fixes:** none needed.

## T933: the shell and Overview

### What changed

**Layout.** From 900 px, a sticky rail (Overview, Your travel, Plan, Preferences, Together, Sign-in and security, Your data, Help, Sign out) and one pane. On a phone, grouped rows open each section with a back link, one level deep. Each section has its own address (`?tab=account&view=`), and a section change is one history step. Old `view=yourdata` and `view=friends` addresses still work.

**Overview.** An identity card: face, name, handle and plan, then trips, countries and friends from real reads. Below it, the groups with their current values; Sign out and the legal links sit at the foot.

**Signed out.** A sign-in card (Google and email), Your travel, Preferences and Help.

### Files touched

- `continent-app/src/auth/AccountPanel.jsx` (rewritten).
- New in `src/auth/account/`: `parts.jsx`, `useAccountFacts.js` and `accountMock.js`.
- `src/styles/91-account.css` (prefix `.ac-`).
- `src/App.jsx`, `src/lib/urlState.js`, `i18n/*.js` (`ac.*` keys).

### What is still open

The old `.acct-plan` and `.account-lang-*` styles in `69-v6-account.css` may now be unused (T933-a).

### Rollback procedure

`git revert 5f8ffa1d1f`, together with the later tasks.

## T934: Your travel and Preferences

### What changed

**Your travel** opens on one place priced with the current settings: the next trip's first place, else Lisbon. The price updates as the settings change. The rows open the existing editors:

- **Home, Travellers:** the settings line's own controls, through a new `SettingsEditorSheet` export in `SettingsLine.jsx`.
- **Stay, Eating and pace:** the Lifestyle panel.
- **Travel style:** TasteSheet.
- **Per person or whole group:** PriceViewSwitch.

Everything reads and writes the one store Explore uses.

**Preferences:** Language opens a compact list in place of the six tiles. Currency is a static row, because EUR is the only currency.

### Files touched

`src/auth/account/TravelView.jsx`, `travelValues.js`, `src/components/SettingsLine.jsx`.

### What is still open

Carta sends no trip or price emails, so the Emails row was left out (T934-a).

### Rollback procedure

`git revert ae8b17d549`.

## T935: Plan and cancel

### What changed

**The Plan section** shows:

- the plan name and price (from `TIERS`), and the renewal, end or "until" date;
- meters for Carta bot plans and live searches, with a reset date only on a renewing plan;
- "Change plan" and "Cancel yearly plan" at the same weight;
- Receipts, which opens the Stripe portal;
- every plan from `TIERS`.

**Cancelling** is one screen: "You keep it until <date>", "Then Free", Keep (focused) and Confirm cancellation, wired to `cancelYearly`. The Trip Pass does not renew, so it shows an "until" date and no Cancel. `PlanSection.jsx` is removed.

### Files touched

`src/auth/account/PlanView.jsx`; `PlanSection.jsx` deleted.

### What is still open

Nothing beyond the deploy.

### Rollback procedure

`git revert f4681b5d7e`.

## T936: Together, sign-in, your data, help

### What changed

- **Together:** handle, Friends see (opens Together's privacy view), and "Open Together".
- **Sign-in and security:** email; password (the existing form or set-password link, opened in place); Google connected or not; "Sign out everywhere" (a new `signOutEverywhere` in AuthContext, using Supabase's global scope).
- **Your data:**
  - counts of trips, saves, photos, day plans, friends and AI chats;
  - "Download my data" and "Delete my account", opening the existing flows in place;
  - "AI and booking reader" (`view=ai`), a plain page of what goes to the plan-day, suggest-city and parse-booking functions, written from the code;
  - Privacy policy.

  Deleting the account now cancels a renewing yearly plan first, and stops if that fails.
- **Help:** Common questions, Where the numbers come from, Send feedback, Share Carta.

### Files touched

`src/auth/account/AiView.jsx`, `src/auth/AuthContext.jsx`.

### What is still open

- There is no cookie or consent page in the app, so Cookies was left out (T936-a).
- Supabase gives the client no session list, so Devices was left out; "Sign out everywhere" stands in (T936-b).
- Blocked people cannot be listed, because `friends.js` drops blocked links (T936-b).
- Linking Google from Account needs manual identity linking turned on in the Supabase project (T936-c).
- The photo count covers trip-memory photos on this device only (T936-d).

### Rollback procedure

`git revert 336a1b5dbc`.

## Batch

**Design departures for the owner to review:**

- rows on white lists with a soft shadow, not a border;
- an umber face disc;
- the Email row reuses the lock icon, because the icon set has no mail icon.

**Deploy:** not possible from this session (T918-c).
