#!/usr/bin/env python
"""Push the Carta cold archive to R2, pull it back, and set its lifecycle rules.

Everything is driven by manifest.yml. Reference:
additional docs/Carta/Plan/Architecture/CARTA_CLOUD_ARCHITECTURE.md section 6.3.
Task report: Execution/P3/T045-archive-to-r2.md. Needs the bucket "carta" to
exist (T044, see Execution/_OPEN.md T044-a to T044-c) and, for the derived-cache
classes, the tarballs pack.py writes.

Two tools, each for what only it can do:

Objects move with rclone against R2's S3-compatible endpoint. The first draft of
this script used `npx wrangler r2 object put`, which fails for this archive twice
over. Wrangler 4.142.0 refuses any file over 300 MiB (MAX_UPLOAD_SIZE_BYTES in
its cli.js), and 23 of the 47 OSM extracts, 6 raw mirrors and several tarballs
are larger. And without --remote, `wrangler r2 object put` writes to the local
Miniflare store, so the first draft would have reported success while uploading
nothing. rclone does multipart uploads, skips files already present with the
same size and modtime, and speaks SFTP too, so the same commands can target a
Hetzner Storage Box by changing the remote.

Lifecycle rules are bucket configuration, which rclone cannot set, so they go
through `npx wrangler r2 bucket lifecycle add`, one rule per prefix. `add` reads
the bucket's existing rules and appends; `lifecycle set --file` replaces all of
them, which would also wipe rules other prefixes (img/, data/, tiles/) or R2's
default multipart-abort rule carry. That is why there is no lifecycle.json here.

The rclone remote is defined entirely by environment variables, so no config
file holding a secret is ever written:
  RCLONE_CONFIG_R2_TYPE=s3
  RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  RCLONE_CONFIG_R2_ENDPOINT=https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
  RCLONE_CONFIG_R2_ACCESS_KEY_ID=<R2 API token access key id>
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=<R2 API token secret>
The lifecycle commands need CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, as
T044's provision.sh does.

Usage (from the repo root):
  python pipeline/archive/push.py --dry-run                   print every push command
  python pipeline/archive/push.py --pull --dry-run            print every pull command
  python pipeline/archive/push.py --lifecycle --dry-run       print the lifecycle rules
  python pipeline/archive/push.py --only photo-embeddings     one class
  python pipeline/archive/push.py --out DIR                   where pack.py wrote tarballs
  python pipeline/archive/push.py --dump-dir DIR              where the encrypted dumps are

--pull is for a fresh build box at the start of a run: it fetches the master,
the inputs and every cache tarball, and extracts each tarball at the repo root.
The run ends with pack.py then push.py, which re-uploads only changed layers.
Snapshots and database dumps are never pulled automatically. Restoring either
is a deliberate act; the report has the commands.

Three class keys added for the Hetzner box's explore data fill (T640):
  pull_members  glob list (repo-relative, `*` stays inside one folder). The
                pull streams the tarball through `rclone cat` and extracts only
                the matching members, so neither the tarball nor the members
                left out ever touch the disk. A partial copy is marked with
                <local_path>/.partial-from-r2, and pack.py and this script then
                refuse to pack or push any class whose local_path holds that
                marker: a partial cache/lakes must never replace the full
                lakes-cache tarball.
  pull_only     the class is never pushed (and never packed).
  optional      a missing R2 object is not an error on pull (a class the box
                creates itself does not exist before its first push).
"""

from __future__ import annotations

import argparse
import fnmatch
import os
import shlex
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML is required: pip install pyyaml", file=sys.stderr)
    raise

ARCHIVE_DIR = Path(__file__).resolve().parent
REPO_ROOT = ARCHIVE_DIR.parent.parent
CONTINENT_APP = REPO_ROOT / "continent-app"
MANIFEST_PATH = ARCHIVE_DIR / "manifest.yml"
DEFAULT_OUT = ARCHIVE_DIR / "output"

RCLONE_ENV = ("RCLONE_CONFIG_R2_TYPE", "RCLONE_CONFIG_R2_ENDPOINT",
              "RCLONE_CONFIG_R2_ACCESS_KEY_ID", "RCLONE_CONFIG_R2_SECRET_ACCESS_KEY")
