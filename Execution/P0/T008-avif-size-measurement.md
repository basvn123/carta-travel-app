# T008 AVIF size measurement

## Task ID

T008

## Date

2026-09-22

## What changed

Nothing in the product changed. This was a measurement task, and what it produced is a measured replacement for five numbers that were assumptions.

The 15/45/150 KB AVIF ladder and the 20/60 KB WebP fallback in `CARTA_CLOUD_ARCHITECTURE.md` section 4.2 are defaults for landscape photography, and the storage and bandwidth tables in section 4.4 are derived from them arithmetically: 10.0 GB at 50,000 images is exactly 50,000 times the 200 KB the three AVIF rungs sum to. Nobody had encoded a Carta photograph.

199 real originals drawn at random from the layer caches now have been, at cq-level 32 with libvips. Every rung comes in under its planned size. The AVIF ladder measures 158.1 KB per image against a planned 210, so the section 4.4 storage table overstates by 25 per cent, and the bandwidth table overstates by 52 per cent because it was built on the 45 KB assumption for the 640 rung where the measured mean is 36.6 KB.

The conclusion the architecture draws does not change, and in fact strengthens. Storage was never the constraint. What the measurement does change is the shape of the distribution: the plan carries a single number per rung, and the real spread is wide enough that the mean and the median are 14 per cent apart at 1280. That matters for anything sized on the tail rather than the middle, and it is the substance of this report.

## The encoder and its settings

libvips 8.15.3, the prebuilt Windows binary, because the task names libvips and it is what the transcode stage will use on the ARM build box. It is not otherwise installed on this machine, and `pip install pyvips` does not help: that installs the Python binding against a C library that has to be present already.

Quality is the one setting that had to be derived rather than read off. libvips `heifsave` takes `Q` on a 0-100 scale and maps it to the AOM quantiser as `cq = round(63 * (100 - Q) / 100)`, so cq-level 32 is Q=50. Rather than trust the formula, the mapping was checked by sweeping Q on one file and confirming the output moved monotonically and landed where the formula predicted:

| Q | cq-level | bytes at 640 |
|---|---|---|
| 40 | 38 | 87,449 |
| 45 | 35 | 104,514 |
| **50** | **32** | **122,266** |
| 55 | 28 | 150,592 |
| 60 | 25 | 175,095 |
| 63 | 23 | 192,704 |

Chroma is left at the 4:2:0 default. An early run forced 4:4:4 with `subsample-mode=off` and paid 19 per cent more bytes (122,266 against 99,147 on the same file) for a difference invisible on a photograph. That is the wrong trade for a delivery ladder and the figures in this report do not include it.

Encoder effort is 4. Raising it to 6 saved 0.6 per cent and to 9 saved nothing, so the default is right and there is no argument for spending build minutes there.

Resizing is `vipsthumbnail` with `--size 320x65500>` rather than a plain resize. The trailing `>` means shrink-only, and thumbnail does the shrink-on-load that the real pipeline will want, decoding the JPEG at a reduced DCT scale instead of decoding it whole and throwing most of it away.

## How the sample was drawn

Identity is the canonical Commons file name, using T007's normaliser: strip the query string, pull the name out of whichever of the five URL shapes it is in, percent-decode, fold underscores to spaces, upper-case the first letter. Counting distinct URLs instead inflates by better than two to one, because the same original appears as a 500px thumb, a 640px thumb, a 1280px thumb, an unscaled original and a `Special:FilePath` redirect.

Five Tier A caches were walked: `beaches/rich_*.json`, `lakes/rich_*.json`, `mountains/rich_*.json`, `hero_image_meta.json` and `activities.json`. That yields 131,061 canonical originals, of which 128,053 are raster. T007's union across eleven layers is 179,683, so this covers about three quarters of the corpus and spans the two largest blocks in it.

200 were sampled with a fixed seed. 190 fetched on the first pass; nine failed on transient connection errors and recovered on retry. One did not:

    071  Priedaines katoļu baznīca.jpg  ->  HTTP 404

