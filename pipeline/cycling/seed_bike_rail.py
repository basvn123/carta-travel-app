"""Bike on trains: a curated table, because there is no feed to read.

There is no open, machine-readable dataset of which trains carry how many
bicycles. EU Regulation 2021/782 sets a floor (new and renewed rolling stock
must provide at least four bicycle spaces where practicable, and carriers
must publish their conditions) but a legal minimum is not a feed. Every
operator publishes its own policy page and none of them as structured data.

So this is hand curated, and it is honest about being hand curated:

  * every row carries the operator's own policy URL and the date it was
    checked, so a reader can see how old the answer is
  * where a carrier's answer genuinely differs by train, by line or by
    season, the value is `varies` rather than a confident wrong answer
  * `fee_note` is a CODE, never prose, so the sentence lands in all six UI
    languages through cycleStory.js like every other signal in the layer
  * --verify re-fetches every URL and reports which ones have moved. That
    proves the link is still live; it does not prove the policy is
    unchanged, and the output says so.

What it is used for: the stage planner's bail-out points name a station, and
a station is only a bail-out if the train will take the bike. The code rides
on the stage, not the prose.

Countries with no passenger rail worth a row (Iceland, Malta, Cyprus, the
Faroes, Andorra, San Marino, Liechtenstein and Monaco, which are served by
neighbouring operators) are absent on purpose: an empty row would read as
"we checked and there is no policy" rather than "there are no trains".

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/cycling/seed_bike_rail.py
    python pipeline/cycling/seed_bike_rail.py --verify
    python pipeline/cycling/seed_bike_rail.py --show GB
"""

import argparse
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import cycle_sources as S  # noqa: E402
from db import connect as _db_connect  # noqa: E402,F401

# Every lab connection in this layer goes through the patient wrapper:
# the machine is shared and a ten second connect timeout loses runs.
connect = S.lab_connect

CHECKED_ON = "2026-08-30"

