# T006: arm64 coverage audit

## Task ID

T006

## Date

2026-09-22

## What changed

Nothing in the code or data. This is an audit. Every container and native
dependency the pipeline pins was checked for a working linux/arm64 build,
against the registries and PyPI directly, and the result is the table below.

The short version: the ARM plan holds. Two of the three pinned images are
multi-arch, every compiled Python wheel the pipeline installs has a Linux
aarch64 build for Python 3.11, and the two tools the architecture document
names but the repo does not yet pin (Planetiler and libvips) are both
available on arm64. One pinned image fails: the trails lab database,
pgrouting/pgrouting:17-3.5-3.7, is published for linux/amd64 only, and so is
its parent postgis/postgis. That is one x86-only task, which the document
says is survivable, and it does not even need a CX box: a multi-arch image
that bundles the same two extensions exists and is a one-line change to the
compose file. So the count of tasks that would have to stay on x86 is zero,
and the CAX31 / CAX41 cost model in section 7 stands as written.

Where the document's list of things to check came from, and what it left
out. Section 6.1 names Valhalla, Planetiler, PyTorch/OpenCLIP and libvips.
Of those, only Valhalla and torch/OpenCLIP are actually pinned today. The
repo pins nothing for Planetiler because section 5.4 leaves the basemap on
CARTO and only mentions a Planetiler build as a later option, and nothing for
libvips because the derive.py stage in section 4.2 is not written yet. Both
are recorded here so T024 does not have to re-check them when those stages
land. The document's list also misses the two containers the pipeline runs
most: the PostGIS + pgRouting lab and the BRouter router. Those are the
ones checked most carefully below.

## Files touched

**Created:**
- Execution/P0/T006-arm64-coverage-audit.md

No code, compose file or dependency pin was changed. The compose change the
audit recommends belongs to T024.

## The audit method

Docker Desktop was not running on this machine and no arm64 hardware is to
hand, so nothing was pulled or executed under emulation. Instead the audit
asks each registry the question the runtime would ask: fetch the manifest
for the exact pinned tag with the OCI index and Docker manifest-list media
types accepted, and read the platform list. A multi-arch tag returns an
index listing linux/amd64 and linux/arm64; a single-arch tag returns one
manifest, and its config blob names the architecture. That is the same
lookup a `docker pull --platform linux/arm64` does before it downloads
anything, so a tag that fails here fails on the box, and a tag that passes
here downloads and runs. The digests were recorded so a later reader can
tell whether a floating tag has moved.

For Python, the check is whether PyPI holds a manylinux or musllinux
aarch64 wheel for the exact version installed here and for CPython 3.11,
which is what this box runs and what T024 should install on the CAX box.
Pure-Python packages pass by construction. A package with an sdist but no
aarch64 wheel is a compile-on-install risk and is called out.

The probe script lives in this session's scratch directory, not the repo,
because it is a one-off. It is short enough to rewrite from the description
above: anonymous token from auth.docker.io or ghcr.io/token, then GET
/v2/{repo}/manifests/{tag}, then for PyPI GET /pypi/{pkg}/{version}/json
and filter the filenames for aarch64.

## The table

Pinned containers. The tag is what the repo pins; the digest is what that
tag resolved to on 2026-09-22.

| Where pinned | Image and tag | Platforms published | arm64 | Fallback if needed |
|---|---|---|---|---|
| tools/trailslab/docker-compose.yml | pgrouting/pgrouting:17-3.5-3.7 (sha256:5e6767ab) | linux/amd64 only | FAIL | imresamu/postgis:17-3.5-bundle0-bookworm (sha256:a8ea1a9b), amd64 + arm64/v8, bundles PostGIS 3.5 and pgRouting; see below |
| tools/trailslab/valhalla/docker-compose.yml | ghcr.io/valhalla/valhalla-scripted:latest (sha256:f9f12c3f) | linux/amd64, linux/arm64 | pass | none needed; the upstream workflow builds arm64 on ubuntu-24.04-arm runners, so this is deliberate, not incidental |
| tools/brouter/Dockerfile | eclipse-temurin:17-jre (sha256:bd25c617), BRouter 1.7.10 jar on top | linux/amd64, arm/v7, arm64/v8, ppc64le, s390x | pass | none needed; BRouter is pure Java and the image is built locally from the release zip, so a `docker compose build` on the ARM box produces an arm64 image without any change |

Tools the architecture document names but the repo does not pin yet.

