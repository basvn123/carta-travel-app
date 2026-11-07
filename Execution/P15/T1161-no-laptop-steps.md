# T1161: no laptop-only steps

Roadmap item **H10** (audit P-17). Round 2 session S77, batch 8. Branch `p15-s77-no-laptop-steps`, from `p15-round2`.

## Date

2026-11-07

## What changed

H10 named five steps that ran only on the owner's laptop. Each now has a box or worker path, with a dry run or a test. Each is switched on by one line in the box secrets file, so nothing changes on the box until the owner sets that line.

| Step | Before | After | Switch | Proof here |
|---|---|---|---|---|
| Ask Carta index (`ask_index`, T551) | skipped on the box on its guard: model2vec is laptop-only | `run_pipeline.sh` installs model2vec into the box venv, so the task runs in the monthly or quarterly run after the exports it follows | `CARTA_BOX_ML=ask` (the default) | pip installs model2vec 0.10.0 against `constraints.txt` on Python 3.12; the guard passes its model2vec check; `ask_index_layer.py` runs up to the model download, which this container's proxy blocks |
| Guided search (`guided_search_layer.py`, T439) | Manual, laptop-only, in no task table | a new `guided_search` task (`after` the same five tasks as `ask_index`), run in its own venv `~/venv-guided` with CPU torch | `CARTA_BOX_ML=all` | pip resolves sentence-transformers 3.3.1, transformers 4.57.6, huggingface-hub 0.36.2 and torch 2.13.0 against `constraints.txt`; the guard skips with its reason; `run_pipeline.sh --dry-run` plans both installs |
| Stays scrape (T532) | Windows Task Scheduler on the laptop (`scripts/stays_scrape.bat`) | `infra/hetzner/cax11/stays_scrape.sh` and `carta-stays-scrape.timer` (00:05 nightly, works in March and September). Hostelworld runs on the box. Booking runs only on a host whose own address is residential, headed in Xvfb. The journal upload follows the laptop's rules, through rclone | `CARTA_STAYS_SCRAPE=1`; Booking also needs `CARTA_STAYS_SITES=both` and `CARTA_STAYS_BOOKING_EGRESS=residential` on that host | dry runs for each site; idles outside its months; refuses Booking without the egress (exit 3); refuses while the pipeline holds the lock (exit 75, run for real); `systemd-analyze verify` clean |
| Trip promotion (T647-f) | only the laptop's `trails_rate` task promoted; the worker job always ran `--no-promote` | job argument `promote`: the worker lists the approved ids, exports with promotion, and `trailslab_worker.py rows-check` replaces the fixed row set. No live row may go, and every new row must be an approved id. The rule runs on the worker and again on the box | `CARTA_TRAILSLAB_PROMOTE=1` | `cax41/verify.sh` has a new promote case (103 passed, was 102); `rows-check` unit and CLI tests against a real git tree; `trailslab_worker.py run --dry-run` passes `promote` to spawn.sh |
| Trails lab dump in R2 (T288-b, T647-b) | the only dual-key dump depended on a hand command from a report; restoring had no script outside the worker | `infra/hetzner/cax41/trailslab_dump.sh push` and `restore`: a dump of the running lab, encrypted to the owner key and the worker key, both recipients checked, uploaded to `archive/db/trailslab/` without overwriting; restore of the newest dump into an empty lab | none (run by hand until the worker runs every 28 days) | a real round trip on a throwaway PostgreSQL 16 cluster with two generated keys: pushed, restored with the worker key alone, and both refusals checked (overwrite, non-empty lab) |

The lab move itself (running the trails lab and its review UI on a worker) is S98 in batch 10. This task touched only the dump and its restore.

**Finding: `requirements-ml.txt` cannot be installed in one pip call.** It pins model2vec 0.10.0, which declares huggingface-hub 1.0 or newer, alongside huggingface-hub `>=0.34,<1.0` for sentence-transformers. pip reports `ResolutionImpossible` (checked here). The box therefore keeps the two halves apart: model2vec alone goes into the main venv, where nothing else reads huggingface-hub (it resolves to 2.4.0), and sentence-transformers with the hub below 1.0 gets its own venv. The laptop file itself is outside this task's files (row T1161-f).

## Research

