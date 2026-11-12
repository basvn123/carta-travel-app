# Owner procedure: Hetzner box and workers (T1072, ROADMAP A3)

Steps on the Hetzner box (CAX11) and the on-demand worker (CAX41 or CPX42). Existing detail: docs/owner/hetzner.md and docs/owner/explore-data-runs.md.

Steps are the open register rows with Owner `user` that belong to this system, in register order: the Order column first, then task number. A row's own wording says what it waits on ("after", "before"); that is repeated beside the step. Nothing here is new: each step is a row, and the task report named in the row has the detail. When a step is done, delete it here (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

Rows: 20. Register rows point back here.

## Steps

1. **T915-a** (register order: 1): Run scratchpad run-t915.sh: deploy the flight-sweep Worker (found routes, /extra, /have), then move the box to origin/main and reinstall, which restarts the sweep and the fill (Execution/P11/T915-T917-sweep-gaps.md)
2. **T994-a** (register order: 1): Move the box to main once by hand after run 2 has finished and this batch is on origin main (`git -C ~/carta fetch --depth 1 origin main && git -C ~/carta reset --hard FETCH_HEAD`), so the self-updating weekly.sh is in place before Mon 2026-11-09 09:00
3. **T475-e** (register order: 2): Owner call: Hetzner capacity for self-hosted MOTIS next to the data lane, after roadmap 3.11 measures the memory for Italy (owner 21 October: postponed)
4. **T995-a** (register order: 2): Create a Cloudflare API token with Account, Cloudflare Pages, Edit, then set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and CARTA_DEPLOY=1 in the box's ~/.config/carta/env; until then the box deploys nothing
5. **T640-c** (register order: 3): Box run results reach production only through the box ship; confirm VITE_DATA_BASE on the box and copy the published wires back into git
6. **T647-a** (register order: 4): Decision D6: x86 CPX42 worker for trailslab (pgrouting is amd64 only); confirm the price with hcloud and update RATES in infra/hetzner/cax41/cost.py
7. **T647-b** (register order: 5): Before 2026-11-01: choose the dump-key option, make the worker keypair on the box and put a dump encrypted to both keys (or a fresh one) in archive/db/trailslab/, or the only lab copy is the laptop Docker disk
8. **T647-d** (register order: 7): Selftest spawn on cpx22, the --no-install LI test run with measured step times, then CARTA_TRAILSLAB_WORKER=1 on the box
9. **T045-e** (register order: 29): Laptop clean-out with the T045 report's rm command, only after T045-c and T045-d pass their checks; then the trailslab volume and the Docker vhdx last. This is T045's done condition
10. **T055-b**: The Tier 0 monthly bill (about EUR 9.50-10.90) is still unconfirmed against an invoice; nothing is provisioned (R2 bucket, Hetzner CAX11, custom domains). Enter the first real invoice into public.infra_ledger as actual once T044/T046's owner steps land, then compare line by line against CARTA_CLOUD_ARCHITECTURE.md section 7
11. **T269-d**: Before the first promoted clip_sweep, run the T047-g procedure in docs/PHOTOS.md ("Moving the photo caches to the CAX41"): clip_parity.py on the box, the caches pushed without a hold, and the decision of which machine owns each cache/<layer> written into that section
12. **T288-b** (register order: before 2026-11-01): The only trailslab dump (archive/db/trailslab/trailslab-2026-10-02.dump.gpg) expires on 2026-11-01 under the 30-day archive/db/ rule, and the build box skips the trailslab dump because the lab is on the laptop; re-dump from the laptop with the streamed command in the T288 report at least every four weeks, or decide a longer rule for archive/db/trailslab/
13. **T324-a** (register order: after stage 7 box, before data lane on box): The multi-arch lab image (imresamu/postgis bundle0, pinned by digest in tools/trailslab/docker-compose.yml) is untested: on the box run pipeline/trails/smoke_test.py against it and record the pgRouting version it reports; on the laptop, before any swap, run ALTER EXTENSION pgrouting UPDATE in the lab database (or keep TRAILSLAB_IMAGE=pgrouting/pgrouting:17-3.5-3.7)
14. **T324-c** (register order: after T269-a and stage 7): image_transcode now accepts the eight wire layers with no tarball, but a wire layer derives nothing until its sources file is in R2 (derive.py sources <layer>, row T269-a); the first live wire run, the CARTA_DERIVE_RECHECK=auto cadence (first 7 days of a UTC month) and the dry-run gc plan need an owner look after the first box run
15. **T433-o**: Every day route is computed on routing.openstreetmap.de (public FOSSGIS OSRM, fair use); decide on a self-hosted router on the Hetzner box before launch traffic
16. **T449-a**: Trail 86628 (Promenade du Lac de Nisramont, BE) still shows a moth until the trail wire is re-exported with the drop list (export_wire.py on trailslab, then the R2 push), or run python pipeline/photos/takedown.py add "2018-11-04_Colotois_pennaria_(2).jpg"
17. **T471-d**: Owner call: run a self-hosted MOTIS (train and bus timetables, Transitous itself is non-commercial only) on the Hetzner box for roadmap 2.16, starting with Italy, Austria and Switzerland (owner 21 October: postponed)
18. **T640-f**: beaches-cache and mountains-cache are now pushed from the box; pull them on the laptop before any local rebuild
19. **T805-a**: Late tier to week 45: merge app p11-flights-to-august and deploy Pages, no Worker redeploy, then on the box check CARTA_SWEEP_INGEST_TOKEN matches the Worker's INGEST_TOKEN, pull, run infra/hetzner/cron/install.sh (restarts carta-late-sweep.service), and watch /status lateFares grow about 6,500 a day; it is 0 today, so T798's late tier has not run yet (Execution/P11/T804-T805-flights-to-august.md)
20. **T1056-b**: The Hetzner box's unattended prune (infra/hetzner/cax11/run_pipeline.sh, push-data.mjs --live --prune) now stops after listing the names, since it has no terminal; add --yes there if the box should keep pruning by itself
