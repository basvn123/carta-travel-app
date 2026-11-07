# T1182: the trails lab on the box

Roadmap item **D24** (trail quality pack, register row T784-a). Round 2 session S98, batch 10. Branch `p15-s98-trails-lab-box`, from `p15-round2`.

## Date

2026-11-07

## What changed

The trails lab and its curator review app now have a box setup, written and dry-run, so trail runs and reviews can leave the laptop once the owner switches it on. `tools/trailslab/box/` (new) has four parts:

- **`docker-compose.box.yml`**, an override of the lab's compose file. The image pin stays in one place. The data goes on a Hetzner Volume (`TRAILSLAB_DATA_DIR`). There are no initdb scripts, because the R2 dump brings the schema. The literal `trailslab` password is not allowed. Memory is capped at 1.5 GB and Postgres is tuned for the 4 GB CAX11. The restart policy is `unless-stopped`, and the port is still 127.0.0.1:5433.
- **`lab.sh`**: `check`, `config`, `env`, `up`, `down`, `status`, `restore`, `push`, `init-schema`, `review-build`, `install`, `review on|off`, `tunnel`. Every command takes `--dry-run`.
- **`lab.env.example`**: the setting names the box needs.
- **Two systemd units** for the review API (127.0.0.1:8011) and `vite preview` of the built UI (127.0.0.1:4174, which proxies `/api`). They start only while a curator reviews, and the owner reaches them through `ssh -L`.

The trails chain's box mode is one switch, `CARTA_TRAILSLAB_HOME=box`. When it is on:

- The `trails_*` tasks reach the lab through the `TRAILSLAB_*` names.
- When the lab is down, their guard names `lab.sh up` instead of the laptop's `docker compose up -d`.
- The `trailslab_worker` task stands down. The worker would restore an R2 dump that misses the box's reviews, and its fresh dump would then hide them.

`lab.sh push` and `restore` wrap T1161's `trailslab_dump.sh` and keep a sync stamp: the newest `trip_reviews` id at the last push or restore. A restore over reviews that were never pushed is refused.

T784-a stays open. The box half is not done until the owner attaches the volume, installs Docker and runs the restore (T1182-a).

## Research

A research subagent compared the options on 2026-11-07. docs.hetzner.com, apt.postgresql.org and postgresql.org were blocked from the container, so prices come from 2026 secondary sources.

