"""OpenAI provider implemented directly over the REST API via httpx.

We talk to the Chat Completions endpoint with httpx (already a transitive
dependency) rather than the heavyweight ``openai`` SDK, so the provider works
out of the box without adding install weight. Errors are surfaced through the
same classified ``ProviderError`` channel as every other provider.
"""

import os

import httpx

from .base import LLMProvider
from .errors import ProviderError, ProviderErrorType, classify_exception

_DEFAULT_BASE = "https://api.openai.com/v1"
_TIMEOUT = 60.0


class OpenAIProvider(LLMProvider):
    provider_id = "openai"

    def __init__(self, api_key: str | None = None, model: str | None = None, base_url: str | None = None) -> None:
        self._api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self._model = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self._base = (base_url or os.getenv("OPENAI_BASE_URL") or _DEFAULT_BASE).rstrip("/")
        self.last_usage: dict[str, int] = {"input": 0, "output": 0}

    @property
    def model_name(self) -> str:
        return self._model

    def complete(self, system: str, user: str, temperature: float = 0.0, max_tokens: int = 4096) -> str:
        self.last_usage = {"input": 0, "output": 0}
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        try:
            resp = httpx.post(
                f"{self._base}/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            raise classify_exception(exc, provider=self.provider_id)

        try:
            data = resp.json()
            usage = data.get("usage") or {}
            self.last_usage = {
                "input": usage.get("prompt_tokens", 0) or 0,
                "output": usage.get("completion_tokens", 0) or 0,
            }
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as exc:
            raise ProviderError(
                f"OpenAI returned an unparseable response: {exc}",
                ProviderErrorType.BAD_RESPONSE,
                provider=self.provider_id,
            )
