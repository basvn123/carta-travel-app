"""Prometheus metrics on a registry of the app's own, served at /metrics."""
from __future__ import annotations

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram


class Metrics:
    def __init__(self):
        self.registry = CollectorRegistry()
        r = self.registry
        self.requests = Counter("intel_requests_total", "Requests by route and status", ["route", "status"], registry=r)
        self.latency = Histogram("intel_request_seconds", "Request time by route", ["route"], registry=r,
                                 buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10))
        self.items = Counter("intel_items_total", "Items handled by endpoint (a batch counts each item)", ["route"], registry=r)
        self.auth_failures = Counter("intel_auth_failures_total", "Requests refused for a missing or wrong key", registry=r)
        self.rate_limited = Counter("intel_rate_limited_total", "Requests refused by the rate limit", ["key_id"], registry=r)
        self.bridge_calls = Counter("intel_bridge_calls_total", "Node bridge calls", ["fn", "outcome"], registry=r)
        self.bridge_restarts = Counter("intel_bridge_restarts_total", "Node bridge (re)starts", registry=r)
        self.similar_items = Gauge("intel_similar_index_items", "Items in the similarity index", registry=r)
