"""Firestore access. All collection names live here (spec §6)."""
from concurrent.futures import ThreadPoolExecutor
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
    inside subcollections are leaves — skipping their `collections()` lookup saves ~300 round trips.
    At the top level, each document's subcollections are cleared in parallel (62 users ≈ 800 docs)."""
    docs = [ref] if isinstance(ref, firestore.DocumentReference) else list(ref.list_documents())
    total = 0
    if _depth == 0 or isinstance(ref, firestore.DocumentReference):
        def clear_subs(doc) -> int:
            return sum(delete_tree(sub, _depth + 1) for sub in doc.collections())
        with ThreadPoolExecutor(max_workers=16) as pool:
            total += sum(pool.map(clear_subs, docs))
    batch, ops = get_db().batch(), 0
    for doc in docs:
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
