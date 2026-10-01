# T260: _truncate_lc.py no longer truncates on import

## Task ID

T260

## Date

2026-10-01

## What changed

`pipeline/cycling/_truncate_lc.py` ran its whole body at module level: an
import, a `python -c "import ..."`, a test collector or a linter that imports
modules would connect to the trailslab lab and run `TRUNCATE TABLE
cycle_landcover`. T028 found it, the one script in the tree that could lose
data just by being imported. The body now sits in `main()` behind an
`if __name__ == "__main__"` guard, and `main()` truncates only when given
`--yes`; without it the script prints what it would do and exits 0. The
`cycle_sources` import moved inside `main()` too, so importing the file opens
no connection and loads nothing from the lab code. The path to `cycle_sources`
is now taken from the file's own directory rather than the relative
`pipeline/cycling`, so the script works from any working directory, not only
the repo root. The file gained the docstring it lacked, and its row in
`pipeline/README.md` gives the new command.

This is stage 4, item 1, of `Execution/_OPEN-MASTER.md`: the first of the
fixes that come before the pipeline runs unattended on the CAX11.

## Files touched

**Modified:**
- pipeline/cycling/_truncate_lc.py
- pipeline/README.md (the script's row)

**Created:**
- Execution/P1/T260-truncate-lc-guard.md

## Commands run

```
# import the file as a module: nothing may run
python - <<'EOF'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("t", "pipeline/cycling/_truncate_lc.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print("imported; cycle_sources loaded:", "cycle_sources" in sys.modules)
EOF
# -> imported; cycle_sources loaded: False

python pipeline/cycling/_truncate_lc.py          # prints the plan, rc 0, touches nothing
cd /tmp && python <repo>/pipeline/cycling/_truncate_lc.py --help   # works outside the repo root
# the new import path resolves cycle_sources.lab_connect from /tmp: True
```

`--yes` was not run: it would empty the lab's table, and nothing in this task
needs that.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

No issues.

## What is still open

None. Anyone who ran the script by hand must now add `--yes`; no scheduled
task, wrapper or document other than `pipeline/README.md` calls it
(`grep -rn _truncate_lc` over pipeline, tools, docs and infra).

## Rollback procedure

```
git revert <this task's commit>
```

The old file comes back exactly, including its truncate-on-import behaviour.
No data or schema was touched.
