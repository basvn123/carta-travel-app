# T968: compact rails on a phone

## Task ID

T968

## Date

2026-11-01

## What changed

Owner call 2026-11-01: on a phone two rails should fit a screen. Every story rail (StoryRail.jsx: Explore's Top rated, Hiking bases and the rest, and the outdoor tabs' rails) is now its title alone: the fact line under it ("From €89 a day", "Good walks from town.", "12 to 43 km") is gone on every width. On a phone (up to 768 px) the photo is square instead of 4:5, the head-to-strip gap and the strip's bottom padding tighten, and the gap between Explore's rails drops from 32 to 24 px. A Top rated rail measures 323 px tall, down from 398, and with its gap one rail now takes 347 px instead of 430 (390 by 844 viewport).

## Files touched

**Modified:** `continent-app/src/browse/StoryRail.jsx`, `continent-app/src/styles/80-story-rail.css`

## Commands run

Fast build (`wt/vite.t960.mjs` with `PF_OUT`), Playwright measurement at 390 by 844. Not deployed (owner: not yet).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Rail height on a phone (Top rated) | 398 px | 323 px | -75 px |
| Photo height on a phone | 207 px | 166 px | -41 px |
| Gap between rails on a phone | 32 px | 24 px | -8 px |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The rail gap stayed 32 px | 62-v6-explore.css's `.explore-shell .xrails` came later in the cascade | `.explore-shell .xrails.xrails` in the phone rule |

## What is still open

None. The `line` and `facts` props are still passed by the rails' callers and ignored; rollback is `git revert` of this commit.