That is a file the cache still points at which no longer exists on Commons, and it is a finding rather than a nuisance. It is a 0.5 per cent miss on a sample of 200, and if it holds across 179,386 originals the first transcode will hit on the order of 900 dead references. That needs a skip-and-log path, because a transcode stage that treats a 404 as fatal will stop 900 times.

The remaining 199 were encoded, all five derivatives each, with no failures.

Originals were fetched at width 2560, which is T007's measured median true source width from `hero_image_meta`. Commons ignores the width parameter for some files and serves the full original, so the sample contains sources up to 3840px wide. That does not affect the output, since every rung is below both figures.

## Measured sizes

199 originals, median source 1,656 KB, mean 1,770 KB, largest 6,944 KB.

| Derivative | Median | p90 | Mean | Min | Max | Planned | Median vs plan |
|---|---|---|---|---|---|---|---|
| 320.avif | 12.3 KB | 29.4 KB | 15.7 KB | 1.6 KB | 80.4 KB | 15 KB | -18% |
| 640.avif | 33.0 KB | 63.2 KB | 36.6 KB | 2.4 KB | 116.9 KB | 45 KB | -27% |
| 1280.avif | 93.3 KB | 188.0 KB | 105.8 KB | 6.2 KB | 430.8 KB | 150 KB | -38% |
| 320.webp | 18.8 KB | 36.7 KB | 21.2 KB | 2.5 KB | 84.0 KB | 20 KB | -6% |
| 640.webp | 53.7 KB | 94.6 KB | 58.0 KB | 5.7 KB | 167.6 KB | 60 KB | -11% |

Per image the AVIF ladder measures 158.1 KB against a planned 210, and all five derivatives measure 237.3 KB against a planned 290.

Three things in that table are worth more than the headline.

The distribution is not tight. p90 is roughly twice the median at every AVIF rung, and the largest 1280 derivative is 430 KB, which is nearly three times the planned figure for that rung. Storage projections are safe on the mean, but anything sized on the worst case, such as a page that loads several heroes, should use p90 and not the median.

The mean exceeds the median everywhere, by 28 per cent at 320 and 13 per cent at 1280. The distribution has a long right tail, so storage must be projected from the mean, which is what the recomputed table below does. Using the median would understate the bill by about 12 per cent.

The AVIF advantage over WebP widens as the image grows: 35 per cent smaller at 320 but 42 per cent at 640. The fallback ladder is cheap because it only carries two rungs, and it costs 79.2 KB per image on top of the AVIF 158.1.

Fifteen per cent of sources are narrower than 1280px, so their 1280 rung is emitted at source width. Those rows are real corpus members and belong in the figures, but they pull the median down. Excluding them the 1280 median is 102.4 KB rather than 93.3. The lower number is the right one for sizing the bucket; the higher one is the right one for reasoning about what a hero actually weighs.

## Section 4.4 storage table, recomputed

Projected on the measured mean, at R2's $0.015 per GB per month.

| Corpus | AVIF planned | AVIF measured | Five derivatives planned | Five measured | $/mo planned | $/mo measured |
|---|---|---|---|---|---|---|
| 50,000 | 10.0 GB | 7.5 GB | 13.8 GB | 11.3 GB | $0.21 | $0.17 |
| 100,000 | 20.0 GB | 15.1 GB | 27.7 GB | 22.6 GB | $0.41 | $0.34 |
| 150,000 | 30.0 GB | 22.6 GB | 41.5 GB | 33.9 GB | $0.62 | $0.51 |
| 250,000 | 50.1 GB | 37.7 GB | 69.1 GB | 56.6 GB | $1.04 | $0.85 |

At the corpus size T007 actually measured, rather than the round numbers the table carries:

| Basis | Originals | AVIF | Five derivatives | $/mo |
|---|---|---|---|---|
| Tier A raster | 175,403 | 26.4 GB | 39.7 GB | $0.60 |
| Tier A raster plus wire orphans | 179,386 | 27.0 GB | 40.6 GB | $0.61 |

