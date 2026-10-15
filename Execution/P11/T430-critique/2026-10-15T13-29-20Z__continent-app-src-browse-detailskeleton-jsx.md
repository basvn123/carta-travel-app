---
target_identity: "file:/home/user/carta-travel-app/continent-app/src/browse/DetailSkeleton.jsx"
target_fingerprint: "sha256:b60c096630766ab71f6a75bbab9c63129175940fd1cc4310067ba5e22d8a65ab"
target_path: /home/user/carta-travel-app/continent-app/src/browse/DetailSkeleton.jsx
timestamp: 2026-10-15T13-29-20Z
slug: continent-app-src-browse-detailskeleton-jsx
---
Method: dual-agent (A: design review sub-agent, B: detector and browser sub-agent). Photos and map tiles blocked in the sandbox; layout judged around them.

## Design Health Score (item pages, after T430)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Ink sketch while the map loads, follow mode, toasts |
| 2 | Match System / Real World | 2 | "7.8 h", "536 km2", "Prominence" unexplained, ref chip "15 S Trail" |
| 3 | User Control and Freedom | 3 | Back names the list, save, share |
| 4 | Consistency and Standards | 2 | Hand-off buttons in four sizes (fixed after: one size on one grid) |
| 5 | Error Prevention | 3 | Safety rows first in Before you go |
| 6 | Recognition Rather Than Recall | 3 | Fact band and rail |
| 7 | Flexibility and Efficiency | 3 | GPX to an app, directions, follow, 2D/3D |
| 8 | Aesthetic and Minimalist Design | 2 | Beach facts said three times; long sources prose on mountain and beach |
| 9 | Error Recovery | 3 | Location denied is explained |
| 10 | Help and Documentation | 2 | "How the score is built" is method, not help |
| **Total** | | **26/40** | **Acceptable (before 22/40)** |

## Design Specificity Verdict
Close to category-interchangeable: the shared shell reads like the leading hiking apps. Carta's mark, the day cost in the base town, sits below the map (now says "a person a day"). Detector: 0 CLI findings; real browser findings were 11.5 px helper text and the 2D/3D segment at 40 px (both fixed after).

## Priority Issues
- [P1] Hooks that do not sell ("Its sand is white.", "It is the highest point of North Macedonia."). Register row T430-f (authored hooks; leave the hook out when only a statistic is left).
- [P1] Trail fact band had no distance. Fixed after: distance first.
- [P2] Method and licence prose on the page. Register row T430-g.
- [P2] Ragged hand-off row; cost line without "a person". Fixed after.
- [P3] Focus ring on Back after a deep link. Fixed after: focus lands on the title.

## Persona Red Flags
Budget hiker on a phone: distance now in the facts; the price line is still 2.5 screens down (row T430-h, move the day cost under the head). First-timer: "Prominence" and the ref chip want a dot or plain words (row T430-g).
