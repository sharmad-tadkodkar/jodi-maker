"""Offline tests: confirm the match any day; extend only on the last day. Run: uv run pytest -q tests_unit"""
import asyncio
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app import models as m
from app.services import focus


class FakeRef:
    def __init__(self, doc):
        self.doc = doc

    def update(self, data):
        self.doc.update(data)

    def get(self):
        return type("S", (), {"to_dict": lambda _s: dict(self.doc)})()


@pytest.fixture
def world(monkeypatch):
    doc = {"users": ["arjun", "meera"], "user_a": "arjun", "user_b": "meera", "status": "focus_week",
           "focus_start": datetime(2026, 10, 16, tzinfo=timezone.utc), "focus_end": datetime(2026, 10, 23, tzinfo=timezone.utc)}
    ref = FakeRef(doc)
    state = {"day": 2, "locked_users": None}
    monkeypatch.setattr(focus, "expire_stale", lambda uid: None)
    monkeypatch.setattr(focus, "load_match", lambda mid: (ref, dict(ref.doc)))
    monkeypatch.setattr(focus, "current_day", lambda match: state["day"])
    monkeypatch.setattr(focus, "_set_users", lambda users, status, mid: state.update(locked_users=(users, status)))
    monkeypatch.setattr(focus, "_close_focus", lambda r, match, reason: r.update({"status": "closed", "closed_reason": reason}))
    monkeypatch.setattr(focus, "match_model", lambda mid, d, uid: m.Match.model_construct(id=mid, status=d["status"]))

    async def learn(*a, **k):
        return None

    monkeypatch.setattr(focus.learning, "learn", learn)
    return doc, state


def decide(user, decision, reason=None):
    return asyncio.run(focus.focus_decide("m_arjun__meera", user, decision, reason))


def test_confirm_on_day_two_waits_for_the_other(world):
    doc, _ = world
    r = decide("arjun", "continue")
    assert r.outcome == "pending" and doc["focus_decision_a"] == "continue" and doc["status"] == "focus_week"


def test_both_confirm_early_locks_the_match(world):
    doc, state = world
    decide("arjun", "continue")
    r = decide("meera", "continue")
    assert r.outcome == "locked" and doc["status"] == "locked" and state["locked_users"][1] == "locked"


def test_extend_before_the_last_day_is_refused(world):
    with pytest.raises(HTTPException) as e:
        decide("arjun", "extend")
    assert e.value.status_code == 409 and "any day" in e.value.detail


def test_extend_on_the_last_day_still_works(world):
    doc, state = world
    state["day"] = 7
    decide("arjun", "extend")
    r = decide("meera", "continue")
    assert r.outcome == "extended" and doc["extended"] is True


def test_end_conversation_any_day(world):
    doc, _ = world
    r = decide("meera", "stop", "other: we want different things")
    assert r.outcome == "closed" and doc["status"] == "closed"
