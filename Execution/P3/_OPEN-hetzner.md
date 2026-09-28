# Open items for the Hetzner build boxes: what the owner must do, in order

Written 2026-09-27 at the close of T046. This gathers the owner steps for the
always-on orchestrator into one ordered list, because the order across them
matters and the report only argues each one. The report
(`Execution/P3/T046-cax11-orchestrator.md`) is the record; where this file and a
report disagree, the report wins and this file is stale. T047 (the on-demand
CAX41) and T048 (porting the pipeline schedule) append their own sections
below, numbered on from the last step here.

Nothing below has been done from a session. There is no Hetzner account access,
no hcloud CLI and no HCLOUD_TOKEN on the laptop, and no Cloudflare or R2
credentials either. The code is on branch `p3-cax11-orchestrator` under
`infra/hetzner/`.

The R2 steps that come first in the register (T044-a to T044-c, T045-a to
T045-e) are not prerequisites for bringing the box up. They are prerequisites
for the box being useful: until the bucket and the rclone credentials exist,
the R2 lines of the secrets file in step 6 stay blank, and nothing the box
does can publish.

## 1. Decide IPv4 (T046-a, order 30)

`provision.sh` creates the server without a public IPv4 unless `IPV4=1` is set.
On 2026-09-27 github.com and the GitHub release downloads had no IPv6
address. An IPv6-only box therefore cannot clone the repository or download
hcloud. The Ryanair fare endpoint on www.ryanair.com, the one fare source the
pipeline uses, does answer on IPv6. The
recommendation is `IPV4=1`, at about EUR 0.60 a month on top of EUR 5.99. If
you keep IPv6-only, the clone and the hcloud install fail in step 5 and the
reason is in `/var/log/carta-bootstrap.log`. Your laptop also needs working
IPv6 to SSH to an IPv6-only box (`curl -6 https://ifconfig.co` answers if it
does).

## 2. Put the code where the box can clone it (T046-b, order 31)

The box clones `https://github.com/basvn123/carta-travel-app.git` (public) at
the branch named by `CARTA_REPO_BRANCH`, default `main`. On 2026-09-27 origin
`main` was still at the production baseline `8b53babed` and has no
`infra/hetzner/`, so the timer would have no script to run. Either merge the
stacked branches down to `main` and push, or push `p3-cax11-orchestrator` and
set `CARTA_REPO_BRANCH=p3-cax11-orchestrator` in step 4. The P2 merge row
(P2-merge, order 5) comes first if you merge.

## 3. Hetzner project and token (T046-c, order 32)

In the Hetzner Cloud Console create a project named Carta. Under Security, API
tokens, generate a token with Read & Write permission; it is shown once. On the
laptop, install the hcloud CLI (release page:
https://github.com/hetznercloud/cli/releases; the code was checked against
1.69.0) and export the token in the shell that runs step 4 only:

```
export HCLOUD_TOKEN=<token>
hcloud server-type describe cax11      # proves the token and shows the price
```

Never write the token into a file in the repository. T047 will want a second,
separate token on the box itself; do not reuse this one there.

## 4. Provision (T046-d, order 33)

From the repo root in Git Bash:

```
bash infra/hetzner/cax11/provision.sh --dry-run
IPV4=1 CARTA_REPO_BRANCH=<branch from step 2> bash infra/hetzner/cax11/provision.sh
```

Drop `IPV4=1` only if step 1 decided so. `CARTA_LOCATION=nbg1` picks Nuremberg
instead of Falkenstein. The script creates `~/.ssh/carta_orchestrator_ed25519`
if it is absent, uploads the public half, creates the firewall and the server,
and prints the addresses and the next commands. Re-running it is safe.

## 5. Wait for first boot (T046-d, order 33)

About five to ten minutes. Then:

```
ssh -i ~/.ssh/carta_orchestrator_ed25519 carta@<address> 'cloud-init status --wait; tail -n 30 /var/log/carta-bootstrap.log'
```

The log must end with "finished, all steps ok". If a step failed, fix its
cause and run `sudo carta-bootstrap` on the box; it only redoes what is
missing.

## 6. Fill the secrets file (T046-e, order 34)

```
ssh -i ~/.ssh/carta_orchestrator_ed25519 carta@<address>
nano ~/.config/carta/env
```

