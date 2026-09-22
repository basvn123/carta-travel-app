# T007 Image corpus count

## Task ID

T007

## Date

2026-09-22

## What changed

Nothing in the product changed. This was a measurement task, and what it produced is a number with a defensible definition behind it, which the earlier estimates did not have.

The answer is 179,683 unique original files attached to Carta rows across every cache, of which 175,403 are raster images that a transcode pipeline would actually process. Adding the 3,983 files the published wire serves that no cache accounts for, the corpus a migration has to carry is 179,386 originals, which at five derivatives each is 896,930 derivative objects and 1,076,316 objects in R2 once the originals are stored beside them. Round it to 180,000 originals and 1.08 million objects.

That is roughly four times the 42,919 the wire was thought to show, and above the top of the 80k-150k estimate the brief carried. The estimate was not wrong by accident. It was anchored on the destination and POI layers, which is where the 80,457 figure in `1.CARTA.md` comes from, and it did not carry the beach, lake and mountain layers, which between them hold 77,836 unique files and are the single largest block in the corpus.

The more useful outcome is that the count now has a boundary. Walking the caches naively returns 776,904 unique files, which is a real number and the wrong one to size storage from. Two caches are candidate pools rather than selections: `wikidata_poi_images.json` is a bounding-box sweep of Wikidata holding up to 6,000 rows for a single destination, and `cache/trails/photos/` is a Commons geosearch around each trail with a median of 14 candidates and a maximum of 252. Neither represents a file we have ever fetched pixels for. They are discovery metadata, and a sizing exercise that counts them overstates the bill by a factor of four in the opposite direction from the one the brief was worried about.

So the count is reported in two tiers, and the distinction between them is the substance of this task. Tier A is what a row points at: the enrich step chose it and wrote it onto the record. Tier B is what a selector was given to choose from. Storage, transcode wall-clock and the R2 object count all scale off Tier A.

## The counting rule

Identity is the canonical Commons file name, never the URL. The same original appears in these caches as a 500px thumb, a 640px thumb, a 1280px thumb, an unscaled original and a `Special:FilePath` redirect, and four of those five carry `utm_source` query parameters that differ by harvester. Counting distinct URLs in `app_data.json` alone gives 8,512 where the canonical count is 3,784, so URL identity inflates by better than two to one.

The normaliser strips the query string, pulls the file name out of whichever of the five shapes it is looking at, percent-decodes it, folds underscores to spaces and upper-cases the first letter, which is Commons' own normalisation. It returns nothing for a non-Commons URL, so Wikipedia article links and other external references fall out rather than being counted as files.

## Per-layer breakdown

Tier A, the selected corpus. The rows column is records examined, with photo is records carrying at least one image.

| Layer | Unique originals | Rows | With photo |
|---|---|---|---|
| beaches | 37,507 | 40,403 | 14,760 |
| activities (POI) | 35,614 | 164,815 | 47,102 |
| poi_licensed | 28,684 | | |
| dest_hero | 23,076 | | |
| hero_meta | 22,272 | | |
| lakes | 21,052 | 13,173 | 7,670 |
| mountains | 19,277 | 8,898 | 5,201 |
| dossier landmarks | 17,004 | 28,608 | 17,004 |
| features (attached) | 11,968 | | |
| citytrip | 4,867 | | |
| journeys | 776 | | |
| union | 179,683 | | |

The column sums to 222,097, so 42,414 files are held by more than one layer. That overlap is expected and is the reason the union is the only figure worth quoting: a hero picture of a coastal town is legitimately the destination's hero, the beach's hero and a POI picture at once, and it is one object in R2.

Tier B, the candidate pools, for completeness and to make clear what was deliberately excluded:

| Pool | Unique originals |
|---|---|
| wikidata_poi_pool | 424,744 |
| trails_pool | 122,239 |
| features_pool | 102,368 |
| union | 637,928 |

