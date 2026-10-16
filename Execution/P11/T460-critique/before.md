# T460 critique, before (2026-10-16)

Method: dual-agent. Assessment A (`assessment-a-before.md`) and Assessment B with the impeccable audit (`assessment-b-before.md`, `audit-before.md`) ran isolated, on the files as they stood at app commit 9e7ab0d. Frames: `../T460-shots/before/`.

## Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | A guest's Free card says "Your current plan"; a paying user's "See passes" opens nothing |
| 2 | Match with the real world | 2 | Internal names; the Trip Pass promised "to the day you fly" in 30 days |
| 3 | User control and freedom | 3 | A guest's choice was lost at sign-in |
| 4 | Consistency and standards | 2 | Borrowed classes from three other dialogs; grey dialog ground; a local buy button |
| 5 | Error prevention | 3 | Waiver before the buttons; nothing said buying needs an account |
| 6 | Recognition rather than recall | 2 | The cards sold the AI quota, not what the gates sell |
| 7 | Flexibility and efficiency | 2 | Paying users who ran out had no path |
| 8 | Aesthetic and minimalist design | 1 | 247 to 300 words; "one-off" six times; a comparison table repeating the cards; three legal statements |
| 9 | Error recovery | 3 | A checkout error rendered about 1,000 px below the button, unannounced |
| 10 | Help and documentation | 2 | Nothing said what happens when a pass ends |
| | **Total** | **22/40** | |

Audit: **10/20** (accessibility 2, performance 3, responsive 2, theming 2, implementation 1). 5 P1, 8 P2, 3 P3.

## Agreed priority issues

1. **[P0/P1] Dead ends in the funnel.** `require()` returned true for any paying traveller, so every allowance trigger (CartaChatPlanner, AiDayPlanModal, CreditChip, DayPlannerTab) opened nothing at the one moment a holder is most likely to buy again; a guest's chosen pass was dropped at sign-in.
2. **[P1] Legal text and repetition before the price.** A 45-word waiver above the prices, VAT, no-subscription and terms lines repeated below, a table repeating the cards.
3. **[P1] The phone.** About two screens of content in a 92 dvh dialog, the Year Pass two screens down, buy buttons at 38 px, the close scrolling away.
4. **[P1] Accessibility.** No accessible name on the dialog, headings starting at h3, a 10 px "Recommended" on brown, 11 px figures, notes in the metadata colour.
5. **[P2] Generic template off the tokens.** Three-column SaaS pricing, a sparkle icon, px sizes and radii, legacy tokens, a brown wash on the current card.

Questions skipped: the owner set the direction (yearly plan, 60-day Trip Pass, minimal legal text) in the approved plan.
