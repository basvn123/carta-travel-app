"""Read one Hostelworld city list page.

Cards are read by their visible text, not by class names (Hostelworld renames
classes often): every card shows "Dorms From €x" and/or "Privates From €y" next
to the property name and its kind (Hostel, Hotel, Guesthouse, ...).
"""

import re
import unicodedata

from booking.page import parse_money

CITY_URL = "https://www.hostelworld.com/hostels/europe/{country}/{city}/"

CARDS_JS = r"""
() => {
  const links = Array.from(document.querySelectorAll('a[href*="/hosteldetails"], a[href*="/pwa/hosteldetails"], a[href*="/hostels/p/"]'));
  const seen = new Set(), out = [];
  for (const a of links) {
    let el = a;
    for (let i = 0; i < 6 && el && !/(dorms?|privates?)\s+from/i.test(el.innerText || ''); i++) el = el.parentElement;
    if (!el || seen.has(el)) continue;
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
    return (CITY_URL.format(country=slug(country), city=slug(city)) +
            f"?from={chk_in}&to={chk_out}&guests={guests}")


def parse_card(card):
    t = card.get("text") or ""
    m = KEY.search(card.get("href") or "")
    k = KIND.search(t)
    dorm = DORM.search(t)
    priv = PRIV.search(t)
    return {
        "key": m.group(1) if m else (card.get("href") or "")[:80],
        "kind": k.group(1).lower().replace(" ", "") if k else "hostel",
        "dorm": parse_money(dorm.group(1)) if dorm else None,
        "private": parse_money(priv.group(1)) if priv else None,
    }
