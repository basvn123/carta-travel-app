"""Read one Booking.com search-results page (adapted, MIT; see __init__)."""

import contextlib
import re

CARD = '[data-testid="property-card"]'

# Runs in the page: one record per visible property card. Star class is the
# number of star/square icons in the rating block; Booking draws stars for
# official classes and squares (circles since 2026, T624) for its own
# "comparable" estimate. The icons are now bare spans, and the "4 out of 5
# stars" label sits on a button around the block, not on the block itself.
EXTRACT_JS = r"""
() => Array.from(document.querySelectorAll('[data-testid="property-card"]')).map(c => {
  const q = s => c.querySelector(s);
  const txt = s => { const e = q(s); return e ? e.textContent.trim() : null; };
  const a = q('a[data-testid="title-link"]') || q('a[href*="/hotel/"]');
  const starBox = q('[data-testid="rating-stars"]') || q('[data-testid="rating-squares"]')
               || q('[data-testid="rating-circles"]') || q('[aria-label*="out of 5"]');
  let stars = null, starKind = null;
  if (starBox) {
    const n = starBox.querySelectorAll('svg, span[aria-hidden="true"], :scope > span').length;
    const label = starBox.getAttribute('aria-label')
               || (q('[aria-label*="out of 5"]') || {}).ariaLabel || '';
    const m = label.match(/(\d)(\.5)? out of 5/);
    stars = m ? parseInt(m[1]) : (n || null);
    starKind = ['rating-squares', 'rating-circles'].includes(starBox.getAttribute('data-testid'))
             ? 'squares' : 'stars';
  }
  return {
    href: a ? a.getAttribute('href') : null,
    title: txt('[data-testid="title"]'),
    price: txt('[data-testid="price-and-discounted-price"]'),
    priceLines: (q('[data-testid="price-and-discounted-price"]') || {}).innerText || null,
    priceFor: txt('[data-testid="price-for-x-nights"]'),
    tax: txt('[data-testid="taxes-and-charges"]'),
    unit: txt('[data-testid="recommended-units"]'),
    review: txt('[data-testid="review-score"]'),
    stars, starKind,
  };
})
"""

MONEY = re.compile(r"(\d[\d.,\s]*)")


def parse_money(txt):
    """'€1,234' / '€ 1.234' / 'EUR 98' -> 1234.0 / 1234.0 / 98.0.

    The upstream helper turned '1,234' into 1.234; here a separator followed by
    exactly three digits is a thousands separator, anything else a decimal.
    """
    if not txt:
        return None
    m = MONEY.search(txt.replace("\xa0", " "))
    if not m:
        return None
    s = m.group(1).replace(" ", "")
    s = re.sub(r"[.,](?=\d{3}(?:\D|$))", "", s)
    s = s.replace(",", ".")
    with contextlib.suppress(ValueError):
        return float(s)
    return None


AMOUNT = re.compile(r"(€|EUR|£|GBP|US\$|\$|CHF|zł|PLN|Kč|CZK|kr|SEK|NOK|DKK|Ft|HUF|lei|RON)"
                    r"\s*(\d[\d.,\s]*\d|\d)", re.I)
CURRENCY = {"€": "EUR", "eur": "EUR", "£": "GBP", "gbp": "GBP", "us$": "USD", "$": "USD",
            "chf": "CHF", "zł": "PLN", "pln": "PLN", "kč": "CZK", "czk": "CZK",
            "kr": "SEK/NOK/DKK", "sek": "SEK", "nok": "NOK", "dkk": "DKK", "ft": "HUF",
            "huf": "HUF", "lei": "RON", "ron": "RON"}
INCLUDES_TAX = re.compile(r"includes taxes", re.I)
PLUS_TAX = re.compile(r"\+\s*(.+?)\s+taxes", re.I)


def amounts(txt):
    """Every amount in a price text, in order: [(currency, value)]."""
    out = []
    for sym, num in AMOUNT.findall((txt or "").replace("\xa0", " ")):
        v = parse_money(num)
        if v is not None:
            out.append((CURRENCY.get(sym.lower(), sym), v))
    return out


