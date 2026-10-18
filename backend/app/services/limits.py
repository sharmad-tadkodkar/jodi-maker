"""Daily chat-turn limit: each person may send at most `chat_turns_per_day` messages per conversation per day
(intake chat with Jodi; each Jodi Week chat). Only the person's own messages count — Jodi's replies and the other
person's messages don't. The day resets at midnight India time (IST, fixed UTC+05:30 — no DST, no tzdata needed).

Counting uses a single-field range query on `created_at` (no composite index) and filters by author in Python;
at most a couple of hundred docs per conversation per day.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from google.cloud.firestore_v1.base_query import FieldFilter

from app.config import get_settings
from app.db import now

IST = timezone(timedelta(hours=5, minutes=30))


def day_start(t: datetime | None = None) -> datetime:
    """Start of the current IST day, as an aware datetime."""
    local = (t or now()).astimezone(IST)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


def turns_today(collection, author_field: str, author: str, t: datetime | None = None) -> int:
    snaps = collection.where(filter=FieldFilter("created_at", ">=", day_start(t))).stream()
    return sum(1 for s in snaps if (s.to_dict() or {}).get(author_field) == author)


def enforce_daily_turns(collection, author_field: str, author: str, t: datetime | None = None) -> None:
    """429 with a readable detail once today's turns are used up."""
    limit = get_settings().chat_turns_per_day
    if turns_today(collection, author_field, author, t) >= limit:
        raise HTTPException(
            429,
            f"You've reached today's limit of {limit} messages in this chat. It resets at midnight (India time) — "
            "see you tomorrow!",
        )