WRANGLER_ENV = ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID")

# Archive objects are read by the pipeline only, never by a browser.
RCLONE_FLAGS = ["--s3-no-check-bucket", "--header-upload", "Cache-Control: no-store"]


def load_manifest() -> dict:
    with open(MANIFEST_PATH, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def rel(p: Path) -> str:
    """Repo-relative, forward-slash path for printing and for rclone arguments."""
    try:
        return p.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return p.as_posix()


def run(cmd: list[str], dry_run: bool, cwd: Path = REPO_ROOT) -> None:
    where = "" if cwd == REPO_ROOT else f"(cd {rel(cwd)}) "
    print(f"  + {where}{shlex.join(cmd)}")
    if dry_run:
        return
    exe = shutil.which(cmd[0])
    if exe is None:
        raise SystemExit(f"{cmd[0]} is not on PATH")
    # shutil.which resolves npx to npx.cmd on Windows, which a bare "npx" in
    # subprocess.run would not find.
    subprocess.run([exe, *cmd[1:]], check=True, cwd=str(cwd))


def remote(manifest: dict, key: str) -> str:
    return f"{manifest['rclone_remote']}:{manifest['bucket']}/{key}"


def key_dir(entry: dict) -> str:
    """The prefix a {relpath} or {filename} pattern expands under."""
    return entry["r2_key_pattern"].split("{", 1)[0].rstrip("/")


PARTIAL_MARKER = ".partial-from-r2"


def partial_copy(entry: dict) -> Path | None:
    """The marker file when local_path holds a member-filtered pull, else None."""
    lp = entry.get("local_path")
    if not lp:
        return None
    marker = REPO_ROOT / lp / PARTIAL_MARKER
    return marker if marker.exists() else None


def member_wanted(name: str, patterns: list[str]) -> bool:
    """fnmatch per path segment, so `cache/lakes/*.json` does not reach into
    cache/lakes/osm/x.json."""
    parts = name.split("/")
    for pat in patterns:
        pp = pat.split("/")
        if len(pp) == len(parts) and all(fnmatch.fnmatchcase(a, b) for a, b in zip(parts, pp)):
            return True
    return False


# --- push -------------------------------------------------------------------

def push_entry(entry: dict, manifest: dict, out_dir: Path, dump_dir: Path, dry_run: bool) -> None:
    kind, name = entry["kind"], entry["name"]
    pattern = entry["r2_key_pattern"]
    print(f"- {name} ({kind}, {entry['treatment']}, lifecycle "
          f"{entry['lifecycle_days'] or 'none'})")
    if entry.get("pull_only"):
        print("  pull-only class: never pushed (it is a member-filtered copy of another class)")
        return
    marker = partial_copy(entry) if kind == "derived-cache" else None
    if marker:
        raise SystemExit(f"refusing to push {name}: {rel(marker)} says {entry['local_path']} is a "
                         "partial copy pulled from R2; pushing it would overwrite the full tarball")

    if kind == "run-staging":
        print("  written in R2 by the workers, nothing to push; listed for its lifecycle rule")
        return
    if kind == "derived-cache":
        tarball = out_dir / Path(pattern).name
        if not tarball.exists():
            print(f"  no {tarball.name} in {rel(out_dir)}; run pack.py first"
                  f"{' (printed anyway)' if dry_run else ', skipping'}")
            if not dry_run:
                return
        run(["rclone", "copyto", rel(tarball), remote(manifest, pattern), *RCLONE_FLAGS], dry_run)

    elif kind in ("reproducible-input", "snapshot"):
        local = REPO_ROOT / entry["local_path"]
        if not local.exists():
            print(f"  {rel(local)} not found, skipping")
            return
        if local.is_file():
            run(["rclone", "copyto", rel(local), remote(manifest, pattern), *RCLONE_FLAGS], dry_run)
        else:
            # One rclone call per class, not per file: rclone walks the tree,
            # uploads in parallel and skips what is already there.
            excludes = []
            for x in entry.get("local_path_excludes") or []:
                excludes += ["--exclude", f"/{x}/**"]
            run(["rclone", "copy", rel(local), remote(manifest, key_dir(entry)),
                 *excludes, *RCLONE_FLAGS], dry_run)

    elif kind == "db-dump":
        dumps = sorted(dump_dir.glob(entry["dump_glob"])) if dump_dir.exists() else []
        if not dumps:
            print(f"  no {entry['dump_glob']} in {rel(dump_dir)}; make one with the report's dump command"
                  f"{' (printed with a placeholder)' if dry_run else ', skipping'}")
            if not dry_run:
                return
            dumps = [dump_dir / entry["dump_glob"].replace("*", "YYYY-MM-DD")]
        for d in dumps:
            if not d.name.endswith(".gpg"):
                raise SystemExit(f"refusing to push {d.name}: database dumps go to R2 encrypted only")
            run(["rclone", "copyto", rel(d), remote(manifest, pattern.format(filename=d.name)),
                 *RCLONE_FLAGS], dry_run)
    else:
        print(f"  unknown kind {kind!r}, skipping")


# --- pull -------------------------------------------------------------------

def safe_extract(tarball: Path) -> None:
    mode = "r:gz" if tarball.name.endswith(".gz") else "r"
    if tarball.name.endswith(".zst"):
        plain = tarball.with_name(tarball.name[:-4])
        subprocess.run(["zstd", "-d", "-f", "-q", "-o", str(plain), str(tarball)], check=True)
        tarball, mode = plain, "r"
    with tarfile.open(tarball, mode) as tar:
        # filter="data" refuses absolute paths, .. and links that escape the
        # target; members are repo-relative by construction in pack.py.
        tar.extractall(REPO_ROOT, filter="data")


def stream_extract(src: str, patterns: list[str], entry: dict) -> None:
    """rclone cat the tarball and extract the members that match, streaming."""
    exe = shutil.which("rclone")
    if exe is None:
        raise SystemExit("rclone is not on PATH")
    if src.endswith(".zst"):
        raise SystemExit("pull_members supports .tar.gz and .tar only")
    mode = "r|gz" if src.endswith(".gz") else "r|"
    proc = subprocess.Popen([exe, "cat", src], stdout=subprocess.PIPE)
    n = size = 0
    try:
        with tarfile.open(fileobj=proc.stdout, mode=mode) as tar:
            for m in tar:
                if m.isfile() and member_wanted(m.name, patterns):
                    tar.extract(m, REPO_ROOT, filter="data")
                    n += 1
                    size += m.size
    finally:
        proc.stdout.close()
        rc = proc.wait()
    if rc != 0:
        raise SystemExit(f"rclone cat {src} exited {rc}")
    marker = REPO_ROOT / entry["local_path"] / PARTIAL_MARKER
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(f"Member-filtered pull of {src} ({', '.join(patterns)}), {n} files. "
                      "pack.py and push.py refuse to pack or push this folder.\n", encoding="utf-8")
    print(f"  extracted {n} member(s), {size / 1e6:.1f} MB; marked {rel(marker)}")


def pull_entry(entry: dict, manifest: dict, out_dir: Path, dry_run: bool) -> None:
    kind, name = entry["kind"], entry["name"]
    pattern = entry["r2_key_pattern"]
    if kind == "db-dump" or (kind == "snapshot" and entry.get("lifecycle_days")):
        print(f"- {name}: not pulled automatically; restoring it is deliberate, see the report")
        return
    if kind == "run-staging":
        print(f"- {name}: worker staging, read by spawn.sh only; not pulled")
        return
    print(f"- {name}")

    if entry.get("optional"):
        probe = ["rclone", "lsf", remote(manifest, pattern)]
        print(f"  + {shlex.join(probe)}   (optional class: absent in R2 is fine)")
        if not dry_run:
            exe = shutil.which("rclone")
            if exe is None:
                raise SystemExit("rclone is not on PATH")
            r = subprocess.run([exe, *probe[1:]], capture_output=True, text=True)
            if r.returncode != 0 or not r.stdout.strip():
                print(f"  {pattern} is not in R2 yet (nothing pushed so far); nothing to pull")
                return

    if kind == "derived-cache" and entry.get("pull_members"):
        pats = entry["pull_members"]
        src = remote(manifest, pattern)
        print(f"  + rclone cat {src} | extract only {', '.join(pats)} at the repo root (streamed, no tarball on disk)")
        if not dry_run:
            stream_extract(src, pats, entry)
        return

    if kind == "derived-cache":
        tarball = out_dir / Path(pattern).name
        run(["rclone", "copyto", remote(manifest, pattern), rel(tarball)], dry_run)
        print(f"  + extract {tarball.name} at the repo root")
        if not dry_run:
            safe_extract(tarball)
    elif entry["local_path"] and "{" not in pattern:
        run(["rclone", "copyto", remote(manifest, pattern), entry["local_path"]], dry_run)
    else:
        run(["rclone", "copy", remote(manifest, key_dir(entry)), entry["local_path"]], dry_run)


# --- lifecycle --------------------------------------------------------------

def lifecycle_commands(manifest: dict) -> list[list[str]]:
    """One `lifecycle add` per distinct (prefix, days). Syntax checked against
    `npx wrangler r2 bucket lifecycle add --help` in wrangler 4.142.0: the rule
    name and prefix are positionals, --expire-days is converted by wrangler to
    an Age condition in seconds, and --force skips the confirmation prompt a
    non-interactive run cannot answer."""
    rules: dict[str, int] = {}
    for e in manifest["classes"]:
        if e.get("lifecycle_days"):
            prefix = key_dir(e) + "/"
            if e["kind"] == "db-dump":
                prefix = prefix.rsplit("/", 2)[0] + "/"   # archive/db/, not per database
            days = rules.setdefault(prefix, e["lifecycle_days"])
            if days != e["lifecycle_days"]:
                raise SystemExit(f"conflicting lifecycle days under {prefix}")
    cmds = []
    for prefix, days in sorted(rules.items()):
        rule_id = "carta-" + prefix.strip("/").replace("/", "-") + f"-expire-{days}d"
        cmds.append(["npx", "wrangler", "r2", "bucket", "lifecycle", "add", manifest["bucket"],
                     rule_id, prefix, "--expire-days", str(days), "--force"])
    cmds.append(["npx", "wrangler", "r2", "bucket", "lifecycle", "list", manifest["bucket"]])
    return cmds


# --- main -------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--pull", action="store_true", help="restore from R2 instead of pushing")
    mode.add_argument("--lifecycle", action="store_true", help="add the lifecycle rules to the bucket")
    parser.add_argument("--only", help="one class name from manifest.yml")
    parser.add_argument("--out", help="pack.py's output directory (default pipeline/archive/output or CARTA_ARCHIVE_OUT)")
    parser.add_argument("--dump-dir", help="directory holding encrypted *.dump.gpg files (default: --out)")
    parser.add_argument("--dry-run", action="store_true", help="print every command, run none")
    args = parser.parse_args()

    manifest = load_manifest()
    out_dir = Path(args.out or os.environ.get("CARTA_ARCHIVE_OUT") or DEFAULT_OUT).resolve()
    dump_dir = Path(args.dump_dir).resolve() if args.dump_dir else out_dir

    needed = WRANGLER_ENV if args.lifecycle else RCLONE_ENV
    missing = [v for v in needed if not os.environ.get(v)]
    if missing and not args.dry_run:
        print(f"Missing {', '.join(missing)}. Export them, or use --dry-run.", file=sys.stderr)
        return 1

    if args.lifecycle:
        print(f"Lifecycle rules for bucket {manifest['bucket']} (inputs, caches and the master: no rule)")
        for cmd in lifecycle_commands(manifest):
            run(cmd, args.dry_run, CONTINENT_APP)
        return 0

    entries = manifest["classes"]
    if args.only:
        entries = [e for e in entries if e["name"] == args.only]
        if not entries:
            print(f"No class named {args.only!r} in manifest.yml", file=sys.stderr)
            return 2

    print(f"{'Pull from' if args.pull else 'Push to'} {manifest['rclone_remote']}:{manifest['bucket']}/"
          f"{manifest['root_prefix']}  (tarballs: {rel(out_dir)})")
    for entry in entries:
        if args.pull:
            pull_entry(entry, manifest, out_dir, args.dry_run)
        else:
            push_entry(entry, manifest, out_dir, dump_dir, args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
