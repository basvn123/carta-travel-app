# T1109: Cookieless channel counts (K12)

## Date

2026-11-06

## What changed

On landing the app reads `utm_source` and `utm_medium`, reduces them to a channel name and a medium bucket and sends one tick to a per-day counter. Admin Overview has a new card, "Visits by channel (weekly)", with the current week per channel and a total per earlier week. Nothing identifying is read, sent or stored. The server half is a pending migration file (not numbered, per the brief), so live counting starts when the owner pastes it.

Privacy note. Counted: visits per channel per day. Not counted or stored: utm_campaign/content/term, referrer, URL or path, cookies, localStorage or sessionStorage values, device, session or account id, IP, time of day. A reload counts again (deliberate over-count; nothing remembers a visitor). Visits without UTM show as `none`. Server ceilings: 500 keys and 100,000 ticks per day, no client table grants. Recorded as row 14 in `docs/legal/ARTICLE30.md` and in the HANDBOOK admin section.

## Files touched

- `continent-app/src/lib/channelCounts.js` (new: reader, sender, admin view shaping)
- `continent-app/src/components/admin/ChannelCounts.jsx` (new), `Overview.jsx`, `useOverview.js`
- `continent-app/src/auth/admin.js` (`adminChannelWeekly`), `continent-app/src/main.jsx`
- `continent-app/tests/channelCounts.test.mjs` (new, 4 tests, stubbed backend)
- `supabase/migrations/067_channel_counts.sql` (new, unnumbered, down steps in its header)
- `docs/HANDBOOK.md`, `docs/legal/ARTICLE30.md`, `ROADMAP.md` (K12 status), `Execution/_OPEN.md`

## Commands run

`cd continent-app && npm ci --ignore-scripts && npx eslint <touched> && npm test` (1362 pass, 0 fail; one existing warning in main.jsx).

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Test import crashed under node | `supabaseClient.js` reads `import.meta.env` | `trackChannelVisit` imports it dynamically; helpers stay pure |

## Screens checked

Admin Overview card not looked at in a browser (no Supabase in the container); view shaping is unit tested.

## What is still open

- T1109-a: the migration must be numbered and pasted.
- T1109-b: rest of K12 (Search Console, waitlist funnel, I16 numbers) is not done; waitlist and support pages belong to other sessions.

## Rollback procedure

`git revert` the T1109 commit. If the migration was applied, run the down steps in its header (drops the two tables and two functions; counts are lost).

## Owner steps (for the checklist)

- [T1109-a] Apply channel counts migration | the server half of K12 is only a file | rename `067_channel_counts.sql` to the next free number and add a `_down` file; paste it in the Supabase SQL editor; open `/?utm_source=test` once and check the admin Overview card | supabase/migrations/067_channel_counts.sql
