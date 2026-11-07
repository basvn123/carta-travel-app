"""The task table as source, for the readers that never import it (T1207).

The doc generators (scripts/docs/build_lineage.py, reference_sql_tasks.py),
the licence registry (src/ingestion/core/registry.py) and some tests read the
table with `ast` or a regex, because importing run_pipeline.py sets up a run.
Since A2 the table is split over pipeline/tasks/<domain>.py; these helpers give
them one view of it again, in run order. Standard library only, and no import
of the task modules: load this file by path (`load(root)` below shows how).
"""
import ast
import importlib.util
import warnings
from pathlib import Path

HERE = Path(__file__).parent


def load(root):
    """This module, loaded by path from a repo root (no sys.path needed)."""
    path = Path(root) / "pipeline" / "tasks" / "source.py"
    spec = importlib.util.spec_from_file_location("carta_task_source", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def domains(root=None):
    """DOMAINS from pipeline/tasks/__init__.py, read with ast."""
    base = Path(root) / "pipeline" / "tasks" if root else HERE
    tree = ast.parse((base / "__init__.py").read_text(encoding="utf-8"))
    for n in tree.body:
        if isinstance(n, ast.Assign) and any(getattr(t, "id", None) == "DOMAINS" for t in n.targets):
            return list(ast.literal_eval(n.value))
    raise SystemExit("pipeline/tasks/__init__.py: no DOMAINS")


def task_files(root=None):
    """The shared helpers first, then every domain module in run order."""
    base = Path(root) / "pipeline" / "tasks" if root else HERE
    return [base / "_base.py"] + [base / f"{d}.py" for d in domains(root)]


def task_text(root=None):
    """Every task file's text, joined in run order (for regex readers)."""
    return "\n".join(p.read_text(encoding="utf-8") for p in task_files(root))


def task_tree(root=None):
    """One ast.Module that reads like the old single file: every statement of
    _base and the domain modules, with the per-module `TASKS` lists replaced by
    one `TASKS = [...]` holding all their entries in run order."""
    body, elts = [], []
    for p in task_files(root):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            tree = ast.parse(p.read_text(encoding="utf-8"))
        for n in tree.body:
            if isinstance(n, ast.Assign) and any(getattr(t, "id", None) == "TASKS" for t in n.targets):
                elts.extend(n.value.elts)
            else:
                body.append(n)
    tasks = ast.Assign(targets=[ast.Name(id="TASKS", ctx=ast.Store())],
                       value=ast.List(elts=elts, ctx=ast.Load()), lineno=0)
    return ast.Module(body=body + [tasks], type_ignores=[])
