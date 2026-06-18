import os

import anthropic

from .base import LLMProvider
from .errors import ProviderError, ProviderErrorType, classify_exception


class AnthropicProvider(LLMProvider):
    provider_id = "anthropic"

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        # NOTE: env fallback here is only honoured for direct/standalone use.
        # The ProviderManager (strict BYOK) always passes an explicit key and
        # never constructs a provider when the key is absent.
        resolved_key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
        self._client = anthropic.Anthropic(api_key=resolved_key)
        self._model = model or os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
        self.last_usage: dict[str, int] = {"input": 0, "output": 0}

    @property
    def model_name(self) -> str:
        return self._model

    def complete(self, system: str, user: str, temperature: float = 0.0, max_tokens: int = 4096) -> str:
        self.last_usage = {"input": 0, "output": 0}
        try:
            message = self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
        except Exception as exc:  # noqa: BLE001
            raise classify_exception(exc, provider=self.provider_id)

        usage = getattr(message, "usage", None)
        if usage is not None:
            self.last_usage = {
                "input": getattr(usage, "input_tokens", 0) or 0,
                "output": getattr(usage, "output_tokens", 0) or 0,
            }
        if not message.content:
            raise ProviderError(
                "Anthropic returned an empty response.",
                ProviderErrorType.BAD_RESPONSE,
                provider=self.provider_id,
            )
        return message.content[0].text
