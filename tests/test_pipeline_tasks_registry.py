"""The task registry split (ROADMAP A2, T1207): run_pipeline.py keeps the CLI
and the runner, the task table lives in pipeline/tasks/<domain>.py.

The split changed no behaviour, and these tests hold that:
  * the table run_pipeline.py runs (keys, order, every field, the names of the
    step, guard and probe functions, the names a lambda calls) equals the
    snapshot in tests/fixtures/pipeline_tasks.json, taken from the single-file
    table before the split;
  * photo_sources and trailslab_worker stay last;
  * the ast view the doc generators and the licence registry read
    (pipeline/tasks/source.py) lists the same tasks in the same order.

Adding or changing a task changes the snapshot on purpose. Refresh it with
`python tests/test_pipeline_tasks_registry.py --write` and commit it with the
task, so the diff of the JSON shows exactly what the change does to the plan.
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "tests" / "fixtures" / "pipeline_tasks.json"
sys.path.insert(0, str(ROOT))

import run_pipeline as rp  # noqa: E402
from pipeline.tasks import DOMAINS, registry  # noqa: E402
from pipeline.tasks import source as task_source  # noqa: E402


def _norm(v):
    """A machine-independent view of a task value."""
    if callable(v):
        code = getattr(v, "__code__", None)
        if v.__name__ == "<lambda>" and code is not None:
            return f"<lambda calls {', '.join(code.co_names)}>"
        return f"<fn {v.__name__}>"
    if isinstance(v, (list, tuple)):
        return [_norm(x) for x in v]
    if isinstance(v, dict):
        return {k: _norm(x) for k, x in v.items()}
    if isinstance(v, str):
        if v == rp.PY:
            return "<PY>"
        return v.replace(str(rp.ROOT), "<ROOT>")
    if isinstance(v, os.PathLike):
        return "<path " + str(v).replace(str(rp.ROOT), "<ROOT>").replace("\\", "/") + ">"
    return v


def snapshot():
    return {"count": len(rp.TASKS), "aliases": rp.TASK_ALIASES,
            "tasks": [{k: _norm(v) for k, v in t.items()} for t in rp.TASKS]}


def test_table_matches_the_snapshot():
    want = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    got = json.loads(json.dumps(snapshot()))
    assert [t["key"] for t in got["tasks"]] == [t["key"] for t in want["tasks"]], \
        "task keys or order changed; refresh the snapshot if that is intended"
    for g, w in zip(got["tasks"], want["tasks"]):
        assert g == w, f"task {g['key']} changed; refresh the snapshot if that is intended"
    assert got == want


def test_runner_reads_the_registry():
    assert rp.TASKS is registry.TASKS
    assert len({t["key"] for t in rp.TASKS}) == len(rp.TASKS)
    assert [m.__name__.rsplit(".", 1)[1] for m in registry.MODULES] == list(DOMAINS)


def test_photo_sources_and_the_worker_stay_last():
    assert DOMAINS[-1] == "last"
    assert [t["key"] for t in rp.TASKS][-2:] == ["photo_sources", "trailslab_worker"]
    assert [t["key"] for t in registry.MODULES[-1].TASKS] == ["photo_sources", "trailslab_worker"]


def test_every_task_module_is_registered():
    helpers = {"__init__", "_base", "registry", "source"}
    on_disk = {p.stem for p in (ROOT / "pipeline" / "tasks").glob("*.py")}
    assert on_disk - helpers == set(DOMAINS)


def test_the_ast_view_agrees_with_the_import():
    tree = task_source.task_tree(ROOT)
    node = tree.body[-1]
    keys = []
    for el in node.value.elts:
        for k, v in zip(el.keys, el.values):
            if getattr(k, "value", None) == "key":
                keys.append(v.value)
    assert keys == [t["key"] for t in rp.TASKS]
    assert task_source.domains(ROOT) == list(DOMAINS)
    text = task_source.task_text(ROOT)
    assert all(f'"key": "{t["key"]}",' in text for t in rp.TASKS)


if __name__ == "__main__" and "--write" in sys.argv:
    SNAPSHOT.write_text(json.dumps(snapshot(), indent=1) + "\n", encoding="utf-8")
    print(f"wrote {SNAPSHOT.relative_to(ROOT)} ({len(rp.TASKS)} tasks)")
