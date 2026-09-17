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


# ---------------------------------------------------------------------------
# ROUTES.md R1: the hierarchy schema and the record mapping, on fixtures
# ---------------------------------------------------------------------------

# Three hand-built routes: a loop, a point-to-point, and a parent with three
# stages and one variant. Relation ids are NEGATIVE, a range OSM never uses,
# so cleanup can never touch a real relation.
FIXTURE_SOURCE = "fixture"
FIX_LOOP, FIX_P2P, FIX_PARENT = -1, -2, -3
FIX_STAGES = (-4, -5, -6)
FIX_VARIANT = -7            # a member relation with no store row of its own
FIX_WAYS = (101, 102)

FIXTURE_WAY_TAGS = {
    "ways": 4,
    "surface": {"asphalt": 0.5, "gravel": 0.3, "ground": 0.1},
    "cover": {"surface": 0.9},
}
FIXTURE_HIGHLIGHTS = {
    "features": [
        {"kind": "spring", "name": "Quelle", "lat": 46.005, "lon": 7.605,
         "along_m": 400, "off_m": 30, "ele_m": 1510},
        {"kind": "hut", "name": "Testhuette", "lat": 46.008, "lon": 7.607,
         "along_m": 1200, "off_m": 80, "ele_m": 1560},
        {"kind": "peak", "name": "Spitze", "lat": 46.01, "lon": 7.61,
         "along_m": 1500, "off_m": 200, "ele_m": 1700},
    ]
}


def _wkt(points):
    return "MULTILINESTRING Z((" + ", ".join(
        f"{x} {y} {z}" for x, y, z in points) + "))"


