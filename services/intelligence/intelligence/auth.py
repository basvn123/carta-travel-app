"""API key auth: a key is accepted when its SHA-256 equals a stored hash.

Keys are high entropy (`secrets.token_urlsafe(32)`), so a plain SHA-256 is
enough; only hashes live in the environment. Every stored hash is compared
with `hmac.compare_digest`, with no early exit, and a refusal says nothing
about why.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets

from .config import KeySpec


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def new_key() -> tuple[str, str]:
    """(key, sha256) for the owner step that makes a key."""
    k = secrets.token_urlsafe(32)
    return k, hash_key(k)


def match_key(presented: str | None, keys: list[KeySpec]) -> KeySpec | None:
    if not presented or len(presented) > 256:
        return None
    h = hash_key(presented)
    found = None
    for spec in keys:
        if hmac.compare_digest(h, spec.sha256):
            found = spec
    return found
