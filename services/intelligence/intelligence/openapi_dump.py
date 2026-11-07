"""Write or check services/intelligence/openapi.json (the source of docs/reference/openapi.md).

    python -m intelligence.openapi_dump            # write
    python -m intelligence.openapi_dump --check    # exit 1 when stale
"""
from __future__ import annotations

import json
import sys

from .config import SERVICE, KeySpec, Settings

OUT = SERVICE / "openapi.json"


def spec() -> dict:
    from .app import create_app

    class _NoBridge:
        def alive(self):
            return False

        def stop(self):
            pass

    app = create_app(Settings(keys=[KeySpec("dump", "0" * 64)], tags_path=None), bridge=_NoBridge())
    return app.openapi()


def text() -> str:
    return json.dumps(spec(), indent=1, ensure_ascii=False, sort_keys=True) + "\n"


def main(argv: list[str]) -> int:
    t = text()
    if "--check" in argv:
        if not OUT.is_file() or OUT.read_text(encoding="utf-8") != t:
            print(f"FAIL {OUT.name} is stale; run python -m intelligence.openapi_dump")
            return 1
        print("openapi.json: ok")
        return 0
    OUT.write_text(t, encoding="utf-8", newline="\n")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
