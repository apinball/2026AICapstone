"""LLM Provider 추상 인터페이스."""
from abc import ABC, abstractmethod


class LLMProvider(ABC):
    @abstractmethod
    async def call(self, system: str, user_text: str, max_tokens: int = 1024) -> str:
        """단일 턴 호출. JSON 형식 응답이 필요한 경우 system prompt에 명시할 것."""
        ...

    @abstractmethod
    def is_configured(self) -> bool:
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        ...
