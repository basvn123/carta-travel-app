"""Framework exceptions."""


class IngestError(Exception):
    """Base for ingestion failures."""


class HTTPFailed(IngestError):
    """A request exhausted its retries or hit a non retryable status."""


class AuthMissing(IngestError):
    """A source needs credentials that are not configured. Collectors raising
    this are reported as SKIP (with instructions), never as failures, so one
    missing API key cannot sink a scheduled run."""
