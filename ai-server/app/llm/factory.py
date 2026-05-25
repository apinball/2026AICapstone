"""LLM_PROVIDER 환경변수에 따라 적절한 LLMProvider 인스턴스 반환."""
import os

from .base import LLMProvider
from .ollama_client import OllamaProvider
from .gemini_client import GeminiProvider
from .claude_client import ClaudeProvider


def get_llm_provider() -> LLMProvider:
    name = os.getenv("LLM_PROVIDER", "ollama").lower()
    if name == "ollama":
        return OllamaProvider()
    if name == "gemini":
        return GeminiProvider()
    if name == "claude":
        return ClaudeProvider()
    raise ValueError(f"Unsupported LLM_PROVIDER: {name} (use 'ollama', 'gemini', or 'claude')")
