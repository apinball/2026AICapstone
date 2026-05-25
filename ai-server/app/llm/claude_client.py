"""Anthropic Claude 클라이언트."""
import os

from .base import LLMProvider

try:
    from anthropic import AsyncAnthropic
    CLAUDE_AVAILABLE = True
except ImportError:
    CLAUDE_AVAILABLE = False


class ClaudeProvider(LLMProvider):
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        self.model_id = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")
        self.client = AsyncAnthropic(api_key=self.api_key) if (CLAUDE_AVAILABLE and self.api_key) else None

    async def call(self, system: str, user_text: str, max_tokens: int = 1024) -> str:
        if not self.is_configured():
            raise RuntimeError("Claude not configured (ANTHROPIC_API_KEY missing or sdk unavailable)")
        message = await self.client.messages.create(
            model=self.model_id,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_text}],
        )
        return message.content[0].text

    def is_configured(self) -> bool:
        return CLAUDE_AVAILABLE and self.client is not None

    @property
    def name(self) -> str:
        return "claude"
