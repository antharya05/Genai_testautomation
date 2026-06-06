import os
from groq import Groq
from .base import LLMProvider


class GroqProvider(LLMProvider):
    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        resolved_key = api_key or os.getenv("GROQ_API_KEY", "")
        self._client = Groq(api_key=resolved_key)
        self._model = model or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    @property
    def model_name(self) -> str:
        return self._model

    def complete(self, system: str, user: str, temperature: float = 0.0, max_tokens: int = 4096) -> str:
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content
