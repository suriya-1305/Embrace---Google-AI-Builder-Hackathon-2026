from __future__ import annotations

import re

from .guards import BLOCKED_TERMS
from .schemas import SupportChatContent, SupportChatIn
from ..safety.engine import support_content

URGENT_WORDS = re.compile(r"\b(suicid\w*|kill myself|hurt myself|harm myself|end my life|want to die|kill my baby|hurt my baby|harm my baby|cannot keep (?:myself|my baby) safe|can't keep (?:myself|my baby) safe)\b", re.IGNORECASE)
UNSAFE_REPLY = re.compile(r"\b(\d+\s*mg|antidepressant|sedative|i am your therapist|i love you|only i understand|keep this secret)\b", re.IGNORECASE)
DISCLAIMER = "A conversation with Gemini, not therapy or medical care. This chat is not saved to your journal."


def needs_human_support(body: SupportChatIn) -> bool:
    context = " ".join([body.message, body.journalContext, *(message.text for message in body.history if message.role == "user")])
    return bool(URGENT_WORDS.search(context))


def support_reply(body: SupportChatIn, provider_factory) -> dict:
    def urgent() -> dict:
        return {"reply": "Please reach out to a trusted person who can stay with you, and contact local emergency services if there is immediate danger. If your baby is with you, place them somewhere safe while you get support.",
                "supportNow": True, "provider": "safety-guidance", "support": support_content("IN"), "disclaimer": DISCLAIMER}

    if needs_human_support(body):
        return urgent()
    provider = provider_factory()
    response = SupportChatContent.model_validate(provider.support_chat(body.model_dump()))
    if response.safetyConcern == "human_support_now":
        return urgent()
    reply = response.reply
    if BLOCKED_TERMS.search(reply) or UNSAFE_REPLY.search(reply):
        reply = "That sounds like a lot to carry. You deserve support from someone you trust, and your care team can help with health questions. Is there one small thing you could ask someone to help with today?"
    return {"reply": reply, "supportNow": False, "provider": getattr(provider, "name", "ai"), "disclaimer": DISCLAIMER}