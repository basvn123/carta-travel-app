"""An in-process token bucket per API key (one box, one worker).

Each key gets `burst` tokens and refills at `rate_per_min` per minute; a
request takes one token. An empty bucket answers 429 with Retry-After. The
buckets live in memory and start full again after a restart, which is fine
for internal batch callers (research in the T1154 report).
"""
from __future__ import annotations

import math
import threading
import time


class TokenBucket:
    def __init__(self, rate_per_min: int, burst: int, clock=time.monotonic):
        self.rate = max(1, rate_per_min) / 60.0
        self.burst = max(1, burst)
        self.clock = clock
        self._state: dict[str, tuple[float, float]] = {}
        self._lock = threading.Lock()

    def take(self, key: str, rate_per_min: int | None = None) -> tuple[bool, float, int]:
        """(allowed, retry_after_s, tokens_left)."""
        rate = (max(1, rate_per_min) / 60.0) if rate_per_min else self.rate
        now = self.clock()
        with self._lock:
            tokens, last = self._state.get(key, (float(self.burst), now))
            tokens = min(float(self.burst), tokens + (now - last) * rate)
            if tokens >= 1.0:
                tokens -= 1.0
                self._state[key] = (tokens, now)
                return True, 0.0, int(tokens)
            self._state[key] = (tokens, now)
            return False, math.ceil((1.0 - tokens) / rate), 0
