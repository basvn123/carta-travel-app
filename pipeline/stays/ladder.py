"""Data access ladder flags for the stays scrapers (ROADMAP I16, T1213).

A flag is off unless its environment variable is exactly "1". The names are in
continent-app/config/access-ladder.json.
"""
import os


def ladder_on(env_name, environ=None):
    return str((environ if environ is not None else os.environ).get(env_name, "")) == "1"


def refuse_if_stopped(env_name, label, environ=None):
    """Exit with a plain message when the ladder says to stop this scraper."""
    if ladder_on(env_name, environ):
        raise SystemExit(f"{label}: stopped by the data access ladder ({env_name}=1). "
                         "See docs/data/access-ladder.md.")
