import os

from groq import Groq

from .base import LLMProvider
from .errors import ProviderError, ProviderErrorType, classify_exception


class GroqProvider(LLMProvider):
    provider_id = "groq"

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        resolved_key = api_key or os.getenv("GROQ_API_KEY", "")
        self._client = Groq(api_key=resolved_key)
        self._model = model or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        self.last_usage: dict[str, int] = {"input": 0, "output": 0}

    @property
    def model_name(self) -> str:
        return self._model

    def complete(self, system: str, user: str, temperature: float = 0.0, max_tokens: int = 4096) -> str:
        self.last_usage = {"input": 0, "output": 0}
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as exc:  # noqa: BLE001
            raise classify_exception(exc, provider=self.provider_id)

        usage = getattr(response, "usage", None)
        if usage is not None:
            self.last_usage = {
                "input": getattr(usage, "prompt_tokens", 0) or 0,
                "output": getattr(usage, "completion_tokens", 0) or 0,
            }
        if not response.choices:
            raise ProviderError(
                "Groq returned no choices.",
                ProviderErrorType.BAD_RESPONSE,
                provider=self.provider_id,
            )
        return response.choices[0].message.content
