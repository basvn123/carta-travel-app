# Tier: Manual
"""Empty the trailslab cycle_landcover table before a full land-cover rebuild.

DESTRUCTIVE. Drops cycle_landcover_new and truncates cycle_landcover in the
trailslab PostGIS lab (tools/trailslab, port 5433), then prints the table and
database sizes. landcover.py refills the table; run this only when the
land-cover cache needs a full rebuild, never on a schedule.

Until T260 the whole body ran at module level, so merely importing this file
truncated the table (T028). It now runs only as a script, and only with --yes:

  python pipeline/cycling/_truncate_lc.py --yes
"""
import argparse
import os
import sys


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--yes", action="store_true",
                    help="really truncate cycle_landcover (without it, print what would happen)")
    args = ap.parse_args()
    if not args.yes:
        print("would drop cycle_landcover_new and truncate cycle_landcover in the "
              "trailslab lab; re-run with --yes to do it", flush=True)
        return 0

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import cycle_sources as S
    with S.lab_connect() as c:
        with c.cursor() as cur:
            cur.execute("SET lock_timeout='600s'")
            cur.execute("DROP TABLE IF EXISTS cycle_landcover_new")
            cur.execute("TRUNCATE TABLE cycle_landcover")
            print("truncated", flush=True)
        c.commit()
        with c.cursor() as cur:
            cur.execute("select pg_size_pretty(pg_total_relation_size('cycle_landcover'))")
            print("cycle_landcover:", cur.fetchone()[0], flush=True)
            cur.execute("select pg_size_pretty(pg_database_size(current_database()))")
            print("database:", cur.fetchone()[0], flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
