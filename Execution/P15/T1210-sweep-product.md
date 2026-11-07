# T1210: Register follow-up sweep, product and growth

ROADMAP item: register follow-up (product and growth). Session S126, batch 15.

## Date

2026-11-07.

## What changed

Of the 24 open `next task` rows raised by T1169, T1170, T1171, T1172, T1174, T1175, T1176 and T1178, five are closed and 19 stay open. Closed: T1170-c (the three cut-off i18n keys `day.place`, `day.poiDepthNote`, `day.townDepthNote` had no reference in code, so they were removed from all six catalogues instead of retranslated; row no longer true as a bug), T1172-d (exported PDFs print a translated partner disclosure line above the footer on any page that carries a partner link; `partnerNote` option of `createPdf`, key `partner.pdfNote` in six languages), T1169-f (`verify_pwa.mjs` runs in the CI job right after `verify_csp.mjs` on the same fast build), T1178-a (`build-pages.mjs` builds the blog first and copies `dist-blog` into `dist`; `prerender/sitemap.mjs` lists `sitemap-blog-en.xml` in the index when a post is published), T1171-d (the Pass moment free list shows the plans left for a signed in traveller with a known balance, keys `paywall.free.aiLeft` and `paywall.free.aiNone`; guests and failed reads keep the starting number).

## Research

None chosen. Each change reuses an existing mechanism.

## Files touched

continent-app: `src/i18n/{en,nl,de,fr,es,it}.js`, `src/lib/pdfKit.js`, `src/lib/{dayPdf,destinationPdf,itemPdf,planPdf,tripPdf}.js`, `src/pass/passMoment.js`, `src/pass/PassMoment.jsx`, `tests/passMoment.test.mjs`, `scripts/build-pages.mjs`, `scripts/prerender/sitemap.mjs`. Also `.github/workflows/ci.yml`, `docs/i18n/review.md`, `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md`.

## Commands run

`npm test` (1975 tests, 0 fail, run after the first two changes), `npx eslint` on touched files, `node scripts/ci/design-lint.mjs` (0 new), `node --test tests/passMoment.test.mjs tests/passMoments.test.mjs` after the Pass moment change, `node scripts/blog/build.mjs` (0 published, no sitemap, as expected).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Open `next task` rows in the group | 24 | 19 | -5 |
| Rows closed by T1210 | 0 | 5 | +5 |
| Rows moved to owner | 0 | 0 | 0 |
| Open `user` rows in the group | 16 | 16 | 0 |

## What broke and how it was fixed

No issues. The PDF partner mark could not be seen in a browser here; it is covered by the build and lint, not by a rendered PDF.

## Screens checked

None in a browser (container, no dev data). The Pass moment card and an exported PDF with a partner link should be looked at in the next end check.

## What is still open

All rows below stay open with their register row unchanged:
- T1170-b display currency: touches the price formatting lib, outside this sweep's files.
- T1170-d place intros in five languages: a data and model run, not a code fix.
- T1172-c stay, Skyscanner and Trainline links: waits for the programmes to be joined (T1172-a, owner).
- T1172-e pytest in the cloud container: missing deps, run where they exist.
- T1169-a account trips offline: needs a device mirror design, larger than a sweep fix.
- T1169-d precache list from the Vite manifest: touches the worker and build, needs a device test (T1169-b).
- T1169-e native review of machine drafts: waits for the I8 pass.
- T1169-g manifest screenshots and shortcut: needs settled screens.
- T1171-b paywall event for the Pass moment: needs a migration 022 change, not applied from here.
- T1171-c "Not now" carried to the account: needs a stored column, same migration path.
- T1175-d offline share images in six languages, T1175-e receipt on a device-only trip (SavedTripsPanel, outside the named files), T1175-f receipt counting and rasteriser: left for a focused task.
- T1176-d UK crowding and Wikidata ids: waits for the T1098 run.
- T1178-b blog link in the footer: no post is published yet, and the footer is shared; T1178-c, T1174-a, T1174-c, T1174-d: new post types and data inputs, new features.

## Rollback procedure

`git revert` the T1210 commits. Nothing is one-way.

## Owner steps (for the checklist)

None new.