597,221 of those appear in no Tier A layer. If the trails layer ever selects heroes into its cache the way beaches and lakes do, some fraction of the 122,239 moves across the line, and that is the one pool likely to grow Tier A materially.

## Projected object count

| Basis | Originals | Derivatives at 5x | Total objects |
|---|---|---|---|
| Tier A, all files | 179,683 | 898,415 | 1,078,098 |
| Tier A, raster only | 175,403 | 877,015 | 1,052,418 |
| Tier A raster plus wire orphans | 179,386 | 896,930 | 1,076,316 |
| Tier A+B | 776,904 | 3,884,520 | 4,661,424 |

The third row is the number to plan against, and it is the practical answer to this task. It is the raster corpus plus the 3,983 files the wire serves that no cache accounts for, because a migration has to carry those too and cannot discover them from the caches. Call it 180,000 originals and 1.08 million objects.

The raster-only row is the one to plan against. 4,280 Tier A files are not photographs at all: 3,953 SVGs (mostly regional flags and locator maps), 259 ogg and 31 wav audio files, 26 webm and ogv videos, and 4 PDFs. These arrived through `hero_image_meta`, which caches Commons metadata for anything a hero query returned rather than for photographs specifically. They need a pass-through or a drop rule, not five JPEG derivatives, and a transcoder handed an ogg file will either fail or waste the attempt.

Median dimensions across 82,751 images carrying width and height are 1280x896, which is the harvest thumbnail ceiling rather than a property of the files. The `hero_image_meta` sample, which records true source dimensions, has a median of 2560x1944. Sizing the originals bucket should use the second figure.

## What the wire actually holds

The brief's premise was that counting in the wire undercounts, and that is right in direction. It is wrong in magnitude, and worth correcting before anyone plans against the old number.

Scanning all 52,076 JSON files under `continent-app/public/` returns 82,602 unique Commons originals, not 42,919. The 42,919 figure is not reproducible from any wire file in the tree and is not recorded anywhere in the repository, so it cannot be reconciled; the most likely reading is that it counted one subtree or one export generation. Either way the wire is still less than half the cache corpus, so the rule in `docs/PHOTOS.md` holds and the conclusion the brief drew from it stands.

The subset relation does not hold cleanly, and this is the finding most worth acting on. 12,846 wire images are in no Tier A layer, and 3,983 are in neither tier. Those are files the app is serving today for which no cache in this repository records provenance. A migration that builds its object list from the caches alone would silently drop them. The examples are heavily Geograph and panoramio, which points at harvesters whose output went to the wire without a rich cache behind it.

Broken down by wire subtree, the orphans are not spread evenly, which makes them much easier to chase:

| Subtree | Wire refs | Orphans |
|---|---|---|
| trips | 124,136 | 137 |
| dossier | 75,019 | 1,698 |
| poi | 41,104 | 0 |
| region | 22,102 | 1,550 |
| trails | 14,691 | 1,847 |
| beaches | 13,424 | 1 |
| lakes | 9,232 | 4 |
| mountains | 7,567 | 1 |
| cycling | 3,979 | 3,491 |
| (root) | 3,797 | 13 |
| journeys | 512 | 0 |

The three rich_* layers are effectively clean: six orphans across 30,223 references, which is the strongest confirmation available that the counting rule is sound, because those are exactly the layers whose caches this count reads directly. Cycling is the opposite case and the one to fix first: 88 per cent of what it publishes has no cache behind it, so the cycling layer either selects at export from a pool this count treats as Tier B, or it harvests straight to the wire. Trails, dossier and region are the same defect at smaller scale.

## Files touched

Created:
- Execution/P0/T007-image-corpus-count.md

No code, data or configuration was modified. The counting scripts were written to the session scratchpad rather than the repository, because the task named no scripts to create and the repo rule is to touch only what the prompt names. They are described below in enough detail to rebuild.

## Commands run

The count was done with throwaway Python scripts in the session scratchpad. In order:

