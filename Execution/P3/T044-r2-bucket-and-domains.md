# T044 Create the R2 bucket, four prefixes, two custom domains

## Task ID

T044

## Date

2026-09-27

## What changed

Nothing in production changed. What exists now is a complete, tested procedure for
standing up the R2 bucket the architecture document calls for in section 5.2 and
section 8.2 step 2, plus a script that verifies the result once it exists. Neither
script has touched a live Cloudflare account, because no Cloudflare credentials exist
in this environment, the same gap T024 recorded on 2026-09-23. `npx wrangler whoami`
still says "You are not authenticated" and no `CLOUDFLARE_API_TOKEN`, `CF_API_TOKEN`
or `CLOUDFLARE_ACCOUNT_ID` is set anywhere in the environment or in a tracked file.

Two scripts were written and both were exercised end to end in dry-run form, so the
wrangler syntax in them is verified against the installed wrangler (4.142.0), not
copied from memory or documentation that might be stale. `provision.sh --dry-run`
prints every command it would run, in order, and exits 0. `verify.mjs` was run for
real against the two live hostnames and correctly reports both as unreachable, which
is the honest "before" measurement: zero custom domains resolve today.

The one substantive decision made here is the bucket name: `carta`. The architecture
document names the four prefixes explicitly (`img/`, `data/`, `tiles/`, `archive/`)
but never names the bucket itself. The rest of the project already has two adjacent
names in use, `carta-app` (the Cloudflare Pages project, in `wrangler.toml`) and
`carta-europetravel.com` (the zone), so `carta` is the shortest name that does not
collide with either and reads unambiguously in a bucket listing. It is a single
constant at the top of `provision.sh` and easy to change before the bucket is created
for real; R2 buckets cannot be renamed after creation, so this is worth confirming
before running the script with credentials.

The CSP in `continent-app/public/_headers` was read and deliberately left unchanged.
Its own comment, and T024's report, both say the `img-src`/`connect-src` amendment
belongs to T044 "when the R2 bucket and its custom domains exist." They do not exist
yet; adding the hosts now would permit two domains that serve nothing, which is the
exact mistake T024 avoided making one task early. This task ends in the same
position T024 anticipated: the CSP amendment is still one task away, gated on the
bucket and domains actually going live.

## Files touched

All paths are relative to the repository root. The scripts are in `continent-app/`,
which is its own git tree; they are committed on branch `p3-r2-bucket-and-domains`
there. The report and register are committed on the same branch name in the root repo.

**Created:**
- `continent-app/scripts/r2/provision.sh` — creates the bucket, the four prefix
  markers, uploads a test object to `img/` and `data/` with the real Cache-Control,
  and attaches the two custom domains. Runs in `--dry-run` mode with no credentials.
- `continent-app/scripts/r2/verify.mjs` — checks both custom domains resolve and
  return the expected object with the expected Cache-Control; exits non-zero on any
  failure.
- `Execution/P3/T044-r2-bucket-and-domains.md` — this report.

**Modified:**
- None. `continent-app/public/_headers` was read but not edited; see above.

**Deleted:**
- None.

## Commands run

```bash
# Read the architecture doc, the previous Cloudflare task, and the wrangler
# syntax actually installed, before writing anything.
sed -n '72,110p;236,310p;555,615p' "additional docs/Carta/Plan/Architecture/CARTA_CLOUD_ARCHITECTURE.md"
cat Execution/P1/T024-cloudflare-pages-migration.md
cd continent-app
npx wrangler --version                       # 4.142.0
npx wrangler r2 bucket --help
npx wrangler r2 bucket domain --help
npx wrangler r2 bucket domain add --help      # confirms --domain and --zone-id, both required
npx wrangler r2 bucket create --help
npx wrangler r2 object put --help             # confirms --cache-control / --cc

# Branch, both repos, from the current HEAD, not from prod-2026-09.
cd ..
git checkout -b p3-r2-bucket-and-domains
cd continent-app
git checkout -b p3-r2-bucket-and-domains

# Confirm no credentials are present.
env | grep -i "CLOUDFLARE\|CF_API"            # nothing

# Record the "before": neither domain resolves.
node scripts/r2/verify.mjs                    # 0/2 checks passed, exit 1

# Exercise the provisioning script's syntax with no account access.
chmod +x scripts/r2/provision.sh
bash scripts/r2/provision.sh --dry-run         # prints every wrangler command, exit 0
```

## Config and secrets set

None, and none could be. This task needs two Cloudflare credentials to run for real,
and documents where they go without ever holding them:

