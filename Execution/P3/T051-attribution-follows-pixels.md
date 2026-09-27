# T051 Keep attribution attached to the pixels

## Task ID

T051

## Date

2026-09-27

## What changed

The credit gate now has a proof that it holds on the self-hosted path, one hole in it is closed, and the app can credit a photograph from a CDN URL. Before this task, `credit.owes_credit` gated every layer export and derive.py's source list, but nothing showed that the image manifest (the only thing that points at an object in R2) carries a complete credit for every entry, and the app's only URL-based credit helper, `src/lib/imageCredit.js`, recognised `upload.wikimedia.org` URLs and nothing else. A `cdn.carta-europetravel.com` URL is a hash and names no file, so it resolved to nothing. Now `pipeline/photos/verify_attribution_cdn.py` runs every beach record through derive.py's own `collect()` and `build_manifest()` and finds all 12,085 published beach titles that owe a credit carried complete in the manifest. A hostile cache cannot get an uncredited file in. A real CC BY-SA Commons file and a real Geograph file resolve in the app, run in node, from the CDN URL plus the manifest alone. All of this is offline. There is no R2 credential on this laptop and cdn.carta-europetravel.com does not resolve yet, so "served from R2" is simulated by a manifest plus `derive.cdn_url()`. With `--run`, the local `img/` tree a derive run writes before it would upload stands in for the bucket. The live check is the owner's (step 28 of `Execution/P3/_OPEN-hetzner.md`, row T051-a).

How it works, for whoever maintains it. A stored copy is different from a hotlink in one way that matters here, which is T010's finding: a hotlinked Commons file is Wikimedia's copy, but a resized file in our bucket is our redistribution. So a CC BY-SA copy served without its author is a breach we commit ourselves. The rule that prevents it is still the one function, `credit.owes_credit`. derive.py calls it (through `storable()`) before a file enters the source list. `build_manifest()` only iterates that source list, so an entry can only exist for a file that passed. Each entry's `c` points into a `credits` table of `[licence, author]` pairs taken from the same cache record the gate read. The manifest also carries `page`, the Commons and Geograph page URL templates. So everything a TASL credit needs travels in the manifest: title (the key), author, source page and licence. Nothing is looked up from Wikimedia when the page renders.

The hole. `owes_credit` tested the author with `strip()`, while derive.py's `Source` strips `" ,;"` from the author before it goes into the manifest. An Artist field of `" , "` therefore passed the gate and would have been stored as an empty author on a CC BY-SA copy. `<span></span>` passed too, because Commons metadata is HTML. No record in the beaches, lakes or mountains caches has either shape today. The fix is one line: the author is tested through `credit.clean()`, which already existed for exactly this purpose. Two new cases in `verify_credit.py` pin it. The before run of the harness, against the HEAD version of credit.py, shows both hostile records reaching the manifest. The after run refuses them.

The app side. The Beach, Lake and Mountain pages do not derive the credit from the image URL at all. Their `ImageCredit` components print `by`, `lic`, `licUrl` and `page` from the wire record. So their credit survives a URL change as long as the wire record keeps those four fields, and T052 must keep them (row T051-b). The one place that does key off the URL is `imageCredit.js`, used by TripPage's sight thumbnails. It now handles three URL kinds. Commons upload URLs work as before. Geograph URLs map to `https://www.geograph.org.uk/photo/<id>`, using the same id pattern as derive.py, matched on the host. CDN URLs of the exact shape `img/{ab}/{cd}/{sha1}/{w}.{avif|webp}` go through the new `creditFromManifest(url, manifest)`. It builds a sha1-to-title index once per manifest object, reads the credit pair, fills the page template the same way `commonsPageUrl` encodes a title, and adds the Creative Commons deed link from the licence name, including ported licences such as "CC BY-SA 3.0 de". The manifest keeps the name but not the link, and the wire's `licUrl` is that same deed for every CC file. A CDN URL with no manifest, an unknown hash, a wrong host or a malformed path answers null. It never falls back to a guess. `creditFor(url, {manifest})` routes to it, and existing calls without a manifest behave exactly as before for Commons. No visible text changed: the tooltip line is still "author, licence", and `creditLine()` only names that join so the harness can check it.

The ledger. `docs/tos/data_licenses.md` gains section 14 for the self-hosted copies. It says what T010 decided: a stored copy keeps exactly the original's licence. Author, licence and source travel with every copy. Resizing and a format change are technical modifications (CC 4.0 section 2(a)(4)), not an adaptation, so share-alike attaches to the file and nothing around it. NC, ND and unlicensed files are refused before storage. `src/data/attribution.js` gains a "Carta image copies" entry for Account > Data sources, which says the CDN files are resized copies of Commons and Geograph files credited per image. It is not a new source, but the ledger's rule is that a row with a user-facing credit has an entry there.

## Files touched