The file is a copy of `infra/hetzner/cax11/env.example`, mode 600. Copy the
values that exist in the laptop's repo-root `.env`. The five
`RCLONE_CONFIG_R2_*` lines come from the R2 API token of T045-a; leave them
blank until that token exists. `HCLOUD_TOKEN` stays blank until T047. Blank
lines are fine: a blank value means "not configured" and the collector skips.

## 7. Verify (T046-f, order 35)

At least ten minutes after the last boot, from the laptop:

```
bash infra/hetzner/cax11/verify.sh <address>
```

It must print "ALL CHECKS PASSED", including the line "placeholder job fired N
time(s)". That line is the proof that the timer fires: it fires ten minutes
after each boot and every Monday at 09:00 Brussels time. Keep the output for
the task that closes these rows.

## 8. The first real pipeline run (T046-g, order 36, next task)

Not an owner step. T048 replaces the placeholder with the ported
`run_pipeline.bat` and makes the first full run on the box. T046's done
condition ("one full pipeline run has completed on it") closes only then.

## Summary of the order

| Order | Row | Where | What |
|---|---|---|---|
| 30 | T046-a | Decision | IPv4 on (recommended) or IPv6-only |
| 31 | T046-b | GitHub | Push a branch that contains infra/hetzner/ |
| 32 | T046-c | Hetzner Console, laptop | Project, Read & Write token, hcloud CLI |
| 33 | T046-d | Laptop, box | provision.sh, then cloud-init and carta-bootstrap finish clean |
| 34 | T046-e | Box | Fill ~/.config/carta/env |
| 35 | T046-f | Laptop | verify.sh prints ALL CHECKS PASSED |
| 36 | T046-g | T048 | First full pipeline run on the box |

# T048: moving the weekly schedule onto the box

Appended 2026-09-27 at the close of T048
(`Execution/P3/T048-pipeline-cron-migration.md`). The code is on branch
`p3-pipeline-cron-migration`, stacked on `p3-cax11-orchestrator`, so it
carries everything T046 wrote as well. Nothing below has been done: there is no
box yet. Steps 1 to 7 come first, with one change to step 2: push
`p3-pipeline-cron-migration` and provision from it
(`CARTA_REPO_BRANCH=p3-pipeline-cron-migration`), so the box has the T048
scripts from its first boot. That is safe. The T046 units cloud-init installs
still fire the weekly job ten minutes after boot, but `weekly.sh` now only
writes its "cron fired" line until step 13 sets `CARTA_PIPELINE_ENABLED`, so
step 7 still passes and nothing is harvested early.

If the box was already provisioned from the older branch, fetch this one into
the shallow clone:

```
git -C ~/carta fetch --depth 1 origin p3-pipeline-cron-migration
git -C ~/carta checkout -B p3-pipeline-cron-migration FETCH_HEAD
```

The Windows Scheduled Task TravelAppFareRefresh stays the live schedule through
every step until step 15. Do not run a real step on the box while a laptop run
is in progress: the two machines would each write their own master.

## 9. Prepare the box (T048-a, order 37)

```
ssh -i ~/.ssh/carta_orchestrator_ed25519 carta@<address>
sudo apt-get install -y time          # GNU time, for peak memory; verify_tasks.sh needs it
bash ~/carta/infra/hetzner/cax11/run_pipeline.sh --pull-only
```