`CLOUDFLARE_API_TOKEN`, exported in the shell that runs `provision.sh`, on the machine
that has account access. Never written to a file, never committed, never pasted into
this report. Minimum permissions, read directly off `npx wrangler r2 bucket --help`
and `npx wrangler r2 bucket domain add --help` rather than assumed: the token needs
R2 Storage: Edit (create bucket, write objects) at the account level, and it needs
whatever scope covers the `--zone-id` argument to `wrangler r2 bucket domain add`,
which in Cloudflare's own token templates is bundled as part of the "Zone: Read" (to
resolve the zone) plus the R2 custom domain attachment right that ships inside the R2
Storage: Edit template when the token also has the zone in scope. The precise token
template name is a Cloudflare dashboard detail this session cannot see without
authenticating, so treat "R2 Storage: Edit, scoped to the account, plus Zone: Read,
scoped to the carta-europetravel.com zone" as the starting point and let the actual
`domain add` call fail with a permissions error if it needs one more.

`CLOUDFLARE_ACCOUNT_ID`, same rule: exported, never written down. Wrangler reads it
from the environment or from `wrangler.toml`; it is not added to `wrangler.toml` here
because that file is version-controlled and the account id, while not as sensitive as
a token, has no reason to be in a file this task does not need to touch.

`CLOUDFLARE_ZONE_ID`, the zone id for `carta-europetravel.com`, read off the zone
overview page in the dashboard. Same rule again.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| R2 buckets on the account | unknown, not authenticated | unknown, not authenticated | not moved, no credentials |
| Custom domains resolving (cdn., data.) | 0 | 0 | unchanged; this is the honest number |
| Provisioning script exists and its wrangler syntax is verified | no | yes, `provision.sh`, dry-run exit 0 | new |
| Verification script exists and correctly detects "not resolving" | no | yes, `verify.mjs`, ran for real, exit 1 as expected | new |
| CSP amendment for the two R2 hosts | not made | still not made, on purpose | unchanged; correct per T024 and the file's own comment |

The task's own "done when" asks for both custom domains to resolve and serve a test
object with the right cache headers. That did not happen and could not happen from
this session; see "What is still open." The honest after-figure for the done
condition is 0 of 2 domains resolving, identical to before.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `provision.sh --dry-run` exited 1 at step 4 | The zone-id guard used `: "${VAR:?msg}"`, which raises even when the surrounding script only wants to check whether dry-run should skip it | Replaced with an explicit `if [ "$DRY_RUN" -eq 0 ] && [ -z ... ]` check, so dry-run mode never touches the zone-id requirement and the full script now exercises all five steps and exits 0 |

Nothing else broke. Both scripts ran clean on the first try otherwise.

## What is still open

Three things are blocked on a Cloudflare API token that does not exist in this
environment, exactly as T024 anticipated for this exact task. None of them can be
done from a Claude Code session; all three need the account owner.

Creating the bucket for real. Run `provision.sh` with `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` exported (no `--dry-run`), after confirming the bucket name
`carta` is the one wanted, since it cannot be changed afterward without a new bucket
and a re-upload of everything in it.

Attaching the two custom domains. Needs `CLOUDFLARE_ZONE_ID` as well, and needs the
bucket to exist first (step 4 of the same script, run after step 1 succeeds). Cloudflare
provisions a certificate for each domain after `domain add` succeeds, which the
architecture doc does not put a number on; expect a short wait, not instant.

Final header verification. Run `node scripts/r2/verify.mjs` after the domains have had
time to provision. It will report PASS/FAIL for each and exit non-zero if either fails,
so it is safe to wire into a script or run by hand and read the exit code.

T045 and T054 both depend on this task's bucket and domains existing: T045 is the next
step in the numbering and is not read here, and T054 is the wire-shards-to-R2 task that
T024's report names directly, blocked on `data.carta-europetravel.com` existing before
any shard can be pointed at it. Until the three items above are done by the account
owner, both of those tasks are blocked the same way this one was.

## Rollback procedure

Nothing was created on any live system, so there is nothing to roll back yet. Once the
bucket and domains are created for real, rollback is: remove the two custom domains
with `npx wrangler r2 bucket domain remove carta --domain <domain>`, then delete the
bucket with `npx wrangler r2 bucket delete carta` (only once nothing references it; a
non-empty bucket must have its objects removed first). Both are ordinary, reversible
account operations with no data outside the bucket at risk. To roll back only the code
in this task, delete `continent-app/scripts/r2/provision.sh` and
`continent-app/scripts/r2/verify.mjs` and drop this report; nothing else in the repo
references either file.
