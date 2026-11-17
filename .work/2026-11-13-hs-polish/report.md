# Polish lane: the final judges' fixes before main (G1, with G5, G10)

Level L2, playbook crew:design (via crew:deep-task), autonomous (owner: "Fully autonomous"; Stage 7 pre-approved). Branch `p15-hs-polish` from `p15-housestyle`, worktree `wt/hs-polish`. Run folder `.work/2026-11-13-hs-polish/`.

## Result
Own judge (fresh, one): **PASS, 107 of 135, merge into p15-housestyle: yes** (`judgement-polish.md`). All hard criteria pass (5: 4, 6: 4, 11: 5, 10: 4). Its four required fixes are applied (Ask row gem and plate at 390, DESIGN.md blaze and ChoiceRows lines, verify_explore rerun 104/104, branch pushed).

## What happened, in order
1. Merged `origin/main` (06504567b5); the one conflict, `.work/INDEX.md`, kept both lines (place lane line and main's longer data-refresh line).
2. Two explorers (`explore-secondary.md`, `explore-plan-followups.md`), two directions (`directions.md`: A ledger, B board), one critic with four lenses (`critique.md`), decision: the hybrid "ledger with one plate" (`decision.md`).
3. Built in the main session; shots, sweep, axe, verify, tests; one judge; its fixes.

## Changes per screen (before: integration shots in `wt/housestyle/.work/2026-11-13-hs-integration/shots/`; after: `shots/<screen>-<width>.png` here)
- **Ask Carta answer (blocker)**: rows drew `PlaceOverview` without the house row class (blue links, no photo, save mark on its own line). Now `PlaceRow` (Explore's house row) in `AskTurn.jsx` and `AskSearchFull.jsx`, the list an `xlist` container with a narrow grid that keeps the reason (or group total) line; long country wraps the hidden gem; wrapped names keep the Score after the last word. The link is named by its row (WCAG 2.5.3, was a serious axe issue x3) with "See a trip to {place}" as its description. `ask-answer-{390,820,1180,1440}.png`.
- **Choice rows (wizard and every one-question screen)**: one ruled list instead of separate white cards; chosen single pick = wash + umber outline + blaze painted in (220 ms, off under reduced motion); multi keeps the square tick. `04-ui.css` (a foundation file, see foundation-requests.md). Party counters in planner steps ruled too. `wizard-{1..4}-*.png`.
- **Settings and account lists**: ruled on the ground, values in ink. `settings-*.png`, `account-*.png`.
- **Together "To answer"**: ruled list, no white panel. `together-*.png` (fixture build).
- **Pricing**: compare, plans and questions ruled; the lead price on the one dark signpost plate (settles in once), the Year price on the outlined leg plate; no blaze (nothing chosen). `pricing-*.png`.
- **Pass sheet (paywall)**: chosen plan carries the blaze instead of a filled round tick. `paywall-*.png`.
- **Plan home from 1024**: two columns, words and actions left, Carta's trips as a three-over-two photo mosaic right (sizes raised so tiles are sharp). `plan-home-{1180,1440}.png`.
- **Wizard from 1024**: column centred in its pane, Continue directly under the content (still sticks when a step scrolls). The round back arrow stays: it goes one step back, the "Plan" crumb goes to Plan home (different actions).
- **Home**: the slogan in one ink (`.hv-em` inherits). `home-*.png`.
- **Explore inputs bar 769 to 1023**: two rows of three; every label and whole value ("Any time, 7 nights"). `explore-820.png`.
- **Explore price note**: "Local transport: not yet" stands beside "A day, a person" after a hairline, not floating left.
- **Place page phone**: the dock's dates and people hide while the cost post (which shows them) is in view. `place-390.png`.
- **Found trip**: four facts never 3 + 1 (four across from 1024, two by two below). `found-trip-*.png`.

## Checks
- `npm test`: 25 failing names, identical to the post-merge baseline (`baseline-fails.txt`, `final-fails.txt`): Windows short paths, sparse checkout without `public/`, design-lint path bugs, and two pipeline tests from main's merge. No new failures.
- `npm run lint` 0 errors (13 old warnings); `design-lint` 3920/3920, 0 new; `token-contrast` 0 under; impeccable detector `[]` on changed files.
- Width sweep `sweep.txt`: 90 of 90 (9 screens x 10 widths, 360 to 1920).
- `verify_axe` 28 screens, serious gate passed (`axe.txt`); Ask answer axe (`axe-ask.txt`): serious 0 at 390 and 1440 (one moderate duplicate banner at 390, shell, pre-existing).
- `verify/`: explore 104/104, destination_page all pass, paywall 28/28, top_bar 0 failed, plan_short exit 0, when_step 13/13 (exit 1 only for a console CORS error on the remote flights index).
- Docs: `check_entry_points` OK; `drift.py` 1 SCHEMA drift (sparse-checkout artefact, green in CI).
- CI on the pushed branch: green on cbe800238b (ci, mcp, ask-eval); later commits pushed, see `gh run list --branch p15-hs-polish`.

## Tests and verify scripts changed (and why)
- `scripts/verify_explore.mjs`: the "nothing on the row photo" check now accepts `<picture class="ladder-pic">`, which main's photo ladder (merged here) draws. Not weakened: still only the photo.
- `scripts/verify_destination_page.mjs`: opens the first visible place link including the house rail link (`.hs-rcard-link`); it timed out on a hidden list row.

## Departures from the house style, and why
- `04-ui.css` and `DESIGN.md` are foundation files; changed here because the polish lane is the only lane running and `.ui-crow` is the shared kit class (restyling it locally is against DESIGN.md). Recorded in `foundation-requests.md`.
- The blaze is drawn in CSS on two marks (choice row, pass plan) rather than with `<Blaze>`; a shared `.hs-blaze-mark` utility is the follow-up.

## Not done (owner calls or out of scope; see handbook-notes.md)
- 0 of 5 vs 0 of 7 booked; trip total in cents; Rome's way-there wagon (data); the inner Search button beside Ask; icons in every input-bar cell.
- Judge's optional items: the pass moment card on the trip page in the ledger grammar; Emails switches 12 px left of "Vibrate on tap" on settings 1440; Together's lower panels and the plan home mosaic panel still white panels; the wizard step 1 phone footer floats (pre-existing); add wizard, found trip, paywall and Ask to the sweep; retire `PlaceOverview.jsx` (no callers left).
- The Emails group on settings is absent in shots because it loads from the backend and is left out when that fails (unchanged behaviour).

## Files changed (lane commits 488d78f738, ce8021e513, cbe800238b, 024d4f1ff7 and the judge-fix commit)
`continent-app/src/browse/ask/AskTurn.jsx`, `continent-app/src/browse/AskSearchFull.jsx`, `continent-app/src/planner/flow/PlanHome.jsx`, `continent-app/src/styles/{04-ui,61-v6-home,62-v6-explore,71-pass,72-pricing,75-ask,76-ask-chat,77-settings-v2,86-plan-flow,87-trip-finder,88-place-template,90-together,91-account}.css`, `continent-app/scripts/verify_explore.mjs`, `continent-app/scripts/verify_destination_page.mjs`, `DESIGN.md`, `.work/INDEX.md` (merge), this report.

## For the orchestrator (ROADMAP and project map)
- ROADMAP G1: polish lane done, judge 107/135 PASS; items in handbook-notes.md.
- `.work/INDEX.md` line: `2026-11-17 · L2 · design · House style, polish lane (G1, G5, G10): Ask Carta rows on the house row, secondary screens as a ruled ledger with one plate, blaze on chosen choice rows and pass plans, plan home and wizard desktop layouts, one-voice slogan, tablet inputs bar 3 by 2; judge PASS 107/135 → .work/2026-11-13-hs-polish/report.md`

## Round 2 (orchestrator, 2026-11-17): the four spots left in the old look
Commit 87a4657c47. Visual only: no markup, handler or copy changed; CSS only.
- **Trip page pass card** (`src/pass/PassMoment.css`): no white card; ruled onto the ground like the pricing page (rule above and below, hairlines between lines), plain ink ticks for Free and umber ticks for the Trip Pass instead of tinted discs. It still rises once. `shots/r2/pass-moment-{390,820,1180,1440}.png`.
- **Together's lower panels** (`90-together.css`): Plans that meet, group trips, the budget fit lines, Friends, the hand-over and card blocks are ruled ledgers like To answer; touching blocks share one rule (also when the group page's columns stack below 1024); the shared-days chart keeps a paper ground so it reads as a chart; the trip photo cards drop their panel like Explore's rail cards. Forms and buttons (add a cost, start, share card, toggles) are unchanged. `shots/r2/together-*.png`, `together-group-*.png`.
- **Plan home photos** (`86-plan-flow.css`): no white panel; the photographs lie on the ground and the title with "See the trips" sits on a ruled foot. Still one link. `shots/r2/plan-home-*.png`.
- **Settings Emails switches** (`91-account.css`): `.ac-row.is-static` gave the Emails rows an empty third column plus a 12 px gap; the switch row rule now matches its specificity, so both Emails switches end where "Vibrate on tap" ends. `shots/r2/settings-1440.png`.

Checks (round 2): `npm test` 25 failing names, identical to the baseline (`r2-fails.txt`); lint 0 errors (13 old warnings); design-lint 3920/3920, 0 new; token-contrast 0 under. Shots at 390, 820, 1180 and 1440 for every touched screen in `shots/r2/`, from a fixture build (`VITE_E2E_SEAMS=1`). No judge run, as asked.

## Docs round (orchestrator, blocking item of judgement-final2-engineer.md)
Commit 6d9cf399c8, docs only, no code. `DESIGN.md` gains "Ledger before panel" beside the depth rule. `references/account.md` (two surfaces, ledger and panel; rows on the ground; Together's ledgers and chart ground; the pass plans' blaze, the Pass moment ledger and /pricing's one plate; Ask's house rows), `references/plan.md` (ruled ChoiceRows with the blaze; Continue under the content from 1024; Plan home's two columns and mosaic on the ground; four facts never 3 + 1; the blaze paints in), `references/explore.md` (PlaceRow everywhere incl. Ask; the shared note beside the unit; the tablet settings line in two rows of three), `references/home.md` (slogan in one ink), `references/place.md` (dock dates hidden while the post shows them). The craft guide already matches ("separate groups with space or one hairline, not boxes"). Checks: `check_entry_points` OK (300 paths); `drift.py` only the known SCHEMA wire-table item (sparse checkout, green in CI).

## How to undo
`git revert` the lane's commits (newest first), or do not merge `p15-hs-polish`. No data, schema or migration changes.
