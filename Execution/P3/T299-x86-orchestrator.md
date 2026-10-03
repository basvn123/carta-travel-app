# T299 The orchestrator box can be x86, and gets an IPv4 by default

## Task ID

T299

## Date

2026-10-03

## What changed

Stage 7 could not start: on 2026-10-03 the owner's `hcloud server-type describe` showed every ARM type (CAX11, CAX21, CAX31) as unavailable in fsn1, nbg1 and hel1. The console's availability table shows no CAX type in any location since 2026-09-03. The account itself is fine. A listing of every type with stock showed the x86 CPX and CCX families available in all three European locations. The cheap x86 CX23 was out of stock as well, but its stock comes and goes within the hour.

The box type is the CX23 (2 vCPU, 4 GB, 40 GB). The owner's prices for fsn1 on 2026-10-03, VAT included:

- CX23: EUR 6.64
- CAX11: EUR 7.25
- CPX12 (1 vCPU, 2 GB): EUR 13.90
- CPX22 (2 vCPU, 4 GB, 80 GB): EUR 23.58

Python needs about 1 GB to load the 114 MB master (measured on the laptop), so 4 GB is comfortable and 2 GB would be tight. The CPX22 was planned first because it was in stock, but it was turned down on price, so stage 7.2 waits for CX23 stock in a loop instead.

The box scripts assumed ARM in three places, and all three now handle x86. ARM stays the default.

- `provision.sh` reads `CARTA_SERVER_TYPE` (default `cax11`). It maps `cax*` to arm64 and `cx*`, `cpx*` and `ccx*` to amd64, refuses any other value, and prints the type and architecture. It also accepts `hel1` as a location.
- `cloud-init.yaml` no longer pins one checksum per tool but a pair. A new first bootstrap step, `select_arch`, reads `dpkg --print-architecture` and picks the build and its checksum. hcloud and rclone call the x86 build `amd64`, node calls it `x64`, and rclone's zip folder carries the same suffix. An unknown architecture fails that step with a message, and the three installs then refuse to download without a checksum rather than tripping `set -u`. The amd64 checksums were read from the official sums files on 2026-10-03. The arm64 ones there match the pins already in the file.
- `verify.sh` passes `aarch64` or `x86_64`.

`provision.sh` now also gives the box a public IPv4 by default, and `IPV4=0` keeps the old IPv6-only behaviour with its warning. The approved plan only had the next steps print the IPv4 address. Register row T300-w asked for this default "in a box task", and this is one. An IPv6-only box cannot clone from GitHub, and the owner's laptop has no IPv6 (`curl -6` failed on 2026-10-03), so the old default could not work for this owner on either side. With IPv4 the printed next steps use the IPv4 address. The README section on IPv6 says why the default turned.

Docs follow the code:

- The README box and cost sections.
- One line in the `constraints.txt` header.
- The rclone comment in `cax41/cloud-init.yaml`. Workers stay arm64 only; see T299-a.
- Stage 7 of `_OPEN-MASTER.md`: the title, the open note, 7.1 (`describe cx23`, and why), 7.2 (`CARTA_SERVER_TYPE=cx23` in a loop that waits for stock, the IPv4 `<address>`, push before provisioning, the "architecture amd64" log line) and 7.4 ("architecture x86_64").

## Files touched

Root repository (branch p3-x86-orchestrator, from main 93a7d7d11):

**Modified:**
- infra/hetzner/cax11/provision.sh
- infra/hetzner/cax11/cloud-init.yaml
- infra/hetzner/cax11/verify.sh
- infra/hetzner/README.md
- infra/hetzner/cax41/cloud-init.yaml (comment only)
- constraints.txt (header comment only)
- Execution/_OPEN-MASTER.md (stage 7)
- Execution/_OPEN.md (T300-w closed by T299; rows T299-a and T299-b added)

**Created:**
- Execution/P3/T299-x86-orchestrator.md

T324 (wave 9) had already changed `infra/hetzner/` (weekly.sh, jobs/, README). It was merged before this branch started, and the two touch different lines. T298 and T299 were the numbers `_WAVES.md` leaves free for other sessions.

