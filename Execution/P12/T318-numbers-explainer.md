# T318 The Where the numbers come from explainer page

## Task ID

T318 (register rows T226-b and T207-c)

## Date

2026-10-03

## What changed

Carta now builds one static page, "Where the numbers come from", at `/about/numbers`. It needs no sign-in and carries no script. The build emits it as `about/numbers.html`, a single file, so Pages and Vercel both serve it at the clean path. The dev server answers the same path from memory.

Nothing on the page is typed. The positioning sentence of PRODUCT.md (T201) is rebuilt from `public/boot.json` `meta.n_destinations` (3,868 in this checkout) and the length of `COUNTRY_SLUGS` in `src/lib/urlScheme.js` (43). The provenance sentences are the seven cost receipt lines of `src/i18n/en.js` (`cost.bedCity`, `bedCountry`, `bedScaled`, `bedRepaired`, `foodCity`, `foodCountry`, `foodScaled`, from T098). The task text said five; those five old keys are no longer read by the receipt, so the page uses the seven current ones. The food accuracy figure comes through `src/lib/accuracy.js` and the `cost.accuracy` strings (88 percent within EUR 6, run of 2026-10-01, T097). The per-layer table is computed from `public/coverage.json` (published and listed rows, and the ok, thin and empty region counts, over 2,077 regions, as of 4 September 2026). The credits are `ATTRIBUTIONS` from `src/data/attribution.js`, 43 entries, the same list the Account panel prints. The build throws if any input is missing or empty, so a page with a hole cannot ship; if the data files are absent altogether the plugin warns and skips the page.

To make the path safe, `about` is added to `TOP_WORDS` in `src/lib/urlScheme.js`, so no country or place can ever take it. T223 had said the path would be reserved outside the country namespaces but had not listed the word.

T207-c has two halves. The platform half is decided: the page lives on the domain. The credits half is verified: in a clean browser profile with no auth keys in storage, Account then Data sources shows all 43 credits, at 380px and at 1280px (the page also repeats them, so a visitor needs neither route).

Owner decision T226-a is still open. The page is built from files and depends on no platform choice, so it stands either way.

## Files touched

**Modified (app repo, branch p12-numbers-explainer):**
- continent-app/vite.config.js (a small plugin, `carta-numbers-page`)
- continent-app/src/lib/urlScheme.js (one word in `TOP_WORDS`)

**Created (app repo):**
- continent-app/scripts/explainer/numbers.mjs (reads the inputs, renders the page)
- continent-app/tests/numbersPage.test.mjs

**Modified (root repo):**
- Execution/_OPEN.md (T207-c and T226-b closed, T318-a to T318-c added)

**Created (root repo):**
- Execution/P12/T318-numbers-explainer.md

## Commands run

```
node --test tests/numbersPage.test.mjs        # 4 pass
node scripts/verify_url_scheme.mjs            # 66 checks passed (69 when given the dossier folder, per T223; this run had none)
npx vite --port 5202   (dev)                  # page checked at 380 and 1280 with playwright; no horizontal scroll, 43 credits, one h1
npx vite build                                # dist/about/numbers.html emitted, 15,356 bytes
npx vite preview --port 5202                  # /about/numbers answers with the page; guest Account > Data sources shows 43 credits at 380 and 1280
```

The dev and preview servers were stopped, and `dist/` deleted.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Public pages that explain where the numbers come from, with no sign-in | 0 | 1 (`/about/numbers`) | +1 |
| Credits visible on a page without an account | 43, only via Account then Data sources | 43 on the page and 43 via Account | second route |
| Files added to dist | 0 | 1 (`about/numbers.html`) | +1, far inside the 20,000 Pages ceiling of T024 |
| Hand typed figures on the page | n/a | 0 (all read at build time) | |

Counts come from `public/boot.json`, `public/coverage.json` and `src/data/attribution.js` in this checkout.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The page did not answer on the first dev server | The server had started before Vite re-bundled the changed config | Restarted it |
| The app root never rendered under the dev server in the harness (blank page after 30 seconds) | Not investigated; the dev server is slow on a cold shard cache | Checked the app in the built preview instead |
| Phone check clicked a hidden twin of the Data sources row | The desktop rail and the phone menu both render the row | Used the visible one |

## What is still open

The single `.html` at its clean path is confirmed locally, not on Pages itself, which is a deploy and so the owner's (T318-a). T226-a is still the owner's decision (T318-b). The sitemap should list the page and the language question is open (T318-c).

## Rollback procedure

Revert the commit on branch p12-numbers-explainer in the app repo. That removes the plugin, the script, the test and the one `TOP_WORDS` word; nothing else imports them. In the root repo revert the report commit, which restores the two register rows to open. Nothing is deployed and no data was touched.
