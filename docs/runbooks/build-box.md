# Runbook: the build box

Source: `infra/hetzner/README.md`, the files in `infra/hetzner/`, and the handbook section [The build box](../HANDBOOK.md#the-build-box-hetzner-scheduled-runs). Owner steps to bring the boxes up: `Execution/P3/_OPEN-hetzner.md`.

Status: whether the boxes run in production today is not verified by T1073. `infra/hetzner/README.md` says both existed as code only when written.

## What there is

| Box | Role | Code |
|---|---|---|
| CAX11 (arm64, 2 vCPU, 4 GB; or CX23 x86 with `CARTA_SERVER_TYPE=cx23` when ARM is out of stock) | Always on: scheduler, network bound harvesting, weekly pipeline, publishing to R2 | `infra/hetzner/cax11/` (`provision.sh`, `cloud-init.yaml`, `run_pipeline.sh`, `weekly.sh`, `verify.sh`, `verify_tasks.sh`, `weekly_tasks.txt`) |
| CAX41 | Exists only for the hours a heavy build needs it (Valhalla tiles, Planetiler, CLIP sweep, image transcoding) | `infra/hetzner/cax41/`, jobs in `infra/hetzner/jobs/` |
| systemd units | Weekly timer (Monday 09:00 Europe/Brussels), Sunday reboot check, late flight sweep | `infra/hetzner/cron/` (installed by `install.sh`) |

## Bring up (from the laptop, once)

1. Create a Hetzner API token (owner), then `infra/hetzner/cax11/provision.sh` (`--dry-run` prints every `hcloud` command without a token). It creates the key pair, a firewall with port 22 only, and the server with `cloud-init.yaml` as first boot script. It looks every resource up by name first, so running it twice is harmless.
2. cloud-init creates the `carta` user (key login only), closes root and password SSH login, turns on ufw and unattended security upgrades, and runs `/usr/local/sbin/carta-bootstrap` (pinned, checksum checked tools; venv; `npm ci`; the secrets file `/home/carta/.config/carta/env` with mode 600; the weekly timer).
3. Fill the secrets file from `infra/hetzner/cax11/env.example` by hand. Names only in git (see [../security/SECRETS.md](../security/SECRETS.md)).
4. If a step failed (network, missing branch), fix the cause and run `sudo carta-bootstrap` again rather than rebuilding the server. A box keeps the bootstrap it was provisioned with.
5. `infra/hetzner/cax11/verify.sh`, then `verify_tasks.sh`, which runs the steps of `weekly_tasks.txt` in order (each first with `--dry-run`, then for real, and refuses a step until the one above it passed).

## Weekly run

`carta-weekly.timer` starts `weekly.sh`, which runs `run_pipeline.sh` only when `CARTA_PIPELINE_ENABLED=1`: venv re-sync, pull of the master from R2, `run_pipeline.py` up to the `CARTA_MAX_CADENCE` ceiling, encrypted dumps, pushes, upload to R2. With `CARTA_DEPLOY=1` it deploys `dist/` to Pages after a data publish (handbook; T992 to T996).

Check it: `tail -n 20 ~/logs/weekly.log` on the box. Exit codes: 1 a task failed, 2 the run refused (a guard or the lock), 3 the archive or R2 publish failed, 75 a run was already going (from the archived incident runbook, T218, not re-checked against `weekly.sh`).

## Rerun by hand

`CARTA_PIPELINE_ENABLED=1 bash ~/carta/infra/hetzner/cax11/weekly.sh`. Do not edit code on the box: fixes go through a task branch and the box pulls `main`.

## Heavy jobs

`infra/hetzner/cax41/spawn.sh` creates the on-demand box; `cost.py` prices a run; `infra/hetzner/jobs/jobs.tsv` lists the jobs. The trailslab worker is `infra/hetzner/cax41/trailslab_worker.py`.

## Undo

A bad data push: see [incident.md](incident.md). Remove a box with `hcloud server delete` (owner); the data lives in R2 and the repository, not on the box.