# reservation: required | recommended | none | varies
# fee_note codes, rendered by cycleStory.js:
#   free            no charge for the bicycle
#   flat_fee        a fixed bicycle fee or bicycle ticket
#   ticket_required a separate bicycle ticket, priced by distance or zone
#   peak_ban        carried, but not during weekday peak hours
#   folded_only     full-size bicycles not carried on this service class
#   limited_spaces  carried, but the spaces are few and go early
#   varies          differs by line or train within the same operator
ROWS = [
    # ---- France
    ("FR", "SNCF TGV INOUI", "required", False, True, "flat_fee",
     "https://www.sncf-connect.com/aide/velo-a-bord"),
    ("FR", "SNCF Intercites", "required", False, True, "flat_fee",
     "https://www.sncf-connect.com/aide/velo-a-bord"),
    ("FR", "SNCF TER", "none", False, True, "free",
     "https://www.ter.sncf.com/"),
    ("FR", "Ouigo", "required", False, True, "flat_fee",
     "https://www.ouigo.com/"),
    # ---- Germany
    ("DE", "DB Fernverkehr (ICE/IC/EC)", "required", False, True, "flat_fee",
     "https://www.bahn.de/service/fahrrad"),
    ("DE", "DB Regio", "none", False, True, "ticket_required",
     "https://www.bahn.de/service/fahrrad"),
    ("DE", "Flixtrain", "required", False, True, "flat_fee",
     "https://www.flixtrain.com/service/gepaeck"),
    # ---- Netherlands and Belgium
    ("NL", "NS", "none", False, True, "peak_ban",
     "https://www.ns.nl/en/travel-information/luggage/bicycle.html"),
    ("BE", "SNCB/NMBS", "none", False, True, "ticket_required",
     "https://www.belgiantrain.be/en/travel-info/prepare-for-your-journey/"
     "luggage-and-bikes"),
    ("LU", "CFL", "none", False, True, "free",
     "https://www.cfl.lu/"),
    # ---- Great Britain and Ireland
    ("GB", "ScotRail", "required", False, True, "free",
     "https://www.scotrail.co.uk/plan-your-journey/cycling"),
    ("GB", "LNER", "required", False, True, "free",
     "https://www.lner.co.uk/travel-information/travelling-with-us/bikes/"),
    ("GB", "Avanti West Coast", "required", False, True, "free",
     "https://www.avantiwestcoast.co.uk/travel-information/"
     "travelling-with-bikes"),
    ("GB", "Great Western Railway", "required", False, True, "free",
     "https://www.gwr.com/travel-information/travelling-with-us/"
     "bikes-on-board"),
    ("GB", "CrossCountry", "required", False, True, "limited_spaces",
     "https://www.crosscountrytrains.co.uk/travel-information/bikes"),
    ("GB", "TransPennine Express", "required", False, True, "free",
     "https://www.tpexpress.co.uk/travel-information/cycling"),
    ("GB", "Northern", "none", False, True, "limited_spaces",
     "https://www.northernrailway.co.uk/travel-information/cycling"),
    ("GB", "Transport for Wales", "recommended", False, True, "free",
     "https://tfw.wales/travel-information/bikes"),
    ("GB", "Caledonian Sleeper", "required", False, True, "free",
     "https://www.sleeper.scot/"),
    ("GB", "Southern / Thameslink", "none", False, True, "peak_ban",
     "https://www.southernrailway.com/travel-information/plan-your-journey/"
     "cycling"),
    ("GB", "Greater Anglia", "none", False, True, "peak_ban",
     "https://www.greateranglia.co.uk/travel-information/travelling-with-us/"
     "bikes"),
    ("IE", "Iarnrod Eireann", "required", False, True, "limited_spaces",
     "https://www.irishrail.ie/en-ie/travel-information/bicycles"),
    ("GB", "Translink NI Railways", "none", False, True, "free",
     "https://www.translink.co.uk/"),
    # ---- Alps
    ("CH", "SBB/CFF/FFS", "varies", True, True, "flat_fee",
     "https://www.sbb.ch/en/travel-information/travelling-with-luggage/"
     "bicycles.html"),
    ("AT", "OeBB", "required", False, True, "flat_fee",
     "https://www.oebb.at/en/reiseplanung-services/fahrrad"),
    ("AT", "Westbahn", "none", False, True, "flat_fee",
     "https://westbahn.at/"),
    ("LI", "SBB (Buchs SG line)", "varies", True, True, "flat_fee",
     "https://www.sbb.ch/en/travel-information/travelling-with-luggage/"
     "bicycles.html"),
    ("IT", "Trenitalia Regionale", "none", False, True, "ticket_required",
     "https://www.trenitalia.com/en/information/luggage_and_pets/"
     "travel_with_bicycle.html"),
    ("IT", "Trenitalia Frecce", "varies", False, True, "folded_only",
     "https://www.trenitalia.com/en/information/luggage_and_pets/"
     "travel_with_bicycle.html"),
    ("IT", "Italo", "none", False, True, "folded_only",
     "https://www.italotreno.com/en"),
    ("IT", "Trenord", "none", False, True, "ticket_required",
     "https://www.trenord.it/"),
    ("SI", "Slovenske zeleznice", "none", False, True, "ticket_required",
     "https://potniski.sz.si/en/"),
    # ---- Iberia
    ("ES", "Renfe AVE / Larga Distancia", "varies", False, True, "folded_only",
     "https://www.renfe.com/es/en/travel/travel-information/luggage"),
    ("ES", "Renfe Media Distancia", "none", False, True, "free",
     "https://www.renfe.com/es/en/travel/travel-information/luggage"),
    ("ES", "Renfe Cercanias", "none", False, True, "free",
     "https://www.renfe.com/es/en/travel/travel-information/luggage"),
    ("ES", "FGC", "none", False, True, "free", "https://www.fgc.cat/"),
    ("ES", "Euskotren", "none", False, True, "free",
     "https://www.euskotren.eus/"),
    ("PT", "CP Comboios de Portugal", "varies", False, True, "free",
     "https://www.cp.pt/passageiros/en"),
    # ---- Nordics and the Baltics
    ("DK", "DSB", "recommended", False, True, "ticket_required",
     "https://www.dsb.dk/en/travel-information/bicycles/"),
    ("DK", "Arriva Denmark", "none", False, True, "ticket_required",
     "https://www.arriva.dk/"),
    ("SE", "SJ", "varies", False, True, "limited_spaces",
     "https://www.sj.se/en/travel-info/luggage"),
    ("SE", "Skanetrafiken", "none", False, True, "peak_ban",
     "https://www.skanetrafiken.se/"),
    ("NO", "Vy", "required", False, True, "flat_fee",
     "https://www.vy.no/en/travel-information/luggage/bicycles"),
    ("NO", "Go-Ahead Nordic", "required", False, True, "flat_fee",
     "https://www.go-aheadnordic.no/"),
    ("FI", "VR", "required", False, True, "flat_fee",
     "https://www.vr.fi/en/travel-info/luggage"),
    ("EE", "Elron", "none", False, True, "ticket_required",
     "https://elron.ee/en/"),
    ("LV", "Vivi (Pasazieru vilciens)", "none", False, True,
     "ticket_required", "https://www.vivi.lv/"),
    ("LT", "LTG Link", "recommended", False, True, "ticket_required",
     "https://ltglink.lt/en"),
    # ---- Central and eastern Europe
    ("PL", "PKP Intercity", "required", False, True, "flat_fee",
     "https://www.intercity.pl/en/site/dla-pasazera/informacje/"
     "przewoz-rowerow/"),
    ("PL", "Polregio", "none", False, True, "ticket_required",
     "https://polregio.pl/en/"),
    ("CZ", "Ceske drahy", "varies", False, True, "ticket_required",
     "https://www.cd.cz/en/informace/jizdni-kolo/"),
    ("CZ", "RegioJet", "required", False, True, "flat_fee",
     "https://regiojet.com/"),
    ("SK", "ZSSK", "none", False, True, "ticket_required",
     "https://www.zssk.sk/en/"),
    ("HU", "MAV-START", "none", False, True, "ticket_required",
     "https://www.mavcsoport.hu/en"),
    ("HR", "HZ Putnicki prijevoz", "varies", False, True, "ticket_required",
     "https://www.hzpp.hr/en"),
    ("RS", "Srbija Voz", "none", False, True, "ticket_required",
     "https://srbvoz.rs/"),
    ("RO", "CFR Calatori", "varies", False, True, "limited_spaces",
     "https://www.cfrcalatori.ro/en/"),
    ("BG", "BDZ", "varies", False, True, "limited_spaces",
     "https://www.bdz.bg/en"),
    ("GR", "Hellenic Train", "varies", False, True, "limited_spaces",
     "https://hellenictrain.gr/en"),
    ("MK", "Makedonski Zeleznici", "none", False, True, "limited_spaces",
     "http://mztransport.com.mk/"),
    ("BA", "ZFBH", "none", False, True, "limited_spaces",
     "https://www.zfbh.ba/"),
    ("ME", "Zeljeznicki prevoz Crne Gore", "none", False, True,
     "limited_spaces", "https://zpcg.me/"),
    ("AL", "HSH", "none", False, True, "limited_spaces",
     "https://hsh.com.al/"),
    ("MD", "CFM", "none", False, True, "limited_spaces",
     "https://www.railway.md/"),
    ("UA", "Ukrzaliznytsia", "required", False, True, "flat_fee",
     "https://booking.uz.gov.ua/en/"),
    ("TR", "TCDD Tasimacilik", "varies", False, True, "limited_spaces",
     "https://www.tcddtasimacilik.gov.tr/"),
    # ---- Cross border operators that matter to a tour
    ("DE", "Eurostar (Thalys/NightJet routes to DE)", "required", False, True,
     "flat_fee", "https://www.eurostar.com/"),
    ("BE", "Eurostar", "required", False, True, "flat_fee",
     "https://www.eurostar.com/"),
    ("AT", "OeBB Nightjet", "required", True, True, "flat_fee",
     "https://www.nightjet.com/"),
]

