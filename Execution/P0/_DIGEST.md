# P0 digest

14 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`.

### Task T001: Create the Execution folder structure (2026-09-22)

Created the Execution folder hierarchy (P0 through P15, 16 folders total) and established a fixed report template that all subsequent task reports will follow. This ensures that 150+ task completion reports remain comparable, searchable and structured as records rather than ad-hoc narratives. The template enforces: task ID, date, outcome statement, file list, command history, measurements, problems and their fixes, open work, and rollback procedure. By standardizing the shape once, future reports are machine-parseable and human-scannable.

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T001-report-convention.md"`

### Task T002: Write CLAUDE.md working rules for the plan (2026-09-22)

Created CLAUDE.md at the repository root to document the working conventions for executing the Carta rating_v4 and Explore rebuild plan across 150+ tasks and many Claude Code sessions. The document establishes five core rules: task numbering (T001-T150 across phases P0-P15), the requirement that every task writes its report before the next starts, the rule that carta-design wins over all other design sources, the discipline that tasks touch only named files, and the one-branch-per-task convention. It also specifies measurement requirements, rollback procedures, and known gotchas (schema versioning, pipeline orchestration, no CI tests).

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T002-claude-code-working-rules.md"`

### Task T003: Tag and baseline the current production state (2026-09-22)

Tagged the currently deployed production commit (8b53babed, "Dossier merge") as `prod-2026-09` and documented the branch convention in CLAUDE.md. This creates a named rollback point before infrastructure, schema, and payment code changes are introduced in the Carta rating_v4 and Explore rebuild phases. The tag is pushed to the remote repository and serves as the canonical baseline for all subsequent work. The branch naming convention {phase}-{slug} is now documented as the standard for per-task branches, ensuring each change remains independently revertible throughout the 150-task plan.

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T003-git-baseline.md"`

### T004 , Encrypted Supabase backup (2026-09-22)

There is now a tested way to take an encrypted dump of the live Supabase project, and a tested way to get the data back out of one. Before this task there was no backup of the live project at all, and no written procedure for taking one. P2 and P4 both apply SQL migrations by hand in the Supabase SQL editor, which has no undo, so the project was one mistyped statement away from losing user data that exists nowhere else. Two scripts and one document were added. `ops/backup_supabase.sh` streams `pg_dump --format=custom` straight into `gpg --symmetric` with AES256, so the unencrypted dump never touches disk.

Broke: CARTA_CLOUD_ARCHITECTURE.md not found / The file does not exist in the repository; the task cites section 6.3 of it / Worked from the second cited source, the 007_passes.sql header, which states the no-db-push constraint directly.

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T004-database-backup.md"`

### T005 , Master snapshot preservation (2026-09-22)

Five master data files totalling 419 MB were copied to off-machine storage with checksums and a manifest documenting their purpose. Before this task, all five masters lived only in app_data/ on the development machine. T014 plans to delete four of them to reclaim ~400 MB once R2 data repository exists with versioned snapshots, but losing them before R2 was live would require weeks of pipeline re-runs to recover any checkpoint state.

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T005-master-snapshot-preservation.md"`

### T006: arm64 coverage audit (2026-09-22)

Nothing in the code or data. This is an audit. Every container and native dependency the pipeline pins was checked for a working linux/arm64 build, against the registries and PyPI directly, and the result is the table below. The short version: the ARM plan holds. Two of the three pinned images are multi-arch, every compiled Python wheel the pipeline installs has a Linux aarch64 build for Python 3.11, and the two tools the architecture document names but the repo does not yet pin (Planetiler and libvips) are both available on arm64. One pinned image fails: the trails lab database, pgrouting/pgrouting:17-3.5-3.7, is published for linux/amd64 only, and so is its parent postgis/postgis.

Broke: CARTA_CLOUD_ARCHITECTURE.md was not in the repository / The document was written outside the repo and lives in Downloads on this machine / Read it from there. It should be checked in under docs/ so the next twenty tasks that cite it can find it; noted below as open; Docker Desktop was not running, so docker manifest inspect and an emulated pull wer...

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T006-arm64-coverage-audit.md"`

### T007 Image corpus count (2026-09-22)

Nothing in the product changed. This was a measurement task, and what it produced is a number with a defensible definition behind it, which the earlier estimates did not have. The answer is 179,683 unique original files attached to Carta rows across every cache, of which 175,403 are raster images that a transcode pipeline would actually process. Adding the 3,983 files the published wire serves that no cache accounts for, the corpus a migration has to carry is 179,386 originals, which at five derivatives each is 896,930 derivative objects and 1,076,316 objects in R2 once the originals are stored beside them. Round it to 180,000 originals and 1.08 million objects.

Broke: Script crashed on mountains / Body list selected as the first list value; mountains carries seed_missing, a list of strings, before peaks / Select the body by an explicit per-layer key; Crash on activities and wikidata_poi / Some destination keys map to null rather than an empty list / Guard before iterating; Console crash printing file names / cp1...

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T007-image-corpus-count.md"`

### T008 AVIF size measurement (2026-09-22)

Nothing in the product changed. This was a measurement task, and what it produced is a measured replacement for five numbers that were assumptions. The 15/45/150 KB AVIF ladder and the 20/60 KB WebP fallback in `CARTA_CLOUD_ARCHITECTURE.md` section 4.2 are defaults for landscape photography, and the storage and bandwidth tables in section 4.4 are derived from them arithmetically: 10.0 GB at 50,000 images is exactly 50,000 times the 200 KB the three AVIF rungs sum to. Nobody had encoded a Carta photograph. 199 real originals drawn at random from the layer caches now have been, at cq-level 32 with libvips. Every rung comes in under its planned size.

