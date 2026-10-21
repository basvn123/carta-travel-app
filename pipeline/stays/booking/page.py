"""Read one Booking.com search-results page (adapted, MIT; see __init__)."""

import contextlib
import re

CARD = '[data-testid="property-card"]'

# Runs in the page: one record per visible property card. Star class is the
# number of star/square icons in the rating block; Booking draws stars for
# official classes and squares for its own "comparable" estimate.
EXTRACT_JS = r"""
() => Array.from(document.querySelectorAll('[data-testid="property-card"]')).map(c => {
  const q = s => c.querySelector(s);
  const txt = s => { const e = q(s); return e ? e.textContent.trim() : null; };
  const a = q('a[data-testid="title-link"]') || q('a[href*="/hotel/"]');
  const starBox = q('[data-testid="rating-stars"]') || q('[data-testid="rating-squares"]')
               || q('[aria-label*="out of 5"]');
  let stars = null, starKind = null;
  if (starBox) {
    const n = starBox.querySelectorAll('svg, span[aria-hidden="true"]').length;
    const m = (starBox.getAttribute('aria-label') || '').match(/(\d)(\.5)? out of 5/);
    stars = m ? parseInt(m[1]) : (n || null);
    starKind = starBox.getAttribute('data-testid') === 'rating-squares' ? 'squares' : 'stars';
  }
  return {
    href: a ? a.getAttribute('href') : null,
    title: txt('[data-testid="title"]'),
    price: txt('[data-testid="price-and-discounted-price"]'),
    priceFor: txt('[data-testid="price-for-x-nights"]'),
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


async def looks_blocked(page, status):
    if status in (403, 429):
        return True
    html = (await page.content())[:20000].lower()
    return ("awswaf" in html and CARD not in html) or "captcha" in html


async def read_cards(page, want=25):
    """Cards on the page; one scroll pass to load the lazy second batch."""
    with contextlib.suppress(Exception):
        await page.wait_for_selector(CARD, timeout=15000)
    cards = await page.evaluate(EXTRACT_JS)
    if len(cards) < want:
        for _ in range(6):
            with contextlib.suppress(Exception):
                await page.evaluate("() => window.scrollBy(0, 1400)")
            await page.wait_for_timeout(500)
        cards = await page.evaluate(EXTRACT_JS)
    return cards