`--pull-only` re-syncs the venv to the laptop's pinned versions in
`constraints.txt` (carta-bootstrap installed the newest releases: pandas 3
against the laptop's 2.2.3) and, if the R2 lines of the secrets file are
filled and T045-c has pushed them, pulls the master `app_data/app_data.json`
and the fare history (`data/history`, `data/models`). Both are gitignored, so
the clone has neither. Without R2, copy them from the laptop instead, from the
repo root in Git Bash:

```
scp -i ~/.ssh/carta_orchestrator_ed25519 app_data/app_data.json carta@<address>:carta/app_data/
tar -czf - data/history data/models | ssh -i ~/.ssh/carta_orchestrator_ed25519 carta@<address> 'tar -xzf - -C ~/carta'
```

Then run `--pull-only` again; it must end without the "no
app_data/app_data.json" warning.

## 10. Verify the weekly tasks one at a time (T048-b, order 38)

```
bash ~/carta/infra/hetzner/cax11/verify_tasks.sh --next      # prints the next step
bash ~/carta/infra/hetzner/cax11/verify_tasks.sh <step>
bash ~/carta/infra/hetzner/cax11/verify_tasks.sh --status
```

Twelve steps, in the order of `infra/hetzner/cax11/weekly_tasks.txt`, which
gives the reason for each position: tp_stage, fare_history, country_context,
fare_model, image_audit, volotea_fares, vueling_fares, ingestion,
fares_targeted (`fares --max-origins 5`), wizz_fares, fares, ship. Each runs a
dry run and then the real run, and passes only when both exit 0 and the task's
`last_success` moved. The harness refuses a step until the one before it has
passed. Run the long ones (wizz_fares about 5 hours, fares about a day) behind
nohup or in tmux:

```
nohup bash ~/carta/infra/hetzner/cax11/verify_tasks.sh fares > ~/verify_fares.out 2>&1 &
```

If a step fails, stop there. Its record is
`~/carta/logs/arm64_verify/<step>.json` and its full output `<step>.log`; the
fix is a new task, not an edit on the box. Keep the whole `logs/arm64_verify`
directory for the task that closes this row.

## 11. The first full weekly run (T048-c, order 39)

After step 10 every weekly task has just succeeded, so none is due and a plain
run would do nothing. Force the whole weekly tier, in the pipeline's own order,
through the same path the timer will use (one line):

```
CARTA_PIPELINE_ENABLED=1 nohup bash ~/carta/infra/hetzner/cax11/weekly.sh -- --only tp_stage,fares,wizz_fares,vueling_fares,volotea_fares,fare_history,fare_model,ingestion,country_context,image_audit > ~/first_run.out 2>&1 &
```

About 30 hours on the laptop. It must end with exit 0 in `~/logs/weekly.log`
(exit 3 means the pipeline was fine and an R2 step failed). This closes T046-g
as well.

## 12. Compare the wire with a laptop build (T048-d, order 40)

On the box, after step 11:

```
~/venv/bin/python ~/carta/infra/hetzner/cax11/compare_wire.py summarize ~/carta/continent-app/dist -o ~/box_wire.json
```

On the laptop, from the repo root, build and summarise, then compare:

```
(cd continent-app && npm run build)
python infra/hetzner/cax11/compare_wire.py summarize continent-app/dist -o laptop_wire.json
scp -i ~/.ssh/carta_orchestrator_ed25519 carta@<address>:box_wire.json .
python infra/hetzner/cax11/compare_wire.py compare laptop_wire.json box_wire.json
```

It must print SAME SHAPE. A file-set difference under `fares/` can be real (an
origin priced on one machine and not the other that week); read which origin
and why before accepting it. Any key, type or schema-version difference is a
port bug.

## 13. Install the schedule on the box (T048-e, order 41)

```
sudo bash ~/carta/infra/hetzner/cron/install.sh --dry-run
sudo bash ~/carta/infra/hetzner/cron/install.sh
```

Replaces T046's placeholder units with the real ones (Monday 09:00 Brussels,
48 hour timeout, no boot-time run), adds the Sunday 04:00 reboot window and the
logrotate rule, and prints the next firing. Do step 15 the same day, or both
machines harvest on Monday.

## 14. Decide how the box's output reaches production (T048-j, order 42)

The box builds `continent-app/dist` and rewrites tracked files under
`continent-app/public/`, but nothing commits, pushes or deploys them; on the
laptop that was a hand step. Choose before step 15: commit and push from the
box with a deploy key, or publish the data to R2 (T054). Until one exists,
disabling the laptop task means production fares stop moving.

## 15. Disable the Windows task (T048-f, order 43)

Only after step 12 printed SAME SHAPE and step 14 is decided. On the laptop:

```
schtasks /Change /TN TravelAppFareRefresh /DISABLE
schtasks /Query /TN TravelAppFareRefresh /V /FO LIST | findstr /C:"Scheduled Task State"
```

From then on the box's master is the newest one. Before running any master
writer on the laptop again, pull it first:
`python pipeline/archive/push.py --pull --only master-current`.

To go back: `schtasks /Change /TN TravelAppFareRefresh /ENABLE` on the laptop
and `sudo bash ~/carta/infra/hetzner/cron/install.sh --disable` on the box.

## 16. Weekly database dumps from the box (T048-g, after T045-d)

`run_pipeline.sh` dumps Supabase on every run once three things exist on the
box: a pg_dump of version 17 or newer (Ubuntu 24.04 ships 16, which refuses a
Postgres 17 server), the backup public key, and two lines in the secrets file.

