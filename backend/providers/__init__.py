import os
from .base import LLMProvider
from .anthropic_provider import AnthropicProvider
from .groq_provider import GroqProvider


def _build_provider(name: str, api_key: str | None, model: str | None, endpoint: str | None) -> LLMProvider:
    name = (name or "anthropic").lower()
    if name == "groq":
        return GroqProvider(api_key=api_key, model=model)
    if name in ("openai",):
        try:
            from .openai_provider import OpenAIProvider  # type: ignore[import]
            return OpenAIProvider(api_key=api_key, model=model)
        except ImportError:
            raise RuntimeError("openai package not installed. Run: pip install openai")
    if name == "ollama":
        try:
            from .ollama_provider import OllamaProvider  # type: ignore[import]
            return OllamaProvider(endpoint=endpoint, model=model)
        except ImportError:
            raise RuntimeError("httpx package not installed. Run: pip install httpx")
    # Default: anthropic
    return AnthropicProvider(api_key=api_key, model=model)


def get_provider_from_db(db) -> LLMProvider:
    """Resolve provider from saved AppConfig + ProviderKey settings (BYOK)."""
    from db_models import AppConfig, ProviderKey

    active_prov = db.query(AppConfig).filter(AppConfig.key == "active_provider").first()
    active_model = db.query(AppConfig).filter(AppConfig.key == "active_model").first()

    provider_name = (active_prov.value if active_prov else None) or os.getenv("PROVIDER", "anthropic")
    model = active_model.value if active_model else None

    pk = db.query(ProviderKey).filter(ProviderKey.provider == provider_name).first()
    api_key = pk.api_key if pk else None
    endpoint = pk.endpoint if pk else None

    return _build_provider(provider_name, api_key=api_key, model=model, endpoint=endpoint)


def get_provider() -> LLMProvider:
    """Fallback: resolve provider from environment variables only."""
    name = os.getenv("PROVIDER", "anthropic").lower()
    return _build_provider(name, api_key=None, model=None, endpoint=None)
