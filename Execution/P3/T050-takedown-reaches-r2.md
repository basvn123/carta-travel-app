# T050 Extend takedown.py to reach R2 in the same change

## Task ID

T050

## Date

2026-09-27

## What changed

Before this task, a takedown only scrubbed `continent-app/public`: the wire files a browser reads. Since T049 the same photograph can also live as five self-hosted objects on R2 (`img/{ab}/{cd}/{sha1}/{320,640,1280}.avif`, `{320,640}.webp`), served from `cdn.carta-europetravel.com` with a one-year immutable `Cache-Control`. A wire scrub alone would leave those five objects in the bucket, still served at the edge and cached in every browser that had already fetched one, for up to a year. `pipeline/photos/takedown.py`'s `add` now does four things in order: scrub the wire (unchanged), delete the five R2 objects (`rclone purge` of the sha1 prefix, via `derive.r2_purge_cmd`), purge the same five URLs from Cloudflare's edge cache (the `purge_cache` API), and drop the title from every layer's `img/manifest/<layer>.json` (re-hashing `inputs_hash` the same way `derive.build_manifest` would, so the rewritten manifest is indistinguishable from one `derive.py` produced). The ledger row gains three fields, `r2`, `edge` and `manifest`, each recording what happened per layer.

A takedown reaches five places now instead of one, and every one of the new four steps degrades to a named, visible status rather than a silent no-op: "skipped: no RCLONE_CONFIG_R2_* credential" when there is no credential to act with, "ok: nothing was in R2" when a title was gated out before it ever reached the bucket, or "failed: ..." when a real attempt did not work. `add` always exits non-zero if anything failed, and the wire scrub has already happened by then; it is never rolled back. A `reach <needle>` subcommand re-runs the R2/edge/manifest three alone, for a title already in the ledger, so a failure found later does not require re-scrubbing the wire to retry.

## Files touched

