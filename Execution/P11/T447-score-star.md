# T447: Every Score star filled; owner answers to the destination page calls

## Task ID

T447

## Date

2026-10-14

## What changed

**Score stars.** The owner answered the open design calls from T429 and T446 on 2026-10-14. Until now the Score drew its star filled from the second tier up and outlined below. Reviewers in the T446 critique read the outline as "not rated".
- The star is now always filled: in the kit Score (`RatingBadge.jsx`, every card, row, page head and outdoor page) and in the Explore map's preview card (`ExploreMap.jsx`).
- Below the first band it stays grey (`--text-3`), as before.
- The carta-design rule says so.

**The owner's answers (2026-10-14):**
- **T429-b, yes.** The destination page totals the Lifestyle day times nights and party. The seasonal receipt basis stays retired. Closed.
- **T446-a, no.** The price card keeps Carta's default 7 nights for now, rather than the visit length the page recommends. Closed.
- **T446-b, open.** Whether the day figure covers bed and food only, or also local transport as PRODUCT.md says, is the owner's to settle.
- **T446-h, fill every star.** Done here. Closed.

## Files touched

**Modified:**
- `continent-app/src/components/RatingBadge.jsx`
- `continent-app/src/browse/ExploreMap.jsx`
- `.claude/skills/carta-design/SKILL.md` (the Score rule)
- `Execution/_OPEN.md`

**Created:** this report.

## Commands run

```
npx eslint src/components/RatingBadge.jsx src/browse/ExploreMap.jsx   # only the existing T429-i error
npm test                                                              # 375 of 375
node scripts/ci/design-lint.mjs                                        # 0 new
```

The deploy that followed is recorded in the handover, not here.

## Config and secrets set

None.

## Before/after measurements

Not measured: a drawing change with no figure the task promises to move.

## What broke and how it was fixed

No issues.

## What is still open

None new. T446-b stays with the owner.

## Rollback procedure

`git revert -m 1 <merge of p11-score-star>` in both repos, then rebuild.
