# T1028: Practical as one card system

## Task ID
T1028

## Date
2026-11-03

## What changed
The owner reviewed T1027 on desktop: "super busy, not aligned, different sized, colours which look AI ... everything has to have the same kind of structure ... the blue feels AI ... make the styling across this practical tab coherent." Swiping stays, but only on a phone.

**One card shape** (`DestPractical.jsx`, `.pcard*`). Every card has:
- a 44 px slot with rounded corners, holding an umber icon (Book ahead holds the sight's photograph as a thumbnail)
- a small label
- the fact in ink (Airport "FCO", Book ahead "Colosseum, Sistine Chapel"), or the sentence
- the links at the foot: one small umber button with the alternative under it, the same shape in every card

**One ground and one accent:**
- Every card is on `--surface-sunken`, the same ground as the quick-fact tiles.
- Umber is the only accent. Removed: the sun, lagoon, umber and amber fields, the dark photo card, the 44 px code and the tag pills.
- A warning differs only in its slot's amber.

**Alignment:**
- **Phone:** a swipe row of equal-height cards.
- **From 700 px:** three columns. The last card widens to close its row (span 2, or the full width), so every edge lines up with the tiles below. Each row sizes to its own content.

**Coherent tab:**
- The quick-fact tiles use the cards' padding and radius.
- On the place page the "Sources and photo credits" fold is a row under a rule at the folds' 16 px, not a white box. That scoping keeps the journey and outdoor pages as they were.

## Files touched
**Modified:** `continent-app/src/browse/DestPractical.jsx`, `continent-app/src/styles/88-place-template.css`

**Created:** `Execution/P15/T1028-shots/` (gitignored)

## Commands run
- `npm test`: 1219 pass, 0 fail.
- `eslint`: 0 errors, 0 warnings.
- `impeccable detect`: no findings.
- Browser: Playwright on Rome and Amsterdam at 390 × 844 and 1440 × 1000. No page errors, no sideways scroll.
- I measured the fold title in the browser (16 px Figtree 600) to size the Sources row.
- Fixed after the first round:
  - the second desktop row took the first row's height, so the cards were half empty
  - the phone cards' link stacks sat at different heights

## Config and secrets set
None.

## Before/after measurements
| | Before (T1027) | After |
|---|---|---|
| Card grounds in Practical | 5 (sun, lagoon, umber, amber, dark umber) | 1 |
| Card shapes | 2 (photo card, colour card) and 3 sizes | 1 |
| Desktop rows with a gap at the end | 1 of 2 | 0 |
| White boxes in Practical | 1 (Sources) | 0 |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| Half-empty second row on desktop | `grid-auto-rows: 1fr` | Rows size to content |
| Phone link stacks at different heights | The alternative link wrapped beside the button in one card, under it in another | Always under the button |

## What is still open
Nothing new.

## Rollback procedure
`git revert` the T1028 commit; T1027's colour-field cards come back.
