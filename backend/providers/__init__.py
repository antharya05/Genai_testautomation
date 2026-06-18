"""Provider package public surface.

All generation paths resolve providers through the :data:`provider_manager`
singleton (strict BYOK). The legacy ``get_provider`` (env-only) resolver has been
removed — there is no hidden env/developer-key fallback any more.

``get_provider_from_db`` is kept as a thin, non-raising compatibility shim for
optional paths (e.g. the parser's LLM fallback) that must degrade gracefully when
no provider is configured. New code should call ``provider_manager`` directly.
"""

from .base import LLMProvider
from .errors import ProviderError, ProviderErrorType, classify_exception
from .manager import provider_manager

__all__ = [
    "LLMProvider",
    "ProviderError",
    "ProviderErrorType",
    "classify_exception",
    "provider_manager",
    "get_provider_from_db",
]


def get_provider_from_db(db) -> LLMProvider | None:
    """Deprecated: use ``provider_manager.get_active_provider`` / ``try_get_active_provider``.

    Returns ``None`` when no provider is configured (graceful-degradation paths).
    """
    return provider_manager.try_get_active_provider(db)
