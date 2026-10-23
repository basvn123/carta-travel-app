"""Read one Hostelworld city list page.

Cards are read by their visible text, not by class names (Hostelworld renames
classes often): every card shows "Dorms From €x" and/or "Privates From €y" next
to the property name and its kind (Hostel, Hotel, Guesthouse, ...).
"""

import re
import unicodedata

from booking.page import amounts, parse_money

CITY_URL = "https://www.hostelworld.com/hostels/europe/{country}/{city}/"

# A card is the smallest block around a property link that shows its prices.
# Climbing stops at a block holding links to more than one property: the
# "Featured Properties" strip sits next to the first card, and without this its
# links took that card's prices (T643, seen on Lisbon 2026-10-23).
CARDS_JS = r"""
() => {
  const SEL = 'a[href*="/hosteldetails"], a[href*="/pwa/hosteldetails"], a[href*="/hostels/p/"]';
  const id = (h) => ((h || '').match(/(\d{3,})/) || [])[1] || h;
  const links = Array.from(document.querySelectorAll(SEL));
  const seen = new Set(), out = [];
  for (const a of links) {
    let el = a, ok = false;
    for (let i = 0; i < 8 && el; i++) {
      const ids = new Set(Array.from(el.querySelectorAll(SEL)).map((x) => id(x.getAttribute('href'))));
      if (ids.size > 1) break;
      if (/(dorms?|privates?)\s+from/i.test(el.innerText || '')) { ok = true; break; }
      el = el.parentElement;
    }
    if (!ok || seen.has(el)) continue;
    seen.add(el);
    out.push({ href: a.getAttribute('href'), text: (el.innerText || '').slice(0, 600) });
  }
  return out;
}
"""

DORM = re.compile(r"dorms?\s+from\s*([^\n]+)", re.I)
PRIV = re.compile(r"privates?\s+from\s*([^\n]+)", re.I)
KIND = re.compile(r"\b(hostel|hotel|guesthouse|guest house|apartment|campsite)\b", re.I)
KEY = re.compile(r"/(?:hostels/p|hosteldetails\.php|pwa/hosteldetails\.php)/?(?:[^/]*/)?(\d+)")


def slug(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def city_url(city, country, chk_in, chk_out, guests=1):
    # currency=EUR: without it the site picks the visitor's currency (a GBP page
    # read as euros was an audit finding; the parameter was checked 2026-10-23).
    return (CITY_URL.format(country=slug(country), city=slug(city)) +
            f"?from={chk_in}&to={chk_out}&guests={guests}&currency=EUR")


def _price(m):
    """(value, currency, text) of a 'Dorms From €x' match, or Nones."""
    if not m:
        return None, None, None
    found = amounts(m.group(1))
    if found:
        return found[0][1], found[0][0], m.group(1).strip()
    return parse_money(m.group(1)), None, m.group(1).strip()


def parse_card(card):
    t = card.get("text") or ""
    m = KEY.search(card.get("href") or "")
    k = KIND.search(t)
    dorm, dorm_cur, dorm_txt = _price(DORM.search(t))
    priv, priv_cur, priv_txt = _price(PRIV.search(t))
    return {
        "key": m.group(1) if m else (card.get("href") or "")[:80],
        "kind": k.group(1).lower().replace(" ", "") if k else "hostel",
        "dorm": dorm, "private": priv,
        "dorm_currency": dorm_cur, "private_currency": priv_cur,
        "dorm_text": dorm_txt, "private_text": priv_txt,
    }
