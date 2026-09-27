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
address, and neither did the API hosts of Wizz Air, Vueling, Volotea, Ryanair's
schedules and Travelpayouts. An IPv6-only box cannot clone the repository, and
its fare harvest would keep only Ryanair. The
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
