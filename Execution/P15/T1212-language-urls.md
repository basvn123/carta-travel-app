# T1212: Language in the URL, language pages, hreflang and the sitemap per language (ROADMAP I12, session S128)

## Date

2026-11-07

## What changed

Carta's address now carries the language. English stays at the root and is the x-default; Dutch, German, French, Spanish and Italian live under `/nl/`, `/de/`, `/fr/`, `/es/` and `/it/`.

- Router. `src/lib/langPath.js` (new) reads, strips and writes the prefix. `src/i18n/index.jsx` lets a prefix in the address name the language of the visit (it wins over a stored or detected one), and on every language change writes the prefix back with `replaceState` and sets `<html lang>`. `src/lib/pathBoot.js` keeps the prefix when it turns a content path into the boot hash (`/de/spain/trails/176172-x` opens at `/de/#trail=176172&tc=ES`), turns `/it` into `/it/`, and keeps the language on `/nl/pricing`.
- Serving. `/nl/*` and the other four are Function routes (`public/_routes.json`, 97 of 100 rules). Pages applies no `_redirects` to a Function's routes (research below), so the Function answers the app shell for a language address that has no prerendered page (`isLangShellPath` in `prerenderShell.js`); `public/_redirects` covers `/nl` without a slash, which no Function route matches. `/api/*`, added to `_routes.json` by hand in an earlier task, is folded into `routesJson()` so the file and the module agree again.
- Prerender. Destinations, trips and journeys (`LANG_PAGE_KINDS`) are built in the five languages from the same record with `ctx.lang`: the T368 lead sentences (`derived.mjs`), page chrome from the new `scripts/prerender/strings.mjs` (49 strings in six languages), country names, months, lists and numbers from Intl, `<html lang>`, `og:locale`, `inLanguage`, translated breadcrumb and credit labels. English data words (crowding, bathing water, transport, pace, trip type, effort) and the English-only week receipts are left out. Links to a kind with language pages carry the prefix; links to English-only kinds keep the English address (`scripts/prerender/langs.mjs`).
- Indexing. A language page is indexed only when its English page is and `REVIEWED` in `langs.mjs` names its language and kind. Every string is machine-drafted, so `REVIEWED` is empty: all 40,350 language pages ship `noindex,follow`, carry no hreflang, stay out of the sitemap, and no English page names them. Flipping a pair in `REVIEWED` (owner step T1212-a) gives those pages and their English page the reciprocal hreflang set (English, the reviewed languages, x-default on English) and adds `sitemap-{type}-{lang}.xml` to the index. `--reviewed nl:dest+trip` previews it; `--langs none` builds English only.
- English pages and English sitemaps are byte for byte the same as before (diffed over all 32,160 pages).

## Research

A research subagent compared the options on 2026-11-07. developers.google.com and developers.cloudflare.com were blocked from the container, so the answers rest on search snippets of those pages and trade press; the URLs are listed for a direct check.

| Question | Options | Choice and why |
|---|---|---|
| hreflang delivery | HTML link tags; sitemap `xhtml:link`; HTTP Link header | HTML tags from the prerender. Google treats the three alike; one method per URL avoids disagreement, and the pages are prerendered anyway. https://developers.google.com/search/docs/specialty/international/localized-versions |
| hreflang to noindex pages | List every language; list only indexable ones | Only indexable ones. A noindex member drops out of the set (Mueller); unreviewed languages are left out of every set and carry none themselves. https://www.lumar.io/office-hours/hreflang/page/3/ , https://seroundtable.com/google-hreflang-urls-not-indexed-41838.html |
| Machine-drafted pages | Index now; noindex until review; do not build | Build, noindex until a native review. Google's scaled content policy names unreviewed automated translation; reviewed translation is fine to index. https://developers.google.com/search/docs/essentials/spam-policies#scaled-content , https://www.seroundtable.com/google-softens-automated-translation-stance-39579.html |
| Sitemaps | One file; one per language | One index, files per type and language: Search Console reports indexation per language. https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps |
| Redirect by browser language | Server redirect; client redirect; none | No redirect. The HTML at `/` is always English. The app writes the prefix of the language it already runs in to the address with `replaceState` (no request, no reload); whether a banner should replace that is owner decision T1212-f. https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites |
| Shell for `/nl/...` on Pages | `_redirects` rewrite; rewrite in the Function; exclude the routes | Rewrite in the Function: "Redirects defined in the _redirects file are not applied to requests served by Functions". https://developers.cloudflare.com/pages/configuration/redirects/ |

