# T987: Together, tidier for an account with little in it

## Task ID
T987

## Date
2026-11-01

## What changed
The owner sent a screenshot of the live page for an account with one friend and nothing else. They did not like four things:
- the structure of the page;
- the title styling;
- the loose, indented Group trips, Friends and Milestones sections;
- Privacy sitting at the bottom of the page.

The work went through the impeccable skill. Branch `p15-together-tidy` (root repo).

**Header**
- The title and a lock icon (Privacy) share one row.
- Add a friend sits under that row.
- The Privacy link at the bottom of the page is gone.
- The title's letter spacing now matches My trips (`-0.01em`).

**Group trips with none yet**
- This used to be a bare heading with "+ New". It is now one card row: a round people icon, "New group trip", the line "Vote on dates and places, with a budget that fits all", and a chevron. The row opens the new group form.
- "+ New" shows only once a group exists.

**Milestones**
- In Together, Milestones now has the same heading size and card as every other block. The account panel's section padding, small label heading and border are reset.
- The rules are scoped to `.tg-o-badges`, so the account panel is unchanged.

**Desktop with little content**
- When the wide left column has nothing to show (no plans that meet, no friends' plans), its blocks share two equal columns instead of leaving the left half empty: Group trips beside Friends, then Milestones beside Guides. This uses `:has()`.

**Mock seam**
- New `?friendsmock=one`: one friend, with nothing else. It matches the owner's live state.

## Files touched
**Modified:**
- `continent-app/src/together/TogetherPage.jsx`
- `continent-app/src/together/GroupTrips.jsx`
- `continent-app/src/together/friendsMock.js`
- `continent-app/src/styles/90-together.css`
- `continent-app/src/i18n/{en,de,es,fr,it,nl}.js`: new key `tg.groupPitch`.

**Created:** `Execution/P15/T987-shots/`

## Commands run
- `npx eslint src/together/`: 0 errors. The 8 warnings were already there.
- `npm test`: 1204 of 1204 pass.
- Playwright at 375 px (touch) and 1440 px on `?friendsmock=one`, the full mock and `=empty`, with `guidesmock=some&badgemock=some`. None scrolls sideways. The full home page looks the same as after T986, apart from the header.

## Config and secrets set
None.

## Before/after measurements
| Metric | Before | After |
|---|---|---|
| Sections with a heading and nothing under it (one-friend account) | 1 (Group trips) | 0 |
| Privacy | last item on the page | icon in the title row |
| Desktop, one-friend account: empty left half | yes | no (two equal columns) |

## What broke and how it was fixed
- The dev server hung during HMR, and stopping its shell left Vite holding port 4198. The Vite process was stopped by its PID and the server was started again.

## What is still open
Nothing.

## Rollback procedure
`git revert` the T987 commit.
