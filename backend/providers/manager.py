"""ProviderManager — the single entry point for all LLM provider resolution.

Responsibilities
----------------
1. **Strict BYOK resolution.** ``get_active_provider(db)`` reads the active
   provider/model from ``AppConfig`` and the credential from ``ProviderKey``.
   If the selected provider has no key (or, for Ollama, no endpoint) it raises a
   ``ProviderError(MISSING_KEY)``. There is **no** silent env-var fallback, no
   developer-key fallback, and no provider substitution. The user gets exactly
   the provider they configured, or a clear failure.

2. **Health checks.** ``health_check_all(db)`` probes every registered provider
   and returns a serialisable status row (provider, model, status, last error,
   latency, quota state) for the dashboard.

3. **Usage metrics.** An in-process registry accumulates requests / failures /
   tokens / latency per provider, exposed via ``get_metrics()``.

Every generation path MUST resolve through ``provider_manager.get_active_provider``
— never by constructing a provider class directly.
"""

from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone

from .base import LLMProvider
from .errors import ProviderError, ProviderErrorType, classify_exception
from .anthropic_provider import AnthropicProvider
from .groq_provider import GroqProvider
from .gemini_provider import GeminiProvider
from .openai_provider import OpenAIProvider
from .ollama_provider import OllamaProvider

logger = logging.getLogger(__name__)

# Canonical default model per provider (used when AppConfig has no active_model).
_DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-6",
    "openai": "gpt-4o-mini",
    "gemini": "gemini-2.0-flash",
    "groq": "llama-3.3-70b-versatile",
    "ollama": "llama3.2",
}


