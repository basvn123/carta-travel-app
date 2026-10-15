---
target: trip page and trips list
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/user/carta-travel-app/continent-app/src/browse/JourneyPage.jsx"
target_fingerprint: "sha256:63c3d3f83de87f5053f9117decbf38e71f242a4b6688fd5609ac0d9df4b840a7"
target_path: /home/user/carta-travel-app/continent-app/src/browse/JourneyPage.jsx
timestamp: 2026-10-15T11-30-51Z
slug: continent-app-src-browse-journeypage-jsx
---
Method: dual-agent (A: design review sub-agent, B: detector and browser sub-agent). Photos and map tiles blocked in the sandbox; layout judged around them.

## Design Health Score (trip page and trips list, before T431)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Rail tracks position, receipt updates in place |
| 2 | Match System / Real World | 2 | Raw markdown on the page (`**120 km circular route**`); "Bar height is the day's effort" |
| 3 | User Control and Freedom | 3 | Named back, 3/7 day switch |
| 4 | Consistency and Standards | 1 | Price with and without the estimate mark; difficulty drawn three ways; "Three other ways" lists two |
| 5 | Error Prevention | 2 | "No hard days" on a trip rated Demanding 4/5 |
| 6 | Recognition Rather Than Recall | 2 | The week split over four drawings |
| 7 | Flexibility and Efficiency | 2 | Decks one card at a time, no jump to a day |
| 8 | Aesthetic and Minimalist Design | 1 | 1,383 words, 6,376 px (7.5 phone screens), one photograph |
| 9 | Error Recovery | 3 | Report this price |
| 10 | Help and Documentation | 2 | Hints are themselves noise |
| **Total** | | **21/40** | **Acceptable, significant work needed** |

## Design Specificity Verdict
Mixed, leaning generic: the receipt and "Land by 18:15" are Carta's own; the folds, two flashcard decks, a 16-icon pack grid and tag chips could be any travel CMS. Photography does not lead. Detector: 0 findings in JSX; browser overlay: tiny-text 6, cramped-padding 2, line-length 7 (desktop), 17 figures at 10.5 px in RouteFigures, overnight names clipped with an ellipsis.

## Priority Issues
- [P0] Contradictions and broken text on trust-critical facts (No hard days vs Demanding; raw markdown; split bullets). Fix: guard derived lines, strip markdown, split on sentences. harden, clarify.
- [P1] Photography does not lead: one photo per trip, alternatives are text rows. Fix: gallery, day photos, alternatives as photo cards. layout, bolder.
- [P1] A 7.5-screen document with the week said four times. Fix: one week chart over one day track, primary up. distill.
- [P1] Method sentences and "Not recorded" rows as furniture. Fix: delete, hide empty rows. clarify.

## Persona Red Flags
Budget hiker on a phone: cheapest week sixth in the list; head price loses its estimate mark; the primary seven screens down. Casey (distracted mobile): decks of 20 and 16 cards; photos behind folds. Jordan (first-timer): GRP, T5, "10 / 5 / 2" with no unit.

## Questions to Consider
What if the trip page were the receipt plus seven photo day cards? Would a hiker miss the data sheet if it moved into the download?
