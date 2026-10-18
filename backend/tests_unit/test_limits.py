"""Offline tests for the daily chat-turn limit. Run: uv run pytest -q tests_unit"""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.services import limits

UTC = timezone.utc


class _Snap:
    def __init__(self, d):
        self._d = d

    def to_dict(self):
        return self._d


class FakeCollection:
    """Mimics .where(filter=FieldFilter('created_at', '>=', t)).stream()."""

    def __init__(self, docs):
        self.docs = docs

    def where(self, *, filter):  # noqa: A002
        start = filter.value
        return type("Q", (), {"stream": lambda _self: [_Snap(d) for d in self.docs if d["created_at"] >= start]})()


def test_day_starts_at_ist_midnight():
    # 18:29 UTC = 23:59 IST (same IST day); 18:30 UTC = 00:00 IST next day
    assert limits.day_start(datetime(2026, 10, 18, 18, 29, tzinfo=UTC)).isoformat() == "2026-10-18T00:00:00+05:30"
    assert limits.day_start(datetime(2026, 10, 18, 18, 30, tzinfo=UTC)).isoformat() == "2026-10-19T00:00:00+05:30"


def _docs(n, author="arjun", field="sender_id", when=datetime(2026, 10, 18, 6, 0, tzinfo=UTC)):
    return [{field: author, "created_at": when + timedelta(minutes=i)} for i in range(n)]


NOW = datetime(2026, 10, 18, 12, 0, tzinfo=UTC)  # 17:30 IST


def test_counts_only_the_authors_messages_today():
    yesterday = datetime(2026, 10, 17, 10, 0, tzinfo=UTC)
    col = FakeCollection(_docs(10) + _docs(30, author="meera") + _docs(40, when=yesterday))
    assert limits.turns_today(col, "sender_id", "arjun", NOW) == 10


def test_49_used_allows_the_50th():
    limits.enforce_daily_turns(FakeCollection(_docs(49)), "sender_id", "arjun", NOW)


def test_50_used_blocks_the_51st_with_readable_429():
    with pytest.raises(HTTPException) as e:
        limits.enforce_daily_turns(FakeCollection(_docs(50)), "sender_id", "arjun", NOW)
    assert e.value.status_code == 429 and "50 messages" in e.value.detail and "midnight" in e.value.detail


def test_other_persons_messages_do_not_use_your_turns():
    limits.enforce_daily_turns(FakeCollection(_docs(80, author="meera")), "sender_id", "arjun", NOW)


def test_intake_over_limit_makes_no_model_calls(monkeypatch):
    from app.services import guardrails, intake

    monkeypatch.setattr(intake, "get_user_doc", lambda uid: {"id": uid, "name": "Arjun", "status": "active", "self_facts": {}})
    monkeypatch.setattr(intake, "ensure_opening", lambda u: [])
    monkeypatch.setattr(intake, "list_aspects", lambda uid: [])
    today = datetime.now(UTC)
    monkeypatch.setattr(intake, "_messages_ref", lambda uid: FakeCollection(_docs(50, field="role", author="user", when=today - timedelta(seconds=60))))

    async def must_not_run(*a, **k):
        raise AssertionError("model called past the daily limit")

    monkeypatch.setattr(guardrails, "classify_intake", must_not_run)
    monkeypatch.setattr(intake, "_reply", must_not_run)
    with pytest.raises(HTTPException) as e:
        asyncio.run(intake.handle_message("arjun", "one more thing about me"))
    assert e.value.status_code == 429
