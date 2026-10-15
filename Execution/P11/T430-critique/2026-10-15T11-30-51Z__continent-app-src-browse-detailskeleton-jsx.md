---
target: outdoor item pages
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/home/user/carta-travel-app/continent-app/src/browse/DetailSkeleton.jsx"
target_fingerprint: "sha256:28a7c6e0ded62fcd8cbba27bfb6cb88b0c55dd634994ae728c8cad27fc5e5d83"
target_path: /home/user/carta-travel-app/continent-app/src/browse/DetailSkeleton.jsx
timestamp: 2026-10-15T11-30-51Z
slug: continent-app-src-browse-detailskeleton-jsx
---
Method: dual-agent (A: design review sub-agent, B: detector and browser sub-agent). Photos and map tiles blocked in the sandbox.

## Design Health Score (outdoor item pages, before T430)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Section rail, ink sketch while the map loads |
| 2 | Match System / Real World | 2 | "Mountain hike, from the terrain", "Mount Korab is a mountain in Korab." |
| 3 | User Control and Freedom | 3 | Named back, star, share |
| 4 | Consistency and Standards | 1 | Score explainers contradict their bars; a beach carries a difficulty strip |
| 5 | Error Prevention | 2 | "Loop" on a point-to-point walk; a summit higher than the high point |
| 6 | Recognition Rather Than Recall | 2 | Highlights and photos folded below the map |
| 7 | Flexibility and Efficiency | 2 | Ctrl to zoom the map; five hand-off actions on a trail |
| 8 | Aesthetic and Minimalist Design | 2 | Strip repeats the fact band; facts said three times in folds |
| 9 | Error Recovery | 3 | Report a problem |
| 10 | Help and Documentation | 2 | Explainers contradict the figures |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict
The shell has a clear grammar and the trail profile is Carta's own; the first screen is a single hero, a strip that repeats the facts and a tautological lead. Detector: 0 findings in JSX; browser: tiny-text 2 to 5 per page, fact labels at 10.5 px, credits under 11 px, 88 to 106 character lines on desktop, focus ring shown on Back at load.

## Priority Issues
- [P0] Contradictions (loop claim, high point, score explainers). harden.
- [P1] One photograph per page; photos and highlights folded. layout, bolder.
- [P1] Method sentences ("Carta has no bus or train stop data", "N of M figures measured"). clarify.
- [P2] First screen wasted; map grabs the wheel or asks for Ctrl. layout, adapt.

## Questions to Consider
Why does a beach carry a difficulty strip? What would an Airbnb-grade "three other places" look like: three photos with a price each?