A research subagent compared the options on 2026-11-07. pytorch.org and two proxy vendor sites were blocked from the container, so proxy prices are from 2026 secondary sources.

- **Booking scrape off the laptop.** Booking turns away datacenter addresses and headless Chrome (T624, T634). The options were:
  - (a) The box plus a residential proxy: Decodo about USD 4 a GB pay as you go; IPRoyal USD 5.51 to 7.35 a GB; Bright Data USD 8 a GB list, with identity checks for residential access. At 0.5 to 4 MB a page and about 4,000 pages twice a year, that is roughly 4 to 30 GB, or USD 16 to 240 a year. Each provider's acceptable use policy would need checking.
  - (b) An always-on home device (Raspberry Pi 5 with 8 GB and an SSD, about EUR 130 to 150 once, or a used N100 mini PC) on the owner's connection, running the same script headed in Xvfb.
  - (c) Keep the laptop.
  
  **Chosen: (b), built so the same script serves the box and the home host.** It reproduces the conditions that work today (a home address and a real browser) with no per-GB cost and no proxy account. The script refuses Booking unless the host declares `CARTA_STAYS_BOOKING_EGRESS=residential`. No evidence was found that Hostelworld blocks datacenter addresses, so it runs on the box, pending a one-town test (T1161-b). Booking's terms forbid scraping under all three options. That was already true on the laptop and is the owner's existing decision (T532).
- **sentence-transformers on the 4 GB CAX11.** Torch 2.10 and later on PyPI depends on the CUDA 13 packages on every Linux platform, aarch64 included (several GB). The CPU build from `download.pytorch.org/whl/cpu` installs at about 0.6 to 1 GB and uses about 0.8 to 1.2 GB of RAM at run time. A few thousand short documents take one to two minutes on two Ampere cores. **Chosen: the box, with CPU torch from the PyTorch index** (the pin already in `infra/hetzner/jobs/requirements-torch-cpu.txt`, torch 2.13.0+cpu, so the box and the photo workers use the same build). The on-demand worker would cost a spawn for a two-minute job. The laptop would keep the dependency H10 removes.
- **model2vec.** 0.10.0 needs huggingface-hub 1.0 or newer. 0.9.0 has no hub pin but pulls hub 2.x anyway. Neither needs torch: its dependencies are numpy, tokenizers, safetensors, jinja2, joblib and tqdm, about 50 MB with arm64 wheels. **Chosen: keep 0.10.0, the laptop's pin, alone in the box venv.** A second venv for model2vec was not needed, because nothing in `requirements.txt` reads huggingface-hub.
- **Encrypting the trails lab dump.** The options were GnuPG with two recipients, age with several recipients (v1.3.x, BSD-3), and rclone crypt (one shared password, which does not fit two parties). **Chosen: GnuPG**, which is already used by the worker job and the backups. The script passes `--compress-algo none`, because a custom-format dump is already compressed.

Links: https://pypi.org/project/model2vec/ , https://github.com/MinishLab/model2vec/blob/main/pyproject.toml , https://pypi.org/project/torch/ , https://aimultiple.com/proxy-pricing , https://use-apify.com/blog/iproyal-pricing-plans-2026 , https://use-apify.com/blog/bright-data-pricing-guide-2026 , https://apify.com/moving_beacon-owner1/hostelworld-scraper.md , https://pkg.go.dev/filippo.io/age@v1.3.2

## Files touched

- Modified:
  - `run_pipeline.py`: the `guided_search` task, `guard_guided_search` and `GUIDED_PY`, and the `guard_ask_index` text.
  - `infra/hetzner/cax11/run_pipeline.sh`: the ML extras block (`CARTA_BOX_ML`, `CARTA_GUIDED_VENV`).
  - `infra/hetzner/cax11/env.example`.
  - `infra/hetzner/cax41/trailslab_worker.py`: `rows-check`, `CARTA_TRAILSLAB_PROMOTE`, promote-aware gate.
  - `infra/hetzner/cax41/verify.sh`: the promote case.
  - `infra/hetzner/jobs/trailslab.sh`: the `promote` argument.
  - `infra/hetzner/cron/install.sh`: the stays scrape units.
  - `docs/runbooks/build-box.md`: a new section, "No laptop-only steps".
  - `docs/HANDBOOK.md`: the build box section.
  - `docs/reference/tasks.md` and `docs/reference/python.md`: regenerated by `build_reference.py`, because CI checks them.
  - `ROADMAP.md`: H10 status.
  - `Execution/_OPEN.md`: rows appended.
