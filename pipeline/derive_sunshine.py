"""Monthly sunshine hours from the NASA POWER all-sky radiation we already hold.

Tier: Library (called by apply_climate.py)

NASA POWER carries no sunshine duration, only ALLSKY_SFC_SW_DWN (kWh/m2/day).
Sunshine duration is the standard thing to MODEL from it. The Angstrom-Prescott
relation links the clearness index to the relative sunshine duration:

    Rs / Ra = a + b * (n / N)         a = 0.25, b = 0.50   (FAO-56, eq. 35)

so  n / N = (Rs / Ra - a) / b, clamped to 0..1, and the hours of sun in a month
are  n = (n / N) * N * days  with N the day length. Ra is the extraterrestrial
radiation on a horizontal surface (FAO-56 eq. 21), computed from latitude and
the day of year of the middle of the month. Nothing is fetched.

The value is MODELLED, not measured: a=0.25, b=0.50 are the FAO defaults and a
station-calibrated pair would move individual months by about an hour a day.
The wire says so (`climate.sun_h_method`). Check against a station: Milan Brera
publishes about 2,000 h a year; this gives 2,0xx for the Como cell (see the T641
report for the measured comparison).

Source of the radiation: NASA POWER, US government open data, no use restriction
(credit given in meta.data_sources.nasa_power). Clear commercial use.

ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import calendar
import math

GSC = 0.0820            # MJ m-2 min-1, solar constant
KWH_TO_MJ = 3.6
A_ANGSTROM = 0.25
B_ANGSTROM = 0.50
METHOD = "modelled: Angstrom-Prescott (a=0.25, b=0.50, FAO-56) from NASA POWER ALLSKY_SFC_SW_DWN"


def _mid_doy(month: int) -> int:
    """Day of year of the 15th of the month (non leap)."""
    return sum(calendar.monthrange(2001, m)[1] for m in range(1, month)) + 15


def ra_and_daylength(lat_deg: float, doy: int) -> tuple[float, float]:
    """(Ra in MJ m-2 day-1, N in hours) at a latitude on a day of year."""
    phi = math.radians(lat_deg)
    dr = 1 + 0.033 * math.cos(2 * math.pi * doy / 365)
    delta = 0.409 * math.sin(2 * math.pi * doy / 365 - 1.39)
    x = -math.tan(phi) * math.tan(delta)
    x = max(-1.0, min(1.0, x))          # polar day / night
    ws = math.acos(x)
    ra = (24 * 60 / math.pi) * GSC * dr * (
        ws * math.sin(phi) * math.sin(delta)
        + math.cos(phi) * math.cos(delta) * math.sin(ws))
    return max(ra, 0.0), 24 / math.pi * ws


def sun_hours(lat: float, allsky_kwh: list) -> list | None:
    """Twelve numbers: mean sunshine hours per day times days, i.e. hours in
    the month. None when the radiation series is not twelve numbers."""
    if not isinstance(allsky_kwh, list) or len(allsky_kwh) != 12:
        return None
    out = []
    for i, rs_kwh in enumerate(allsky_kwh):
        if rs_kwh is None or rs_kwh < 0:
            return None
        month = i + 1
        ra, n_day = ra_and_daylength(lat, _mid_doy(month))
        if ra <= 0 or n_day <= 0:
            out.append(0.0)
            continue
        rel = (rs_kwh * KWH_TO_MJ / ra - A_ANGSTROM) / B_ANGSTROM
        rel = max(0.0, min(1.0, rel))
        out.append(round(rel * n_day * calendar.monthrange(2001, month)[1]))
    return out