```
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt-get update && sudo apt-get install -y postgresql-client-17
gpg --import carta-backups.pub.asc        # the public half from T045-d, copied over with scp
nano ~/.config/carta/env                  # SUPABASE_DB_URL and CARTA_BACKUP_KEY
```

The trailslab dump stays on the laptop: the lab is not on the box, and the
script skips it unless `TRAILSLAB_HOST` resolves and answers.

## Summary of the order, continued

| Order | Row | Where | What |
|---|---|---|---|
| 37 | T048-a | Box | GNU time; run_pipeline.sh --pull-only; master and fare history present |
| 38 | T048-b | Box | verify_tasks.sh, twelve steps in weekly_tasks.txt order, all passed |
| 39 | T048-c | Box | First full weekly run through weekly.sh, exit 0 (closes T046-g) |
| 40 | T048-d | Box, laptop | compare_wire.py prints SAME SHAPE |
| 41 | T048-e | Box | cron/install.sh: real timer, reboot window, logrotate |
| 42 | T048-j | Decision | How the box's output reaches production |
| 43 | T048-f | Laptop | Disable TravelAppFareRefresh, the same day as 41 |
| - | T048-g | Box | pg_dump 17, backup key, SUPABASE_DB_URL: weekly dumps |

## 17. Set up the on-demand worker on the orchestrator (T047-a, order 44)

Appended at the close of T047. The code is `infra/hetzner/cax41/` and
`infra/hetzner/jobs/` on branch `p3-on-demand-cax41`; the report is
`Execution/P3/T047-on-demand-cax41.md`. Everything here runs on the CAX11 as
`carta`, after steps 7 and 9, with the R2 lines of the secrets file filled
(T045-a). The worker clones the branch the orchestrator itself was
provisioned from (`CARTA_REPO_BRANCH` in `/etc/carta/bootstrap.conf`), so that
branch must be pushed and must contain `infra/hetzner/cax41/`.

Create a second Hetzner API token, Read & Write, named for the orchestrator,
and put it in `~/.config/carta/env` as `HCLOUD_TOKEN`. Optionally (T047-f)
create a separate R2 token for workers and add `CARTA_WORKER_R2_ACCESS_KEY_ID`
and `CARTA_WORKER_R2_SECRET_ACCESS_KEY`, so the credentials a worker carries
can be revoked without touching the orchestrator's. Then:

```
cd ~/carta && git pull
bash infra/hetzner/cax41/verify.sh                 # ends "0 failed"
bash infra/hetzner/cax41/spawn.sh --list
bash infra/hetzner/cax41/spawn.sh --dry-run selftest
sudo install -m 0644 infra/hetzner/cax41/carta-worker-sweep.service infra/hetzner/cax41/carta-worker-sweep.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now carta-worker-sweep.timer
systemctl list-timers carta-worker-sweep.timer     # next run at :17
```

## 18. The first real spawn: selftest (T047-b, order 45)

The cheapest job: it boots, clones, writes a report of the box to R2 and
powers off. About ten minutes of a CAX41, EUR 0.06 if Hetzner bills the started
hour. In one terminal:

```
bash infra/hetzner/cax41/spawn.sh selftest
```

and in a second, while it runs, watch the worker appear and then disappear:

```
watch -n 30 'hcloud server list --selector role=worker'
```

It passes when spawn.sh ends with "outcome ok, exit 0", the list is empty
again, `rclone cat r2:carta/archive/built/selftest/selftest.txt` shows
aarch64, 16 cores and about 31 GB, and `bash infra/hetzner/cax41/spawn.sh
--cost` shows one run. Write the wall hours and both cost figures from the
ledger line (`tail -n 1 ~/carta/logs/cax41_runs.tsv`) into the register row
when closing it. If it fails, the run's logs are in
`~/carta/logs/cax41/<run id>/` and the status object names the phase.

## 19. Prove the delete on an interrupted run (T047-c, order 46)

Start `bash infra/hetzner/cax41/spawn.sh selftest` again and press Ctrl-C
after the "+ hcloud server create" line has printed and the first "worker:"
line has appeared. spawn.sh must print "deleting carta-worker-selftest-..."
and `hcloud server list --selector role=worker` must be empty a minute later.
This is the live twin of the failure-path checks in verify.sh.

## 20. The first real heavy job (T047-d, order 47)

