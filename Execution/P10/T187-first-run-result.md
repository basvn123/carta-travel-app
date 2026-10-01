# T187 Design the first-run trip result

## Task ID

T187 (mind-map number T340). Branch p10-first-run-design in the root repo. No app worktree and no app code: this is a design document task, and the owner approves before any code.

## Date

2026-10-02

## What changed

The repo now carries a written design for the moment a first-time visitor sees their first priced total, in docs/FIRST_RUN_RESULT.md. Nothing in the app changed. The document fixes four things that were open: which screen the first result is (the receipt component, rendered the same on the trip page, the destination page and the planner, the first time it holds a flight from the visitor's own airport), what that screen explains (nine questions a stranger has when the number appears, each with the place on the screen that answers it), what it deliberately does not explain (ratings, gems, tiers, passes, the account, the map, the planners, the AI, and any coach mark or tour), and the single next action ("Set your dates", because dates are the default with the largest effect on the total and the one most likely to be wrong, and moving them makes the total move in place, which is when the number becomes the visitor's). It also writes the test protocol the done condition needs, since testing on a stranger is a human step the owner has to run.

The design turns on one fact about the two doors most newcomers arrive through, the trip page and the destination page: after P6, Carta will have filled in dates, party size and stay style for them, so the first result is mostly assumptions. The screen's job is to show those assumptions as the visitor's own inputs, not to hide them behind a confident sum. Hence the orientation line ("Priced from Charleroi for 2 people on the cheapest week Carta found. Set your own dates and the total reprices."), which is the entire first-run layer, and the per-line provenance rows that let every figure be traced. After the first run the orientation line goes and the provenance collapses behind the glossary T193 brings; the receipt itself never changes shape.

The document follows the carta-design skill for structure (the receipt, the search strip, the copy rules, the seven questions) and DESIGN.md for tokens, since DESIGN.md and the skill's 2026-07-28 banner win over the skill's older palette text. The flight lines carry the tilde and "est." throughout, with one plain sentence under the footer, because no fare source has been live since 2026-10-01 and PRODUCT.md says the UI must keep saying so.

One source the task named could not be read. The mind map's P10.7 and T340 nodes cite "Original Carta.xmind, User Interface branch"; the only mind map in the repo is additional docs/Carta/Carta-Master-Plan.xmind, which has no such branch. The design was taken from the master plan's P10.7, T340 and M11 nodes, the enhancement spec's I1 (and I2 to I5, which shape the inputs), the carta-design skill, PRODUCT.md, DESIGN.md, and the receipts the app renders today (CostSummary.jsx, TripPlannerTab.jsx totals, GuidedTripWizard.jsx Finish, JourneyPage.jsx budget fold, TripPage.jsx cost fold, FareProvenance.jsx). The missing source is register row T187-d.

## Files touched

Root repo, branch p10-first-run-design.

Created: docs/FIRST_RUN_RESULT.md, Execution/P10/T187-first-run-result.md (this report).

Modified: Execution/_OPEN.md (four rows appended).

App repo: nothing.

## Commands run

```
python Execution/_queue/xmind_prompt.py T187
python - <<EOF   # dump of the master plan's P10.7, T340 and M11 nodes to a scratch file, utf-8
git -C "C:/Users/Gebruiker/Documents/Portfolio/wt/T187" add docs/FIRST_RUN_RESULT.md Execution/P10/T187-first-run-result.md Execution/_OPEN.md
git -C "C:/Users/Gebruiker/Documents/Portfolio/wt/T187" commit
git -C "C:/Users/Gebruiker/Documents/Portfolio/wt/T187" show --stat
```

The mind-map dump needed an explicit utf-8 file because the task notes hold characters the console code page cannot print; printing to stdout raised UnicodeEncodeError.

## Config and secrets set

None.

## Before/after measurements

The task implies one number: how much of what a stranger needs to believe the total the screen tells them. The design lists nine questions; the measurement scores the surface a newcomer most often meets today (the trip page's "What the week costs" fold: a per-person range, "per person for the week, without international flights", and a "Price a trip to {city}" handoff) against the designed screen.

| Metric | Before | After | Delta |
|---|---|---|---|
| Questions of nine answered on the screen | 4 (what, for whom, what is in, what is out) | 9 | +5 |
| Lines with a stated source or assumption | 0 | every line | all |
| Flight figures marked as estimates | 0 (flights absent) | all, tilde plus est. | all |
| Primary actions on the view | 1, leaves the page | 1, reprices in place | same count |
| Time for a stranger to say what the number is | not measured | target under 15 s, measured by the owner test | open |

The last row cannot be measured until T099 ships a build and the owner runs the protocol; it is the figure T099 should report.

## What broke and how it was fixed

No issues.

## Rollback procedure

Delete docs/FIRST_RUN_RESULT.md and this report, and remove the four T187 rows from Execution/_OPEN.md; or `git revert` the single commit on p10-first-run-design. Nothing in the app or the data depends on the document.

## What is still open

The design needs the owner's approval before T099 builds from it (T187-a). The done condition, a test on someone who has never seen the product, is a human step: the protocol is the last section of the design and the owner runs it on T099's preview build or on a printed mock (T187-b). T099 then implements the receipt as specified, the receipt.* keys in all six catalogues, the firstResultSeen flag and the "Set your dates" primary, and reports the time-to-answer figure (T187-c). The "Original Carta.xmind, User Interface branch" the mind map cites is not in the repo; T188 to T194 and T211 cite the same source, so the owner should locate it or confirm the master plan supersedes it (T187-d).
