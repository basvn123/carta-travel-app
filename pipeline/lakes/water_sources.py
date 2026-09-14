"""The lake layer's polite clients, which are the beach layer's polite clients.

pipeline/beaches/sources.py already holds everything a second open-data layer
needs: one shared user agent, a per host minimum interval claimed under a lock,
exponential backoff on the statuses that clear on their own, the Overpass mirror
list with the lesson about regional databases answering cleanly for the wrong
planet, and a disk cache keyed by stage and country.

Copying those 255 lines would fork that lore, and a fork means the next Overpass
lesson only gets learned in one of the two files. So this module loads the beach
module by path, under a neutral name, and repoints the two things that must
differ between layers:

    CACHE   cache/lakes rather than cache/beaches, so neither layer can read or
            overwrite the other's snapshot
    UA      names this layer in the user agent, so an operator reading their
            logs can tell which of our crawlers is talking to them

Both are module globals that the functions read at call time, so patching them
here is enough: request() picks up the new agent, cache_path() the new folder.

Loaded by path rather than by `sys.path` because both layers name their client
module inside their own folder, and whichever directory happened to be first on
the path would decide which one `import sources` meant. A file path cannot be
ambiguous.

ASCII clean, no em dashes, per project convention.
"""

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_BEACH_SOURCES = ROOT / "pipeline" / "beaches" / "sources.py"

_spec = importlib.util.spec_from_file_location("carta_open_sources", _BEACH_SOURCES)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["carta_open_sources"] = _mod
_spec.loader.exec_module(_mod)

CONTACT = _mod.CONTACT
_mod.UA = f"CartaLakes/1.0 (https://carta-europetravel.com; {CONTACT})"
_mod.CACHE = ROOT / "cache" / "lakes"

CACHE = _mod.CACHE
UA = _mod.UA

# Re-exported by name rather than by star, so what this layer depends on from
# the shared module is a list somebody can read.
SourceError = _mod.SourceError
request = _mod.request
get_json = _mod.get_json
sparql = _mod.sparql
cell = _mod.cell
overpass = _mod.overpass
mediawiki = _mod.mediawiki
wikipedia_api = _mod.wikipedia_api
cache_path = _mod.cache_path
load_cache = _mod.load_cache
save_cache = _mod.save_cache
haversine_km = _mod.haversine_km
COMMONS_API = _mod.COMMONS_API
WIKIDATA_SPARQL = _mod.WIKIDATA_SPARQL
