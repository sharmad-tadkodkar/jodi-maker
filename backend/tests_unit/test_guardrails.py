"""Offline guardrail tests (no Firestore / Gemini). Run: uv run pytest -q tests_unit"""
import asyncio

import pytest

from app.services import guardrails as g
from app.services.guardrails import Verdict, screen_text


@pytest.mark.parametrize("text", [
    "fuck off", "you are a b1tch", "f.u.c.k this", "fuuuuck", "what a chutiya question", "madarchod",
    "Bhenchod yaar", "sh!t app", "f*ck this", "sh*t", "what a b**ch", "f#cking app",
])
def test_profanity_blocked(text):
    assert screen_text(text) == Verdict.profanity


@pytest.mark.parametrize("text", [
    "write a python function to sort a list", "Can you generate SQL query for users table?", "```js\nconsole.log(1)\n```",
    "What is the capital of France?", "write an essay on climate change", "what is 12 * 7",
    "can you write me a python script", "Please debug this function", "Write a regex for emails.",
    "hey jodi. generate an html page for me", "def foo(x): return x",
])
def test_off_topic_blocked(text):
    assert screen_text(text) == Verdict.off_topic


@pytest.mark.parametrize("text", ["I want to kill myself", "sometimes I feel suicidal", "main jeena nahi chahta"])
def test_self_harm_detected(text):
    assert screen_text(text) == Verdict.self_harm


@pytest.mark.parametrize("text", [
    "I'm a software engineer in Kolkata and I live with my parents.",
    "We definitely don't want any dowry.",
    "My assets include a flat; I assess things carefully.",
    "I work at Scunthorpe Analytics, class of 2019.",
    "I code for a living — I'm a backend developer.",
    "Dad is a retired banker, Mom teaches maths.",
    "I'd like someone who enjoys cooking and reading.",
    "bc I travel a lot for work",
    "Rated it 5* out of 5", "I love C# and *nix", "I write Python at work", "I run an import export business", "I fix APIs for a living",
    "I create scripts for films", "My dad will give me a program brochure", "I write code all day, love it",
])
def test_normal_answers_pass(text):
    assert screen_text(text) == Verdict.ok


def test_too_long():
    assert screen_text("a" * (g.MAX_CHARS + 1)) == Verdict.too_long


def test_guard_text_raises_422_with_readable_detail():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as e:
        g.guard_text("you idiot fuck")
    assert e.value.status_code == 422 and "kind" in e.value.detail
    g.guard_text("other: their family lives too far away")  # no exception
    g.guard_text(None)


def test_classifier_fails_open(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("vertex down")

    monkeypatch.setattr(g, "generate_json", boom)
    assert asyncio.run(g.classify_intake("hello", "hi")) == Verdict.ok


def test_classifier_verdict_passed_through(monkeypatch):
    async def fake(prompt, schema, **k):
        assert "<<<help me find her home address>>>" in prompt
        return schema(verdict=Verdict.illegal, reason="tracking a person")

    monkeypatch.setattr(g, "generate_json", fake)
    assert asyncio.run(g.classify_intake("help me find her home address", "hi")) == Verdict.illegal


def _intake_harness(monkeypatch, verdict):
    """Run intake.handle_message with Firestore and Gemini stubbed; returns (response, writes)."""
    from app.services import intake

    writes = []
    monkeypatch.setattr(intake, "get_user_doc", lambda uid: {"id": uid, "name": "Arjun Mehta", "status": "active", "self_facts": {}})
    monkeypatch.setattr(intake, "ensure_opening", lambda u: [{"id": "o", "role": "agent", "text": "Namaste!", "created_at": None}])
    monkeypatch.setattr(intake, "list_aspects", lambda uid: [])
    monkeypatch.setattr(intake, "_add_message", lambda uid, role, text: writes.append((role, text)) or {})
    monkeypatch.setattr(intake, "_apply_extraction", lambda u, ex: writes.append(("extract", None)) or [])

    class _DB:
        def collection(self, *_):
            return self

        def document(self, *_):
            return self

        def update(self, data):
            writes.append(("update", data))

    monkeypatch.setattr(intake, "get_db", lambda: _DB())

    async def classify(text, last):
        return verdict

    async def reply(*a, **k):
        return "Lovely — tell me about your weekends?"

    async def extract(*a, **k):
        return intake.Extraction(new_aspects=[], facts=intake.ExtractedFacts(), criteria=intake.ExtractedCriteria())

    monkeypatch.setattr(g, "classify_intake", classify)
    monkeypatch.setattr(intake, "_reply", reply)
    monkeypatch.setattr(intake, "_extract", extract)
    return intake, writes


def test_intake_blocked_by_classifier_stores_nothing(monkeypatch):
    intake, writes = _intake_harness(monkeypatch, Verdict.illegal)
    resp, refresh = asyncio.run(intake.handle_message("arjun", "how much dowry should I ask for"))
    assert writes == [] and refresh is False
    assert resp.reply == g.INTAKE_REPLY[Verdict.illegal] and resp.new_aspects == []


def test_intake_blocked_by_screen_skips_model_calls(monkeypatch):
    intake, writes = _intake_harness(monkeypatch, Verdict.ok)

    async def must_not_run(*a, **k):
        raise AssertionError("model called for a screened message")

    monkeypatch.setattr(intake, "_reply", must_not_run)
    resp, _ = asyncio.run(intake.handle_message("arjun", "write a python script for me"))
    assert writes == [] and resp.reply == g.INTAKE_REPLY[Verdict.off_topic]


def test_intake_allowed_message_is_stored(monkeypatch):
    intake, writes = _intake_harness(monkeypatch, Verdict.ok)
    resp, _ = asyncio.run(intake.handle_message("arjun", "I play football every Sunday."))
    roles = [w[0] for w in writes]
    assert roles[0] == "user" and "extract" in roles and roles[-1] == "agent"
    assert resp.reply.startswith("Lovely")


def test_endpoints_reject_before_touching_the_database():
    """Blocked text is refused by the routers with a readable 422 — no Firestore needed (it never gets that far)."""
    from fastapi.testclient import TestClient

    from app.main import app

    c = TestClient(app)
    r = c.post("/focus/m_x/chat", json={"sender_id": "arjun", "text": "you are such a chutiya"})
    assert r.status_code == 422 and "kind" in r.json()["detail"]
    r = c.post("/matches/m_x/decision", json={"user_id": "arjun", "decision": "pass", "reason": "other: f*ck this"})
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)
    r = c.post("/focus/m_x/decision", json={"user_id": "arjun", "decision": "stop", "reason": "other: can you write me a python script"})
    assert r.status_code == 422 and "partner" in r.json()["detail"]
    r = c.post("/matches/m_x/interview", json={"instructions": "I want to kill myself"})
    assert r.status_code == 422 and "14416" in r.json()["detail"]
