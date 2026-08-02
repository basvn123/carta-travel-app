"""Exogenous demand catalysts: public holidays and school holidays.

Fare demand spikes around holidays are the single largest "unexplainable"
price anomaly a lead-time/seasonality model faces; the estimation layer
(src/estimation/features.py) turns these raw calendars into per-departure-date
holiday flags. Commercial event platforms (PredictHQ) cover concerts and
sports on top, but the scheduled non-attendance events they sell - public
holidays and school terms - are fully covered by two free open APIs:

  Nager.Date      https://date.nager.at   public holidays, no key, all of Europe
  OpenHolidays    https://openholidaysapi.org   school holidays for the subset
                  of countries it covers (DE/AT/CH/NL/BE/FR/...), no key

HOLIDAY_COUNTRIES overrides the country list (comma separated ISO2);
HOLIDAY_YEARS_AHEAD how many future years beside the current one (default 1,
which covers the app's ~5 month fare window even at new year).
"""
from datetime import date

from ..core import config
from ..core.collector import Collector
from ..core.registry import register

NAGER = config.env("NAGER_API", "https://date.nager.at/api/v3")
OPENHOLIDAYS = config.env("OPENHOLIDAYS_API", "https://openholidaysapi.org")

# Every country the catalogue can reach, ISO2. Unsupported codes are skipped
# with a note, so an over-wide list costs nothing.
DEFAULT_COUNTRIES = ("AL,AD,AT,BA,BE,BG,CH,CY,CZ,DE,DK,EE,ES,FI,FR,GB,GR,HR,"
                     "HU,IE,IS,IT,LI,LT,LU,LV,MC,MD,ME,MK,MT,NL,NO,PL,PT,RO,"
                     "RS,SE,SI,SK,SM,TR,UA,XK")


def _wanted_countries():
    return config.env_list("HOLIDAY_COUNTRIES", DEFAULT_COUNTRIES.split(","))


def _years():
    ahead = config.env_int("HOLIDAY_YEARS_AHEAD", 1)
    this = date.today().year
    return [this + i for i in range(ahead + 1)]


@register
class PublicHolidays(Collector):
    name = "holidays"
    group = "events"
    description = "Nager.Date public holidays, catalogue countries, current + next year"
    static_urls = {"available": f"{NAGER}/AvailableCountries"}
    min_interval = 0.5

    def collect(self, store, session):
        url = f"{NAGER}/AvailableCountries"
        available = None
        try:
            payload = session.get(url).json()
            store.save_json("available_countries.json", payload, url=url)
            available = {c.get("countryCode") for c in payload}
        except Exception as exc:
            self.fail(f"AvailableCountries -> {exc} (fetching blind)")

        unsupported, fetched = [], 0
        for cc in _wanted_countries():
            if available is not None and cc not in available:
                unsupported.append(cc)
                continue
            for year in _years():
                url = f"{NAGER}/PublicHolidays/{year}/{cc}"
                try:
                    resp = session.get(url, allow_error=(404,))
                    if resp.status_code == 404:
                        unsupported.append(f"{cc}/{year}")
                        continue
                    store.save_json(f"public_holidays_{cc}_{year}.json", resp.json(),
                                    url=url, note=f"{cc} {year}")
                    fetched += 1
                except Exception as exc:
                    self.fail(f"{cc}/{year} -> {exc}")
        note = f"{fetched} country-years"
        if unsupported:
            note += f"; not on Nager: {', '.join(sorted(set(unsupported)))}"
        return note


@register
class SchoolHolidays(Collector):
    name = "school_holidays"
    group = "events"
    description = "OpenHolidays school holidays for the countries it covers"
    static_urls = {"countries": f"{OPENHOLIDAYS}/Countries"}
    min_interval = 0.5

    def collect(self, store, session):
        url = f"{OPENHOLIDAYS}/Countries"
        covered = []
        try:
            payload = session.get(url, headers={"Accept": "application/json"}).json()
            store.save_json("countries.json", payload, url=url)
            covered = [c.get("isoCode") for c in payload if c.get("isoCode")]
        except Exception as exc:
            self.fail(f"Countries -> {exc}")
            return "country roster unavailable"

        wanted = set(_wanted_countries())
        years = _years()
        valid_from = f"{years[0]}-01-01"
        valid_to = f"{years[-1]}-12-31"
        fetched, empty = 0, []
        for cc in covered:
            if cc not in wanted:
                continue
            url = f"{OPENHOLIDAYS}/SchoolHolidays"
            try:
                resp = session.get(url, params={
                    "countryIsoCode": cc, "languageIsoCode": "EN",
                    "validFrom": valid_from, "validTo": valid_to,
                }, headers={"Accept": "application/json"}, allow_error=(400, 404))
                if resp.status_code >= 400:
                    empty.append(f"{cc}({resp.status_code})")
                    continue
                store.save_json(f"school_holidays_{cc}.json", resp.json(), url=url,
                                note=f"{cc} {valid_from}..{valid_to}")
                fetched += 1
            except Exception as exc:
                self.fail(f"{cc} -> {exc}")
        note = f"{fetched} countries"
        if empty:
            note += f"; no data: {', '.join(empty)}"
        return note
