import os

from .base import LLMProvider
from .errors import ProviderError, ProviderErrorType, classify_exception


class GeminiProvider(LLMProvider):
    provider_id = "gemini"

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        try:
            import google.generativeai as genai
        except ImportError:
            raise ProviderError(
                "google-generativeai package not installed. Run: pip install google-generativeai",
                ProviderErrorType.UNAVAILABLE,
                provider=self.provider_id,
            )

        resolved_key = api_key or os.getenv("GOOGLE_API_KEY", "")
        genai.configure(api_key=resolved_key)
        self._genai = genai
        self._model = model or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        self.last_usage: dict[str, int] = {"input": 0, "output": 0}

    @property
    def model_name(self) -> str:
        return self._model

    def complete(self, system: str, user: str, temperature: float = 0.0, max_tokens: int = 4096) -> str:
        self.last_usage = {"input": 0, "output": 0}
        try:
            model = self._genai.GenerativeModel(
                model_name=self._model,
                system_instruction=system,
            )
            response = model.generate_content(
                user,
                generation_config=self._genai.GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                ),
            )
        except Exception as exc:  # noqa: BLE001
            raise classify_exception(exc, provider=self.provider_id)

        usage = getattr(response, "usage_metadata", None)
        if usage is not None:
            self.last_usage = {
                "input": getattr(usage, "prompt_token_count", 0) or 0,
                "output": getattr(usage, "candidates_token_count", 0) or 0,
            }
        try:
            return response.text
        except Exception as exc:  # noqa: BLE001 — blocked / empty candidates
            raise ProviderError(
                f"Gemini returned no usable text: {exc}",
                ProviderErrorType.BAD_RESPONSE,
                provider=self.provider_id,
            )
