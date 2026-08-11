"""Regression gate for published trailslab content.

validate.py routes DRAFTS only: it refreshes quality_score for everything but
moves nobody a human has already decided on, which is exactly what keeps
`approved` a human-only status. That leaves one gap. A published trip is
re-validated like everyone else, and OSM churn, a re-ingest that drops half a
relation, or a fresh DEM pass can turn yesterday's good route into today's
broken one. Nothing was watching that score.

This watches it. A published trip whose refreshed quality_score falls below
the same threshold that lets a draft into the review queue
(validate.CONFIG["needs_review_min"]) is DEMOTED to needs_review and recorded
in the freshness report. It is never unpublished into a dead end, never
rejected, never deleted: needs_review puts it back in front of a human in the
review app with its failing checks attached, and only a human can approve it
again. The review API already defers to this path (its decision endpoint
refuses to touch a published trip and says so).

Two ledgers get a row, the same two the review app writes:
  validation_runs  check_name='quality_regression' (append-only machine half)
  trip_reviews     action='reopen', reviewer='pipeline:trails_validate'
                   (human half, so the trip's own history explains the move)

A trip that merely SLIPPED, more than --max-drop points below the score
recorded when a human approved it but still above the floor, stays published
and is reported as a `watch` entry. Only the floor demotes: a 95 to 80 slide
is worth a look, not an eviction.

Only trips re-validated inside --since-hours are judged, so a stale score can
never demote anything; published trips nobody has re-validated in that window
are counted as stale in the report instead.

Output: data/derived/trails_freshness.json, which run_pipeline.py folds into
data/derived/freshness_report.json under "trails".

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/regression.py                   # published only
    python pipeline/trails/regression.py --dry-run --verbose
    python pipeline/trails/regression.py --statuses published,approved
"""

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402  (also puts pipeline/ on sys.path)
from validate import CONFIG, PILOT_COUNTRIES  # noqa: E402

REPORT = ROOT / "data" / "derived" / "trails_freshness.json"
REVIEWS_DDL = ROOT / "tools" / "trailslab" / "initdb" / "04_trip_reviews.sql"

# Who the ledger says did this. A machine name on purpose: a curator reading
# a trip's history must be able to tell an automatic reopen from their own.
REVIEWER = "pipeline:trails_validate"

# Statuses this gate may demote. Draft and needs_review are validate.py's job;
# rejected is already out.
DEMOTABLE = ("published", "approved")
DEMOTED_TO = "needs_review"

STALE_DAYS = 90            # report a published trip unvalidated this long


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

def fetch_trips(conn, statuses, countries):
    """Every trip in the watched statuses, validated or not."""
    sql = ["""SELECT t.id, t.country, t.title, t.status::text, t.quality_score,
                     t.last_validated_at
              FROM trips t
              WHERE t.status::text = ANY(%s)"""]
    params = [list(statuses)]
    if countries:
        sql.append("AND t.country = ANY(%s)")
        params.append(list(countries))
    sql.append("ORDER BY t.country, t.id")
    with conn.cursor() as cur:
        cur.execute(" ".join(sql), params)
        cols = ("id", "country", "title", "status", "quality", "validated_at")
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def failing_checks(conn, ids):
    """Newest row per (trip, check) that did not pass, so a demotion can say
    what actually broke. Append-only table: newest row wins."""
    if not ids:
        return {}
    out = defaultdict(list)
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (subject_id, check_name)
                   subject_id, check_name, passed, score
            FROM validation_runs
            WHERE subject_type = 'trip' AND subject_id = ANY(%s)
            ORDER BY subject_id, check_name, run_at DESC, id DESC""", (ids,))
        for sid, name, passed, score in cur.fetchall():
            if not passed and name != "quality_regression":
                out[sid].append({"check": name,
                                 "score": float(score) if score is not None else None})
    return out


def review_scores(conn, ids):
    """The quality_score a human saw when they last decided on each trip; the
    baseline a slip is measured against."""
    if not ids:
        return {}
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (trip_id) trip_id, quality_score, action, created_at
            FROM trip_reviews
            WHERE quality_score IS NOT NULL AND trip_id = ANY(%s)
            ORDER BY trip_id, created_at DESC, id DESC""", (ids,))
        return {tid: {"quality": float(q), "action": action, "at": at}
                for tid, q, action, at in cur.fetchall()}


# ---------------------------------------------------------------------------
# Writes (demotion only; nothing here unpublishes or deletes)
# ---------------------------------------------------------------------------

INSERT_CHECK_SQL = """
    INSERT INTO validation_runs
        (subject_type, subject_id, check_name, passed, score, details)
    VALUES ('trip', %s, 'quality_regression', false, %s, %s)
"""

