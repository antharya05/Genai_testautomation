"""Provider abstraction base class.

Every concrete provider exposes the same minimal surface:

  - ``complete(system, user, ...)`` → text, raising a classified ``ProviderError``
  - ``model_name`` → the resolved model id
  - ``provider_id`` → the canonical lowercase provider key (anthropic, groq, …)
  - ``health_check()`` → latency in ms, raising ``ProviderError`` on failure

Concrete providers should funnel SDK exceptions through
``providers.errors.classify_exception`` so the rest of the platform only ever
sees ``ProviderError``.
"""

from abc import ABC, abstractmethod


class LLMProvider(ABC):
    #: Canonical provider key, overridden per subclass (e.g. "anthropic").
    provider_id: str = "base"
    #: Whether this provider authenticates via an endpoint URL (Ollama) rather
    #: than an API key. Drives strict-BYOK validation in the manager.
    uses_endpoint: bool = False

    @abstractmethod
    def complete(self, system: str, user: str, temperature: float = 0.0, max_tokens: int = 4096) -> str:
        """Return a completion, raising ``ProviderError`` on any failure."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        ...

    def health_check(self) -> float:
        """Lightweight liveness probe.

        Returns latency in milliseconds on success; raises ``ProviderError`` on
        failure. The default implementation issues a 1-token completion. Providers
        with a cheaper probe (e.g. Ollama's tag listing) override this.
        """
        import time

        from .errors import classify_exception

        start = time.perf_counter()
        try:
            self.complete("You are a health probe.", "ping", temperature=0.0, max_tokens=1)
        except Exception as exc:  # noqa: BLE001 — re-raised as a classified error
            raise classify_exception(exc, provider=self.provider_id)
        return round((time.perf_counter() - start) * 1000, 1)