| Named in | Tool | What was checked | arm64 | Note |
|---|---|---|---|---|
| section 5.4, section 6.2 | Planetiler | ghcr.io/onthegomap/planetiler:latest (sha256:00188a52); release v0.10.2 is a single planetiler.jar | pass | image is amd64 + arm64; the jar is architecture-neutral and runs on the same Temurin base BRouter uses |
| section 4.2, section 8 step 4 | libvips | Debian bookworm libvips-dev 8.14.1-3+deb12u3 for arm64; pyvips 3.0.0 on PyPI | pass, with a caveat | pyvips ships as sdist only and binds the system library through cffi at import, so the CAX image must apt install libvips-dev before pip install pyvips. If T024 prefers a wheel-only install, pillow-avif-plugin 1.5.2 has cp311 aarch64 wheels and Pillow 10.4.0 is already installed; libvips is still the better choice for the 3 AVIF + 2 WebP ladder because of its streaming memory model |

The Python stack. Every version is the one installed on this box today;
the wheel column is the aarch64 file PyPI serves for CPython 3.11.

| Package | Version | Linux aarch64 wheel for cp311 | arm64 |
|---|---|---|---|
| torch | 2.13.0 | manylinux_2_28_aarch64 | pass |
| torchvision | 0.28.0 | manylinux_2_28_aarch64 | pass |
| open_clip_torch | 3.3.0 | pure Python | pass |
| timm | 1.0.29 | pure Python | pass |
| safetensors | 0.8.0 | abi3 manylinux2014_aarch64 | pass |
| pillow | 10.4.0 | manylinux_2_28_aarch64 | pass |
| numpy | 1.26.4 | manylinux2014_aarch64 | pass |
| scipy | 1.14.1 | manylinux2014_aarch64 | pass |
| pandas | 2.2.3 | manylinux2014_aarch64 | pass |
| scikit-learn | 1.6.1 | manylinux2014_aarch64 | pass |
| lightgbm | 4.6.0 | py3-none-manylinux2014_aarch64 | pass |
| xgboost | 2.1.4 | py3-none-manylinux_2_28_aarch64 | pass |
| osmium (pyosmium) | 4.3.1 | manylinux_2_28_aarch64 | pass |
| rasterio | 1.4.4 | manylinux_2_28_aarch64 | pass |
| shapely | 2.0.6 | manylinux2014_aarch64 | pass |
| pyproj | 3.7.0 | manylinux2014_aarch64 | pass |
| pyogrio | 0.10.0 | manylinux_2_28_aarch64 | pass |
| geopandas | 1.0.1 | pure Python | pass |
| h3 | 4.5.0 | manylinux_2_28_aarch64 | pass |
| psycopg-binary | 3.3.4 | manylinux_2_28_aarch64 | pass |
| psycopg2-binary | 2.9.11 | manylinux2014_aarch64 | pass |
| lxml | 4.9.4 | manylinux_2_28_aarch64 | pass |

Other native things the pipeline and ops reach for, checked while the
registries were open.

| Dependency | Used by | arm64 | Note |
|---|---|---|---|
| Supabase CLI | ops/backup_supabase.sh, ops/restore_supabase.sh | pass | release v2.117.0 ships supabase_linux_arm64.tar.gz and a .deb |
| PostgreSQL 17 client tools, gpg | ops/backup_supabase.sh | pass | standard Debian arm64 packages |
| Playwright 1.61 with Chromium | continent-app verify_*.mjs harnesses | pass | Playwright's system requirements list Debian 12/13 and Ubuntu 22.04 to 26.04 on x86-64 or arm64; the harnesses are dev-time checks, not pipeline stages |
| Node 24, Vite 8, maplibre-gl | continent-app build | pass | pure JavaScript; nothing in package.json carries a native addon |

## Why the one failure does not cost a CX box

The trails lab needs exactly two extensions. The lab's initdb script
creates postgis and pgrouting and nothing else, and the pipeline's only
call into pgRouting is the version check in smoke_test.py; the routing work
itself happens in Valhalla and BRouter, not in SQL. So the requirement on
the database image is small: PostgreSQL 17 with PostGIS 3.5 and pgRouting
present.

Three multi-arch images meet it. imresamu/postgis:17-3.5-bundle0-bookworm
is the recommended fallback because it is the official postgis/postgis
Dockerfile lineage built for both architectures, with a bundle0 variant
that adds pgRouting, h3-pg and a few others. kartoza/postgis:17-3.5 and
ghcr.io/baosystems/postgis:17-3.5 also publish arm64 and install
postgresql-17-pgrouting from the PGDG apt repository. If none of those
suits, the PGDG repository itself carries postgresql-17-pgrouting 4.0.1 and
postgresql-17-postgis-3 3.6.4 for bookworm arm64, so a four-line Dockerfile
on top of the multi-arch postgres:17-bookworm image is the fallback to the
fallback.

