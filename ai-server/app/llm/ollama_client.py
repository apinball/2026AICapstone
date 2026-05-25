"""Ollama 로컬 LLM 클라이언트 (httpx 기반)."""
import os
import httpx

from .base import LLMProvider


class OllamaProvider(LLMProvider):
    def __init__(self):
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
        self.model = os.getenv("OLLAMA_MODEL", "qwen2.5:14b")

    async def call(self, system: str, user_text: str, max_tokens: int = 1024) -> str:
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user_text},
                    ],
                    "format": "json",
                    "stream": False,
                    "options": {"num_predict": max_tokens, "temperature": 0.3},
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("message", {}).get("content", "")

    def is_configured(self) -> bool:
        return True

    @property
    def name(self) -> str:
        return "ollama"
