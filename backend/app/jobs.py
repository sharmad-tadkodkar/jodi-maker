"""Long-running jobs (scout, interview). State is kept in Firestore so any instance can answer polls."""
import logging
import traceback
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from app.db import JOBS, get_db, now

log = logging.getLogger(__name__)

ProgressFn = Callable[[str], None]


def create_job(kind: str, meta: dict | None = None) -> str:
    job_id = uuid.uuid4().hex[:12]
    get_db().collection(JOBS).document(job_id).set(
        {"kind": kind, "status": "pending", "progress": None, "result": None,
         "error": None, "meta": meta or {}, "created_at": now()}
    )
    return job_id


def _update(job_id: str, **fields: Any) -> None:
    get_db().collection(JOBS).document(job_id).update({**fields, "updated_at": now()})


async def run_job(job_id: str, fn: Callable[[ProgressFn], Awaitable[Any]]) -> None:
    """Run `fn(progress)` and record status/result. Intended for FastAPI BackgroundTasks."""
    _update(job_id, status="running")
    try:
        result = await fn(lambda msg: _update(job_id, progress=msg))
        _update(job_id, status="done", result=result)
    except Exception as e:  # noqa: BLE001
        log.error("job %s failed: %s\n%s", job_id, e, traceback.format_exc())
        _update(job_id, status="error", error=str(e))