## Commands run

```bash
# 1. syntax, YAML and the embedded bootstrap
bash -n infra/hetzner/cax11/provision.sh ; bash -n infra/hetzner/cax11/verify.sh       # 0, 0
python -c "yaml.safe_load(cloud-init.yaml)" and the carta-bootstrap content extracted   # parses
bash -n carta-bootstrap.sh                                                             # 0

# 2. dry runs
CARTA_SERVER_TYPE=cpx22 CARTA_LOCATION=fsn1 bash infra/hetzner/cax11/provision.sh --dry-run
#   "server type cpx22 (amd64) in fsn1", --type cpx22 --location fsn1, no --without-ipv4,
#   next steps to <ipv4 address>, no @@ placeholder left
bash infra/hetzner/cax11/provision.sh --dry-run                  # cax11 (arm64), IPv4 on
IPV4=0 bash infra/hetzner/cax11/provision.sh --dry-run           # warning and --without-ipv4
CARTA_LOCATION=hel1 ... --dry-run                                # accepted
CARTA_SERVER_TYPE=foo ... ; CARTA_LOCATION=ash ...               # exit 2, both

# 3. the bootstrap's own selection and download lines, both architectures
#    (scratchpad t299_arch_test.py builds a script from the YAML: the pins,
#    fetch_verified, select_arch and the three fetch_verified commands verbatim)
#    arm64: hcloud, rclone, node OK; amd64 (node x64): hcloud, rclone, node OK;
#    riscv64 refused. Archive layouts: rclone-v1.75.1-linux-{arm64,amd64}/rclone, hcloud at the root.

# 4. the pinned Python set on x86 (uv 0.12.22 in the scratchpad)
uv pip compile --python-platform x86_64-manylinux_2_28  --python-version 3.12 --only-binary :all: requirements.txt -c constraints.txt   # 71 pins
uv pip compile --python-platform aarch64-manylinux_2_28 --python-version 3.12 --only-binary :all: requirements.txt -c constraints.txt   # 71 pins, 0 differences

# 5. the offline worker suite
bash infra/hetzner/cax41/verify.sh                               # 86 passed, 0 failed, 3 skipped (optional fakes)
```

`pip install --dry-run --platform ...` from Windows was tried first and is not usable for this check. pip evaluates environment markers for the host, so it asked for `pywin32`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Server types provision.sh can create | 1 (cax11) | every cax, cx, cpx and ccx type | x86 added |
| Locations accepted | fsn1, nbg1 | fsn1, nbg1, hel1 | +1 |
| Architectures the bootstrap installs for | arm64 | arm64, amd64 | +1 |
| Default IPv4 | off | on | turned |
| Python pins that resolve on x86_64 | not checked | 71 of 71, identical to aarch64 | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The x86 wheel check with pip failed on pywin32 | pip on Windows evaluates markers for Windows even with --platform | Used uv, the tool the constraints header names |
| `--help` cut the last setting line | The header grew by eight lines | The sed range follows it |

## What is still open

The real proof is the owner's: stage 7.2 to 7.4 on a CX23. The bootstrap log must show "ok: architecture amd64" and end "finished, all steps ok", and `verify.sh <IPv4>` must print ALL CHECKS PASSED with "architecture x86_64". GitHub `main` must hold this commit before 7.2, because the box clones it.

T299-a: stage 8's workers are CAX41s and just as out of stock. `CARTA_WORKER_TYPE` exists, but the worker cloud-init pins only the arm64 rclone, and `jobs/` installs aarch64 torch wheels.

T299-b: the `hetzner_cax11` cost label (599 cents) in the migration 031 seed and the admin-panel harness no longer describes the box.

## Rollback procedure

`git revert` this commit. A box already provisioned as x86 keeps running, but a re-run of `carta-bootstrap` from the reverted file would install arm64 builds on it and fail its checksum. Delete such a box with `hcloud server delete carta-orchestrator` before reverting, or keep this commit. `IPV4=0` gives the old network default without a revert.
