# T1108: Support and trust pages (ROADMAP I9)

## Date

2026-11-06.

## What changed

Carta now has a Help and contact page at `/?legal=support`, opened like the legal texts (LegalFromUrl) and linked from the footer's Carta column ("Help and contact", beside the mailto). It has three parts: a contact route (mail link with a prefilled subject and a line on what to include), a live status line read from the same `status.json` the banner uses (T1056; "No known problems right now" when the file is absent or disabled, the incident text in the traveller's language otherwise), and a FAQ of eight questions built from what the product does: prices are estimates, data sources (OpenStreetMap, Eurostat, Google Flights pages, NASA and Copernicus), est. marks, accounts, deleting data, what passes cost (figures from `lib/pricing.js`), cancelling the year plan, and refunds in the three cases of the Terms and `docs/runbooks/refund.md`. English and Dutch strings were written (Dutch is a draft). The support address is one constant, `SUPPORT_EMAIL` in `lib/contact.js`, currently equal to the general address as a placeholder, so no mail is lost.

## Files touched

- `continent-app/src/components/SupportPage.jsx` (new)
- `continent-app/src/components/LegalFromUrl.jsx`, `SiteFooter.jsx`
- `continent-app/src/lib/contact.js`
- `continent-app/src/i18n/en.js`, `nl.js` (`support.*`, `footer.support`)
- `continent-app/src/styles/69-v6-account.css`
- `continent-app/tests/supportPage.test.mjs` (new)
- `ROADMAP.md` (I9 status), `Execution/_OPEN.md`

## Commands run

`npm ci`, `npx eslint` on touched files, `npm test` in `continent-app/` (1,362 pass, 0 fail), a temporary Vite harness page for the browser check (removed).

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The app would not load in the cloud container | No app data and the data host is unreachable | Rendered `SupportPage` and `SiteFooter` alone in a throwaway harness for the look check |

## Screens checked

Help and contact at 390 px and 1280 px, English (read, looked fine: contents list folds on the phone, sits beside the text on desktop, one disclosure opened) and a Dutch title check. Not checked on the full app shell (no data here), so the footer link and `?legal=support` opening over a real tab need one look on the owner's machine. Design questions: the page reuses the legal reading page and the Account FAQ rows, so it adds no new tokens; copy is plain and short with no em dashes.

## What is still open

- T1108-a: the dedicated support address (owner).
- T1108-b: Dutch review (owner); other languages fall back to English.
- T1108-c: About page, accessibility statement, status history.
- The old Account FAQ (`account.fq.*`) says refunds are "within 14 days if you have not used the pass"; the new page states the Terms' three cases. Align the old one in a later task.

## Rollback procedure

`git revert` the T1108 commit. No data or schema change.

## Owner steps (for the checklist)

- [T1108-a] Give the support email address | the page shows a placeholder (the general address) until a dedicated one exists | decide the address; create the mailbox with SPF, DKIM, DMARC; change `SUPPORT_EMAIL` in contact.js | continent-app/src/lib/contact.js
- [T1108-b] Review the Dutch support texts | the Dutch is a draft written without a native check | read the `support.*` and `footer.support` keys in nl.js; correct wording | continent-app/src/i18n/nl.js