UPSERT = """
    INSERT INTO bike_rail (country, operator, reservation, seasonal,
                           folded_free, fee_note, url, checked_on)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (country, operator) DO UPDATE SET
        reservation = EXCLUDED.reservation, seasonal = EXCLUDED.seasonal,
        folded_free = EXCLUDED.folded_free, fee_note = EXCLUDED.fee_note,
        url = EXCLUDED.url, checked_on = EXCLUDED.checked_on
"""

RESERVATION_VALUES = {"required", "recommended", "none", "varies"}
FEE_CODES = {"free", "flat_fee", "ticket_required", "peak_ban",
             "folded_only", "limited_spaces", "varies"}


def check_rows():
    """Refuse to seed a row whose codes the app cannot render."""
    problems = []
    seen = set()
    for cc, operator, reservation, seasonal, folded, fee, url in ROWS:
        key = (cc, operator)
        if key in seen:
            problems.append(f"duplicate row: {cc} {operator}")
        seen.add(key)
        if reservation not in RESERVATION_VALUES:
            problems.append(f"{cc} {operator}: reservation {reservation!r}")
        if fee not in FEE_CODES:
            problems.append(f"{cc} {operator}: fee_note {fee!r}")
        if not url.startswith("http"):
            problems.append(f"{cc} {operator}: url {url!r}")
    return problems