This is T047's done condition. Valhalla for one country is the heavy job
that is ready: its inputs are T045's Geofabrik extracts in R2 (T045-c must
have pushed `archive/inputs/geofabrik/`), and its output lands in
`archive/built/valhalla/<country>/`.

```
bash infra/hetzner/cax41/spawn.sh valhalla_tiles switzerland
```

It passes when the run ends ok, the worker is gone, and
`rclone ls r2:carta/archive/built/valhalla/switzerland/` lists
`valhalla_tiles.tar`, `valhalla.json` and `SOURCE.txt`. Record the wall
hours and the cost from the ledger. SOURCE.txt names the image digest the
build used; pin that digest as `VALHALLA_IMAGE` in `jobs/valhalla_tiles.sh`
(T047-j). A clip_sweep is the other real heavy job, but not first: see
T047-g.

## 21. Reconcile the cost with the invoice (T047-e, order 48)

After the month of these runs closes, read the CAX41 lines on the Hetzner
invoice and compare them with that month's ledger total,
`python3 infra/hetzner/cax41/cost.py mtd --month YYYY-MM`. The ledger carries two figures per run, at wall-clock hours and at
whole started hours; the invoice says which one Hetzner bills, and cost.py's
docstring should then say so. Enter the invoice amount in T043's ledger as
the `hetzner_cax41` line with source `actual`:

```
select public.admin_set_infra_cost('YYYY-MM-01', 'hetzner_cax41', <cents>, 'actual', 'Hetzner invoice');
```

## Summary of the order, continued (T047)

| Order | Row | Where | What |
|---|---|---|---|
| 44 | T047-a | Box | HCLOUD_TOKEN, verify.sh, dry run, sweep timer installed |
| - | T047-f | Cloudflare, box | Optional: a separate R2 token for workers, before 45 |
| 45 | T047-b | Box | spawn.sh selftest: ok, deleted, cost recorded |
| 46 | T047-c | Box | Ctrl-C a live selftest; the worker is deleted |
| 47 | T047-d | Box | spawn.sh valhalla_tiles switzerland: T047's done condition |
| 48 | T047-e | Invoice, admin panel | Wall or started hours; hetzner_cax41 entered as actual |

## 22. Put what the image ladder reads in place (T049-a, order 49)

The image_transcode job (T049) reads one thing from R2 and writes to two
prefixes, so it needs the bucket, the domain and the layer cache first. Check,
in this order, that each is done: the bucket `carta` and the custom domain
`cdn.carta-europetravel.com` exist and `node continent-app/scripts/r2/verify.mjs`
passes (T044-a to T044-c, with T045-f fixed first); the orchestrator's secrets
file carries the `RCLONE_CONFIG_R2_*` lines (T045-a); the worker round trip has
been proven with `spawn.sh selftest` (T047-a, T047-b). Then push the beaches
cache from the machine that owns it, with no `cache/beaches/.rescore_hold` on
it (there is none on the laptop today):

```
python pipeline/archive/pack.py --only beaches-cache --out <dir with 1 GB free>
python pipeline/archive/push.py --only beaches-cache --out <the same dir>
rclone ls r2:carta/archive/caches/beaches-cache.tar.gz
```

The worker clones the branch named by `CARTA_REPO_BRANCH`, so the branch that
carries `pipeline/photos/derive.py` (p3-image-derivative-ladder, or main once
the stack is merged) must be pushed (T046-b).

## 23. Dry run on the orchestrator (T049-b, order 50)

```
bash infra/hetzner/cax41/verify.sh
bash infra/hetzner/cax41/spawn.sh --dry-run image_transcode beaches
```

verify.sh must end with 0 failed; the dry run must print the create, the
wait, the promote to `archive/built/derive`, the delete and the sweep.

## 24. The first real beaches run (T049-c, order 51)

```
bash infra/hetzner/cax41/spawn.sh image_transcode beaches
```

It passes when the run ends "outcome ok" (a run that used its whole time
budget still ends ok: it writes the manifest for what exists and says how many
sources are left). Then check what the CDN serves, taking a key from the
manifest:

```
rclone copyto r2:carta/img/manifest/beaches.json /tmp/beaches.json
python3 -c "import json;m=json.load(open('/tmp/beaches.json'));f=next(iter(m['files'].values()));h=f['h'];print(m['count'],'files');print(f'https://cdn.carta-europetravel.com/img/{h[:2]}/{h[2:4]}/{h}/640.avif')"
curl -sI <that URL> | grep -iE '^(HTTP|cache-control|content-type)'
```

