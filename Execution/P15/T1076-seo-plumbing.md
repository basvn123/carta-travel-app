# T1076: SEO plumbing and the page quality gate (K2)

## Date

2026-11-05

## What changed

Prerender, canonicals, JSON-LD (TouristDestination or TouristAttraction plus BreadcrumbList) and a per-type sitemap index already existed from T221 to T225; the page floor (T205-d) already kept incomplete pages out. What K2 lacked was the research file's quality bar and a robots tag that lets crawlers follow links from thin pages. This task adds the bar as one pure module (`scripts/prerender/quality.mjs`: `placeBar`, `trailBar`), applies it in the prerender, ships every page below it with `noindex,follow` (head tag, and `x-robots-tag: noindex, follow` from the Pages Function), keeps it out of the sitemap with its own exclusion reason, and records the per-test result in `_manifest.json` and `_sitemap.json`. There is no wire key and no schema change: `indexable` is the manifest's existing field, now fed by the bar, so pages promote themselves on the next prerender as data improves. Indexable places fall from 3,754 to 337 and indexable trails stay at 0. Nothing is deployed.

## Files touched

- `continent-app/scripts/prerender/quality.mjs` (new): the bar.
- `continent-app/scripts/prerender/build.mjs`: collects trails that destination pages link to, runs the bar in `write()`, stores `bar` and `bar_headroom` in the manifest.
- `continent-app/scripts/prerender/sitemap.mjs`: exclusion reason `below the quality bar`, `bar` and `bar_headroom` blocks and a bar clause in the floor line of `_sitemap.json`.
- `continent-app/scripts/prerender/html.mjs`: `<meta name="robots" content="noindex,follow">`.
- `continent-app/functions/[[path]].js`: `x-robots-tag: noindex, follow`.
- `continent-app/tests/prerenderQuality.test.mjs` (new, 23 tests).
- `docs/HANDBOOK.md`: Deploy section, new bullets "Indexable and the quality bar" and "Sitemaps".
- `Execution/P15/_OPEN-search-console.md` (new): owner procedure.

## Commands run

```
node scripts/prerender/build.mjs --data "<main checkout>/continent-app/public" --out <scratch>/before   # on the unchanged code
node scripts/prerender/build.mjs --data "<main checkout>/continent-app/public" --out <scratch>/after
cd continent-app && npm test
CARTA_APP="$PWD" FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
```

The prerender ran locally over the main checkout's real `public/` (read only), 104 s before and 222 s after (a CPU-contended run; the bar itself adds a few seconds).

## Config and secrets set

None. Thresholds are constants in `quality.mjs`: `PLACE_MIN_WORDS` 120, `PLACE_MIN_LINKS` 5, `TRAIL_MIN_WORDS` 60.

## Before/after measurements

Same wire, same day (35,973 pages written both times).

| Metric | Before | After | Delta |
|---|---|---|---|
| Places (dest pages) indexable and in sitemap | 3,754 of 3,868 | 337 of 3,868 | -3,417 |
| Trails indexable and in sitemap | 0 of 17,619 | 0 of 17,619 | 0 |
| Pages with a canonical tag | all 35,973 | all 35,973 | 0 |
| Robots tag on a thin page | `noindex` | `noindex,follow` | |
| Sitemap files (plus index) | 10 (+1) | 10 (+1) | 0 |
| URLs in the sitemaps | 17,551 | 14,134 | -3,417 |
| Hubs indexed (43 countries, 489 sections, 319 regions, 189 trip-length pages) | 1,040 | 1,040 | 0 |
| `npm test` | 1,236 pass | 1,247 pass, 0 fail (1,259 tests) | +11 (23 new tests; the baseline moved with the branch) |

Why places pass 337, not the research's about 1,800: of the 3,868 places, the 120 word intro fails 3,495, the bed or food price 529, a licensed photo 114, five internal links 14, the rating 13 (a place can fail several). Without the intro test 3,224 would pass. The research figure was a proposal; the bar as written is stricter than what it counted, and the intro is the limit. The threshold is a one-line constant if the owner wants it at 80 or 100 words.

