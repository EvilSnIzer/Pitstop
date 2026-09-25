
from . import prompts, usage

logger = logging.getLogger(__name__)
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
# Google limits the 2.5 family to accounts that used it before Sept 2026;
# new API keys must target a current model. 3.5 Flash-Lite is free-tier.
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
_MAX_RETRIES = 2
_RETRYABLE_API_CODES = (408, 429, 500, 502, 503, 504)


class GeminiError(Exception):
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)


def _api_error_detail(exc) -> str:
    detail = getattr(exc, "message", None)
    if not detail:
        status = getattr(exc, "status", None)
        if isinstance(status, dict):
            detail = (status.get("error") or {}).get("message")
    return str(detail or "unknown")[:500]


def _strip_sampling_params(config):
    """Gemini 3.x ignores temperature/top_p/top_k; future releases reject them.

    Thinking tokens count against max_output_tokens on 3.x models, so the
    callers keep generous caps. The per-model default thinking level applies.
    """
    if MODEL.startswith("gemini-3"):
        return config.model_copy(
            update={"temperature": None, "top_p": None, "top_k": None}
        )
    return config


@lru_cache(maxsize=1)
def _client():
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    client = _client()
    if client is None:
        raise GeminiNotConfiguredError("AI provider key is missing")
    config = config or types.GenerateContentConfig(temperature=0, max_output_tokens=512)
    config = _strip_sampling_params(
        config or types.GenerateContentConfig(max_output_tokens=1024)
    )
    deadline = time.monotonic() + min(40, usage.remaining_seconds())
    for attempt in range(_MAX_RETRIES + 1):
        remaining = min(deadline - time.monotonic(), usage.remaining_seconds())
            )
            return response.text.strip()
        except errors.APIError as exc:
            if exc.code not in (408, 429, 500, 502, 503, 504):
            logger.warning(
                "ai_call model=%s attempt=%s outcome=api_error code=%s message=%s",
                MODEL,
                attempt + 1,
                exc.code,
                _api_error_detail(exc),
            )
            if exc.code not in _RETRYABLE_API_CODES:
                raise GeminiConfigurationError("AI provider rejected the request") from exc
        except (httpx.TransportError, ConnectionError, TimeoutError):
            logger.warning(
    try:
        answer = _generate(
            [f"{prompts.CLASSIFY_PROMPT}\nMessage to classify: {text[:4000]}"],
            types.GenerateContentConfig(temperature=0, max_output_tokens=8),
            types.GenerateContentConfig(temperature=0, max_output_tokens=32),
        )
    except GeminiError:
        logger.warning("classifier_unavailable using intake fallback")
def analyze_media(data: bytes, mime_type: str) -> str:
    result = _generate(
        [types.Part.from_bytes(data=data, mime_type=mime_type), prompts.MEDIA_PROMPT],
        types.GenerateContentConfig(temperature=0, max_output_tokens=384),
        types.GenerateContentConfig(temperature=0, max_output_tokens=1024),
    )
    return "" if result.strip().upper().startswith("NOT RELEVANT") else result

            response_mime_type="application/json",
            response_schema=DiagnosisResult,
            temperature=0.2,
            max_output_tokens=1024,
            max_output_tokens=2048,
        ),
    )
    try:
