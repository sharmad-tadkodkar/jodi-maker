"""Offline: a caste / community / skin-colour reason teaches the learning loop nothing. Run: uv run pytest -q tests_unit"""
import asyncio

import pytest

from app.services import learning


class _Doc:
    def __init__(self, sink):
        self.sink = sink

    def collection(self, *_):
        return self

    def document(self, *_):
        return self

    def set(self, data):
        self.sink.append(data)


@pytest.mark.parametrize("reason", ["other: she's not from our caste", "other: she's too dark for my family",
                                    "other: different community", "other: not the same gotra"])
def test_sensitive_reason_learns_nothing(monkeypatch, reason):
    logged = []
    monkeypatch.setattr(learning, "get_db", lambda: _Doc(logged))
    monkeypatch.setattr(learning, "get_user_doc", lambda uid: {"id": uid, "name": "Arjun", "preference_weights": {}})

    async def must_not_run(*a, **k):
        raise AssertionError("model called for a caste/colour reason")

    monkeypatch.setattr(learning, "generate_json", must_not_run)
    r = asyncio.run(learning.learn("arjun", "m_arjun__meera", "pass", reason))
    assert r.new_aspects == [] and r.moved_up == 0 and r.new_weights == r.old_weights
    assert r.explanation == learning.NOT_LEARNED and logged[0]["ignored"] == "sensitive"


@pytest.mark.parametrize("text", ["she volunteers in her community", "dark humour", "fair and honest",
                                  "her skin care routine", "values: we want different things"])
def test_ordinary_reasons_are_not_sensitive(text):
    assert not learning.is_sensitive(text)