No library was added.

## Files touched

- `continent-app/src/lib/langPath.js` (new), `src/lib/pathBoot.js`, `src/i18n/index.jsx` (router and language detection)
- `continent-app/src/lib/prerenderShell.js` (languages, `LANG_PAGE_KINDS`, `isLangShellPath`, sitemap keys, routes), `continent-app/functions/[[path]].js` (shell for a language address)
- `continent-app/public/_routes.json`, `continent-app/public/_redirects`
- `continent-app/scripts/prerender/langs.mjs` (new), `strings.mjs` (new), `build.mjs`, `pages.mjs` (language branches of destPage, tripPage, journeyPage), `html.mjs`, `sitemap.mjs`
- `continent-app/scripts/verify_language_urls.mjs` (new), `continent-app/scripts/verify_prerender.mjs` (two expectations, see What broke)
- `continent-app/tests/languageUrls.test.mjs` (new, 15 tests)
- `docs/HANDBOOK.md` (Languages, SEO bullet), `ROADMAP.md` (I12), `Execution/_OPEN.md`

## Commands run

```
cd continent-app && npm ci
node scripts/prerender/build.mjs --data public --out <scratch>/before      # before the page changes
node scripts/prerender/build.mjs --data public --out <scratch>/after
diff -rq <scratch>/before/en <scratch>/after/en; diff -rq <scratch>/before/sitemaps <scratch>/after/sitemaps   # no output
node scripts/prerender/build.mjs --data public --out <scratch>/rev --reviewed nl:dest+trip+journey,de:...,it:dest+trip+journey
node scripts/verify_prerender.mjs <scratch>/after --shell ../.fastbuild/index.html   # 811,383 checks passed
node scripts/verify_prerender.mjs <scratch>/rev --shell ../.fastbuild/index.html     # 832,543 checks passed
node --test tests/languageUrls.test.mjs     # 15 pass
npm test                                    # 2,019 pass, 0 fail, 12 skipped
npm run lint                                # 0 errors, 14 warnings, none in touched files
npx eslint <touched files>                  # 0 errors
node scripts/ci/design-lint.mjs             # 0 new
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/verify_csp.mjs --dist ../.fastbuild   # 0 violations, 42 loads
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/verify_language_urls.mjs             # 6 of 6
```

No Python touched, so no pytest or ruff. CLAUDE.md and MAP.md untouched.

## Config and secrets set

None. New switch: `REVIEWED` in `continent-app/scripts/prerender/langs.mjs` (empty). New build flags `--langs` and `--reviewed`.

## Before/after measurements

Measured over this checkout's `public/` (same wire both runs). The place bar fails locally for every place because `public/dest/` and `public/stays/` are not in the container (as in T1113), so destination counts are 0 indexable here.

