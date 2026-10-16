# T433 critique, after (2026-10-16)

Method: dual-agent (A: design review, B: detector and browser evidence), on branch p11-day-planner with the shots in `../T433-shots/after/`. One fix batch followed (recorded at the end).

## Score

| # | Heuristic | Before | After | Key issue left |
|---|---|---|---|---|
| 1 | Visibility of system status | 2 | 3 | Nested progress on the AI path (Step 5 of 5 over Question 3 of 7) |
| 2 | Match with the real world | 2 | 3 | "a day here, a person"; "Which day" heads a range |
| 3 | User control and freedom | 2 | 3 | The day page's back is an icon-only arrow |
| 4 | Consistency and standards | 1 | 3 | Column width still changes by step; two clocks for one day |
| 5 | Error prevention | 2 | 3 | Arrival times were stated without an estimate mark (fixed in the batch: first time marked est.) |
| 6 | Recognition rather than recall | 3 | 3 | The phone's preview sits behind a text link |
| 7 | Flexibility and efficiency | 2 | 3 | A returning user still walks Days, Ideas and How |
| 8 | Aesthetic and minimalist design | 1 | 2 | Builder map zoomed out, "Must see" on Top sights cards (both fixed in the batch) |
| 9 | Error recovery | 2 | 2 | Broken trip photo with no fallback (row T433-k) |
| 10 | Help and documentation | 2 | 3 | No InfoDot on estimated times |
| | **Total** | **19/40** | **28/40** | Good (low end) |

## Verdict

The planned day is now the strongest Carta surface in either planner. It reads as a timetable, with the time span, routed legs, "Check hours" and the day figure, and it fixes the before P0 (empty import) and P1 (no day cost). The frame matches the trip planner. The middle of the flow (search, calendar, tiles, photo grid) is competent rather than distinctive.

## Detector and browser (assessment B)

- CLI `detect --json` on the 13 changed files: `[]`, and the engine was confirmed working on a known file.
- Browser overlay, false positives:
  - `text-occlusion` and `cramped-padding` come from the kit Card's stretched `.card-open::after`.
  - `clipped-overflow-container` comes from the app shell.
  - `tiny-text` is on the map attribution.
  - `layout-transition` is `.wclimb-bar` in 70-item-pages.css.
  - `dark-glow` is a lagoon-600 focus ring.
- Browser overlay, real:
  - The "Open map" button covered the map credit on the phone (fixed: moved to the top).
  - The fork's `h1` is followed by the kit Card's `h3` (row T433-j).
  - A `.chat-import:hover` glow in 21-chat-passes.css (fixed: the rule was dead and is pruned).
- design-lint meters after: planner/Day 37 raw buttons, CartaChatPlanner 1; total 8,527 violations, 0 new.

## Fix batch after this critique

- Builder preview times carry "~"; the planned day's first time carries "est.".
- The builder map is limited to places within 15 km, so it frames the day, not the country.
- "Must see" no longer shows inside the Top sights rail.
- The preview card has a real height, and its "Done about" line shows.
- The phone fork photo is a 3:1 strip, so both answers sit in the first screen.
- "Skip" is a secondary button; the brown primary is for an answer.
- The question position is read aloud (no longer aria-hidden).
- The trip row says "In 5 days" once.
- Dead `.chat-*`, `.day-*` and old builder rules pruned (267 more), with both planners re-shot: 0 offenders on 52 screens.
