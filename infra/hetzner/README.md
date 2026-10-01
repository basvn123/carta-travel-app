# Hetzner infrastructure for Carta

This directory holds the code that stands up Carta's build machines on Hetzner
Cloud. It implements section 6.2 of
`additional docs/Carta/Plan/Architecture/CARTA_CLOUD_ARCHITECTURE.md`: one small
arm64 box that is always on and does the scheduling, the network-bound
harvesting and the publishing, and a large arm64 box that exists only for the
hours a heavy build needs it. Both exist as code; neither has been created
yet. The always-on box was written in T046
(`Execution/P3/T046-cax11-orchestrator.md`) and its schedule in T048, the
on-demand box in T047 (`Execution/P3/T047-on-demand-cax41.md`). The owner's
steps to bring them up are in `Execution/P3/_OPEN-hetzner.md`.

## The always-on orchestrator, cax11/

The box is a CAX11: Ampere arm64, 2 vCPU, 4 GB RAM, 40 GB NVMe and 20 TB of
traffic, at EUR 5.99 a month at the post-June-2026 price the architecture
document quotes. Its job is cron, `run_pipeline.py`, the collectors under
`src/ingestion`, the fare harvests and pushing results to R2. None of that is
CPU-bound; the harvests wait on the network and the collectors on rate limits,
so two cores and 4 GB are enough. Everything that is CPU- or memory-bound
(Valhalla tiles, Planetiler, the CLIP sweep, image transcoding) is kept off it
on purpose.

Four files make it. `provision.sh` runs once on the laptop with a Hetzner API
token. It creates an SSH key pair if there is none, uploads the public half,
creates a firewall that lets in port 22 over IPv4 and IPv6 and nothing else,
and creates the server with `cloud-init.yaml` as its first-boot script. It
looks every resource up by name before creating it, so running it twice is
harmless, and `--dry-run` prints every `hcloud` command without a token.

