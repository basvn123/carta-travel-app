"""Structured logs: one JSON object per line on stdout, stdlib only.

Request context (request id, key id, route) rides on a contextvar. Request
and response bodies are never logged: /profile carries a traveller's own
saves and trips.
"""
from __future__ import annotations

import contextvars
import json
import logging
import sys
import time

ctx: contextvars.ContextVar[dict | None] = contextvars.ContextVar("intel_ctx", default=None)
FIELDS = ("route", "method", "status", "ms", "key_id", "items", "error")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)) + f".{int(record.msecs):03d}Z",
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        out.update({k: v for k, v in (ctx.get() or {}).items() if v is not None})
        for k in FIELDS:
            v = getattr(record, k, None)
            if v is not None:
                out[k] = v
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info).splitlines()[-1]
        return json.dumps(out, ensure_ascii=False, separators=(",", ":"))


def setup(level: str = "INFO") -> logging.Logger:
    log = logging.getLogger("intelligence")
    if not any(isinstance(h.formatter, JsonFormatter) for h in log.handlers):
        h = logging.StreamHandler(sys.stdout)
        h.setFormatter(JsonFormatter())
        log.addHandler(h)
    log.setLevel(level)
    log.propagate = False
    return log