**Modified:**
- pipeline/photos/takedown.py (r2_delete, edge_purge, edge_purge_cmd, manifest_purge, _rehash_manifest, reach, `add --dry-run`, `add` now calling reach, new `reach` subcommand, ledger rows gain r2/edge/manifest fields)
- pipeline/photos/verify_takedown.py (a dry-run check of r2_delete and edge_purge against the scrub's own target, and a manifest_purge check against a throwaway local manifest)
- docs/PHOTOS.md (the takedown.py line and the running-it commands now mention R2, the edge and the manifest)

**Created:**
- Execution/P3/T050-takedown-reaches-r2.md (this report)

**Deleted:**
- None.

derive.py was not touched. Everything T050 needed (`canonical_title`, `sha1_of`, `base_key`, `keys_for`, `cdn_url`, `r2_purge_cmd`, `LAYERS`, `IMG_PREFIX`, `MANIFEST_DIR`, `MANIFEST_SCHEMA`, `MANIFEST_CACHE`, `REMOTE`, `BUCKET`, `LADDER`, `LADDER_V`, `load_manifest`) already existed from T049, which named these as T050's interface in its report. `derive.py` does `import takedown` at module load, so `takedown.py` imports it lazily, inside each function that needs it (`_derive()`), rather than at the top of the file; a top-level `import derive` in takedown.py would be circular and fail.

## Commands run

From the repo root in Git Bash. `Get-Process python` showed nothing before any of this; nothing here writes master data, only a session scratchpad and, in tests, throwaway directories under a temp prefix.

```
git log --oneline -4                                   # confirm 07eab8b71 is HEAD~1
python -c "import ast; ast.parse(open('pipeline/photos/takedown.py', encoding='utf-8').read())"
python -c "import sys; sys.path.insert(0,'pipeline/photos'); sys.path.insert(0,'pipeline'); import takedown, derive"   # circular import check
# manifest_purge against a throwaway local manifest (see "What was tested")
# add/reach CLI end to end against a throwaway PUBLIC and LEDGER
python pipeline/photos/verify_takedown.py               # full run, see below
git add pipeline/photos/takedown.py pipeline/photos/verify_takedown.py docs/PHOTOS.md
git commit --fixup=07eab8b71 -m "fixup! T049: derive.py image ladder (3 AVIF + 2 WebP, content-addressed) and the image_transcode CAX41 job"
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash 07eab8b71~1   # refused, see below
git rebase --abort                                       # no rebase was in progress; nothing to undo
git commit --amend -m "T050: takedown.py reaches R2, the Cloudflare edge and the manifest ..."
git show --stat HEAD
# afterwards, from the orchestrating session, without a checkout: read-tree, update-index and
# commit-tree rebuilt the T049 code commit with these three files folded in, and the two report
# commits were re-parented onto it; the final tree is identical, only the history changed
```

`verify_takedown.py`'s real output (the target and the counts change run to run because it samples the live wire):

```
target: View_to_the_western_Cape_of_Skiathos%2C_Koukounaries_Beach%2C_Skiathos%2C_Greece%2C_2016.jpg (2 records)
  6348 images across 8 files, 2 carry the target
  <tmp>\public\beaches\GR.json: removed 2
  scrub touched 1 files in 0.2 s, removed 2 image records
+ rclone purge r2:carta/img/3b/61/3b61d9f265e79a62a40c8c2b5da0326ee9e2956c
+ curl -X POST https://api.cloudflare.com/client/v4/zones/<CLOUDFLARE_ZONE_ID>/purge_cache -H 'Content-Type: application/json' -H 'Authorization: Bearer <redacted>' --data {"files": [...]}
  R2 dry-run: dry-run; edge dry-run: dry-run; manifest_purge: ok: local copy rewritten, 1 files left
takedown path holds: the photograph goes, the place stays, the ledger keeps it out
```

## Config and secrets set

None. The new code reads, but this session never set: `RCLONE_CONFIG_R2_ENDPOINT` (or `CARTA_RCLONE`) gates whether `r2_delete` and `manifest_purge` attempt anything real, versus reporting "skipped"; `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` gate `edge_purge` the same way. `CARTA_R2_BUCKET`, `CARTA_R2_REMOTE` and `CARTA_RCLONE` (all already defined in derive.py) are reused as is. No token, account id or zone id was typed into any file; `edge_purge_cmd`'s dry-run output prints `<redacted>` for the bearer token and `<CLOUDFLARE_ZONE_ID>` for the zone, never the real values, because dry-run's purpose is a command an operator can read and paste, and paste is exactly how a token would leak into a terminal log or this report.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Places one takedown reaches | 1 (the wire) | 4 (wire, 5 R2 objects, 5 edge URLs, N layer manifests) | +3 |
| Ledger row fields | needle, reason, at | + r2, edge, manifest (per layer) | +3 fields |
| takedown.py subcommands | add, scrub, list | + reach; add and scrub gain --dry-run | +1 subcommand |
| Dry-run takedown time (add --dry-run, this laptop, one title) | n/a (no dry-run existed) | 0.4 s (canonical_title resolve, print 2 commands, print N manifest reads) | new |
| Live-tested takedown reach | wire only (verify_takedown.py) | wire proven live; R2 delete, edge purge and manifest rewrite proven in dry-run form and against a throwaway local manifest; live R2/edge not reachable from this laptop (no credential) | dry-run proven, live pending (T050-a) |

The dry-run timing is the whole `add --dry-run` path for one title against the real repository: `canonical_title`, one `r2_purge_cmd` print, one Cloudflare command print, and a manifest read attempt for each of the three layers (`beaches`, `lakes`, `mountains`) via `rclone cat`, which itself is not run in dry-run (only the command is printed), so the number is dominated by process start and import, not I/O.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First manual test reported "no wire file carried a match" | The test needle was `File:Test image.jpg` (space) against a URL containing `Test_image.jpg` (underscore); `scrub`'s needle match is a literal lowercase substring test against the raw text, not through `canonical_title`'s folding | Not a bug in this task's code: it is how `scrub` (T-prior, unchanged) has always matched. Retested with a needle that is a literal substring of the URL, which is the documented, correct way to call `add`; noted here so the next person does not rediscover it |
| `git commit --fixup` plus a `-m` produced a duplicated commit subject line | `--fixup` already writes its own message; passing `-m` appended a second copy | Harmless since the fixup commit was later amended away entirely (see below); no fix needed, noted for the log |
| The autosquash rebase (`git rebase -i --autosquash 07eab8b71~1`) was refused: "cannot rebase: you have unstaged changes" | The working tree carries other tasks' uncommitted edits (continent-app/*, "additional docs/", etc.), which this task must never touch, stash or commit, and git refuses any rebase with unstaged changes present regardless of which files they are | The task session first shipped a plain new commit on top of the report commit. The orchestrating session then folded it in with git plumbing (`read-tree`, `update-index --cacheinfo`, `write-tree`, `commit-tree`, `reset --soft`), which never touches the working tree, so the other tasks' files were not stashed or moved. The code commit `31bf3c0bf` now carries T049 and T050 together and the same-commit requirement is met |

## What is still open

The live path is unproven. No R2, rclone or Cloudflare credential exists on this laptop (T044 to T049 all record the same gap), so `r2_delete`, `edge_purge` and the real (non-work-dir) branch of `manifest_purge` have only been exercised as dry runs or against throwaway local files standing in for R2. The first real takedown, once T049-a to T049-d have put a credential, a bucket and at least one derived layer in place, is `Execution/P3/_OPEN-hetzner.md` step 27 (T050-a in the register): pick a title already derived, dry-run it, run `add` for real, confirm all three of `r2`, `edge` and every layer's `manifest` status come back `ok`, then curl the five CDN URLs and read the manifest back from R2 to confirm the title is gone and `inputs_hash` changed.

The same-commit requirement in the task prompt is met, but not the way the prompt suggested. The autosquash rebase was refused because other tasks have unstaged changes in this working tree. The orchestrating session folded T050's three files into T049's code commit with git plumbing instead, which rewrites history without a checkout. The result is one code commit, `31bf3c0bf`, carrying derive.py and takedown.py together, with the two report commits re-parented on top and an identical final tree. Nothing had been pushed, so no one else saw the intermediate hashes.

No garbage collection was added for a title's own leftover R2 objects beyond the purge this task performs; the backstop against a taken-down title reappearing is `derive.py`'s existing `is_taken_down` gate on the source list, unchanged by this task, plus the ledger itself never being lost (T050-c, not blocking).

Nothing here needs the Claude API, and nothing calls it.

## Rollback procedure

The code is a pure addition to `pipeline/photos/takedown.py` and `pipeline/photos/verify_takedown.py`, plus two lines in `docs/PHOTOS.md`; nothing it does runs automatically, and nothing was run for real against R2 or Cloudflare from this laptop. To undo:

```
git revert <T050 report commit> <code commit 31bf3c0bf>   # the code commit also carries T049
# or, unmerged:
git checkout p3-on-demand-cax41 && git branch -D p3-image-derivative-ladder
```

If a real takedown has since been run with this code (T050-a completed), reverting the commit does not undo that takedown: the wire scrub, the R2 delete and the edge purge are one-way in the sense that a takedown is supposed to be (the whole point is that the photograph does not come back). Restoring a wrongly-removed photograph after a real run means re-adding it to the source caches and re-running `derive.py` and the layer's export, not reverting this commit; the ledger's `reason` field is where the record of why it was removed lives, and removing a ledger row without a genuine reason to reinstate the file would defeat the ledger's purpose.
