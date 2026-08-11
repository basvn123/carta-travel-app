"""Ferryhopper: commercial aggregator of Mediterranean / Aegean ferry
schedules. Its public trips widget (widgets.ferryhopper.com) renders port
pair schedules, seasonal departures, route geometry and base fares; this
collector samples those endpoints at a deliberately slow pace.

Commercial source: confirm widget terms or an API agreement before running
this at volume; the defaults stay gentle (3s per request, a handful of port
pairs). The widget internals change, so everything is config driven:

    FERRYHOPPER_PAIRS        comma list of port pairs like PIR-MYK,PIR-JTR
    FERRYHOPPER_API_TMPL     optional JSON endpoint template with {origin}
                             {destination} {date} placeholders (fill this in
                             after inspecting the widget's network calls)
    FERRYHOPPER_WIDGET_TMPL  widget page template, default the public widget
    FERRYHOPPER_DAYS_AHEAD   sample date offset in days (default 14)
"""
from datetime import datetime, timedelta, timezone

from ..core import config
from ..core.collector import Collector
from ..core.registry import register

ROOT_URL = config.env("FERRYHOPPER_ROOT", "https://widgets.ferryhopper.com/")
WIDGET_TMPL = config.env(
    "FERRYHOPPER_WIDGET_TMPL",
    "https://widgets.ferryhopper.com/en/trips?departure={origin}"
    "&arrival={destination}&date={date}")
DEFAULT_PAIRS = ["PIR-MYK", "PIR-JTR", "PIR-HER"]


@register
class Ferryhopper(Collector):
    name = "ferryhopper"
    group = "maritime"
    description = "Ferryhopper trip widget sampling: port pairs, schedules, base fares"
    static_urls = {"widget_root": ROOT_URL}
    min_interval = 3.0

    def collect(self, store, session):
        try:
            root = session.get(ROOT_URL)
            store.save_text("widget_root.html", root.text, url=ROOT_URL)
        except Exception as exc:
            self.fail(f"{ROOT_URL} -> {exc}")

        days_ahead = config.env_int("FERRYHOPPER_DAYS_AHEAD", 14)
        date = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
        pairs = config.env_list("FERRYHOPPER_PAIRS", DEFAULT_PAIRS)
        api_tmpl = config.env("FERRYHOPPER_API_TMPL")

        for pair in pairs:
            if "-" not in pair:
                self.fail(f"bad pair '{pair}', expected ORIGIN-DESTINATION")
                continue
            origin, destination = pair.split("-", 1)
            tmpl = api_tmpl or WIDGET_TMPL
            url = tmpl.format(origin=origin, destination=destination, date=date)
            ext = "json" if api_tmpl else "html"
            self.grab(session, store, url,
                      name=f"trips_{origin}_{destination}_{date}.{ext}",
                      note=f"{origin}->{destination} on {date}")
        mode = "API endpoint" if api_tmpl else "widget pages (set FERRYHOPPER_API_TMPL for JSON)"
        return f"{len(pairs)} port pairs for {date} via {mode}"
