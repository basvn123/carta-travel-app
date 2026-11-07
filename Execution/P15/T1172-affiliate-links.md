# T1172: Affiliate links done right

ROADMAP item I15 (round 2 session S88, batch 10).

## Date

2026-11-07.

## What changed

Every partner link now goes through one helper, `continent-app/src/lib/partnerLink.js`. A link that carries this build's partner id gets `rel="sponsored noopener"`, a `data-partner` attribute and a small "Partner link" mark; every other link is plain, so a build with no ids (today) shows no mark and claims nothing. A disclosure line sits before each group of partner links and points to a new page at `/?legal=partner`, written in six languages under `partner.*`. Call sites moved onto the helper: destination cards (tours, flights), things to do, the trip travel legs, the ready-to-book rows, the journey Book button and the itinerary leg link. Clicks stay counted by the existing cookieless launch counters (`affiliateClickOf`), no new script and no cookie. A test fails on a raw partner URL or an inline partner anchor. Own figure first, one door per cost line and no commission sorting were already the call sites' order; the helper never reorders.

## Research

None chosen. This is plain markup on the existing builders; no tool, library or service was picked.

## Files touched

Created: `continent-app/src/lib/partnerLink.js`, `src/components/PartnerMark.jsx`, `src/components/PartnerPage.jsx`, `src/styles/99-partner.css`, `tests/partnerLink.test.mjs`.
Modified: `LegalFromUrl.jsx`, `browse/DestPractical.jsx`, `browse/DestNearby.jsx`, `planner/TravelLegsSection.jsx`, `planner/trip/ReadyToBook.jsx`, `planner/trip/Journey.jsx`, `planner/TripItinerary.jsx`, `src/i18n/{en,nl,fr,de,es,it}.js` (14 `partner.*` keys each), `ROADMAP.md` (I15), `docs/HANDBOOK.md`, `Execution/_OPEN.md`.

## Commands run

`npm ci`, `node --test tests/partnerLink.test.mjs`, `npm test`, `npx eslint src`, `node scripts/ci/design-lint.mjs`, the fast build, `verify_csp.mjs`.

## Config and secrets set

None. Partner ids (`VITE_TP_MARKER`, `VITE_OMIO_TRACKING_LINK`, `VITE_GYG_PARTNER_ID`, `VITE_VIATOR_PID`) are owner steps.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| App tests | 1833 pass | 1834 pass, 0 fail | +4 new tests (one file) |
| design-lint new violations | 0 | 0 | none |
| CSP violations over 40 screen loads | not run | 0 | none |
| eslint errors | 0 | 0 | none |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| design-lint flagged `border-radius: 999px` | literal radius | `var(--radius-pill)` |
| First raw-URL test flagged a maps link | heuristic looked at the whole file | checks only lines that call a builder and open an anchor |

## Screens checked

Static only (no dev server in this container): CSP check over 40 screen loads clean. The end check must look at: destination page cards (tickets, airport) and things to do, the trip travel legs fold, ready to book, journey, itinerary leg link, and `/?legal=partner`, at phone and desktop width, once with an id set so the mark shows.

## What is still open

- T1172-a: the owner registers the programmes and sets the ids (owner step).
- T1172-b: the I-R5 legal checklist and PRODUCT.md wording (I-e) check of the disclosure text.
- T1172-c: stay links (Booking.com, Airbnb, Hostelworld) and Google/Skyscanner/Trainline links are not decorated, so they are plain; when those programmes are joined, add their builder and its `...ClickOf` to `partnerOf`.
- T1172-d: exported PDF links are decorated by the builders but carry no mark or note (outside the app); add a disclosure line to the PDF footer.
- T1172-e: pytest could not run in this container (collection error in `pipeline/trails/smoke_test.py`, missing pipeline deps); no Python was touched.

## Owner steps (for the checklist)

- [T1172-a] Register affiliate programmes and set the ids | partner links only earn once an id exists; until then they stay plain | register Travelpayouts, Impact (Omio), GetYourGuide and Viator; set VITE_TP_MARKER, VITE_OMIO_TRACKING_LINK, VITE_GYG_PARTNER_ID, VITE_VIATOR_PID in .env and the Cloudflare Pages project; rebuild and look for the Partner link mark | continent-app/src/lib/affiliate.js, omio.js, activityAffiliates.js
- [T1172-b] Approve the disclosure wording | EU guidance wants a clear disclosure before the click | read /?legal=partner in all six languages; run it against the I-R5 legal checklist; confirm the PRODUCT.md wording (I-e) | continent-app/src/i18n/en.js (partner.*), ROADMAP.md I-R5

## Rollback procedure

`git revert` the T1172 commits. No data or schema change.
