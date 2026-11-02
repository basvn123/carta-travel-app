# T992 to T996: the box keeps its disk, its packages and its code current, and deploys itself

Batch of five tasks on branch `p3-box-autonomy` (root repo only; no app-repo change), run on 2026-11-02 while the box's second Monday run was in progress. Owner decisions taken in the same session and recorded here: D1 the always-on box is the x86 CX23 (2026-10-22), D2 failures alert through Healthchecks.io (2026-10-22), D3 the box deploys the app itself (2026-11-02), D5 the trails lab moves to a worker (2026-10-22, since built as T647's trailslab worker by another session).

Shared context. The box (`carta-orchestrator`, 46.225.237.75) was found at 10:22 on 2026-11-02 with 974 MB free of 38 GB in the middle of run 2. With the owner's approval the 2026-10-22 copies of `pan_europe`, `sweden` and `norway` under `data/raw` were deleted by hand (13 GB free after), which is what T992 now does by itself. Numbers T992 to T997 were reserved with the one busy session (travel-app-51); T997 was not needed.

Register. Stage 7 of `Execution/_OPEN-MASTER.md` was done by the owner, guided, on 2026-10-22 and 2026-10-23 and never recorded; this batch closes its rows with the evidence of that session: T046-a (IPv4 on), T046-c to T046-g (project, provision, secrets, verify.sh ALL CHECKS PASSED, first full run exit 0), T048-a to T048-e (pull, the four weekly steps, the run, compare_wire SAME SHAPE on 52,000 data files, timers installed), T048-g (the box's dump `supabase-2026-10-27.dump.gpg`, 149,182 bytes, is in R2) and T218-b (Healthchecks `carta-weekly`, URL in the secrets file), all closed by T992. T262-a is closed by T995 and T740-a by T994. New rows: T994-a, T995-a to T995-c.

Checks for the batch: `bash -n` on both scripts, the retention function run on the box's real `data/raw` in dry-run mode (twice, see T992), the self-update run in a throwaway git setup (T994), the fingerprint compared against the live site with three laptop builds (T995), `run_all --list` and `tests/test_data_licences.py` (T996). No browser check: nothing a traveller sees changed. The full scripts first run on the box on Monday 2026-11-09, after the owner step T994-a.

---

## T992: raw mirror retention

### Task ID

T992

### Date

2026-11-02

### What changed

`src/ingestion` writes every run's download to `data/raw/<source>/<YYYY-MM-DD>/` and nothing ever removed the older ones, so each run added about 12 GB (the three big transit sources) to a 38 GB disk. `run_pipeline.sh` now keeps the newest dated folder per source and deletes the older ones, once before `run_pipeline.py` (room for this run's download) and once after the push (so the new folder reaches R2 first; the raw-mirrors push copies and never deletes, so R2 keeps every pushed day). When the newest folder looks like a download that stopped halfway (fewer than half the distinct files of the one before, or under half its bytes per copy) the one before it stays too. The first version compared total bytes; a dry run on the box showed every 2026-11-02 folder as "under half" of 2026-10-22, because that day had two runs and `RawStore` keeps a same-day rerun beside the first with an `_HHMMSS` stamp. The second commit compares distinct files and bytes per copy instead.

### Files touched

**Modified:**
- infra/hetzner/cax11/run_pipeline.sh (`raw_stats`, `prune_raw`, the two calls, header step 4)

### Commands run

```
bash -n infra/hetzner/cax11/run_pipeline.sh
# the two functions with DRY_RUN=1, run in ~/carta on the box:
bash /tmp/prune_test.sh
```

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Box disk free, 2026-11-02 mid-run | 974 MB | 13 GB (hand deletion) | +12 GB |
| Dated folders the dry run would delete (second version) | n/a | 23 of 24 sources' 2026-10-22 copies | |
| Sources kept twice by the incomplete check | 9 (first version, false) | 1 (`eurocontrol_ddr`, both empty) | |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First dry run kept both copies of 9 sources | Total bytes compared; 2026-10-22 held two runs' copies | Distinct files and bytes per copy (commit 2) |

### What is still open

