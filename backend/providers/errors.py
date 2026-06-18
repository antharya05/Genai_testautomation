"""Structured provider error classification.

Every provider raises a :class:`ProviderError` from ``complete()`` / ``health_check()``
instead of leaking a vendor-specific SDK exception. This gives the rest of the
platform a single, stable error surface it can reason about — for retry logic,
run-status classification, and the provider health dashboard.

The classifier is intentionally SDK-agnostic: it inspects status codes, exception
class names, and message substrings via duck typing so it works for the Anthropic,
OpenAI, Groq and Gemini SDKs (and raw httpx calls) without importing any of them.
"""

from __future__ import annotations

from enum import Enum


class ProviderErrorType(str, Enum):
    """Canonical, provider-independent failure categories."""

    MISSING_KEY = "missing_key"            # No API key / endpoint configured (BYOK)
    AUTH = "authentication"                # Key rejected / unauthorized
    INVALID_KEY = "invalid_key"            # Key malformed or not recognised
    RATE_LIMIT = "rate_limit"              # Too many requests (transient)
    QUOTA_EXHAUSTED = "quota_exhausted"    # Billing / credit limit reached
    UNAVAILABLE = "provider_unavailable"   # 5xx, connection refused, DNS, offline
    TIMEOUT = "timeout"                    # Request timed out
    BAD_RESPONSE = "bad_response"          # 2xx but unparseable / empty output
    UNKNOWN = "unknown"                    # Anything we could not classify


# Categories that make sense to retry within a single requirement. Auth / key /
# quota failures are deterministic — retrying only wastes time and quota.
RETRYABLE = frozenset({
    ProviderErrorType.RATE_LIMIT,
    ProviderErrorType.UNAVAILABLE,
    ProviderErrorType.TIMEOUT,
})

# Categories that are fatal for the *entire* run, not just one requirement. If the
# key is missing/invalid or the account is out of quota, every other requirement
# will fail identically — so the run short-circuits instead of grinding through.
FATAL = frozenset({
    ProviderErrorType.MISSING_KEY,
    ProviderErrorType.AUTH,
    ProviderErrorType.INVALID_KEY,
    ProviderErrorType.QUOTA_EXHAUSTED,
})

# Human-readable status labels for the health dashboard.
HEALTH_LABEL = {
    ProviderErrorType.MISSING_KEY: "Not Configured",
    ProviderErrorType.AUTH: "Invalid Key",
    ProviderErrorType.INVALID_KEY: "Invalid Key",
    ProviderErrorType.RATE_LIMIT: "Rate Limited",
    ProviderErrorType.QUOTA_EXHAUSTED: "Quota Exhausted",
    ProviderErrorType.UNAVAILABLE: "Offline",
    ProviderErrorType.TIMEOUT: "Timeout",
    ProviderErrorType.BAD_RESPONSE: "Degraded",
    ProviderErrorType.UNKNOWN: "Error",
}


class ProviderError(Exception):
    """A classified provider failure with a stable, serialisable shape."""

    def __init__(
        self,
        message: str,
        error_type: ProviderErrorType = ProviderErrorType.UNKNOWN,
        provider: str | None = None,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.error_type = error_type
        self.provider = provider
        self.status_code = status_code

    @property
    def retryable(self) -> bool:
        return self.error_type in RETRYABLE

    @property
    def fatal(self) -> bool:
        return self.error_type in FATAL

    @property
    def health_label(self) -> str:
        return HEALTH_LABEL.get(self.error_type, "Error")

    def to_dict(self) -> dict:
        return {
            "message": self.message,
            "error_type": self.error_type.value,
            "provider": self.provider,
            "status_code": self.status_code,
            "retryable": self.retryable,
            "fatal": self.fatal,
        }

    def __str__(self) -> str:  # pragma: no cover - cosmetic
        prefix = f"[{self.provider}] " if self.provider else ""
        return f"{prefix}{self.error_type.value}: {self.message}"


def _status_code(exc: Exception) -> int | None:
    """Best-effort extraction of an HTTP status code from any SDK exception."""
    for attr in ("status_code", "code", "http_status"):
        val = getattr(exc, attr, None)
        if isinstance(val, int):
            return val
    # httpx.HTTPStatusError carries it on .response
    resp = getattr(exc, "response", None)
    code = getattr(resp, "status_code", None)
    return code if isinstance(code, int) else None


def classify_exception(exc: Exception, provider: str | None = None) -> ProviderError:
    """Map any SDK/transport exception onto a canonical :class:`ProviderError`.

    Already-classified errors pass through unchanged (so a provider can raise a
    precise type and the generic catch-all won't re-bucket it).
    """
    if isinstance(exc, ProviderError):
        if provider and not exc.provider:
            exc.provider = provider
        return exc

    name = type(exc).__name__.lower()
    msg = str(exc) or ""
    low = msg.lower()
    status = _status_code(exc)

    def err(t: ProviderErrorType, text: str | None = None) -> ProviderError:
        return ProviderError(text or msg or t.value, t, provider=provider, status_code=status)

    # ── Timeouts ──────────────────────────────────────────────────────────────
    if isinstance(exc, TimeoutError) or "timeout" in name or "timed out" in low:
        return err(ProviderErrorType.TIMEOUT)

    # ── Connection / availability (no usable HTTP status) ────────────────────
    if status is None and any(k in name for k in ("connect", "connection", "network", "remoteprotocol")):
        return err(ProviderErrorType.UNAVAILABLE)
    if any(k in low for k in ("connection refused", "failed to establish", "name or service not known",
                              "could not connect", "connection error", "max retries exceeded")):
        return err(ProviderErrorType.UNAVAILABLE)

    # ── Quota / billing (check before generic rate-limit) ────────────────────
    if any(k in low for k in ("insufficient_quota", "insufficient quota", "exceeded your current quota",
                              "billing", "credit", "payment", "out of quota", "quota exceeded")):
        return err(ProviderErrorType.QUOTA_EXHAUSTED)
    if status == 402:
        return err(ProviderErrorType.QUOTA_EXHAUSTED)

    # ── Rate limiting ─────────────────────────────────────────────────────────
    if status == 429 or "ratelimit" in name or "rate limit" in low or "too many requests" in low:
        return err(ProviderErrorType.RATE_LIMIT)

    # ── Auth / invalid key ────────────────────────────────────────────────────
    if status in (401, 403) or "authentication" in name or "permissiondenied" in name:
        if any(k in low for k in ("invalid", "incorrect", "not a valid", "malformed", "no such")):
            return err(ProviderErrorType.INVALID_KEY)
        return err(ProviderErrorType.AUTH)
    if any(k in low for k in ("invalid api key", "incorrect api key", "invalid_api_key",
                              "api key not valid", "unauthorized", "no api key")):
        return err(ProviderErrorType.INVALID_KEY)

    # ── Server-side / unavailable ────────────────────────────────────────────
    if status is not None and status >= 500:
        return err(ProviderErrorType.UNAVAILABLE)
    if any(k in name for k in ("internalserver", "serviceunavailable", "apiconnection", "overloaded")):
        return err(ProviderErrorType.UNAVAILABLE)

    return err(ProviderErrorType.UNKNOWN)
