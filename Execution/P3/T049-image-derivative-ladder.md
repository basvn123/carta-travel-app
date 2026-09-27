# T049 Build derive.py: content-addressed AVIF and WebP ladder

## Task ID

T049

## Date

2026-09-27

## What changed

The photo engine now has a derive stage, `pipeline/photos/derive.py`, and the CAX41 has a real `image_transcode` job that runs it. Nothing is live yet. There is no R2 credential and no HCLOUD_TOKEN on this laptop, so no object has been written to the bucket and cdn.carta-europetravel.com serves nothing. The done condition (beaches fully derived and served from the CDN) is not met. It is register rows T049-a to T049-d, and the owner procedure is steps 22 to 26 of `Execution/P3/_OPEN-hetzner.md`. What does exist was run end to end on this laptop against 81 real beach originals from Wikimedia (12, 60 and 9 in three runs), with libvips 8.15.3 and pyvips 3.2.0, and with the R2 step as a dry run that prints the exact rclone commands and headers.

How it works, for whoever maintains it. A run is for one layer. The source list is the layer's rich cache, every image record in `cache/<layer>/rich_*.json`, ordered hero-first across rows (all image 0s, then all image 1s), so a run cut short has covered the leads. Each record passes five gates before anything is fetched: it must have a canonical title, be a raster file, carry a storable licence (T010: not empty, no NC, no ND), not owe a credit it lacks (`credit.owes_credit`, the gate the exports already apply), and not match the takedown ledger (`takedown.is_taken_down`). A file that fails a gate never reaches R2. The canonical title is the identity: `File:<Name>` for Commons with Commons' own folding (percent-decoded, underscores to spaces, first letter upper-cased, NFC), and `geograph:<id>` for Geograph, because a Geograph record's cached `file` field is its caption and is not unique. The address is the SHA-1 of that title, and every derivative lives at `img/{ab}/{cd}/{sha1}/{320,640,1280}.avif` and `{320,640}.webp`.

Then the held check. A source is skipped when R2 already holds all five objects (read from one `rclone lsf -R` listing of `img/`) and a prior manifest or journal knows its pixel sizes. Held sources cost nothing: no request to Wikimedia, no encode, no upload. Everything else is resolved with one Commons imageinfo call per 50 titles at maxlag=5 (the 1920 px thumbnail URL, the mime type, Commons' content sha1; SVG, audio and video drop out here, and a missing file is logged as dead), then fetched by two worker threads through `pipeline/beaches/sources.py` `request()`, the same pacer, backoff and contact user agent the harvests use. Harvest code was not touched. Originals are written to the work directory and deleted as soon as they are encoded, with at most 64 on disk at once. libvips encodes on every core: `thumbnail` with shrink-on-load, never upscaled (a source narrower than a rung is written at its own width and the manifest says so), sRGB, metadata stripped, AVIF at Q 50 (cq-level 32, T008's calibration), effort 4, 4:2:0, and WebP at Q 75, effort 4. Every output is checked for its magic bytes, because T008 saw libvips exit 0 and write nothing.

Upload is per batch of 200 sources: two `rclone copy` calls, one per format so each object gets its own Content-Type, both with `Cache-Control: public, max-age=31536000, immutable`, `--s3-no-check-bucket` and `--no-check-dest` (nothing in the batch is held, so no HEAD per object is spent). Then a journal object at `img/manifest/_journal/<layer>/<run>-<n>.json` names what the batch put there, with each source's pixel sizes. Images go first and the journal second, so a journal entry always means its five objects exist. Last comes the per-layer manifest at `img/manifest/<layer>.json`, with `Cache-Control: public, max-age=300`. It is written only when its `inputs_hash` differs from the previous manifest's, so a second run over an unchanged layer uploads nothing at all. The hash covers each entry's rank_v, so a rescore that changes the ranking rewrites the manifest and no image.

Why the worker writes `img/` directly, when T047's rule is that workers stage and the orchestrator promotes. The rule exists so a failed run cannot replace a good artifact. A content-addressed object cannot be replaced by a worse one: a key is either absent or holds that source's ladder, and held keys are never rewritten. Nothing points at a new object until the manifest does, and the manifest is written last. Staging would push the ladder twice (about 7 GB for full beaches) and rclone's server-side promote does not carry the per-object headers. What still goes through staging is `out/`: the run report, the journals and a manifest copy, promoted to `archive/built/derive/` as the record of the run.

