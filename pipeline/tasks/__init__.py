"""The pipeline task registry (ROADMAP A2, T1207).

run_pipeline.py keeps the CLI, the planner and the runner; the task table is
split by domain into the modules named below. The plan runs tasks in list
order, so DOMAINS is run order: every task of a module runs before the next
module's. `last` holds photo_sources and trailslab_worker and stays last.

This file is a pure literal on purpose: the doc generators, the licence
registry and the tests read the table with `ast` and never import it
(pipeline/tasks/source.py). The runtime table is pipeline/tasks/registry.py.
"""

DOMAINS = (
    "catalogue",
    "outdoor",
    "prices",
    "trails",
    "cycling",
    "backfill",
    "images",
    "destinfo",
    "pois",
    "explore_fill",
    "content",
    "search",
    "ops",
    "last",
)
