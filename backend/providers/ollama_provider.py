"""Ollama provider — local/self-hosted models over HTTP.

Authenticates via an endpoint URL rather than an API key (``uses_endpoint``),
which the ProviderManager's strict-BYOK validation accounts for. The health
probe uses Ollama's cheap ``/api/tags`` listing instead of a real completion.
"""

import os
import time

import httpx

from .base import LLMProvider
from .errors import ProviderError, ProviderErrorType, classify_exception

_DEFAULT_ENDPOINT = "http://localhost:11434"
_TIMEOUT = 120.0


class OllamaProvider(LLMProvider):
    provider_id = "ollama"
    uses_endpoint = True

    def __init__(self, endpoint: str | None = None, model: str | None = None) -> None:
        self._endpoint = (endpoint or os.getenv("OLLAMA_ENDPOINT") or _DEFAULT_ENDPOINT).rstrip("/")
        self._model = model or os.getenv("OLLAMA_MODEL", "llama3.2")
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
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        try:
            resp = httpx.post(f"{self._endpoint}/api/chat", json=payload, timeout=_TIMEOUT)
            resp.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            raise classify_exception(exc, provider=self.provider_id)

        try:
            data = resp.json()
            self.last_usage = {
                "input": data.get("prompt_eval_count", 0) or 0,
                "output": data.get("eval_count", 0) or 0,
            }
            return data["message"]["content"]
        except (KeyError, ValueError) as exc:
            raise ProviderError(
                f"Ollama returned an unparseable response: {exc}",
                ProviderErrorType.BAD_RESPONSE,
                provider=self.provider_id,
            )

    def health_check(self) -> float:
        start = time.perf_counter()
        try:
            resp = httpx.get(f"{self._endpoint}/api/tags", timeout=10.0)
            resp.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            raise classify_exception(exc, provider=self.provider_id)
        return round((time.perf_counter() - start) * 1000, 1)