Why the time budget. The laptop measurement below says a source takes about 4.9 s of wall clock to fetch at the harvest's politeness, so the full beaches layer (37,858 sources) is about 51 hours of fetching, far past one 8 h ceiling. The architecture document's "one 6-hour run, about EUR 0.35" does not survive that number. So `derive.py run --budget-s` stops starting fetches when the budget runs out, finishes the batch in hand, writes the manifest for what exists, reports how many are left and exits 0. The job script sets the budget from the worker's deadline. Each run continues from what R2 holds, and hero-first order means the leads are done first. A signal (the ceiling's `timeout`, Ctrl-C) instead exits 75 without a manifest, and the journals carry the progress. Whether the CAX41's link to Wikimedia is faster than the laptop's is the first thing the first real run will show (`ms_each.fetch` in its report).

The CAX41 side. `infra/hetzner/jobs/image_transcode.sh` replaces T047's stub, keeping the job name. It extracts `archive/caches/<layer>-cache.tar.gz` at the repo root, refuses a layer whose tarball carries a rescore hold (exit 5, as clip_sweep does, because a cache packed mid-rebuild can be missing rows), widens the sparse clone to `cache/photos` so the takedown ledger is present, runs `derive.py selfcheck` (exit 6 if either format cannot be written), copies `img/manifest/` and lists `img/` read-only, and then runs derive.py per layer with every core. `jobs.tsv` gives it a new `vips` need, and `worker.sh` installs `libvips-dev` and `libheif-plugin-aomenc` from apt, then `pyvips==3.2.0`. The plugin matters: Ubuntu 24.04 ships libheif's AV1 encoder as a separate package, and without it libvips 8.15 reads AVIF but cannot write it. The package name and its arm64 build (1.17.6-1ubuntu4, ports) were checked on packages.ubuntu.com. pyvips is an sdist only, so it installs without `--only-binary`. The job's outputs prefix is `archive/built/derive`; the expected hours are 7.5 against the 8 h ceiling, because a beaches run is expected to use its whole budget.

## Interfaces for T050 and T052

T050 (takedown reaching R2) uses `derive.canonical_title(value)` (a title, any Commons or Geograph URL, or a cache or wire image record), `derive.sha1_of(title)`, `derive.base_key(title_or_sha1)`, `derive.keys_for(title_or_sha1)` (the five keys, in ladder order), `derive.cdn_url(title_or_sha1, width, fmt)` and `derive.r2_purge_cmd(title_or_sha1)`, which returns `["rclone", "purge", "r2:carta/img/{ab}/{cd}/{sha1}"]`. The purge is not enough on its own: the objects were served as immutable for a year, so the five CDN URLs must also be purged from Cloudflare's cache. `python pipeline/photos/derive.py key "<title or URL>"` prints all of it for one file.