Root repo, code commit:

**Modified:**
- pipeline/photos/credit.py (owes_credit tests the author through clean())
- pipeline/photos/verify_credit.py (two cases: punctuation and an empty HTML wrapper are not names; 14 cases now)
- docs/tos/data_licenses.md (section 14, self-hosted image copies)

**Created:**
- pipeline/photos/verify_attribution_cdn.py

App repo (continent-app/), code commit:

**Modified:**
- continent-app/src/lib/imageCredit.js (Geograph and CDN URLs; creditFromManifest, cdnHash, geographId, geographPageUrl, licenceUrl, creditLine, CDN_HOST)
- continent-app/src/data/attribution.js (the "Carta image copies" entry only; the uncommitted Belgian transit rows in the same file belong to another task and were left unstaged)

Root repo, report commit:

**Created:**
- Execution/P3/T051-attribution-follows-pixels.md

**Modified:**
- Execution/_OPEN.md (rows T051-a to T051-d)
- Execution/P3/_OPEN-hetzner.md (step 28 and its summary row)

**Deleted:**
- None.

derive.py was not touched. The one gap on its side (the manifest drops `no_attribution_required`) is row T051-c. No UI component changed, so the carta-design questions are answered trivially: no colour, type, layout or copy change reaches a screen, apart from the new plain-prose line in Account > Data sources, which carries no em dash and none of the banned words.

## Commands run

From the repo root in Git Bash, with `PYTHONIOENCODING=utf-8`. `Get-Process python` showed one process with no visible path (id 11428) throughout. Nothing here writes master data, a cache or `public/`: the harness only reads caches and the wire and writes to a temp directory or `--out`. `$S` is the session scratchpad, where T049's real derive runs still sat (`$S/t049/run3`: 60 published beach sources, 300 encoded objects, a real manifest).

```
git checkout -b p3-attribution-follows-pixels                      # root, from p3-image-derivative-ladder
git -C continent-app checkout -b p3-attribution-follows-pixels     # app, from p3-r2-bucket-and-domains
python pipeline/photos/verify_credit.py                            # 14 cases hold
python pipeline/photos/verify_attribution_cdn.py --run $S/t049/run3 --json $S/t051/measure_after.json   # exit 0
python pipeline/photos/verify_attribution_cdn.py --manifest $S/t049/run3/img/manifest/beaches.json --head 1   # exit 1, see below
# the before measurement: HEAD's credit.py and imageCredit.js copied to $S/t051/before and
# put first on the import path / as the resolver, then the same harness run
git show HEAD:pipeline/photos/credit.py > $S/t051/before/credit.py
git -C continent-app show HEAD:src/lib/imageCredit.js > $S/t051/before/imageCredit.js
# app commit: stage only this task's hunk of attribution.js
git -C continent-app diff src/data/attribution.js > $S/t051/attr_full.patch   # cut at the @@ -233 hunk -> attr_mine.patch
git -C continent-app apply --cached $S/t051/attr_mine.patch
git -C continent-app add src/lib/imageCredit.js
git -C continent-app diff --cached src/data/attribution.js | grep -c "SNCB\|De Lijn\|STIB\|TEC"   # 0
git -C continent-app commit
git add pipeline/photos/credit.py pipeline/photos/verify_credit.py pipeline/photos/verify_attribution_cdn.py docs/tos/data_licenses.md
git commit ; git commit --amend --no-edit          # the amend added --manifest/--head before anything was pushed
git show --stat HEAD                                # both repos
```

The after run's output, abridged:

```
gate: 40625 records, 37858 sources after the gates, refused {'credit-missing': 20}; 37858 manifest entries, 12803 distinct credits, 0 incomplete
  published beaches: 12823 titles, 12085 owe a credit, 12085 carried complete in the manifest
gate: a hostile cache: 9 records in, 2 out (File:T051 cc0.jpg, File:T051 good.jpg); the smuggled entry was dropped
file: commons File:Currila Beach 2.jpg (AL), credit ['CC BY-SA 4.0', 'Joseph2302']
    https://cdn.carta-europetravel.com/img/17/65/17652dea0c08c956ad8c68f6453f26eeda0f4a4f/640.avif
    app credit line from the CDN URL: 'Joseph2302, CC BY-SA 4.0'
  geograph geograph:7279961 (GB), credit ['CC BY-SA 2.0', 'Richard Webb']
    app credit line from the CDN URL: 'Richard Webb, CC BY-SA 2.0'
  resolver handles: cdn, commons, geograph
manifest (T049 run3): 60 entries, 300 objects expected, 0 missing, 0 incomplete credits; 42 of 42 CC BY-SA entries resolved in the app
```

The `--head 1` run fails on purpose. Every one of the five CDN URLs answers `getaddrinfo failed`, because the domain is not live yet. That run shows the live check is real and will not pass vacuously.

