import logging
import re
from datetime import UTC, datetime

logger = logging.getLogger(__name__)

# Flat brand list covering the Indian market plus common imports. Not clever
# NER on purpose: these slots only gate the conversation flow, and the
# diagnosis step sees the full conversation anyway.
BRANDS = {
    "Maruti",
    "Toyota",
    "Honda",
    "Hyundai",
    "Kia",
    "Tata",
    "Mahindra",
    "Renault",
    "Nissan",
    "Ford",
    "Volkswagen",
    "VW",
    "Skoda",
    "Fiat",
    "BMW",
    "Mercedes",
    "Audi",
    "Jeep",
    "Volvo",
    "MG",
    "Isuzu",
}

_YEAR_RE = re.compile(r"\b(19[6-9]\d|20[012]\d)\b")

ONSET_RULES = (
    (
        "sudden",
        (
            "suddenly",
            "all of a sudden",
            "sudden",
            "last night",
            "this morning",
            "yesterday",
            "just now",
        ),
    ),
    (
        "gradual",
        (
            "getting worse",
            "more and more",
            "increasingly",
            "slowly",
            "over the last",
            "over the past",
            "day by day",
            "a few days",
            "few weeks",
            "for days",
            "for a week",
        ),
    ),
    (
        "intermittent",
        (
            "sometimes",
            "only when",
            "only if",
            "on and off",
            "randomly",
            "occasionally",
            "every now and then",
        ),
    ),
    ("constant", ("all the time", "always", "every time", "from the start")),
)


def extract_year(text: str) -> int | None:
    current_year = datetime.now(UTC).year
    years = [int(y) for y in _YEAR_RE.findall(text) if 1960 <= int(y) <= current_year]
    return years[-1] if years else None


def extract_brand(text: str) -> str | None:
    lowered = text.lower()
    # Longest first so "Volkswagen" wins over the "VW" substring.
    for brand in sorted(BRANDS, key=len, reverse=True):
        if re.search(r"\b" + re.escape(brand.lower()) + r"\b", lowered):
            return brand
    return None


def extract_onset(text: str) -> str | None:
    lowered = text.lower()
    for label, markers in ONSET_RULES:
        if any(marker in lowered for marker in markers):
            return label
    return None
