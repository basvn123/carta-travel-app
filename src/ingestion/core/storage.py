"""Raw store: data/raw/<source>/<YYYY-MM-DD>/ plus a manifest.jsonl per day.

Native formats are kept untouched (.zip, .xml, .csv, .json, .pb). Filenames
are sanitised for Windows: reserved DOS device names (PRN, CON, ...) get a
trailing underscore, the same escape fareFile.js uses for PRN.json, because
NTFS refuses them and git core.protectNTFS refuses to index them.
"""
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

from . import config

_RESERVED = {"CON", "PRN", "AUX", "NUL",
             *(f"COM{i}" for i in range(1, 10)),
             *(f"LPT{i}" for i in range(1, 10))}
_BAD_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def sanitize_filename(name: str) -> str:
    name = _BAD_CHARS.sub("_", name).strip(" .") or "download"
    stem, dot, rest = name.partition(".")
    if stem.upper() in _RESERVED:
        stem += "_"
    return (stem + dot + rest)[:150]


def name_from_url(url: str) -> str:
    base = Path(unquote(urlparse(url).path)).name
    if not base:
        base = urlparse(url).netloc.replace(".", "_") + ".html"
    return sanitize_filename(base)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class RawStore:
    """One store per collector run, rooted at data/raw/<source>/<today>/."""

    def __init__(self, source: str):
        self.source = source
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        self.dir = config.DATA_DIR / source / day
        self.dir.mkdir(parents=True, exist_ok=True)
        self.files = 0
        self.bytes = 0

    def path_for(self, name: str) -> Path:
        dest = self.dir / sanitize_filename(name)
        if dest.exists():  # same day rerun: keep both, timestamp the newcomer
            stamp = datetime.now(timezone.utc).strftime("%H%M%S")
            dest = dest.with_name(f"{dest.stem}_{stamp}{dest.suffix}")
        return dest

    def _record(self, path: Path, url: str, size: int, sha256: str, content_type: str, note: str):
        entry = {"file": path.name, "url": url, "bytes": size, "sha256": sha256,
                 "content_type": content_type, "fetched_at": utcnow(), "note": note}
        with open(self.dir / "manifest.jsonl", "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
        self.files += 1
        self.bytes += size

    def save_bytes(self, name, data: bytes, url="", content_type="", note=""):
        dest = self.path_for(name)
        dest.write_bytes(data)
        self._record(dest, url, len(data), hashlib.sha256(data).hexdigest(), content_type, note)
        return dest

    def save_text(self, name, text: str, url="", note=""):
        return self.save_bytes(name, text.encode("utf-8"), url, "text/plain", note)

    def save_json(self, name, obj, url="", note=""):
        payload = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
        return self.save_bytes(name, payload, url, "application/json", note)

    def save_response(self, name, resp, url, note=""):
        """Stream a requests response to disk (atomic .part rename), manifest it."""
        dest = self.path_for(name)
        # PID in the temp name: concurrent sessions downloading the same
        # artifact must never interleave writes into one .part (seen with two
        # parallel Geofabrik pulls; both files ended up corrupt).
        tmp = dest.with_suffix(dest.suffix + f".{os.getpid()}.part")
        digest = hashlib.sha256()
        size = 0
        try:
            with open(tmp, "wb") as fh:
                for chunk in resp.iter_content(chunk_size=1 << 20):
                    if chunk:
                        fh.write(chunk)
                        digest.update(chunk)
                        size += len(chunk)
            # Windows: virus scanners hold freshly closed multi-GB files open
            # for a while, so the rename hits a transient sharing violation.
            for wait in (0, 1, 2, 5, 10, 20, 40, 60):
                time.sleep(wait)
                try:
                    tmp.replace(dest)
                    break
                except PermissionError:
                    continue
            else:
                tmp.replace(dest)
        finally:
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass  # scanner still holds the orphan .part; harmless
        self._record(dest, url, size, digest.hexdigest(),
                     resp.headers.get("Content-Type", ""), note)
        return dest

    def register_existing(self, path, url="", note=""):
        """Manifest a file some other tool wrote into the store dir (e.g. the
        Kaggle client)."""
        path = Path(path)
        digest = hashlib.sha256()
        size = 0
        with open(path, "rb") as fh:
            while True:
                chunk = fh.read(1 << 20)
                if not chunk:
                    break
                digest.update(chunk)
                size += len(chunk)
        self._record(path, url, size, digest.hexdigest(), "", note)
        return path

    def copy_in(self, src_path, note=""):
        """Stream a locally staged file (e.g. EUROCONTROL DDR extracts) into
        the raw store without loading it in memory."""
        src = Path(src_path)
        dest = self.path_for(src.name)
        digest = hashlib.sha256()
        size = 0
        with open(src, "rb") as fin, open(dest, "wb") as fout:
            while True:
                chunk = fin.read(1 << 20)
                if not chunk:
                    break
                fout.write(chunk)
                digest.update(chunk)
                size += len(chunk)
        self._record(dest, f"staged:{src}", size, digest.hexdigest(), "", note)
        return dest
