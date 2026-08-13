"""Travelpayouts (Aviasales) cached cheapest fares: the flight coverage
backfill for carriers Carta cannot harvest directly (easyJet, Brussels
Airlines, Norwegian, Pegasus, Transavia, legacy flag carriers). Direct
carrier scraping stays primary; this collector only STAGES third party
cache quotes. The merge into the live fare files is a separate step and is
cheapest wins, so a cached quote never overrides a cheaper direct fare.

The data is the Aviasales search cache (roughly the last 48h of searches),
served from api.travelpayouts.com with the account token in the
X-Access-Token header. Caching on our side is explicitly encouraged by the
provider; quotes that carry an expires_at have it honoured at write time.

Flow per origin (origin set = the per origin fare files the app actually
serves, continent-app/public/fares/*.json, PRN_ style escapes unescaped):
  1. /v1/city-directions          city to anywhere, the discovery workhorse.
     Its prices are round trips, so it only ranks pairs, nothing is staged.
  2. /aviasales/v3/prices_for_dates   one way dated quotes for the top
     TP_TOP_PAIRS pairs over TP_MONTHS departure months. These carry real
     one way prices, airport level codes and deeplinks: the staple of the
     staged output.
  3. /v1/prices/calendar          month calendar for the top TP_CAL_PAIRS
     pairs. Stored raw for the estimation layer; entries are staged only
     when they carry no return_at (a round trip price is not a one way fare).

Raw responses are batched into one gzipped JSON per endpoint under
data/raw/travelpayouts/<day>/ with the usual manifest. The normalized
staging file (contract B) lands at data/derived/tp_fares.json:
  { "meta": {"generated_at": iso, "origins": [...]},
    "fares": [{"org","dst","d","eur","link","obs","exp"}] }
eur is integer cents, obs/exp are unix epoch days, already expired quotes
are dropped at write time. Quotes without a provider expires_at get a one
day TTL, the provider's own caching recommendation.

Rate limits (per minute): city-directions 600, v3 methods 600, calendar
300. The 0.25s host spacing keeps the collector near 240/min, under all
three; on a 429 it additionally sleeps out the X-Rate-Limit-Reset header.

run_all --check probes the host through its static airports directory
(the API paths themselves 404 on HEAD, so they make useless probes). The
token is validated by the first real call, which reports SKIP with
instructions when it is rejected (the API GETs 401 keyless).

Env knobs (see .env.example): TRAVELPAYOUTS_TOKEN (required), TP_ORIGINS /
TP_MAX_ORIGINS (smoke runs), TP_TOP_PAIRS, TP_CAL_PAIRS, TP_MONTHS,
TP_PFD_LIMIT, TP_DIRECT_ONLY.
"""
import gzip
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from ..core import config
from ..core.collector import Collector
from ..core.errors import AuthMissing, HTTPFailed
from ..core.registry import register
from ..core.storage import utcnow

API_BASE = config.env("TRAVELPAYOUTS_API_BASE", "https://api.travelpayouts.com")
FARES_DIR = config.ROOT / "continent-app" / "public" / "fares"
DERIVED_PATH = config.ROOT / "data" / "derived" / "tp_fares.json"
EVIDENCE_PATH = config.ROOT / "data" / "derived" / "tp_service_evidence.json"

# Airline codes of the directly harvested carrier families. Their service
# calendars in the fare table are COMPLETE (farefinder/timetable harvests
# return every bookable day, so a missing stored day is a day they do not
# fly). Only quotes from OTHER airlines therefore prove that a route flies
# on days/months the direct harvest cannot see, which is what the estimate
# bands' service gate needs.
HARVESTED_FAMILY = {"FR", "RK", "RR",   # Ryanair group (incl. Ryanair UK)
                    "W6", "W4", "W9",   # Wizz Air group (Malta, UK)
                    "VY", "V7"}         # Vueling, Volotea

DAY_SECONDS = 86400
# Three letter DOS device names that collide with IATA codes; their fare
# files ship with a trailing underscore (the fareFile.js escape).
_RESERVED_IATA = {"CON", "PRN", "AUX", "NUL"}


