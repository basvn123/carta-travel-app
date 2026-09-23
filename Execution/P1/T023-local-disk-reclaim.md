# T023 — Reclaim tens of GB locally, for free

## Task ID

T023

## Date

2026-09-23

## What changed

C: was down to 0.81 GB free at the start of this task, which is the real reason this task mattered today, not an abstract cleanup. Four things were removed: `continent-app/dist`, `continent-app/node_modules`, `continent-app/du.exe.stackdump`, and four of the five ~110 MB `app_data.*.json` masters. `app_data.json`, the current production master, stays.

Before deleting the four masters, they were copied from the existing `$TEMP/carta-master-snapshot/` staging copy (made in T005) onto the USB drive at `D:\carta-backups\app_data_masters\`, and the SHA256 checksums from T005 were re-verified against that USB copy before anything local was deleted. T005's report had flagged that its backup never left this machine; that gap is closed now, at least until R2 exists and can take over as the real archive per §6.3 of the architecture doc.

The fifth item in the task, compacting the Docker Desktop WSL2 vhdx, is the one still open. It is also the largest: `docker_data.vhdx` is 19.11 GB, almost all of it presumed slack Docker never returned to Windows. `diskpart` needed administrator elevation this session could not grant itself, so the exact commands were handed to the user to run in an elevated window. They did, and `diskpart` reported completing without error, but the file size and its last-write timestamp did not change at all afterward. Investigating why turned up the real blocker: `docker_data.vhdx` is not mounted inside the WSL distro reachable from the command line (`docker-desktop`, a 126 MB utility VM, is the only registered distro; `docker-desktop-data`, which normally owns this disk, is not registered at all right now). `fstrim` run against the reachable distro only freed 48 MiB, confirming it never touched the 19 GB disk. `diskpart compact vdisk` can only reclaim space the filesystem has already marked free and zeroed; with nothing mounted to trim it, there was nothing for `compact` to find, hence the silent no-op. Reclaiming this disk needs Docker Desktop's own GUI (Settings → Troubleshoot, or the Resources disk-usage control on newer versions), which this session cannot drive.

## Files touched

**Modified:**
- app_data/MASTERS_MANIFEST.txt (recorded the T023 deletion, the USB backup location, and an updated restore procedure)

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

The user ran the following in an elevated PowerShell window, after `wsl --shutdown` (already done in this session):

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

It attached, ran, and closed with no error, but reclaimed nothing (see "What is still open"). Follow-up diagnosis run afterward, from this session:

```bash
wsl --list --all --verbose        # only docker-desktop registered, no docker-desktop-data
wsl -d docker-desktop -- fstrim -av   # trimmed 48 MiB on /dev/sdc, not the 19 GB disk
wsl -d docker-desktop -- df -h        # confirms docker_data.vhdx is not mounted here
```

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
| docker_data.vhdx (WSL2, Docker Desktop) | 19.11 GB | 19.11 GB (diskpart ran elevated, reclaimed 0 bytes) | 0, pending |

`node_modules` and `dist` came in far smaller than the architecture doc's "tens of GB" framing suggested; they are a rounding error next to the vhdx. The masters freed 304 MB, not 400 MB, because one master (`app_data.json`, 115 MB) is intentionally kept as the production working copy — the doc's ~400 MB figure was for all five together, not the four actually removed.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `Optimize-VHD` not found | This machine has no Hyper-V PowerShell module; Docker Desktop's WSL2 backing disk is a plain vhdx compacted with `diskpart`, not the Hyper-V cmdlet the task prompt assumed | Used `diskpart`'s `compact vdisk` instead, the standard non-Hyper-V route for this file type |
| `diskpart` refused to run in this session | Needs administrator privileges; this session runs unelevated and cannot prompt for UAC | Left the compaction as a manual step for the user, with the exact commands recorded above |
| User ran diskpart elevated; 0 bytes reclaimed, file size and timestamp unchanged | `docker_data.vhdx` was not mounted inside any WSL distro reachable at the time (`docker-desktop-data`, the distro that normally owns it, was not registered), so nothing had trimmed its free space at the filesystem level; `compact vdisk` can only reclaim blocks already marked free and zeroed, so it found nothing to do | Not fixed. Diagnosed via `wsl --list --all --verbose`, `fstrim` (freed only 48 MiB on the unrelated utility-VM disk), and `df -h` inside WSL. The disk is managed directly by the Docker Desktop application; reclaiming it needs Docker Desktop's own GUI (Settings → Troubleshoot → Clean/Purge, or the Resources disk-usage control), which cannot be driven from this session |

## What is still open

The vhdx compaction still has not reclaimed anything. `docker_data.vhdx` is 19.11 GB and is the largest single item in this whole task by more than an order of magnitude — it is very likely most of the "tens of GB" the task description promised. The `diskpart` route from the command line is a dead end here: it depends on the WSL filesystem inside the vhdx having already trimmed its free space, and the distro that owns this disk (`docker-desktop-data`) is not currently registered, so there is nothing to trim it from outside Docker Desktop itself. The next step is Docker Desktop's own UI: open the app, go to Settings → Troubleshoot, and look for a "Clean / Purge data" action, or on newer versions check Settings → Resources for a disk-usage control that reclaims space directly. That requires the GUI and has not been attempted.

Once R2 exists (see CARTA_CLOUD_ARCHITECTURE.md §6.3), the USB copy of the four retired masters becomes redundant and can be replaced by a lifecycle-ruled R2 archive. Until then, D:\carta-backups\app_data_masters\ is the only off-machine copy; if that USB drive is lost or reformatted, the four snapshots are gone for good (app_data.json itself remains safe as long as the working copy in app_data/ and its normal git-tracked pipeline inputs survive).

C: is still under 2 GB free even after this task. The vhdx compaction is the only remaining lever with real headroom; until it runs, this machine stays close to the edge for anything else that writes to C: (builds, npm installs, temp files).

## Rollback procedure

The deletions are all reversible.

`continent-app/node_modules`: run `npm install` from `continent-app/`.

`continent-app/dist`: run the project's build command from `continent-app/`; it regenerates from source.

`continent-app/du.exe.stackdump`: no rollback needed, it was a crash artifact with no functional purpose.

The four pruned masters: copy them back from `D:\carta-backups\app_data_masters\` into `app_data/`, verifying against `SHA256SUMS.txt` in that folder first. The restore procedure is also written into `app_data/MASTERS_MANIFEST.txt`.

The `diskpart compact vdisk` step that was run made no change (0 bytes reclaimed, size and timestamp unchanged), so there is nothing to roll back from it. If the Docker Desktop GUI cleanup is attempted later and something goes wrong, Docker Desktop can rebuild its WSL2 data volume from scratch by resetting it in its own settings (Troubleshoot → Reset to factory defaults), at the cost of re-pulling any images and losing any container state that was not already pushed to R2 or elsewhere. Given `docker_data.vhdx` backs build-time tooling (trailslab, per project memory) rather than anything user-facing, that reset is a low-stakes worst case.

---

## Notes on this task

The task prompt described this as free and low-risk, and most of it was: node_modules, dist, and the stackdump are pure build residue with no data-loss risk. The masters were the one place worth pausing on. T005's own report had already flagged that its backup never reached genuine external storage, only `$TEMP` on the same machine, so treating that as sufficient to delete four 47-to-116 MB snapshots would have meant zero true off-machine copies existed the moment this task finished. The user had a USB drive already in use for Carta backups (`D:\carta-backups`), but it turned out to hold something unrelated: encrypted Supabase database dumps, not the app_data masters. That was checked and confirmed before assuming the masters were covered. The actual fix was to copy the masters there too, in their own subfolder, and verify checksums before deleting anything local.

The vhdx compaction turned out to be both the most consequential part of the task and the hardest to actually complete. This session could not self-elevate to run `diskpart`, so the user ran it by hand in an admin window; it completed without error but reclaimed 0 bytes. Following up on why revealed that `docker_data.vhdx` is currently orphaned from any WSL distro reachable by name — `docker-desktop-data`, which should own it, is not registered — so there was no live filesystem to trim its free space first, and `compact vdisk` has nothing to compact without that. That is a Docker Desktop state problem, not a scripting one, and the fix lives in its GUI, not in another terminal command. Documented as still open rather than reported as done, since running the command and it succeeding are not the same thing here.