## Config and secrets set

None. The harness needs `node` on PATH (v24.14.1 here) and reads no secret. For the live check (step 28), `rclone` needs `RCLONE_CONFIG_R2_*`, and `--head` needs the domain serving.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Published beach titles owing a credit (licence not CC0 or public domain; `beaches` and `listed` rows) | 12,085 | 12,085 | 0 |
| Of those, carried in the manifest with a complete credit (licence and author) | 12,085, unproven (no test existed) | 12,085, proven by the harness | proof added |
| All gated beach sources in the manifest with an incomplete credit | 0 of 37,858 | 0 of 37,858 | 0 |
| Hostile records reaching the manifest (9 in: 1 good, 1 CC0, 7 that must be refused) | 4 (punctuation and an empty HTML wrapper passed as authors) | 2 (the good and the CC0 file) | -2 |
| Image URL kinds the app's credit resolver handles | 1 (Commons) | 3 (Commons, Geograph, CDN) | +2 |
| CC BY-SA entries of a real derive manifest the app credits from the CDN URL | 0 of 42 | 42 of 42 | +42 |
| Credit rule cases pinned in verify_credit.py | 12 | 14 | +2 |

The owing count is per unique title. In image records it is 13,210 (11,257 in `beaches` rows and 1,953 in `listed` rows). The 12,803 distinct credit pairs for 37,858 sources show the credits table dedupes little: most photographers appear once.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first harness count said 10,166 published titles owe a credit, where a cache-side count said 12,085 | The wire files carry a second array, `listed`, next to `beaches`, and the harness walked only the first; `derive.published_titles` walks both | Both arrays are walked; the counts agree at 12,085 |
| A punctuation-only or empty-HTML author passed the gate | `owes_credit` used `strip()` where the manifest uses `strip(" ,;")` | `owes_credit` uses `clean()`; two cases pin it |

## What is still open

The live check is the owner's (T051-a, order 54, step 28 of `Execution/P3/_OPEN-hetzner.md`). It can only run after the first real beaches derive run (T049-c, order 51). It reads the manifest back from R2 and runs the same harness with `--manifest` and `--head 5`, which also HEADs five live objects for their Content-Type and Cache-Control.

For T052 (T051-b), which serves the ladder in the app. The Beach, Lake and Mountain pages print the credit from the wire record's `by`, `lic`, `licUrl` and `page`, never from the image URL. So T052 can swap `u` and `big` for CDN URLs, or add a `<picture>` beside them, without touching the credit, provided it keeps those four fields on every record. It must not strip them to save bytes on the theory that the manifest has them. Joining `h` and `c` into the wire is fine, but the resolved author and licence should be written into the record at export, not looked up in the browser. Anything that shows a CDN URL without a wire record behind it (POI thumbnails, a future lightbox) must call `creditFor(url, {manifest})` or `creditFromManifest(url, manifest)` with the layer manifest. Without one, the answer is null, and the right response to null on our own copy is to not show the photograph. `fallbackSrc` and `srcSetFor` in the layer pages rewrite Wikimedia thumbnail widths and will need their own CDN branch. The CSP img-src still lacks the CDN host (T049-h).

The manifest drops `no_attribution_required` (T051-c). A CC BY file that Commons stamped as owing nothing, with no author, is correctly allowed through the gate, but from the manifest alone it looks incomplete. The harness reads the stamp from the cache to judge it. There is 1 such file in lakes and 0 in beaches. The fix is a marker in `derive.build_manifest`, which was outside this task's scope.

The `clean()` change applies to every export that calls `owes_credit`. No record in the beaches, lakes or mountains caches changes its verdict. The cycling lab images and the dossier inputs were not re-checked, because the lab database was not started. The next export of those layers should compare its photo count with the last one (T051-d).

Legal.md's open item "per-file Wikimedia credit on POI thumbnails" is not closed by this task. TripPage's sight thumbnails already name the author in a tooltip and link the file page. Whether a tooltip is a sufficient credit is a product decision, not this task's.

Nothing here needs the Claude API, and nothing calls it.

## Rollback procedure

Nothing live was created and nothing was written outside the repositories and the session scratchpad. To undo, revert the commits, newest first:

```
git revert <T051 report commit> <T051 root code commit>
git -C continent-app revert <T051 app code commit>
# or, unmerged:
git checkout p3-image-derivative-ladder && git branch -D p3-attribution-follows-pixels
git -C continent-app checkout p3-r2-bucket-and-domains && git -C continent-app branch -D p3-attribution-follows-pixels
```

Reverting the root code commit restores the `strip()` author test, which lets a punctuation-only author through the gate again. Reverting the app commit leaves CDN URLs uncredited in `imageCredit.js`, which matters only once T052 serves them. The revert of the app commit touches only this task's hunk of attribution.js, so the Belgian rows another task left uncommitted are unaffected.
