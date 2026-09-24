import re

from . import extraction, gemini

CAR_TERMS = (
    "car",
    "engine",
    "brake",
    "tire",
    "tyre",
    "oil",
    "battery",
    "check engine",
    "knock",
    "tapping",
    "squeal",
    "vibration",
    "smoke",
    "stall",
    "steering",
    "gearbox",
    "transmission",
    "clutch",
    "overheat",
    "fuel",
    "alternator",
    "starter",
    "warning light",
    "dashboard light",
    "service light",
    "mileage",
)

OFF_TOPIC_TERMS = (
    "homework",
    "recipe",
    "poem",
    "lyrics",
    "cricket",
    "football",
    "stock market",
)


def is_car_related(text: str, slots=None) -> bool:
    lowered = text.lower()
    if any(re.search(r"\b" + re.escape(term) + r"\b", lowered) for term in OFF_TOPIC_TERMS):
        return False
    slots = slots or {}
    if slots.get("symptom"):
        if not slots.get("year") and extraction.extract_year(text) is not None:
            return True
        if not slots.get("onset") and extraction.extract_onset(text) is not None:
            return True
    if any(
        re.search(r"\b" + re.escape(term) + r"\w*\b", lowered)
        for term in CAR_TERMS
        if term != "car"
    ):
        return True
    if re.search(r"\bcars?\b", lowered) or extraction.extract_brand(text):
        return True
    return gemini.classify_car_related(text)
