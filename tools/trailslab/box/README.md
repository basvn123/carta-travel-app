# The trails lab on the build box

T1182, ROADMAP D24, register row T784-a. The PostGIS lab and its curator review app run on the CAX11 build box (`carta-orchestrator`), filled from the R2 dump that `infra/hetzner/cax41/trailslab_dump.sh` writes (T1161), so trail runs and reviews no longer need the laptop. Nothing in `tools/trailslab/` outside this folder changes: the box uses the same image pin through an override file.

| File | What |
|---|---|
| `docker-compose.box.yml` | override of `../docker-compose.yml`: data on the volume, no initdb scripts, a real password, 1.5 GB memory cap, Postgres tuned for 4 GB, `restart: unless-stopped`, port still 127.0.0.1:5433 |
| `lab.sh` | `check`, `config`, `env`, `up`, `down`, `status`, `restore`, `push`, `init-schema`, `review-build`, `install`, `review on|off`, `tunnel`; every command takes `--dry-run` |
| `lab.env.example` | the names for `~/.config/carta/env` (`lab.sh env` prints them with a random password) |
| `carta-trailslab-review-api.service`, `carta-trailslab-review-ui.service` | the review API (127.0.0.1:8011) and `vite preview` of the built UI (127.0.0.1:4174, proxies `/api`); started only by `lab.sh review on`, never at boot |
| `initdb-empty/` | mounted over the image's initdb folder: the restore brings the schema |

## The switch

`CARTA_TRAILSLAB_HOME=box` in the box secrets file. Then the `run_pipeline.py` `trails_*` tasks find the lab through `TRAILSLAB_HOST`, `TRAILSLAB_PORT`, `TRAILSLAB_DB`, `TRAILSLAB_USER` and `TRAILSLAB_PASSWORD` (`pipeline/trails/db.py`), their guard names `lab.sh up` when the lab is down, and the `trailslab_worker` task stands down: the worker restores the newest R2 dump, which would miss the reviews made here, and its fresh dump would then hide them. Tasks that need more than the lab (Geofabrik extracts, DEM tiles, BRouter, Overpass, Commons) keep their own guards and inputs.

Run a trails script by hand on the box with the secrets loaded: `. infra/hetzner/cax11/load-env.sh && ~/venv/bin/python pipeline/trails/smoke_test.py`.

## Sync with R2

`lab.sh push` dumps the lab to `archive/db/trailslab/` (encrypted to the owner and worker keys) and `lab.sh restore` puts the newest dump in. Both write a sync stamp beside the data directory: the newest `trip_reviews` id at that moment. A restore over a lab whose reviews are newer than its stamp is refused (exit 3) without `--force`, so a review is never lost to a restore. `archive/db/` expires after 30 days, so push at least every four weeks (the box lab is the only live copy in box mode).

## Enable it on the box (owner)

From the laptop, with `hcloud` and the project token:

```bash
hcloud volume create --name carta-trailslab --size 80 --server carta-orchestrator --format ext4
```

On the box, as `carta` (`ssh carta@<box>`):

```bash
# 1. the volume at /mnt/trailslab, and 2 GB of swap (4 GB RAM is shared with the pipeline)
dev=$(ls /dev/disk/by-id/scsi-0HC_Volume_* | head -n 1)
sudo mkdir -p /mnt/trailslab
echo "$dev /mnt/trailslab ext4 discard,nofail,defaults 0 0" | sudo tee -a /etc/fstab
sudo mount -a && sudo install -d -o carta -g carta /mnt/trailslab/dump
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# 2. Docker and the PostgreSQL 18 client (the dumps come from pg_dump 18; PGDG is set up by cloud-init)
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 postgresql-client-18
sudo usermod -aG docker carta && exit      # log in again for the group
# 3. the settings
cd ~/carta && git fetch -q origin main && git reset -q --hard FETCH_HEAD
bash tools/trailslab/box/lab.sh env >> ~/.config/carta/env && chmod 600 ~/.config/carta/env
bash tools/trailslab/box/lab.sh check      # every line ok
# 4. the lab, from the newest dump, opened with the worker key (kept on the box since T647)
gpg --batch --list-secret-keys | grep -q . || gpg --batch --import ~/.config/carta/trailslab-worker.sec.asc
bash tools/trailslab/box/lab.sh up
bash tools/trailslab/box/lab.sh restore
bash tools/trailslab/box/lab.sh status     # the laptop's trips count
~/venv/bin/python run_pipeline.py --only trails_validate --dry-run
# 5. the review app
bash tools/trailslab/box/lab.sh review-build && bash tools/trailslab/box/lab.sh install
bash tools/trailslab/box/lab.sh review on
```

On the owner's machine: `ssh -N -L 4174:127.0.0.1:4174 -L 8011:127.0.0.1:8011 carta@<box>`, then open http://127.0.0.1:4174/. `lab.sh review off` when done.

Before step 4, the laptop pushes its last dump (`trailslab_dump.sh push`, register row T1161-d) and stops reviewing there: from then on the box lab is the one curators use.

## Undo

`lab.sh push` (keep the box's reviews), `lab.sh review off`, `lab.sh down`, blank `CARTA_TRAILSLAB_HOME` in `~/.config/carta/env` (the worker task comes back). The volume keeps the data until `hcloud volume detach carta-trailslab` and `hcloud volume delete carta-trailslab`.

## Checked here

`lab.sh config` validates both compose files; `tests/test_trailslab_box.py` runs `init-schema`, `push` and `restore` through `lab.sh` on a throwaway PostgreSQL 16 cluster with PostGIS 3.4 and pgRouting 3.6, including both refusals. Not run here: the container on Docker (no daemon in the cloud container), the arm64 image, the real dump.