```
python count_corpus.py    # first pass, single tier, no pool separation
python count_final.py     # two-tier count, writes tierA.txt and tierB.txt
python count_wire.py      # scans continent-app/public, checks the subset relation
python ext.py             # extension histogram over tierA.txt
python dims.py            # dimension and mime distribution
python orphans.py         # locates wire orphans by subtree
```

All are pure readers. None opens a file for writing inside the repository. The two output sets, tierA.txt and tierB.txt, are one canonical file name per line and are the artifact to keep if this needs auditing; they are in the scratchpad and will not survive the session.

To rebuild from scratch, the shape is: for each layer cache, pull the `images` array and the `wd_img` field off every record, normalise each entry through the canonicaliser described above, and union the results. The body key differs by layer and is `beaches`, `lakes` and `peaks` respectively, which is worth knowing because selecting the first list value in the file picks up `seed_missing` on mountains and crashes.

## Config and secrets set

None.

`PYTHONIOENCODING=utf-8` is required on this box for any script printing Commons file names. The default console encoding is cp1252 and it raises UnicodeEncodeError on the first Nordic or Greek title, which is most of them.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Unique originals, believed | 42,919 (wire) | 179,683 (caches, Tier A) | +136,764 |
| Unique originals, estimated range | 80,000-150,000 | 179,683 | above range |
| Raster originals to transcode | not known | 175,403 | new |
| Originals a migration must carry | not known | 179,386 | new |
| Projected derivative objects at 5x | 214,595 | 896,930 | +682,335 |
| Projected total R2 objects | 257,514 | 1,076,316 | +818,802 |
| Wire unique originals | 42,919 (asserted) | 82,602 (measured) | +39,683 |
| Wire images with no cache provenance | not known | 3,983 | new |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Script crashed on mountains | Body list selected as the first list value; mountains carries seed_missing, a list of strings, before peaks | Select the body by an explicit per-layer key |
| Crash on activities and wikidata_poi | Some destination keys map to null rather than an empty list | Guard before iterating |
| Console crash printing file names | cp1252 default encoding | PYTHONIOENCODING=utf-8 |
| First count returned 802,467 | Candidate pools counted as if they were selected files | Split into two tiers; pools reported separately and excluded from the headline |

The first of those is the one that matters beyond this task. A count that crashed loudly was recoverable. The risk in this shape of work is the variant that does not crash: a heuristic that silently picks the wrong array and returns a number nobody can tell is wrong.

## What is still open

`CARTA_CLOUD_ARCHITECTURE.md` does not exist in this repository. The task named sections 4.1, 7b and 9 of it as required reading and none of it could be read; the count was built from `docs/PHOTOS.md`, which covers the same ground for the counting rule, plus the caches themselves. If that document exists elsewhere and states a derivative ladder other than five, the object projections here need re-running against it. The multiplier of five was taken from the task brief and is not independently verified.

The 3,983 wire images with no cache provenance are not explained. The subtree table above localises them, and the cycling layer is where to start: 3,491 of its 3,979 published references have no cache behind them, so whatever produced them is not writing a rich cache and this count cannot see it. Until that is traced, a migration that builds its object list from the caches alone would ship a cycling tab with almost no pictures. Trails at 1,847, dossier at 1,698 and region at 1,550 need the same treatment.

The trails layer has no selected tier. Its 122,239 cached candidates are all pool, and the heroes it publishes are chosen during export rather than written back to the cache. Until that changes, the trails contribution to Tier A is whatever its wire holds, which the orphan figures above partly capture and this task did not separate out.

`hero_image_meta` mixes media types. Whatever consumes this count needs a raster filter or it will hand audio files to an image transcoder.

Finally, the 42,919 figure in the brief is unreconciled. It is worth finding where it came from, because if it was a correct count of something narrower, that narrower thing may be what some other plan is sized against.

## Rollback procedure

Delete Execution/P0/T007-image-corpus-count.md and revert the commit on the branch. No data, schema, cache or wire file was written, so there is nothing else to undo.

```
git checkout main
git branch -D p0-image-corpus-count
```
