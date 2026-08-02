"""Collector base class and the per run result record run_all reports on."""
import time
import traceback
from dataclasses import dataclass, field

from . import config
from .errors import AuthMissing
from .http import PoliteSession
from .storage import RawStore, name_from_url


@dataclass
class CollectorResult:
    name: str
    group: str
    files: int = 0
    bytes: int = 0
    seconds: float = 0.0
    errors: list = field(default_factory=list)
    skipped: bool = False
    notes: str = ""


class Collector:
    name = ""
    group = ""
    description = ""
    required_env: tuple = ()      # missing any of these -> reported as SKIP
    static_urls: dict = {}        # label -> url, probed by run_all --check
    min_interval: float | None = None  # per host rate limit override, seconds

    def collect(self, store: RawStore, session: PoliteSession):
        raise NotImplementedError

    def missing_env(self):
        return [key for key in self.required_env if not config.env(key)]

    def fail(self, message):
        """Record a non fatal error and keep going: full coverage of a source
        beats fail fast, and the summary still surfaces every miss."""
        print(f"    [{self.name}] ERROR: {message}")
        self.errors.append(str(message))

    def grab(self, session, store, url, name=None, headers=None, note="",
             manifest_url=None, **kw):
        """Download one artifact into the raw store. Returns the saved path or
        None; failures are recorded via fail(). manifest_url substitutes the
        recorded URL when the real one embeds an API key."""
        try:
            resp = session.get(url, headers=headers, stream=True, **kw)
            return store.save_response(name or name_from_url(url), resp,
                                       manifest_url or url, note=note)
        except Exception as exc:
            self.fail(f"{manifest_url or url} -> {exc}")
            return None

    def run(self) -> CollectorResult:
        result = CollectorResult(self.name, self.group)
        missing = self.missing_env()
        if missing:
            result.skipped = True
            result.notes = "missing env: " + ", ".join(missing)
            return result
        self.errors: list[str] = []
        store = RawStore(self.name)
        session = PoliteSession(min_interval=self.min_interval)
        started = time.time()
        try:
            note = self.collect(store, session)
            if note:
                result.notes = note
        except AuthMissing as exc:
            result.skipped = True
            result.notes = str(exc)
        except Exception as exc:
            self.errors.append(f"fatal {type(exc).__name__}: {exc}")
            traceback.print_exc()
        result.errors = list(self.errors)
        result.files, result.bytes = store.files, store.bytes
        result.seconds = round(time.time() - started, 1)
        return result
