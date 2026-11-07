"""Search: taxonomy tags, guided search, the Ask Carta index.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""
import os
import subprocess

from pipeline.tasks._base import CONTINENT, PY, ROOT, node_exe


def guard_ask_index(ctx=None):
    """Ask Carta's index (T551) needs model2vec from requirements-ml.txt and
    the wires it reads. Without model2vec the task SKIPS, and the last built
    index stays valid. Since T1161 (H10) the box installs model2vec itself
    (run_pipeline.sh, CARTA_BOX_ML=ask or all), so the index builds there."""
    import importlib.util
    if importlib.util.find_spec("model2vec") is None:
        return False, ("model2vec is not installed (requirements-ml.txt; on the "
                       "box CARTA_BOX_ML=ask or all installs it)")
    if not (CONTINENT / "public" / "app_data.json").exists():
        return False, "continent-app/public/app_data.json is missing; run sync-data first"
    if not (CONTINENT / "node_modules" / "minisearch").exists():
        return False, "continent-app has no minisearch; run npm install in continent-app"
    return True, "model2vec and minisearch present, app_data on the wire"


# T1161: guided search runs in its own venv on the box (run_pipeline.sh sets
# CARTA_GUIDED_PY), because its sentence-transformers needs huggingface-hub
# below 1.0 and the main venv's model2vec 0.10.0 needs 2.x. Elsewhere: PY.
GUIDED_PY = os.environ.get("CARTA_GUIDED_PY") or PY


def guard_guided_search(ctx=None):
    """Guided search (T439) embeds destination text with thenlper/gte-small
    through sentence-transformers (requirements-ml.txt, CPU torch). Without it
    the task SKIPS and the last guided.json stays valid. On the box
    CARTA_BOX_ML=all installs it (T1161, H10)."""
    try:
        r = subprocess.run([GUIDED_PY, "-c", "import sentence_transformers"],
                           capture_output=True, timeout=120)
        ok = r.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        ok = False
    if not ok:
        return False, (f"sentence-transformers does not import in {GUIDED_PY} "
                       "(requirements-ml.txt; on the box CARTA_BOX_ML=all builds "
                       "~/venv-guided with CPU torch and sets CARTA_GUIDED_PY)")
    if not (ROOT / "app_data" / "app_data.json").exists():
        return False, "app_data/app_data.json is missing"
    return True, "sentence-transformers present, master on disk"




TASKS = [
    {
        "key": "taxonomy_tags",
        "title": "Taxonomy tags: every place, trail, beach, lake and peak on taxonomy v1 -> cache/taxonomy/tags.json",
        "cadence": "after",
        "after": ["dossier", "beaches", "lakes", "mountains", "trails_rate"],
        "writes_app_data": False,
        "writes_wire": False,
        "soft": True,
        "cmds": [[PY, "pipeline/taxonomy/tagger.py", "--all"]],
        "note": ("T1150 (F1). Phrase, mapped-tag and BM25 candidates fused by "
                 "rank, a noisy-OR score with evidence per tag and a threshold "
                 "per use. Reads only the shipped wires; no model call by "
                 "default (the verifier is --verify, the bi-encoder --dense, "
                 "both owner runs). Not the wire: wiring is a later task."),
    },
    {
        "key": "guided_search",
        "title": "Guided search: areas, nearby layers, vibe scores -> public/search/guided.json",
        "cadence": "after",
        "after": ["dossier", "beaches", "lakes", "mountains", "trails_rate"],
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "cmds": [[GUIDED_PY, "pipeline/guided_search_layer.py"]],
        "guard": guard_guided_search,
        "note": ("T439, scheduled by T1161 (H10): it was a laptop-only manual "
                 "step. Reads the master and the beach, trail, lake and peak "
                 "layer files, so it follows the same exports ask_index does. "
                 "Vibe embeddings from thenlper/gte-small on the CPU, cached in "
                 "cache/guided/vibes.npz by document hash, so a rerun embeds "
                 "only new or changed destinations (a fresh box embeds all of "
                 "them once). Needs CARTA_BOX_ML=all on the box."),
    },
    {
        "key": "ask_index",
        "title": "Ask Carta index: passages, vectors, pruned model, BM25 -> public/search/ask",
        "cadence": "after",
        "after": ["dossier", "beaches", "lakes", "mountains", "trails_rate"],
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "cmds": [[PY, "pipeline/ask_index_layer.py"],
                 [node_exe(), "continent-app/scripts/build-ask-bm25.mjs"]],
        "guard": guard_ask_index,
        "note": ("T551. One passage list per source (dest, highlight, sight, "
                 "trail, journey, beach, lake, peak, country, lexicon) with "
                 "int8 and sign-bit vectors from a pruned "
                 "minishlab/potion-multilingual-128M (static, ~10 MB shipped), "
                 "then the MiniSearch BM25 file. Reads only the shipped wires "
                 "(public/app_data.json, dossier, layer files), so it follows "
                 "the exports it reads; about 40 s, no network after the first "
                 "model download. public/search is in R2_TIER, so the files "
                 "travel with the other search wires."),
    },
]
