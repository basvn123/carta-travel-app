# T433 critique, before (2026-10-16)

Method: dual-agent (A: design review, B: detector and browser evidence), run on app master f603b74 with the shots in `../T433-shots/before/`.

## Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | AI allowance never shown; "1 stops"; the bot import lands on an empty "Plan day 1" |
| 2 | Match with the real world | 2 | "Import onto my map", "Carta bot find", "Files", "Whole days"; title "Rome (Fiumicino)" |
| 3 | User control and freedom | 2 | Two back controls in the bot; no Back in the wizard; "Back to all day plans" for one day |
| 4 | Consistency and standards | 1 | Wizard chrome differs from the trip planner; column width jumps 640/920/1240; three names for the AI; "6 questions" against "3 of 7" |
| 5 | Error prevention | 2 | Account wall at question 3; the stay snaps silently to a catalogue town |
| 6 | Recognition rather than recall | 3 | The stay chip follows every step; answers echo as bubbles |
| 7 | Flexibility and efficiency | 2 | One day only; a returning user walks every step |
| 8 | Aesthetic and minimalist design | 1 | "Must see" on every photo; violet chip on every bot row; ink slab strip; Italy-wide empty map |
| 9 | Error recovery | 2 | Nothing explains a wrong-town snap or an empty import |
| 10 | Help and documentation | 2 | "How this works" on every step stands in for a flow that explains itself |
| | **Total** | **19/40** | Poor |

## Design specificity

Mostly category-interchangeable. Carta's own mark, the honest price line, is absent from all 13 screens: no day figure anywhere, against PRODUCT.md "A day plan carries one per person figure". The fork is a SaaS pricing-card trope (filled "Recommended", tick lists, pastel icon tiles); the bot is chat bubbles with sparkle placeholders where catalogue photos exist; the overview is a pin-cluttered map over an unlabelled ink bar. The builder (photo tiles, map, live tray) is the most authored part.

## Priority issues

1. [P0] The bot's plan does not reach the overview (shot 07 has five stops, shot 11 an empty day). Cause found in code: the plan's stops were outside the catalogue, and only catalogue stops become a day.
2. [P1] The day never says what it costs.
3. [P1] The wizard does not match the trip planner (card with border and shadow, no Back, primary inside the card, heading clipped under the header on a phone).
4. [P1] The AI path is inconsistent and dated (three names, allowance invisible, account wall mid-flow, dark user bubbles, violet chips).
5. [P2] Overview noise: map zoomed to a country, ~30 pins, an ink strip without times, plural bug "1 stops", a Colosseum photo on the Basilica row, the airport-named title.

## Detector and browser (assessment B)

- CLI `impeccable detect --json` on the ten day planner JSX files: `[]` (also `[]` on the five day planner CSS files).
- Browser overlay: `low-contrast` real (`.day-ideas-input` placeholder #757575 on #f6f5f2, 4.2:1); `dark-glow` a mislabel of a real off-palette teal focus ring (`.day-stay-search:focus-within`, 18-detail-panel.css:1226); `layout-transition` a false positive (`.wclimb-bar`, an item page rule in the global bundle).
- design-lint meter: planner/Day JSX 108 raw buttons, CartaChatPlanner 20, AiDayPlanModal 17; CSS 20-day-planner-flow 99 font-size, 66 radius, 261 legacy tokens; 13-day-planner 31, 10, 75; 68-v6-dayplanner 101, 63, 295.

## Personas

- Budget hiker in a small Alpine town: the stay snaps to the best-rated catalogue town (the "Elst" cause); the builder opens on churches; no trail length, climb or cost on tiles; no day figure.
- First-timer: about twelve interactions before a day; sign-in sprung at question 3; the import ends empty.
- Phone, distracted: headings clipped on landing; Continue mid-card, not in a thumb footer; the "Your stay" pin 36 px.
