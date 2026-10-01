# T252: gc and LFS prune, no history rewrite

## Task ID

T252

## Date

2026-10-01

## What changed

The root repository's `.git` went from 3,215 MB to 1,151 MB, a saving of
2,064 MB. No commit hash changed and nothing was force-pushed. The thirteen
packs, which had never had a full gc, are now one pack of 528 MiB. The 522 MiB
of loose objects are gone, and the LFS cache lost 35 objects (227 MB) that no
recent commit references.

That is more than T026 forecast (901 MB). Even without the reflog expiry (see
below), `gc --aggressive` re-deltified the whole object store and threw away
the unreachable objects nothing points to. T026 counted only the unreachable
blobs and the LFS cache, not what a full repack saves on reachable data.

The reflog expiry the plan asked for (`git reflog expire --expire=now --all`)
did not run. The session's permission guard refused it as irreversible, so
objects that only a reflog still references were kept. Running it is the
owner's call; the command is in "What is still open".

## Files touched

**Created:**
- Execution/P1/T252-git-gc-and-lfs-prune.md

**Modified:**
- Execution/_OPEN.md (T046-b, T077-d closed; T252-a to T252-d added)

**Backups written (outside the repository):**
- D:\carta-backups\carta-root-2026-10-01.bundle (600 MB, every ref including refs/stash)
- D:\carta-backups\carta-root-2026-10-01-lfs\ (the whole `.git/lfs`, 119 files)
- D:\carta-backups\carta-root-2026-10-01.git\ (2 MB, an abandoned `clone --mirror`; safe to delete)

## Commands run

```
# Backup first. A local `git clone --mirror` stalled for more than 10 minutes
# with git-upload-pack idle, so it was stopped and replaced by a bundle.
git bundle create D:/carta-backups/carta-root-2026-10-01.bundle --all
git bundle verify D:/carta-backups/carta-root-2026-10-01.bundle   # "is okay"
cp -r .git/lfs D:/carta-backups/carta-root-2026-10-01-lfs
# Every copied LFS object hashed against its own name: 109 checked, 0 bad.
# Per-file names and sizes match the source exactly (119 files).

git gc --prune=now --aggressive          # 14:17 to 14:27, 10 min
git lfs prune --dry-run                  # 35 files would be pruned (227 MB)
git lfs prune --verify-remote            # 34 verified with remote, 35 deleted
git fsck --connectivity-only             # exit 0
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `.git` on disk | 3,215 MB | 1,151 MB | -2,064 MB |
| Pack files | 13 | 1 | -12 |
| size-pack | 1.79 GiB | 528.44 MiB | -1.27 GiB |
| Loose objects | 2,876 (522 MiB) | 0 | -522 MiB |
| LFS objects held locally | 109 | 74 | -35 (227 MB) |
| Commit hashes changed | 0 | 0 | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `git clone --mirror .git D:/...` stalled, upload-pack idle for over 10 minutes | Not diagnosed; local transport over to the USB drive | Replaced by `git bundle create --all`, verified |
| The background job was killed at its 90-minute limit during the LFS step | `du` over thousands of files on the USB drive took longer than the copy itself | The copy had completed; proved by matching names and sizes, then hashing every object |
| `git reflog expire` refused | Session permission guard, irreversible | Not run; T252-a |

## What is still open

The reflog expiry is the owner's to run or skip (T252-a). With the bundle
and the LFS copy on `D:` verified, it is safe. It should spare `refs/stash`,
which holds the "in-flight LFS pointer churn" stash, because an expired stash
reflog empties `git stash list`:

```
git for-each-ref --format='%(refname)' | grep -v '^refs/stash$' \
  | xargs git reflog expire --expire=now --expire-unreachable=now HEAD
git gc --prune=now
```

After the push in T258, CI ran on `main` for the first time since the plan
began. `admin-rpc-security` passed (T077-d closed). Two jobs fail for reasons
outside session A:

- **`rating-tests`** fails the rating distribution contract: "curated/fitted
  sd gap 0.280 >= 0.18" on `app_data.json`. No session A task touched rating
  code or data (T252-b).
- **`secret-scan`** fails on placeholders, not secrets: `whsec_...` and
  `whsec_testsecretfortestingonly...` in the P2 Stripe reports and
  `test_purchase_e2e.md`, `sk-ant-...` in `docs/HANDOFF_LLM_RUNS.md`. The
  scanner was already failing on the old main in September. Either the
  pattern needs to require a real key length, or the docs need rewording
  (T252-c).

C: has 7.5 GB free. A Visual Studio update during this session left a 4.7 GB
installer cache in `%TEMP%\objaq3r4` (created 2026-10-01 11:54). It was not
touched; deleting it is the owner's call (T252-d).

The app repository (`continent-app/`) was not gc'd; T252 named the root. It
holds three stashes named "session A: CRLF-only ...", which carry no content
change and can be dropped.

## Rollback procedure

Nothing reachable was lost. For a pruned LFS object, run `git lfs fetch`, or
copy it back from `D:\carta-backups\carta-root-2026-10-01-lfs\objects\`. For
any ref: `git fetch D:/carta-backups/carta-root-2026-10-01.bundle
'refs/*:refs/restored/*'`. The unreachable objects gc removed were, by
definition, referenced by nothing, and are not in the bundle.