Broke: vipsthumbnail exited 0 and wrote nothing / Native Windows binary handed a POSIX path from the bash tool / Pass Windows paths; the Python encoder resolves both sides before calling; First quality calibration was wrong / Asserted Q=63 was cq-level 32 from a formula applied backwards / Swept Q against the encoder; cq 32 is Q=50; Derivatives 19 per cen...

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T008-avif-size-measurement.md"`

### T009: Count files in continent-app/public against the 20,000 Pages ceiling (2026-09-22)

Audit completed of file counts in continent-app/public across all data layers. Current total is 52,089 files, already 2.6× the Cloudflare Pages 20,000 file ceiling. The distribution is heavily skewed: cycling (17,048 files) and trails (17,716 files) together account for 67% of all files, followed by dossier (3,869) and poi (3,865). The reach directory currently holds only 2 origin files. If destination count grows to 25,000 (currently ~3,800), and layers scale linearly, the total could reach approximately 340,000 files, making immediate offload to R2 essential rather than optional.

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T009-pages-file-count.md"`

### Task T010: Storable-copy licence audit (2026-09-22)

Every source in docs/tos/data_licenses.md has been evaluated for storable-copy compliance. The ledger documents 31 distinct external data sources across 13 sections (flights, fares, national timetables, rails/aviation/maritime, destination content layers, runtime services, trails lab, features, composed trips, region spines, cycling, dossiers, and curated trips). The audit found no new storable-copy violations requiring remediation before T026 (image ladder build). One source requires ongoing verification: Open-Meteo's free tier permits non-commercial use only, which blocks self-hosting if Carta monetises the product.

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T010-storable-copy-licence-audit.md"`

### T011 Performance and cost baseline (2026-09-23)

Nothing in the product changed. This task recorded the "before" half of the measurement that `CARTA_CLOUD_ARCHITECTURE.md` section 8 step 5 asks for, so that the image ladder and the wire split can later be shown to have worked rather than assumed to have. The measurable half is done and is in the tables below. Three pages were profiled on desktop and on a simulated mid-range phone, the boot payload was weighed byte by byte in raw, gzip and brotli, and the wire was counted file by file. The most useful single result is not a number but a fact about where the numbers come from: the LCP element is a photograph on all six page-and-device combinations measured.

Broke: First `du -sb` over `dist/` never returned / 52,134 small files on NTFS; `du` stats each one through the POSIX translation layer / Measured with PowerShell `Get-ChildItem -Recurse -File` instead; let the `du` run finish in the background and used it only as an independent cross-check; PowerShell format string threw on the totals line / Dutch locale...

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T011-performance-and-cost-baseline.md"`

### T300: fact-check every report, consolidate the open items, table the next waves (2026-10-02)

Every execution report from T001 to T294 (150 reports) was checked against the repository by nine read-only agents. Each report's concrete claims were tested: that the files and functions it names exist, that the commits it cites exist and touch the files it says, that the work is merged, that one to three of its figures re-derive from the data, and that its open items are in the register with the right status. The result is 97 verified, 39 with minor inaccuracies, 3 superseded by a later owner decision, 3 that depend on live systems only, and 8 with a material discrepancy. The eight are listed below with what was wrong.

Broke: Report / What is false / Consequence and row; T010 / It says it wrote storable and not-storable verdicts into `docs/tos/data_licenses.md`. Commit 7884984b0 adds only the report; the ledger was not touched. / The storable-copy verdicts exist only in the report.

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T300-factcheck-and-open-consolidation.md"`

### T369: the impeccable skill and the design waves V1 to V6 (2026-10-07)

The owner asked for an overnight design pass over every page, button and visual setting of the app, led by the impeccable skill, keeping the colour scheme and styling but making Carta more modern, visual, professional and dynamic, with how travellers plan a trip as the first priority, and a deploy at the end. This task adds the tools and the plan for that pass. It changes no app code. The impeccable skill (v4.3.1, the copy in riga-hackathon/.agents/skills/impeccable) now sits beside carta-design in .claude/skills/impeccable. The riga-autopilot-demo copy is the same skill without the Windows engine binary, so the hackathon copy was the one to take.

Broke: The first regeneration wiped the wave log for waves 6 to 16c, which is how waves_md.py always behaved; the file was restored from git and the generator now carries the log over. A patch applied through a Bash heredoc lost its backslashes (the known heredoc trap) and matched nothing; it was rerun from a script file.

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T369-impeccable-design-waves.md"`

### T414: the design waves check the phone first, on emulated devices (2026-10-07)

The owner asked whether the design waves V1 to V6 (T369) consider the mobile view, and then asked for a stricter rule. Before this task every session looked at a desktop browser narrowed to 380 px: no touch, no device pixel ratio, no Safari engine, and nothing about landscape, the on-screen keyboard, safe areas or a collapsing address bar. Now every one of the 43 session prompts carries a "Phone first" block in the shared design wave rules, and each session checks three emulated devices with Playwright's device descriptors: an iPhone 13 in WebKit (the Safari engine), a Pixel 5 in Chromium plus a 360 by 740 small-Android pass, and a 1280 by 800 desktop.

Full: `git show archive/execution-full-2026-11-03:"Execution/P0/T414-design-waves-phone-first.md"`
