"""Scouting, interview, brief, decisions (spec §7). STUB — real logic lands in Phase 3 (scout,
pipeline), Phase 4 (interview, brief) and Phase 5 (decision)."""
from fastapi import APIRouter

from app import mocks
from app import models as m
from app.db import JOBS, get_db, now
from app.jobs import create_job

router = APIRouter(tags=["matching"])


def _done_job(kind: str, result: dict) -> m.JobRef:
    """Stub helper: write an already-finished job so the frontend's polling path is exercised."""
    job_id = create_job(kind)
    get_db().collection(JOBS).document(job_id).update(
        {"status": "done", "result": result, "progress": "done", "updated_at": now()})
    return m.JobRef(job_id=job_id)


@router.post("/scout/{user_id}", response_model=m.JobRef)
async def run_scout(user_id: str):
    return _done_job("scout", {"candidates": 4, "new": 1})


@router.get("/pipeline/{user_id}", response_model=m.PipelineResponse)
async def pipeline(user_id: str):
    return mocks.pipeline()


@router.post("/matches/{match_id}/interview", response_model=m.JobRef)
async def run_interview(match_id: str, body: m.InterviewRequest | None = None):
    return _done_job("interview", {"match_id": match_id, "status": "done"})


@router.get("/matches/{match_id}/interview", response_model=m.InterviewResponse)
async def get_interview(match_id: str):
    return mocks.interview()


@router.get("/matches/{match_id}/brief/{user_id}", response_model=m.Brief)
async def get_brief(match_id: str, user_id: str):
    return mocks.brief(user_id)


@router.get("/briefs/next/{user_id}", response_model=m.Brief | None)
async def next_brief(user_id: str):
    return mocks.brief(user_id)


@router.post("/matches/{match_id}/decision", response_model=m.DecisionResponse)
async def decide(match_id: str, body: m.DecisionRequest):
    if body.decision == "pass":
        return m.DecisionResponse(match=mocks.match("closed"), mutual=False,
                                  learning=mocks.learning_result())
    return m.DecisionResponse(match=mocks.match("awaiting_them"), mutual=False)
