"""Booking.com search-list reader for the twice-yearly owner-run scrape.

Adapted from the search phase of github.com/Edioff/booking-scraper (MIT, see
LICENSE-booking-scraper): the property-card selectors, the card observer, the
overlay closer and money parsing. What was deliberately NOT carried over:

  * the detail phase (one browser per hotel page): we only need list prices
  * navigator.webdriver overrides, fingerprint init scripts, the
    --disable-blink-features=AutomationControlled flag and the spoofed UA:
    this crawler is a plain Playwright browser and stops when it is blocked
  * accepting the cookie banner: it is declined (privacy-preserving default)

URL parameters (order, nflt property-type and class filters) follow the
Booking parameter knowledge documented in the Apify actor-booking-scraper
README (Apache-2.0); no code was copied from it.
"""
