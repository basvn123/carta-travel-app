"""The D23 text judge's command line (T1188): a thin entry for pipeline/judge.

    python -I scripts/validation/judge.py --help

Every command is in pipeline/judge/__main__.py.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.judge.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
