# T100: I3, a party-size control, and two people no longer assumed silently

## Task ID

T100 (mind-map number T096), branch `p6-i3-party-size` in both repos.

## Date

2026-10-07

## What changed

The first-run receipt from T099 now has a People cell as the first field of its input strip, before Stay and the two dates. It is a select from 1 to 12 people. Changing it reprices the receipt at once, writes `choices.group_size` (the same field the planner and the `g` URL parameter use), and counts as the visitor's first act, so `carta.firstResultSeen` is set.

The default is now two. It used to be seven: `App.jsx` started `group_size` at 7, and `useAppData.js` then copied `meta.defaults.group_size`, which is 7 in the generated `public/app_data.json`. Per session rule 5 the data was not touched. Both places now say `init.group_size ?? 2`, so only a link carrying `g=` changes it, and the data default is deliberately no longer read for the party. The receipt already prints the party in its orientation line, its subtitle and its total line, so the assumption is stated wherever it applies.

Private rooms and hotel rooms are priced as double rooms (`stayTierNightly`, ceil(people / 2) rooms). When the party is odd and the stay line is a measured private or hotel tier, the receipt card now says so in one line: "Rooms are priced as doubles: 3 people book 2, so a spare bed is still paid for", or for one person "A room is priced as a double: you pay for the whole room, so one person pays more than half of a pair." This is the trust point of the task: a solo traveller in a private room pays the whole room, and the receipt now says that instead of implying half. Dorm beds and entire places carry no note, because their price does not depend on a spare bed.

On a narrow column (a phone, or the destination page's side column) the strip is two rows of two: People and Stay, then Arrive and Leave.

## Files touched

Modified, app repo:
- src/components/FirstRunReceipt.jsx
- src/styles/38-first-run.css
- src/App.jsx
- src/hooks/useAppData.js
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (three keys each: receipt.stripPeople, receipt.roomNote, receipt.roomNoteOne; only added lines)
- tests/firstRun.test.mjs (one test: a solo traveller in a private room pays the whole double room)

Modified, root repo: Execution/_OPEN.md. Created, root repo: this report.

## Commands run

Everything in the app worktree C:\Users\Gebruiker\Documents\Portfolio\wt\T099-app. Keys were added with add_after.py (keeps each file's BOM and CRLF), then `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs`, `npm run build`, `vite preview --port 5208` with the config outside the repo, and headless Playwright scripts in wt\T100-shots (shoot.mjs, note.mjs, solo.mjs). All six catalogues parse after the edit. dist/ and dist-data/ were deleted after the build and the preview server on 5208 was stopped.

## Config and secrets set

None. The Supabase variables were unset in the shell and the live project was never contacted.

## Before/after measurements

Measured on the built app, Trieste destination page (`#dest=TRS`), default dates 7 Nov to 14 Nov 2026, Entire place, no fare typed. Source: wt\T100-shots\shoot.mjs output.

| Metric | Before | After | Delta |
|---|---|---|---|
| Default party on first open | 7 (app_data.json meta.defaults.group_size) | 2 | -5 |
| Total at the default party | not measured at 7 | €1,393.54 (€696.77 each) | |
| Total for 1 person | no control | €835.20 | |
| Total for 5 people | no control | €2,904.70 (€580.94 each) | |

Trip page (a City week, 1280 and 380 px): total moved from €3,102.05 at two people to €859.06 at one.

## What broke and how it was fixed

No issues in the build. One thing to know: the room note first matched my own check by accident (the tier footer also says "room"), so the check was repeated on Lisbon with 1 and 3 people, which shows both notes as written. Trieste has no measured private tier, so it never shows a note.

## What is still open

The Lifestyle slider on the trip page (JourneyPage.jsx) is not next to a party control, and the other price surfaces were not re-checked at the new default of two (Explore cards via `costIndex.js`, the planner, the budget block); JourneyPage and those files are outside this task's named scope. The party is remembered in the URL (`g`) only, not across sessions. Both are in the register.

## Rollback procedure

In both worktrees' branch `p6-i3-party-size`, revert the two commits (app first, then root), or `git reset --hard` the branches to the merged main and master from before this task. Nothing was migrated and no data was written. The one behavioural change that survives a partial revert is the default of seven, restored by `init.group_size ?? 7` in `App.jsx` and `?? def?.group_size` in `useAppData.js`.

## Design questions (carta-design brief)

Who is this for: a hiker or cyclist, often travelling alone, who needs a number that is true for them. What does it say: People, a count, and one plain sentence when a room is shared. Which tokens: only existing ones (`--rule`, `--bg-card`, `--mono`, `--ink-soft`); no new colour, font, radius or shadow. How many primaries: unchanged, one ("Set your dates"). Does it work at 380 px: yes, two rows of two, no horizontal scroll, checked at 380 and 1280 px with no page errors. Is any claim unsupported: no, the room note repeats what `stayTierNightly` computes. Does it use banned patterns: no em dashes, no middots, no emoji, no colour-only meaning.
