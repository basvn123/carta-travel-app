"""Load the repo-root .env into os.environ for pipeline scripts.

Why: harvester credentials (LITEAPI_KEY, HW_CONSUMER_KEY, ...) are read from
the environment, but on a dev machine nobody wants to export them per shell.
A `.env` at the REPO ROOT (gitignored, see .env.example) is the one sanctioned
paste spot. Deliberately NOT continent-app/.env: that file is Vite's, and a
secret there is one VITE_ prefix away from being bundled into the browser.

Minimal on purpose (no python-dotenv dependency): KEY=VALUE lines, # comments
and blanks ignored, optional single/double quotes stripped, real environment
variables always win over the file.

Usage, at the top of any pipeline script that needs credentials:
    from env_local import load_env
    load_env()
"""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_env(path=None):
    p = Path(path) if path else ROOT / ".env"
    if not p.exists():
        return
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value
