"""Settings from the environment, read once at start (README "Configuration")."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVICE = HERE.parent
ROOT = Path(os.environ.get("CARTA_REPO_ROOT") or SERVICE.parents[1]).resolve()


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class KeySpec:
    key_id: str
    sha256: str
    rate_per_min: int | None = None


def parse_keys(raw: str) -> list[KeySpec]:
    """`id:sha256hex[:rate_per_min]` entries, comma separated. Bad entries are dropped."""
    out = []
    for part in (raw or "").split(","):
        bits = part.strip().split(":")
        if len(bits) < 2 or not bits[0] or len(bits[1]) != 64:
            continue
        try:
            int(bits[1], 16)
        except ValueError:
            continue
        rate = int(bits[2]) if len(bits) > 2 and bits[2].isdigit() else None
        out.append(KeySpec(bits[0], bits[1].lower(), rate))
    return out


@dataclass(frozen=True)
class Settings:
    keys: list[KeySpec] = field(default_factory=list)
    rate_per_min: int = 120
    burst: int = 30
    bridge_timeout_s: float = 10.0
    public: Path = ROOT / "continent-app" / "public"
    app: Path = ROOT / "continent-app"
    tags_path: Path | None = None
    node: str = "node"

    @classmethod
    def from_env(cls) -> Settings:
        tags = os.environ.get("INTEL_TAGS_PATH")
        if not tags:
            for p in (ROOT / "cache" / "taxonomy" / "tags.json", ROOT / "cache" / "taxonomy" / "tags-sample.json"):
                if p.is_file():
                    tags = str(p)
                    break
        return cls(
            keys=parse_keys(os.environ.get("INTEL_API_KEYS", "")),
            rate_per_min=_int("INTEL_RATE_PER_MIN", 120),
            burst=_int("INTEL_BURST", 30),
            bridge_timeout_s=float(os.environ.get("INTEL_BRIDGE_TIMEOUT_S", "10")),
            public=Path(os.environ.get("CARTA_PUBLIC") or ROOT / "continent-app" / "public"),
            app=Path(os.environ.get("CARTA_APP") or ROOT / "continent-app"),
            tags_path=Path(tags) if tags else None,
            node=os.environ.get("INTEL_NODE", "node"),
        )