T052 (the app's picture element) reads `img/manifest/<layer>.json`, schema `carta.img-manifest.v1`:

```
{"schema": "carta.img-manifest.v1", "layer": "beaches", "ladder": "ladder_v1",
 "base": "https://cdn.carta-europetravel.com/img",
 "path": "{h0_2}/{h2_4}/{h}/{w}.{fmt}",
 "rungs": {"avif": [320, 640, 1280], "webp": [320, 640]},
 "encoder": {...}, "page": {"commons": "https://commons.wikimedia.org/wiki/{title}",
                            "geograph": "https://www.geograph.org.uk/photo/{id}"},
 "generated_at": "...", "run": "...", "inputs_hash": "<sha1>", "count": 60,
 "rank_v": {"none": 56, "photo_rank_v1": 4},
 "credits": [["CC BY-SA 4.0", "Johan Allard"], ...],
 "files": {"File:Some beach.jpg": {"h": "<sha1>", "d": [[320, 213], [640, 427], [1280, 853]],
                                   "c": 0, "r": "photo_rank_v1"}}}
```

`h` is the sha1 of the key, `d` the real pixel size of the 320, 640 and 1280 rungs (the WebP rungs share them; a rung can be narrower than its name, and the srcset descriptor should use the real width), `c` an index into `credits` ([licence, author]), `r` the rank_v of the record when it was scored. The wire's image records carry a `page` URL from which `canonical_title` recovers the key. The manifest is about 180 bytes per source, so full beaches is about 6.8 MB raw and 3 MB gzipped: T052 should join `h` and `d` into the wire at export rather than fetch the manifest in the browser.

## Files touched

Code commit:

**Created:**
- pipeline/photos/derive.py

**Modified:**
- infra/hetzner/jobs/image_transcode.sh (the stub becomes the derive job)
- infra/hetzner/jobs/jobs.tsv (image_transcode row: inputs, outputs, 7.5 h expected, the vips need)
- infra/hetzner/jobs/worker.sh (the vips need: apt libvips-dev and libheif-plugin-aomenc, pip pyvips 3.2.0)
- infra/hetzner/cax41/verify.sh (image_transcode is no longer a stub; checks for its commands, its hold refusal and the worker's vips setup)
- infra/hetzner/README.md (the jobs table and the derive stage)

Report commit:

**Created:**
- Execution/P3/T049-image-derivative-ladder.md

**Modified:**
- Execution/_OPEN.md (rows T049-a to T049-k; T047-h annotated)
- Execution/P3/_OPEN-hetzner.md (steps 22 to 26)

**Deleted:**
- None.

verify.sh sits in `infra/hetzner/cax41`, which the task named. Without the edit it fails, because it asserted that image_transcode exits 3. docs/PHOTOS.md was not touched and does not yet describe the stage (T049-k).

## Commands run

From the repo root in Git Bash. `$S` is the session scratchpad. libvips 8.15.3 is T008's install at `C:\Users\Gebruiker\vips\vips-dev-8.15`; pyvips 3.2.0 was already installed in the system Python. Nothing was installed. `Get-Process python` was checked before every network run. One unknown python process (no command line visible, started 21:01) was running during the first run and gone before the second; nothing here writes master data or any repo file.

```
git checkout -b p3-image-derivative-ladder            # from p3-on-demand-cax41
export CARTA_VIPS_BIN="C:/Users/Gebruiker/vips/vips-dev-8.15/bin"
python pipeline/photos/derive.py selfcheck             # libvips 8.15.3, avif and webp written
python pipeline/photos/derive.py plan beaches
python pipeline/photos/derive.py plan beaches --published-only
curl -s https://pypi.org/pypi/pyvips/3.2.0/json          # sdist only
curl -sL "https://packages.ubuntu.com/search?keywords=libheif-plugin-aomenc&suite=noble"   # arm64 in ports

# 12 sources, R2 as a dry run, then the same run again against its own output
python pipeline/photos/derive.py run beaches --published-only --sample 12 --seed 49 \
  --upload dry-run --out $S/t049/run1 --run-id 20260927t000000z-t049a
python pipeline/photos/derive.py run beaches --published-only --sample 12 --seed 49 \
  --upload dry-run --out $S/t049/run1 --held $S/t049/run1/img --prior $S/t049/run1/img/manifest \
  --run-id 20260927t000100z-t049b                       # 12 held, 0 derived, manifest unchanged, no command printed
# the measurement run
python pipeline/photos/derive.py run beaches --published-only --sample 60 --seed 4949 \
  --upload none --out $S/t049/run3 --run-id 20260927t001000z-t049c
python $S/t049/jpeg500.py $S/t049/run3                  # the same 60 sources' 500 px JPEG from the wire
# the budget, twice: the second run continues
python pipeline/photos/derive.py run beaches --published-only --sample 30 --seed 11 --budget-s 20 \
  --upload none --out $S/t049/run4 --run-id 20260927t002000z-t049d
python pipeline/photos/derive.py run beaches --published-only --sample 30 --seed 11 --budget-s 20 \
  --upload none --out $S/t049/run4 --held $S/t049/run4/img --prior $S/t049/run4/img/manifest \
  --run-id 20260927t002100z-t049e
python $S/t049/test_derive.py $S/t049/run1              # 18 passed, 0 failed
bash infra/hetzner/cax41/verify.sh                      # 86 passed, 0 failed, 3 skipped
git show --stat HEAD                                    # after each commit
```

The first run's dry-run output is the R2 path, verbatim apart from the local path:

```
+ rclone copy <work>/stage/b00000 r2:carta/img --include '*.avif' --header-upload 'Cache-Control: public, max-age=31536000, immutable' --header-upload 'Content-Type: image/avif' --s3-no-check-bucket --no-check-dest --transfers 16 --checkers 16 --retries 3 --low-level-retries 10 --stats 0
+ rclone copy <work>/stage/b00000 r2:carta/img --include '*.webp' --header-upload 'Cache-Control: public, max-age=31536000, immutable' --header-upload 'Content-Type: image/webp' ...same flags
+ rclone copyto <out>/img/manifest/_journal/beaches/<run>-00001.json r2:carta/img/manifest/_journal/beaches/<run>-00001.json --header-upload 'Cache-Control: no-store' --header-upload 'Content-Type: application/json' --s3-no-check-bucket --retries 3
+ rclone copyto <out>/img/manifest/beaches.json r2:carta/img/manifest/beaches.json --header-upload 'Cache-Control: public, max-age=300' --header-upload 'Content-Type: application/json' --s3-no-check-bucket --retries 3
```

test_derive.py checks, offline: nine shapes of one Commons file (bare, with namespace, lower-case, page URL encoded and not, upload, thumb and thumb.wikimedia.org URLs, a wire record) fold to one title; a Geograph record is addressed by its id; a Commons import named "... geograph.org.uk ..." stays a Commons title; the five keys and the purge command; the licence gate refuses NC, ND, no licence and BY-SA with no author, and allows CC0 without an author; a throwaway takedown ledger keeps a real beach title out of the source list (the repo ledger was never written); an rclone lsf listing and a local tree read as the same 60 held objects; the journals alone know all 12 sources with the same pixel sizes as the manifest; a source missing one of its five objects is not held; and no rung is wider than its name. verify.sh's new checks are: the job's dry run runs selfcheck, widens the clone, lists `img/` and calls derive.py with `--upload r2`; it refuses a held layer with exit 5; and worker.sh's dry run installs libvips-dev, the aomenc plugin and pyvips, and no torch.

## Config and secrets set

None were set. The real run needs what T045-a puts in the orchestrator's secrets file (`RCLONE_CONFIG_R2_*`), which spawn.sh already hands to the worker. derive.py refuses `--upload r2` without `RCLONE_CONFIG_R2_ENDPOINT` in the environment. Optional variables: `CARTA_VIPS_BIN` (Windows only, libvips' bin directory), `CARTA_R2_BUCKET` (default carta), `CARTA_R2_REMOTE` (default r2), `CARTA_RCLONE` (the rclone binary), and `CARTA_DERIVE_BUDGET_S` (the job's budget when no worker deadline is set; default 21600). `PYTHONIOENCODING=utf-8` is still needed on this laptop for any output that prints Commons titles.

## Before/after measurements

What the beaches layer holds and what the stage would derive, from `derive.py plan beaches` on the laptop's caches and wire:

| Metric | Before | After | Delta |
|---|---|---|---|
| Beach image records in the rich cache | 40,625 | 40,625 | 0 |
| Unique beach sources after the gates | not counted with gates (T007: 37,507 unique originals) | 37,858 (20 refused for a missing credit) | new |
| Unique titles the beaches wire publishes (14,022 references) | 12,823 | 12,823, every one inside the gated set | 0 |
| Derivatives in R2 | 0 | 0 (no credentials) | 0 |
| Derivatives to write, full layer / published only | none planned | 189,290 / 64,115 objects | new |
| Formats and widths served | 1 (JPEG, 500 px) | 2 formats, 3 widths, when live | new |

Bytes per derivative, measured on 60 random published beach sources (seed 4949), each against the 500 px JPEG the wire serves for the same source today:

| Object | Mean | Median | p90 | Mean vs 500 px JPEG |
|---|---|---|---|---|
| 500 px JPEG (today) | 92.8 KB | 54.9 KB | | 1.00 |
| 320.avif | 7.0 KB | 6.6 KB | 11.5 KB | 0.08 (13x smaller) |
| 640.avif | 27.1 KB | 24.6 KB | 42.4 KB | 0.29 (3.4x smaller) |
| 1280.avif | 108.3 KB | 102.9 KB | 190.3 KB | 1.17 |
| 320.webp | 9.8 KB | 9.6 KB | 14.8 KB | 0.11 |
| 640.webp | 37.9 KB | 35.3 KB | 59.1 KB | 0.41 |
| All five per source | 190.0 KB | | | |

A card at 640 AVIF weighs 29 per cent of today's 500 px JPEG on the mean and 45 per cent on the median, while being 28 per cent wider. The architecture's "roughly 3x smaller" holds on the mean. The median ratio is smaller because the JPEG mean is pulled up by a tail of large thumbnails. A hero at 1280 AVIF costs about what a 500 px JPEG costs today. Against T008's 199-file sample the 320 and 640 AVIF rungs come out smaller (6.6 and 24.6 KB median against 12.3 and 33.0) and the 1280 rung slightly larger (102.9 against 93.3 KB). The difference is the sample (published beaches only) and the source (a 1920 px thumbnail rather than 2560); both are within T008's spread.

Projected storage for beaches, from the measured mean: 37,858 sources at 190.0 KB is 7.2 GB (about $0.11 a month on R2), and the published 12,823 is 2.4 GB.

Time, measured on the laptop over the same 60 sources with 2 fetch workers and 12 encode threads: 293 s for all 60, 4.9 s of wall clock per source. A fetch takes 4.3 s median, 9.6 s mean and 31.4 s p90, and a probe of 10 more files showed the same erratic latency on the 500 px thumbnails the app loads today (0.4 s to 28 s), so it is Wikimedia's or the laptop's link and not the 1920 px size. The encode of all five rungs is 2.6 s mean on one thread. On 16 cores the full beaches encode is about 1.7 hours of wall clock, so download is the constraint, as section 4.6 says. But the download is about 51 h for the full layer and 17.5 h for the published subset at this rate, not the 4 hours section 4.6 assumed for 100,000 files. That is about 8 runs of 8 h at EUR 0.45 each (EUR 3.6) for full beaches, unless the CAX41's link is faster. Idempotency: a second run over the same 12 sources made no request, printed no rclone command and left the manifest unchanged (inputs_hash c28eaeee5cc4), in 3.1 s.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 5,322 beach records had no title | The Geograph test matched "geograph.org.uk" anywhere in a URL, and Commons holds thousands of Geograph imports with that in the file name | Test the URL's host, not a substring; a unit test pins it |
| Every encode failed with "unable to call webpsave_buffer" | `thumbnail` streams its source sequentially, so its pipeline can be evaluated once, and the second saver hit "out of order read" | Render each rung to memory (`copy_memory`) and save both formats from it |
| Two edits written through a Bash heredoc lost their backslashes | The known heredoc gotcha | Redone with the Edit tool; verify.sh line continuations restored |
| The printed rclone command left `*.avif` unquoted | The quoting helper treated `*` as safe | `*` removed from the safe set; the commands now paste into a shell unchanged |

## What is still open

The done condition is the owner's to finish, in order: put the bucket, the domain, the R2 lines, a proven selftest, the beaches cache in R2 and the pushed branch in place (T049-a, order 49); the dry run on the box (T049-b, 50); the first real beaches run with a curl check of the headers, which is also the first live test of libheif-plugin-aomenc and pyvips on arm64 (T049-c, 51); and repeat runs until the report says nothing is left (T049-d, 52). Only then lakes and mountains. The optional Cache Rule under `/img/` is T049-e. The procedure is steps 22 to 26 of `Execution/P3/_OPEN-hetzner.md`.

For later tasks. The worker has no wire, so the job derives every gated cache source (37,858 for beaches) where the app shows 12,823. At the measured rate that is roughly three times the runs, and a published-title list pushed to R2 would let the first passes do what the app shows (T049-f). T050 must purge from R2 with `r2_purge_cmd` and also purge the five CDN URLs from Cloudflare's cache, because the objects are immutable for a year at the edge (T049-g). T052 should join `h` and `d` into the wire at export rather than fetch a 3 MB manifest, and must add cdn.carta-europetravel.com to the CSP img-src (T049-h). The address is the title, so a Commons re-upload under the same title keeps its old derivative. The journals record Commons' content sha1 but nothing compares it yet; the fix is a new ladder path, never a rewrite in place (T049-i). Journals accumulate and objects of sources that leave a layer are never deleted (T049-j). Only the beaches, lakes and mountains caches have source readers, and docs/PHOTOS.md does not describe the stage (T049-k).

T047-h is not closed. Its image_transcode half is done here (derive.py, the vips need in jobs.tsv and worker.sh); the planetiler stub remains, and the row says so.

Nothing here needs the Claude API, and nothing calls it.

## Rollback procedure

Nothing live was created, so today there is nothing to undo outside the repository. The laptop runs wrote only to the session scratchpad.

Once the owner has run the job, what it wrote is under `img/` in R2 and under `archive/built/derive/`. Every object is content-addressed and nothing reads it until T052 ships, so leaving it in place is harmless. To remove it all:

```
rclone purge r2:carta/img/manifest            # manifests and journals
rclone delete r2:carta/img --include "*.avif" --include "*.webp"
rclone purge r2:carta/archive/built/derive
```

and, if the CDN has served any of it, purge the zone's cache for cdn.carta-europetravel.com in the Cloudflare dashboard.

In the repository, revert the two commits, newest first, or drop the branch before it is merged:

```
git revert <report commit> <code commit>
# or, unmerged:
git checkout p3-on-demand-cax41 && git branch -D p3-image-derivative-ladder
```

Reverting the code commit restores T047's stub (the job exits 3 again) and verify.sh's check for it. T050 is planned to amend the code commit with the takedown extension; if that has happened, reverting it removes both.
