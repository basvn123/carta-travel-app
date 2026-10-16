# T459 critique, after (2026-10-16)

Method: dual-agent (A: design review in this context, B: detector agent). B's report landed while A's notes were being finished, so independence is partial; every A finding below was taken from the shots before B was read. Code: continent-app working tree on p11-day-planner-2. Shots: `../T459-shots/after/` (en and de flows, 4 widths, Ghent to Bruges 2-day walk), against `../T459-shots/before/`, `../T432-shots/flow-after-03-when-desktop.png` and `before.md` (27/40).

## Score

| # | Heuristic | Before | After | Key issue |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | The rail now shows the days as they are picked; step 5 is still "Plan" on the stepper, then "Carta" or "Places" once reached |
| 2 | Match with the real world | 3 | 3 | Raw catalogue names on cards ("CNP - 01 - Roma - Castel Gandolfo"), Palatine Hill typed "Museum" under Nature and trails |
| 3 | User control and freedom | 3 | 3 | Every recap chip goes to its own step; the builder's day split moves picks between days on its own |
| 4 | Consistency and standards | 2 | 3 | Recap and "Your days" card are the trip planner's own classes, one column width; German mixes "ue" and "ü" on one screen |
| 5 | Error prevention | 3 | 3 | One day, two distances: rail "0.3 km", planned day "0.5 km"; "Leave 09:30" then "09:30 Dulle Griet" after a 2 min walk |
| 6 | Recognition rather than recall | 3 | 3 | The stay is in the rail on desktop, but the recap still says "Rome" and the phone hides the stay in a sheet |
| 7 | Flexibility and efficiency | 3 | 3 | Where chips with a reach line ("From Ghent: about 45 min by train"), Carta hand-off kept in the rail |
| 8 | Aesthetic and minimalist design | 2 | 3 | Rails of 3, no rating chips, no How gap; but on a phone the first screen of the builder shows no place at all |
| 9 | Error recovery | 2 | 2 | Unchanged: the "Lisbon, Porto" trip row still shows a broken photo (`en-desktop-day-01-start.png`, row T433-k) |
| 10 | Help and documentation | 3 | 3 | Estimates marked; no InfoDot on "Back about" times |
| | **Total** | **27/40** | **29/40** | Good (Acceptable before). No heuristic went down |

## Design specificity

The flow now reads as one product with the trip planner: the same stepper, the same sunken "Planning around" band with linked chips, the same left column and a right "Your days" card on `.plan-total` with the per-person day figure (`~€87 est.`), Start, Dates and Lifestyle. That card is Carta's own mark: a priced, numbered walking order with "Back about 14:45, 3.9 km on foot", which a generic travel app would not print. The How cards now share one frame and a quiet Free / credit chip, and the builder's Where row with the reach line answers "where do I spend the day" in Carta's timetable voice. What is still generic is the builder body: photo rails with a "Show 11 more" link are Airbnb furniture, and they carry no price or time, so the honest numbers only live in the rail.

## What improved

- Owner asks met in the shots: recap matches the trip planner (`en-desktop-day-04-ideas.png` against `flow-after-03-when-desktop.png`); headings, content and rail sit at one rhythm (heading at 268, content and rail at 310 on every desktop step); How has no white gap (forkGap 120 to 0 on iPad and iPad landscape); ScoreChip is gone (4 hits to 0); "Your days" is a flat numbered list with no per-row controls; Where chips re-centre the rails.
- The figure is on the first screen from Ideas on (figure false to true on phone, iPad, iPad landscape for ideas and how).
- The Ghent to Bruges case works end to end: Bruges as a Where chip, "From Ghent: about 45 min by train", Day 2 labelled "Sat 17 Oct, Bruges", planned page "Ghent + Bruges".
- The T459 CSS section is clean: 0 hex, 0 raw rgba, every font size a token, 34 spacing tokens and no raw spacing px.

## Remaining issues