`cloud-init.yaml` turns a stock Ubuntu 24.04 image into the orchestrator on
first boot. It creates the `carta` user (key login only, passwordless sudo
because the account has no password to type), closes root login and password
login in sshd, turns on ufw with SSH only and turns on daily unattended
security upgrades without automatic reboots. It then installs
`/usr/local/sbin/carta-bootstrap` and runs it. That script is where the real
work is, and it is kept on the box so it can be re-run: it installs pinned,
checksum-verified releases of hcloud, rclone and Node 24 and the PostgreSQL 17
client from the PGDG repository (its signing key checked against the
published fingerprint; Ubuntu 24.04's own pg_dump is 16, which refuses
Supabase's Postgres 17), makes a shallow clone of the repository into
`/home/carta/carta`, builds a Python 3.12 venv in `/home/carta/venv`, runs
`npm ci` in `continent-app` for the weekly build, creates the secrets file
`/home/carta/.config/carta/env` with mode 600, and enables the weekly timer.
GNU `time` (for `verify_tasks.sh`) and `gnupg` (for the encrypted dumps) come
from the package list. Each step checks its own state first, and a failed step
does not stop the others, so after fixing a cause (a network problem, a
missing branch) the fix is `sudo carta-bootstrap` rather than rebuilding the
server. The script lives in `cloud-init.yaml`, so a box keeps the version it
was provisioned with: a box made before T263 lacks the PGDG client and
`npm ci`, and `Execution/_OPEN-MASTER.md` 7.10 has the hand commands.

The venv is installed from the repo-root `requirements.txt` with `-c
constraints.txt`, the laptop's pinned versions, and stamped with the hash
`run_pipeline.sh` compares, so the first run does not re-sync it. The
`anthropic` package is filtered out on the way in, because CLAUDE.md forbids
the Claude API; `requirements.txt` no longer lists it, so the filter is a
belt. Wheels only (`--only-binary=:all:`): T046 resolved the whole set against
Linux aarch64 wheels for CPython 3.12 and every package has one or is pure
Python, so nothing compiles on the box.

`weekly.sh` is the job the timer runs. It loads the secrets file through
`load-env.sh`, writes one "cron fired" line to `/home/carta/logs/weekly.log`
and, only when its service sets `CARTA_PIPELINE_ENABLED=1`, runs
`run_pipeline.sh`: the venv re-sync, the R2 pull of the master, the fare
history and the state file when missing, `run_pipeline.py` at the
`CARTA_MAX_CADENCE` ceiling (weekly by default, T048-h), the encrypted dumps,
the pushes, and, once `VITE_DATA_BASE` is set, the upload of the week's data to
R2 (T262). `load-env.sh` exists because an exported empty string is not the
same as a missing variable to Python; it exports the file and then unsets
every blank, so an unfilled line means "not configured", as it does on the
laptop.

The units cloud-init writes are T046's, kept on purpose: `carta-weekly.timer`
fires every Monday at 09:00 Brussels time and ten minutes after every boot, so
the schedule can be proven without waiting for a Monday, but the service does
not set `CARTA_PIPELINE_ENABLED`, so a fresh box only logs. The real units come
from `cron/install.sh`, the last owner step: the service sets the variable and
a 48 hour timeout, the timer drops the boot firing, and `carta-reboot.timer`
adds a Sunday 04:00 reboot window for security updates. The window skips while
the weekly service runs, while `logs/carta-run.lock` is held, while any
`run_pipeline.py` lives, and while a CAX41 spawn is live (T047-l).

`verify.sh` runs on the laptop after provisioning. It logs in as `carta` and
prints PASS or FAIL for the architecture, the OS, cloud-init, Python and the
venv (including that the anthropic SDK is absent), Node, the app's
node_modules, GNU time, a pg_dump of 17 or newer, hcloud, rclone, the clone,
the timer, at least one "cron fired" line, the secrets file's mode, the sshd
and ufw hardening, unattended upgrades and available memory, and says whether
the venv is stamped for the current `constraints.txt`. It exits 1 if anything
failed.

## IPv6-only, and why it probably cannot stay that way

The server is created without a public IPv4 unless `IPV4=1` is set. That is
the architecture document's default: IPv6 is free, an IPv4 costs about EUR 0.60
a month, and nobody needs to reach this box except the owner over SSH, which
works over IPv6 from any network that has it.

The problem is outbound, not inbound. An IPv6-only server can only reach hosts
that publish an IPv6 address, and on 2026-09-27 several that this box must
reach did not. github.com has no AAAA record, and neither do the GitHub release
downloads, so the repository clone and the hcloud download fail. On the data
side, the Ryanair fare endpoint on `www.ryanair.com`, the fare source the
pipeline uses, answers on IPv6. `api.liteapi.travel`, `opensky-network.org`,
`api.opentripmap.com` and `www.kaggle.com` do not. (The retired Wizz Air,
Vueling and Volotea harvesters and the unused Ryanair schedules and
Travelpayouts feeds also lack IPv6; none is part of the live pipeline.)
PyPI, nodejs.org,
downloads.rclone.org, the Ubuntu ports mirror, the Hetzner API, Wikidata,
Wikimedia Commons, Overpass, Geofabrik and the Gemini API are all reachable
over IPv6. So an IPv6-only box can install most of itself and read the open
data, but cannot fetch the code, and of the four carriers in the fare merge it
keeps only Ryanair. The fare harvests are the main reason the box exists.

The document's line "IPv6-only plus Cloudflare in front works" is about serving
the app, where Cloudflare answers on both protocols. It does not carry over to
a machine that makes outbound calls. The code keeps IPv6-only as the default
because that is what the task asked for, prints a warning on every IPv6-only
run, and leaves the choice to the owner (register row T046-b). The practical
answer is `IPV4=1`. Alternatives, such as a public NAT64 gateway or routing
through another host, add a dependency on a third party in the path of every
harvest to save sixty cents a month.

## What costs what

| Item | Monthly |
|---|---|
| CAX11, always on | EUR 5.99 |
| Primary IPv4, only with IPV4=1 | about EUR 0.60 |
| CAX41 workers, on demand (T047) | EUR 0.056 an hour of existence; see cax41/cost.py |
| Traffic, up to 20 TB | included |
| Hetzner backups | not enabled |

Backups are off because the box holds nothing that is not either in git or
pushed to R2; rebuilding it is `provision.sh` plus filling the secrets file.

## The on-demand worker, cax41/ and jobs/

A CAX41 is Ampere arm64 with 16 vCPU, 31 GB of RAM and 320 GB of NVMe, at
about EUR 0.056 an hour. It exists for one job and is then deleted: the
Valhalla tile builds, the photo engine's CLIP sweep, and later Planetiler and
the libvips image ladder. `infra/hetzner/cax41/spawn.sh <job> [args]` does the
whole round trip from the orchestrator. It creates the server next to the
orchestrator (same location, same SSH key, same SSH-only firewall, labels
role=worker, job, run, created, deadline and keep), with user data rendered
from `cax41/cloud-init.yaml`. The worker installs rclone, reports "started" to
R2, makes a sparse clone, and runs `jobs/worker.sh`, which installs what the
job needs, mirrors the job's inputs from R2, runs `jobs/<job>.sh` with every
core, pushes `out/` to `archive/runs/<run>/out/`, writes its final status and
powers off. spawn.sh polls `archive/runs/<run>/status.json`, promotes the
outputs to the job's prefix on success, deletes the server, and appends one
line to the cost ledger. `jobs/jobs.tsv` is the table both sides read: inputs,
outputs, the hard ceiling and the planning estimate per job.

| Job | Inputs from R2 | Outputs to | Ceiling | Planned | State |
|---|---|---|---|---|---|
| selftest | none | archive/built/selftest | 1 h | 0.25 h | real; proves the round trip |
| valhalla_tiles | archive/inputs/geofabrik | archive/built/valhalla | 6 h | 1 h | real |
| clip_sweep | archive/caches (layer, embeddings, models) | archive/caches | 12 h | 3 h | real |
| planetiler | archive/inputs/geofabrik | tiles/basemap | 8 h | 2 h | stub, exit 3 |
| image_transcode | archive/caches (layer) | img directly; archive/built/derive (report) | 8 h | 7.5 h | real (T049); beaches needs several runs |

The planetiler stub has nothing to wrap. No Planetiler profile or consumer
exists in the repository, and section 5.4 of the architecture document says to
leave the basemap alone. Its header holds the command it will run.

`image_transcode` runs `pipeline/photos/derive.py` (T049): 3 AVIF + 2 WebP per
photograph, content-addressed under `img/{ab}/{cd}/{sha1}/`, and a manifest per
layer at `img/manifest/<layer>.json`. It is the one job that writes a live
prefix from the worker, deliberately: a content-addressed object is either
absent or right, nothing points at it until the manifest does, and the manifest
is written last. The job script's header gives the whole argument. Only its
report, journals and a manifest copy go through staging, to
`archive/built/derive/`.

Why it is shaped like this. The status object in R2 is the only interface
between the two machines, so neither needs to reach the other: no SSH from the
orchestrator into the worker, no inbound port on the worker. The worker writes
to a staging prefix and the orchestrator promotes, so a failed, timed-out or
half-finished run can never replace a good artifact in R2. And the delete
belongs to the orchestrator, unconditionally. A trap on EXIT, INT and TERM
deletes the worker on every way out of spawn.sh, including a failed create
(which may have made the server anyway) and a wait whose API calls fail; the
delete is confirmed by the API answering "not found" and retried three times;
after every run spawn.sh sweeps every role=worker server past its deadline or
powered off with no live owner; and `carta-worker-sweep.timer` runs that sweep
hourly, for the cases spawn.sh cannot cover, such as the orchestrator
rebooting or spawn.sh being killed outright. A powered-off Hetzner server is
billed like a running one, so the worker's own poweroff saves nothing; it only
tells spawn.sh at its next poll that the run is over.

Should the worker hold a Hetzner token so it can delete itself? By default it
does not. A Hetzner token is scoped to the whole project, not to one server:
the worker runs pip packages, docker images and downloads from the internet,
and anything on it can read its user data from the metadata service. A token
there could delete the orchestrator, read every server's user data, or run up
a bill. The worker already holds R2 credentials, which it cannot work without,
and a separate R2 token for workers (T047-f) limits that exposure; there is
no equivalent narrowing for Hetzner. What self-delete would add is one more
net for the case where the orchestrator is down for longer than the job, and
the hourly sweep and the ceiling already bound that case to hours of
EUR 0.056. `CARTA_WORKER_SELF_DELETE=1` exists for the owner who weighs it
differently; with it, the worker calls the API as its last act.

Git LFS on the worker (register row T048-l). The clone is shallow,
blob-filtered and sparse (`pipeline/`, `infra/`, `tools/trailslab/valhalla/`
and the root files, about 5 MB), git-lfs is not installed and
`GIT_LFS_SKIP_SMUDGE=1` is set. No job reads a tracked LFS cache; the inputs
come from R2 by prefix. So a run costs GitHub a few megabytes, where a full
clone would pull the 613 MB of LFS objects every time.

The rescore hold stays, as a correctness guard. docs/PHOTOS.md has the rule
and T047's change to it: a layer rebuild writes `cache/<layer>/.rescore_hold`,
a rescore writes `cache/<layer>/.rescore_running`, and each refuses while the
other's file is live. spawn.sh refuses a held layer before creating anything,
the worker refuses a tarball packed mid-rebuild, and a hold that appears while
the worker runs stops the promotion.

What it costs. `cax41/cost.py` holds the rates (EUR 0.056 an hour, and the
EUR 0.60 a month IPv4 pro-rated over 730 hours) and prices every ledger row
two ways, at wall-clock hours and at whole started hours, until the first
invoice shows which one Hetzner bills. `spawn.sh --cost` prints the month so
far. The ledger is `logs/cax41_runs.tsv` on the orchestrator, copied to
`archive/logs/cax41_runs.tsv` in R2 after every run. It does not write to
T043's `public.infra_ledger`: that table is keyed by month and line item, is
written by the owner through `admin_set_infra_cost`, and should carry the
Hetzner invoice as `actual`. `cost.py mtd` prints the month's total as the
`hetzner_cax41` line in that shape, marked `model`, for the owner to enter
until the invoice replaces it.

IPv4 is on for workers by default, unlike the orchestrator's T046 default,
because github.com has no IPv6 address and the worker must clone. It costs
about EUR 0.0008 an hour. `--no-ipv4` turns it off, with a warning.

`cax41/verify.sh` runs on the laptop with no account: it renders and
schema-checks the user data for every job, dry-runs every job, and drives
spawn.sh with fake hcloud and rclone binaries through every failure path to
prove the delete is always issued.

## What comes next

T048 left the monthly and quarterly tiers unscheduled once the Windows task is
disabled (T048-h), and T047 does not change that. None of the 28 monthly and
quarterly tasks is one of the worker's jobs. Most are network-bound and belong
on the orchestrator once verified on arm64; the heavy ones (trails_ingest,
trails_splice, trails_derive_routes, cycling_harvest) read and write the
trailslab PostGIS lab, which lives on neither box. Moving them to the worker
means a job that starts the lab in Docker on the CAX41 (the imresamu image
T006 named), restores T045's trailslab dump, runs the tasks and dumps it back:
a task of its own.

The derive stage (`pipeline/photos/derive.py`, migration step 4) replaced the
`image_transcode` stub in T049. Its `vips` need installs `libvips-dev` and
`libheif-plugin-aomenc` from apt (Ubuntu 24.04 ships libheif's AV1 encoder as
a separate package; without it libvips reads AVIF but cannot write it) and
then pyvips 3.2.0, an sdist that binds the system library (T006). The job's
first step is `derive.py selfcheck`, which fails the run with exit 6 when
either format cannot be written. Owner steps: Execution/P3/_OPEN-hetzner.md
step 22 onward.
