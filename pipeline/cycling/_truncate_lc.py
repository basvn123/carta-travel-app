import sys, os
sys.path.insert(0, os.path.abspath('pipeline/cycling'))
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