INSERT_REVIEW_SQL = """
    INSERT INTO trip_reviews
        (trip_id, action, reviewer, note, prev_status, new_status, quality_score)
    VALUES (%s, 'reopen', %s, %s, %s::trip_status, %s::trip_status, %s)
"""


def demote(conn, rows, floor):
    """Move the regressed trips to needs_review and write both ledger halves.
    The UPDATE re-checks the status it expects, so a curator who moved the
    trip between the read and this write is never overwritten."""
    moved = 0
    with conn.cursor() as cur:
        for r in rows:
            cur.execute(
                "UPDATE trips SET status = %s::trip_status "
                "WHERE id = %s AND status::text = %s",
                (DEMOTED_TO, r["id"], r["status"]))
            if not cur.rowcount:          # status changed under us; leave it
                r["skipped"] = "status changed during the run"
                continue
            moved += 1
            note = (f"quality_score {r['quality']:.1f} fell below the "
                    f"regression floor {floor:g}; returned to the review queue")
            if r["failing"]:
                note += " (failing: " + ", ".join(
                    c["check"] for c in r["failing"]) + ")"
            cur.execute(INSERT_CHECK_SQL, (r["id"], r["quality"], Jsonb({
                "floor": floor,
                "quality_score": r["quality"],
                "prev_status": r["status"],
                "new_status": DEMOTED_TO,
                "failing_checks": r["failing"],
                "review_baseline": r.get("baseline"),
                "last_validated_at": r["validated_at"].isoformat()
                if r["validated_at"] else None,
            })))
            cur.execute(INSERT_REVIEW_SQL, (r["id"], REVIEWER, note,
                                            r["status"], DEMOTED_TO, r["quality"]))
    conn.commit()
    return moved


# ---------------------------------------------------------------------------
# Report (freshness_report.json pattern: meta + per-subject entries)
# ---------------------------------------------------------------------------

def country_rollup(trips, now, regressed_ids, watch_ids):
    """Per country: what is out there, how fresh its validation is, and how
    much of it regressed this run. n_regressed counts what fell below the
    floor; meta.n_demoted counts what actually moved (nothing, on a dry run)."""
    out = {}
    by_country = defaultdict(list)
    for t in trips:
        by_country[t["country"]].append(t)
    for country in sorted(by_country):
        rows = by_country[country]
        stamps = [t["validated_at"] for t in rows if t["validated_at"]]
        entry = {
            "n_trips": len(rows),
            "by_status": dict(sorted(Counter(t["status"] for t in rows).items())),
            "never_validated": sum(1 for t in rows if not t["validated_at"]),
            "n_regressed": sum(1 for t in rows if t["id"] in regressed_ids),
            "n_watch": sum(1 for t in rows if t["id"] in watch_ids),
        }
        if stamps:
            oldest, newest = min(stamps), max(stamps)
            entry["newest_validated"] = newest.isoformat(timespec="seconds")
            entry["oldest_validated"] = oldest.isoformat(timespec="seconds")
            entry["age_days"] = round((now - oldest).total_seconds() / 86400, 1)
            entry["stale"] = sum(
                1 for s in stamps
                if (now - s) >= timedelta(days=STALE_DAYS))
        scores = [float(t["quality"]) for t in rows if t["quality"] is not None]
        if scores:
            entry["quality_min"] = round(min(scores), 1)
            entry["quality_median"] = round(sorted(scores)[len(scores) // 2], 1)
        out[country] = entry
    return out


def write_report(report):
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=1), encoding="utf-8")