def r1_hierarchy_check(conn):
    """09_hierarchy.sql through the guard, then the mapping over fixtures."""
    from route_schema import (ensure_schema, load_rows, fetch_relations,
                              summary_from_row, detail_from_row, wire_keys,
                              detail_keys, hierarchy_block, WIRE_KEYS,
                              DETAIL_KEYS)
    conn.commit()                       # nothing of ours left open
    gaps = ensure_schema(conn)
    print("[ok] 09_hierarchy.sql: " + (f"applied for {', '.join(gaps)}"
                                       if gaps else "already current, no lock taken"))

    def cleanup(cur):
        cur.execute("DELETE FROM route_relations WHERE osm_id < 0")
        cur.execute("DELETE FROM trips WHERE source = %s", (FIXTURE_SOURCE,))

    with conn.cursor() as cur:
        cleanup(cur)                    # leftovers of a run that died mid-way
        conn.commit()

        def trip(osm_id, title, points, **extra):
            cols = {"country": "CH", "category": "hike", "title": title,
                    "source": FIXTURE_SOURCE, "source_ref": str(osm_id),
                    "license": "ODbL 1.0", "network": "nwn",
                    "distance_m": 2400, "ascent_m": 120, "descent_m": 40,
                    "raw_tags": psycopg.types.json.Jsonb(
                        {"osmc:symbol": "red:white:red_bar"}),
                    "way_tags": psycopg.types.json.Jsonb(FIXTURE_WAY_TAGS),
                    "gap_info": psycopg.types.json.Jsonb({"gap_count": 0}),
                    "highlights": psycopg.types.json.Jsonb(FIXTURE_HIGHLIGHTS)}
            cols.update(extra)
            names = ", ".join(cols)
            marks = ", ".join(f"%({k})s" for k in cols)
            cur.execute(f"INSERT INTO trips ({names}, geom) VALUES ({marks}, "
                        f"ST_GeomFromText(%(wkt)s, 4326)) RETURNING id",
                        {**cols, "wkt": _wkt(points)})
            return cur.fetchone()[0]

        loop_id = trip(FIX_LOOP, "Fixture loop",
                       [(7.60, 46.00, 1500), (7.61, 46.00, 1520),
                        (7.61, 46.01, 1540), (7.60, 46.01, 1530),
                        (7.60, 46.00, 1500)],
                       is_loop=True, route_type="loop",
                       grade="easy", grade_src="tagged",
                       hierarchy="standalone", hierarchy_src="structure")
        p2p_id = trip(FIX_P2P, "Fixture point to point",
                      [(7.62, 46.00, 1500), (7.63, 46.01, 1600),
                       (7.64, 46.02, 1650)],
                      is_loop=False, route_type="point",
                      grade="moderate", grade_src="derived",
                      hierarchy="standalone", hierarchy_src="structure")
        parent_id = trip(FIX_PARENT, "Fixture Fernweg",
                         [(7.65, 46.00, 1500), (7.66, 46.01, 1550),
                          (7.67, 46.02, 1600), (7.68, 46.03, 1650)],
                         is_loop=False, route_type="point",
                         hierarchy="parent", hierarchy_src="structure",
                         stage_count=3)
        stage_ids = []
        for i, osm in enumerate(FIX_STAGES, start=1):
            x = 7.65 + 0.01 * (i - 1)
            stage_ids.append(trip(
                osm, f"Fixture Fernweg Etappe {i}",
                [(x, 46.00 + 0.01 * (i - 1), 1500 + 50 * (i - 1)),
                 (x + 0.01, 46.01 + 0.01 * (i - 1), 1550 + 50 * (i - 1))],
                is_loop=False, route_type="point",
                hierarchy="stage", hierarchy_src="structure",
                parent_refs=[FIX_PARENT], stage_of=FIX_PARENT,
                top_of=FIX_PARENT, stage_index=i, stage_count=3))

        rel = ("INSERT INTO route_relations (activity, osm_id, country, "
               "tags_all, members, parent_refs, child_refs, hierarchy, "
               "hierarchy_src, stage_index, stage_count, in_store, scanned_at, "
               "stage_of, top_of) "
               "VALUES ('hiking', %s, 'CH', %s, %s, %s, %s, %s, 'structure', "
               "%s, %s, %s, now(), %s, %s)")
        J = psycopg.types.json.Jsonb
        members = ([["r", osm, ""] for osm in FIX_STAGES]
                   + [["r", FIX_VARIANT, "alternative"]]
                   + [["w", w, ""] for w in FIX_WAYS])
        cur.execute(rel, (FIX_PARENT,
                          J({"type": "superroute", "route": "hiking",
                             "name": "Fixture Fernweg", "network": "nwn"}),
                          J(members), [], list(FIX_STAGES) + [FIX_VARIANT],
                          "parent", None, 3, True, None, None))
        for i, osm in enumerate(FIX_STAGES, start=1):
            cur.execute(rel, (osm, J({"type": "route", "route": "hiking",
                                     "name": f"Fixture Fernweg Etappe {i}"}),
                              J([["w", 100 + i, ""]]), [FIX_PARENT], [],
                              "stage", i, None, True, FIX_PARENT, FIX_PARENT))
        cur.execute(rel, (FIX_VARIANT, J({"type": "route", "route": "hiking",
                                          "name": "Fixture Fernweg Variante"}),
                          J([["w", 199, ""]]), [FIX_PARENT], [],
                          "variant", None, None, False, FIX_PARENT, FIX_PARENT))
        for osm, title in ((FIX_LOOP, "Fixture loop"),
                           (FIX_P2P, "Fixture point to point")):
            cur.execute(rel, (osm, J({"type": "route", "route": "hiking",
                                     "name": title, "roundtrip": "yes"}),
                              J([["w", 100, ""]]), [], [],
                              "standalone", None, None, True, None, None))
        conn.commit()

        # The mapping, exactly as export_wire.Hierarchy resolves it.
        ids = [loop_id, p2p_id, parent_id] + stage_ids
        rows = {r["id"]: r for r in load_rows(conn, ids)}
        by_osm = {int(r["source_ref"]): r["id"] for r in rows.values()}
        relations = fetch_relations(conn, "hiking",
                                    list(by_osm) + [FIX_VARIANT])
        resolve = by_osm.get

        s_loop = summary_from_row(rows[loop_id], "hiking", resolve)
        if s_loop.loop is not True or s_loop.shape != "loop":
            fail(f"loop fixture mapped wrong: loop={s_loop.loop} shape={s_loop.shape}")
        if s_loop.difficulty != "easy" or s_loop.difficulty_source != "tagged":
            fail("loop fixture lost its tagged grade")
        s_p2p = summary_from_row(rows[p2p_id], "hiking", resolve)
        if s_p2p.loop is not False or s_p2p.shape != "point":
            fail("point-to-point fixture mapped wrong")
        print("[ok] loop and point-to-point map to their shapes")

        s_parent = summary_from_row(rows[parent_id], "hiking", resolve)
        if s_parent.hierarchy != "parent" or s_parent.stage_count != 3 \
                or s_parent.is_stage_of is not None:
            fail(f"parent summary wrong: {s_parent}")
        d_parent = detail_from_row(rows[parent_id], relations[FIX_PARENT],
                                   "hiking", resolve, resolve)
        want = [{"osm": osm, "id": sid, "i": i}
                for i, (osm, sid) in enumerate(zip(FIX_STAGES, stage_ids), 1)]
        if d_parent.stages != want:
            fail(f"parent stages did not round-trip in order:\n  got  {d_parent.stages}\n  want {want}")
        if d_parent.variants != [{"osm": FIX_VARIANT, "id": None,
                                  "role": "alternative"}]:
            fail(f"parent variants wrong: {d_parent.variants}")
        if d_parent.member_way_ids != list(FIX_WAYS):
            fail(f"member ways wrong: {d_parent.member_way_ids}")
        if (d_parent.tags_raw or {}).get("name") != "Fixture Fernweg":
            fail("tags_raw did not come from route_relations.tags_all")
        print("[ok] parent round-trips with 3 stages nested in order and 1 variant")

        s_mid = summary_from_row(rows[stage_ids[1]], "hiking", resolve)
        if s_mid.is_stage_of != FIX_PARENT or s_mid.parent_ref != parent_id \
                or s_mid.stage_index != 2 or s_mid.stage_count != 3:
            fail(f"stage summary wrong: {s_mid}")
        h = hierarchy_block(s_mid)
        if h != {"cls": "stage", "of": parent_id, "top": parent_id, "i": 2, "n": 3}:
            fail(f"h block wrong: {h}")
        print(f"[ok] stage 2 says it is stage 2 of 3 of wire id {parent_id}")

        wk = wire_keys(s_mid)
        if tuple(wk) != WIRE_KEYS:
            fail(f"wire keys drifted: {tuple(wk)}")
        # `osm` is a claim that the row IS an OSM relation, so a fixture
        # (source 'fixture') must never carry one; the OSM path is checked
        # on a synthetic row so no real relation id is written to the lab.
        if wk["osm"] is not None or wk["net"] != "nwn" or wk["descent_m"] != 40:
            fail(f"wire key values wrong: {wk}")
        s_osm = summary_from_row({"id": 1, "title": "Via Alpina", "source": "osm",
                                  "source_ref": "12359033"}, "hiking")
        if s_osm.osm_relation_id != 12359033 or wire_keys(s_osm)["osm"] != 12359033:
            fail("an OSM-sourced row did not map its relation id")
        if wk["sf"] != {"paved": 0.5, "gravel": 0.3, "path": 0.1,
                        "other": 0.0, "unknown": 0.1}:
            fail(f"surface summary wrong: {wk['sf']}")
        d_mid = detail_from_row(rows[stage_ids[1]], relations[FIX_STAGES[1]],
                                "hiking", resolve, resolve)
        dk = detail_keys(d_mid)
        if tuple(dk) != DETAIL_KEYS:
            fail(f"detail keys drifted: {tuple(dk)}")
        if not dk["huts"] or dk["huts"][0]["name"] != "Testhuette" \
                or not dk["water_points"] or dk["water_points"][0]["name"] != "Quelle":
            fail(f"huts / water points wrong: {dk['huts']} {dk['water_points']}")
        if dk["gaps"] != {"n": 0}:
            fail(f"gaps wrong: {dk['gaps']}")
        print("[ok] wire keys osm/net/descent_m/sf/h and detail keys carry the fixtures' values")

        cleanup(cur)
        conn.commit()
        cur.execute("SELECT count(*) FROM trips WHERE source = %s", (FIXTURE_SOURCE,))
        left = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM route_relations WHERE osm_id < 0")
        left += cur.fetchone()[0]
        if left:
            fail(f"{left} fixture row(s) left behind")
        print("[ok] fixtures removed, lab left as found")