Expect HTTP 200, `cache-control: public, max-age=31536000, immutable` and
`content-type: image/avif`; the same with `320.webp` gives `image/webp`. The
run report is in `archive/built/derive/report/`; write its `derived`,
`dead_n`, `failed_n`, `left` and `elapsed_s` into the register row, and the
cost from `tail -n 1 ~/carta/logs/cax41_runs.tsv`.

## 25. Repeat until beaches is complete (T049-d, order 52)

Measured on the laptop, one source takes about 5 s of wall clock at the
harvest's politeness, so one 8 h run derives roughly 4,700 of the 37,858
gated beach sources. Run step 24 again until a run reports `left` 0 (only
dead files remain). Each run is about EUR 0.45 and skips everything already
held. If the CAX41's link to Wikimedia is faster than the laptop's, fewer
runs are needed; the first report's `ms_each.fetch` says so. When a run ends
with nothing left, T049's done condition is met: beaches fully derived and
served from cdn.carta-europetravel.com. Only then start lakes and mountains
(`spawn.sh image_transcode lakes`, then mountains).

## 26. Optional: a Cache Rule under img/ (T049-e)

Every object derive.py writes carries its own Cache-Control, and the manifest
carries `public, max-age=300`. The Cache Rule `provision.sh` already recommends
(hostname eq cdn.carta-europetravel.com and path starts with /img/, respect
origin headers, edge TTL floor) is insurance against a future upload path that
forgets the header. Add it in the Cloudflare dashboard, Caching, Cache Rules.

## Summary of the order, continued (T049)

| Order | Row | Where | What |
|---|---|---|---|
| 49 | T049-a | Cloudflare, laptop, box | Bucket, domain, rclone lines, selftest proven; beaches cache pushed; branch pushed |
| 50 | T049-b | Box | verify.sh 0 failed; spawn.sh --dry-run image_transcode beaches |
| 51 | T049-c | Box | First real run: ok, headers checked with curl, report and cost recorded |
| 52 | T049-d | Box | Repeat until left is 0: T049's done condition; then lakes, mountains |
| - | T049-e | Cloudflare | Optional Cache Rule under /img/ |

## 27. Prove a real takedown reaches R2 and the edge (T050-a, order 53)

T050 wrote the code (`pipeline/photos/takedown.py`, `add` now calls R2, the
Cloudflare edge purge and the manifest rewrite after the wire scrub) and
proved it in dry-run form and against throwaway local manifests, because no
R2, rclone or Cloudflare credential exists on this laptop. The first real
takedown is the owner's to run, once T049-a to T049-d have put a real
credential and at least one derived layer in place:

