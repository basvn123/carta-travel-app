# T223 The destination URL structure

## Task ID

T223 (mind-map M23)

## Date

2026-10-03

## What changed

Carta now has a ratified URL scheme, written in docs/SEO.md and implemented in one pure module, continent-app/src/lib/urlScheme.js. Every page type has a path: country, destination, destination cost, section lists with pagination on the path, country and trip length, trail, cycling route and tour, beach, lake, mountain, region, trip, journey and guide, each with an optional language prefix (English at the root, nl, de, fr, es, it). The module builds paths, reads them back, maps them to the legacy boot hashes, decides canonicals and returns the hreflang set. scripts/verify_url_scheme.mjs checks it, and given the dossier folder it checks all 3,868 real slugs.

The design rule is that the identifier never changes and the words may. Trails and cycling routes are the numeric id then the ladder title slug, so a retitled trail keeps its URL and its canonical moves to the new slug. Beaches, lakes and mountains use the wire id lower cased (the Wikidata Q is the only capital in a wire id and is restored on read). Regions are the id, a double hyphen, then the name. The one change from the T205 proposal is regions: T205 sketched a bare name, which breaks when a region is renamed; the id-first form follows the trail rule. The cross-country EuroVelo and E-path paths under /routes were also not ratified, because the wire files every route under one country and a cross-country parent has no id yet (T223-b).

Canonicals follow the T205 rules and are now code (canonicalFor). A stage, a parent and a standalone row are their own canonical, so a stage never competes with its parent. A variant canonicalises to the line it varies and leaves the sitemap. A row with a dup_of canonicalises to that row. A row below the page floor is noindex and not a target. Language pages are self-canonical and carry the full reciprocal set.

The nine hash readers still read and strip their hash. A new boot file, src/lib/pathBoot.js, imported first in main.jsx, handles both directions. A content path is turned into the legacy hash and the address returns to the root, so a path link opens the right entity (Cloudflare Pages already answers unknown paths with index.html, per public/_redirects). A legacy hash redirecting to its path is built and tested but gated on VITE_PATH_URLS=1, because with no prerendered HTML behind the paths it would only add a reload; the prerender turns it on (T223-c). Auth hashes are never touched. Destination paths cannot open the app yet, since nothing in the client maps a dossier slug to its airport or gem id (T223-a).

The reserved word check is the other half of T205-c. Every section word, every `{n}-days` pattern and the language codes are rejected as place words, and reservedCollisions is exported for the pipeline to call. Run over the 3,868 dossier slugs it finds none.

SEO.md was lifted from the T205 report by script, with the URL section replaced by the ratified one and a paragraph added on canonicalFor, so the old report stays closed and unedited.

## Files touched

**Created:**
- continent-app/src/lib/urlScheme.js
- continent-app/src/lib/pathBoot.js
- continent-app/scripts/verify_url_scheme.mjs
- docs/SEO.md
- Execution/P12/T223-url-structure.md

**Modified:**
- continent-app/src/main.jsx (one import line, first in the file)
- Execution/_OPEN.md (T205-c and T205-h closed, T223-a to T223-e added)

## Commands run

```
node scripts/verify_url_scheme.mjs "<main checkout>/continent-app/public/dossier"
npx eslint src/lib/urlScheme.js src/lib/pathBoot.js src/main.jsx
npm run build   (then dist and dist-data deleted)
```

The dossier slugs, country map and id shapes were read from the main checkout's continent-app/public (dossier, beaches, lakes, mountains, region, trips, cycling folders) with throwaway Python; nothing was written there.

## Config and secrets set

One build flag is introduced and left unset: VITE_PATH_URLS=1 turns on the hash to path redirect. Default off.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Page types with a ratified path | 0 (proposal only) | 15 (one builder each in urlScheme.js, plus the language prefix) | +15 |
| Dossier slugs checked against reserved words | 0 | 3,868, zero collisions, all unique, all two segments of a-z0-9- | checked |
| Country words mapped | none | 43 (every dossier slug starts with exactly one) | +43 |
| Scheme checks passing | none | 69 | +69 |
| Hash readers that a path link can open | 0 | 8 of 9 (destination excluded, T223-a) | +8 |
| Indexable URLs on production | 1 | 1 | 0, nothing indexes until T221 and T222 |

The slug and country figures come from running the verify script against the main checkout's dossier folder. The 15 counts the builders in paths.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First edit of main.jsx showed 81 changed lines | The file is CRLF and my script rewrote it with LF | Restored it and redid the edit in binary mode; the diff is one line |

## What is still open

Destination paths and destination hashes cannot be mapped to each other in the client until a slug to id table exists (T223-a). Cross-country route families have no path (T223-b). The redirect flag must be turned on with the prerender (T223-c), and the share-link builders should move to the path builders then (T223-d). The pipeline step that mints dossier slugs does not yet call reservedCollisions (T223-e). I did not run the app in a browser: the boot logic is tested with a fake location and history, and the production build passed, but a live check of a path link opening an entity belongs with the prerender work. T205-c and T205-h are closed by this task.

## Rollback procedure

Revert the commit on branch p12-url-structure in each repo. The only existing file changed in the app is the first line of src/main.jsx; remove that import and the feature is gone, since the other files are new and nothing else imports them. Nothing is deployed and no data was touched.