Two things to know before switching. First, pgRouting in the bundle0 image
may be a newer major version than 3.7; the version check in smoke_test.py
prints it rather than asserting it, so nothing breaks, but the report for
T024 should record the version that came up. Second, imresamu tags are cut
per PostGIS point release and the 17-3.5 line is at 3.5.4 today, so T024
should pin the full tag it tests against rather than the 17-3.5 alias, in
the same spirit as the comment already in the compose file.

## Commands run

Read-only throughout. The registry and PyPI lookups were a Python script in
the session scratch directory, run from the repo root. The equivalent
one-liners, for whoever repeats this:

```
# platform list for a tag, once a bearer token is in TOK
curl -sH "Authorization: Bearer $TOK" -H "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json" https://registry-1.docker.io/v2/pgrouting/pgrouting/manifests/17-3.5-3.7

# wheels PyPI holds for the installed version
curl -s https://pypi.org/pypi/torch/2.13.0/json

# what this box has installed, to know which versions to check
python -m pip list

# the branch, created in a separate worktree because another session was
# committing on the shared checkout at the time
git worktree add "../Travel App.t006" -b p0-arm64-coverage-audit main
```

## Config and secrets set

None. Anonymous registry tokens only, nothing stored.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Pinned container images with a verified arm64 build | 0 of 3 | 2 of 3 | +2 |
| Pinned images that are x86-only | unknown | 1 (pgrouting/pgrouting:17-3.5-3.7) | known |
| x86-only images with a named multi-arch replacement | 0 | 1 of 1 | +1 |
| Pipeline tasks that would have to stay on an x86 box | unknown, budgeted at up to 1 | 0 | recommendation unchanged |
| Compiled Python packages checked for a cp311 aarch64 wheel | 0 | 22 of 22 pass | +22 |
| Tools named in the plan but not yet pinned, verified ahead of time | 0 | 2 (Planetiler, libvips) | +2 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| CARTA_CLOUD_ARCHITECTURE.md was not in the repository | The document was written outside the repo and lives in Downloads on this machine | Read it from there. It should be checked in under docs/ so the next twenty tasks that cite it can find it; noted below as open |
| Docker Desktop was not running, so docker manifest inspect and an emulated pull were unavailable | Daemon off | Queried the registry HTTP API directly, which is what the daemon would have done |
| The repo-wide grep for CAX31 timed out at two minutes | It walked cache/ and data/ | Scoped the search to markdown files |
| The shared working tree was on another session's branch, with that session actively committing | Two Claude sessions on one checkout | Created the task branch in a separate git worktree off main instead of switching branches under the other session |

## What is still open

The audit proves that arm64 builds exist. It does not prove they run
correctly on the pipeline's data, because no arm64 machine was available.
T024 should do three things the first time it has a CAX box: run
smoke_test.py against the replacement database image and record the
pgRouting version it reports; run the photo engine's CLIP embedding on a
handful of files whose embeddings are already cached under
cache/photos/emb and confirm the cosine distance to the cached x86 vectors
is negligible, since the aarch64 torch wheels use a different BLAS path and
the aesthetic head is sensitive to the QuickGELU detail already documented
in aesthetics.py; and build the BRouter image on the box rather than
pulling it, which is how the Dockerfile is designed anyway.

The compose change itself, from pgrouting/pgrouting:17-3.5-3.7 to an
imresamu bundle0 tag, is T024's to make, not this task's, because it
alters what the lab runs on and must be smoke-tested in the same change.

Valhalla is pinned to latest, as the compose file comment explains. This
audit recorded the digest that tag resolved to today; T024 should pin the
digest or a dated tag on the box so a build does not silently move.

Three portability items were noticed in passing and are not architecture
problems, but they will bite T024 on any Linux box regardless of
architecture: run_pipeline.py shells out to pgrep and carries Windows
paths, pipeline/cycling/_landcover_big.sh detects running passes by
calling PowerShell, and tools/trailslab/README.md gives a Windows-only
Docker Desktop path. They belong to the pipeline migration, not here.

CARTA_CLOUD_ARCHITECTURE.md should be committed to the repository. This
task did not do it because the file is outside the declared scope.

## Rollback procedure

There is nothing to roll back. The task changed no code, no data and no
configuration. Deleting this report and the p0-arm64-coverage-audit branch
returns the repository to its prior state:

```
git worktree remove "../Travel App.t006"
git branch -D p0-arm64-coverage-audit
```
