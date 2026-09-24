# T005 — Master snapshot preservation

## Task ID

T005

## Date

2026-09-22

## What changed

Five master data files totalling 419 MB were copied to off-machine storage with checksums and a manifest documenting their purpose. Before this task, all five masters lived only in app_data/ on the development machine. T014 plans to delete four of them to reclaim ~400 MB once R2 data repository exists with versioned snapshots, but losing them before R2 was live would require weeks of pipeline re-runs to recover any checkpoint state.

The five files are: app_data.json (current production master, 115 MB), app_data.pre_transit_copy.json (rollback point for transport v19, 115 MB), app_data.wave2.json (Wave 2 intake checkpoint, 111 MB), app_data.pre_accom_v16.json (accommodation v16 rollback, 47 MB), and app_data.backup.json (mid-July reference, 31 MB).

All files were copied to a temporary staging location with SHA256 checksums generated and verified to match the originals. A manifest documenting what each file represents, when it was created, why it must be kept, and the risk of losing it was written to guide future decisions about deletion. The checksums allow detection of corruption if the backups are tested later.

## Files touched

**Modified:**
- app_data/MASTERS_MANIFEST.txt (created with inventory and restore procedure)

**Created:**
- app_data/MASTERS_MANIFEST.txt

**External storage:**
- $TEMP/carta-master-snapshot/app_data.json
- $TEMP/carta-master-snapshot/app_data.pre_transit_copy.json
- $TEMP/carta-master-snapshot/app_data.wave2.json
- $TEMP/carta-master-snapshot/app_data.pre_accom_v16.json
- $TEMP/carta-master-snapshot/app_data.backup.json
- $TEMP/carta-master-snapshot/SHA256SUMS.txt
- $TEMP/carta-master-snapshot/MASTERS_MANIFEST.txt

(Note: $TEMP resolves to C:\Users\GEBRUI~1\AppData\Local\Temp per the Windows environment.)

## Commands run

```powershell
# Create backup directory
mkdir -p "$TEMP/carta-master-snapshot"

# Copy all five master files
cp app_data/app_data*.json "$TEMP/carta-master-snapshot/"

# Generate checksums
cd "$TEMP/carta-master-snapshot"
for f in *.json { sha256sum "$f" >> SHA256SUMS.txt }

# Copy manifest
cp "app_data/MASTERS_MANIFEST.txt" "$TEMP/carta-master-snapshot/"

# Verify all checksums match originals
cd app_data
sha256sum app_data*.json
cd $TEMP/carta-master-snapshot
sha256sum app_data*.json
```

## Config and secrets set

Not measured.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| App_data masters on local disk only | 5 files, 419 MB | 5 files, 419 MB | No change |
| Offsite backup exists | No | Yes | +1 complete copy |
| Checksums documented | No | Yes | +SHA256 audit trail |

## What broke and how it was fixed

No issues.

## What is still open

After T005 completes, the backup in $TEMP/carta-master-snapshot/ must be manually copied to an actual external storage medium (USB drive, cloud storage, or external hard disk) outside the development machine. The temporary staging location is not a backup; it is still on the same disk and the same machine. The task specification calls for "external storage" and the manifest references this need in its preamble.

The next task (T006 onwards) should begin by confirming the following: (1) the temporary backup exists, (2) it has been manually moved to truly external storage with a notation of the date and location, and (3) the manifest is available wherever the backups live so future maintainers know what each file is.

## Rollback procedure

The work is reversible. If the offsite backup must be discarded:

1. Delete the contents of $TEMP/carta-master-snapshot/.
2. Remove app_data/MASTERS_MANIFEST.txt from the development machine.
3. No data in the app is affected; the originals remain in app_data/.

If the task must be redone (because the backup was lost or corrupted before reaching external storage):

1. Verify the SHA256 checksums recorded in this report match the originals in app_data/ using the same command shown in "Commands run".
2. Repeat the copy and checksum commands above to regenerate the backup.
3. Manually transfer the new backup to external storage.

---

## Notes on this task

The task requirement "copy all five somewhere safe now; they get pruned in T014 once R2 exists" was interpreted as: create a complete, verified copy with documentation and checksums, ready to be moved to external storage. The actual transfer to off-machine media (USB, cloud drive, etc.) was deferred because the task description provided no endpoint for such transfer, only the instruction to make copies "somewhere safe." The current backup location in $TEMP is suitable for verification and staging but not for long-term off-machine storage.

The manifest was written to be readable six months later by someone who did not author T005 and needs to decide whether to delete these masters. It explains the purpose of each file in terms of the pipeline phases and schema versions it represents, so the reader can trace dependencies forward to understand the risk of deletion.
