# T014 — Reclaim tens of GB locally, for free

## Task ID

T014

## Date

2026-09-23

## What changed

C: was down to 0.81 GB free at the start of this task, which is the real reason this task mattered today, not an abstract cleanup. Four things were removed: `continent-app/dist`, `continent-app/node_modules`, `continent-app/du.exe.stackdump`, and four of the five ~110 MB `app_data.*.json` masters. `app_data.json`, the current production master, stays.

Before deleting the four masters, they were copied from the existing `$TEMP/carta-master-snapshot/` staging copy (made in T005) onto the USB drive at `D:\carta-backups\app_data_masters\`, and the SHA256 checksums from T005 were re-verified against that USB copy before anything local was deleted. T005's report had flagged that its backup never left this machine; that gap is closed now, at least until R2 exists and can take over as the real archive per §6.3 of the architecture doc.

The fifth item in the task, compacting the Docker Desktop WSL2 vhdx, is the one still open. It is also the largest: `docker_data.vhdx` is 19.11 GB, almost all of it slack Docker never returned to Windows, and it dwarfs everything else combined. Compacting it needs `diskpart`, and `diskpart` needs administrator elevation that this session cannot grant itself. The commands to run it are below.

## Files touched

**Modified:**
- app_data/MASTERS_MANIFEST.txt (recorded the T014 deletion, the USB backup location, and an updated restore procedure)

**Deleted:**
- continent-app/dist/ (build output, regenerates with `npm run build`)
- continent-app/node_modules/ (regenerates with `npm install`)
- continent-app/du.exe.stackdump (crash artifact from a Windows port of `du`, harmless to lose)
- app_data/app_data.pre_transit_copy.json
- app_data/app_data.wave2.json
- app_data/app_data.pre_accom_v16.json
- app_data/app_data.backup.json

**External storage:**
- D:\carta-backups\app_data_masters\ (all five masters, SHA256SUMS.txt, MASTERS_MANIFEST.txt — new, this task)

None of the deleted files were tracked in git; `app_data/` and `continent-app/node_modules` and `continent-app/dist` are all gitignored, so `git status` shows no trace of the deletions.

## Commands run

```bash
# Verify the USB drive holds a different backup (Supabase dumps), not the masters
ls -la /d/carta-backups

# Copy the five masters from the T005 staging copy to the USB drive
mkdir -p /d/carta-backups/app_data_masters
cp "$TEMP/carta-master-snapshot/"*.json \
   "$TEMP/carta-master-snapshot/SHA256SUMS.txt" \
   "$TEMP/carta-master-snapshot/MASTERS_MANIFEST.txt" \
   /d/carta-backups/app_data_masters/

# Verify checksums on the USB copy before deleting anything locally
cd /d/carta-backups/app_data_masters/
sha256sum -c SHA256SUMS.txt

# Delete build residue
cd continent-app
rm -rf dist node_modules du.exe.stackdump

# Prune four of the five masters, keep app_data.json
cd ..
rm -f app_data/app_data.pre_transit_copy.json \
      app_data/app_data.wave2.json \
      app_data/app_data.pre_accom_v16.json \
      app_data/app_data.backup.json

