import os
from .base import LLMProvider
from .anthropic_provider import AnthropicProvider
from .groq_provider import GroqProvider


def get_provider() -> LLMProvider:
    name = os.getenv("PROVIDER", "anthropic").lower()
    if name == "groq":
        return GroqProvider()
    return AnthropicProvider()
