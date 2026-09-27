#!/usr/bin/env bash
# Source this, do not run it. Exports every KEY=value in the orchestrator's
# secrets file, then unsets the ones left blank.
#
# Why the unset: env.example ships every name with an empty value. An
# exported empty string is not the same as an absent variable to Python:
# os.environ.get("INGEST_DATA_DIR", default) returns "" instead of the
# default, and pipeline/env_local.py refuses to fill a key from .env once
# it exists in the environment, even empty. Unsetting the blanks makes a
# blank line in the file mean "not configured", which is what it looks like.
#
# Used by weekly.sh today and by T048's ported job later.

CARTA_ENV_FILE="${CARTA_ENV_FILE:-$HOME/.config/carta/env}"

if [ -r "$CARTA_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$CARTA_ENV_FILE"
  set +a
  for _carta_k in $(grep -oE '^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' "$CARTA_ENV_FILE" \
                      | sed -E 's/^[[:space:]]*(export[[:space:]]+)?//; s/=$//'); do
    if [ -z "${!_carta_k:-}" ]; then unset "$_carta_k"; fi
  done
  unset _carta_k
fi
