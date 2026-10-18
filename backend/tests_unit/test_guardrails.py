"""Offline guardrail tests (no Firestore / Gemini). Run: uv run pytest -q tests_unit"""
import asyncio

import pytest

from app.services import guardrails as g
from app.services.guardrails import Verdict, screen_text


@pytest.mark.parametrize("text", [
    "fuck off", "you are a b1tch", "f.u.c.k this", "fuuuuck", "what a chutiya question", "madarchod",
    "Bhenchod yaar", "sh!t app", "f*ck this", "sh*t", "what a b**ch", "f#cking app", "f*** off, you're useless",
    "what a cock", "you pussy", "retarded idea",
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
def test_self_harm_is_a_hint_for_the_model_not_a_block(text):
    assert g.self_harm_hint(text) and screen_text(text) == Verdict.ok


# Real answers the first version blocked (found by bench/safety_probe.py and an offline sweep).
@pytest.mark.parametrize("text", [
    "Bangalore is the IT capital of India, that's why I moved here",
    "I love the weather in Bangalore, Pune is too hot now",
    "Good news about my promotion came last week",
    "Marrying someone just for money is a recipe for disaster",
    "My grandmother asked me to translate to Marathi for her",
    "Who is the CEO of my company? A woman I admire a lot",
    "I graduated summa cum laude, then did my masters at Lund University",
    "I fly planes, I love being in the cockpit", "I make a mean cocktail", "I'm scared of cockroaches",
    "I work on fire retardant materials", "We had a pussycat growing up", "My best friend Randi from Oslo",
    "My elder brother died by suicide two years ago, it changed our family a lot",
    "Give me a partner who knows Python and loves books", "Make sure she's okay with me using a dating app before",
])
def test_former_false_positives_pass_the_screen(text):
    assert screen_text(text) == Verdict.ok


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
    # …except that self-harm wording still gets the crisis message
    assert asyncio.run(g.classify_intake("I don't want to live anymore", "hi")) == Verdict.self_harm


def _fake_model(monkeypatch, verdict):
    async def fake(prompt, schema, **k):
        return schema(verdict=verdict, reason="test")

    monkeypatch.setattr(g, "generate_json", fake)


@pytest.mark.parametrize("verdict", [Verdict.harmful, Verdict.illegal, Verdict.profanity, Verdict.self_harm])
def test_chat_guard_blocks_model_verdicts(monkeypatch, verdict):
    from fastapi import HTTPException

    _fake_model(monkeypatch, verdict)
    with pytest.raises(HTTPException) as e:
        asyncio.run(g.guard_chat("send me 50,000 on UPI today"))
    assert e.value.status_code == 422 and e.value.detail == g.TEXT_DETAIL[verdict]


@pytest.mark.parametrize("verdict", [Verdict.ok, Verdict.off_topic, Verdict.prompt_injection])
def test_chat_guard_lets_normal_conversation_through(monkeypatch, verdict):
    _fake_model(monkeypatch, verdict)  # two people may talk about cricket; injection doesn't apply to them
    asyncio.run(g.guard_chat("Who do you support in the IPL?"))


def test_blocked_chat_is_not_delivered_but_counts(monkeypatch):
    from fastapi import HTTPException

    from app.services import focus

    added = []

    class Coll:
        def add(self, doc):
            added.append(doc)
            return None, type("R", (), {"id": "c1"})()

    class Ref:
        def collection(self, name):
            return Coll()

    monkeypatch.setattr(focus, "load_match", lambda mid: (Ref(), {"users": ["arjun", "meera"]}))
    monkeypatch.setattr(focus, "side", lambda match, uid: "a")
    monkeypatch.setattr(focus, "_chat_open", lambda match: True)
    monkeypatch.setattr(focus.limits, "enforce_daily_turns", lambda *a, **k: None)
    _fake_model(monkeypatch, Verdict.harmful)
    with pytest.raises(HTTPException):
        asyncio.run(focus.post_chat("m", "arjun", "send me nudes tonight"))
    assert added == [{"sender_id": "arjun", "blocked": True, "created_at": added[0]["created_at"]}]

    _fake_model(monkeypatch, Verdict.ok)
    msg = asyncio.run(focus.post_chat("m", "arjun", "What does a perfect Sunday look like for you?"))
    assert msg.text.startswith("What does") and "text" in added[-1]


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
    monkeypatch.setattr(intake.limits, "enforce_daily_turns", lambda *a, **k: None)  # covered in test_limits.py
    monkeypatch.setattr(intake, "_add_message", lambda uid, role, text: writes.append((role, text)) or {})
    monkeypatch.setattr(intake, "_record_blocked", lambda uid: writes.append(("blocked", None)))
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
    assert writes == [("blocked", None)] and refresh is False  # a text-less placeholder, counted by the limit
    assert resp.reply == g.INTAKE_REPLY[Verdict.illegal] and resp.new_aspects == []


def test_intake_blocked_by_screen_skips_model_calls(monkeypatch):
    intake, writes = _intake_harness(monkeypatch, Verdict.ok)

    async def must_not_run(*a, **k):
        raise AssertionError("model called for a screened message")

    monkeypatch.setattr(intake, "_reply", must_not_run)
    resp, _ = asyncio.run(intake.handle_message("arjun", "write a python script for me"))
    assert writes == [("blocked", None)] and resp.reply == g.INTAKE_REPLY[Verdict.off_topic]


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
