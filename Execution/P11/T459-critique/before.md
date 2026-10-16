# T459 critique, before (2026-10-16)

Method: dual-agent (A: design review in this context, B: detector agent; the final CLI result below was rerun here after A was written). Code read from app master; shots in `../T459-shots/before/` (28 frames, 4 widths) and `../T433-shots/after/`, against the trip planner in `../T432-shots/` and `../T458-shots/stays-laptop.png`.

## Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Step 5 is named "Plan" on the stepper, then becomes "Places" or "Carta" once you arrive |
| 2 | Match with the real world | 3 | "Pick from 84 places around Rome" is a catalogue count; Colosseum typed "Theatre" |
| 3 | User control and freedom | 3 | Back and Start over everywhere, but the one "Change" in the recap jumps to step 1, not to the answer |
| 4 | Consistency and standards | 2 | Column is 880 px (Start to Ideas), 1080 px (How), full bleed (Build); recap is a pill, not the trip planner's band |
| 5 | Error prevention | 3 | Builder says ~09:30 for the first stop, the planned day says 09:45: two clocks for one day |
| 6 | Recognition rather than recall | 3 | The stay (Hotel Artemide) is never shown until the planned day |
| 7 | Flexibility and efficiency | 3 | Ideas can be skipped; "Let Carta plan the rest" hands off from the builder |
| 8 | Aesthetic and minimalist design | 2 | Builder: up to 9 photo rails, 2 places per screen on iPad landscape, map at country zoom |
| 9 | Error recovery | 2 | Unchanged from T433 (broken trip photo, row T433-k) |
| 10 | Help and documentation | 3 | Estimates marked; no InfoDot on "~" times |
| | **Total** | **27/40** | Acceptable (one under Good; T433 after was 28) |

## Design specificity

The planned day is still Carta's own: a timetable with a time span, routed legs, "Check hours" and one `~€87 est.` figure. Everything before it is generic wizard furniture. The day planner wears the trip planner's stepper and footer but not its body: no "Planning around" band (`.guide-recap`, full bleed, sunken, one chip per answer, each chip a link to its step), no left-aligned content column with a "Your trip" summary card on the right. Instead a floating `.dayw-start` pill with one Change button, a centred column that changes width three times, and on the AI path a second row of answer chips stacked 8 px under the pill. The builder is a photo catalogue (Airbnb rails) rather than a priced list, with an `8.7` ScoreChip on every card that carries no distinction (the first four cards all read 8.7).

## Priority issues

1. **[P1] Build it myself is overwhelming.** `DayExploreBuilder.jsx` renders up to 9 rails (Ideas, On this day, Sights, Nature, Things to do, Food, Shortlist, Water, Towns), each a grid of large photo cards: 3 per row at 315 px on desktop, 2 per row at about 600 px on iPad landscape (`before-build-picked-ipadl.png`), so one screen holds 2 places. The Compact Default Rule says places being compared are compact rows. Every card carries a `ScoreChip` (L121, L186) the owner does not want. The map is framed on Italy, not Rome (`before-build-desk.png`), so the T433 15 km fix does not hold on master (unlocated rows pass `r.km == null`). Fix: compact rows with a small photo, at most 3 rails before a "More" fold, drop the ScoreChip, frame the map on the stay and picks. Command: distill, then layout.
2. **[P1] The frame does not match the trip planner, and the manual flow never says where the day is spent.** `.dayw-start` (DayPlannerTab L3198) is a rounded pill reading "Rome Fri 16 Oct Change"; the trip planner shows a full-bleed "Planning around:" band with linked chips (GuidedTripWizard L2127). The stay typed on Start ("Hotel, address or town") is reduced to the town and first reappears as "Staying Hotel Artemide" on the planned day. The builder's right column stacks "Your days so far" over a map; the trip planner's right column is one "Your trip" summary card. Fix: reuse the `guide-recap` band with chips for place (stay name), days and picks; one content width across all five steps; a right summary card that says where the day starts and ends. Command: layout.
3. **[P2] Spacing between subsections and options is inconsistent across steps.** Recap to heading is about 40 px, heading to field 32 px, "Popular around here" label to rows 18 px, idea rows 8 px apart, When cards 24 px apart; on the AI path the question meter and answer chips sit 8 px below the pill (`day-06-bot-q3-desktop.png`). Trip planner steps use one rhythm (heading, 24 px, card). Fix: one step grammar (recap band, h1, `--space-6`, content card, `--space-4` between options) in `68-v6-dayplanner.css`. Command: polish.
4. **[P2] "Your days so far" repeats structure it does not need.** For a one-day plan it still renders a "Day 1, Fri 16 Oct, Rome" subhead, a × IconButton on every row that duplicates the card's tick toggle, a "Sign in for 2 free plans" chip, and the same list again in a sheet (`day-10-build-tray-desktop.png`). Fix: one flat timetable list, day subheads only when there are 2 or more days, remove from the card's tick, one summary line. Command: distill.
5. **[P2] The How page leaves a white gap under Build it myself.** The two fork cards stretch to one height; "Build it myself" has a photo strip, a title and one line, so about 170 px of empty card sits under it on desktop and 120 px on iPad (`measure-before.json` forkGap 120). Its line "Pick from 84 places around Rome" is the kind of count PRODUCT.md bans as page furniture. Fix: give both cards the same anatomy (one photo, title, one sentence, one meta line) or align them to the top; replace the count with what the path does. Command: layout, clarify.

## Detector (assessment B)

- `impeccable detect --json` on the six master JSX files and on 67/68 CSS: `[]`, exit 0 for all. The engine was checked on planted bad files (exit 2), but it reads only classNames in JSX and misses glow and small text in CSS, so clean here is a weak signal.
- Lint facts: raw `<button` 4 in DayExploreBuilder, 4 in DayPlannerTab, 3 in DayIdeasStep, 44 in GuidedTripWizard. 68 has 0 hex, 2 raw rgba (L46, L935) and six rules under 11 px, all before the T433 section (`.dayws-tip-tag`, `.daya-must` 10 px; `.daya-note`, `.dayf-count`, `.dayf-meta`, `.dayex-water` 10.5 px).
- Confirms A: `Rail` is rendered 9 times (L719 to 738), 6 photo cards each before "more"; `ScoreChip` at L121, L186 and L795. `.dayw-start` and `.guide-recap` share no class or token: pill on `--surface`/`--border-soft` versus band on `--paper-dim`/`--rule` with raw 5 px gaps and 10.5 px chips (the recap to adopt needs its own token pass).
- The T433 CSS section (68 L1376 to 2124) is on tokens (70 font sizes on `var()`, 122 of 185 spacing declarations on tokens, 16 raw non-zero), so the spacing drift in issue 3 is in which token each step picks, not in raw px.

## Personas

- **Casey (phone, one hand):** the Build step shows one and a half cards per screen and the map is behind a List/Map toggle; "Nothing picked yet, Back, Open my day" sits above the bottom nav, so the footer and nav together take about a fifth of the screen.
- **Jordan (first time):** typed a hotel on Start, then sees only "Rome" for four steps, then "Hotel Artemide" on the result; the step called "Plan" turns into "Places" when reached; 8.7 on every card reads as a grade without a scale.
- **Sam (keyboard, screen reader):** the recap's single "Change" returns to step 1 rather than the answer being changed; every builder card plus its × twin in the tray doubles the tab stops for one decision.