So the derivative corpus is about 41 GB and costs 61 cents a month. Section 4.4's claim that self-hosting the photo corpus costs under a dollar a month survives the measurement with room to spare, and it survives at 180,000 originals rather than the 100,000 the table was anchored on.

One number in section 4.4 does not survive, and it is not a derivative number. The table counts five objects per image and prices only derivatives. If the originals are kept in R2 as well, at a measured mean of 1,770 KB each they add 303 GB and take the bill to $5.15 a month. That is still cheap, but it is eight times the derivative-only figure and it is the dominant term. Section 4.2 says originals go to "ephemeral disk on the build box (not kept)", so the intent is clear, but the consequence is that a re-encode at a different quality means re-harvesting 180,000 files from Commons at the polite pacer, which section 7b puts at 18.5 hours. The decision not to keep originals is a decision to make future re-encodes expensive in wall-clock rather than in dollars, and it is worth making that trade deliberately rather than by omission.

## Section 4.4 bandwidth table, recomputed

Twelve images per pageview at the 640 rung, on the measured mean of 36.6 KB.

| Pageviews/mo | Planned egress | Measured egress |
|---|---|---|
| 10,000 | 8.5 GB | 4.2 GB |
| 100,000 | 85 GB | 41.9 GB |
| 500,000 | 424 GB | 209.5 GB |
| 2,000,000 | 1.7 TB | 838.2 GB |

Half the planned figure throughout, because the plan used 45 KB for a rung that measures 36.6 and because the planned table appears to include the wire on top. The cost column does not move: it is $0 on Cloudflare at every row, which is the entire point of the zero-egress design, and it would be $0 at twice these numbers too.

The comparison rows in the original table do move. Bunny.net at 2M pageviews falls from $16.98 to about $8.20, and the Vercel Pro overage from roughly $105 to roughly $50. Neither changes the recommendation.

## Files touched

Created:
- Execution/P0/T008-avif-size-measurement.md

No code, data, cache or wire file was modified. The measurement scripts were written to the session scratchpad rather than the repository, because the task named no scripts to create and the repo rule is to touch only what the prompt names. They are described in enough detail to rebuild, and the sequence is given below.

libvips 8.15.3 was unpacked to `C:\Users\Gebruiker\vips\` outside the repository. It is a build tool, not a project dependency, and nothing in the repo references it.

## Commands run

```
curl -sL -o vips.zip https://github.com/libvips/build-win64-mxe/releases/download/v8.15.3/vips-dev-w64-web-8.15.3.zip
unzip -q vips.zip -d /c/Users/Gebruiker/vips

