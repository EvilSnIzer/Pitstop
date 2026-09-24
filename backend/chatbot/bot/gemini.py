import logging
import os
import random
import time
from functools import lru_cache

import httpx
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from . import prompts, usage

logger = logging.getLogger(__name__)
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
_MAX_RETRIES = 2


class GeminiError(Exception):
    pass


class GeminiUnavailableError(GeminiError):
    pass


class GeminiNotConfiguredError(GeminiUnavailableError):
    pass


class GeminiConfigurationError(GeminiError):
    pass


class GeminiBudgetError(GeminiError):
    pass


class DiagnosisResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    summary: str = Field(min_length=1, max_length=4000)
    recommended_service: str = Field(min_length=1, max_length=255)
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)


@lru_cache(maxsize=1)
def _client():
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    # The application owns the retry budget; do not multiply it with SDK retries.
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            timeout=12000, retry_options=types.HttpRetryOptions(attempts=1)
        ),
    )


def _generate(parts, config=None) -> str:
    client = _client()
    if client is None:
        raise GeminiNotConfiguredError("AI provider key is missing")
    config = config or types.GenerateContentConfig(temperature=0, max_output_tokens=512)
    deadline = time.monotonic() + min(40, usage.remaining_seconds())
    for attempt in range(_MAX_RETRIES + 1):
        remaining = min(deadline - time.monotonic(), usage.remaining_seconds())
        if remaining <= 0:
            raise GeminiUnavailableError("AI deadline exceeded")
        try:
            ids = usage.reserve_call()
        except usage.BudgetExceeded as exc:
            raise GeminiBudgetError("Daily AI budget reached") from exc
        started = time.monotonic()
        try:
            call_config = config.model_copy(
                update={
                    "http_options": types.HttpOptions(
                        timeout=max(1, int(min(12, remaining) * 1000)),
                        retry_options=types.HttpRetryOptions(attempts=1),
                    )
                }
            )
            response = client.models.generate_content(
                model=MODEL, contents=parts, config=call_config
            )
            usage.record_tokens(ids, response.usage_metadata)
            if not response.text:
                raise GeminiError("The AI provider returned no usable text")
            logger.info(
                "ai_call model=%s prompt=%s attempt=%s latency_ms=%s outcome=ok",
                MODEL,
                prompts.PROMPT_VERSION,
                attempt + 1,
                int((time.monotonic() - started) * 1000),
            )
            return response.text.strip()
        except errors.APIError as exc:
            if exc.code not in (408, 429, 500, 502, 503, 504):
                raise GeminiConfigurationError("AI provider rejected the request") from exc
        except (httpx.TransportError, ConnectionError, TimeoutError):
            logger.warning(
                "ai_call model=%s attempt=%s outcome=transport_error", MODEL, attempt + 1
            )
        if attempt < _MAX_RETRIES:
            delay = min(2**attempt + random.uniform(0, 0.25), max(0, deadline - time.monotonic()))
            time.sleep(delay)
    raise GeminiUnavailableError("AI provider temporarily unavailable")


def classify_car_related(text: str) -> bool:
    try:
        answer = _generate(
            [f"{prompts.CLASSIFY_PROMPT}\nMessage to classify: {text[:4000]}"],
            types.GenerateContentConfig(temperature=0, max_output_tokens=8),
        )
    except GeminiError:
        logger.warning("classifier_unavailable using intake fallback")
        return True
    return answer.strip().upper() != "NO"


def analyze_media(data: bytes, mime_type: str) -> str:
    result = _generate(
        [types.Part.from_bytes(data=data, mime_type=mime_type), prompts.MEDIA_PROMPT],
        types.GenerateContentConfig(temperature=0, max_output_tokens=384),
    )
    return "" if result.strip().upper().startswith("NOT RELEVANT") else result


def generate_diagnosis(context: str) -> dict:
    raw = _generate(
        [prompts.DIAGNOSIS_PROMPT.format(context=context[:20000])],
        types.GenerateContentConfig(
            system_instruction=prompts.SYSTEM_TECHNICIAN,
            response_mime_type="application/json",
            response_schema=DiagnosisResult,
            temperature=0.2,
            max_output_tokens=1024,
        ),
    )
    try:
        return DiagnosisResult.model_validate_json(raw).model_dump()
    except ValidationError as exc:
        raise GeminiError("AI response did not match the diagnosis schema") from exc