class ProviderManager:
    """Registry + strict-BYOK resolver + health/metrics surface."""

    REGISTRY: dict[str, type[LLMProvider]] = {
        "anthropic": AnthropicProvider,
        "openai": OpenAIProvider,
        "groq": GroqProvider,
        "gemini": GeminiProvider,
        "ollama": OllamaProvider,
    }
    ENDPOINT_PROVIDERS = {"ollama"}

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # provider_id -> {requests, failures, tokens_in, tokens_out,
        #                 total_latency_ms, last_latency_ms, last_error, last_used}
        self._metrics: dict[str, dict] = {}

    # ── Configuration ────────────────────────────────────────────────────────

    def get_active_config(self, db, org_id: str | None = None) -> tuple[str, str]:
        """Return ``(provider_id, model)`` from AppConfig (org-scoped when given).

        Each org selects its own active provider/model via namespaced AppConfig
        keys (``active_provider:<org_id>``), falling back to the legacy global key
        then the ``PROVIDER`` env default.
        """
        from db_models import AppConfig

        def _cfg(base: str) -> str | None:
            if org_id:
                row = db.query(AppConfig).filter(AppConfig.key == f"{base}:{org_id}").first()
                if row and row.value:
                    return row.value
            row = db.query(AppConfig).filter(AppConfig.key == base).first()
            return row.value if row else None

        provider = (_cfg("active_provider") or os.getenv("PROVIDER", "anthropic")).lower()
        model = _cfg("active_model") or _DEFAULT_MODELS.get(provider, "")
        return provider, model

    def _credential(self, db, provider: str, org_id: str | None = None) -> tuple[str | None, str | None]:
        """Return ``(api_key, endpoint)`` for ``provider`` scoped to an org."""
        from db_models import ProviderKey

        from services.secrets import decrypt_secret

        q = db.query(ProviderKey).filter(ProviderKey.provider == provider)
        q = q.filter(ProviderKey.organization_id == org_id) if org_id else q.filter(ProviderKey.organization_id.is_(None))
        pk = q.first()
        if not pk:
            return None, None
        return decrypt_secret(pk.api_key), pk.endpoint

    # ── Construction ─────────────────────────────────────────────────────────

    def _build(self, provider: str, *, api_key: str | None, model: str | None, endpoint: str | None) -> LLMProvider:
        cls = self.REGISTRY.get(provider)
        if cls is None:
            raise ProviderError(
                f"Unknown provider '{provider}'. Supported: {', '.join(self.REGISTRY)}.",
                ProviderErrorType.UNKNOWN,
                provider=provider,
            )
        if provider in self.ENDPOINT_PROVIDERS:
            return cls(endpoint=endpoint, model=model)  # type: ignore[call-arg]
        return cls(api_key=api_key, model=model)  # type: ignore[call-arg]

    def get_active_provider(self, db, org_id: str | None = None) -> LLMProvider:
        """Resolve the active provider under **strict BYOK** rules (org-scoped).

        Raises ``ProviderError(MISSING_KEY)`` when the selected provider has no
        configured credential. Never falls back to env keys or another provider.
        """
        provider, model = self.get_active_config(db, org_id)
        api_key, endpoint = self._credential(db, provider, org_id)

        if provider in self.ENDPOINT_PROVIDERS:
            if not endpoint:
                raise ProviderError(
                    f"No endpoint configured for {provider}. Set it in Settings to generate.",
                    ProviderErrorType.MISSING_KEY,
                    provider=provider,
                )
        elif not api_key:
            raise ProviderError(
                f"No API key configured for {provider}. Add your key in Settings to generate.",
                ProviderErrorType.MISSING_KEY,
                provider=provider,
            )

        return self._build(provider, api_key=api_key, model=model, endpoint=endpoint)

    def resolve_for(self, db, provider: str, model: str | None, org_id: str | None = None) -> LLMProvider:
        """Resolve a *specific* provider/model under strict BYOK rules (org-scoped).

        Used by the durable-job worker: a run records the provider/model it was
        created with, and the worker must rebuild exactly that — from the run's
        own organization's keys. No env/developer fallback.
        """
        provider = (provider or "").lower()
        api_key, endpoint = self._credential(db, provider, org_id)
        if provider in self.ENDPOINT_PROVIDERS:
            if not endpoint:
                raise ProviderError(
                    f"No endpoint configured for {provider}.",
                    ProviderErrorType.MISSING_KEY,
                    provider=provider,
                )
        elif not api_key:
            raise ProviderError(
                f"No API key configured for {provider}.",
                ProviderErrorType.MISSING_KEY,
                provider=provider,
            )
        return self._build(provider, api_key=api_key, model=model, endpoint=endpoint)

    def try_get_active_provider(self, db, org_id: str | None = None) -> LLMProvider | None:
        """Non-raising variant for optional paths (e.g. the parser LLM fallback).

        Returns ``None`` when no provider is configured, so callers can degrade
        gracefully instead of failing.
        """
        try:
            return self.get_active_provider(db, org_id)
        except ProviderError as exc:
            logger.info("No active provider available: %s", exc)
            return None

    # ── Health ───────────────────────────────────────────────────────────────

    def health_check(self, db, provider: str, org_id: str | None = None) -> dict:
        """Probe a single provider and return a dashboard status row (org-scoped)."""
        provider = provider.lower()
        active_provider, active_model = self.get_active_config(db, org_id)
        # Only pin the configured model for the active provider; others probe
        # against their default model.
        probe_model = active_model if provider == active_provider else None
        api_key, endpoint = self._credential(db, provider, org_id)
        configured = bool(endpoint) if provider in self.ENDPOINT_PROVIDERS else bool(api_key)

        row = {
            "provider": provider,
            "model": _DEFAULT_MODELS.get(provider, ""),
            "configured": configured,
            "status": "healthy",
            "label": "Healthy",
            "last_error": None,
            "latency_ms": None,
            "quota_state": "ok",
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

        if not configured:
            row.update(status="not_configured", label="Not Configured", quota_state="unknown")
            return row

        try:
            inst = self._build(provider, api_key=api_key, model=probe_model, endpoint=endpoint)
            row["model"] = inst.model_name
            latency = inst.health_check()
            row["latency_ms"] = latency
            row["status"] = "healthy"
            row["label"] = "Healthy"
        except Exception as exc:  # noqa: BLE001
            perr = classify_exception(exc, provider=provider)
            row["status"] = perr.error_type.value
            row["label"] = perr.health_label
            row["last_error"] = perr.message
            if perr.error_type == ProviderErrorType.QUOTA_EXHAUSTED:
                row["quota_state"] = "exhausted"
            elif perr.error_type == ProviderErrorType.RATE_LIMIT:
                row["quota_state"] = "rate_limited"
        return row

    def health_check_all(self, db, org_id: str | None = None) -> list[dict]:
        """Probe every registered provider (configured ones make a live call)."""
        active_provider, _ = self.get_active_config(db, org_id)
        rows = [self.health_check(db, name, org_id) for name in self.REGISTRY]
        for row in rows:
            row["active"] = row["provider"] == active_provider
        return rows

    # ── Metrics ──────────────────────────────────────────────────────────────

    def _bucket(self, provider: str) -> dict:
        b = self._metrics.get(provider)
        if b is None:
            b = {
                "provider": provider,
                "requests": 0,
                "failures": 0,
                "tokens_in": 0,
                "tokens_out": 0,
                "total_latency_ms": 0.0,
                "last_latency_ms": None,
                "last_error": None,
                "last_used": None,
            }
            self._metrics[provider] = b
        return b

    def record_usage(
        self,
        provider: str,
        *,
        latency_ms: float,
        success: bool,
        tokens_in: int = 0,
        tokens_out: int = 0,
        error_type: str | None = None,
    ) -> None:
        """Record one provider call for observability (thread-safe)."""
        with self._lock:
            b = self._bucket(provider)
            b["requests"] += 1
            b["total_latency_ms"] += latency_ms
            b["last_latency_ms"] = round(latency_ms, 1)
            b["tokens_in"] += tokens_in
            b["tokens_out"] += tokens_out
            b["last_used"] = datetime.now(timezone.utc).isoformat()
            if not success:
                b["failures"] += 1
                b["last_error"] = error_type

    def get_metrics(self) -> list[dict]:
        with self._lock:
            out = []
            for b in self._metrics.values():
                reqs = b["requests"] or 1
                out.append({
                    **b,
                    "avg_latency_ms": round(b["total_latency_ms"] / reqs, 1),
                    "error_rate": round(b["failures"] / reqs, 3),
                })
            return out


# Module-level singleton — import and use everywhere.
provider_manager = ProviderManager()