Why trails pass 0, not about 450: the wire trail image (`img`) has no licence field, and licensed photography binds, so every trail fails the photo test (the page floor already did this before T1076). With every other test passing and the photo test ignored, 427 trails would pass (`bar_headroom.trail.okIfPhotoLicensed`), which matches the research's about 450. Other trail tests failing: prose of 60 words 17,019 (the generated hook and reasons are short), a destination page linking to it 6,798, climb 593, difficulty 215, season 215.

Sitemap types today: site 2, countries (hubs) 1,040, destinations 337, costs 3,243, cycling 16, beaches 2,658, lakes 1,628, mountains 723, trips 4,234, journeys 253. No trails file is written while no trail is indexable.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A scripted edit of `build.mjs` found no match | The scripts are CRLF in a worktree with `core.autocrlf=true`; `grep` for a carriage return in Git Bash reports 0 | Edit by reading bytes and normalising line endings, then writing the original endings back |
| First test run failed one assertion | The test's synthetic short intro was the first 30 words of the body, so the "counted once" rule fired | Distinct words for the short intro in the fixture |

## Screens checked

No dev server, per the brief. The end check must look at these URLs once deployed to the preview branch (view source, not rendered):

- A passing place, e.g. `/albania/himara`: canonical, no robots tag, JSON-LD has TouristDestination and BreadcrumbList.
- A thin place, e.g. `/albania/apollonia-fier`: `<meta name="robots" content="noindex,follow">` and response header `x-robots-tag: noindex, follow`.
- A trail page (any): `noindex,follow`, JSON-LD TouristAttraction and BreadcrumbList.
- A country hub, e.g. `/albania`, and a section list: indexable, in `sitemap-countries-en.xml`.
- `/sitemap.xml` (index) and `/sitemap-destinations-en.xml` (337 URLs); `/sitemap-trails-en.xml` should return the app shell 404.
- The app shell at phone and desktop width is untouched by this task (the fast build passed).

Verified locally on the scratch output: the thin and good place pages, a trail page, the sitemap index and the 337-URL destinations file.

## What is still open

- Owner: Search Console property, sitemap submission, weekly review and the 30 percent pause rule, in `Execution/P15/_OPEN-search-console.md`.
- Owner decision: the place intro threshold. At 120 words 337 places are indexable; the 3,224 that clear every other test would be indexable at a lower threshold. Better data (D7) is the principled route.
- Trail photo licence: the wire needs a licence on `img` before any trail can pass; 427 are ready behind it.
- Trail prose: 17,019 of 17,619 trails have fewer than 60 words of page text; a longer generated or sourced summary would lift them.
- Beach, lake, mountain, cycling and cost pages keep the page floor only; the research bar (60 words, monthly data, a parent place) needs monthly fields the wire does not carry.
- Trips are not yet deduplicated to a representative trip with a canonical (research item); trips stay indexable.
- hreflang and the English-only sitemap names are unchanged.

## Rollback procedure

`git revert` the T1076 commit. Nothing was deployed, no data was written, and no wire key or schema changed.

## Register rows to add

| T1076-a | T1076 | Owner steps for Search Console: verify the domain property, submit /sitemap.xml, start the weekly review and the 30 percent pause rule (Execution/P15/_OPEN-search-console.md) | user | open |  |
| T1076-b | T1076 | Only 337 of 3,868 places clear the 120 word intro and the rest of the bar (research expected about 1,800); decide the threshold or lift intros through D7 | user | open |  |
| T1076-c | T1076 | No trail is indexable because the wire image has no licence; 427 would pass once img carries a licence (D7, D9) | next task | open |  |
| T1076-d | T1076 | 17,019 of 17,619 trails have under 60 words of page prose and 6,798 are not linked from any place page; both lift trails over the bar | next task | open |  |
| T1076-e | T1076 | Beach, lake, mountain, cycling and trip pages keep the page floor only; add the research bar (monthly data, parent place) and the near-duplicate trip canonical | next task | open |  |
| T1076-f | T1076 | Deploy check: after the next prerender upload, confirm the thin place and trail show noindex,follow in the head and the x-robots-tag header and that sitemap-destinations has 337 URLs | user | open |  |
