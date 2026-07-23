"""One-off driver, 2026-07-22 evening: finish the landmark/description/image
campaign without fighting the fare + activities harvests another session has
running.

Waits until no other pipeline python (harvest/run_pipeline/enrich/backfill)
is running, stable across two checks, then:

  1. backfill_landmarks.py apply      (re-appends famous sights if the
                                       activities patch rebuilt items_full)
  2. enrich_must_descs.py apply       (re-applies the cached rich cards)
  3. enrich_must_descs.py broad       (fetches the remaining ~25k cards)
  4. run_pipeline.py --only poi_images --force --ship none   (image mop-up)
  5. backfill/desc apply once more    (belt and braces after the long fetches)
  6. node scripts/sync-data.mjs       (ship the wire files)

Everything is idempotent and cache-resumable: if this driver dies, run it
again and it continues. Log: pipeline/logs/followup_20260722.log (the launcher
redirects stdout there). ASCII-clean per project convention.
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.chdir(ROOT)
PY = sys.executable

NODE_DIR = r"C:\Program Files\nodejs"


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def other_pipeline_pythons():
    out = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | "
         "ForEach-Object { \"$($_.ProcessId)|$($_.CommandLine)\" }"],
        capture_output=True, text=True).stdout or ""
    me = str(os.getpid())
    procs = []
    for line in out.splitlines():
        if "|" not in line:
            continue
        pid, cmd = line.split("|", 1)
        if pid.strip() == me:
            continue
        low = (cmd or "").lower()
        if any(k in low for k in ("harvest", "run_pipeline", "enrich", "backfill")):
            procs.append((pid.strip(), cmd.strip()[:90]))
    return procs


def run(label, args, cwd=None, env=None):
    log(f"START {label}: {' '.join(args)}")
    r = subprocess.run(args, cwd=cwd or ROOT, env=env)
    log(f"DONE  {label} (rc={r.returncode})")
    return r.returncode


def atomium_check():
    try:
        data = json.loads((ROOT / "app_data" / "app_data.json").read_text(encoding="utf-8"))
        items = data["destinations"]["BRU"]["activities"]["items_full"]
        hit = any((it.get("name") or "").lower() == "atomium" for it in items)
        log(f"Atomium in master: {hit} (BRU items: {len(items)})")
        return hit
    except Exception as e:
        log(f"Atomium check failed: {e}")
        return False


def main():
    log("waiting for other pipeline pythons to finish...")
    clear_checks = 0
    while clear_checks < 2:
        procs = other_pipeline_pythons()
        if procs:
            clear_checks = 0
            log("still running: " + "; ".join(f"{p[0]}: {p[1]}" for p in procs))
            time.sleep(180)
        else:
            clear_checks += 1
            log(f"no pipeline pythons ({clear_checks}/2 clear checks)")
            if clear_checks < 2:
                time.sleep(180)

    run("landmarks apply", [PY, "-u", "-X", "utf8", "pipeline/backfill_landmarks.py", "apply"])
    run("descs apply", [PY, "-u", "-X", "utf8", "pipeline/enrich_must_descs.py", "apply"])
    atomium_check()

    run("descs broad (long)", [PY, "-u", "-X", "utf8", "pipeline/enrich_must_descs.py", "broad"])
    run("poi_images mop-up (long)",
        [PY, "-u", "-X", "utf8", "run_pipeline.py", "--only", "poi_images", "--force", "--ship", "none"])

    # The long fetches and any late writer may have raced; re-apply is cheap.
    run("landmarks re-apply", [PY, "-u", "-X", "utf8", "pipeline/backfill_landmarks.py", "apply"])
    run("descs re-apply", [PY, "-u", "-X", "utf8", "pipeline/enrich_must_descs.py", "apply"])
    atomium_check()

    env = dict(os.environ)
    env["PATH"] = NODE_DIR + os.pathsep + env.get("PATH", "")
    node = os.path.join(NODE_DIR, "node.exe")
    run("sync-data ship", [node, "scripts/sync-data.mjs"], cwd=ROOT / "continent-app", env=env)
    log("ALL DONE. Review `git status` and commit the refreshed data when happy.")


if __name__ == "__main__":
    main()
