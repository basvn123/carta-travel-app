# Runbook: the build box

Source: `infra/hetzner/README.md`, the files in `infra/hetzner/`, and the handbook section [The build box](../HANDBOOK.md#the-build-box-hetzner-scheduled-runs). Owner steps to bring the boxes up: `Execution/P3/_OPEN-hetzner.md`.

Status: the Hetzner boxes run in production (owner decision, 2026-11-05, T1086; closes the question in register row T1073-e). `infra/hetzner/README.md` was written when both existed as code only and may read older than this.

## What there is

| Box | Role | Code |
|---|---|---|
| CAX11 (arm64, 2 vCPU, 4 GB; or CX23 x86 with `CARTA_SERVER_TYPE=cx23` when ARM is out of stock) | Always on: scheduler, network bound harvesting, weekly pipeline, publishing to R2 | `infra/hetzner/cax11/` (`provision.sh`, `cloud-init.yaml`, `run_pipeline.sh`, `weekly.sh`, `verify.sh`, `verify_tasks.sh`, `weekly_tasks.txt`) |
| CAX41 | Exists only for the hours a heavy build needs it (Valhalla tiles, Planetiler, CLIP sweep, image transcoding) | `infra/hetzner/cax41/`, jobs in `infra/hetzner/jobs/` |
| systemd units | Weekly (Monday 09:00), monthly (first Saturday 03:00) and quarterly (third Saturday of Jan, Apr, Jul, Oct 03:00) timers, Europe/Brussels; Sunday reboot check; late flight sweep | `infra/hetzner/cron/` (installed by `install.sh`; the tier table is `schedule.py`) |

## Bring up (from the laptop, once)

1. Create a Hetzner API token (owner), then `infra/hetzner/cax11/provision.sh` (`--dry-run` prints every `hcloud` command without a token). It creates the key pair, a firewall with port 22 only, and the server with `cloud-init.yaml` as first boot script. It looks every resource up by name first, so running it twice is harmless.
2. cloud-init creates the `carta` user (key login only), closes root and password SSH login, turns on ufw and unattended security upgrades, and runs `/usr/local/sbin/carta-bootstrap` (pinned, checksum checked tools; venv; `npm ci`; the secrets file `/home/carta/.config/carta/env` with mode 600; the weekly timer).
3. Fill the secrets file from `infra/hetzner/cax11/env.example` by hand. Names only in git (see [../security/SECRETS.md](../security/SECRETS.md)).
4. If a step failed (network, missing branch), fix the cause and run `sudo carta-bootstrap` again rather than rebuilding the server. A box keeps the bootstrap it was provisioned with.
5. `infra/hetzner/cax11/verify.sh`, then `verify_tasks.sh`, which runs the steps of `weekly_tasks.txt` in order (each first with `--dry-run`, then for real, and refuses a step until the one above it passed).

## The schedule (T1107, ROADMAP H9)

Every `run_pipeline.py` task is in one tier. `python infra/hetzner/cron/schedule.py --dry-run --check` prints the table (each task under its timer, with `due` when the box's `logs/pipeline_state.json` says so) and exits 1 if any task is in no tier or a unit file disagrees; `tests/test_box_schedule.py` holds the same rules in CI.

| Tier | Timer | Ceiling | Tasks |
|---|---|---|---|
| weekly | `carta-weekly.timer`, Monday 09:00 | `--max-cadence weekly` | the 6 weekly tasks |
| monthly | `carta-monthly.timer`, first Saturday 03:00 | `--max-cadence monthly` | 16 monthly, the `after` tasks that follow monthly work, and any due weekly task |
| quarterly | `carta-quarterly.timer`, third Saturday of Jan, Apr, Jul, Oct 03:00 | `--max-cadence quarterly` | 27 quarterly (T1095 intros, T1096 gallery and POI descriptions, T1097 sea temperature, T1098 UK crowds among them), their `after` chains, and everything else due |
| manual | none | `--only`, by a person | the 10 `backfill` tasks, each with a reason in `schedule.py` |

Each unit sets `CARTA_TIER` (wins over `CARTA_MAX_CADENCE` in the secrets file) and `CARTA_LOCK_WAIT`. Two runs never overlap: the later one waits for `logs/carta-run.lock` (6 h for the weekly, 36 h for the others) and then gives up with exit 75; its tasks stay due. After every run, good or failed, `push_status.py` copies `pipeline_state.json`, both freshness reports and `last_run.json` to `r2:carta/status/`.

### Enable it (owner, on the box)

```bash
ssh carta@<box>
cd ~/carta && git fetch -q origin main && git reset -q --hard FETCH_HEAD   # the code with T1107
~/venv/bin/python infra/hetzner/cron/schedule.py --dry-run --check          # every task in a tier, units match
CARTA_TIER=quarterly CARTA_AUTO_UPDATE=0 CARTA_PIPELINE_ENABLED=1 bash infra/hetzner/cax11/weekly.sh --dry-run
sudo bash infra/hetzner/cron/install.sh --dry-run                           # read what it will install
sudo bash infra/hetzner/cron/install.sh                                     # install and enable all timers
systemctl list-timers 'carta-*' --no-pager                                  # weekly, monthly, quarterly, reboot
```

Check after the first monthly run: `tail -n 5 ~/logs/weekly.log`, then `rclone cat r2:carta/status/last_run.json` (tier `monthly`, exit 0). Pause everything: `sudo bash infra/hetzner/cron/install.sh --disable`. Run one tier now: `sudo systemctl start --no-block carta-monthly.service`.

## No laptop-only steps (T1161, ROADMAP H10)

| Step | Box or worker path | Tier | Inputs and where they come from | Switch |
|---|---|---|---|---|
| Ask Carta index | `ask_index` task on the box | `after` (dossier, beaches, lakes, mountains, trails_rate), so monthly or quarterly | the shipped wires in `continent-app/public/`; the model from Hugging Face on first run; `minisearch` from `npm ci` | `CARTA_BOX_ML=ask` (the default) |
| Guided search | `guided_search` task on the box, in `~/venv-guided` | `after`, the same list | `app_data/app_data.json` (pulled from R2), the layer files; thenlper/gte-small from Hugging Face; `cache/guided/vibes.npz` rebuilt on the first run | `CARTA_BOX_ML=all` |
| Stays scrape, Hostelworld | `carta-stays-scrape.timer`, 00:05 nightly, works in March and September | its own timer, not a tier | the destination list in the repo; `cache/stays/journal_scrape.sqlite` resumes; journal to `r2:carta-stays-state/state/` | `CARTA_STAYS_SCRAPE=1` |
| Stays scrape, Booking | the same script on a home host with a residential address | the same timer, installed there | as above | `CARTA_STAYS_SITES=both`, `CARTA_STAYS_BOOKING_EGRESS=residential` |
| Stays build and publish | `stays` task (T1021) | monthly | the journal from R2 | none (on since T1107) |
| Trip promotion | `trailslab_worker` task, job argument `promote` | weekly task, spawns every 28 days | the newest trailslab dump in R2 | `CARTA_TRAILSLAB_PROMOTE=1` |
| Trails lab dump | `infra/hetzner/cax41/trailslab_dump.sh push` from the lab; the worker writes one each run | by hand until the worker runs | a running lab on port 5433; `CARTA_BACKUP_KEY` and the worker public key | none |

The ML extras install on the next run after the switch (`run_pipeline.sh`, stamped in `~/venv/.carta-ml` and `~/venv-guided/.carta-ml`). One-time system packages for the scrape, as root: `apt-get install -y xvfb` (Booking only) and `~/venv/bin/python -m playwright install-deps chromium`.

Dry runs: `CARTA_TIER=monthly CARTA_BOX_ML=all CARTA_SHIP=none bash infra/hetzner/cax11/run_pipeline.sh --dry-run` (the two `ML extras ... would be installed` lines); `FORCE=1 CARTA_STAYS_SITES=hostelworld bash infra/hetzner/cax11/stays_scrape.sh --dry-run`; `CARTA_TRAILSLAB_PROMOTE=1 python infra/hetzner/cax41/trailslab_worker.py run --dry-run` (spawn.sh gets `promote`); `bash infra/hetzner/cax41/trailslab_dump.sh push --dry-run`.

Restore the lab from R2 into an empty lab: `cd tools/trailslab && docker compose up -d`, then `bash infra/hetzner/cax41/trailslab_dump.sh restore` (with the owner's or the worker's secret key in the keyring; `--force` replaces a lab that has trips).

What still needs the laptop, and why: the trails lab and its curator review UI (the `trails_*` tasks other than the worker's steps, and approving trips) until the lab moves (S98, batch 10); the Booking half of the scrape until a home host exists (Booking turns away datacenter addresses); the owner's own gpg key, which never leaves the owner.

## Weekly run

`carta-weekly.timer` (and the monthly and quarterly timers the same way) starts `weekly.sh`, which takes the run lock and runs `run_pipeline.sh` only when `CARTA_PIPELINE_ENABLED=1`: venv re-sync, pull of the master from R2, `run_pipeline.py` up to the `CARTA_TIER` ceiling, encrypted dumps, pushes, upload to R2. With `CARTA_DEPLOY=1` it deploys `dist/` to Pages after a data publish (handbook; T992 to T996).

Check it: `tail -n 20 ~/logs/weekly.log` on the box. Exit codes, from `infra/hetzner/cax11/weekly.sh` and `infra/hetzner/cax11/run_pipeline.sh`: 1 a task failed, 2 the run refused (a guard, or a bad argument or `CARTA_MAX_CADENCE`), 3 the pipeline was fine but an archive, publish or deploy step failed, 4 the venv could not sync, 5 no venv, no repo or `npm ci` failed, 75 a run was already going (the `flock` lock). On any non-zero exit `weekly.sh` pings `CARTA_HEARTBEAT_URL/fail` when that variable is set.

## Rerun by hand

`CARTA_PIPELINE_ENABLED=1 bash ~/carta/infra/hetzner/cax11/weekly.sh` (add `CARTA_TIER=monthly` or `quarterly` for that tier). Do not edit code on the box: fixes go through a task branch and the box pulls `main` itself (`weekly.sh` runs `git fetch` and `git reset --hard` to `origin/main` before each run unless `CARTA_AUTO_UPDATE=0`). The service has `TimeoutStartSec=48h` (`infra/hetzner/cron/carta-weekly.service`).

## Heavy jobs

`infra/hetzner/cax41/spawn.sh` creates the on-demand box; `cost.py` prices a run; `infra/hetzner/jobs/jobs.tsv` lists the jobs. The trailslab worker is `infra/hetzner/cax41/trailslab_worker.py`.

## Undo

A bad data push: see [incident.md](incident.md). Remove a box with `hcloud server delete` (owner); the data lives in R2 and the repository, not on the box. Hetzner server backups are off (`infra/hetzner/README.md`); what is backed up from the box is in [backup.md](backup.md).
