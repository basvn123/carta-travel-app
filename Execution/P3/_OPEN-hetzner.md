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
address, and neither did the API hosts of Wizz Air, Vueling and Volotea (the
Ryanair fare endpoint on www.ryanair.com does). An IPv6-only box cannot clone
the repository, and its fare harvest would keep only Ryanair. The
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