- Created:
  - `infra/hetzner/cax11/stays_scrape.sh`
  - `infra/hetzner/cax11/requirements-stays.txt`
  - `infra/hetzner/cron/carta-stays-scrape.service` and `carta-stays-scrape.timer`
  - `infra/hetzner/cax41/trailslab_dump.sh`
  - `tests/test_no_laptop_steps.py`
  - this report

The brief limits `run_pipeline.py` to task flags where a task needs a box mode. Guided search had no task at all, so the box could not run it without one. The new entry is that box mode, and it changes nothing for any other task.

## Commands run

```bash
pip install --dry-run model2vec==0.10.0 'huggingface-hub>=0.34,<1.0'                 # ResolutionImpossible (the finding)
pip install model2vec==0.10.0 -c constraints.txt                                     # Python 3.12: ok, hub 2.4.0
pip install --dry-run -r <requirements-ml.txt minus model2vec> torch==2.13.0 -c constraints.txt   # resolves
python pipeline/ask_index_layer.py                                                   # reaches the model download, proxy 403
CARTA_BOX_ML=all CARTA_TIER=monthly CARTA_SHIP=none bash infra/hetzner/cax11/run_pipeline.sh --dry-run   # rc 0, both installs planned
FORCE=1 CARTA_STAYS_SITES=both CARTA_STAYS_BOOKING_EGRESS=residential bash infra/hetzner/cax11/stays_scrape.sh --dry-run -- --only FLR
(flock logs/carta-run.lock sleep 5 &); CARTA_STAYS_SCRAPE=1 FORCE=1 bash infra/hetzner/cax11/stays_scrape.sh   # rc 75
CARTA_TRAILSLAB_PROMOTE=1 python infra/hetzner/cax41/trailslab_worker.py run --dry-run
bash infra/hetzner/cax41/verify.sh                                                   # 103 passed, 0 failed, 3 skipped
bash infra/hetzner/cax41/trailslab_dump.sh push --dry-run; ... restore --dry-run
bash infra/hetzner/cron/install.sh --dry-run
systemd-analyze verify infra/hetzner/cron/carta-stays-scrape.{service,timer}
python -I infra/hetzner/cron/schedule.py --dry-run --check --no-state               # unscheduled: none, units match
python -I scripts/docs/build_reference.py --check                                    # ok
shellcheck -S warning <the touched shell files>
ruff check --select E9,F63,F7,F82 pipeline src scripts run_pipeline.py tests
python -m pytest tests -q <quarantine deselected>
runuser -u nobody -- python3.12 -m pytest tests/test_no_laptop_steps.py -k round_trip   # 1 passed (initdb refuses root)
cd continent-app && npm ci && npm test
```

## Config and secrets set

None set. These are new names in the box secrets file, all blank by default:

- `CARTA_BOX_ML`: `ask` when blank.
- `CARTA_GUIDED_VENV`
- `CARTA_STAYS_SCRAPE`
- `CARTA_STAYS_SITES`
- `CARTA_STAYS_BOOKING_EGRESS`
- `CARTA_STAYS_MAX_HOURS`
- `CARTA_STAYS_REMOTE`
- `CARTA_TRAILSLAB_PROMOTE`