def seed(conn):
    with conn.cursor() as cur:
        for cc, operator, reservation, seasonal, folded, fee, url in ROWS:
            cur.execute(UPSERT, (cc, operator, reservation, seasonal, folded,
                                 fee, url, CHECKED_ON))
    conn.commit()
    return len(ROWS)


def policy_for(conn, country):
    """Every operator row for one country, for the stage bail-out code."""
    with conn.cursor() as cur:
        cur.execute("""SELECT operator, reservation, seasonal, folded_free,
                              fee_note, url, checked_on
                       FROM bike_rail WHERE country = %s ORDER BY operator""",
                    (country,))
        return [{"operator": o, "reservation": r, "seasonal": s,
                 "folded_free": f, "fee": fee, "url": u,
                 "checked_on": c.isoformat()}
                for o, r, s, f, fee, u, c in cur.fetchall()]


def verify():
    """Re-fetch every policy URL. Proves the link is live, nothing more."""
    import requests
    session = requests.Session()
    session.headers.update({"User-Agent": "CartaCycling/1.0 "
                            "(https://carta-europetravel.com)"})
    bad = []
    for cc, operator, _res, _sea, _fold, _fee, url in ROWS:
        try:
            resp = session.head(url, timeout=25, allow_redirects=True)
            if resp.status_code >= 400:
                resp = session.get(url, timeout=25, allow_redirects=True)
            code = resp.status_code
        except Exception as exc:                       # noqa: BLE001
            code = f"{type(exc).__name__}"
        ok = code == 200
        if not ok:
            bad.append((cc, operator, url, code))
        print(f"  {'ok ' if ok else 'BAD'} {cc} {operator[:38]:40s} {code}")
    print(f"\n{len(ROWS) - len(bad)}/{len(ROWS)} policy links resolve.")
    print("A live link is not a current policy: reservation rules change "
          "without the URL changing, so re-read the page, do not trust the "
          "status code.")
    return bad


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--verify", action="store_true",
                    help="re-fetch every policy URL and report the failures")
    ap.add_argument("--show", help="print the rows for one ISO2")
    args = ap.parse_args()

    problems = check_rows()
    if problems:
        for p in problems:
            print("REFUSED: " + p)
        sys.exit(1)

    if args.verify:
        verify()
        return

    with connect() as conn:
        if args.show:
            for row in policy_for(conn, args.show.upper()):
                print(f"  {row['operator']:42s} reservation={row['reservation']:12s}"
                      f" fee={row['fee']:16s} checked={row['checked_on']}")
            return
        n = seed(conn)
        by_country = Counter(r[0] for r in ROWS)
        print(f"{n} operator row(s) seeded across {len(by_country)} "
              f"country(ies), all checked on {CHECKED_ON}")
        print("countries: " + ", ".join(f"{cc}={n}" for cc, n
                                        in sorted(by_country.items())))


if __name__ == "__main__":
    main()
