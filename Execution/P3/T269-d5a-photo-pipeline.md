# T269 D5a: the photo pipeline before stage 8

## Task ID

T269

## Date

2026-10-02

## What changed

Stage 9 group D5 of `Execution/_OPEN-MASTER.md`, the pipeline half: rows T052-c, T051-c, T049-f, T049-i, T049-j, T050-c, T049-k, T051-d, T047-g and the image items of the P0 audits (T007, T008). No CSP and no app work, as the session notes said. All nine rows are closed. What only the owner can do (credentials, a box, a decision) is in new rows T269-a to T269-h.

Nothing live changed. There is still no R2 credential on this laptop, so everything below was run offline or as a dry run, and against the main checkout's caches and wire read through the new `CARTA_DATA_ROOT` variable (this worktree is sparse and has neither).

derive.py now does seven things it did not do.

The placeholder and the nothing-owed marker (T052-c, T051-c). Each manifest entry carries `p`, the 24 character hero placeholder, encoded by wire_ladder's own `encode_placeholder` from the 320 WebP rung while it is on disk, so the export box no longer needs `--img-root`. Each entry whose file Commons stamped as owing no credit carries `n: 1`. A file used by several rows is marked if any row recorded the stamp. `verify_attribution_cdn.py` now judges completeness from the manifest's `n` alone and cross-checks that every stamped file got it: 1,732 beach entries and 8 lake entries are marked, 0 entries are incomplete.

The published-first pass (T049-f). `derive.py sources <layer>` writes the layer's published list, hero first, to `img/manifest/_sources/<layer>.json`. The job already copies all of `img/manifest/` as `--prior`, so a run that finds the file there derives the 12,823 published beach titles before the cache's other 25,035. That is the about-17-hour first pass T049 asked for, without touching the job.

