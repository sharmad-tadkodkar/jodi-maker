"""Firestore access. All collection names live here (spec §6)."""
from datetime import datetime, timezone
from functools import lru_cache

from google.cloud import firestore

from app.config import get_settings

USERS = "users"
MATCHES = "matches"
JOBS = "jobs"


@lru_cache
def get_db() -> firestore.Client:
    return firestore.Client(project=get_settings().gcp_project)


def now() -> datetime:
    return datetime.now(timezone.utc)


def doc_to_dict(snap) -> dict | None:
    if not snap.exists:
        return None
    return {"id": snap.id, **snap.to_dict()}
