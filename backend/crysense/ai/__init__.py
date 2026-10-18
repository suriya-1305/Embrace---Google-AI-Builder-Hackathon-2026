from __future__ import annotations

from ..config import get_settings

_AI = None


def get_ai():
    """AI_PROVIDER=mock (default) or gemini."""
    global _AI
    if _AI is None:
        settings = get_settings()
        if settings.ai_provider == "gemini":
            from .gemini_provider import GeminiProvider

            _AI = GeminiProvider(settings)
        else:
            from .mock_provider import MockProvider

            _AI = MockProvider()
    return _AI
