"""Deterministic mock AI. Transparent rules so demos are repeatable offline."""
from __future__ import annotations

import re

from .schemas import ExtractedEvent, JournalReflection, SupportChatContent

TYPE_WORDS = {
    "feeding": r"\b(fed|feed|feeding|bottle|nursed|breastfed|formula|drank|ml)\b",
    "sleep": r"\b(slept|sleep|sleeping|nap|napped|asleep)\b",
    "diaper": r"\b(diaper|nappy|poop|pooped|wet|dirty|changed)\b",
}
TOPIC_WORDS = {
    "sleep": r"\b(sleep|slept|tired|exhausted|night|rest)\b",
    "physical_recovery": r"\b(stitch\w*|incision|pain|sore|bleed\w*|recover\w*|back)\b",
    "feeding": r"\b(feed\w*|latch\w*|milk|breast\w*|bottle)\b",
    "mood": r"\b(sad|happy|cry\w*|overwhelm\w*|anxious|worried|calm|alone|lonely)\b",
    "support": r"\b(help\w*|partner|husband|arjun|mother|mom|amma|family|friend)\b",
    "baby_care": r"\b(baby|anya|diaper|nap)\b",
}
FOLLOW_UPS = {
    "physical_recovery": "Would you like to log how your recovery feels today?",
    "sleep": "Would it help to plan one rest window for tomorrow?",
    "support": "Is there one thing you could ask someone to take on this week?",
    "mood": "Would you like to do a short check-in now?",
    "feeding": "Would you like to note anything about feeding to share with your doctor or midwife?",
}


def _parse_time(text: str) -> str | None:
    m = re.search(r"\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", text, re.IGNORECASE)
    if not m:
        return None
    hour, minute, ampm = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "").lower()
    if ampm == "pm" and hour < 12:
        hour += 12
    if ampm == "am" and hour == 12:
        hour = 0
    if hour > 23 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


class MockProvider:
    name = "mock-rules-0.1"

    def support_chat(self, conversation: dict) -> SupportChatContent:
        return SupportChatContent(reply="It sounds like today has asked a lot of you. If it feels comfortable, take one unhurried breath and let your shoulders soften. What would feel a little easier right now?")

    def extract_event(self, transcript: str) -> ExtractedEvent:
        text = transcript.lower()
        etype = next((t for t, pat in TYPE_WORDS.items() if re.search(pat, text)), "unknown")
        stated: list[str] = ["eventType"] if etype != "unknown" else []
        ev = ExtractedEvent(eventType=etype)
        if (t := _parse_time(text)) is not None:
            ev.startTimeLocal, stated = t, stated + ["startTimeLocal"]
        if etype == "feeding":
            if m := re.search(r"(\d{2,3})\s*(ml|mls|millilitres?|milliliters?)\b", text):
                ev.amountMl, stated = float(m.group(1)), stated + ["amountMl"]
            for method in ("formula", "bottle", "breast", "expressed"):
                if method in text:
                    ev.feedMethod, stated = method, stated + ["feedMethod"]
                    break
            if m := re.search(r"\b(left|right|both)\s*(side)?\b", text):
                ev.side, stated = m.group(1), stated + ["side"]
        if etype == "sleep":
            if m := re.search(r"(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b", text):
                ev.durationMin, stated = int(float(m.group(1)) * 60), stated + ["durationMin"]
            elif m := re.search(r"(\d+)\s*(minutes?|mins?)\b", text):
                ev.durationMin, stated = int(m.group(1)), stated + ["durationMin"]
        if etype == "diaper":
            wet, dirty = bool(re.search(r"\bwet\b", text)), bool(re.search(r"\b(dirty|poop\w*)\b", text))
            if wet or dirty:
                ev.diaperKind = "both" if wet and dirty else ("wet" if wet else "dirty")
                stated.append("diaperKind")
        required = {"feeding": ["startTimeLocal"], "sleep": ["startTimeLocal", "durationMin"], "diaper": ["diaperKind", "startTimeLocal"]}.get(etype, [])
        ev.userStatedFields = stated
        ev.missingFields = [f for f in required if getattr(ev, f) is None]
        return ev

    def reflect(self, transcript: str) -> JournalReflection:
        text = transcript.lower()
        topics = [t for t, pat in TOPIC_WORDS.items() if re.search(pat, text)] or ["other"]
        phrases = {
            "sleep": "how rest and sleep have been", "physical_recovery": "how your body is recovering",
            "feeding": "feeding", "mood": "how you have been feeling", "support": "the support around you",
            "baby_care": "caring for your baby", "other": "your day",
        }
        listed = [phrases[t] for t in topics[:3]]
        joined = listed[0] if len(listed) == 1 else ", ".join(listed[:-1]) + " and " + listed[-1]
        follow = next((FOLLOW_UPS[t] for t in topics if t in FOLLOW_UPS), None)
        return JournalReflection(summary=f"You talked about {joined}.", selfReportedTopics=topics, followUpQuestion=follow)
