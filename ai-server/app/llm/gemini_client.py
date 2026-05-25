"""Google Gemini 클라이언트."""
import os

from .base import LLMProvider

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False


class GeminiProvider(LLMProvider):
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.model_id = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        if GEMINI_AVAILABLE and self.api_key:
            genai.configure(api_key=self.api_key)

    async def call(self, system: str, user_text: str, max_tokens: int = 1024) -> str:
        if not self.is_configured():
            raise RuntimeError("Gemini not configured (GEMINI_API_KEY missing or sdk unavailable)")
        model = genai.GenerativeModel(
            model_name=self.model_id,
            system_instruction=system,
            generation_config={
                "max_output_tokens": max_tokens,
                "temperature": 0.3,
            },
        )
        response = await model.generate_content_async(user_text)
        return response.text

    def is_configured(self) -> bool:
        return GEMINI_AVAILABLE and bool(self.api_key)

    @property
    def name(self) -> str:
        return "gemini"
