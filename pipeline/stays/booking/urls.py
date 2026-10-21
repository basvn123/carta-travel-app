"""Booking.com search URLs.

  order      popularity | price | class | class_asc | bayesian_review_score
  nflt       ht_id=204 hotels, 203 hostels, 201 apartments, 216 guest houses,
             208 bed and breakfasts; class=1..5 star class (';'-joined)
  dates      checkin / checkout (YYYY-MM-DD); group_adults, group_children,
             no_rooms; selected_currency=EUR; lang=en-gb
"""

from urllib.parse import urlencode

BASE = "https://www.booking.com/searchresults.en-gb.html"

HT = {"hotel": 204, "hostel": 203, "apartment": 201, "guesthouse": 216,
      "bnb": 208}


def search_url(ss, chk_in, chk_out, adults=2, rooms=1, kind=None, stars=None,
               order="popularity", lat=None, lon=None, offset=0):
    q = {"ss": ss, "checkin": chk_in, "checkout": chk_out,
         "group_adults": adults, "group_children": 0, "no_rooms": rooms,
         "selected_currency": "EUR", "lang": "en-gb", "order": order}
    if lat is not None and lon is not None:
        q.update(dest_type="latlong", latitude=f"{lat:.5f}", longitude=f"{lon:.5f}")
    flt = []
    if kind:
        flt.append(f"ht_id={HT[kind]}")
    if stars:
        flt.extend(f"class={s}" for s in ([stars] if isinstance(stars, int) else stars))
    if flt:
        q["nflt"] = ";".join(flt)
    if offset:
        q["offset"] = offset
    return f"{BASE}?{urlencode(q)}"