- **How to run the database on the CAX11.**
  - (a) Docker Engine and compose with the multi-arch image the lab already pins (`imresamu/postgis:17-3.5-bundle0-bookworm`, amd64 and arm64, pgRouting included; the bundle's arm64 support is marked experimental, and the tag was last updated 2025-09-01).
  - (b) Native PGDG packages (`postgresql-17`, `postgresql-17-postgis-3`, `postgresql-17-pgrouting`; PGDG has built arm64 since 2020, though arm64 builds of those two packages on noble-pgdg were not confirmed).

  The research pick was (b): no daemon, about 2 GB less disk, and updates through unattended-upgrades. **Chosen: (a), with (b) as the runner-up.** The brief asks for a compose file for the box. The same image runs on the laptop, on the arm64 fallback of the worker job and on the box, so one pin covers all three and the pgRouting build stays the same. The Docker daemon's memory cost is small next to the 1.5 GB cap. If the first arm64 run of the image fails (T324-a), (b) is the fallback: `lab.sh` talks to the lab only through `TRAILSLAB_*` and `psql`, so only `up` and `down` would change.
- **Storage.** The options were:
  - a Hetzner Volume, EUR 0.0572 a GB a month since April 2026, 5000 IOPS and 200 MB/s, automount or fstab;
  - a bigger server (CAX21: 8 GB RAM, 80 GB disk, EUR 10.49 a month; CAX31: EUR 20.99);
  - keeping the lab only on the on-demand worker. A CPX42 is now quoted at EUR 69.49 a month list, and the lab would be restored for hours on every run.

  **Chosen: an 80 GB Volume on the CAX11**, about EUR 4.58 a month. The research said 60 GB. 80 GB holds a restored lab of tens of GB (the laptop's whole Docker disk is 31.6 GB) plus a 5 GB dump while it restores.
- **Tuning for 4 GB shared with the pipeline.** The research suggested:
  - shared_buffers 512MB, effective_cache_size 1.5GB, work_mem 16MB, maintenance_work_mem 256MB, max_connections 20, max_wal_size 2GB, random_page_cost 1.1;
  - a container limit of 1.5 GB with 256 MB shm;
  - a 2 GB swapfile.

  **Chosen: the same, with shared_buffers at 384MB and effective_cache_size at 1GB**, to leave more headroom inside the 1.5 GB cap. `lab.sh check` refuses a box with under 6 GB of RAM and no swap.
- **Private access to the review app.** The options were SSH local forwarding, Tailscale, and Cloudflare Tunnel with Access. **Chosen: `ssh -L`.** It needs no new daemon or account, the app stays bound to 127.0.0.1, and the box firewall already allows only port 22. Tailscale is the fallback if a phone ever needs access.
- **Restoring pg_dump 18 dumps into PostgreSQL 17.** This works. The `SET transaction_timeout` line breaks only servers on 16 or older. pg_dump 18 does not dump statistics by default; if it ever does, add `--no-statistics`. The box needs `postgresql-client-18`, which `lab.sh check` asks for.

Links: https://github.com/ImreSamu/docker-postgis , https://www.df7cb.de/blog/2020/arm64-on-apt.postgresql.org.html , https://docs.hetzner.com/cloud/volumes/overview , https://www.bitdoze.com/hetzner-cloud-cost-optimized-plans/ , https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ , https://northflank.com/blog/hetzner-cloud-server-price-increases , https://help.heroku.com/V0P565P5/why-am-i-getting-unrecognized-configuration-parameter-transaction_timeout-when-restoring-a-postgresql-backup , https://www.postgresql.org/docs/release/18/

## Files touched

- Created:
  - `tools/trailslab/box/README.md`
  - `tools/trailslab/box/docker-compose.box.yml`
  - `tools/trailslab/box/lab.sh`
  - `tools/trailslab/box/lab.env.example`
  - `tools/trailslab/box/carta-trailslab-review-api.service`
  - `tools/trailslab/box/carta-trailslab-review-ui.service`
  - `tools/trailslab/box/initdb-empty/README.txt`
  - `tests/test_trailslab_box.py`
  - this report
- Modified:
  - `run_pipeline.py`: `trailslab_home()`, the guard message, and the worker guard standing down in box mode. These are the trails chain's lab connection settings.
  - `docs/reference/python.md`: regenerated by `build_reference.py`, which CI checks.
  - `docs/runbooks/build-box.md`: the new section "The trails lab on the box", plus one sentence in the T1161 section that pointed at S98.
  - `docs/HANDBOOK.md`: the build box section.
  - `ROADMAP.md`: D24 status.
  - `Execution/_OPEN.md`: rows appended.

Nothing in `tools/trailslab/` outside `box/` and nothing in `cache/` was touched.

## Commands run

```bash
apt-get install -y postgresql-16-postgis-3 postgresql-16-pgrouting shellcheck     # in the container, for the dry run
CARTA_LAB_NO_ENV=1 bash tools/trailslab/box/lab.sh config                        # docker compose config, both files
shellcheck -S warning tools/trailslab/box/lab.sh
systemd-analyze verify tools/trailslab/box/carta-trailslab-review-*.service
# manual: initdb + pg_ctl as nobody on port 55433, then
TRAILSLAB_PORT=55433 bash tools/trailslab/box/lab.sh init-schema                 # 12 files, 22 tables, postgis 3.4.2, pgrouting 3.6.1
python -m pytest tests/test_trailslab_box.py -q                                   # as root: 7 passed, 1 skipped
runuser -u nobody -- python -m pytest tests/test_trailslab_box.py -k round_trip   # 1 passed
python -I scripts/docs/build_reference.py                                         # python.md regenerated
ruff check --select E9,F63,F7,F82 pipeline src scripts run_pipeline.py tests
python -m pytest tests -q
cd continent-app && npm test
```

## Config and secrets set

None set. These are new names for the box secrets file, all blank or defaulted in `tools/trailslab/box/lab.env.example`:

- `CARTA_TRAILSLAB_HOME`
- `TRAILSLAB_DATA_DIR`
- `TRAILSLAB_REVIEWER`
- `TRAILSLAB_MEM_LIMIT`, `TRAILSLAB_SHARED_BUFFERS`, `TRAILSLAB_WORK_MEM`, `TRAILSLAB_MAINT_MEM`
- `CARTA_TRAILSLAB_MIN_FREE_GB`
- `CARTA_TRAILSLAB_DUMP_DIR`

The existing `TRAILSLAB_HOST`, `TRAILSLAB_PORT`, `TRAILSLAB_DB`, `TRAILSLAB_USER` and `TRAILSLAB_PASSWORD` are also set there. `lab.sh env` prints the block with a random password.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Steps that still need the laptop (T1161's list) | 2: the trails lab with its review UI, and Booking | 2 until the owner enables the box lab; then 1 (Booking) | -1 after T1182-a |
| Lab-guarded `run_pipeline.py` tasks whose lab guard can pass on the box | 0 of 22 | 22 of 22 with `CARTA_TRAILSLAB_HOME=box`. 8 need nothing but the lab: popularity, splice, regionize, hierarchy, curate, and cycling harvest, enrich and publish. 14 name further inputs (T1182-d) | +22 |
| Box disk the lab needs | none possible (12 GB free on root) | an 80 GB volume, about EUR 4.58 a month | +80 GB volume |
| Lab memory on the box | n/a | capped at 1.5 GB (planning figure, T1182-b) | not measured on the box |
| initdb files applied by `lab.sh init-schema` | n/a | 12 of 12, 22 tables, PostGIS 3.4.2 and pgRouting 3.6.1 (PostgreSQL 16 here) | n/a |
| `tests/test_trailslab_box.py` | none | 8 tests (the round trip run as `nobody`) | +8 |
| pytest (quarantine deselected) | T1161 recorded 811 passed, 2 failed on its base | 855 passed, 2 failed, 11 skipped. The 2 are the same data-dependent tests T1161 recorded: `test_rating_inputs::test_beauty_v2_reads_no_register` and `test_rating_stability::test_adding_places_moves_nobody_else` | same 2 failures |
| `npm test` | not run on the base | 1842 tests, 1830 passed, 0 failed (the rest skipped) | none |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A restore into a lab built by the image's first start would trip over existing tables | the base compose file mounts `initdb/` and creates the schema; the dump then creates it again | the box override mounts `box/initdb-empty/` over it; `lab.sh init-schema` covers a lab with no dump |
| Relative paths in the override | compose resolves them against the first file's folder (`tools/trailslab/`), not the override's | `./box/initdb-empty`; `lab.sh config` shows the resolved path |
| The review UI unit pointed at `/usr/bin/node` | cloud-init installs node in `/opt/node` with links in `/usr/local/bin` | `/usr/local/bin/node` |
| The round-trip test's insert failed | `trips.id` is `GENERATED ALWAYS` | `overriding system value` |
| `initdb` refused to run in the scratchpad as `nobody` | the scratchpad is not readable by `nobody` | the cluster ran under `/var/tmp` |

## Screens checked

None. The review app's code is unchanged, and nothing a traveller sees changed. `vite preview` proxying `/api` and the API accepting the 4174 origin are checked statically in the tests. The served review app on the box is part of T1182-a.

## What is still open

- **T1182-a (owner):** enable the lab on the box, using the exact commands in `tools/trailslab/box/README.md`. The first `lab.sh up` is also the first arm64 run of the image (T324-a). T784-a closes after this.
- **T1182-b (owner):** after the first monthly run with the lab up, record RAM and minutes. Adjust the cap or the server if the box swaps hard.
- **T1182-c:** the worker stands down in box mode. Teach `trailslab_worker.py` to push from the box lab before spawning and restore back through `lab.sh restore`, so the way_tags refresh and the gated exports run again.
- **T1182-d:** 14 of the 22 lab-guarded tasks need inputs beyond the lab (extracts, DEM tiles, BRouter tiles, Overpass, Commons). Decide which inputs live on the volume and which tasks stay with the worker.
- **T1182-e:** the box lab is the only live copy, and `archive/db/` expires after 30 days. Add a `lab.sh push` timer, every 28 days.
- **T1182-f:** `infra/hetzner/cax11/env.example` and `infra/hetzner/README.md` do not name the box lab yet.
- T784-a, T324-a and T1161-d stay open. T1182-a covers the first; the first `lab.sh up` tests the second; the third must happen before the restore.

## Rollback procedure

`git revert` the T1182 commits. On the box, if it was enabled:

1. Run `bash tools/trailslab/box/lab.sh push` to keep the box's reviews in R2.
2. Run `lab.sh review off`, then `lab.sh down`.
3. Blank `CARTA_TRAILSLAB_HOME` in `~/.config/carta/env`, and the worker task comes back.
4. Remove the review units: `sudo rm /etc/systemd/system/carta-trailslab-review-*.service && sudo systemctl daemon-reload`.
5. The volume keeps the data until `hcloud volume detach carta-trailslab` and `hcloud volume delete carta-trailslab`. Deleting it is one-way.

## Owner steps (for the checklist)

- [T1182-a] Move the trails lab and its review app to the box | trail runs and reviews stop needing the laptop, and T784-a can close | after T1161-d, stop reviewing on the laptop; hcloud volume create --name carta-trailslab --size 80 --server carta-orchestrator --format ext4; on the box mount it at /mnt/trailslab through fstab, add a 2 GB swapfile, sudo apt-get install -y docker.io docker-compose-v2 postgresql-client-18 and add carta to the docker group; bash tools/trailslab/box/lab.sh env >> ~/.config/carta/env; lab.sh check, lab.sh up, lab.sh restore, lab.sh status (the laptop's trips count); lab.sh review-build, lab.sh install, lab.sh review on, and from your machine ssh -N -L 4174:127.0.0.1:4174 -L 8011:127.0.0.1:8011 carta@<box> | tools/trailslab/box/README.md, "Enable it on the box"
- [T1182-b] Check the box lab under a real run | the 1.5 GB cap and the tuning are planning figures for a 4 GB box that also runs the pipeline | during the first monthly run with the lab up, run free -m and bash tools/trailslab/box/lab.sh status; afterwards grep trails_ ~/carta/logs/pipeline_run.log for minutes and skips; if the box swaps hard, lower TRAILSLAB_MEM_LIMIT or rescale to a CAX21 | docs/runbooks/build-box.md, "The trails lab on the box"