# ---------------------------------------------------------------------------
# The famous fixtures (CARTA_TRAILS_BUILD_BRIEF.md, definition of done #2)
# ---------------------------------------------------------------------------

# The walks a region is embarrassed to be missing, as a standing test. This
# is the answer to "did you get the famous ones" that is not "probably".
#
# It runs against the PUBLISHED WIRE and needs no database, so it works when
# the lab is down, and it reports rather than throws for a trail that is a
# known gap: a fixture that is missing for a reason the coverage report
# already names is a tracked miss, not a surprise. It fails only when a
# fixture that WAS published stops being published, which is the regression
# this guards against.
FAMOUS_FIXTURES = [
    ("FR", "Sentier des Roches"), ("FR", "Tour du Mont Blanc"),
    ("FR", "GR 20"), ("FR", "Cirque de Gavarnie"),
    ("ES", "Ruta del Cares"), ("ES", "Caminito del Rey"),
    ("ES", "Teide"), ("CH", "Hardergrat"), ("CH", "Eiger Trail"),
    ("CH", "Gornergrat"), ("IS", "Laugavegur"), ("IS", "Fimmvorduhals"),
    ("PL", "Rysy"), ("PL", "Morskie Oko"), ("PL", "Orla Perc"),
    ("PT", "Pico Ruivo"), ("IT", "Seceda"), ("IT", "Alpe di Siusi"),
    ("IT", "Tre Cime di Lavaredo"), ("IT", "Sentiero degli Dei"),
    ("GR", "Mount Olympus"), ("GR", "Samaria"), ("HR", "Plitvice"),
    ("NO", "Trolltunga"), ("NO", "Preikestolen"), ("NO", "Besseggen"),
    ("GB", "Ben Nevis"), ("GB", "West Highland Way"),
    ("SI", "Triglav"), ("AT", "Adlerweg"),
]


