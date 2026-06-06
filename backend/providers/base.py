from abc import ABC, abstractmethod


class LLMProvider(ABC):
    @abstractmethod
    def complete(self, system: str, user: str, temperature: float = 0.0, max_tokens: int = 4096) -> str:
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        pass
