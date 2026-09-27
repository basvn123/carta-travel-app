#!/usr/bin/env python
"""Pack the Carta cold archive's derived-cache classes into per-layer tarballs.

Reference: additional docs/Carta/Plan/Architecture/CARTA_CLOUD_ARCHITECTURE.md
section 6.3 ("Tar the embedding cache before uploading") and section 7b
("Object count, not byte count"). Task report: Execution/P3/T045-archive-to-r2.md.

Why one tarball per layer, and not one per file or one for everything:

One object per file is what section 7b rules out by name. cache/photos/emb held
23,262 loose .npy files on 2026-09-27 and grows every harvest. Uploaded loose,
that is 23,262 Class A writes now, thousands more on every incremental run, and
a sync that has to enumerate every one of them before it can do anything.

One tarball for everything would be the opposite mistake. Layers change on
different cadences: emb on every photo harvest, the model weights almost never,
the lakes cache once a quarter. One giant tarball means re-packing and
re-uploading 9 GB because one layer moved. Per layer, an upload is proportional
to what changed.

Skip-if-unchanged: a small JSON state file next to the tarballs maps each layer
to a fingerprint of (relative path, size, mtime_ns) for every file in it. No file
content is read, so fingerprinting 23,262 files takes about a second. A layer is
re-packed only when its fingerprint changed or its tarball is missing.

Tar member paths are relative to the repo root (cache/photos/emb/ab12.npy), so
push.py --pull extracts at the repo root and every file lands where it came from,
including layers built from several globs under one parent.

Compression comes from manifest.yml (tar_compression). gzip is what runs today:
there is no `zstd` binary on the development laptop and Python 3.11's tarfile
cannot write zstd. Choosing zstd in the manifest on a machine without the binary
fails loudly rather than silently producing a differently named tarball.

Usage (from the repo root):
  python pipeline/archive/pack.py --dry-run           list what would be packed
  python pipeline/archive/pack.py                     pack every changed layer
  python pipeline/archive/pack.py --only NAME         pack one layer
  python pipeline/archive/pack.py --out DIR           write tarballs and state to DIR
  python pipeline/archive/pack.py --force             ignore the state file

The default output directory is pipeline/archive/output (gitignored). On the
laptop, point --out at a disk with room: all layers together are about 9.8 GB
before compression. CARTA_ARCHIVE_OUT in the environment sets the same thing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML is required: pip install pyyaml", file=sys.stderr)
    raise

ARCHIVE_DIR = Path(__file__).resolve().parent
REPO_ROOT = ARCHIVE_DIR.parent.parent
MANIFEST_PATH = ARCHIVE_DIR / "manifest.yml"
DEFAULT_OUT = ARCHIVE_DIR / "output"
STATE_NAME = "pack_state.json"


def load_manifest() -> dict:
    with open(MANIFEST_PATH, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def output_dir(cli_out: str | None) -> Path:
    if cli_out:
        return Path(cli_out).resolve()
    env = os.environ.get("CARTA_ARCHIVE_OUT")
    return Path(env).resolve() if env else DEFAULT_OUT


def tar_extension(manifest: dict) -> str:
    return "tar.zst" if manifest.get("tar_compression") == "zstd" else "tar.gz"


def iter_layer_files(entry: dict) -> list[Path]:
    """Resolve local_path, plus optional local_path_globs (named children of
    local_path) and local_path_excludes, to a sorted list of files."""
    if not entry.get("local_path"):
        return []
    base = REPO_ROOT / entry["local_path"]
    roots = [base / g for g in entry["local_path_globs"]] if entry.get("local_path_globs") else [base]
    excludes = [base / x for x in entry.get("local_path_excludes") or []]

    files: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        if root.is_file():
            files.append(root)
            continue
        for p in root.rglob("*"):
            # A symlink is kept as a symlink (tarfile stores it with lstat), not
            # followed: the Hugging Face cache under cache/photos/models points a
            # snapshots/ link at a 1.7 GB blob, and following it would pack the
            # weights twice. Sizes below use lstat for the same reason.
            if (p.is_symlink() or p.is_file()) and not any(ex == p or ex in p.parents for ex in excludes):
                files.append(p)
    return sorted(files)


def fingerprint(files: list[Path]) -> str:
    h = hashlib.sha256()
    for f in files:
        st = f.lstat()
        h.update(f.relative_to(REPO_ROOT).as_posix().encode("utf-8"))
        h.update(b"\0%d\0%d\n" % (st.st_size, st.st_mtime_ns))
    return h.hexdigest()


def pack_layer(files: list[Path], out_path: Path, manifest: dict) -> None:
    tmp = out_path.with_name(out_path.name + ".partial")
    if manifest.get("tar_compression") == "zstd":
        if not shutil.which("zstd"):
            raise SystemExit("manifest.yml asks for zstd but no `zstd` binary is on PATH")
        plain = out_path.with_name(out_path.name + ".tar.partial")
        with tarfile.open(plain, "w") as tar:
            for f in files:
                tar.add(f, arcname=f.relative_to(REPO_ROOT).as_posix())
        subprocess.run(["zstd", "-q", "-f", "-T0", "-o", str(tmp), str(plain)], check=True)
        plain.unlink()
    else:
        level = int(manifest.get("gzip_level", 6))
        with tarfile.open(tmp, "w:gz", compresslevel=level) as tar:
            for f in files:
                tar.add(f, arcname=f.relative_to(REPO_ROOT).as_posix())
    # Rename last, so an interrupted pack never leaves a truncated tarball
    # under the name push.py uploads.
    os.replace(tmp, out_path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", help="pack only this layer name")
    parser.add_argument("--out", help="directory for tarballs and pack_state.json")
    parser.add_argument("--dry-run", action="store_true", help="list actions, write nothing")
    parser.add_argument("--force", action="store_true", help="ignore the state file, repack")
    args = parser.parse_args()

    manifest = load_manifest()
    out_dir = output_dir(args.out)
    state_path = out_dir / STATE_NAME
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    ext = tar_extension(manifest)
    level = manifest.get("gzip_level", 6)
    zstd_found = bool(shutil.which("zstd"))
    print(f"Compressor: {manifest.get('tar_compression', 'gzip')}"
          f"{'' if ext == 'tar.zst' else f' level {level}'} (zstd binary on PATH: {'yes' if zstd_found else 'no'})")
    print(f"Output:     {out_dir}")

    entries = [e for e in manifest["classes"] if e["kind"] == "derived-cache"]
    if args.only:
        entries = [e for e in entries if e["name"] == args.only]
        if not entries:
            print(f"No derived-cache layer named {args.only!r} in manifest.yml", file=sys.stderr)
            return 2

    packed = skipped = missing = 0
    files_before = bytes_before = tarballs = bytes_after = 0
    for entry in entries:
        name = entry["name"]
        files = iter_layer_files(entry)
        if not files:
            print(f"- {name}: nothing at {entry.get('local_path')}, skipping")
            missing += 1
            continue
        size_in = sum(f.lstat().st_size for f in files)
        files_before += len(files)
        bytes_before += size_in
        out_path = out_dir / f"{name}.{ext}"
        digest = fingerprint(files)

        if not args.force and state.get(name) == digest and out_path.exists():
            size_out = out_path.stat().st_size
            print(f"- {name}: unchanged, {len(files)} files, keeping {out_path.name}")
            skipped += 1
        elif args.dry_run:
            size_out = 0
            print(f"- {name}: would pack {len(files)} files, {size_in / 1e6:.1f} MB, into {out_path.name}")
        else:
            out_dir.mkdir(parents=True, exist_ok=True)
            t0 = time.time()
            pack_layer(files, out_path, manifest)
            size_out = out_path.stat().st_size
            state[name] = digest
            state_path.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
            print(f"- {name}: packed {len(files)} files, {size_in / 1e6:.1f} MB in, "
                  f"{size_out / 1e6:.1f} MB out, {time.time() - t0:.1f} s")
            packed += 1
        tarballs += 1
        bytes_after += size_out

    print()
    print("Summary")
    print(f"  layers considered:     {len(entries)}")
    print(f"  packed this run:       {packed}")
    print(f"  skipped (unchanged):   {skipped}")
    print(f"  missing locally:       {missing}")
    print(f"  loose files in:        {files_before}")
    print(f"  tarballs out:          {tarballs}")
    print(f"  bytes in:              {bytes_before / 1e6:.1f} MB")
    if not args.dry_run:
        print(f"  bytes out (on disk):   {bytes_after / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
