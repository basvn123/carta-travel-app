# T1156: Responsible AI, the public AI page and model cards (ROADMAP F8, round 2 session S72)

Branch `p15-s72-responsible-ai` from `origin/p15-round2`. Builds on T1135, T1137, T1140, T1136, T1141, T1145, T1148 and T1149.

## Date

2026-11-06.

## What changed

Carta now has a public "How Carta uses AI" page, at `/?legal=ai` and in the footer's Legal column. For Ask Carta, day plans, town suggestions and booking import it says which model and provider, what the feature can and cannot do, how it is checked and how to report a wrong answer. It also says what is not AI, what is sent where, the EU AI Act transparency points (the team's reading, not legal advice) and the coverage parity summary. Every figure is copied from a task report; where something is not measured the page says so (no human-rated quality score for plan-day, no dense or hybrid Ask baseline). Model cards for Ask and plan-day and a tagger stub are in `docs/ai/`, with a README that replaces the empty-on-purpose one. A DOM check and a unit test pin the figures to the blessed baseline and the cards.

## Research

None chosen. No tool, library, model or service was picked: the page is a reading page in the existing `LegalDoc` shell, its content comes from the reports, and the AI Act points are written as the team's view with a lawyer's read left as an owner step (T1156-a). The checks above were done by reading `aiModels.mjs`, the handbook sections and the reports. Not looked up on the web: the exact applicability dates of Article 50, so the page and cards name the duty without a date.

## Files touched

Created: `continent-app/src/components/AiPage.jsx`, `continent-app/scripts/verify_ai_page.mjs`, `continent-app/scripts/ai_page_harness/index.html` and `main.jsx` (a harness that mounts the page and footer without the catalogue), `continent-app/tests/aiPage.test.mjs`, `docs/ai/model-card-ask.md`, `docs/ai/model-card-plan-day.md`, `docs/ai/model-card-tagger.md`, this report.

Modified: `continent-app/src/components/LegalFromUrl.jsx` (route `ai`), `continent-app/src/components/SiteFooter.jsx` (one link), `continent-app/src/i18n/en.js` (39 new `aiPage.*` keys appended; the other five languages fall back to English), `docs/ai/README.md`, `docs/HANDBOOK.md` (new section "How Carta uses AI (public page)" and its contents line), `ROADMAP.md` (F8 status), `Execution/_OPEN.md` (rows T1156-a to T1156-g appended).

## Commands run

From `continent-app/`: `npm ci`; `node scripts/verify_ai_page.mjs` with `CARTA_CHROMIUM=/opt/pw-browsers/chromium` (the container's browser); `npx eslint` on the three components and the new test (0 errors; one warning in `SiteFooter.jsx` line 18 that was there before); `node scripts/ci/design-lint.mjs`; `node --test tests/aiPage.test.mjs`; `npm test`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Public page on how Carta uses AI | none | 1 (`/?legal=ai`, 10 sections, footer link) | +1 |
| Model cards | 0 (docs/ai said "empty on purpose") | 3 (Ask, plan-day, tagger stub) | +3 |
| AI features with a public model and provider statement | 0 of 4 | 4 of 4 | +4 |
| `aiPage.*` keys | 0 | 39, English only | +39 |
| DOM checks (`verify_ai_page.mjs`), phone and desktop | n/a | 40 of 40 pass | new |
| design-lint | 4612 in the baseline | 4612, 0 new | 0 |
| `npm test` | 1,649 tests (the 1,654 minus the 5 new) | 1,654 tests: 1,642 pass, 0 fail, 12 skipped | +5 |

The page's own numbers (Ask hit@10 0.930, recall@10 0.568, grounding 0.996 of 689 checks, abstention 25 of 30; plan-day 20 of 20 reference plans, kappa 0.898 against the rules; parity 43 countries, 310 regions) are not new measurements. They are the figures in T1136, T1141, T1148 and T1145, and `aiPage.test.mjs` fails if the page, the card and `ask-baseline.json` disagree.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The page did not render in the dev server here | The app shows "couldn't load Carta's travel data" because the catalogue shards and the flights index come from the data host, which this container cannot reach, and `LegalFromUrl` sits behind that gate | `scripts/ai_page_harness/` mounts `LegalFromUrl` and `SiteFooter` inside `I18nProvider` with the real stylesheet, so the check runs without data. The full-app route is checked by `?legal=` wiring in the unit test; a run with data is row T1156-g's end check |
| Playwright said its browser was missing | The container's pinned Playwright wants another build than `/opt/pw-browsers` holds | The script takes `CARTA_CHROMIUM` for an executable path |
| First draft said "the right places are in the first ten for 93 percent" | hit@10 means at least one expected place, not all | Reworded, with recall 57 percent beside it; the test pins both |
| First draft promised "a label on each AI answer" | No such label exists in Ask or the day planner | Reworded to say it is still to come; row T1156-c |
| First draft said the privacy policy has the full list | It names Gemini but not Ask's processing by Cloudflare | Sentence cut; row T1156-f |

## Screens checked

The page at 390 px and 1280 px width in a headless browser (DOM checks all pass, screenshots in `Execution/P15/T1156-shots/`, not committed). Desktop: wide dialog with the contents list beside the text. Phone: full-height sheet, contents folded, no horizontal overflow (page and card 0 px). Not looked at in the real app with data (see above), and not at other languages (English only).

## What is still open

All also in `Execution/_OPEN.md`.

- T1156-a (owner): lawyer reads the page and the AI Act sections.
- T1156-b (owner): translate the page into five languages with a native check.
- T1156-c: visible "written by AI" labels (Ask, plan-day summary, suggest-city); outside this task's files.
- T1156-d: an in-app "report this answer" button feeding the eval sets; needs a table.
- T1156-e: cards for suggest-city and parse-booking.
- T1156-f (owner): add Ask's Cloudflare processing to the privacy policy.
- T1156-g: refresh the page, cards and verify script together when T1136-a, T1148-a and T1148-e, D15 or the B6 docs site change a figure or give the parity table a URL.

## Owner steps (for the checklist)

- [T1156-a] Legal read of the AI page | the page and cards state a view of the EU AI Act (Article 50 duty, not high-risk, provider versus deployer); a wrong reading published is a liability | open `/?legal=ai` on the preview and `docs/ai/model-card-ask.md`, `model-card-plan-day.md`; send to the lawyer; change the `aiPage.actP` text and the cards' "EU AI Act reading" sections to what they confirm | continent-app/src/i18n/en.js (aiPage.actP), docs/ai/
- [T1156-b] Native check and translation of the AI page | travellers in five languages see it in English; a machine pass could misstate what a model does | export the 39 `aiPage.*` keys from en.js; translate; have a native speaker read each; append them to nl, de, fr, es, it | continent-app/src/i18n/*.js
- [T1156-f] Name Ask's AI processing in the privacy policy | the policy names Google but not Cloudflare Workers AI, which sees the Ask question and notes | confirm with Cloudflare whether Workers AI keeps requests in the EU on the current plan (T1135-a); add a paragraph to the privacy policy and a row to `docs/legal/ARTICLE30.md` | continent-app/src/components/PrivacyPolicy.jsx, docs/legal/ARTICLE30.md

## Rollback procedure

`git revert` the `T1156:` commits. Nothing live changes: no migration, no data, no deploy. The `aiPage.*` keys, the route and the footer link go with the revert.
