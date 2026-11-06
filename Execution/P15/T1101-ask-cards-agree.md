# T1101: Ask answers and cards agree (E6, S17)

## Date

2026-11-06.

## What changed

The written Ask answer can no longer name a place the traveller has no card for. New `src/lib/ask/agree.js` runs beside `verify.js` on every streamed sentence: a place named without a visible card, a figure beside a place that no cited note about that place carries, or a month no cited note or question names, drops the sentence. Where the answer ranks places, the text must name them in the cards' order or the written answer is withdrawn (the facts answer and cards stay). `writeAnswer` takes `cards` and `type`; `AskTurn.jsx` passes the first three picks. Before: places in the notes but not on a card (picks 4 to 6, the live Castel di Tora versus Esztergom case) passed `verify.js`. After: 23 tests, including 20 representative questions with recorded model answers, show text and cards agree and every bad recording is dropped or withdrawn. No price module was touched; Ask reads the numbers the notes already carry.

## Files touched

continent-app/src/lib/ask/agree.js (new), continent-app/src/lib/ask/generate.js, continent-app/src/browse/ask/AskTurn.jsx, continent-app/tests/askAgree.test.mjs (new), docs/HANDBOOK.md (Ask section, item 8b), ROADMAP.md (E6 status), Execution/_OPEN.md.

## Commands run

`npm ci`; `node --test tests/askAgree.test.mjs`; `npx eslint` on the touched files; `npm test` (1317 pass, 0 fail).

## Config and secrets set

None.

## Before/after measurements

Not measured (no live model in the container; the 20 questions use recorded answers).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First test run withdrew every good answer | Fixtures cited note numbers 1..n, but the pack puts the lead and comparison notes first | The test maps "[n]" to the note of the n-th ranked pick |

## Screens checked

None: no UI markup changed (only props to `writeAnswer`); no app data or browser in the container. See T1101-b.

## What is still open

- T1101-a: live golden query on the deployed Function.
- T1101-b: look on a real phone and desktop.
- T1101-c: whether the text should grow when "more places" opens cards 4 to 6.

## Rollback

`git revert` of the T1101 commit.

## Owner steps (for the checklist)

- [T1101-a] Add the live failing query to the Ask golden set | the Workers AI model is not reachable from the cloud container | run `node continent-app/scripts/ask-eval-live.mjs` against the deployed site with the question "quiet lake with good walks in June under 120 a day"; confirm the named places equal the first three cards | continent-app/scripts/ask-eval-live.mjs
- [T1101-b] Look at Ask on a phone and desktop | the app data and a browser were not available to this session | after the next deploy ask five questions; check the sentence names only places on the first three cards, in their order | Execution/P15/T1101-ask-cards-agree.md