`trailslab_dump.sh` reads `CARTA_WORKER_GPG_PUBLIC` or `CARTA_WORKER_GPG_PUBLIC_FILE` from the shell that runs it.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| H10 steps with a box or worker path | 0 of 5 | 5 of 5 (Booking: on a residential host) | +5 |
| Steps that still need the laptop (whole list below) | 5 H10 steps plus the lab | 2: the trails lab with its review UI (S98), and the Booking half of the scrape until a home host exists | -4 |
| `run_pipeline.py` tasks | 80 | 81 (`guided_search`) | +1 |
| Tasks that skip on the box for a missing package | `ask_index` (model2vec) | none with `CARTA_BOX_ML=all` | -1 |
| Box timers installed by `install.sh` | 5 | 6 (`carta-stays-scrape.timer`) | +1 |
| `cax41/verify.sh` | 102 passed | 103 passed | +1 |
| pytest (quarantine deselected) | not run on the base here; T1107 recorded the same 2 failures on its base | 811 passed, 2 failed, 10 skipped. The 2 are `test_rating_inputs::test_beauty_v2_reads_no_register` and `test_rating_stability::test_adding_places_moves_nobody_else`, which need data missing in the container. `test_no_laptop_steps.py`: 8 tests, the round trip run as `nobody` | 8 new |
| `npm test` | not run on the base | 1717 passed, 0 failed | none |
| Box disk for the ML extras | 0 | model2vec and its dependencies about 50 MB; `~/venv-guided` about 1 GB (research estimate, not measured on the box) | not measured |
| Guided search run time on the box | not run | not measured: Hugging Face and the PyTorch index are blocked here (T1161-a) | not measured |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first box ML block could not install the `all` mode | `requirements-ml.txt` pins model2vec 0.10.0, which needs huggingface-hub 2.x, against the hub below 1.0 that sentence-transformers needs | two installs: model2vec alone in the venv, the rest in `~/venv-guided`; the task runs on `CARTA_GUIDED_PY` |
| The first model2vec check failed against `constraints.txt` | this container's default Python is 3.13, and numpy 1.26.4 has no 3.13 wheel | rerun on Python 3.12, which the box uses: resolves |
| `test_backup_units_are_nightly_and_installed` failed | the stays timer was inserted between `carta-backup.timer` and `carta-reboot.timer`, a sequence that test reads | the stays timer now comes after the reboot timer |
| The stays scrape took the lock in `CARTA_LOG_DIR` | `weekly.sh` and `run_pipeline.sh` lock `$REPO/logs/carta-run.lock` whatever the log directory | the scrape now locks that same path |
| The dry-run echo of the scraper command went into its log | the `>> log` redirect covered the echo | a helper `xl` that echoes, then redirects only the command |
| The round-trip test's gpg keys could not encrypt | `--quick-gen-key ... rsa2048 default` made a key without an encryption subkey | `default default`, which adds one |
| The `run_pipeline.sh --dry-run` rewrote `cache/hero_image_meta.json`, `data/reports/hero_images_audit.json` and `data/derived/freshness_report.json` | the known `hero_audit` dry probe (T1107-e) and the status push | restored with `git checkout`; the freshness file is added to T1107-e's list as T1161-i |

## Screens checked

None. Nothing a traveller sees changed: `guided.json` and the Ask index files keep their format, and only where they are built has moved.

## What is still open

The steps that still need the laptop, and why:

1. The trails lab and its curator review UI: the `trails_*` tasks other than the worker's steps, and approving trips. This is the lab move (S98, batch 10). Until then the laptop pushes the dump (T1161-d) and approves trips.
2. Booking's half of the stays scrape, until a host with a residential address runs `stays_scrape.sh` (T1161-c). Booking turns away datacenter addresses. Hostelworld moves to the box once its one-town test passes (T1161-b).
3. The owner's own gpg secret key, which never leaves the owner. Restoring with it is the owner's fallback. The worker key covers the automatic path.

Register rows:

- **T1161-a (owner):** set `CARTA_BOX_ML=all` and check the first `ask_index` and `guided_search` runs on the box (RAM, minutes, the golden set line).
- **T1161-b (owner):** switch on the box stays scrape for Hostelworld, after one test town.
- **T1161-c (owner):** decide the Booking host. A home device is recommended; a residential proxy is the alternative. Then install the script there.
- **T1161-d (owner):** push a dual-key trailslab dump from the laptop with `trailslab_dump.sh push`. This is the step T647-b and T288-b ask for.
- **T1161-e (owner):** decide whether the worker promotes approved trips, then set `CARTA_TRAILSLAB_PROMOTE=1`.
- **T1161-f:** `requirements-ml.txt` cannot be installed in one pip call. Split it or pin model2vec so the laptop and the docs say the same as the box.
- **T1161-g:** `infra/hetzner/README.md` ("Why --no-promote", "The laptop's trails_rate task still promotes") and `pipeline/README.md` still describe the laptop-only steps. Update them; they were outside this task's files.
- **T1161-h:** once T1161-a to T1161-e are done, move T439-b, T532-b, T647-f, T647-b and T288-b to `_OPEN-CLOSED.md`. This brief allows appending rows only.
- **T1161-i:** `run_pipeline.sh --dry-run` also rewrites `data/derived/freshness_report.json`. Add it to T1107-e's scratch-path fix.

