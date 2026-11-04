"""Which model a task should run on, read from the master mind map with xmindparser.

Each task note in additional docs/Carta/Carta-Master-Plan.xmind carries a line
"MODEL  Claude <name>". This maps it to the Agent tool's model names:
Haiku 4.5 -> haiku, Sonnet 5 -> sonnet, Opus 5 -> opus, Fable 5.1 -> fable.
Tasks are looked up by their _ORDER.md number (the map numbers differ; the title
match is shared with xmind_prompt.py). D-sessions T265-T271 have no map note and
use the fixed choices in D_MODELS.

    pip install xmindparser
    python Execution/_queue/task_model.py T078 T084 T265
"""
import re
import sys
from pathlib import Path

from xmindparser import xmind_to_dict

sys.path.insert(0, str(Path(__file__).resolve().parent))
import xmind_prompt  # noqa: E402

MODEL_LINE = re.compile(r"^MODEL\s+Claude\s+(Haiku|Sonnet|Opus|Fable)\b", re.M)
D_MODELS = {
    "T265": "opus",    # D1: money, quota and a migration
    "T266": "sonnet",  # D3: harness repairs
    "T267": "sonnet",  # D6: frozen fares and housekeeping
    "T268": "opus",    # D2a: admin database side, security RPCs, migration 045
    "T269": "opus",    # D5a: derive.py, licence-bearing photo pipeline
    "T270": "sonnet",  # D2b: admin UI follow-ups
    "T271": "opus",    # D4: first paint and Core Web Vitals
    "T273": "opus",    # row T272-a: remove the frozen flight estimates (cost engine, several screens)
    "T274": "opus",    # row T083-a: migration 046, the co-planner invite fix (security)
    "T276": "sonnet",  # row T214-b: remove the Travelpayouts script and its CSP hosts
    "T277": "sonnet",  # row T273-a: PRODUCT.md and ESTIMATION.md catch up with the decisions
    "T278": "opus",    # row T273-d: typed-fare airport transfers and the frozen carrier text (cost engine)
    "T279": "sonnet",  # row T266-b: verify_fare_provenance rewritten for no flight prices
    "T280": "opus",    # row T269-f: the trails export applies the credit gate (licensing)
    "T281": "sonnet",  # wave 6: harness repairs, round two (W5-a first)
    "T282": "sonnet",  # wave 6: app hygiene (lint to error, modal focus, dead BagCheck)
    "T283": "opus",    # row T192-d: the planner's exhaustive-deps disable audit (stale-state bugs)
    "T284": "opus",    # wave 6: migration 047, edge_errors, feedback kinds, admin_adjust_expiry (security)
    "T285": "sonnet",  # wave 6: the docs catch up with figures and decisions
    "T286": "opus",    # wave 6: one climb and one difficulty, pipeline and app
    "T287": "sonnet",  # row T087-b: the shared MonthStrip on the layer pages
}


def map_notes():
    """{map title: note} for every task topic, via xmindparser."""
    sheets = xmind_to_dict(str(xmind_prompt.XMIND))
    out = {}

    def walk(topic):
        title = (topic.get("title") or "").replace("\n", " ")
        m = xmind_prompt.MAP_TITLE.match(title)
        if m:
            out[m.group(2)] = topic.get("note") or ""
        for child in topic.get("topics", []) or []:
            walk(child)

    walk(sheets[0]["topic"])
    return out


def model_for(task_id, rows=None, topics=None, notes=None):
    if task_id in D_MODELS:
        return D_MODELS[task_id]
    rows = rows or xmind_prompt.order_rows()
    topics = topics or xmind_prompt.map_topics()
    notes = notes or map_notes()
    _, topic, score = xmind_prompt.find(task_id, rows, topics)
    if score < 0.85:
        raise SystemExit(f"{task_id}: no confident mind-map match")
    m = MODEL_LINE.search(notes.get(topic["title"], ""))
    if not m:
        raise SystemExit(f"{task_id}: the map note has no MODEL line")
    return m.group(1).lower()


def main(argv):
    if not argv:
        raise SystemExit(__doc__)
    rows, topics, notes = xmind_prompt.order_rows(), xmind_prompt.map_topics(), map_notes()
    for t in argv:
        print(t.upper(), model_for(t.upper(), rows, topics, notes))


if __name__ == "__main__":
    main(sys.argv[1:])