The other Tier A layers (T049-k, T007's orphans). Eight wire layers (trails, cycling, region, dossier, poi, dest, trips, journeys) read their sources from the wire or its sources file. None of them has a cache that carries a photograph's credit. So a record's own `lic` and `by` are trusted only when the record names an author itself. A cycling or trail row's `lic: ODbL 1.0` belongs to the geometry and is never read as the photo's licence. Every other file takes its licence, author and AttributionRequired from Commons' extmetadata in the same imageinfo request derive already makes, and the credit gate runs then. T007's 3,983 wire images with no cache behind them (3,491 of them cycling) are in these wires, so they now have a source reader. docs/PHOTOS.md gains a section on the derive stage.

The re-upload policy (T049-i). `run --recheck` asks Commons for the content sha1 of held files: one request per 50 titles, no download. A changed file gets a new address, the SHA-1 of `<title>#<content sha1>` (`revision_key`), and is derived there. The manifest and the wire's `ih` move to the new address and the old objects are left for gc. Nothing is ever rewritten in place. A not-held file whose content changed since its journal also gets the new address. The manifest now carries `s`, so the baseline survives after its journal is swept. takedown.py reads the manifests first, so it purges every address a title has had, not only the plain one, and records them in the ledger row as `h`.

Garbage collection (T049-j, T050-c). `derive.py gc` reads an `rclone lsf` listing of img/ and a copy of img/manifest/. It keeps every address the newest manifest of each layer names. It also keeps every address a journal names until a later manifest of that layer has folded the journal and 14 days have passed. It deletes everything else, plus any object of a title in the takedown ledger, even one a manifest still names (it warns about those). It refuses with no manifest at all, because an empty keep set would delete the bucket. It refuses a deletion over a quarter of the bucket unless `--force`. It is a dry run unless `--apply`. I did not add a lifecycle rule for the journals: an age rule cannot tell a folded journal from the only record of a layer whose first manifest is not written yet, and gc can.

The ledger floor (T050-c). Every manifest records how many takedown rows its run saw. A run that sees fewer refuses (exit 2). This is the backstop T050 said was missing: before, a lost ledger would have let a taken-down photograph back into R2.

The 404 probe (T008). `derive.py probe <layers> --sample N` asks imageinfo for a sample of names and reports the dead rate. On 3,000 names (1,000 each from beaches, lakes and mountains, seed 8) none was dead. T008's one 404 (`Priedaines katoļu baznīca.jpg`) comes back as missing, as does an invented title, so the detection works. A dead name in a run is logged and skipped, never fatal (T049 already did that).

Non-image files (T007, T008). These were already kept out by extension before fetch and by mime type at resolve. verify_derive.py now pins SVG, ogg, wav, webm, ogv and PDF as refused. The wire layers use the same gate.

The cycling and dossier credit check (T051-d). `verify_credit.py --drift` runs every credited photo record on a wire through the rule before and after T051's `clean()` change. Across cycling (3,035 records), dossier (54,831), region (16,726) and trails (11,276), 0 verdicts moved. The next export of those layers will lose no photograph to that change.

The CLIP check (T047-g, as a written procedure). `pipeline/photos/clip_parity.py` re-embeds N photographs whose x86 embedding is cached, without writing to the cache. It compares cosine distance and the LAION score, and passes under 0.002 and 0.05. docs/PHOTOS.md, section "Moving the photo caches to the CAX41", gives the three steps in order: the parity run on the box, the caches pushed without a hold, and the ownership decision, with a recommendation. The script's candidate selection ran here: 2,577 beach, 19,014 lake and 638 mountain records have a cached embedding. The model itself was not loaded, because the laptop had 1.1 GB free with ten sessions running. Running it is T269-d.

Also found: the trails wire publishes 102 photographs whose licence owes a credit and whose author is empty. The trails export does not gate on `owes_credit` (T269-f).

## Files touched

Root repo, branch p3-d5a-photo-pipeline. No app repo change.

**Modified:**
- pipeline/photos/derive.py
- pipeline/photos/takedown.py (every address, manifests first, ledger `h`, all layers' manifests)
- pipeline/photos/wire_ladder.py (docstring only: the manifest now carries `p`)
- pipeline/photos/verify_attribution_cdn.py (completeness from the manifest's `n`)
- pipeline/photos/verify_credit.py (`--drift`)
- docs/PHOTOS.md (two sections)
- Execution/_OPEN.md

**Created:**
- pipeline/photos/verify_derive.py
- pipeline/photos/clip_parity.py
- Execution/P3/T269-d5a-photo-pipeline.md

**Deleted:**
- None.

## Commands run

From the worktree in Git Bash, with `CARTA_DATA_ROOT="C:/Users/Gebruiker/Documents/Portfolio/Travel App"`, `PYTHONIOENCODING=utf-8` and, for libvips, `CARTA_VIPS_BIN=C:/Users/Gebruiker/vips/vips-dev-8.15/bin`. `$S` is the session scratchpad.

```
python pipeline/photos/derive.py selfcheck                         # libvips 8.15.3, avif and webp ok
python pipeline/photos/verify_derive.py                            # 67 checks hold
python pipeline/photos/verify_credit.py                            # 14 cases hold
python pipeline/photos/verify_credit.py --drift cycling dossier region trails   # 0 moved
python -c "...verify_takedown with ROOT at the main checkout..."   # holds
python -c "...verify_attribution_cdn with ROOT/APP at the main checkout, LAYER beaches and lakes..."   # both hold
python pipeline/photos/derive.py plan beaches [--published-only] [--prior $S/src/img/manifest]
python pipeline/photos/derive.py sources beaches lakes mountains trails cycling region --out $S/src
python pipeline/photos/derive.py plan trails --prior $S/src/img/manifest   # and cycling
python pipeline/photos/derive.py probe beaches lakes mountains --sample 1000 --seed 8 --json $S/probe_cache.json
python -m pyflakes pipeline/photos/*.py                            # clean, apart from verify_attribution_cdn's old unused os import
git show --stat HEAD                                               # after each commit
```

Each harness was also run with a planted fault (no placeholder, revision address equal to the plain one) to check that it fails. `infra/hetzner/cax41/verify.sh` was started and stopped when the disk filled; no infra file changed, so its result from T049 stands.

## Config and secrets set

None. New optional variable: `CARTA_DATA_ROOT` (derive.py, clip_parity.py, `verify_credit.py --drift`). It names where cache/ and continent-app/public/ are read from; the default is the repo root, and nothing writes there.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Layers derive.py can read | 3 | 11 | +8 |
| Beach titles derived before any unpublished one | not ordered | 12,823 of 37,858 | new |
| Published titles with a source list, trails / cycling / region | 0 / 0 / 0 | 10,628 / 2,855 / 12,833 | new |
| Of those, credit read from Commons at resolve, trails / cycling | none | 3,350 / 46 | new |
| Manifest entries marked nothing-owed, beaches / lakes | 0 | 1,732 / 8 | new |
| Manifest entries with an incomplete credit, beaches / lakes | 0 / 0 | 0 / 0 | 0 |
| Hero placeholder source | local img/ tree at export | the manifest (`p`) | moved |
| Dead names in a probe of 3,000 (T008: 1 in 200) | not probed | 0 (95% upper bound about 0.1%) | new |
| Credited photo records whose verdict moved under clean() | not checked | 0 of 85,868 | 0 |
| Garbage collection | none | `derive.py gc`, dry run by default | new |
| Offline checks on derive | 0 committed | 67 | +67 |

Time for one sources pass on this laptop under load: trails 798 s, cycling 708 s, region 285 s.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 13 stamped beach files had no `n` in the manifest | A file used by several rows took its stamp from the first row only | collect() marks a file nothing-owed if any of its rows recorded the stamp |
| A trails sources pass took 16 minutes | The wire walk stepped into every geometry coordinate | Lists whose leaves are numbers are skipped; still 13 minutes (T269-g) |
| Bash heredocs lost backslashes in two patch scripts | The known heredoc gotcha | Patch scripts written with the Write tool |
| The dossier sources pass failed with "No space left on device" | Drive C: was full (24 MB free), not from this task's files | Stopped the remaining passes and verify.sh; T269-g, T269-h |

## What is still open

The live half is the owner's. After the bucket and credential exist (T049-a), push the sources files (T269-a) and later run gc (T269-e). Making the sources file part of every export belongs in run_pipeline.py, which this task could not touch (T269-b). The job script accepts only the three cache layers, so a wire layer cannot run on the box yet, and `--recheck` and gc are not in its cadence (T269-c, infra/hetzner scope). The CLIP parity run and the cache ownership decision wait for a box (T269-d). The trails export ships 102 photos owing a credit (T269-f). The sources passes for dossier, poi, dest, trips and journeys were not measured, and the wire walk is slow (T269-g). Drive C: was full when this task ended (T269-h).

The eight wire layers' manifests are not joined into their exports. wire_ladder runs only in the three cache-layer exports, and those surfaces still hotlink. That is T052-d and T052-f, not new rows.

Nothing here needs the Claude API, and nothing calls it.

## Rollback procedure

Nothing live was created. In the repository, revert the commits on p3-d5a-photo-pipeline, newest first, or drop the branch before it is merged:

```
git revert <report commit> f088a139f ffeeeaada
# or, unmerged:
git branch -D p3-d5a-photo-pipeline
```

A manifest written by this code carries `n`, `p`, `s` and `ledger`. The T049 code ignores unknown fields, so a manifest in R2 stays readable after a revert. Revision addresses keep working as long as wire_ladder joins `h` from the manifest, which it does. The new takedown ledger field `h` is ignored by the old takedown.py.