python sample_corpus.py  sample200.txt      # walk 5 Tier A caches, canonicalise, sample 200
python fetch_originals.py sample200.txt originals/   # 2 workers, 0.4 s pacer, maxlag=5
python retry_fetch.py    scratchpad/        # recover the transient failures, keep indices
python encode_avif.py    originals/ derivatives/ sizes.json
python analyse.py        sizes.json summary.json
python check_widths.py   originals/ sizes.json      # how many sources undershoot each rung
```

Fetch politeness matches `pipeline/photos/commons.py` as section 4.2 requires it be kept unchanged: two workers, 0.4 s pacer, `maxlag=5`, contact user agent. 199 fetches took about four minutes and moved 327 MB.

Encoding 199 originals to five derivatives each, 995 files, took about nine minutes on this laptop, single-threaded through one `vipsthumbnail` process per derivative. That is 2.7 seconds per original for the full ladder. Section 4.6 budgets a 6-hour CAX41 run for 100,000 originals on 16 ARM cores and concludes download is the constraint; at this rate the encode of 180,000 originals is roughly 135 core-hours, which is 8.5 hours on 16 cores. That is longer than section 4.6 assumes and it is no longer comfortably behind the download. The conclusion still holds because the two run concurrently and the harvest is 18.5 hours, but the margin is thinner than the section implies.

## Config and secrets set

None.

`PYTHONIOENCODING=utf-8` is required on this box for any script printing Commons file names, as T007 also found. The default console encoding is cp1252 and it raises UnicodeEncodeError on the first Nordic, Baltic or Greek title, which in this sample is a large minority of them.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| 320.avif median | 15 KB (assumed) | 12.3 KB (measured) | -18% |
| 640.avif median | 45 KB (assumed) | 33.0 KB (measured) | -27% |
| 1280.avif median | 150 KB (assumed) | 93.3 KB (measured) | -38% |
| 320.webp median | 20 KB (assumed) | 18.8 KB (measured) | -6% |
| 640.webp median | 60 KB (assumed) | 53.7 KB (measured) | -11% |
| p90 per rung | not known | 29.4 / 63.2 / 188.0 KB | new |
| AVIF ladder per image | 210 KB | 158.1 KB | -25% |
| All five per image | 290 KB | 237.3 KB | -18% |
| Derivative corpus at 179,386 | not stated | 40.6 GB | new |
| Derivative storage cost | under $1/mo (claimed) | $0.61/mo | confirmed |
| Egress at 2M pageviews | 1.7 TB | 838 GB | -52% |
| Egress cost at 2M pageviews | $0 | $0 | unchanged |
| Full-ladder encode rate | not measured | 2.7 s/original | new |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| vipsthumbnail exited 0 and wrote nothing | Native Windows binary handed a POSIX path from the bash tool | Pass Windows paths; the Python encoder resolves both sides before calling |
| First quality calibration was wrong | Asserted Q=63 was cq-level 32 from a formula applied backwards | Swept Q against the encoder; cq 32 is Q=50 |
| Derivatives 19 per cent larger than expected | `subsample-mode=off` forced 4:4:4 chroma | Removed; 4:2:0 default is correct for photographs |
| Shell loops reported zero bytes | Command substitution inside the quoted `-o` argument | Moved the loop into Python rather than fight the quoting |
| 10 of 200 fetches failed | Nine transient, one genuine 404 | Retried with a 1 s gap; nine recovered, the 404 is reported as a finding |

The first of those is the one worth carrying forward. It is the failure mode T007 warned about in a different shape: not a crash, but a zero exit code and a missing file. It would have produced an empty measurement set that looked like a successful run, and on a build box it would silently produce a bucket with no images in it. Any code calling libvips on Windows must assert the output exists rather than trust the return code.

## What is still open

The 404 rate is measured on one file out of 200 and that is too small a sample to plan against. It implies roughly 900 dead references across the corpus but the true figure could be several times either way. Someone should probe a few thousand canonical names for existence before the first transcode, because the difference between 900 and 9,000 is the difference between a log line and a data-quality problem.

The sample covers five of T007's eleven Tier A layers. The six not walked are `poi_licensed`, `dest_hero`, `dossier landmarks`, `features`, `citytrip` and `journeys`, together about a quarter of the corpus. There is no particular reason to expect them to encode differently, since they are the same Commons photographs selected by different harvesters, but it is an assumption and not a measurement.

Section 4.6's build-cost estimate needs revisiting with the encode rate this task measured. It assumes AVIF encoding "runs behind [the download] comfortably" and the measured 8.5 hours on 16 ARM cores against an 18.5 hour harvest is comfortable but not by the margin implied. It also assumes ARM encodes at x86 rates, which T006 is the task to confirm.

Whether originals are kept in R2 is unresolved and it is the largest single line in the storage projection. Section 4.2 says they are not kept and section 4.4 prices only derivatives, which are consistent, but the consequence is that any future re-encode costs an 18.5 hour re-harvest. That trade should be made explicitly.

The 4,280 non-raster Tier A files T007 found are not covered here. This task sampled raster only, by extension. The transcode stage still needs the drop rule T007 asked for, or it will hand ogg files to an image encoder.

## Rollback procedure

Delete the report and the branch. No data, schema, cache or wire file was written, and nothing outside the report was added to the repository.

```
git checkout main
git branch -D p0-avif-size-measurement
```

The libvips install is outside the repository and can be removed independently if it is not wanted:

```
rm -rf /c/Users/Gebruiker/vips
```
