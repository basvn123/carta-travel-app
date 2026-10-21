"""T511 source spike for the scrape half: run this on the owner's laptop.

It samples 20 destinations (5 big cities, 5 mid towns, 5 small towns, 5
seasonal islands and coasts) and runs the real scrapers on two monthly probes
(February and August), in a separate state folder (cache/stays/spike) so the
real journal stays clean. Then it answers the T511 questions:

  * does Booking serve the list (or a challenge), and how many pages per hour?
  * do cards carry a price, a star class and a unit name? share of each
  * do hostel searches give dorm beds? does August differ from February?
  * does the Hostelworld city URL resolve, with dorm and private prices?

and writes cache/stays/spike/spike_report.md plus spike.json (read by
build_stays for hw_private_per_person). Paste the report into the batch report.

Usage:  python pipeline/stays/spike.py [--run 2027-02] [--headed]
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPIKE = HERE.parents[1] / "cache" / "stays" / "spike"
os.environ["STAYS_STATE"] = str(SPIKE)
sys.path.insert(0, str(HERE))
from common import JOURNAL_SCRAPE, journal, load_destinations, median, write_json  # noqa: E402

SEASONAL = ["PMI", "JTR", "DBV", "CFU", "FAO"]


def sample():
    ds = load_destinations()
    by = {d["id"]: d for d in ds}
    air = sorted((d for d in ds if d["tier"] == "airport"), key=lambda d: -d["pop"])
    mid = [d for d in ds if 50_000 <= d["pop"] <= 200_000 and d["tier"] != "airport"]
    small = [d for d in ds if 0 < d["pop"] < 15_000]
    pick = [d["id"] for d in air[:5]] + [d["id"] for d in mid[::max(1, len(mid) // 5)][:5]] \
        + [d["id"] for d in small[::max(1, len(small) // 5)][:5]] \
        + [i for i in SEASONAL if i in by]
    return [i for i in dict.fromkeys(pick)]


def run(script, ids, a):
    cmd = [sys.executable, str(HERE / script), "--run", a.run, "--only", ",".join(ids),
           "--months", "2,8", "--max-hours", "2"]
    if a.headed:
        cmd.append("--headed")
    t0 = time.monotonic()
    p = subprocess.run(cmd, env=os.environ.copy(), capture_output=True, text=True)
    print(p.stdout[-2000:], p.stderr[-1500:])
    return time.monotonic() - t0


def report(con, ids, secs):
    q = lambda sql, *a: con.execute(sql, a).fetchall()  # noqa: E731
    lines = ["# T511 scrape spike", ""]
    for src in ("booking", "hostelworld"):
        n_pages = q("select count(*) from done where source=?", src)[0][0]
        rows = q("select dest_id, kind, stars, bed, chk_in, price_eur from obs where source=?", src)
        blk = q("select until, reason from blocks where source=?", src)
        lines += [f"## {src}", f"- pages: {n_pages} in {secs[src] / 60:.0f} min "
                  f"({n_pages / max(secs[src] / 3600, 0.01):.0f} pages/hour)",
                  f"- block: {blk[0] if blk else 'none'}",
                  f"- prices: {len(rows)} over {len({r[0] for r in rows})}/{len(ids)} destinations"]
        if rows:
            star = sum(1 for r in rows if r[2]) / len(rows)
            dorm = [r[5] for r in rows if r[3] == "dorm"]
            lines.append(f"- share with star class: {star:.0%}; dorm beds: {len(dorm)} "
                         f"(median EUR {median(dorm)})")
            for d in ids:
                feb = [r[5] for r in rows if r[0] == d and r[4][5:7] == "02" and r[3] == "room"]
                aug = [r[5] for r in rows if r[0] == d and r[4][5:7] == "08" and r[3] == "room"]
                if feb and aug:
                    lines.append(f"  - {d}: room median Feb {median(feb):.0f}, "
                                 f"Aug {median(aug):.0f} (x{median(aug) / median(feb):.2f})")
        lines.append("")
    lines += ["## Hostelworld private basis",
              "Open one Hostelworld city page by hand and note whether 'Privates from' is",
              "per person or per room; set hw_private_per_person in spike.json.", ""]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default=time.strftime("%Y-%m"))
    ap.add_argument("--headed", action="store_true")
    a = ap.parse_args()
    SPIKE.mkdir(parents=True, exist_ok=True)
    ids = sample()
    print("sample:", ids)
    secs = {"booking": run("scrape_booking.py", ids, a),
            "hostelworld": run("scrape_hostelworld.py", ids, a)}
    md = report(journal(JOURNAL_SCRAPE), ids, secs)
    (SPIKE / "spike_report.md").write_text(md, encoding="utf-8")
    prev = json.loads((SPIKE / "spike.json").read_text()) if (SPIKE / "spike.json").exists() else {}
    write_json(SPIKE / "spike.json", {"hw_private_per_person": prev.get("hw_private_per_person"),
                                      "sample": ids})
    print(md)


if __name__ == "__main__":
    main()
