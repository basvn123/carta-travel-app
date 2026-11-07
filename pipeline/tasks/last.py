"""The two tasks that stay last: photo_sources (reads every export) and the trailslab worker.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""
import subprocess

from pipeline.tasks._base import LOGS, PY, ROOT, run_cmd, trailslab_home

TASKS = [
    {
        "key": "photo_sources",
        # T269-b. Last in the table on purpose: it reads the wires the layer
        # exports above have just written, so it must follow every one of them.
        # ("key" stays the first line: registry.pipeline_tasks reads the
        # table by that shape.)
        "title": "Photo ladder: published-first source lists -> "
                 "img/manifest/_sources on R2",
        "cadence": "after",
        "after": ["beaches", "lakes", "mountains", "trails_rate",
                  "cycling_publish", "regions"],
        "writes_app_data": False,
        "soft": True,
        "cmds": [[PY, "pipeline/photos/derive.py", "sources",
                  "beaches", "lakes", "mountains", "trails", "cycling", "region",
                  "--out", str(LOGS / "img_sources"),
                  "--upload", "auto", "--allow-missing"]],
        "note": ("derive.py's published list per layer, hero first. The image "
                 "job copies img/manifest/ as --prior, so a list pushed here is "
                 "what makes its next run derive the published photographs "
                 "before the cache's long tail (T049-f); a list never re-pushed "
                 "goes stale with every export. --upload auto copies to R2 only "
                 "where the RCLONE_CONFIG_R2_* remote is set (the box), and "
                 "otherwise leaves the files under logs/img_sources, which is "
                 "gitignored. The six layers T269 measured; dossier, poi, dest, "
                 "trips and journeys wait on T269-g. Under load trails took "
                 "798 s, cycling 708 s and region 285 s."),
    },
    # ---- T647: the trails lab on an on-demand worker (owner decision D5) ---- #
    {
        "key": "trailslab_worker",
        "title": "Trails lab on an on-demand x86 worker: way tags, transit stops, "
                 "trails + cycling export behind their gates, dump back to R2",
        # Weekly on purpose, with the real interval inside the script: it spawns
        # only when the last good run is 28 days old, and otherwise keeps the
        # newest dump from expiring (archive/db/ lives 30 days, and "monthly"
        # here means every fifth Monday, 35 days).
        "cadence": "weekly",
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        # The guard and the probe are looked up when called, so they can live
        # below the table next to the rest of this hunk.
        "guard": lambda ctx: _trailslab_worker_guard(ctx),
        "dry_run": lambda ctx: _trailslab_worker_dry(ctx),
        "cmds": [[PY, "infra/hetzner/cax41/trailslab_worker.py", "run"]],
        "note": ("infra/hetzner/cax41/trailslab_worker.py: spawn.sh trailslab "
                 "(CPX42, about 5 h, ceiling 10 h, about EUR 0.65 at the "
                 "planning rate), then the wires that passed gate.py and "
                 "difficulty_gate.py on the worker AND again here against this "
                 "box's wire go into continent-app/public/trails and /cycling, "
                 "so this run's ship publishes them, and the fresh dump moves "
                 "to archive/db/trailslab/. Skips with the reason unless "
                 "CARTA_TRAILSLAB_WORKER=1, HCLOUD_TOKEN, R2 and the worker key "
                 "are all in place. The trails_* tasks above still skip here "
                 "(no lab on this box). Owner steps: "
                 "Execution/P15/_OPEN-explore-data-runs.md, T647."),
    },
]



def _trailslab_worker_guard(ctx=None):
    """T647: (ok, reason) from trailslab_worker.py check, which exits 3 with
    the reason when a prerequisite is missing (the switch, HCLOUD_TOKEN, R2,
    the worker key, bash on a Windows laptop).

    T1182 (D24): with the lab on this box (CARTA_TRAILSLAB_HOME=box) the
    worker stands down. It would restore the newest R2 dump, which misses the
    reviews made on the box since its last push, and its fresh dump would then
    hide them from the next restore. The box runs the trails_* tasks itself."""
    if trailslab_home() == "box":
        return False, ("the trails lab lives on this box (CARTA_TRAILSLAB_HOME=box): "
                       "the trails_* tasks run here; the worker stands down")
    try:
        r = subprocess.run([PY, str(ROOT / "infra/hetzner/cax41/trailslab_worker.py"), "check"],
                           cwd=str(ROOT), capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        return False, f"trailslab_worker.py check did not run ({type(e).__name__})"
    reason = (r.stdout.strip().splitlines() or [""])[-1]
    return r.returncode == 0, reason or f"trailslab_worker.py check exited {r.returncode}"


def _trailslab_worker_dry(ctx=None):
    """T647: every command a real run would issue, spawn.sh --dry-run included."""
    return run_cmd([PY, "infra/hetzner/cax41/trailslab_worker.py", "run", "--dry-run"]) == 0

