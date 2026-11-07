"""Python side of the Node bridge (bridge/bridge.mjs): one persistent child.

Calls are newline-delimited JSON with an id; a reader thread hands each
answer to the waiting call. A call that takes longer than the timeout, or a
child that died, kills the child; the next call starts a fresh one.
"""
from __future__ import annotations

import itertools
import json
import os
import subprocess
import threading
from concurrent.futures import Future
from concurrent.futures import TimeoutError as FutureTimeout
from pathlib import Path

BRIDGE_JS = Path(__file__).resolve().parent.parent / "bridge" / "bridge.mjs"


class BridgeError(RuntimeError):
    pass


class NodeBridge:
    def __init__(self, node: str = "node", public: Path | None = None, app: Path | None = None,
                 timeout_s: float = 10.0, metrics=None, log=None):
        self.node, self.public, self.app = node, public, app
        self.timeout_s = timeout_s
        self.metrics, self.log = metrics, log
        self._proc: subprocess.Popen | None = None
        self._pending: dict[int, Future] = {}
        self._ids = itertools.count(1)
        self._lock = threading.Lock()

    # -- process
    def _start(self) -> None:
        env = dict(os.environ)
        if self.public:
            env["CARTA_PUBLIC"] = str(self.public)
        if self.app:
            env["CARTA_APP"] = str(self.app)
        try:
            self._proc = subprocess.Popen(
                [self.node, str(BRIDGE_JS)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, encoding="utf-8", bufsize=1, env=env,
            )
        except OSError as exc:
            self._proc = None
            raise BridgeError(f"cannot start node: {exc.strerror or exc}") from exc
        proc = self._proc
        threading.Thread(target=self._read, args=(proc,), daemon=True).start()
        threading.Thread(target=self._drain_err, args=(proc,), daemon=True).start()
        if self.metrics:
            self.metrics.bridge_restarts.inc()

    def _read(self, proc: subprocess.Popen) -> None:
        for line in proc.stdout:
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            fut = self._pending.pop(msg.get("id"), None)
            if fut is not None and not fut.done():
                fut.set_result(msg)
        for fut in list(self._pending.values()):
            if not fut.done():
                fut.set_exception(BridgeError("bridge exited"))

    def _drain_err(self, proc: subprocess.Popen) -> None:
        for line in proc.stderr:
            if self.log:
                self.log.info(line.strip()[:500], extra={"route": "bridge"})

    def alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def stop(self) -> None:
        with self._lock:
            if self._proc is not None:
                try:
                    self._proc.kill()
                    self._proc.wait(timeout=5)
                except (OSError, subprocess.TimeoutExpired):
                    pass
            self._proc = None

    # -- calls
    def call(self, fn: str, args: dict | None = None):
        with self._lock:
            if not self.alive():
                try:
                    self._start()
                except BridgeError:
                    self._count(fn, "error")
                    raise
            i = next(self._ids)
            fut: Future = Future()
            self._pending[i] = fut
            try:
                self._proc.stdin.write(json.dumps({"id": i, "fn": fn, "args": args or {}}, ensure_ascii=False) + "\n")
                self._proc.stdin.flush()
            except OSError as exc:
                self._pending.pop(i, None)
                self._count(fn, "error")
                raise BridgeError(f"bridge write failed: {exc}") from exc
        try:
            msg = fut.result(timeout=self.timeout_s)
        except FutureTimeout:
            self._pending.pop(i, None)
            self._count(fn, "timeout")
            self.stop()
            raise BridgeError(f"bridge call {fn} timed out after {self.timeout_s} s") from None
        except BridgeError:
            self._count(fn, "error")
            raise
        if not msg.get("ok"):
            self._count(fn, "error")
            raise BridgeError(str(msg.get("error"))[:300])
        self._count(fn, "ok")
        return msg["result"]

    def _count(self, fn: str, outcome: str) -> None:
        if self.metrics:
            self.metrics.bridge_calls.labels(fn, outcome).inc()
