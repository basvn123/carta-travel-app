# T257: provision.sh writes its R2 objects to the real bucket

## Task ID

T257

## Date

2026-10-01

## What changed

`continent-app/scripts/r2/provision.sh` makes three `wrangler r2 object put`
calls: the four prefix markers (`img`, `data`, `tiles`, `archive`) and one
test object each under `img/_test/` and `data/_test/`. Without `--remote`,
current wrangler writes objects to the local Miniflare store instead of the
bucket, as T045 found (row T045-f). The script would have printed success,
the bucket would have stayed empty, and the R2 verify in stage 5 of
`_OPEN-MASTER.md` (`verify.mjs`, row T044-c) would have failed against the
real bucket for a reason nowhere in its output. All three calls now pass
`--remote`. The bucket create and the two domain attaches are
account-level commands that always act remotely, so they are unchanged.

No other script under `continent-app/scripts/` calls `r2 object put`, `get`
or `delete` without `--remote`.

## Files touched

**Modified:**
- continent-app/scripts/r2/provision.sh (committed in both repositories)
- Execution/_OPEN.md (T045-f closed)

**Created:**
- Execution/P4/T257-r2-provision-remote.md

## Commands run

```
bash -n continent-app/scripts/r2/provision.sh     # syntax ok
grep -rn "object put\|object get\|object delete" continent-app/scripts/ | grep -v -- --remote
```

The script was not run. There are no Cloudflare credentials on the laptop and
wrangler is not installed in `continent-app/node_modules`; the first real run
is the owner's, in stage 5.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

No issues.

## What is still open

None. The proof is stage 5's own verify step (T044-c), which reads the
markers and test objects back from the real bucket.

## Rollback procedure

`git revert` the T257 commit in either repository. If the script already ran
with `--remote`, the marker and test objects are harmless; delete them with
`npx wrangler r2 object delete <bucket>/<key> --remote` if wanted.
