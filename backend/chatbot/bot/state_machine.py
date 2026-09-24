"""Deterministic conversation flow.

The LLM never controls flow: this module does keyword/regex matching and
template replies only, so identical inputs always produce identical steps.
Views invoke the LLM for exactly three things - off-topic classification
(classifier.py) and, on the way to a diagnosis, media analysis + diagnosis
text (gemini.py).
"""

from dataclasses import dataclass, field

from . import extraction

PHASE_NEW = "new"
PHASE_IN_PROGRESS = "in_progress"
PHASE_DIAGNOSED = "diagnosed"
PHASE_BOOKED = "booked"

REQUIRED_SLOTS = ("symptom", "vehicle", "year", "onset")

GREETING = (
    "Hi, I'm your virtual mechanic. Tell me what's happening with your car - "
    "what you see, hear, or feel - and I'll walk you through it."
)

OFF_TOPIC_REPLY = (
    "I can only help with car and vehicle problems. Tell me what's going on "
    "with your car and I'll dig in."
)

REDIRECT_REPLY = "Let's stay on the car. "

QUESTIONS = {
    "symptom": "What exactly is the car doing? Describe what you see, hear, or feel.",
    "vehicle": "Which car is this - make and model?",
    "year": "And what year is it?",
    "onset": "When did you first notice it, and did it start suddenly or build up over time?",
}

READY_REPLY = (
    "That's enough for me to take a look. When you're ready, run the diagnosis - "
    "and feel free to attach a photo or video of the problem at any point."
)

DIAGNOSED_ACK = "Noted - I've added that to my notes on the problem."
BOOKED_ACK = "Noted - your booking stands, and I've added that to your notes."


@dataclass
class Step:
    reply: str
    phase: str
    slots: dict = field(default_factory=dict)


def is_ready(slots: dict) -> bool:
    """True once every required intake slot has a value. The views and the
    serializer rely on this as the single source of truth for the
    diagnosis-ready flag, so the rule lives here and only here."""
    return all(slots.get(slot) not in (None, "") for slot in REQUIRED_SLOTS)


def _absorb(slots: dict, text: str) -> None:
    # Extracted slots take the latest explicit mention (people correct
    # themselves: "no, it's a 2018"). Symptom is first-answer-wins: the
    # original problem report is what the diagnosis is anchored to.
    year = extraction.extract_year(text)
    if year is not None:
        slots["year"] = year
    brand = extraction.extract_brand(text)
    if brand is not None:
        slots["vehicle"] = brand
    onset = extraction.extract_onset(text)
    if onset is not None:
        slots["onset"] = onset
    if not slots.get("symptom"):
        cleaned = text.strip()
        if len(cleaned) >= 5:
            slots["symptom"] = cleaned


def _missing(slots: dict) -> str | None:
    return next((slot for slot in REQUIRED_SLOTS if slots.get(slot) in (None, "")), None)


def advance(phase: str, slots: dict, text: str, car_related: bool, media_analyses=()) -> Step:
    slots = dict(slots)
    if media_analyses:
        media = list(slots.get("media", []))
        media.extend(media_analyses)
        slots["media"] = media

    if phase == PHASE_NEW:
        if not car_related:
            return Step(OFF_TOPIC_REPLY, PHASE_NEW, slots)
        cleaned = text.strip()
        # The first car-related message IS the problem report.
        if cleaned:
            slots["symptom"] = cleaned
        phase = PHASE_IN_PROGRESS

    if phase == PHASE_IN_PROGRESS:
        if not car_related:
            # Re-ask the pending question so the user knows where we are.
            missing = _missing(slots)
            suffix = QUESTIONS[missing] if missing else READY_REPLY
            return Step(REDIRECT_REPLY + suffix, PHASE_IN_PROGRESS, slots)
        _absorb(slots, text)
        missing = _missing(slots)
        if missing:
            return Step(QUESTIONS[missing], PHASE_IN_PROGRESS, slots)
        return Step(READY_REPLY, PHASE_IN_PROGRESS, slots)

    # Diagnosed / booked: intake is over, just acknowledge.
    ack = DIAGNOSED_ACK if phase == PHASE_DIAGNOSED else BOOKED_ACK
    return Step(ack, phase, slots)
