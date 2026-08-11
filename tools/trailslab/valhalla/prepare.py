"""Stage a per-country extract for the local Valhalla and start the build.

Hardlinks the newest cached Geofabrik .osm.pbf (data/raw/geofabrik/, the same
cache pipeline/trails/ingest_osm_routes.py fills) into ./data/<slug>/, which
the docker-compose file mounts as /custom_files. One extract per directory
keeps the graphs strictly per country; nothing here ever builds Europe.

Usage, from the repo root:
    python tools/trailslab/valhalla/prepare.py --country switzerland --up --wait
    python tools/trailslab/valhalla/prepare.py --country norway --up --wait --force-rebuild

--up (re)starts the compose stack over the chosen country's tile directory.
--wait polls the service until the tile build finishes and /route is live.
--force-rebuild makes Valhalla rebuild tiles even though a tile set exists,
which is needed after staging a fresher extract with --refresh.
"""

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
GEOFABRIK_CACHE = ROOT / "data" / "raw" / "geofabrik"
STATUS_URL = "http://localhost:8002/status"

# Same pilot set as the ingest script; extend both together.
KNOWN = ("switzerland", "france", "norway", "austria")


def docker_cmd():
    """Absolute docker path plus an env whose PATH includes its directory.

    Repo gotcha: Docker Desktop lives under %LOCALAPPDATA% on this machine.
    Windows resolves bare subprocess names via the parent's PATH, so the
    executable must be absolute; its dir still goes on the child PATH
    because docker-credential-desktop lives there too and pulls need it.
    """
    env = os.environ.copy()
    exe = shutil.which("docker")
    if exe is None:
        local = os.environ.get("LOCALAPPDATA", "")
        bin_dir = Path(local) / "Programs" / "DockerDesktop" / "resources" / "bin"
        exe = str(bin_dir / "docker.exe")
        if not Path(exe).exists():
            sys.exit("docker not found on PATH nor in the per-user "
                     "Docker Desktop location")
        env["PATH"] = str(bin_dir) + os.pathsep + env["PATH"]
    return exe, env


def cached_extract(slug):
    hits = [p for p in GEOFABRIK_CACHE.glob(f"*/{slug}-latest*.osm.pbf")
            if not p.name.endswith(".part")]
    return max(hits, key=lambda p: p.stat().st_mtime) if hits else None


def stage(slug, refresh):
    src = cached_extract(slug)
    if src is None:
        sys.exit(f"no cached extract for {slug} under {GEOFABRIK_CACHE}; "
                 f"run pipeline/trails/ingest_osm_routes.py --countries {slug} "
                 f"first (it downloads into the cache)")
    dest_dir = HERE / "data" / slug
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{slug}-latest.osm.pbf"
    if dest.exists():
        if not refresh and dest.stat().st_size == src.stat().st_size:
            print(f"[{slug}] staged extract up to date: {dest}")
            return dest
        dest.unlink()
    try:
        os.link(src, dest)   # same NTFS volume: instant, no extra disk
        how = "hardlinked"
    except OSError:
        shutil.copy2(src, dest)
        how = "copied"
    print(f"[{slug}] {how} {src.name} "
          f"({src.stat().st_size / 1e9:.2f} GB) -> {dest}")
    return dest


def compose_up(slug, force_rebuild):
    docker, env = docker_cmd()
    env["VALHALLA_COUNTRY"] = slug
    env["VALHALLA_FORCE_REBUILD"] = "True" if force_rebuild else "False"
    # down first so a country switch remounts /custom_files cleanly.
    subprocess.run([docker, "compose", "down"], cwd=HERE, env=env, check=True)
    subprocess.run([docker, "compose", "up", "-d"], cwd=HERE, env=env,
                   check=True)
    print(f"[{slug}] container starting; tile build runs before the service "
          f"accepts requests")


def wait_ready(slug, minutes):
    import requests
    deadline = time.monotonic() + minutes * 60
    started = time.monotonic()
    last_note = 0.0
    while time.monotonic() < deadline:
        try:
            resp = requests.get(STATUS_URL, timeout=5)
            if resp.ok:
                elapsed = time.monotonic() - started
                print(f"[{slug}] valhalla ready after {elapsed / 60:.1f} min: "
                      f"{resp.json()}")
                return
        except requests.RequestException:
            pass
        if time.monotonic() - last_note > 120:
            print(f"[{slug}] building tiles... "
                  f"({(time.monotonic() - started) / 60:.0f} min)")
            last_note = time.monotonic()
        time.sleep(15)
    sys.exit(f"[{slug}] not ready after {minutes} min; check "
             f"'docker logs trailslab-valhalla'")


def main():
    parser = argparse.ArgumentParser(
        description="Stage a Geofabrik extract for the local Valhalla.")
    parser.add_argument("--country", default="switzerland",
                        help=f"Geofabrik slug (known: {', '.join(KNOWN)})")
    parser.add_argument("--refresh", action="store_true",
                        help="restage even when a same-size extract is staged")
    parser.add_argument("--up", action="store_true",
                        help="(re)start the compose stack for this country")
    parser.add_argument("--wait", action="store_true",
                        help="poll until the service answers /status")
    parser.add_argument("--force-rebuild", action="store_true",
                        help="rebuild tiles even though a tile set exists")
    parser.add_argument("--wait-minutes", type=int, default=90,
                        help="give up waiting after this long (default 90)")
    args = parser.parse_args()

    slug = args.country.strip().lower()
    if slug not in KNOWN:
        print(f"note: {slug} is not in the pilot set "
              f"({', '.join(KNOWN)}); proceeding anyway")
    stage(slug, args.refresh)
    if args.up:
        compose_up(slug, args.force_rebuild)
    if args.wait:
        wait_ready(slug, args.wait_minutes)


if __name__ == "__main__":
    main()
