# Source research: IMAGES for curated features

Category: images for every curated feature (a specific beach, a specific
peak, a trailhead, a city day), not a borrowed town photo.

Researched 2026-08-17. Every licence claim below carries a URL. Claims I
could not confirm against live terms text are marked UNVERIFIED and say what
is missing. Live API behaviour marked VERIFIED LIVE was tested with real
requests during this research, and the exact call is given so it can be
re-run.

Conventions follow `docs/tos/data_licenses.md`: a source that ships must add
a row to that ledger, and any row with a required user-facing credit must
also get an entry in `continent-app/src/data/attribution.js`.

---

## 1. What the repo already does

Four harvesters, in the order they run, plus one licence pass.

| Script | Scope | Method | Output field |
|---|---|---|---|
| `pipeline/harvest_images.py` | destination (city) hero | en.wikipedia action API `prop=pageimages` on the exact city title, then REST `page/summary`, then `generator=search`; 39 hand-written `TITLE_OVERRIDES` | `dest.image` (url, hires, credit, page, source) |
| `pipeline/enrich_images_commons.py` | POI, first pass | Commons `list=geosearch` 250 m, namespace 6, junk-filename regex, accept on token overlap OR within 60 m | `items_full[].img` (Special:FilePath thumb) |
| `pipeline/enrich_images_web.py` | POI, second pass | exact `wiki` link lead image, then local-language Wikipedia `generator=geosearch` (6 km nature, 800 m built), distinctive-token gate with a 120-word GENERIC blocklist | `items_full[].img` (upload.wikimedia.org thumb) |
| `pipeline/harvest_image_licenses.py` | POI, compliance | Commons `prop=imageinfo&iiprop=extmetadata`, 50 titles per request, gates NC / ND / "by permission" | `cache/poi_image_licenses.json` |
| `pipeline/trails/compose_citytrips.py` | citytrip stops | per-file licence, author and description URL resolved before staging, NC/ND dropped | lab `images` table |

What is good already: the token-plus-distance gate in `enrich_images_web.py`
is genuinely the right shape (a match must hinge on a distinctive proper
noun, not on "church" or "Madrid"), the NC/ND gate exists, and the trails lab
already stores per-file TASL.

Three gaps this research targets:

1. **Nothing resolves an image from a QID.** Both POI passes are
   coordinate-first. The repo already harvests QIDs
   (`harvest_poi_wikidata.py`, `harvest_pois_wikidata_images.py`), so the
   strongest available binding between a feature and a photo is unused.
2. **No beauty signal at all.** `pick()` scores `overlap * 100 - dist`.
   A blurry 2007 compact-camera snapshot 20 m from the peak beats a Commons
   Featured Picture 400 m away.
3. **Per-file credit is still MISSING** in the ledger's own follow-up list
   (item 1). The data is harvested; nothing renders it.

---

## 2. Sources assessed

### 2.1 Wikidata image properties (P18, P948, P3451, P8592, P373)

- URL: https://www.wikidata.org/wiki/Property:P18 ,
  https://www.wikidata.org/wiki/Property:P948
- What it gives: an editorially chosen image filename per entity. P18 is the
  main image, P948 the Wikivoyage-style page banner, P3451 the nighttime
  view, P8592 the aerial view, P373 the Commons category name.
