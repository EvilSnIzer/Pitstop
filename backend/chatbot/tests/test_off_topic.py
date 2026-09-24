import pytest

from chatbot.bot import classifier, gemini


def test_car_keywords_classify_positive_without_llm(monkeypatch):
    def boom(text):
        pytest.fail("LLM should not be called for unambiguous car text")

    monkeypatch.setattr(gemini, "classify_car_related", boom)
    assert classifier.is_car_related("my check engine light is on") is True
    assert classifier.is_car_related("Maruti Swift won't start in the morning") is True


def test_off_topic_keywords_classify_negative_without_llm(monkeypatch):
    def boom(text):
        pytest.fail("LLM should not be called for unambiguous off-topic text")

    monkeypatch.setattr(gemini, "classify_car_related", boom)
    assert classifier.is_car_related("write me a poem about cricket") is False


def test_ambiguous_text_falls_back_to_llm(monkeypatch):
    seen = {}

    def fake(text):
        seen["text"] = text
        return True

    monkeypatch.setattr(gemini, "classify_car_related", fake)
    assert classifier.is_car_related("something is wrong with my machine") is True
    assert seen["text"] == "something is wrong with my machine"


def test_ambiguous_text_llm_says_no(monkeypatch):
    monkeypatch.setattr(gemini, "classify_car_related", lambda text: False)
    assert classifier.is_car_related("my washing machine is making a sound") is False


def test_gemini_parse_failure_fails_open(monkeypatch):
    monkeypatch.setattr(gemini, "_generate", lambda parts, config=None: "hard to say, maybe")
    assert gemini.classify_car_related("anything at all") is True


def test_gemini_says_no(monkeypatch):
    monkeypatch.setattr(gemini, "_generate", lambda parts, config=None: "NO")
    assert gemini.classify_car_related("my washing machine is making a sound") is False


def test_gemini_unavailable_fails_open(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert gemini.classify_car_related("anything at all") is True