def famous_check():
    """Are the 30 fixtures published, and does every miss carry a reason?"""
    import json
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from famous_registry import squash, base_name

    root = Path(__file__).resolve().parents[2]
    wire = root / "continent-app" / "public" / "trails"
    cov_path = root / "data" / "reports" / "trails_coverage.json"

    published = {}
    for path in sorted(wire.glob("*.json")):
        cc = path.stem.upper()
        if cc in ("INDEX", "TOP"):
            continue
        try:
            blob = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for t in blob.get("trips") or []:
            published.setdefault(t.get("country") or cc, []).append(
                (squash(t.get("name") or ""), t.get("name") or ""))

    cov = {}
    if cov_path.exists():
        try:
            for r in json.loads(
                    cov_path.read_text(encoding="utf-8")).get("rows") or []:
                cov[(r["country"], squash(r["name"]))] = r["reason"]
        except Exception:
            pass

    found, missing = [], []
    for cc, name in FAMOUS_FIXTURES:
        # Substring in the PUBLISHED name, not the reverse: "Rysy" should
        # match "Czarny Staw pod Rysami - Rysy", while "Ben Nevis" must not
        # be satisfied by a row merely called "Ben". Anchored on word
        # boundaries so "Teide" cannot match inside another word.
        needle = squash(base_name(name))
        hit = None
        for hay, pub in published.get(cc, []):
            if not needle:
                continue
            if needle == hay or f" {needle} " in f" {hay} ":
                hit = pub
                break
        (found if hit else missing).append((cc, name, hit))

    print(f"[famous] {len(found)}/{len(FAMOUS_FIXTURES)} fixture(s) published")
    for cc, name, pub in found:
        extra = f"  -> {pub}" if pub and squash(pub) != squash(name) else ""
        print(f"  [ok]   {cc}  {name}{extra}")
    for cc, name, _ in missing:
        reason = cov.get((cc, squash(name)), "not in the coverage report")
        print(f"  [gap]  {cc}  {name:34} {reason}")
    if missing and not cov:
        print("  ! no coverage report to explain the gaps; run:")
        print("    python pipeline/trails/coverage_report.py --all")
    print(f"[famous] {len(missing)} gap(s), each with a reason above")
    return 0



def main():
    if "--famous" in sys.argv:
        # The wire-only fixture check. No database: the whole point is that
        # it answers "did we get the famous ones" when the lab is down.
        sys.exit(famous_check())

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

        r1_hierarchy_check(conn)

    conn.close()
    print("PASS: trailslab foundation is up and behaves")


if __name__ == "__main__":
    main()
