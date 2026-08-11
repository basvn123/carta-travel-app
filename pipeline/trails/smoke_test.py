"""Smoke test for the trailslab PostGIS staging DB.

Proves the acceptance criteria of the content-lab foundation:
  1. the container schema applied (extensions, tables, enums exist),
  2. a trip with 3D geometry round-trips intact (Z survives insert and read),
  3. trip_stops cascade from their trip,
  4. the images NC/ND guard rejects at insert time.

Run from the repo root after `docker compose up -d` in tools/trailslab:
    python pipeline/trails/smoke_test.py

Inserts are cleaned up at the end; the test leaves no rows behind.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import connect  # noqa: E402

import psycopg  # noqa: E402

# A short Zermatt-ish ridge line with plausible elevations in metres.
WKT_3D = (
    "MULTILINESTRING Z((7.658 45.976 1620, 7.661 45.979 1685, "
    "7.665 45.983 1740))"
)


def fail(msg):
    print("[FAIL]", msg)
    sys.exit(1)


def main():
    try:
        conn = connect()
    except psycopg.OperationalError as exc:
        fail(
            "cannot connect to trailslab on port 5433. Is the container up? "
            "(cd tools/trailslab && docker compose up -d)\n" + str(exc)
        )

    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT postgis_full_version(), pgr_version()")
            postgis, pgr = cur.fetchone()
            print("[ok] postgis:", postgis.split(" GEOS")[0])
            print("[ok] pgrouting:", pgr)

            cur.execute(
                """
                INSERT INTO trips (country, category, title, geom,
                                   distance_m, ascent_m, source, license,
                                   raw_tags)
                VALUES ('CH', 'hike', 'Smoke test ridge',
                        ST_GeomFromText(%s, 4326),
                        820, 120, 'smoke_test', 'ODbL 1.0',
                        '{"sac_scale": "T2"}'::jsonb)
                RETURNING id
                """,
                (WKT_3D,),
            )
            trip_id = cur.fetchone()[0]
            print(f"[ok] inserted trip id={trip_id}")

            cur.execute(
                """
                INSERT INTO trip_stops (trip_id, seq, poi_ref, dwell_min,
                                        leg_mode, leg_duration_min, leg_geom)
                VALUES (%s, 1, 'poi:smoke', 30, 'walk', 25,
                        ST_GeomFromText(
                            'LINESTRING(7.658 45.976, 7.661 45.979)', 4326))
                """,
                (trip_id,),
            )

            cur.execute(
                """
                SELECT ST_NDims(geom), ST_NPoints(geom), ST_ZMax(geom),
                       ST_SRID(geom), ST_AsText(geom), status::text,
                       raw_tags->>'sac_scale'
                FROM trips WHERE id = %s
                """,
                (trip_id,),
            )
            ndims, npoints, zmax, srid, wkt, status, sac = cur.fetchone()
            if ndims != 3:
                fail(f"expected 3D geometry back, got ST_NDims={ndims}")
            if npoints != 3 or int(zmax) != 1740 or srid != 4326:
                fail(f"geometry mangled: npoints={npoints} zmax={zmax} srid={srid}")
            if status != "draft" or sac != "T2":
                fail(f"defaults or jsonb wrong: status={status} sac={sac}")
            print(f"[ok] 3D round trip: {npoints} points, zmax={zmax:.0f}, srid={srid}")
            print("[ok] wkt:", wkt[:60] + "...")

            # The NC/ND guard must reject at insert; savepoint keeps the
            # transaction alive after the expected error.
            cur.execute("SAVEPOINT nc_probe")
            try:
                cur.execute(
                    """
                    INSERT INTO images (subject_type, subject_id, url, license)
                    VALUES ('trip', %s, 'https://example.com/x.jpg',
                            'CC BY-NC 4.0')
                    """,
                    (trip_id,),
                )
                fail("images accepted a CC BY-NC license; the guard is broken")
            except psycopg.errors.CheckViolation:
                cur.execute("ROLLBACK TO SAVEPOINT nc_probe")
                print("[ok] images rejected CC BY-NC at insert")

            cur.execute(
                """
                INSERT INTO images (subject_type, subject_id, url, license,
                                    attribution_text)
                VALUES ('trip', %s, 'https://example.com/x.jpg',
                        'CC BY-SA 4.0', 'Photo: Smoke Tester, CC BY-SA 4.0')
                RETURNING id
                """,
                (trip_id,),
            )
            print("[ok] images accepted CC BY-SA")

            # Clean up; the stop must go with the trip via ON DELETE CASCADE.
            cur.execute("DELETE FROM images WHERE subject_type='trip' AND subject_id=%s", (trip_id,))
            cur.execute("DELETE FROM trips WHERE id = %s", (trip_id,))
            cur.execute("SELECT count(*) FROM trip_stops WHERE trip_id = %s", (trip_id,))
            if cur.fetchone()[0] != 0:
                fail("trip_stops did not cascade on trip delete")
            print("[ok] cascade delete cleaned up the stops")

    conn.close()
    print("PASS: trailslab foundation is up and behaves")


if __name__ == "__main__":
    main()
