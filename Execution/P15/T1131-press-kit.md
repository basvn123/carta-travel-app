# T1131: Press kit page and journalist list (K10)

## Date

2026-11-06

## What changed

Carta has a press kit page at `/?legal=press` (English and Dutch): what Carta is, who it is for, a founder line placeholder, key facts from the data (3,868 destinations, 43 countries, 377 airports, 3,984 trips, 6 languages), Carta's own logo and image with download links, and a contact line using `SUPPORT_EMAIL` from T1108. It is linked from the support page. A journalist list template (13 BE and NL outlets and desks, no personal details) with the columns and selection rule is under `docs/marketing/`. Owner decision 5 (keep the name Carta) is followed.

## Files touched

- `continent-app/src/components/PressKitPage.jsx` (new), `src/lib/press.js` (new), `src/data/pressFacts.json` (new), `scripts/press/build-facts.mjs` (new)
- `continent-app/src/components/LegalFromUrl.jsx` (route), `SupportPage.jsx` (link), `src/i18n/en.js`, `nl.js`, `src/styles/69-v6-account.css`
- `continent-app/tests/pressKit.test.mjs` (new)
- `docs/marketing/journalist-list-template.csv`, `docs/marketing/journalist-list.md` (new)
- `Execution/_OPEN.md`, `ROADMAP.md` (K10 status)

No shared component was edited (G2): the page reuses `LegalDoc`; the footer is untouched.

## Commands run

`node scripts/press/build-facts.mjs`; `npm test` in `continent-app/`; Vite dev with a Playwright check at 390 and 1280 px.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Whole i18n file failed to parse | Apostrophes in two English strings were mangled by my insert script | Fixed; `npm test` fails set equals the baseline |
| Full app would not load in dev | `data.carta-europetravel.com` is unreachable in the cloud container | Checked the page in a small harness rendering `PressKitPage` in `I18nProvider` (removed afterwards) |

## Screens checked

Press kit at phone (390 px) and desktop (1280 px): no horizontal overflow, no page errors, counts shown. Shots in `Execution/P15/T1131-shots/` (gitignored). Not checked in the full app shell (data host blocked); `?legal=press` is wired the same way as `?legal=support`.

## Tests

`tests/pressKit.test.mjs` and `supportPage.test.mjs` pass. `npm test`: 73 failures before and after my change, identical set (existing, outside this task; no node_modules at start).

## What is still open

T1131-a to T1131-d in `Execution/_OPEN.md`. The footer link is not added on purpose (shared component).

## Rollback

`git revert` the T1131 commit.

## Owner steps (for the checklist)

- [T1131-a] Write the founder line | the press kit shows a placeholder until then | edit `PRESS_FOUNDER_LINE`; check `/?legal=press` | continent-app/src/lib/press.js
- [T1131-b] Fill the journalist list | names and addresses are personal data only the owner collects | open the template; add names and public editorial addresses by hand; grow to about 40 rows; keep the filled copy private | docs/marketing/journalist-list-template.csv
- [T1131-c] Review Dutch copy and swap the screenshot | the Dutch is a draft and the image is the site OG card | read `press.*` in nl.js; put a real screenshot in public and point `PRESS_SCREENSHOT` at it | continent-app/src/lib/press.js