None for this task. Same-day reruns still store two copies in one folder (RawStore's behaviour); retention does not dedupe inside a folder.

### Rollback procedure

`git revert` both T992 commits. The deleted folders are not restored by a revert; every pushed day is in R2 under `archive/inputs/raw/`.

---

## T993: npm ci when package-lock.json changes

### Task ID

T993

### Date

2026-11-02

### What changed

`run_pipeline.sh` ran `npm ci` only when `continent-app/node_modules` was missing. On 2026-10-23 the ship step failed on `minisearch`, a package the app gained after the box's first install. The script now stamps the hash of `package-lock.json` into `node_modules/.carta-lock` after each install and runs `npm ci` again whenever the lock file's hash differs, the way it already handled the Python venv.

### Files touched

**Modified:**
- infra/hetzner/cax11/run_pipeline.sh (node_modules block, header step 4)

### Commands run

```
bash -n infra/hetzner/cax11/run_pipeline.sh
```

### Config and secrets set

None.

### Before/after measurements

Not measured. The first run with this code installs once (no stamp yet), about a minute.

### What broke and how it was fixed

No issues.

### What is still open

None.

### Rollback procedure

`git revert` the T993 commit.

---

## T994: the box brings its code to main before each run

### Task ID

T994

### Date

2026-11-02

### What changed

The box never fetched code by itself: fixes reached it only when someone moved its checkout by hand (2026-10-23 to the T617 branch, 2026-10-31 to `carta-run`), and run 2 started on a checkout two days behind `main`. `weekly.sh` now runs `git fetch --depth 1 origin main` and `git reset --hard FETCH_HEAD` before `run_pipeline.sh`, and logs `code update: <old> -> <new>` in `~/logs/weekly.log`. A failed fetch leaves the code as it is and the run goes on. `--hard` because the pipeline rewrites tracked wire files under `continent-app/public`, which the run writes again; the master, caches, `data/raw` and `continent-app/.env` are gitignored and stay. The whole body moved into `main()`, called on the script's last line, because bash reads a script as it runs and the reset rewrites `weekly.sh` itself. `CARTA_AUTO_UPDATE=0` keeps a hand-placed checkout.

### Files touched

**Modified:**
- infra/hetzner/cax11/weekly.sh
- infra/hetzner/cax11/env.example (`CARTA_AUTO_UPDATE`)

### Commands run

A throwaway bare repository with this `weekly.sh` and a stub `run_pipeline.sh` (v1), cloned as "box"; a second commit put 300 lines in front of `weekly.sh` and made the stub print v2; then the v1 clone ran:

```
CARTA_ENV_FILE=... CARTA_LOG_DIR=... CARTA_PIPELINE_ENABLED=1 bash box/infra/hetzner/cax11/weekly.sh --dry-run
```

It printed `RUN_PIPELINE v2 args=--dry-run`, exited 0, logged `code update: 37ab710 -> 3293d9b (origin/main)`, and no parse error came from the rewritten file.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

No issues.

### What is still open

The box still runs the old `weekly.sh` until its checkout reaches a `main` that holds this commit once, by hand, after run 2 has finished (T994-a). From then on it updates itself.

### Rollback procedure

`git revert` the T994 commit, or set `CARTA_AUTO_UPDATE=0` in the box's secrets file without a revert.

---

## T995: the box deploys the app shell itself (D3)

### Task ID

T995

### Date

2026-11-02

### What changed

After a run that published data (phase 1), and with `CARTA_DEPLOY=1`, `run_pipeline.sh` now writes `dist/404.html`, runs `check-pages-limits.mjs`, deploys `dist/` with `npx wrangler@4.156.1 pages deploy dist --project-name carta-app --branch main`, and then runs `push-data.mjs --live --prune`: the hand step of register row T262-a. A failed deploy or prune makes the run exit 3, so the heartbeat sends `/fail`.

The guard. The box builds from the root repo's `continent-app` mirror; sessions deploy from `continent-app` itself, often before their work is mirrored. On 2026-11-02 the app working copy differed from the mirror in 37 source files, and a build of `main` shared 44 of 77 asset names with the live site. A box deploy then would have rolled live code back. The pipeline writes only data (public/, the split tree), never source or `config/`, so the hashed entry script `assets/index-<hash>.js` moves with code alone. The box deploys only when its entry script equals the live site's; otherwise it logs both names and leaves the deploy to a person (the week's data is live through phase 1 either way).

Evidence that the fingerprint is stable: a build of the app working copy with the production environment shares 67 of 77 asset names with the live site, and the 10 that differ are modules other sessions edited after the last deploy. The first mismatch found came from `VITE_E2E_SEAMS=1` in the laptop's `continent-app/.env` (since 2026-09-22), which the live build does not carry: one inlined variable changed `dataHost` and every chunk that imports it. Not proven: that a Linux build hashes the same as a Windows one. If it does not, the guard never matches and the box never deploys, which fails safe; run 3's log shows which.

The box had no `continent-app/.env`, so its builds lacked the Supabase URL, the anon key and the two affiliate ids, and could never match. It now has a copy of the laptop's file without `VITE_E2E_SEAMS` (all four values ship in the public bundle; gitignored, so T994's reset keeps it).

### Files touched

**Modified:**
- infra/hetzner/cax11/run_pipeline.sh (step 10, `PUBLISHED`, exit 3 on deploy failure, header)
- infra/hetzner/cax11/env.example (`CARTA_DEPLOY`, the token note)

### Commands run

```
grep index- dist/index.html on the box; curl https://www.carta-europetravel.com/
# laptop builds, fast NOPUBLIC config wt/vite.t992.mjs and wt/vite.t960.mjs:
VITE_DATA_BASE=https://data.carta-europetravel.com/data PF_OUT=... node node_modules/vite/bin/vite.js build --config ...
comm -12 live_assets build_assets
grep -v '^VITE_E2E_SEAMS' continent-app/.env | ssh carta@46.225.237.75 'cat > ~/carta/continent-app/.env'
```

### Config and secrets set

On the box: `~/carta/continent-app/.env` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_TP_MARKER, VITE_OMIO_TRACKING_LINK; public values). Not set: `CARTA_DEPLOY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (T995-a).

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Hand steps after a good Monday run | build, deploy, prune | none when the guard matches | |
| Asset names shared with live: build of main mirror | 44 / 77 | | |
| Asset names shared with live: app working copy, production env | 67 / 77 | | |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Laptop builds never matched live at all | `VITE_E2E_SEAMS=1` in continent-app/.env | Cleared for the comparison; left out of the box's .env |
| Box builds could never match | No continent-app/.env on the box | Copied without the test switch |

### What is still open

The owner creates the deploy token and turns the step on (T995-a). The box deploys only in weeks where the live site runs exactly `main`'s mirror; while sessions deploy unmirrored work, it will mostly log a skip (T995-b). The laptop's `continent-app/.env` turns the end-to-end test seams on for every build made from it (T995-c).

### Rollback procedure

Set `CARTA_DEPLOY=0` (or blank) in the box's secrets file, or `git revert` the T995 commit. A Pages deploy is undone from the Cloudflare dashboard (Deployments, roll back), and a prune is undone by the next phase 1 upload.

---

## T996: ERA's dead register page

### Task ID

T996

### Date

2026-11-02

### What changed

`rinf.era.europa.eu` answers 301 to `data-interop.era.europa.eu`, a name with no A, AAAA or CNAME record, so the `era` collector logged an error for it on every run since 2026-10-22. The page is dropped from `PAGES`; the other three ERA pages still snapshot, and the RINF API stays reachable through `ERA_EXPORT_URLS` with an account. `traffic.navici.com` (also dead) stays: it is an entry in public-transport.earth's remote feed list, not in this repository, and `pan_europe` already skips it per feed.

### Files touched

**Modified:**
- src/ingestion/rail/era.py

### Commands run

```
curl -sI https://rinf.era.europa.eu/
curl 'https://cloudflare-dns.com/dns-query?name=data-interop.era.europa.eu&type=A' (and AAAA, CNAME)
python -m src.ingestion.run_all --list
python -m pytest -q tests/test_data_licences.py
```

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| ERA pages per run | 4 (1 dead) | 3 | -1 |

### What broke and how it was fixed

No issues. `tests/test_data_licences.py` fails 3 tests before and after, all on harvesters without a RUNS entry (row T617-a, now 12 harvesters); none on `era`.

### What is still open

None.

### Rollback procedure

`git revert` the T996 commit.
