# T046 Provision the always-on CAX11 orchestrator

## Task ID

T046

## Date

2026-09-27

## What changed

No server exists. What exists is the code that creates one, checked as far as a
machine without a Hetzner account allows, and the owner procedure to run it.
The task's done condition (the box exists, cron fires, one full pipeline run
completes on it) is not met, and the last part of it cannot be met by T046 at
all, because the weekly job is a placeholder until T048 ports the schedule.

How it works, for whoever maintains it. `infra/hetzner/cax11/provision.sh`
runs once on the laptop with `HCLOUD_TOKEN` exported. It makes a local SSH key
pair if there is none, uploads the public half to Hetzner, creates a firewall
that admits TCP 22 over IPv4 and IPv6 and nothing else, and creates a CAX11
running Ubuntu 24.04 in fsn1 (or nbg1) with the label role=orchestrator, no
IPv4 unless `IPV4=1`, and `cloud-init.yaml` as user data. It looks each
resource up by name before creating it, so a second run after a partial
failure carries on and a run against a finished project does nothing. It
refuses a real run without a token, and `--dry-run` prints every hcloud
command without one.

`cloud-init.yaml` makes the stock image into the orchestrator. The cloud-init
modules do the parts they are good at: the `carta` user with key-only login,
root and password login switched off (a sshd drop-in named 10- so it wins over
Ubuntu's 50-cloud-init.conf), ufw with SSH only, unattended security upgrades
without automatic reboots, the Brussels time zone, and the packages. Everything
that can fail for reasons outside the box goes into one script,
`/usr/local/sbin/carta-bootstrap`, which cloud-init writes and then runs. It
installs hcloud 1.69.0, rclone 1.75.1 and Node 24.21.0 (the active LTS line;
the laptop runs 24.14) from their release tarballs, each checked against a
SHA-256 read from the publisher's checksum file on 2026-09-27. It makes a
shallow single-branch clone of the repository with Git LFS, builds a Python
3.12 venv, copies `env.example` to `/home/carta/.config/carta/env` with mode
600, and enables the timer. Each step checks its own state first and a failed
step does not stop the others, so the repair for a failed first boot is
`sudo carta-bootstrap`, not a new server. The design choice here was to keep
cloud-init's `runcmd` short and put the logic in a re-runnable script, because
cloud-init runs once and a network failure during first boot is likely (see
the IPv6 finding below).

The requirements file. There is exactly one, `requirements.txt` at the repo
root; `git ls-files` finds no other requirements, pyproject or Pipfile. The
bootstrap makes two edits on the way in. It drops `anthropic`, which the file
still lists for `pipeline/trails/describe.py` and which CLAUDE.md forbids
(already tracked as T041-g), and `verify.sh` fails if the SDK is ever found in
the venv. It adds `pyyaml`, which `pipeline/archive/pack.py` and `push.py`
import and the file does not list. The install is wheels only.

The schedule is a systemd timer, `carta-weekly.timer`, rather than a crontab
line: it logs to the journal, `Persistent=true` catches up a Monday missed
while the box was off, and `systemctl` gives `verify.sh` something exact to
ask. It fires Mondays at 09:00 Brussels time, the slot of the laptop's
TravelAppFareRefresh task, and ten minutes after every boot, which is how the
owner can see it fire without waiting for a Monday. The cron package is
installed anyway, as asked. The unit runs `infra/hetzner/cax11/weekly.sh` from
the clone as `carta`. Today that script sources the secrets file through
`load-env.sh` and appends one "cron fired" line to `/home/carta/logs/weekly.log`,
with a count of how many secrets are set and never their values.
`load-env.sh` exists because an exported empty string is not an absent
variable to Python: `os.environ.get("INGEST_DATA_DIR", default)` returns the
empty string, and `pipeline/env_local.py` will not fill a key that exists even
empty. It exports the file and then unsets every blank.

`env.example` lists 45 variable names, collected from every environment read
in `run_pipeline.py`, `pipeline/` and `src/` plus the repo-root `.env.example`:
the five rclone variables `push.py` needs, the Cloudflare pair, the archive and
backup variables from T045, `HCLOUD_TOKEN` for T047, the heartbeat URL, the
harvester and collector credentials, the Gemini and search keys, and six
optional knobs. Endpoint overrides are left out; none is a secret and each
collector documents its own. `ANTHROPIC_API_KEY` is absent on purpose.

The IPv6 finding, which is the most important thing in this report. The task
asks for IPv6-only by default, following section 7 of the architecture
document ("IPv6-only plus Cloudflare in front works and is free"). That
sentence is about serving the app. The orchestrator's traffic is outbound, and
an IPv6-only host can only reach hosts with an AAAA record. Queried through
Cloudflare's DNS-over-HTTPS on 2026-09-27: github.com, api.github.com,
codeload.github.com, objects.githubusercontent.com and
release-assets.githubusercontent.com have none, so the clone and the hcloud download fail. Of the data sources, the
hosts the carrier harvesters call were checked by the exact name in the code.
www.ryanair.com, which serves the main Ryanair fare and route endpoints in
harvest_all_origins.py, has an IPv6 address. services-api.ryanair.com
(harvest_ryanair_schedules.py), be.wizzair.com and wizzair.com
(harvest_wizzair.py), apiw.vueling.com and www.vueling.com
(harvest_vueling.py), and api.volotea.com and www.volotea.com
(harvest_volotea.py) have none; the Vueling and Volotea hosts are Akamai or
Imperva CNAMEs that answer IPv4 only. api.travelpayouts.com,
api.liteapi.travel, opensky-network.org, api.opentripmap.com and
www.kaggle.com have none either. So of the four carriers in the cheapest-wins
fare merge, only Ryanair's fares survive on IPv6-only. PyPI and files.pythonhosted.org,
nodejs.org, downloads.rclone.org, ports.ubuntu.com, mirror.hetzner.com,
api.hetzner.cloud, query.wikidata.org, commons.wikimedia.org, overpass-api.de,
download.geofabrik.de and generativelanguage.googleapis.com all have one. The
R2 S3 endpoint and api.cloudflare.com could not be resolved from here in the
time available and are unverified. So on IPv6-only the box can install most of
itself but cannot fetch the code, and loses three of the four carriers and the
Travelpayouts backfill. The code keeps the
default the task asked for, prints a warning on every IPv6-only run and
dry run, and the README explains it. Whether to flip the default is the
owner's call (T046-a); the recommendation is `IPV4=1`, about EUR 0.60 a month
per section 7.

Two more things the task did not anticipate. The repository keeps 71 harvest
caches under `app_data/` and `cache/` (about 613 MB at HEAD) in Git LFS, so a
clone without git-lfs would hand the pipeline pointer files; `git-lfs` is
installed and set up before the clone, and `verify.sh` fails on any file still
a pointer. And the laptop checks out with `core.autocrlf=true`, which would
have given the box a CRLF `carta-bootstrap` that bash cannot run;
`provision.sh` strips CR when it renders the user data, and
`infra/hetzner/.gitattributes` pins the YAML and env files to LF. A CRLF copy
was rendered in the test to prove it.

## Files touched

Infrastructure (commit 8651cf19d):

**Created:**
- infra/hetzner/README.md
- infra/hetzner/.gitattributes
- infra/hetzner/cax11/cloud-init.yaml
- infra/hetzner/cax11/provision.sh
- infra/hetzner/cax11/verify.sh
- infra/hetzner/cax11/weekly.sh
- infra/hetzner/cax11/load-env.sh
- infra/hetzner/cax11/env.example

Execution:

**Created:**
- Execution/P3/T046-cax11-orchestrator.md
- Execution/P3/_OPEN-hetzner.md

**Modified:**
- Execution/_OPEN.md (rows T046-a to T046-k)

**Deleted:**
- None.

Nothing outside `infra/hetzner/` and `Execution/` was touched. `requirements.txt`
is worked around at install time rather than edited, because it is outside the
task's scope (T046-i).

## Commands run

From the repo root in Git Bash. `$S` is the session scratchpad under
`C:\Users\GEBRUI~1\AppData\Local\Temp\claude\`; nothing was installed outside
it.

```
git checkout -b p3-cax11-orchestrator            # from p3-archive-to-r2, stacked

# pins, read from each publisher on 2026-09-27
curl -sL https://github.com/hetznercloud/cli/releases/download/v1.69.0/checksums.txt | grep linux-arm64
curl -s https://nodejs.org/dist/index.json       # newest LTS: v24.21.0
curl -s https://nodejs.org/dist/v24.21.0/SHASUMS256.txt | grep linux-arm64.tar.xz
curl -sL https://downloads.rclone.org/v1.75.1/SHA256SUMS | grep linux-arm64.zip

# which hosts the box must reach have an IPv6 address
curl -s -H 'accept: application/dns-json' "https://cloudflare-dns.com/dns-query?name=<host>&type=AAAA"
curl -s -o /dev/null -w '%{http_code}' https://api.github.com/repos/basvn123/carta-travel-app   # 200, public
git ls-remote --heads origin                     # main at 8b53babed, no p3 branches
git lfs ls-files -s                              # 71 files, about 613 MB

# arm64 wheels for CPython 3.12 (the box's Python), no install
grep -vE '^\s*anthropic' requirements.txt > $S/req-box.txt; echo 'pyyaml>=6.0' >> $S/req-box.txt
python -m pip install --dry-run --ignore-installed --report $S/arm64-report.json \
  --platform manylinux_2_39_aarch64 --platform manylinux_2_28_aarch64 --platform manylinux2014_aarch64 \
  --python-version 3.12 --implementation cp --abi cp312 --only-binary=:all: -r $S/req-box.txt

# cloud-init schema
python -m venv $S/ci-venv
$S/ci-venv/Scripts/python -m pip install "cloud-init @ https://github.com/canonical/cloud-init/archive/refs/tags/25.2.tar.gz"   # fails on Windows
curl -sL -o $S/ci.tar.gz https://github.com/canonical/cloud-init/archive/refs/tags/25.2.tar.gz   # schema JSON only
$S/ci-venv/Scripts/python -m pip install jsonschema pyyaml
$S/ci-venv/Scripts/python $S/ci_check.py infra/hetzner/cax11/cloud-init.yaml

# hcloud syntax, against a scratch copy of the Windows 1.69.0 binary
$S/hcloud/hcloud.exe server create --help        # and firewall add-rule, ssh-key create, server ip
HCLOUD_TOKEN=dummy $S/hcloud/hcloud.exe --endpoint http://127.0.0.1:9 <each printed command>

bash -n infra/hetzner/cax11/*.sh
env -u HCLOUD_TOKEN HOME=$S/fakehome bash infra/hetzner/cax11/provision.sh --dry-run
env -u HCLOUD_TOKEN bash infra/hetzner/cax11/provision.sh                 # refuses, exit 1
bash infra/hetzner/cax11/verify.sh 2001:db8::1                            # FAIL ssh, exit 1
HOME=$S/fakehome bash infra/hetzner/cax11/weekly.sh                       # one "cron fired" line
```

`ci_check.py` is a scratch script: it asserts the `#cloud-config` header, runs
`yaml.safe_load`, validates the result with a Draft 4 validator against
`cloudinit/config/schemas/schema-cloud-config-v1.json` from cloud-init 25.2
(the schema `cloud-init schema` itself uses), and extracts the embedded
`carta-bootstrap` so it can be put through `bash -n`.

## Config and secrets set

None. No Hetzner token, no Cloudflare credential and no R2 key exists in this
environment, and none was requested. The real run needs `HCLOUD_TOKEN` (Read &
Write, exported in the provisioning shell only) and then the box's own
`/home/carta/.config/carta/env`, mode 600, filled over SSH from the names in
`env.example`. The five `RCLONE_CONFIG_R2_*` values come from the R2 API token
of T045-a. The throwaway SSH key and the dummy token used in the tests live in
the scratchpad and were never sent anywhere.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Hetzner servers | 0 | 0 | none; nothing provisioned |
| Build host | laptop | laptop | unchanged until T048 |
| Build-host cash cost a month | EUR 0 | EUR 0 now; planned EUR 5.99, EUR 6.59 with IPV4=1 | none yet |
| Laptop uptime the schedule assumes | 730 h a month | 730 h a month | unchanged until T048 |
| cloud-init schema errors (25.2 schema) | no file | 0, raw and rendered | new |
| Pipeline Python packages with a Linux aarch64 cp312 wheel or pure Python | not checked for 3.12 | 70 of 70 (53 pure, 17 native) | new |
| Hosts the box must reach with no IPv6 address | unknown | 17 of the 31 checked (5 GitHub hostnames, 12 data hosts); 13 have one, 1 did not resolve | new |

Not measured, because they need the live box: boot-to-ready time, memory in
use when idle and during a harvest, disk used after the clone and the venv,
whether the timer fires, and the duration of a full pipeline run.

The dependency check reuses T006 and extends it rather than redoing it. T006
checked the 22 compiled packages installed on the laptop, for CPython 3.11, and
all passed. The box runs Ubuntu 24.04's CPython 3.12, so the resolver was asked
to satisfy `requirements.txt` (less anthropic, plus pyyaml) using only Linux
aarch64 wheels for 3.12. It resolved all 70 packages, direct and transitive:
17 native (lxml, pandas, scikit-learn, osmium, shapely, rasterio, pyogrio, h3,
PyYAML, psycopg-binary, charset-normalizer, numpy, pydantic-core, pyproj,
scipy, protobuf, rpds-py), every one manylinux_2_28 or older, which Ubuntu
24.04's glibc 2.39 satisfies, and 53 pure Python. torch and open_clip are not
in `requirements.txt`; they belong to the photo engine on the on-demand box and
T006 already cleared them.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `pip install cloud-init` into a scratch venv failed | cloud-init's setup.py calls `os.uname`, which Windows lacks; it is not installable here | Validated against cloud-init 25.2's own schema JSON with jsonschema. A negative test (two injected type errors) produced two schema errors, so the check is live |
| The rendered user data would have carried CRLF from a Windows checkout | `core.autocrlf=true`; the root `.gitattributes` pins only `*.sh` | `provision.sh` strips CR when rendering; `infra/hetzner/.gitattributes` pins YAML and env files to LF; a CRLF copy rendered to 0 CR bytes and still validated |
| A clone would have given the pipeline Git LFS pointer files | 71 caches are LFS objects and Ubuntu does not set up git-lfs | `git-lfs` package, `git lfs install --skip-repo` before the clone, and a pointer check in `verify.sh` |
| A heredoc edit wrote `tr -d ''` into `provision.sh` | Bash heredocs strip one level of backslash (a known gotcha in this repo) | Fixed with the Edit tool and re-checked with `bash -n` and the CRLF render |
| `verify.sh`'s remote block crashed on a host without MemAvailable | Arithmetic on an empty string under `set -u` | Defaults to 0 and reports a FAIL instead. Found by running the remote block on the laptop, which also showed every check failing cleanly on a non-box (18 FAIL, exit 1) |
| AUSTRIA_CLIENT_ID had been listed as a secret | It has a public default, `dbp-public-ui` | Removed from `env.example` |

shellcheck is not on PATH on this machine and was not run.

## What is still open

Everything that touches Hetzner belongs to the owner, and the ordered procedure
is `Execution/P3/_OPEN-hetzner.md`. The steps, each also a register row:

Decide IPv4 (T046-a). IPv6-only cannot reach GitHub or the fare APIs; the
recommendation is `IPV4=1`.

Make the code clonable (T046-b). Origin `main` is at the production baseline
and has no `infra/hetzner/`. Push this branch and set `CARTA_REPO_BRANCH`, or
merge the stack down and push `main`.

Create the Hetzner project and a Read & Write token, install hcloud on the
laptop and export `HCLOUD_TOKEN` (T046-c).

Run `provision.sh`, wait for cloud-init, and confirm
`/var/log/carta-bootstrap.log` ends with "finished, all steps ok" (T046-d).

Fill `/home/carta/.config/carta/env` on the box (T046-e); the R2 lines wait on
T045-a.

Run `verify.sh` and get "ALL CHECKS PASSED", including the "cron fired" line
(T046-f). That closes the first two parts of the done condition.

The first full pipeline run on the box (T046-g) is T048's. The placeholder job
does not run the pipeline, so "one full pipeline run has completed on it"
cannot be met before T048 ports the cadence.

Four items for a next task. The version drift (T046-h): `requirements.txt` has
floor pins only, so the box resolves pandas 3.0.6, numpy 2.5.3 and
scikit-learn 1.9.1 while the laptop runs pandas 2.2.3, numpy 1.26.4 and
scikit-learn 1.6.1. pandas 3 changes defaults the harvesters may depend on;
pin the laptop's versions in a constraints file before T048's first real run.
The requirements file itself (T046-i): it still lists `anthropic` and omits
`pyyaml`; the bootstrap works around both, and the file should be fixed at the
source together with T041-g. Git LFS bandwidth (T046-j): every fresh clone
pulls about 613 MB of LFS objects from GitHub, which counts against the
account's LFS bandwidth quota; T048 should decide whether the box skips the
LFS smudge and pulls those caches from R2 instead, as T045's `push.py --pull`
already can for the master. The reboot and boot-run policy (T046-k): security
updates install daily but the box never reboots itself, so a kernel update
waits until someone reboots it, and the timer's ten-minute boot run will start
a real pipeline run after every reboot once T048 lands; T048 should choose a
reboot window and decide whether `OnBootSec` stays.

Hetzner's prices were taken from the architecture document (EUR 5.99 for the
CAX11, about EUR 0.60 for an IPv4) and were not checked against a live
account; `hcloud server-type describe cax11` in step 3 of the procedure shows
the real figure.

## Rollback procedure

Nothing was created on any live system, so today there is nothing to roll back
there. Once the owner has provisioned, the box and everything `provision.sh`
made are removed with, in this order:

```
hcloud server delete carta-orchestrator
hcloud firewall delete carta-orchestrator-ssh
hcloud ssh-key delete carta-orchestrator
```

The server holds no state that is not in git or pushed to R2, so the delete is
safe, and billing stops with it. If a primary IPv4 was created with the server
it is deleted along with it unless it was protected. The local key pair
`~/.ssh/carta_orchestrator_ed25519` can be deleted by hand.

In the repository, revert the two commits of this branch, newest first, or
drop the branch before it is merged:

```
git revert <report commit> 8651cf19d
# or, unmerged:
git checkout p3-archive-to-r2 && git branch -D p3-cax11-orchestrator
```

Reverting the report commit restores `Execution/_OPEN.md` as well. Nothing
else in the repository references `infra/hetzner/`.
