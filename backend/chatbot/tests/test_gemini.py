import json
from types import SimpleNamespace

import pytest

from chatbot.bot import gemini


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(gemini.time, "sleep", lambda seconds: None)
    monkeypatch.setattr(gemini.usage, "reserve_call", lambda: [])


def test_generate_diagnosis_parses_llm_json(monkeypatch):
    payload = {
        "summary": "Worn brake pads and low fluid level.",
        "recommended_service": "Brake pad replacement",
        "confidence": 0.9,
    }
    monkeypatch.setattr(gemini, "_generate", lambda parts, config=None: json.dumps(payload))
    result = gemini.generate_diagnosis("Vehicle: Maruti (2019)")
    assert result == {
        "summary": "Worn brake pads and low fluid level.",
        "recommended_service": "Brake pad replacement",
        "confidence": 0.9,
    }


def test_generate_diagnosis_rejects_out_of_range_confidence(monkeypatch):
    def clamped(parts, config=None):
        return json.dumps({"summary": "s", "confidence": 7})

    monkeypatch.setattr(gemini, "_generate", clamped)
    with pytest.raises(gemini.GeminiError):
        gemini.generate_diagnosis("ctx")


def test_generate_diagnosis_rejects_missing_service(monkeypatch):
    monkeypatch.setattr(
        gemini,
        "_generate",
        lambda parts, config=None: json.dumps({"summary": "s", "confidence": 0.5}),
    )
    with pytest.raises(gemini.GeminiError):
        gemini.generate_diagnosis("ctx")


def test_generate_diagnosis_rejects_empty_summary(monkeypatch):
    def empty_summary(parts, config=None):
        return json.dumps({"summary": "  ", "confidence": 0.5})

    monkeypatch.setattr(gemini, "_generate", empty_summary)
    with pytest.raises(gemini.GeminiError):
        gemini.generate_diagnosis("ctx")


def test_generate_diagnosis_rejects_malformed_json(monkeypatch):
    monkeypatch.setattr(gemini, "_generate", lambda parts, config=None: "not json at all")
    with pytest.raises(gemini.GeminiError):
        gemini.generate_diagnosis("ctx")


def test_generate_diagnosis_propagates_unavailable(monkeypatch):
    def down(parts, config=None):
        raise gemini.GeminiUnavailableError("down")

    monkeypatch.setattr(gemini, "_generate", down)
    with pytest.raises(gemini.GeminiUnavailableError):
        gemini.generate_diagnosis("ctx")


class FakeClient:
    """Stand-in for the SDK client: fails `fail_times` calls, then returns text."""

    def __init__(self, fail_times, result="YES"):
        self.calls = 0
        self.fail_times = fail_times
        outer = self

        class _Models:
            def generate_content(self, model, contents, config):
                outer.calls += 1
                if outer.calls <= outer.fail_times:
                    raise ConnectionError("blip")
                return SimpleNamespace(text=result, usage_metadata=None)

        self.models = _Models()


def test_retry_then_success(monkeypatch):
    fake = FakeClient(fail_times=2)
    monkeypatch.setattr(gemini, "_client", lambda: fake)
    # Two retries allowed, so this succeeds on the third attempt.
    assert gemini.classify_car_related("is this a car problem") is True
    assert fake.calls == 3


def test_retry_exhausted_raises_unavailable(monkeypatch):
    # analyze_media propagates the failure (unlike classify, which fails open).
    fake = FakeClient(fail_times=99)
    monkeypatch.setattr(gemini, "_client", lambda: fake)
    with pytest.raises(gemini.GeminiUnavailableError):
        gemini.analyze_media(b"\xff\xd8\xff", "image/jpeg")
    # One initial attempt + two retries, no more.
    assert fake.calls == 3


@pytest.mark.parametrize("code", [400, 401, 403])
def test_permanent_provider_errors_are_not_retried(monkeypatch, code):
    from unittest.mock import Mock

    generate = Mock(side_effect=gemini.errors.APIError(code, {"error": {"message": "rejected"}}))
    fake = SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    monkeypatch.setattr(gemini, "_client", lambda: fake)
    with pytest.raises(gemini.GeminiConfigurationError):
        gemini.analyze_media(b"test", "image/jpeg")
    assert generate.call_count == 1
