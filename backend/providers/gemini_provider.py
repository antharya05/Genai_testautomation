import os
from .base import LLMProvider


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        try:
            import google.generativeai as genai
        except ImportError:
            raise RuntimeError("google-generativeai package not installed. Run: pip install google-generativeai")

        resolved_key = api_key or os.getenv("GOOGLE_API_KEY", "")
        genai.configure(api_key=resolved_key)
        self._genai = genai
        self._model = model or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    @property
    def model_name(self) -> str:
        return self._model

    def complete(self, system: str, user: str, temperature: float = 0.0, max_tokens: int = 4096) -> str:
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
        return response.text