1. **[P1] German phone footer: the label runs under the Back button.** `de-mobile-day-08-build-list.png` shows "Noch nichts ge" cut and overlapped by "Zurück". The rail button in `.guide-foot-summary` (DayWizardShell.jsx L119 to 123) has no shrink rule. Fix: `.day-wizard .guide-foot-summary { flex: 1 1 auto; min-width: 0 }` and ellipsis on `.dayw-rail-btn` in 68-v6-dayplanner.css, or show the figure ("~87 € gesch.") there on Places as How does, which always fits.
2. **[P2] The rail is cut by the footer on desktop.** `.wiz-rail .dayr { max-height: calc(100dvh - 300px) }` (68 L1908) ignores the 70 px footer, so "Back about 14:45" is half hidden at 1280 x 800 (`en-desktop-day-09-build-map.png`) and the Carta hand-off sits under the footer at 1440 x 900 (`after-build-picked-desk.png`). Fix: subtract the footer and the recap band, e.g. `calc(100dvh - 300px - var(--guide-foot-h, 72px) - var(--space-6))`.
3. **[P2] One day, two sets of numbers.** Ghent day 1: rail "Back about 11:15, 0.3 km on foot" (`ghent-build-bruges-desk.png`), planned day "09:30 to 11:15, 0.5 km on foot" (`ghent-planned-desk.png`); the planned timetable leaves at 09:30 and arrives at Dulle Griet at 09:30 after "2 min walk". Rome: Ideas and builder say Basilica of Saint Mary Major is "1 min walk", the planned day "8 min walk, 0.5 km" from the hotel. PRODUCT.md: no two screens disagree. Fix: DayRail.jsx takes km from the same leg source the planned day uses (or prints "~0.3 km"); card walk times in DayIdeasStep.jsx and DayExploreBuilder.jsx measured from the stay, not the town point; arrival = leave + walk in the planned timetable.
4. **[P2] The day split moves picks on its own.** Two Ghent picks first land one per day (Dulle Griet day 1, Gravensteen day 2, "Back about 10:00, 0.0 km on foot", `ghent-build-bruges-desk.png`); one Bruges pick later Gravensteen jumps to day 1 (`ghent-rail-desk.png`). Fix in the DayExploreBuilder.jsx preview: fill a day until its hours are used before opening the next, keep a town's picks on one day, and drop the km clause when it is 0.
5. **[P2] Phone builder: no place on the first screen.** "Pick what to see", Where with its chips, What with search, List|Map and chips, then the rail head push the first card's name below the fold (`en-mobile-day-08-build-list.png`; first-screen words 115 to 79). Before, one name and its walk time showed. Fix in 68 (phone media query): drop the "Where" and "What" headings on phone and put search and List|Map on the chip row, or fold Where into the recap's place chip.
6. **[P2] Phone recap wraps to three tall rows.** The 44 px tap rule on `.guide-recap-chip.is-link` (68, pointer coarse) makes each wrapped row about 50 px, 140 px before the question in `de-mobile-day-06-bot-q3.png`; the chat answers "Nur ich" and "Vormittag, Normal, 9:30" have no icon and pack three answers in one chip. Fix: one scrolling line for `.wiz-recap-inbody` with the hit area grown by padding or `::after`, and one chip per answer with its icon in CartaChatPlanner.jsx.
7. **[P2] German shows "ue" and "ü" side by side.** "Sehenswuerdigkeiten" chip under "Top-Sehenswürdigkeiten", "Meinen Tag oeffnen", "Ueberspringen" (de.js L1283, L1310, L1317 and the ai.* block). Not a T459 regression, but now on every T459 builder screen. Fix: write the umlauts in de.js.
8. **[P3]** Recap place chip says "Rome" while the rail says "Hotel Artemide, Via Nazionale": use the stay name in the chip (DayWizardShell recap). Stepper renames step 5 ("Plan" to "Carta" or "Places"): keep the label, say it in the h1. Dates said three times on Days (recap, rail, footer summary): drop the footer summary when the rail shows. Where row clips "Castelnuovo di Po" with no fade. Builder map frames the stay, so picks 2 and 3 sit off screen, and pins both "Baths of Diocletian" and "Terme di Diocleziano" (`en-desktop-day-09-build-map.png`). Days step: the right half of the calendar card is empty under "How many days". One `!important` at 68 L1971.

## Detector (assessment B)

- `impeccable detect --json` on the 7 JSX files and 68-v6-dayplanner.css: `[]`, exit 0 for each, also with `--no-config --no-inline-ignores`; a planted bad probe flagged 3 rules, so the engine runs. Clean is real but weak: it does not read layout collisions or copy.
- Lint: raw `<button` DayExploreBuilder 4 to 3, CartaChatPlanner 1 to 0, Recap 1 (kit folder, exempt); `<Rail` 9 to 8; design-lint baseline 8527 to 8499 with no new keys. Recap and DayRail reuse `.guide-recap*` and `.plan-total*` outright, which is why the frames match.
- Measurements: forkGap 120 to 0; figure on first screen now on ideas and how; phone build words 115 to 79 (issue 5); iPad landscape build words 103 to 139. tapsToPlannedDay stays 10. `measure-after.json` holds only the iPad profile and there is no desktop after run, so desktop has no after numbers.

## Personas

- **Casey (phone, one hand):** opens the builder and sees headings and chips but no place; the stay and the day list are one tap away in the footer sheet, which is well done, but in German that footer label is overlapped by Back.
- **Jordan (first time):** sees "1 min walk" on the Basilica card and "8 min walk" on the planned day; watches Gravensteen move from day 2 to day 1 after tapping a Bruges place and cannot tell why.
- **Sam (keyboard, screen reader):** recap chips are real buttons that go to their step, the rail is a labelled section and the card tick is the only remove control, so tab stops halved; the rail's end under the fixed footer is reachable by scroll but not readable.

## Fix batch after this critique (one round, then stopped)

- P1 German footer: the summary shrinks with an ellipsis (`.day-wizard .guide-foot-summary`, `.dayw-rail-btn`). German phone walk: 0 offenders.
- P2 rail under the footer: the card's max-height also takes off the footer and two steps of space.
- P2 picks moving between days: `dayBuild.js` fills a town's day (about five hours of visits) before opening another; tests/dayBuild.test.mjs. A day under 0.1 km no longer prints "0.0 km".
- P2 phone recap in three rows: one sideways-scrolling line in the day wizard, 44 px chips kept.
- P2 German transliterations: 30 strings in the day planner block now use real umlauts.
- Left open: the two clocks (T433-h, straight-line preview against routed day), the phone builder's first place name under the fold (T459-b), and the P3 list.
