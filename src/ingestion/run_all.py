"""Single entry point for the whole ingestion framework.

    python -m src.ingestion.run_all                 run everything
    python -m src.ingestion.run_all --list          show the collector roster
    python -m src.ingestion.run_all --group naps    one group (comma ok)
    python -m src.ingestion.run_all --only germany,norway
    python -m src.ingestion.run_all --check         HEAD probe static endpoints
    python -m src.ingestion.run_all --strict        exit 1 on any error

Sources whose credentials are absent report as SKIP with instructions, never
as failures, so one missing API key cannot sink a scheduled run. Partial
collectors (some artifacts failed) report WARN; only a collector that
produced nothing while erroring reports ERR.

Scheduling: wire this into run_pipeline.py cadences or a plain Task
Scheduler job; sncf_realtime is the only long runner (about 10 minutes at
its defaults) and can be given its own schedule via --only sncf_realtime.
"""
import argparse
import sys

from .core import config
from .core.http import PoliteSession
from .core.registry import load_all


def _select(registry, args):
    collectors = list(registry.values())
    if args.group:
        wanted = {g.strip() for g in args.group.split(",")}
        collectors = [c for c in collectors if c.group in wanted]
    if args.only:
        wanted = {n.strip() for n in args.only.split(",")}
        unknown = wanted - set(registry)
        if unknown:
            sys.exit(f"unknown collector(s): {', '.join(sorted(unknown))}\n"
                     f"valid: {', '.join(sorted(registry))}")
        collectors = [c for c in collectors if c.name in wanted]
    return collectors


def _print_roster(collectors):
    print(f"{'source':18} {'group':9} description")
    print("-" * 100)
    for cls in collectors:
        print(f"{cls.name:18} {cls.group:9} {cls.description}")
        if cls.required_env:
            print(f"{'':18} {'':9}   needs: {', '.join(cls.required_env)}")


def _check(collectors):
    session = PoliteSession(min_interval=0.3)
    print("Probing static endpoints (dynamic / resolved URLs are not probed):")
    for cls in collectors:
        if not cls.static_urls:
            print(f"  {cls.name:18} (no static endpoints, resolves at runtime)")
            continue
        for label, url in cls.static_urls.items():
            status = session.head_status(url)
            print(f"  {cls.name:18} {label:24} {status}  {url}")


def _summarise(results):
    print()
    print(f"{'source':18} {'group':9} {'files':>5} {'MB':>9} {'sec':>7}  status")
    print("-" * 78)
    for r in results:
        if r.skipped:
            status = "SKIP"
        elif r.errors and r.files == 0:
            status = "ERR"
        elif r.errors:
            status = "WARN"
        else:
            status = "ok"
        print(f"{r.name:18} {r.group:9} {r.files:>5} {r.bytes / 1e6:>9.1f} "
              f"{r.seconds:>7.1f}  {status}  {r.notes}")
    print()
    for r in results:
        for err in r.errors:
            print(f"  [{r.name}] {err}")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="python -m src.ingestion.run_all",
                                     description="Carta raw data ingestion")
    parser.add_argument("--list", action="store_true", help="show collectors and exit")
    parser.add_argument("--group", help="comma separated groups (naps, rail, aviation, maritime, pricing, events)")
    parser.add_argument("--only", help="comma separated collector names")
    parser.add_argument("--check", action="store_true",
                        help="HEAD probe static endpoints instead of downloading")
    parser.add_argument("--strict", action="store_true",
                        help="exit 1 on any error, including partial collectors")
    args = parser.parse_args(argv)

    registry = load_all()
    collectors = _select(registry, args)
    if not collectors:
        sys.exit("selection matched no collectors")

    if args.list:
        _print_roster(collectors)
        return 0
    if args.check:
        _check(collectors)
        return 0

    print(f"Running {len(collectors)} collectors -> {config.DATA_DIR}")
    results = []
    for cls in collectors:
        print(f"==> {cls.name} ({cls.group}): {cls.description}")
        results.append(cls().run())
    _summarise(results)

    hard = [r for r in results if r.errors and r.files == 0 and not r.skipped]
    partial = [r for r in results if r.errors and r.files > 0]
    if args.strict and (hard or partial):
        return 1
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())
