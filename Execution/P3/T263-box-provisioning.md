# T263: the box provisions itself fully, and the reboot window waits for spawns

## Task ID

T263

## Date

2026-10-01

## What changed

Stage 4 of `Execution/_OPEN-MASTER.md`, items 8 and the first half of 9
(T048-i, T047-l).

`infra/hetzner/cax11/cloud-init.yaml` now brings a new CAX11 to the state the
weekly run expects, with no hand steps:

- `carta-bootstrap` installs the venv with `-c constraints.txt` and writes the
  hash stamp that `run_pipeline.sh` compares, so the first run does not
  re-sync. Before, it installed unpinned and `run_pipeline.sh` re-pinned on
  the first run.
- It installs the PostgreSQL 17 client from the PGDG repository. The signing
  key is downloaded and checked against its published fingerprint
  `B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8` before apt trusts it. Ubuntu
  24.04's own pg_dump is 16, which refuses Supabase's Postgres 17, so the
  weekly dump was skipped.
- It runs `npm ci` in `continent-app` for the ship step.
- The package list gains GNU `time` (`verify_tasks.sh` reads peak memory with
  `/usr/bin/time -v`) and `gnupg` (the dumps are encrypted).
- The `pyyaml` append is gone, because `requirements.txt` lists PyYAML now.

T048-i also asked to decide the units. cloud-init keeps writing T046's units,
on purpose, and the header now says why. Their service does not set
`CARTA_PIPELINE_ENABLED=1`, so a new box logs "cron fired" and never starts a
pipeline run before its secrets are filled and its tasks verified on arm64.
The real units stay the last owner step, `cron/install.sh`
(`_OPEN-MASTER.md` 7.9). The outdated comments ("placeholder until T048",
"T048 decides the reboot window", "T048 may still drop OnBootSec") were
rewritten.

`infra/hetzner/cron/reboot-if-needed.sh` skips the Sunday 04:00 reboot while a
CAX41 spawn is live (T047-l). Before, a pending kernel update during a spawn
rebooted the box: spawn.sh got TERM, its trap deleted the worker, and the run
was lost. The skip has two parts. One reads every
`logs/cax41-*.lock.d/owner` that spawn.sh writes; its pid must be alive and
its `/proc/<pid>/cmdline` must contain `spawn.sh`, so a stale lock whose pid
was reused cannot keep the window shut. The other is a process check for
`cax41/spawn.sh` that ignores `--sweep`, which catches a spawn whose state
directory was moved with `CARTA_STATE_DIR`.

`verify.sh` gained four checks: the app's node_modules, GNU time, a pg_dump of
17 or newer, and whether the venv is stamped for the current
`constraints.txt` (INFO only, because the next run re-syncs it). The pending
reboot message no longer says the box never reboots itself.

`infra/hetzner/README.md` no longer calls `weekly.sh` a placeholder. It
describes the whole chain: the gate, the R2 pull and push, the publish step,
the T046 units against the `install.sh` units, and the reboot window's four
skips. `env.example` gained `CARTA_MAX_CADENCE`, `CARTA_SHIP` and the
`pipeline_runs` pair `CARTA_SUPABASE_URL` and `CARTA_SUPABASE_SERVICE_KEY`,
which `run_pipeline.py` reads and the file did not list. `_OPEN-MASTER.md`
7.5 and 7.10 drop the hand installs of `time` and the PGDG client for a box
made after T263, and keep the commands for an older one.

## Files touched

**Modified:**
- infra/hetzner/cax11/cloud-init.yaml
- infra/hetzner/cax11/verify.sh
- infra/hetzner/cax11/env.example
- infra/hetzner/cron/reboot-if-needed.sh
- infra/hetzner/README.md
- Execution/_OPEN-MASTER.md (7.5, 7.10)
- Execution/_OPEN.md (T048-i, T047-l closed)

**Created:**
- Execution/P3/T263-box-provisioning.md

## Commands run

```
python -c "import yaml; yaml.safe_load(open('infra/hetzner/cax11/cloud-init.yaml'))"   # parses; packages and write_files listed
# carta-bootstrap extracted from the YAML into a file:
bash -n bootstrap.sh                                  # ok
bash -n infra/hetzner/cax11/verify.sh                 # ok
bash -n infra/hetzner/cron/reboot-if-needed.sh        # ok
curl -fsSL -o pgdg.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
gpg --show-keys --with-colons pgdg.asc | grep '^fpr'  # fpr:::::::::B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8:
                                                      # the exact pattern carta-bootstrap greps: MATCH
bash t263_reboot.sh                                   # 7 passed, 0 failed
```

`t263_reboot.sh` (session scratchpad) runs a copy of `reboot-if-needed.sh`
with the reboot-required path moved into a temp dir and stubs for
`systemctl`, `flock` and `pgrep`. It proves:

- with no spawn, the window reboots;
- a live `spawn.sh` owning `logs/cax41-clip_sweep.lock.d` makes it skip;
- a dead owner pid, or a live pid that is not `spawn.sh`, does not hold the
  window;
- a spawn found only by the process check skips;
- a `--sweep` does not skip;
- with no reboot required, it does nothing.

The pg_dump version pattern in `verify.sh` was checked against real version
strings: 17.6 PGDG and 18.0 pass, and Ubuntu's 16.10 fails.

No box exists, so cloud-init itself did not run. `cloud-init schema` is not
available on Windows. The YAML parses and the bootstrap script passes
`bash -n`.

## Config and secrets set

None. `env.example` lists four more variables, all blank, with their defaults
described.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first attempt at the cloud-init edit failed in the shell | The edit script was passed through a bash heredoc, and the tool's own quoting broke on the script's single quotes | Wrote the edit script to a file and ran it |

## What is still open

None new. T048-g stays open with its owner: the backup public key and
`SUPABASE_DB_URL` plus `CARTA_BACKUP_KEY` in the secrets file. The PGDG
client half of it is now provisioned. `Execution/P3/_OPEN-hetzner.md`, the
older copy of the box procedure, still lists the hand installs of `time` and
the PGDG client. Those commands are harmless on a new box, and
`_OPEN-MASTER.md` is the procedure in use.

## Rollback procedure

```
git revert <this task's commit>
```

Nothing ran anywhere. A box provisioned from a reverted branch gets T046's
bootstrap back, and the hand commands in `_OPEN-MASTER.md` 7.5 and 7.10 come
back with it.