def entry(r, floor):
    return {
        "id": r["id"],
        "country": r["country"],
        "title": r["title"],
        "status": r["status"],
        "quality_score": round(r["quality"], 1),
        "floor": floor,
        "failing_checks": [c["check"] for c in r["failing"]],
        "review_baseline": r.get("baseline"),
        "last_validated_at": (r["validated_at"].isoformat(timespec="seconds")
                              if r["validated_at"] else None),
    }


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def main():
    sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(
        description="Demote published trips whose re-validation regressed "
                    "below the review threshold, and report the freshness of "
                    "the published set.")
    parser.add_argument("--countries", default=PILOT_COUNTRIES,
                        help=f"comma-separated ISO codes, empty for all "
                             f"(default: {PILOT_COUNTRIES})")
    parser.add_argument("--statuses", default="published",
                        help="statuses to police (default: published; "
                             "published,approved also polices the export queue)")
    parser.add_argument("--floor", type=float,
                        default=float(CONFIG["needs_review_min"]),
                        help="demote below this quality_score "
                             f"(default {CONFIG['needs_review_min']:g}, the "
                             "same threshold that admits a draft)")
    parser.add_argument("--max-drop", type=float, default=15.0,
                        help="points below the score at review time that make "
                             "a still-passing trip a watch entry (default 15)")
    parser.add_argument("--since-hours", type=float, default=48.0,
                        help="only judge trips re-validated this recently; "
                             "0 judges any score however old (default 48)")
    parser.add_argument("--dry-run", action="store_true",
                        help="detect and report only, demote nothing")
    parser.add_argument("--verbose", action="store_true",
                        help="one line per regressed trip")
    args = parser.parse_args()

    statuses = [s.strip() for s in args.statuses.split(",") if s.strip()]
    unknown = [s for s in statuses if s not in DEMOTABLE]
    if unknown:
        parser.error(f"cannot police {', '.join(unknown)}: this gate only "
                     f"demotes {', '.join(DEMOTABLE)} (drafts are validate.py's job)")
    countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]

    conn = connect()
    with conn.cursor() as cur:      # labs created before the review app exists
        cur.execute(REVIEWS_DDL.read_text(encoding="utf-8"))
    conn.commit()

    now = datetime.now(timezone.utc)
    trips = fetch_trips(conn, statuses, countries)
    conn.commit()
    cutoff = (now - timedelta(hours=args.since_hours)) if args.since_hours else None

    judged, unjudged = [], 0
    for t in trips:
        if t["quality"] is None or not t["validated_at"]:
            unjudged += 1
            continue
        if cutoff and t["validated_at"] < cutoff:
            unjudged += 1
            continue
        t["quality"] = float(t["quality"])
        judged.append(t)

    ids = [t["id"] for t in judged]
    failing = failing_checks(conn, ids)
    baselines = review_scores(conn, ids)
    conn.commit()

    regressed, watch = [], []
    for t in judged:
        t["failing"] = failing.get(t["id"], [])
        base = baselines.get(t["id"])
        if base:
            t["baseline"] = {"quality_score": round(base["quality"], 1),
                             "action": base["action"],
                             "at": base["at"].isoformat(timespec="seconds"),
                             "drop": round(base["quality"] - t["quality"], 1)}
        if t["quality"] < args.floor:
            regressed.append(t)
        elif base and base["quality"] - t["quality"] > args.max_drop:
            watch.append(t)

    print(f"{len(trips)} trips in {', '.join(statuses)}"
          f"{' (' + ', '.join(countries) + ')' if countries else ''}: "
          f"{len(judged)} judged, {unjudged} skipped (no fresh validation)")
    if args.verbose:
        for t in regressed:
            print(f"  REGRESSED [{t['id']}] {t['title'][:48]} ({t['country']}): "
                  f"{t['quality']:.1f} < {args.floor:g}"
                  + (" failing: " + ", ".join(c["check"] for c in t["failing"])
                     if t["failing"] else ""))
        for t in watch:
            print(f"  watch     [{t['id']}] {t['title'][:48]} ({t['country']}): "
                  f"{t['quality']:.1f}, down {t['baseline']['drop']:.1f} "
                  f"since {t['baseline']['action']}")

    moved = 0
    if regressed and not args.dry_run:
        moved = demote(conn, regressed, args.floor)
    conn.close()

    regressed_ids = {t["id"] for t in regressed}
    watch_ids = {t["id"] for t in watch}
    report = {
        "meta": {
            "generated_at": now.isoformat(timespec="seconds"),
            "db": "tools/trailslab (local PostGIS staging)",
            "statuses": statuses,
            "countries": countries or "all",
            "floor": args.floor,
            "max_drop": args.max_drop,
            "since_hours": args.since_hours,
            "stale_days": STALE_DAYS,
            "n_trips": len(trips),
            "n_judged": len(judged),
            "n_regressed": len(regressed),
            "n_demoted": moved,
            "n_watch": len(watch),
            "dry_run": bool(args.dry_run),
            "policy": (f"below {args.floor:g} a published trip is demoted to "
                       f"{DEMOTED_TO} and reopened in the review queue; it is "
                       "never unpublished, rejected or deleted"),
        },
        "countries": country_rollup(trips, now, regressed_ids, watch_ids),
        "regressions": [entry(t, args.floor) for t in regressed],
        "watch": [entry(t, args.floor) for t in watch],
    }
    write_report(report)

    if regressed:
        print(f"{len(regressed)} regressed below {args.floor:g}: "
              + ("nothing demoted (dry run)" if args.dry_run
                 else f"{moved} demoted to {DEMOTED_TO}, reopened for review"))
        skipped = [t for t in regressed if t.get("skipped")]
        if skipped:
            print(f"  {len(skipped)} left alone: " + ", ".join(
                f"{t['id']} ({t['skipped']})" for t in skipped[:5]))
    else:
        print(f"no regressions below {args.floor:g}")
    if watch:
        print(f"{len(watch)} watch entries (down more than {args.max_drop:g} "
              "points since review, still published)")
    print(f"report -> {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