def app_origins():
    """Origin airports the app serves, read straight from the shipped fare
    files so new origins are covered automatically."""
    codes = set()
    for path in FARES_DIR.glob("*.json"):
        stem = path.stem.upper()
        if stem.endswith("_") and stem[:-1] in _RESERVED_IATA:
            stem = stem[:-1]
        if len(stem) == 3 and stem.isalpha():
            codes.add(stem)
    return sorted(codes)


def direct_pairs(origins):
    """(origin, anchor) pairs that already have direct carrier fares in the
    shipped per origin files. Only used for the coverage report: how much of
    the staged cache data reaches routes the direct harvest cannot see."""
    pairs = set()
    for org in origins:
        stem = org + "_" if org in _RESERVED_IATA else org
        path = FARES_DIR / f"{stem}.json"
        if not path.exists():
            continue
        try:
            table = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for anchor, rec in table.items():
            if isinstance(rec, dict) and rec.get("out"):
                pairs.add((org, anchor.upper()))
    return pairs


def _month_starts(n):
    now = datetime.now(timezone.utc)
    year, month = now.year, now.month
    out = []
    for _ in range(max(n, 1)):
        out.append(f"{year:04d}-{month:02d}")
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return out


def _iso_to_days(value):
    """ISO timestamp to unix epoch days, None when absent or unparsable."""
    if not value:
        return None
    try:
        stamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return int(stamp.timestamp() // DAY_SECONDS)


def _reset_wait(raw):
    """Seconds to sleep for a 429, from X-Rate-Limit-Reset (either seconds
    to reset or an epoch), clamped to something polite."""
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 60.0
    if value > 1e6:  # epoch seconds, not a delta
        value -= time.time()
    return min(max(value, 1.0), 120.0)


def stage_quote(best, entry, org, dst, today, today_days, date=None):
    """Fold one cache quote into the cheapest wins accumulator keyed
    (origin airport, destination airport, departure date). Returns True when
    the quote was usable as a one way dated fare."""
    if not isinstance(entry, dict):
        return False
    if entry.get("return_at"):
        return False  # round trip price, not stageable as a one way fare
    day = str(date or entry.get("departure_at") or "")[:10]
    price = entry.get("price")
    if len(day) != 10 or price is None or day < today:
        return False
    try:
        cents = int(round(float(price) * 100))
    except (TypeError, ValueError):
        return False
    if cents <= 0:
        return False
    origin = str(entry.get("origin_airport") or entry.get("origin") or org).upper()
    dest = str(entry.get("destination_airport") or entry.get("destination") or dst).upper()
    if len(origin) != 3 or len(dest) != 3 or origin == dest:
        return False
    link = str(entry.get("link") or "")
    if link.startswith("/"):
        link = "https://www.aviasales.com" + link
    elif not link:
        link = f"https://www.aviasales.com/search/{origin}{day[8:10]}{day[5:7]}{dest}1"
    expires = _iso_to_days(entry.get("expires_at"))
    if expires is None:
        expires = today_days + 1  # the provider's own 24h caching guidance
    key = (origin, dest, day)
    prev = best.get(key)
    if prev is None or cents < prev[0]:
        best[key] = (cents, link, expires)
    return True


def _note_evidence(routes, org, dst, month, airline):
    if len(org) == 3 and len(dst) == 3 and org != dst and len(month) == 7 and airline:
        routes.setdefault(f"{org}-{dst}", {}).setdefault(month, set()).add(airline)


def build_service_evidence(write=True):
    """Distil every dated raw batch under data/raw/travelpayouts/ into the
    service-evidence artifact data/derived/tp_service_evidence.json:

        { "meta": {...}, "routes": { "ORG-DST": { "YYYY-MM": [airlines] } } }

    A (route, month) entry means the Aviasales cache held at least one REAL
    dated DIRECT itinerary for it, flown by the listed airlines. The estimate
    band merge (harvest_all_origins.merge_est_bands) only keeps a band month
    backed by an airline outside HARVESTED_FAMILY, so an estimate can never
    invent a flight on a route-month nothing verifiably serves. Round-trip
    calendar quotes, useless as one-way fares, still contribute evidence for
    both directions here. Accumulates across ALL raw days on disk, so
    evidence widens with every collector run.
    """
    root = config.DATA_DIR / "travelpayouts"
    routes = {}
    batches = 0
    for day_dir in sorted(root.glob("*")) if root.exists() else []:
        # The storage layer suffixes a timestamp when the plain name is taken
        # (smoke run before a full run), so match every variant of the batch.
        for pfd in sorted(day_dir.glob("prices_for_dates.json*.gz")):
            try:
                wrapper = json.loads(gzip.decompress(pfd.read_bytes()))
            except (OSError, ValueError):
                wrapper = None
            for key, body in ((wrapper or {}).get("responses") or {}).items():
                batches += 1
                parts = key.split("-", 2)      # "ORG-DST-YYYY-MM"
                req_org = parts[0] if len(parts) > 1 else ""
                req_dst = parts[1] if len(parts) > 1 else ""
                for entry in (body or {}).get("data") or []:
                    if not isinstance(entry, dict) or entry.get("transfers"):
                        continue
                    month = str(entry.get("departure_at") or "")[:7]
                    airline = str(entry.get("airline") or "").upper()
                    org = str(entry.get("origin_airport") or req_org).upper()
                    dst = str(entry.get("destination_airport") or req_dst).upper()
                    _note_evidence(routes, org, dst, month, airline)
                    # Requested codes too: the fare table is keyed by them.
                    _note_evidence(routes, req_org, req_dst, month, airline)
        for cal in sorted(day_dir.glob("calendar.json*.gz")):
            try:
                wrapper = json.loads(gzip.decompress(cal.read_bytes()))
            except (OSError, ValueError):
                wrapper = None
            for key, body in ((wrapper or {}).get("responses") or {}).items():
                batches += 1
                parts = key.split("-")          # "ORG-DST"
                if len(parts) != 2:
                    continue
                org, dst = parts[0].upper(), parts[1].upper()
                data = (body or {}).get("data") or {}
                for day, entry in (data.items() if isinstance(data, dict) else []):
                    if not isinstance(entry, dict) or entry.get("transfers"):
                        continue
                    airline = str(entry.get("airline") or "").upper()
                    _note_evidence(routes, org, dst, str(day)[:7], airline)
                    ret_month = str(entry.get("return_at") or "")[:7]
                    _note_evidence(routes, dst, org, ret_month, airline)

    n_months = sum(len(m) for m in routes.values())
    other = sum(1 for m in routes.values() for a in m.values()
                if any(x not in HARVESTED_FAMILY for x in a))
    artifact = {
        "meta": {"generated_at": utcnow(), "raw_batches": batches,
                 "routes": len(routes), "route_months": n_months,
                 "route_months_other_carrier": other,
                 "harvested_family": sorted(HARVESTED_FAMILY)},
        "routes": {k: {m: sorted(v) for m, v in sorted(months.items())}
                   for k, months in sorted(routes.items())},
    }
    if write:
        EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
        EVIDENCE_PATH.write_text(
            json.dumps(artifact, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")
        print(f"    [travelpayouts] service evidence: {len(routes)} routes, "
              f"{n_months} route-months ({other} with a non-harvested airline) "
              f"-> {EVIDENCE_PATH.name}")
    return artifact


@register
class Travelpayouts(Collector):
    name = "travelpayouts"
    group = "pricing"
    description = "Travelpayouts/Aviasales cached fares (backfill for carriers Carta cannot scrape)"
    required_env = ("TRAVELPAYOUTS_TOKEN",)
    # The API paths 404 on HEAD, so reachability is probed through the static
    # airports directory on the same host; auth itself is checked on the
    # first real call (keyless GETs 401 -> AuthMissing -> SKIP).
    static_urls = {"api_host": f"{API_BASE}/data/en/airports.json"}
    min_interval = 0.25

    def _get_json(self, session, path, params, auth_probe=False):
        """One API call. Sleeps out 429s via X-Rate-Limit-Reset; unknown
        codes (400/404) and success:false bodies return None instead of
        raising, they are expected for exotic origin airports."""
        allow = (400, 404, 429, 401, 403) if auth_probe else (400, 404, 429)
        url = API_BASE + path
        for _ in range(5):
            resp = session.get(url, params=params, headers=self._headers,
                               allow_error=allow)
            if resp.status_code in (401, 403):
                raise AuthMissing(
                    f"TRAVELPAYOUTS_TOKEN rejected (HTTP {resp.status_code}): "
                    "check the token in .env (travelpayouts.com account)")
            if resp.status_code == 429:
                wait = _reset_wait(resp.headers.get("X-Rate-Limit-Reset"))
                print(f"    [{self.name}] 429, sleeping {wait:.0f}s")
                time.sleep(wait)
                continue
            if resp.status_code in (400, 404):
                return None
            try:
                body = resp.json()
            except ValueError:
                return None
            if isinstance(body, dict) and body.get("success") is False:
                return None
            return body
        raise HTTPFailed(f"{path} kept returning 429 after 5 waits")

    def _save_gz(self, store, name, responses, note):
        if not responses:
            return
        wrapper = {"fetched_at": utcnow(), "responses": responses}
        payload = gzip.compress(
            json.dumps(wrapper, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        store.save_bytes(name, payload, url=API_BASE,
                         content_type="application/gzip", note=note)

    def collect(self, store, session):
        self._headers = {"X-Access-Token": config.env("TRAVELPAYOUTS_TOKEN")}
        origins = [o.upper() for o in config.env_list("TP_ORIGINS")] or app_origins()
        cap = config.env_int("TP_MAX_ORIGINS", 0)
        if cap > 0:
            origins = origins[:cap]
        if not origins:
            self.fail(f"no origins: nothing in {FARES_DIR} and TP_ORIGINS unset")
            return None
        top_pairs = config.env_int("TP_TOP_PAIRS", 15)
        cal_pairs = config.env_int("TP_CAL_PAIRS", 20)
        # 6 months so evidence + quotes span the app's whole fare window
        # (HORIZON_DAYS = 150), not just the near term.
        months = _month_starts(config.env_int("TP_MONTHS", 6))
        pfd_limit = config.env_int("TP_PFD_LIMIT", 300)
        direct_only = config.env_flag("TP_DIRECT_ONLY", True)

        now = time.time()
        today_days = int(now // DAY_SECONDS)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        citydir_raw, pfd_raw, cal_raw = {}, {}, {}
        best = {}          # (org, dst, date) -> (cents, link, exp_days)
        unresolved = []    # origins the cache knows nothing about
        calls = rt_skipped = 0

        for i, org in enumerate(origins, 1):
            try:
                js = self._get_json(session, "/v1/city-directions",
                                    {"origin": org, "currency": "eur"},
                                    auth_probe=(i == 1))
            except AuthMissing:
                raise
            except Exception as exc:
                self.fail(f"city-directions {org} -> {exc}")
                continue
            calls += 1
            data = (js or {}).get("data") or {}
            if js is not None:
                citydir_raw[org] = js
            if not data:
                unresolved.append(org)
                continue
            # Discovery only: rank this origin's directions cheapest first.
            ranked = sorted(
                (d for d in data
                 if isinstance(data[d], dict) and data[d].get("price")),
                key=lambda d: data[d]["price"])
            ranked = [d.upper() for d in ranked if len(d) == 3 and d.upper() != org]

            for dst in ranked[:top_pairs]:
                for month in months:
                    params = {"origin": org, "destination": dst,
                              "departure_at": month, "one_way": "true",
                              "direct": "true" if direct_only else "false",
                              "sorting": "price", "limit": pfd_limit,
                              "currency": "eur"}
                    try:
                        js2 = self._get_json(
                            session, "/aviasales/v3/prices_for_dates", params)
                    except Exception as exc:
                        self.fail(f"prices_for_dates {org}-{dst} {month} -> {exc}")
                        continue
                    calls += 1
                    if js2 is None:
                        continue
                    pfd_raw[f"{org}-{dst}-{month}"] = js2
                    for entry in js2.get("data") or []:
                        stage_quote(best, entry, org, dst, today, today_days)

            for dst in ranked[:cal_pairs]:
                params = {"origin": org, "destination": dst,
                          "depart_date": months[0],
                          "calendar_type": "departure_date", "currency": "eur"}
                try:
                    js3 = self._get_json(session, "/v1/prices/calendar", params)
                except Exception as exc:
                    self.fail(f"calendar {org}-{dst} -> {exc}")
                    continue
                calls += 1
                if js3 is None:
                    continue
                cal_raw[f"{org}-{dst}"] = js3
                cal_data = js3.get("data") or {}
                for day, entry in (cal_data.items() if isinstance(cal_data, dict) else []):
                    if isinstance(entry, dict) and entry.get("return_at"):
                        rt_skipped += 1
                        continue
                    stage_quote(best, entry, org, dst, today, today_days, date=day)

            if i % 25 == 0 or i == len(origins):
                print(f"    [{self.name}] {i}/{len(origins)} origins, "
                      f"{calls} calls, {len(best)} dated fares so far")

        self._save_gz(store, "city_directions.json.gz", citydir_raw,
                      "v1/city-directions per origin (discovery, round trip prices)")
        self._save_gz(store, "prices_for_dates.json.gz", pfd_raw,
                      "aviasales/v3/prices_for_dates one way quotes per top pair")
        self._save_gz(store, "calendar.json.gz", cal_raw,
                      "v1/prices/calendar month grids per top pair")

        expired = 0
        records = []
        for (org, dst, day), (cents, link, expires) in sorted(best.items()):
            if expires < today_days:
                expired += 1
                continue
            records.append({"org": org, "dst": dst, "d": day, "eur": cents,
                            "link": link, "obs": today_days, "exp": expires})

        # ACCUMULATIVE staging: keep prior unexpired quotes for origins this
        # run did not touch, so the pull can run in origin chunks (a desktop
        # machine sleeps; a 5h single pass dies, four 80min passes land).
        # Origins in this run are fully replaced by their fresh quotes.
        run_set = set(origins)
        kept_prev = 0
        all_origins = set(origins)
        if DERIVED_PATH.exists():
            try:
                prev = json.loads(DERIVED_PATH.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                prev = None
            for r in ((prev or {}).get("fares") or []):
                if (r.get("org") not in run_set
                        and isinstance(r.get("exp"), int) and r["exp"] >= today_days):
                    records.append(r)
                    kept_prev += 1
                    all_origins.add(r["org"])
        records.sort(key=lambda r: (r["org"], r["dst"], r["d"]))
        if kept_prev:
            print(f"    [{self.name}] kept {kept_prev} unexpired quotes from "
                  f"origins outside this run")

        DERIVED_PATH.parent.mkdir(parents=True, exist_ok=True)
        staged = {"meta": {"generated_at": utcnow(), "origins": sorted(all_origins)},
                  "fares": records}
        DERIVED_PATH.write_text(
            json.dumps(staged, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")

        # The value metric of this source: routes the direct harvest cannot see.
        staged_pairs = {(r["org"], r["dst"]) for r in records}
        covered = direct_pairs({p[0] for p in staged_pairs})
        overlap = {p for p in staged_pairs if p in covered}
        print(f"    [{self.name}] {len(staged_pairs)} pairs staged: "
              f"{len(overlap)} overlap direct carrier fares, "
              f"{len(staged_pairs) - len(overlap)} are new coverage "
              f"({expired} expired quotes dropped, {rt_skipped} round trip "
              f"calendar quotes skipped)")

        evidence = build_service_evidence()

        return (f"{len(origins)} origins ({len(unresolved)} unknown to TP), "
                f"{len(records)} dated fares over {len(staged_pairs)} pairs, "
                f"{len(staged_pairs) - len(overlap)} pairs without direct "
                f"carrier coverage -> {DERIVED_PATH.name}; "
                f"{evidence['meta']['route_months']} evidence route-months")
