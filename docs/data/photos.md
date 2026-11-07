# Photos: sourcing, licences, heroes, dimensions, credits

Written by T1085 (ROADMAP B2) from the code, not from `archive/docs-2026-11/PHOTOS.md` (distrusted; used for structure only). Every number below names the constant behind it. Rules in prose and screens are in the handbook sections [Licensed photo sources and credits](../HANDBOOK.md#licensed-photo-sources-and-credits), [Hero image choice](../HANDBOOK.md#hero-image-choice) and [Image ladder (sized copies)](../HANDBOOK.md#image-ladder-sized-copies); this file is the data view.

## 1. Where photos come from

| Source | Code | Constants | Used for |
|---|---|---|---|
| Wikipedia lead image | `pipeline/harvest_images.py` (task `images`) | `THUMB_PX = 900`, cache `cache/wiki_images.json` | Destination hero (`dest.image`) |
| Wikidata P18 plus view properties | `pipeline/photos/wikidata_views.py` | `VIEW_PROPS`: P18, P4640 panorama, P8592 aerial, P5252 winter (`ONLY_FOR`: mountains), P3451 night | Layer galleries (beaches, lakes, mountains) |
| Commons category walk and geosearch | `pipeline/photos/commons.py` | `CAT_DEPTH = 2`, `MAX_SUBCATS = 40`, `GEOSEARCH_RADIUS_MAX = 10000`, `GEOSEARCH_LIMIT = 500`, `MAXLAG = 5` | Layer galleries; only adds candidates, the gates judge them |
| Commons geosearch and Wikipedia name match for POIs | `pipeline/enrich_images_commons.py`, `pipeline/enrich_images_web.py` (task `poi_images`), `pipeline/harvest_pois_wikidata_images.py` (task `poi_images_wikidata`) | `GEO_RADIUS_M = 250`, `TIGHT_M = 60`, `MATCH_M = 120.0`, `THUMB_PX = 640` | POI thumbnails (`items_full[].img`) |
| Geograph (GB, IE) | `pipeline/photos/geograph.py`, `pipeline/photos/geograph_fill.py` | `MAX_DISTANCE_KM = 20`, `PER_PAGE = 100`, key env `CARTA_GEOGRAPH_KEY`; fill: `RADIUS_KM = 2.0`, `COUNTRIES = ("GB", "IE", "IM", "JE", "GG")`, `LICENCE = "CC BY-SA 2.0"` | Thin gallery rows in the British Isles |
| Mapillary | `pipeline/photos/mapillary.py` | `BBOX_DEG = 0.005`, token env `CARTA_MAPILLARY_TOKEN` | Only rows that would otherwise have zero images; evidence tier `street` |
| Pexels clips | `continent-app/src/lib/homeDemo.js` | `pexels()` helper, licence string `Pexels License` | The home film only, five clips (not photographs) |

Refused on purpose: Flickr (named in the handbook as refused for its delete-on-request terms; no Flickr code exists in `pipeline/photos/`). Not set up on this checkout: the Geograph key, the Geograph dump ingest and the Mapillary token (handbook "Limits"; `geograph.py` and `mapillary.py` return nothing without them). Mapillary data is not on any wire yet (`docs/tos/data_licenses.md` row "Mapillary").

The ledger of sources and licences is [../tos/data_licenses.md](../tos/data_licenses.md), generated from `src/ingestion/core/registry.py`. The traveller-facing credit list is `continent-app/src/data/attribution.js` (rows for Wikimedia Commons, Geograph, "Carta image copies" and Mapillary).

## 2. Licence gates

1. Harvest gate for POIs: `pipeline/harvest_image_licenses.py` reads Commons `extmetadata` (batches of `TITLES_PER_REQ = 50`) into `cache/poi_image_licenses.json`. `_BAD_LICENSE_RE` marks NC, ND, "by permission" and "permission only" as `ok: false`.
2. Copy gate: `pipeline/photos/derive.py` `NOT_STORABLE` refuses NC, non-commercial, ND, no-deriv, fair use, non-free and all rights reserved before any file is stored on R2. Empty licences are refused too (module docstring, T010).
3. Credit gate: `pipeline/photos/credit.py` `owes_credit()` is true when a record owes an author and has none. The layer exports and `derive.py` both drop such a photo, so a photo that owes a credit Carta cannot print never ships. It returns by itself when the name turns up.
4. Takedown gate: `pipeline/photos/takedown.py` `is_taken_down()` is consulted by the layers' image passes and by `derive.py`; the ledger is `cache/photos/takedowns.json` (un-ignored in `.gitignore`; the file does not exist in this checkout until the first takedown, and `load_ledger()` then returns no rows).
5. Passing licences: CC BY, CC BY-SA, CC0, public domain. `credit.py` `NO_CREDIT_LIC` (public domain, PD, CC0, "no restrictions") and Commons `AttributionRequired=false` mean no credit is owed.
6. Image dimensions floor for destination images: `pipeline/images/checks.py` `SPECS` (for example `min_w` 800 and `min_h` 450 for destinations).

## 3. Choosing the hero

Per row (beach, lake, peak, trail, place), `pipeline/photos/selection.py` `photo_rank_v1`:

- `WEIGHTS`: aesthetic 0.45, Commons assessment 0.20, NIMA 0.15, technical 0.10, season fit 0.10. Missing parts drop out and the rest renormalise (`beauty()`).
- `ASSESSMENT_VALUE`: Featured picture or Picture of the Year 1.0, Quality image 0.75, Valued image 0.6.
- `P18_BONUS = 0.10`; `GALLERY_MAX = 5` photos behind the hero; `NEAR_TIE = 0.05` sends close calls to the review queue (`pipeline/photos/review.py`, binds 127.0.0.1).
- Eligibility comes before beauty: `relevance.py` `HERO_TIERS = ("p18", "title", "viewcat", "category", "name")`; `NEVER_HERO = ("geo", "street")`. A row with nothing publishable shows the generated map card (`{"k": "no_photo_map_card"}`).
- Gates ahead of ranking: `technical.py` `HERO_MIN_EDGE = 800`, `GALLERY_MIN_EDGE = 500`, `BLUR_REJECT_BELOW = 25.0` at `BLUR_PROBE_W = 256`; `relevance.py` CLIP veto at `MARGIN = 0.02` (can veto, never admit; P18 exempt); `dedupe.py` `PHASH_SAME = 6`, `COSINE_SAME = 0.93`.
- Models: `aesthetics.py` `CLIP_ARCH = "ViT-L-14-quickgelu"`, `CLIP_PRETRAIN = "openai"`, `EMB_DIM = 768`, aesthetic head scaled `AESTHETIC_LO = 3.0` to `AESTHETIC_HI = 7.5`. Embeddings are cached in `cache/photos/emb`. The NIMA checkpoint is optional and its weight drops out without it. `season.py` `CONDITION_ENABLED = False` (overcast probe off).

Destination heroes (Wikipedia lead image) use a separate gate: `pipeline/audit/audit_hero_images.py` (task `hero_audit`, monthly) rejects maps, emblems and the like (`BAD_PATTERNS`), checks `HERO_FRAME_AR = 12 / 5` and flags narrow images (`NARROW_AR`). Its report is `data/reports/hero_images_audit.json` and its Commons metadata cache is `cache/hero_image_meta.json`. In the app `continent-app/src/lib/heroImage.js` `duplicateHeroes()` withholds one photo shared by two places within `SAME_PLACE_KM = 30`; `pipeline/audit/audit_hero_images.py` has a `SAME_PLACE_KM = 30.0` of its own.

## 4. Dimensions and sizes

- Wire dimensions: `pipeline/apply_image_dims.py` writes `image.w` and `image.h` on each destination hero, from `cache/hero_image_meta.json` first and from the Commons API (`BATCH = 50`) for the rest. It also rewrites `Special:FilePath` URLs, which the CSP would block.
- Frames the heroes must fill (mirrors of `continent-app/src/styles.css`, held in `pipeline/images/checks.py` `SPECS`): destination card 12/5, country cover 2.6/1, trail card 9/4, beach/lake/peak card 25/12, trip card 30/11, explore card 3/2 with 16/9.6 mobile and 4/3 desktop in the CSS. `REFERENCE_AR = 1.5`; fit bars `FIT_WEAK = 0.62`, `FIT_BAD = 0.55`.
- Live path today: hotlinked Wikimedia thumbnails. `continent-app/src/lib/heroImage.js` `WIKI_WIDTHS = [250, 330, 500, 960, 1280, 1920]` (the same list as `pipeline/images/checks.py`); any other width answers 400. `srcSetFor(url, max = 960)`.
- Own copies ("ladder", `LADDER_V = "ladder_v1"`): `derive.py` `LADDER` is AVIF at 320, 640 and 1280 plus WebP at 320 and 640. Source fetched at `SOURCE_WIDTH = 1920`, never upscaled, sRGB, metadata stripped. `AVIF_Q = 50`, `AVIF_EFFORT = 4`, `WEBP_Q = 75`, `WEBP_EFFORT = 4`. Address: `img/{ab}/{cd}/{sha1}/{w}.{fmt}` where sha1 is of the canonical title (`File:<Name>` or `geograph:<id>`). Cache-Control `IMMUTABLE = "public, max-age=31536000, immutable"`; manifests `MANIFEST_CACHE = "public, max-age=300"`. `CDN_BASE = "https://cdn.carta-europetravel.com"`, bucket `CARTA_R2_BUCKET` (default `carta`).
- Manifest: `img/manifest/<layer>.json`, schema `carta.img-manifest.v1`. `pipeline/photos/wire_ladder.py` joins `ih` (sha1), `d` (real pixel size of the three AVIF rungs) and, on the hero only, `ph` (24 character placeholder, `PH_LEN = 24`, `GRID = (3, 2)`) into a wire row at export. With no manifest the export writes the bytes it wrote before.
- Status: the ladder is built but not live (handbook "Image ladder", register rows T049-a to T049-d, T052-a, T052-d). Production beach, lake and mountain pages are the only surfaces that can use it, behind `continent-app/src/lib/pictureFlag.js` (`PICTURE_LAYERS`), off when unset.
- Heavy runs: `infra/hetzner/jobs/image_transcode.sh` (job `image_transcode` in `infra/hetzner/jobs/jobs.tsv`) and `infra/hetzner/jobs/clip_sweep.sh` run on the on-demand CAX41. The weekly task `photo_sources` (`run_pipeline.py`) pushes the published-first source lists to `img/manifest/_sources` with `--upload auto`.

## 5. Where credit is shown

- Layer galleries (beaches, lakes, mountains, trails): author and licence ride in each wire image record (`by`, `lic`, `licUrl`, `page`). Text under the photo uses strings such as `destx.photoCredit` and `region.photoBy` in `continent-app/src/i18n/en.js` ("Photo: {credit}").
- POI thumbnails: `pipeline/photos/export_poi_credits.py` writes `continent-app/public/poi_credits.json` (`{"v": 1, "files": {filename: [author, licence]}}`) from `cache/poi_image_licenses.json`; files with `ok: false` are left out.
- Resolver: `continent-app/src/lib/imageCredit.js` handles `upload.wikimedia.org` (credit from the sidecar, page link from the filename), `geograph.org.uk` (page `geograph.org.uk/photo/<id>`) and own copies on the CDN host (credit from the layer manifest only). No manifest means no credit and no guess.
- Credit text: `credit.py` picks `Attribution`, then `Artist`, then `Credit`, strips HTML, caps at `MAX_LEN = 120`; `fill_authors.py` repairs old rows.
- Home film: Pexels clips, credit kept in `continent-app/src/lib/homeDemo.js`, none shown (licence needs none).
- Known gaps (handbook): day-plan photo strips show a place name but no credit; the no-attribution waiver does not reach the wire.

## 6. Takedown

Command: `python pipeline/photos/takedown.py add "<File title>" --reason "..."`. Other verbs: `scrub`, `reach`, `list`. `--dry-run` prints every command and changes nothing.

Parts, in order of effect:

- Wire scrub of `WIRE_DIRS` under `continent-app/public`, no rebuild needed.
- `rclone purge` of the five ladder objects for the title.
- Cloudflare `purge_cache` for the five CDN URLs (needs `CLOUDFLARE_API_TOKEN` and the account id).
- Rewrite of every layer manifest that names the title.
- Ledger row in `cache/photos/takedowns.json`, whose `r2`, `edge` and `manifest` fields record `ok`, `failed: <reason>` or `skipped: no credential`.

The scrub runs first and is never rolled back by a later failure. `derive.py` refuses to run if the ledger has fewer rows than an earlier manifest recorded.

## 7. Checks

- Python: `pipeline/photos/verify_credit.py`, `verify_derive.py`, `verify_takedown.py`, `verify_attribution_cdn.py`; `tests/test_trail_photo_credit.py`.
- Weekly task `image_audit`: `pipeline/images/audit_all.py`, report `data/reports/image_audit.json`.
- App: `continent-app/scripts/verify_hero_images.mjs`, `continent-app/scripts/verify_photo_contract.mjs`, `continent-app/scripts/verify_photo_exif.mjs`.

## 8. What does not exist or is not verified

- No run of `derive.py` against the live bucket is verified here; CDN host liveness is an owner row (T049-a to T049-d).
- The labelled evaluation set `pipeline/photos/evalset.py` is mostly unlabelled (handbook: 29 of about 800 rows).
- Per-photo caches (`cache/photos`) are not in git; their R2 archive classes are in `pipeline/archive/manifest.yml` (see [../runbooks/backup.md](../runbooks/backup.md)).
