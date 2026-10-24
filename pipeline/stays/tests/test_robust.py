"""A scrape session survives bad pages (T679).

Run:  python -m pytest pipeline/stays/tests -q
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import OutOfTime, Trouble, browser_gone  # noqa: E402


def test_a_failed_page_waits_longer_each_time_and_a_success_resets():
    t = Trouble("x", waits=(0, 0, 0), give_up=5)
    run = lambda: asyncio.run(t.failed(TimeoutError("Timeout 60000ms exceeded"), "here"))  # noqa: E731
    assert run() and run() and t.row == 2
    t.ok()
    assert t.row == 0 and t.total == 2


def test_a_long_outage_ends_the_session():
    t = Trouble("x", waits=(0,), give_up=3)
    results = [asyncio.run(t.failed(OSError("net::ERR_INTERNET_DISCONNECTED"), "here")) for _ in range(3)]
    assert results == [True, True, False]


def test_out_of_time_is_not_a_page_timeout():
    # Playwright's TimeoutError is a page's; the session's own stop must never be
    # caught by (or mistaken for) it.
    assert not issubclass(OutOfTime, TimeoutError)


def test_a_dead_page_is_noticed():
    class Dead:
        def is_closed(self):
            return True
    assert browser_gone(Dead()) and browser_gone(object())