## Rollback procedure

`git revert` the T1161 commits. On the box, if anything was switched on, there are two steps:

1. Blank the new names in `~/.config/carta/env`. With `CARTA_BOX_ML=none` no ML is installed; the installed packages are harmless. Remove them with `rm -rf ~/venv-guided` and `~/venv/bin/pip uninstall model2vec`.
2. Remove the scrape units:
   ```bash
   sudo systemctl disable --now carta-stays-scrape.timer
   sudo rm /etc/systemd/system/carta-stays-scrape.{service,timer}
   sudo systemctl daemon-reload
   ```

Promoted trips stay published in the lab, and each has a `trip_reviews` row (`reviewer = pipeline:trails_export`). Reopening them is a curator action. Dumps pushed to `archive/db/trailslab/` expire under the 30-day rule.

## Owner steps (for the checklist)

- [T1161-d] Push a trailslab dump the worker can open | the worker restores only a dump encrypted to its key, and the laptop lab is the only copy | start the lab (cd tools/trailslab && docker compose up -d); on the box make the worker public key without touching its keyring (h=$(mktemp -d); gpg --homedir $h --batch --import ~/.config/carta/trailslab-worker.sec.asc; gpg --homedir $h --armor --export > worker.pub.asc; rm -rf $h) and copy worker.pub.asc to the laptop; there, in WSL or Git Bash with a PostgreSQL 18 client, gpg and rclone's r2 remote: CARTA_BACKUP_KEY=<your key id> CARTA_WORKER_GPG_PUBLIC_FILE=worker.pub.asc bash infra/hetzner/cax41/trailslab_dump.sh push | docs/runbooks/build-box.md
- [T1161-a] Build the Ask index and guided search on the box | removes the last ML steps from the laptop | add CARTA_BOX_ML=all to ~/.config/carta/env; the next monthly run installs model2vec and ~/venv-guided (check df -h after, about 1 GB); after it: grep -E "ask_index|guided_search|golden total" ~/carta/logs/pipeline_run.log and free -m during a run | docs/runbooks/build-box.md
- [T1161-b] Switch on the stays scrape for Hostelworld on the box | the March scrape no longer needs the laptop | give the box's R2 token write access to the carta-stays-state bucket (Cloudflare dashboard, R2, API tokens); sudo ~/venv/bin/python -m playwright install-deps chromium; sudo bash infra/hetzner/cron/install.sh; test one town: CARTA_STAYS_SCRAPE=1 FORCE=1 STAYS_RUN=2026-11 bash infra/hetzner/cax11/stays_scrape.sh -- --only FLR and read ~/carta/logs/stays_hostelworld.log for rows or a block; if it passes, set CARTA_STAYS_SCRAPE=1 in ~/.config/carta/env before March | infra/hetzner/cax11/stays_scrape.sh
- [T1161-c] Choose where Booking scrapes | Booking turns away datacenter addresses, so the box cannot do it | decide: a home device (recommended, about EUR 130 to 150 once) or a residential proxy (about USD 16 to 240 a year); on a home Linux device: clone the repo, a Python 3.12 venv with requirements.txt, apt-get install xvfb, the rclone r2 remote, then CARTA_STAYS_SCRAPE=1 CARTA_STAYS_SITES=booking CARTA_STAYS_BOOKING_EGRESS=residential and the two carta-stays-scrape units; turn off the laptop's CartaStayScrape task after the first good March night | Execution/P15/T1161-no-laptop-steps.md
- [T1161-e] Decide whether the worker promotes approved trips | until then approved trips reach the wire only through the laptop's trails_rate run | after one worker run with --no-install has passed: set CARTA_TRAILSLAB_PROMOTE=1 in ~/.config/carta/env; after the next worker run read logs/trailslab_worker/<run>/out/MANIFEST.txt (promoted=N) and reports/logs/rows_check.log | infra/hetzner/README.md, "The trailslab job"