| Metric | Before | After | Delta |
|---|---|---|---|
| Prerendered pages | 32,160 | 72,510 | +40,350 (8,070 per language: 3,868 destinations, 3,949 trips, 253 journeys) |
| English pages changed | | 0 of 32,160 | 0 |
| Prerender size | 400 MB | 888 MB | +488 MB in R2 |
| Prerender build time | 26.5 s | 77 to 88 s | about +55 s |
| Sitemap URLs | 4,551 | 4,551 | 0 (every language page noindex until review) |
| Sitemap URLs with all five languages reviewed (preview) | | 11,591 | +7,040 (1,155 trips and 253 journeys per language) |
| Sitemap files with all five reviewed (preview) | 8 | 18 | +10 |
| `_routes.json` rules | 92 | 97 | +5 |
| Language addresses that route in Chromium | 0 of 6 (404.html under `/nl/`) | 6 of 6 | +6 |
| Tests in npm test | 2,016 | 2,031 | +15 |
| CSP violations | | 0 | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Two prerenderQuality tests failed | `select()` keyed groups `group|lang` for English too | English keeps its bare key; only other languages get `group|lang` (code fixed, tests untouched) |
| My sitemap test failed | `"-de"` matched `sitemap-destinations-en.xml` | Test matches `-de.xml` at the end |
| verify_prerender: `/nl/spain` "should fall through, got 200" | The expectation dates from English-only; by design the Function now answers the shell under a prefix | Expectation changed to "answers the app shell" for four language addresses; the English fall-through list is unchanged |
| verify_prerender: language sitemap names refused | Its index check allowed `-en` only | Allows the six languages |
| verify_language_urls: trail address showed no hash | The trail reader consumes the boot hash at once | The script records the addresses the app writes and checks the prefixed boot hash among them |
| `public/_routes.json` differed from `routesJson()` before this task | `/api/*` had been added by hand | Folded into `routesJson()` |

## Screens checked

`scripts/verify_language_urls.mjs` on the fast build in Chromium: `/nl/`, `/it`, `/de/spain/trails/176172-estels-del-sud`, `/` with an English browser, `/` with a French browser, `/es/` with Dutch stored: language and address as expected in all six. Read the HTML of a Dutch destination (`nl/spain/a-coruna`) and a Dutch trip: Dutch chrome, Spanje, juni to september, 7,3 op 10, links to Dutch destination and trip pages, English addresses for trails and beaches. No screenshots: the app's screens do not change, only the address and `<html lang>`. The end check of the batch should load `/nl/` and one prefixed trail address at phone and desktop width.

## What is still open

- T1212-a (owner): native review of the language page strings, then add the reviewed kinds to `REVIEWED`.
- T1212-b: country, section, cost, trip-length, trail, layer, region and receipt pages are English only; they need translated templates before they get language pages (continues T222-b and T368-a).
- T1212-c: the app's own links and share links to content paths (`paths.*` in src) are written without the prefix, and the language picker is not a set of crawlable links to `/nl/` and the rest.
- T1212-d (owner): upload the larger prerender and deploy the new routes, then check `/nl/` on the preview.
- T1212-e: English left in language pages: `h` and `min` in visit times, JSON-LD property names, wire names such as "Beach of As Lapas", and the destination highlights lose their English fact sentence.
- T1212-f (owner): at `/` the app writes the prefix of a stored or detected language into the address (no reload). Google advises against redirecting by language; this is not a redirect, but a dismissible banner is the alternative.

## Rollback procedure

`git revert` the T1212 commits. Nothing was deployed or uploaded; no data or schema changed. To keep the router and drop only the language pages, build with `--langs none`.

## Owner steps (for the checklist)

- [T1212-a] Native review of the language page strings | language pages stay noindex until a native speaker has read them; Google treats unreviewed automated translation as thin | have a native speaker read `STRINGS` in continent-app/scripts/prerender/strings.mjs and the `prerender.*` keys of each catalogue for nl, de, fr, es, it; send corrections; add the reviewed kinds per language to `REVIEWED` in continent-app/scripts/prerender/langs.mjs (for example `nl: ['dest', 'trip', 'journey']`) | continent-app/scripts/prerender/langs.mjs
- [T1212-d] Upload the language pages and deploy the routes | without the upload `/nl/spain/malaga` gets the app shell, not its page | run the prerender on the box with full data (expect 40,350 more pages, about 490 MB more in R2); `node scripts/prerender/push.mjs`; deploy to preview and open `/nl/`, `/de/spain/malaga` and `/fr/trips/<id>`; then main | continent-app/scripts/prerender/push.mjs
- [T1212-f] Decide how a browser language shows at the root | the app writes `/fr/` into the address for a French browser at `/`; Google advises no language redirects | keep it (no reload, the HTML at `/` stays English) or ask for a dismissible "this page is in Français" banner instead; tell the next session | Execution/P15/T1212-language-urls.md