# Confirm WSL was already idle, then shut it down before compaction
wsl --list --running   # "There are no running distributions."
wsl --shutdown
```

The vhdx compaction did not run in this session. It needs an administrator PowerShell window, run by hand:

```powershell
$s = @"
select vdisk file="C:\Users\Gebruiker\AppData\Local\Docker\wsl\disk\docker_data.vhdx"
attach vdisk readonly
compact vdisk
detach vdisk
"@
$s | Out-File -FilePath "$env:TEMP\diskpart_compact.txt" -Encoding ascii
diskpart /s "$env:TEMP\diskpart_compact.txt"
```

Docker Desktop should be fully closed and `wsl --shutdown` run first (already done in this session). Reopen Docker Desktop afterward; it will recreate anything it needs on top of the compacted disk.

## Config and secrets set

Not measured.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| C: free space | 0.81 GB | 1.41 GB | +0.60 GB |
| app_data/ masters on local disk | 5 files, 419 MB | 1 file, 115 MB | −304 MB |
| app_data masters off-machine | 0 real copies (T005's copy was same-machine $TEMP) | 1 copy, USB, checksum-verified | +1 |
| continent-app/node_modules | ~0.20 GB | 0 | −0.20 GB |
| continent-app/dist | ~106 MB | 0 | −106 MB |
| docker_data.vhdx (WSL2, Docker Desktop) | 19.11 GB | 19.11 GB (compaction not run — needs elevation) | 0, pending |

`node_modules` and `dist` came in far smaller than the architecture doc's "tens of GB" framing suggested; they are a rounding error next to the vhdx. The masters freed 304 MB, not 400 MB, because one master (`app_data.json`, 115 MB) is intentionally kept as the production working copy — the doc's ~400 MB figure was for all five together, not the four actually removed.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `Optimize-VHD` not found | This machine has no Hyper-V PowerShell module; Docker Desktop's WSL2 backing disk is a plain vhdx compacted with `diskpart`, not the Hyper-V cmdlet the task prompt assumed | Used `diskpart`'s `compact vdisk` instead, the standard non-Hyper-V route for this file type |
| `diskpart` refused to run | Needs administrator privileges; this session runs unelevated and cannot prompt for UAC | Left the compaction as a manual step for the user, with the exact commands recorded above |

## What is still open

The vhdx compaction has not happened. `docker_data.vhdx` is 19.11 GB and is the largest single item in this whole task by more than an order of magnitude — it is very likely most of the "tens of GB" the task description promised. It needs to be run from an elevated PowerShell window using the commands under "Commands run" above. WSL is already shut down, which was the only precondition; the compaction itself takes a few minutes depending on how much of the 19 GB is genuinely reclaimable slack versus live container data.

Once R2 exists (see CARTA_CLOUD_ARCHITECTURE.md §6.3), the USB copy of the four retired masters becomes redundant and can be replaced by a lifecycle-ruled R2 archive. Until then, D:\carta-backups\app_data_masters\ is the only off-machine copy; if that USB drive is lost or reformatted, the four snapshots are gone for good (app_data.json itself remains safe as long as the working copy in app_data/ and its normal git-tracked pipeline inputs survive).

C: is still under 2 GB free even after this task. The vhdx compaction is the only remaining lever with real headroom; until it runs, this machine stays close to the edge for anything else that writes to C: (builds, npm installs, temp files).

## Rollback procedure

The deletions are all reversible.

`continent-app/node_modules`: run `npm install` from `continent-app/`.

`continent-app/dist`: run the project's build command from `continent-app/`; it regenerates from source.

`continent-app/du.exe.stackdump`: no rollback needed, it was a crash artifact with no functional purpose.

The four pruned masters: copy them back from `D:\carta-backups\app_data_masters\` into `app_data/`, verifying against `SHA256SUMS.txt` in that folder first. The restore procedure is also written into `app_data/MASTERS_MANIFEST.txt`.

The vhdx compaction was never run, so there is nothing to roll back there. If it is run later and something goes wrong, Docker Desktop can rebuild its WSL2 data volume from scratch by resetting it in Docker Desktop's settings (Troubleshoot → Reset to factory defaults), at the cost of re-pulling any images and losing any container state that was not already pushed to R2 or elsewhere. Given `docker_data.vhdx` backs build-time tooling (trailslab, per project memory) rather than anything user-facing, that reset is a low-stakes worst case.

---

## Notes on this task

The task prompt described this as free and low-risk, and most of it was: node_modules, dist, and the stackdump are pure build residue with no data-loss risk. The masters were the one place worth pausing on. T005's own report had already flagged that its backup never reached genuine external storage, only `$TEMP` on the same machine, so treating that as sufficient to delete four 47-to-116 MB snapshots would have meant zero true off-machine copies existed the moment this task finished. The user had a USB drive already in use for Carta backups (`D:\carta-backups`), but it turned out to hold something unrelated: encrypted Supabase database dumps, not the app_data masters. That was checked and confirmed before assuming the masters were covered. The actual fix was to copy the masters there too, in their own subfolder, and verify checksums before deleting anything local.

The vhdx compaction turned out to be both the most consequential part of the task and the one this session cannot complete unassisted, since it needs administrator rights that an unelevated terminal session does not have and cannot request interactively. Rather than skip it silently or claim it was done, it is documented as open with the exact commands to run.
