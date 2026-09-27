# Hetzner infrastructure for Carta

This directory holds the code that stands up Carta's build machines on Hetzner
Cloud. It implements section 6.2 of
`additional docs/Carta/Plan/Architecture/CARTA_CLOUD_ARCHITECTURE.md`: one small
arm64 box that is always on and does the scheduling, the network-bound
harvesting and the publishing, and, later, a large arm64 box that exists only
for the hours a heavy build needs it. Only the always-on box exists as code so
far. It was written in T046 (`Execution/P3/T046-cax11-orchestrator.md`), and
the owner's steps to bring it up are in `Execution/P3/_OPEN-hetzner.md`.

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
checksum-verified releases of hcloud, rclone and Node 24, makes a shallow clone
of the repository into `/home/carta/carta`, builds a Python 3.12 venv in
`/home/carta/venv` from the repo-root `requirements.txt`, creates the secrets
file `/home/carta/.config/carta/env` with mode 600, and enables the weekly
timer. Each step checks its own state first, and a failed step does not stop
the others, so after fixing a cause (a network problem, a missing branch) the
fix is `sudo carta-bootstrap` rather than rebuilding the server.

Two edits are made to `requirements.txt` on the way into the venv. The
`anthropic` package is dropped, because CLAUDE.md forbids the Claude API and
nothing on this box may call it. `pyyaml` is added, because
`pipeline/archive/pack.py` and `push.py` import it and the requirements file
does not list it. Wheels only (`--only-binary=:all:`): T046 resolved the whole
set against Linux aarch64 wheels for CPython 3.12 and every package has one or
is pure Python, so nothing compiles on the box.

`weekly.sh` is the job the timer runs, and today it is a placeholder. The
systemd timer `carta-weekly.timer` fires every Monday at 09:00 Brussels time,
the same slot the laptop's Windows Scheduled Task uses, and ten minutes after
every boot so that the schedule can be proven without waiting for a Monday.
The placeholder loads the secrets file through `load-env.sh` and writes one
"cron fired" line to `/home/carta/logs/weekly.log`. `load-env.sh` exists
because an exported empty string is not the same as a missing variable to
Python; it exports the file and then unsets every blank, so an unfilled line
means "not configured", as it does on the laptop.

`verify.sh` runs on the laptop after provisioning. It logs in as `carta` and
prints PASS or FAIL for the architecture, the OS, cloud-init, Python and the
venv (including that the anthropic SDK is absent), Node, hcloud, rclone, the
clone, the timer, at least one "cron fired" line, the secrets file's mode, the
sshd and ufw hardening, unattended upgrades and available memory. It exits 1 if
anything failed.

## IPv6-only, and why it probably cannot stay that way

The server is created without a public IPv4 unless `IPV4=1` is set. That is
the architecture document's default: IPv6 is free, an IPv4 costs about EUR 0.60
a month, and nobody needs to reach this box except the owner over SSH, which
works over IPv6 from any network that has it.

The problem is outbound, not inbound. An IPv6-only server can only reach hosts
that publish an IPv6 address, and on 2026-09-27 several that this box must
reach did not. github.com has no AAAA record, and neither do the GitHub release
downloads, so the repository clone and the hcloud download fail. On the data
side, the main Ryanair fare endpoint on `www.ryanair.com` answers on IPv6, but
the hosts the other carrier harvesters call do not: `services-api.ryanair.com`
(schedules), `be.wizzair.com`, `apiw.vueling.com` and `api.volotea.com`. Nor
do `api.travelpayouts.com`, `api.liteapi.travel`, `opensky-network.org`,
`api.opentripmap.com` or `www.kaggle.com`. PyPI, nodejs.org,
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
| Traffic, up to 20 TB | included |
| Hetzner backups | not enabled |

Backups are off because the box holds nothing that is not either in git or
pushed to R2; rebuilding it is `provision.sh` plus filling the secrets file.

## What comes next

T047 adds the on-demand heavy box: a CAX41 at about EUR 0.056 an hour, created
by `hcloud` from this orchestrator, given its own cloud-init that pulls the repo
and the inputs from R2, run, made to push its artifacts to R2, and deleted. It
needs a second Hetzner token in the orchestrator's secrets file (`HCLOUD_TOKEN`
is already listed in `cax11/env.example`) and will live next to this directory
as `cax41/`.

T048 ports the schedule. It replaces the body of `weekly.sh` with what
`run_pipeline.bat` does today, fixes the Windows assumptions T006 listed in
`run_pipeline.py` and the cycling scripts, wires `pipeline/archive/push.py
--pull` at the start of a run and `pack.py` plus `push.py` at the end (T045-g),
and decides whether the boot-time firing and the no-reboot policy stay. The
first full pipeline run on this box is T048's to make, not T046's.
