"""Firestore access. All collection names live here (spec §6)."""
from datetime import datetime, timezone
from functools import lru_cache

from google.cloud import firestore

from app.config import get_settings

_PREFIX = get_settings().collection_prefix
USERS = f"{_PREFIX}users"
MATCHES = f"{_PREFIX}matches"
JOBS = f"{_PREFIX}jobs"


@lru_cache
def get_db() -> firestore.Client:
    return firestore.Client(project=get_settings().gcp_project)


def now() -> datetime:
    return datetime.now(timezone.utc)


def delete_tree(ref, _depth: int = 0) -> int:
    """Delete a document or collection and everything beneath it, using plain batched writes.
    (Firestore's `recursive_delete` uses a BulkWriter thread pool that deadlocked under load.)
    Our schema nests one level deep (users/{id}/aspects/{id}, matches/{id}/chat/{id}), so documents
    inside subcollections are leaves — skipping their `collections()` lookup saves ~300 round trips."""
    docs = [ref] if isinstance(ref, firestore.DocumentReference) else list(ref.list_documents())
    batch, ops, total = get_db().batch(), 0, 0
    for doc in docs:
        if _depth == 0 or isinstance(ref, firestore.DocumentReference):
            for sub in doc.collections():
                total += delete_tree(sub, _depth + 1)
        batch.delete(doc)
        ops += 1
        if ops >= 400:
            batch.commit()
            batch, total, ops = get_db().batch(), total + ops, 0
    if ops:
        batch.commit()
    return total + ops


def doc_to_dict(snap) -> dict | None:
    if not snap.exists:
        return None
    return {"id": snap.id, **snap.to_dict()}