1. Set `RCLONE_CONFIG_R2_*` (already on the box from T045-a; on a laptop,
   export the same four variables), `CLOUDFLARE_API_TOKEN` (a token scoped to
   Zone > Cache Purge for carta-europetravel.com) and `CLOUDFLARE_ZONE_ID`
   (Cloudflare dashboard, the zone's Overview page, right rail).
2. Pick a title already derived and served (one `derive.py plan` or a
   manifest listed it). Do NOT use a title anyone still wants published;
   this is a real, permanent takedown.
3. `python pipeline/photos/takedown.py add "<title>" --dry-run` first, read
   every printed command.
4. `python pipeline/photos/takedown.py add "<title>" --reason "T050-a proof"`.
   Confirm the command prints `r2: ok`, `edge: ok` and `manifest[<layer>]: ok`
   for every layer that carried the title, and exits 0.
5. `curl -I` all five `cdn_url()`s (`derive.py key "<title>"` prints them) and
   confirm each is 404 or otherwise no longer the old bytes, not a cached 200.
6. `rclone cat r2:carta/img/manifest/<layer>.json` and confirm the title is
   gone from `files` and `inputs_hash` changed.
7. Record the outcome in a follow-up report; close this row.

## Summary of the order, continued (T050)

| Order | Row | Where | What |
|---|---|---|---|
| 53 | T050-a | Cloudflare, box or laptop with credentials | First real takedown: R2 delete, edge purge and manifest rewrite all confirmed live |

## 28. Prove the credit travels with the live copy (T051-a, order 54)

T051 proved offline that no image enters the derive manifest without the
credit `credit.owes_credit` demands, and that the app turns a CDN URL plus
the manifest into author, licence and page
(`pipeline/photos/verify_attribution_cdn.py`). What it could not do is read
the manifest back from R2 or fetch a single object from
cdn.carta-europetravel.com, because no credential exists on the laptop and
the domain does not resolve yet. Run this once the first real beaches run
(step 24, T049-c) has finished:

1. From the repo root, on the box or a laptop with `RCLONE_CONFIG_R2_*`
   exported: `rclone cat r2:carta/img/manifest/beaches.json > beaches-live.json`.
2. `python pipeline/photos/verify_attribution_cdn.py --manifest beaches-live.json --head 5`.
   It needs node on PATH (the app's resolver runs in it). It must exit 0: every
   entry of the live manifest carries a complete credit, every CC BY-SA entry
   resolves in the app to the right author, licence and page, and the five
   CDN URLs of the first five CC BY-SA entries answer 200 with
   `image/avif` or `image/webp` and an immutable Cache-Control.
3. Open one of those 640.avif URLs in a browser, then its manifest entry's
   Commons or Geograph page, and confirm by eye that the photograph is the
   one the page names.
4. Record the printed `measurements:` line in a follow-up report; close this row.

## Summary of the order, continued (T051)

| Order | Row | Where | What |
|---|---|---|---|
| 54 | T051-a | Box or laptop with credentials | Live manifest read back from R2 passes verify_attribution_cdn.py --manifest --head 5 |

## 29. Turn the picture flag on and measure LCP in production (T052-a, order 56)

T052 switched the beach, lake and mountain pages to `<picture>` with AVIF and
WebP sources from the image ladder, behind a per-layer flag that is off in
every build today. It measured the gain against a local static server
standing in for cdn.carta-europetravel.com, because the domain does not
resolve and there is no R2 credential on the laptop. The production number
is this step. Run it after step 24 (T049-c) has put real beaches objects in
R2, and after the CDN host is in the CSP img-src in `continent-app/vercel.json`
(row T052-b, the T053 CSP task). Without that line every CDN photograph is
blocked in production, so the flag must stay off until it lands.

1. Read the live manifest back:
   `rclone copyto r2:carta/img/manifest/beaches.json cache/img_manifest/beaches.json`
   (any local path works; the file is about 180 bytes per derived source).
2. From the repo root:
   `python pipeline/beaches/export_beaches.py --img-manifest cache/img_manifest/beaches.json`.
   It must print `[beaches] image ladder joined into N of M image records`
   with N above zero. Heroes get no placeholder on this path unless a local
   img/ tree is passed with `--img-root`, or derive.py writes `p` into the
   manifest (row T052-c). A hero without one shows the plain panel ground,
   exactly as today.
3. Commit the rewritten `continent-app/public/beaches/*.json` in the app repo,
   push, and let Vercel build a Preview. Leave `VITE_PICTURE_LAYERS` unset:
   the Preview then serves the old markup by default and the new one with
   `?pic=beaches`.
4. On the Preview, measure one beach page whose hero is derived, five times
   each way, cold cache, with Lighthouse's mobile preset:
   `npx lighthouse "<preview>/?pic=off#beach=<id>&bc=<CC>" --only-categories=performance --output=json --output-path=off-1.json`
   and the same with `?pic=beaches`. Record the median largest contentful
   paint of each set, the hero's transfer size and CLS in a follow-up report.
   Look at the page as well: the hero must be a `<picture>` whose currentSrc
   is on cdn.carta-europetravel.com, and the credit line under it must name
   the same author as before.
5. If the median improved and nothing broke, set `VITE_PICTURE_LAYERS=beaches`
   in the Vercel Production environment, redeploy and promote (a push only
   makes a Preview). Lakes and mountains follow the same steps after their
   own derive runs, each added to the comma list.
6. To roll one layer back, remove it from `VITE_PICTURE_LAYERS` and redeploy.
   The wire fields can stay: with the flag off the app ignores them.

## Summary of the order, continued (T052)

| Order | Row | Where | What |
|---|---|---|---|
| 55 | T052-b | Next task (T053) | cdn.carta-europetravel.com in the CSP img-src before any layer's flag goes on in production |
| 56 | T052-a | Laptop with credentials, Vercel | Live manifest joined into the beaches wire, Preview measured ?pic=off against ?pic=beaches, then the flag on in Production |

## 30. Let the app's origins read the data host (T054-a, order 58)

The app fetches its shards from another origin once the data host is on, so
the bucket needs a CORS rule or the browser discards every response. The rule
is `continent-app/scripts/r2/data-cors.json`: GET and HEAD from the www and
apex production origins, `carta-app.pages.dev` and the two local Vite ports.
Needs the bucket (T044-a). From `continent-app/`, with `CLOUDFLARE_API_TOKEN`
and `CLOUDFLARE_ACCOUNT_ID` exported:

1. `node scripts/r2/push-data.mjs --cors` prints the two wrangler commands.
2. `node scripts/r2/push-data.mjs --cors --live` runs them. The listing it
   ends with must show the five origins and methods GET, HEAD.

Vercel and Pages preview URLs are not in the list. A preview built with
`VITE_DATA_BASE` set will fail CORS; test previews without it, or add the one
preview origin you need.

## 31. Stage and upload the data tree (T054-b, order 59)

Needs step 30, the data domain (T044-b, T044-c) and the rclone variables
(T045-a). From `continent-app/`:

1. `VITE_DATA_BASE=https://data.carta-europetravel.com/data CARTA_SKIP_CSP_CHECK=1 npm run build`
   The build ends with `[stage-data] moved 17 entries ...` and leaves the
   upload tree in `dist-data/`. The CSP skip is right here and only here:
   this build is for the upload, not for a deploy.
2. `node scripts/r2/push-data.mjs --rclone-dry-run`, read what rclone says
   it would copy (about 52,000 objects, 1.1 GB the first time).
3. `node scripts/r2/push-data.mjs --live`. Phase 1 only: it adds and
   replaces objects and deletes nothing.
4. `node scripts/r2/verify-data.mjs` must end `PASS`. Then once
   `node scripts/r2/verify-data.mjs --all`, which checks every object byte
   for byte, its Cache-Control and its CORS header.

## 32. Put the data host in connect-src (T053-b, order 60)

Only after step 31's verify passes, so the CSP never names a host that serves
nothing. Add `https://data.carta-europetravel.com` to connect-src in both
`continent-app/vercel.json` and `continent-app/public/_headers`. This is a
one-line edit in each file and belongs to a small next task. Until it lands,
`scripts/r2/stage-data.mjs` refuses every split build that is not marked
with `CARTA_SKIP_CSP_CHECK=1`, so the order cannot be skipped by accident.

## 33. Cut the app over to the data host (T054-c, order 61)

1. Set `VITE_DATA_BASE=https://data.carta-europetravel.com/data` in the
   Production environment of whichever host serves the app (Vercel today,
   Pages after T024), with no `CARTA_SKIP_CSP_CHECK`.
2. Rebuild from the same master that step 31 uploaded. The build must print
   the stage line; a refusal means the CSP (step 32) or the variable is wrong.
3. Deploy and, on Vercel, promote (a push only makes a Preview). Load the
   map, a destination page (`#dest=BRU`) and a trail link, and confirm in the
   network panel that `dest/`, `poi/`, `dossier/` and `trails/` come from
   data.carta-europetravel.com with status 200 and there is no CORS error.
4. Only then run `node scripts/r2/push-data.mjs --live --prune`, which deletes
   the objects the new build no longer has.
5. Every weekly refresh after this repeats step 31.1 to 31.3, then the
   deploy, then 33.4. Upload first, deploy second, prune last.

Rollback: remove `VITE_DATA_BASE` from the environment and redeploy. The build
then keeps every data file in dist/ and fetches it same-origin, exactly as
before T054. The R2 objects can stay; nothing reads them.

## 34. The Pages move becomes possible (T024, order 62)

With step 33 live, `npm run check:pages` passes on the split dist (61 files
against the 20,000 ceiling, measured in T054). T024's cut-over runbook can
then run as written.

## Summary of the order, continued (T054)

| Order | Row | Where | What |
|---|---|---|---|
| 58 | T054-a | Laptop with Cloudflare credentials | CORS rule on the bucket for the app's origins |
| 59 | T054-b | Laptop or box with rclone credentials | Split build, phase 1 upload, verify-data PASS and --all |
| 60 | T053-b | Next task | data.carta-europetravel.com into connect-src in vercel.json and _headers |
| 61 | T054-c | Host environment | VITE_DATA_BASE in Production, deploy, check, then prune |
| 62 | T024 | Cloudflare account | Pages cut-over per T024's runbook |