def card_price(card):
    """The contract fields of one Booking card (T643).

    A card with a deal prints the old price and the new one in the same block;
    the last amount is what the traveller pays (from_or_discount = 1). "+€12
    taxes and charges" is added to the price; "Includes taxes and charges"
    keeps it; no tax line at all leaves tax_included 0."""
    text = card.get("priceLines") or card.get("price") or ""
    found = amounts(text)
    if not found:
        return None
    currency, price = found[-1]
    tax_text = card.get("tax") or ""
    if INCLUDES_TAX.search(tax_text):
        tax = 1
    elif PLUS_TAX.search(tax_text):
        extra = amounts(PLUS_TAX.search(tax_text).group(1))
        if not extra or extra[0][0] != currency:
            return None
        price, tax = price + extra[0][1], 1
    else:
        tax = 0
    return {"price": price, "currency": currency, "tax_included": tax,
            "from_or_discount": 1 if len(found) > 1 else 0,
            "price_text": " | ".join(x for x in (text.replace("\n", " | "), tax_text) if x),
            "per_text": card.get("priceFor")}


def per_ok(per_text, adults, nights=1):
    """True when the card prices exactly the search: '1 night, 2 adults'."""
    want = (f"{nights} night{'s' if nights > 1 else ''}, "
            f"{adults} adult{'s' if adults > 1 else ''}")
    return bool(per_text) and per_text.strip().lower().startswith(want)


def prop_key(href):
    m = re.search(r"/hotel/([a-z]{2})/([^/.?]+)", href or "")
    return f"{m.group(1)}/{m.group(2)}" if m else None


BED_WORDS = re.compile(r"\b(bed in|dormitory|dorm|mixed|female|male)\b", re.I)
KIND_WORDS = [("hostel", re.compile(r"hostel", re.I)),
              ("apartment", re.compile(r"apartment|studio|holiday home|villa|house", re.I)),
              ("guesthouse", re.compile(r"guest ?house|b&b|bed and breakfast|inn", re.I))]


def classify(card, forced_kind=None):
    unit = card.get("unit") or ""
    kind = forced_kind
    if not kind:
        kind = "hotel"
        for k, rx in KIND_WORDS:
            if rx.search(unit):
                kind = k
                break
    bed = "dorm" if BED_WORDS.search(unit) else \
        ("home" if kind == "apartment" else "room")
    stars = card.get("stars") if card.get("starKind") == "stars" else None
    return kind, bed, stars


async def decline_cookies(page):
    for sel in ("#onetrust-reject-all-handler",
                "button:has-text('Decline')", "button:has-text('Reject')"):
        with contextlib.suppress(Exception):
            b = page.locator(sel).first
            if await b.is_visible():
                await b.click(timeout=1000)
                return True
    return False


async def close_overlays(page):
    for _ in range(2):
        with contextlib.suppress(Exception):
            await page.keyboard.press("Escape")
        await page.wait_for_timeout(120)
    for sel in ("[data-modal-close]", ".bui-modal__close",
                "button[aria-label*='Dismiss' i]", "button[aria-label*='Close' i]"):
        with contextlib.suppress(Exception):
            el = page.locator(sel).first
            if await el.is_visible():
                await el.click(timeout=600)


def search_dropped(url):
    """Booking turns away a browser it will not serve (headless Chrome, T624)
    with a 202 and a redirect to a bare searchresults page: the search is gone
    from the URL and the page has no cards, which is a block, not an empty town."""
    return "/searchresults" in (url or "") and "ss=" not in url


async def looks_blocked(page, status):
    if status in (403, 429) or search_dropped(page.url):
        return True
    html = (await page.content())[:20000].lower()
    return ("awswaf" in html and CARD not in html) or "captcha" in html


# The results header when a search found nothing ("0 properties found",
# "No properties found"): seen, the page is done, no 15 s wait for cards.
EMPTY_JS = r"""
() => /(^|\s)0 properties found|no properties found|no exact matches/i
        .test((document.querySelector('h1') || {}).innerText || '')
"""


async def read_cards(page, timeout_ms=15000, scroll=False):
    """The cards the page shows first (about 25). T643: no scroll pass by
    default (with each source counted once per town, more cards from one
    page do not move the price) and no 15 s wait on an empty search."""
    waited = 0
    while waited < timeout_ms:
        with contextlib.suppress(Exception):
            if await page.locator(CARD).count() or await page.evaluate(EMPTY_JS):
                break
        await page.wait_for_timeout(250)
        waited += 250
    await page.wait_for_timeout(500)       # let the first batch finish rendering
    if scroll:
        for _ in range(6):
            with contextlib.suppress(Exception):
                await page.evaluate("() => window.scrollBy(0, 1400)")
            await page.wait_for_timeout(500)
    return await page.evaluate(EXTRACT_JS)
