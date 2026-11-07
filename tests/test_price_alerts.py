"""T1205 (I17): the box's price alert check, on fixtures with the network stubbed."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import price_alerts as pa  # noqa: E402

RULES = {"per_room": 2, "weekend": {5, 6}}
CURVE = [100.0] * 12
CURVE[4] = 120.0  # May
STAYS = {"PT": {"dests": {
    "LIS": {"month": {"hotel3": CURVE, "dorm": [30.0] * 12, "bnb_home": [200.0] * 12},
            "weekend": 1.25, "single": {"hotel": 0.8}},
    "OPO": {"month": {"hotel3": [80.0] * 12}},
}}}
FLIGHTS = {"BRU": {"to": {"LIS": {"2027-05-03": [90, "TP", "07:00", "09:00", 0, 1]}},
                   "back": {"LIS": {"2027-05-06": [70, "TP", "10:00", "14:00", 0, 1]}}}}


def stays_of(cc):
    return STAYS.get(cc)


def flights_of(iata):
    return FLIGHTS.get(iata)


def test_month_alert_prices_rooms_for_the_party():
    spec = {"stops": [{"id": "LIS", "cc": "PT", "nights": 3}], "month": 5, "adults": 3, "bed": "hotel3"}
    # 3 adults need 2 rooms at the May rate, 3 nights: 120 * 2 * 3.
    assert pa.alert_total(spec, stays_of, flights_of, RULES) == 720


def test_dated_alert_applies_the_weekend_factor_and_flights():
    # 2027-05-03 is a Monday: Mon, Tue, Wed nights, no weekend.
    spec = {"stops": [{"id": "LIS", "cc": "PT", "nights": 3}], "start": "2027-05-03", "adults": 2,
            "bed": "hotel3", "fly": {"from": "BRU", "to": "LIS", "out": "2027-05-03", "back": "2027-05-06"}}
    assert pa.alert_total(spec, stays_of, flights_of, RULES) == 120 * 3 + (90 + 70) * 2
    # 2027-05-07 is a Friday: Friday and Saturday nights carry 1.25.
    weekend = {"stops": [{"id": "LIS", "cc": "PT", "nights": 3}], "start": "2027-05-07", "adults": 2, "bed": "hotel3"}
    assert pa.alert_total(weekend, stays_of, flights_of, RULES) == round(120 * 1.25 * 2 + 120)


def test_trip_walks_the_stops_in_order():
    spec = {"stops": [{"id": "LIS", "cc": "PT", "nights": 2}, {"id": "OPO", "cc": "PT", "nights": 2}],
            "start": "2027-05-03", "adults": 2, "bed": "hotel3"}
    assert pa.alert_total(spec, stays_of, flights_of, RULES) == 120 * 2 + 80 * 2


def test_units_per_bed_and_single_hotel_ratio():
    dorm = {"stops": [{"id": "LIS", "cc": "PT", "nights": 1}], "month": 1, "adults": 3, "bed": "dorm"}
    assert pa.alert_total(dorm, stays_of, flights_of, RULES) == 90
    home = {"stops": [{"id": "LIS", "cc": "PT", "nights": 1}], "month": 1, "adults": 5, "bed": "home"}
    assert pa.alert_total(home, stays_of, flights_of, RULES) == 400
    solo = {"stops": [{"id": "LIS", "cc": "PT", "nights": 1}], "month": 1, "adults": 1, "bed": "hotel3"}
    assert pa.alert_total(solo, stays_of, flights_of, RULES) == 80


@pytest.mark.parametrize("spec", [
    {"stops": [{"id": "OPO", "cc": "PT", "nights": 2}], "month": 5, "adults": 2, "bed": "dorm"},   # tier not in wire
    {"stops": [{"id": "XXX", "cc": "PT", "nights": 2}], "month": 5, "adults": 2, "bed": "hotel3"},  # unknown place
    {"stops": [{"id": "LIS", "cc": "ES", "nights": 2}], "month": 5, "adults": 2, "bed": "hotel3"},  # no country file
    {"stops": [{"id": "LIS", "cc": "PT", "nights": 2}], "adults": 2, "bed": "hotel3"},              # no month, no date
    {"stops": [{"id": "LIS", "cc": "PT", "nights": 2}], "start": "2027-05-03", "adults": 2, "bed": "hotel3",
     "fly": {"from": "BRU", "to": "LIS", "out": "2027-05-04", "back": "2027-05-06"}},              # day not priced
    {"stops": [], "month": 5, "adults": 2, "bed": "hotel3"},
    {"stops": [{"id": "LIS", "cc": "PT", "nights": 2}], "month": 5, "adults": 0, "bed": "hotel3"},
])
def test_missing_data_skips_the_alert(spec):
    assert pa.alert_total(spec, stays_of, flights_of, RULES) is None


def test_run_reports_totals_and_purges_with_the_box_secret_only():
    calls = []
    alerts = [
        {"id": "a1", "spec": {"stops": [{"id": "LIS", "cc": "PT", "nights": 1}], "month": 1, "adults": 2, "bed": "hotel3"}},
        {"id": "a2", "spec": {"stops": [{"id": "XXX", "cc": "PT", "nights": 1}], "month": 1, "adults": 2, "bed": "hotel3"}},
    ]

    def post(url, secret, body):
        calls.append((url, secret, body))
        if body["job"] == "open":
            return {"alerts": alerts}
        if body["job"] == "check":
            return {"checked": 1, "armed": 1, "fired": 0, "sent": 0, "failed": 0}
        return {"purged": 2}

    out = pa.run("https://x.test/functions/v1/price-alerts", "s3cret", post=post, stays_of=stays_of, flights_of=flights_of)
    assert [c[2]["job"] for c in calls] == ["open", "check", "purge"]
    assert calls[1][2]["items"] == [{"id": "a1", "eur": 100}]
    assert all(c[1] == "s3cret" for c in calls)
    assert out["open"] == 2 and out["priced"] == 1 and out["skipped"] == 1 and out["armed"] == 1 and out["purged"] == 2


@pytest.mark.parametrize("off", [True, False])
def test_off_switch_and_dry_run_send_no_check(off):
    calls = []
    alert = {"id": "a1", "spec": {"stops": [{"id": "LIS", "cc": "PT", "nights": 1}], "month": 1, "adults": 2, "bed": "hotel3"}}

    def post(url, secret, body):
        calls.append(body["job"])
        return {"code": "off"} if off else {"alerts": [alert]}

    pa.run("u", "s", post=post, stays_of=stays_of, flights_of=flights_of, dry_run=not off)
    assert calls == ["open"]


def test_unconfigured_box_checks_nothing(monkeypatch, capsys):
    monkeypatch.delenv("PRICE_ALERTS_URL", raising=False)
    monkeypatch.delenv("PRICE_ALERTS_BOX_SECRET", raising=False)
    assert pa.main([]) == 0
    assert "nothing checked" in capsys.readouterr().out


def test_rules_come_from_the_pricing_config():
    r = pa._rules()
    assert r["per_room"] == 2 and r["weekend"] == {5, 6}