- Licence: Wikidata statements are **CC0 1.0**
  (https://www.wikidata.org/wiki/Wikidata:Licensing). The *file* the
  statement points at is licensed separately, per file on Commons.
- Access: action API `wbgetentities`, up to 50 QIDs per request, no key.
  Bulk via the Wikidata Query Service SPARQL endpoint
  (https://query.wikidata.org/sparql).
- Per-feature coordinates: yes, P625 on the same entity.
- Harvesting allowed: yes. CC0 data, public API, standard UA policy applies
  (https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy).
- **VERIFIED LIVE.** One call returned every image property for three QIDs:

      https://www.wikidata.org/w/api.php?action=wbgetentities&format=json
        &ids=Q243|Q41225|Q193369&props=claims

  Q243 (Eiffel Tower): P18 `Tour Eiffel Wikimedia Commons.jpg`, P948
  `Eiffel Tower Paris banner.jpg`, P373 `Eiffel Tower`, P3451 a night shot,
  P8592 an aerial. Q193369 (Prague Castle) and Q41225 (Elizabeth Tower) the
  same shape.

- **Measured coverage, and this is the catch.** Two SPARQL counts against
  the live endpoint:

  | Class | Total | with P18 | with P373 | with P625 |
  |---|---|---|---|---|
  | Beaches (Q40080) in Portugal | 414 | 256 (62%) | n/a | n/a |
  | Mountains (Q8502) in Switzerland | 7937 | 1727 (22%) | 2044 (26%) | 7932 (99.9%) |

  P18 is excellent for famous named features and collapses on the long tail.
  Coordinates are near-universal. Any chain that stops at P18 leaves roughly
  four in five Swiss peaks with no photo.

- Verdict: **use** (primary key of the chain).

### 2.2 Wikimedia Commons, structured-data depicts search (P180 via CirrusSearch)

- URL: https://commons.wikimedia.org/wiki/Commons:Depicts ,
  https://commons.wikimedia.org/wiki/Help:Search
- What it gives: every Commons file carrying a `depicts` statement for a
  given QID. This is the single most valuable finding of this research: it
  resolves candidate photos **from a QID alone**, with no coordinate guess
  and no filename string matching.
- Syntax: `haswbstatement:P180=Q243` as `srsearch` / `gsrsearch`,
  `srnamespace=6`.
- Licence: per file (CC0, CC BY, CC BY-SA, public domain and kin). The
  search index itself is Wikimedia infrastructure, no separate licence.
- Access: action API, no key.
- Per-feature coordinates: not from the search itself, but `iiprop=extmetadata`
  returns GPSLatitude / GPSLongitude for geotagged files
  (https://www.mediawiki.org/wiki/Extension:CommonsMetadata).
- Harvesting allowed: yes, under the UA policy and API etiquette
  (https://www.mediawiki.org/wiki/API:Etiquette): serial requests, batch with
  pipes and generators.
- **VERIFIED LIVE.** A single call returns candidates plus licence plus
  assessment plus a hotlinkable 640 px thumbnail:

      https://commons.wikimedia.org/w/api.php?action=query&format=json
        &generator=search&gsrsearch=haswbstatement:P180=Q243
        &gsrnamespace=6&gsrlimit=3
        &prop=imageinfo&iiprop=extmetadata|url|size&iiurlwidth=640
        &iiextmetadatafilter=LicenseShortName|Artist|Assessments|Restrictions

  Q243 returned `Assessments: quality|featured|valued|potd|poty`,
  `LicenseShortName: CC BY 2.5`, `Artist: Diliff`, 1900x1871, thumb URL, all
  in one response.

- Verdict: **use** (the discovery step).

### 2.3 Wikimedia Commons assessment flags as a beauty signal

- URL: https://www.mediawiki.org/wiki/Extension:CommonsMetadata
- What it gives: `extmetadata.Assessments`, a pipe-separated list from five
  values: `featured`, `quality`, `valued`, `potd` (picture of the day),
  `poty` (picture of the year). These are community peer-review outcomes:
  Quality Image is a technical-quality review, Featured Picture is a much
  harder aesthetic review, Valued Image is "the most valuable illustration
  of its subject".
- Licence: metadata about CC0/CC files, no separate licence.
- Access: same `iiprop=extmetadata` call as the licence pass the repo
  already runs, so this is **free to add**: `harvest_image_licenses.py`
  already batches 50 titles per request against exactly this endpoint and
  only needs `Assessments` added to `iiextmetadatafilter`.
- Per-feature coordinates: yes via GPSLatitude / GPSLongitude in the same
  payload.
- Harvesting allowed: yes.
- **VERIFIED LIVE, and the funnel is dramatic.** For Q243:

  | Query | Hits |
  |---|---|
  | `haswbstatement:P180=Q243` | 9400 |
  | plus `incategory:"Quality images"` | 148 |
  | plus `incategory:"Featured pictures on Wikimedia Commons"` | 22 |

  9400 candidates down to 22 peer-reviewed photographs, in two extra query
  terms. Cross-checked against `prop=categories` on two of the hits: the
  `Assessments` field and the actual category membership agree.

- Caveat, VERIFIED LIVE: `incategory` does **not** recurse.
  `incategory:"Quality images of France"` returned 0 hits for Q243 because
  that is a separate branch of the taxonomy. Files carry the flat
  `Category:Quality images` and
  `Category:Featured pictures on Wikimedia Commons` directly, so filter on
  those two exact strings, or better, read `Assessments` per file.
- Verdict: **use** (the ranking step).

### 2.4 Wikimedia Commons geosearch

- URL: https://www.mediawiki.org/wiki/Extension:GeoData
- What it gives: geotagged File: pages near a coordinate. Already the repo's
  first POI pass.
- Licence: per file.
- Access: `list=geosearch` / `generator=geosearch`, no key. Max radius 10000 m
  (`$wgMaxGeoSearchRadius`), max `gslimit` 500 (5000 for bots), default 10.
  The repo's 6000 m nature radius is inside the limit.
- Per-feature coordinates: yes, that is the whole point, and `dist` comes
  back per hit.
- Harvesting allowed: yes.
- **VERIFIED LIVE, and it shows exactly why geosearch alone is not enough.**
  200 m around Sagrada Familia returned, in order: an interior pillar
  panorama, a second interior panorama, a facade shot, and two 1900s archive
  photographs of altar boys inside the church. One usable exterior photo out
  of five, and no signal in the payload distinguishing them.
- Verdict: **use**, but only as a late fallback, never as the primary.

### 2.5 Wikipedia pageimages and REST summary

- URL: https://www.mediawiki.org/wiki/Extension:PageImages ,
  https://en.wikipedia.org/api/rest_v1/
- What it gives: the lead image of an article. This is the repo's city hero
  source and it is correct for that job: a city article's lead image is a
  curated skyline.
- Licence: article text CC BY-SA 4.0, images per file on Commons.
- Access: action API and REST, no key.
- Per-feature coordinates: no (article coordinates yes, image coordinates no).
- Harvesting allowed: yes.
- Verdict: **use** for city-level heroes only. For a specific beach or peak
  it degrades into "the nearest article's lead photo", which is the borrowed
  photo failure mode this brief exists to eliminate.

### 2.6 Wikivoyage banners (P948)

- URL: https://www.wikidata.org/wiki/Property:P948
- What it gives: the banner image at the top of a Wikivoyage destination
  article. Editorially chosen, so a real "money shot" signal.
- Licence: per file on Commons (CC BY-SA 3.0 on the samples checked).
- Access: Wikidata P948, or the `{{pagebanner}}` template on the Wikivoyage
  article.
- Per-feature coordinates: no.
- Harvesting allowed: yes.
- **VERIFIED LIVE, two hard problems.**
  1. Banners are ultrawide crops. `Eiffel Tower Paris banner.jpg` is
     2100x300, ratio **7.0**. Useless in a square or 4:3 card. Some P948
     values are ordinary panoramas (`Prazsky hrad karluv most panorama.jpg`
     is 7653x1557, ratio 4.9), so the ratio has to be checked per file, not
     assumed.
  2. Wikivoyage `pageimages` is a trap. Asking en.wikivoyage.org for the
     lead image of "Prague" returns `Prague_districts_en_wv.jpg`, a
     **district map**, 4077x3052. Never route Wikivoyage through
     `prop=pageimages`; go through P948 or the template.
- Verdict: **maybe**, for wide header strips only, and only after an aspect
  ratio check. Not a card image source.

### 2.7 OpenStreetMap image tags via Overpass

- URL: https://wiki.openstreetmap.org/wiki/Key:wikimedia_commons
- What it gives: `wikimedia_commons=File:...` or `=Category:...` mapped
  directly onto the OSM object. Also `image=*`, `mapillary=*`, `panoramax=*`,
  `wikidata=*`. For a trailhead, a viewpoint or a beach that has no Wikidata
  entity, this is often the only per-feature image pointer that exists.
- Licence: the tag is ODbL 1.0 (the pointer is database content). The file
  it points at is per-file Commons.
- Access: Overpass, which the repo already calls
  (`harvest_protected_areas_osm.py`, live `cityResearch.js`).
- Per-feature coordinates: yes, inherently.
- Harvesting allowed: yes, ODbL, credit "© OpenStreetMap contributors", and
  the ledger's open item 2 (share-alike review of the OSM-derived slice of
  `app_data.json`) already covers the derived-database question.
- Note: `wikimedia_commons=Category:X` needs one extra
  `generator=categorymembers` hop to become files. `image=*` points at
  arbitrary third-party hosts with unknown licences, so treat `image=*` as a
  lead for manual review, never as a harvestable URL.
- Verdict: **use** (the no-QID fallback).

### 2.8 Geograph Britain and Ireland

- URL: https://www.geograph.org.uk/ , API https://www.geograph.org.uk/help/api ,
  dumps https://data.geograph.org.uk/dumps/
- What it gives: 8,348,193 photographs from 14,177 contributors covering
  283,607 grid squares, 85.4% of all 1 km squares of Great Britain and
  Ireland, each photograph deliberately chosen to illustrate a typical or
  significant feature of its square.
- Licence: **CC BY-SA 2.0**
  (https://creativecommons.org/licenses/by-sa/2.0/). Reuse requires the
  photographer's credit displayed alongside the image, an explicit statement
  that the image is Creative Commons licensed, and share-alike on adaptations.
- Access: syndicator feed, `api/photo/`, `api/Gridref/`, CSV export, and
  BitTorrent database dumps. An API key is required (free, requested at
  /admin/apikey.php). Searches reach only the first 1000 matches; bulk needs
  the dumps.
- Per-feature coordinates: **yes**, decimal lat/lon plus eastings/northings
  plus a precision field, and search accepts a lat/lon with a radius (default
  10 km, max 20 km).
- Harvesting allowed: yes for the dumps; the feeds are explicitly "not for
  bulk download", and there is a form for bespoke bulk image datasets.
- Coverage of the 43 countries: **GB and IE only** (Channel Islands run on a
  sibling site, geograph.org.gg). That is 2 of 43, but it is the densest
  per-coordinate free photo layer in Europe and it fills exactly the gap
  Commons leaves in rural Britain and Ireland.
- Verdict: **use**, GB and IE only.

### 2.9 Panoramax

- URL: https://panoramax.fr/ , docs https://docs.panoramax.fr/ ,
  API https://api.panoramax.xyz/api
- What it gives: open street-level imagery, started 2022 by IGN (French
  national mapping agency) and OpenStreetMap France, federated across
  instances.
- Licence: per picture, either **CC BY-SA 4.0** or the French **Licence
  Ouverte / Open Licence 2.0 (Etalab)**. Derived data may be released under
  LO 2.0, CC BY 4.0 or ODbL 1.0.
- Access: **STAC API, no auth, no key**.
- Per-feature coordinates: yes, every picture is a point feature.
- Harvesting allowed: yes, open licences, open API.
- **VERIFIED LIVE.** `GET https://api.panoramax.xyz/api/search?bbox=2.29,48.85,2.30,48.86&limit=2`
  returned GeoJSON features each with a `rel="license"` link naming the exact
  licence (`etalab-2.0` on the sample) and a point geometry.
- Reality check: this is dashcam and cycle-helmet imagery. It answers "what
  does this trailhead look like when I arrive", not "is this beautiful".
  Coverage is heavily France-weighted.
- Verdict: **maybe**, as a utility image for trailheads and access points
  only, clearly labelled, never as a hero.

### 2.10 Mapillary

- URL: https://www.mapillary.com/terms ,
  https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data
- Licence: user content under **CC BY-SA** by default.
- Attribution: mandatory and specific. Section 11: if you download individual
  images and serve them from your own servers, "you must attribute the
  image(s) by visibly displaying the Mapillary logo and linking back".
- Access: API with a registered `client_id`; Mapillary reserves the right to
  "throttle usage, revoke client_ids".
- Per-feature coordinates: yes.
- Harvesting allowed: **no, not by default.** Section 5(a) prohibits using
  "any data mining, robots or similar data gathering or extraction methods
  not approved by Mapillary designed to scrape or extract data". Commercial
  use is separately scoped in section 12 and in
  https://www.mapillary.com/commercialterms.
- Verdict: **reject** for a harvest pipeline. The CC BY-SA licence on the
  photo does not override the platform contract that governs how you obtain
  it, and "not approved by Mapillary" is exactly what an unannounced bulk
  pull is. Panoramax gives the same class of imagery with no such clause.

### 2.11 Flickr API

- URL: https://www.flickr.com/services/api/tos/
- What it gives: an enormous pool of CC-licensed, often geotagged travel
  photography, searchable by licence and bounding box.
- Licence: per photo (CC BY, CC BY-SA, CC0, and NC/ND variants).
- Harvesting allowed: **no.** The API Terms forbid you to "cache or store
  any Flickr user photos other than for reasonable periods in order to
  provide the service you are providing to Flickr users", require removal of
  any photo within 24 hours of the owner asking, cap display at 30 Flickr
  photos per page, and require explicit approval for commercial applications
  (apply at https://flickr.com/services/api/keys/apply/). SmugMug reserves
  the right to charge for high-volume use. A required notice reads "This
  product uses the Flickr API but is not endorsed or certified by SmugMug,
  Inc."
- Carta charges for plans and carries affiliate links, so it is a commercial
  application by the terms' own examples.
- Verdict: **reject** as a pipeline source. Revisit only with an approved
  commercial key, and even then the no-persistent-cache clause makes a
  static wire format non-compliant.

### 2.12 Unsplash API

- URL: https://unsplash.com/api-terms , https://unsplash.com/license ,
  https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines
- Licence: the Unsplash License grants an "irrevocable, nonexclusive,
  worldwide copyright license to download, copy, modify, distribute, perform,
  and use images from Unsplash for free, including for commercial purposes,
  without permission". Attribution is not required by the licence.
- But the API adds hard obligations: you must "directly use or embed the
  related image URLs returned by the API" (hotlink, do not rehost), you must
  ping `photo.links.download_location` on each use, you must credit Unsplash
  plus the photographer with a profile link and `?utm_source=...&utm_medium=referral`,
  and you may not "replicate a core user experience" of Unsplash.
- The licence itself excludes "the right to compile images from Unsplash to
  replicate a similar or competing service". A per-feature photo library
  assembled by keyword sits uncomfortably close to that line.
- Per-feature coordinates: **no**. Unsplash has no reliable geotagging.
  A search for a named beach returns photogenic beaches, not that beach.
- Verdict: **reject** for curated-feature imagery. It cannot satisfy the core
  requirement (this photo is of this feature), and the failure mode is a
  beautiful, confident, wrong photo, which is worse than none.

### 2.13 Pexels API

- URL: https://www.pexels.com/api/documentation/ , https://www.pexels.com/license/
- Licence: free for commercial and non-commercial use; attribution requested
  not required by the content licence, but the API guidelines require
  prominent "Photos provided by Pexels" links per request plus photographer
  credit where possible.
- Access: 200 requests per hour, 20,000 per month by default, higher on request.
- Per-feature coordinates: **no**.
- Harvesting allowed: for content, broadly yes; the guidelines forbid copying
  or replicating core Pexels functionality and forbid working around the rate
  limit. Caching is not addressed in the guidelines (UNVERIFIED against the
  separate site terms).
- Verdict: **reject** for the same reason as Unsplash: keyword search cannot
  prove the photo is of the feature.

### 2.14 Openverse

- URL: https://openverse.org , https://docs.openverse.org/terms_of_service.html ,
  https://docs.openverse.org/api/reference/authentication_and_throttling.html
- What it gives: an aggregated index of CC-licensed media across Flickr,
  Wikimedia, Nappy, and others, with a ready-made attribution string per
  result.
- Licence: per result. Openverse itself is a WordPress Foundation project.
- Harvesting allowed: **partly no.** The ToS states "You must not scrape the
  content in the Openverse catalog" and "You must not use multiple machines
  to circumvent rate limits". It also reserves the right to charge for
  commercial or heavy use, and requires apps to "prominently indicate that it
  was made using Openverse but is not endorsed or certified by Openverse".
- Critical disclaimer: Openverse "does not verify its licensing status or
  make any representations or warranties about the content or data
  whatsoever. You are responsible for independently verifying whether you
  have the right to use the content."
- **VERIFIED LIVE.** An anonymous request returned these headers:
  `x-ratelimit-limit-anon_burst: 20/min`,
  `x-ratelimit-limit-anon_sustained: 200/day`. Two hundred requests a day
  against a 24.8k-feature catalogue is not a pipeline.
- Per-feature coordinates: **no**. The result schema is
  `attribution, category, creator, creator_url, detail_url, fields_matched,
  filesize, filetype, foreign_landing_url, height, id, indexed_on, license,
  license_url, license_version, mature, provider, related_url, source, tags,
  thumbnail, title, unstable__sensitivity, url, width`. No latitude, no
  longitude.
- Also verified: a query for "Praia da Marinha" returned a `by-nc-nd 2.0`
  Flickr result in the top three, so the NC/ND gate would have to run on
  every result anyway.
- Verdict: **reject** as a pipeline. Useful as a manual lookup tool for a
  human curator filling a specific hole.

### 2.15 National tourism board media libraries

Checked three, and the pattern is consistent: registration-gated, no API, no
coordinates, and a licence scoped to destination promotion rather than to a
commercial product.

- **VisitScotland Asset Library**
  (https://www.visitscotland.org/news/2025/scotlands-new-visual-library ,
  toolkit https://toolkit.visitscotland.org/faq): "All materials are
  intended solely for destination promotion and may not be used for
  commercial gain." Attribution required from a credit field, licence runs 36
  months from download. **Reject:** Carta sells plans and carries affiliate
  links.
- **Visit Estonia / Brand Estonia Toolbox**
  (https://visitestonia.com/en/traveltrade/estonia-photo-gallery ,
  https://www.visitestonia.com/en/forthetrade/news/photos-with-commercial-rights):
  "The usage is free but when you do, naming the author and reference to
  Visit Estonia is compulsory. Photos cannot be used in paid advertising,
  except for the ones listed in 'commercial use' section." A separate
  standard-plus-tourism licence exists for trade use. **Reject** for the
  general pool; the commercial subset would need a per-photo licence
  acceptance and there is no API.
- **Ireland's Content Pool / Northern Ireland's Content Pool**
  (https://www.irelandscontentpool.com/C.aspx?VP3=CMS3&VF=TermsAndConditionsv2_VForm):
  free and registration-based, but the terms carve out "Commercial Non-Tourism
  Related Enterprises" and allow per-asset additional licence terms including
  expiry dates and geographical restrictions. **Reject:** per-asset expiring
  licences cannot be modelled in a static wire format.
- Switzerland Tourism and Zurich Tourism both publish a media portal behind a
  "terms of use" link whose text I could not retrieve
  (https://www.zuerich.com/en/business/media/image-and-video-material ,
  https://myswitzerland.com/medias). **UNVERIFIED**, but the class behaviour
  above makes them low-value regardless: no API, no coordinates, no bulk.

Verdict for the whole class: **reject**. Even where the licence would work,
there is no machine access and no per-feature coordinate, so they cannot
serve a 24.8k-feature catalogue. They remain viable for a hand-curated
handful if a partnership is ever signed.

### 2.16 Wikimedia Commons Query Service (SPARQL over structured data)

- URL: https://commons-query.wikimedia.org
- Would allow querying prominent (preferred-rank) depicts statements at scale
  in one query rather than per file.
- **UNVERIFIED:** requires a Wikimedia account login, which I did not
  exercise, so I confirmed neither its rate limits nor whether a service
  account is acceptable for automated use. Do not build on it until that is
  checked.
- Verdict: **maybe**, pending verification. The per-file
  `action=wbgetentities&ids=M<pageid>` route below is verified and needs no
  login, so it is the safe path today.

---

## 3. Beauty ranking signals

The ask is a proxy for beauty. None of these measure beauty directly; the
honest framing is that Commons peer review measures it for us on a subset,
and everything else is a weak prior.

### 3.1 Commons assessment tier (strongest by far)

Compute: `extmetadata.Assessments` from the same batched `iiprop=extmetadata`
call `harvest_image_licenses.py` already makes. Values: `featured`, `poty`,
`potd`, `quality`, `valued`. Score them, for example featured 100, poty 90,
potd 60, quality 40, valued 25, none 0.

Why it proxies beauty: Featured Picture is a Commons-wide aesthetic peer
review with a high bar; Quality Image is a technical review (sharpness,
exposure, composition, no distracting artefacts). These are humans judging
photographs, which is the only real signal available.

Weakness: coverage. Only 148 of 9400 files depicting the Eiffel Tower are
Quality Images, and that is one of the most photographed objects on earth.
For a Slovenian trailhead the count will be zero. Assessment is a tie-breaker
on the head, not a filter for the tail.

### 3.2 Global file usage count

Compute: `prop=globalusage&gufilterlocal=1&gulimit=500` and count returned
entries. **Verified caveat:** `Extension:GlobalUsage` has no count parameter,
so you must paginate with `gucontinue` and count client-side.

Why it proxies beauty: a file used on 40 language Wikipedias was chosen 40
times independently by editors as the best illustration of its subject.

Weakness: heavily biased to the oldest file rather than the best one, because
the first adequate image gets copied across language editions and rarely
replaced. Also expensive (extra request per file).

### 3.3 Being the entity's own P18 / P948 / P8592

Compute: already in hand from `wbgetentities`.

Why it proxies beauty: someone deliberately picked this file to represent
this entity. VERIFIED example: Q243's P18 is
`Tour Eiffel Wikimedia Commons.jpg`, whose Assessments are
`quality|featured|valued|poty|potd`, i.e. the single most decorated Eiffel
Tower photo on Commons. The two signals reinforce each other.

Weakness: **aspect ratio is unconstrained.** That same P18 file is 2900x5367,
ratio 0.54, a tall portrait. Dropped into a 16:9 card it crops to a slice of
ironwork. P18 tells you which subject, not which shape.

### 3.4 Pixel area and aspect ratio

Compute: `width` and `height` from `iiprop=size`, free in the same call.

Why it proxies beauty: a 3561x2374 file is a camera raw export; a 640x480
file is a 2006 phone. Also gates the practical question of whether the photo
survives the crop the card needs.

Weakness: resolution correlates with equipment, not with seeing. A huge
badly composed panorama beats a small perfect one on this signal alone, so
it must never dominate.

### 3.5 Capture year

Compute: `extmetadata.DateTimeOriginal`, free in the same call.

Why it proxies beauty: sensor and lens quality, and the norms of travel
photography, both improved sharply after roughly 2012. Recency is a cheap
prior on "does this look like a modern travel photo".

Weakness: noisy and often absent or malformed (the field is documented as
"can be any other textual description of a date"). Never use it as a gate,
only as a small additive term.

### 3.6 Photo-contest categories (Wiki Loves Monuments, Wiki Loves Earth)

Compute: `prop=categories` membership, or a search term
`incategory:"Images from Wiki Loves Earth 2024"` style. Contest finalists and
winners live in dated Commons categories
(https://commons.wikimedia.org/wiki/Commons:Wiki_Loves_Monuments ,
https://wikilovesearth.org/about/).

Why it proxies beauty: these are photographs taken deliberately, of
monuments and protected natural areas, by people trying to win a photography
contest. The subject overlap with Carta's catalogue (heritage sites and
nature) is near perfect.

Weakness: an entry is not a win. The bulk "Images from Wiki Loves X" category
is just "someone uploaded this during September" and carries almost no
quality signal; only the finalist and winner subcategories do, and those are
small.

### 3.7 Prominent depicts (preferred rank)

Compute, **VERIFIED LIVE and no login needed**:
`https://commons.wikimedia.org/w/api.php?action=wbgetentities&format=json&ids=M<pageid>&props=claims`,
then read `statements.P180[].rank == "preferred"`. Commons stores the
"prominent" flag as preferred rank
(https://commons.wikimedia.org/wiki/Commons:Depicts).

Why it proxies beauty: it should separate "the Eiffel Tower is the subject"
from "the Eiffel Tower is in the background".

Weakness, **and it is severe**: I checked M3239606 and found **17 depicts
statements, every single one marked preferred**, including Q243 alongside
sixteen other Paris landmarks. Mass-tagging tools set preferred rank
indiscriminately. Treat prominence as a weak positive, never as a gate.

### 3.8 Filename and title token match against the feature name

Compute: the repo's existing `norm_tokens` minus the `GENERIC` blocklist
minus city and country tokens, requiring at least one shared token of six or
more characters (`enrich_images_web.py` already implements exactly this).

Why it matters here: this is a *relevance* signal, not a beauty one, but it
is the only cheap defence against the failure this brief names. **VERIFIED
example of the failure:** `File:Pont-Alexandre-III-et-Invalides.jpg` is a
Commons Featured Picture that carries `depicts Q243` at preferred rank, and
the Eiffel Tower is a distant background element. Assessment plus depicts
plus prominence all say yes; only the filename says no.

Weakness: fails on correctly named files in a language the token set does not
cover, and on files named `IMG_4471.jpg`.

### 3.9 Junk-pattern exclusion

Compute: the repo's existing `JUNK` regex (maps, coats of arms, plaques,
diagrams, flags, SVG, TIFF, PDF).

Why it matters: **VERIFIED failure it catches:** Wikivoyage's `pageimages`
for Prague returns `Prague_districts_en_wv.jpg`, a district map. Without the
regex that ships as the hero image of Prague.

Weakness: a blocklist only removes known bad shapes. It does nothing about a
correctly named, correctly geotagged, genuinely ugly photograph.

---

## 4. Recommended chain

### 4.1 Resolution ladder, first hit wins

Each rung is a **binding**: a reason to believe this photo is of this
feature. Descend only while the rung above produced nothing.

**Rung 1, QID identity.** Feature has a Wikidata QID: take P18, and hold P948
/ P3451 / P8592 aside for the wide-header and night-view slots. Binding
strength: highest. Verified coverage 62% (PT beaches) to 22% (CH mountains).

**Rung 2, QID depicts, quality-gated.** Same QID, run
`haswbstatement:P180=<QID>` three times with a narrowing filter: first
`incategory:"Featured pictures on Wikimedia Commons"`, then
`incategory:"Quality images"`, then unfiltered. Take the best-scoring
candidate that also passes the token-match gate of 3.8. Binding strength:
high, because a human asserted the file depicts this entity.

**Rung 3, the feature's own Commons category.** From P373, or from an OSM
`wikimedia_commons=Category:...` tag, list members with
`generator=categorymembers` and rank them. Binding strength: high; category
membership is a curatorial statement about the file.

**Rung 4, OSM direct pointer.** `wikimedia_commons=File:...` on the OSM
object. Binding strength: high, one mapper asserted it, one file.

**Rung 5, geosearch with the existing token gate.** The repo's current
behaviour, unchanged, plus assessment-aware scoring. Binding strength:
medium, and the Sagrada Familia test shows why it is rung 5 and not rung 1.

**Rung 6, GB and IE only: Geograph** by coordinate and radius. Binding
strength: medium; a Geograph photo is chosen to represent its grid square,
which is close to but not the same as representing the feature.

**Rung 7, utility only: Panoramax** by bbox, for trailheads and access
points, rendered in a visually distinct "what it looks like on arrival" slot,
never in a hero position.

**Rung 8: no photo.** See section 4.3.

### 4.2 Scoring inside a rung

    score = 100 * assessment_tier          # 3.1, dominant
          +  20 * log1p(global_usage)      # 3.2, optional, costs a request
          +  30 * is_entity_p18            # 3.3
          +  10 * min(megapixels, 12) / 12 # 3.4
          +  10 * aspect_fit(target_ratio) # 3.4, penalise ratio < 0.6 or > 2.5
          +   5 * recency_after_2012       # 3.5
          +  15 * contest_finalist         # 3.6
          +   5 * prominent_depicts        # 3.7, weak on purpose
          - 999 * junk_pattern             # 3.9, hard veto
          - 999 * failed_token_gate        # 3.8, hard veto (rungs 2, 3, 5)
          - 999 * licence_gate_failed      # NC / ND / permission / no licence

### 4.3 The rule for showing NO photo

**A feature shows no photo unless at least one rung 1 to 4 binding holds, or
a rung 5 to 7 binding holds with BOTH a distinctive token match AND a
distance inside the kind-specific radius.**

Concretely, refuse to render a photo when any of these is true:

1. **No binding.** The best candidate came from a coordinate search with no
   shared distinctive token. There is no evidence the photo is of this
   feature.
2. **Borrowed from the parent.** The only candidate is the enclosing town's,
   region's or country's image. A specific beach must never inherit the
   town's skyline. This is the brief's core rule and it needs an explicit
   check, because rung 1 will happily return the town's P18 if the feature's
   QID was resolved loosely.
3. **Licence gate failed.** NC, ND, "by permission", or no licence metadata
   at all (`harvest_image_licenses.py` already computes this).
4. **TASL unresolvable.** No author or no licence URL, so no compliant credit
   line can be rendered. The ledger's open item 1 makes this binding.
5. **Freedom of panorama risk.** The feature is a building or public artwork
   created after roughly 1950 in a country with no or restricted FoP:
   **France, Greece, Iceland, Italy, Luxembourg, Monaco, Romania, Slovenia**
   (no FoP for buildings), **Belgium and Denmark** (buildings only, not art),
   **Estonia, Latvia, Lithuania** (restricted)
   (https://commons.wikimedia.org/wiki/Commons:Freedom_of_panorama). Commons
   hosting the file is not a licence for Carta to publish it commercially.
6. **Junk shape.** Map, plan, coat of arms, flag, plaque, diagram, document
   scan, or a non-photo mime type.
7. **Aspect ratio unusable and uncroppable**, e.g. a 7:1 banner in a card
   slot with no alternative.

When refused, render the design system's empty state, not a placeholder that
looks like a photo and not a stock beach. A card with a clean typographic
empty state reads as honest; a wrong photo reads as a lie and poisons trust
in every other photo on the page.

### 4.4 Engineering notes

- **Stop hotlinking at 24.8k scale.** Commons explicitly says direct URL
  embedding "is not recommended"
  (https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).
  The CC licences permit rehosting, so proxy chosen thumbnails onto Carta's
  own CDN, keep the TASL record, and stop putting the catalogue's image load
  on Wikimedia's servers.
- **One call does the work of three.** `generator=search` +
  `prop=imageinfo` + `iiprop=extmetadata|size|url` + `iiurlwidth=640` returns
  candidates, licence, author, assessments, dimensions and a sized thumbnail
  in a single response. Verified above. `enrich_images_commons.py` and
  `harvest_image_licenses.py` currently make two passes over the same data.
- **Batch limits:** 50 titles or QIDs per `wbgetentities` / `titles=` request,
  500 per geosearch, serial requests per API:Etiquette, descriptive UA with a
  contact address (the repo's existing UA already complies).
- **Per-file credit must ship.** This is ledger follow-up item 1. Every
  rendered photo needs author, licence name, licence URL and a link to the
  Commons description page. The shape already exists in
  `compose_citytrips.py`.

---

## 5. Proposed ledger rows for `docs/tos/data_licenses.md`

For section 5 (destination content layers). Existing Wikipedia, Wikimedia
Commons and Wikidata rows already cover part of this; these are the additions.

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| Wikimedia Commons structured data, depicts search (`haswbstatement:P180=<QID>`) | Candidate photo filenames per curated feature, resolved from its Wikidata QID | Per file: CC0, CC BY, CC BY-SA, public domain. The SDC statements themselves are CC0 | Yes, per file (author, licence, licence URL, description page) | Some files (CC BY-SA) | MISSING, this is ledger follow-up item 1. Needs a per-image credit surface |
| Wikimedia Commons assessment flags (`extmetadata.Assessments`) | Featured / quality / valued / potd / poty flags used as a ranking signal, not displayed | Metadata about CC0 and CC files; no separate licence | No | No | None needed, ranking signal only |
| Geograph Britain and Ireland (proposed `pipeline/harvest_images_geograph.py`) | Per-coordinate photographs for GB and IE features Commons does not cover | CC BY-SA 2.0, https://creativecommons.org/licenses/by-sa/2.0/ | Yes: photographer credit, explicit statement that the image is CC licensed | Yes, on adaptations | NEW, needs an `attribution.js` entry before any Geograph photo renders |
| Panoramax (api.panoramax.xyz, STAC) | Street-level arrival views for trailheads and access points | Per picture: CC BY-SA 4.0 or Licence Ouverte 2.0 (Etalab), declared in each feature's `rel="license"` link | Yes, per picture | Some pictures (CC BY-SA) | NEW, needs an `attribution.js` entry before any Panoramax photo renders |
| OpenStreetMap `wikimedia_commons` / `image` tags via Overpass | Per-feature image pointers for features with no Wikidata entity | ODbL 1.0 for the tag; per file for the image | Yes: © OpenStreetMap contributors, plus per-file credit | Yes (ODbL on the derived slice) | Covered by the existing OpenStreetMap row and footer credit; per-file credit MISSING as above |
| REJECTED, recorded so the decision is not relitigated: Flickr API, Unsplash API, Pexels API, Mapillary, Openverse, national tourism board media libraries | n/a | See section 2 of `data/curation/research/_sources_images.md` | n/a | n/a | Not used. Flickr and Mapillary forbid the harvest; Unsplash and Pexels and Openverse cannot bind a photo to a specific feature; tourism boards licence for destination promotion only, not for a commercial product |

---

## 6. Summary table

| Source | Licence | Coords | Harvest OK | Verdict |
|---|---|---|---|---|
| Wikidata P18 / P948 / P3451 / P8592 / P373 | CC0 (statements) | yes (P625) | yes | **use**, primary key |
| Commons depicts search (P180) | per file | via extmetadata GPS | yes | **use**, discovery |
| Commons assessments | n/a | n/a | yes | **use**, ranking |
| Commons geosearch | per file | yes | yes | **use**, late fallback |
| Wikipedia pageimages / REST | per file | no | yes | **use**, cities only |
| Wikivoyage banners (P948) | per file | no | yes | **maybe**, wide headers only |
| OSM image tags via Overpass | ODbL + per file | yes | yes | **use**, no-QID fallback |
| Geograph GB and IE | CC BY-SA 2.0 | yes | yes (dumps) | **use**, GB and IE only |
| Panoramax | CC BY-SA 4.0 / LO 2.0 | yes | yes | **maybe**, utility views |
| Commons Query Service | n/a | n/a | UNVERIFIED (login) | **maybe**, pending checks |
| Mapillary | CC BY-SA | yes | **no** (ToS 5(a)) | **reject** |
| Flickr API | per photo | yes | **no** (ToS) | **reject** |
| Unsplash API | Unsplash License | no | restricted | **reject** |
| Pexels API | Pexels License | no | restricted | **reject** |
| Openverse | per result | no | **no** (no scraping) | **reject** as pipeline |
| Tourism board media libraries | promotion-only | no | **no** | **reject** |
