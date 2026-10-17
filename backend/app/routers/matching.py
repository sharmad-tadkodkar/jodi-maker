"""Scouting, interview, brief, decisions (spec §7). Real: scout, pipeline (Phase 3), interview,
brief, next brief (Phase 4). STUB: decision (Phase 5)."""
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException

from app import mocks
from app import models as m
from app.db import JOBS, get_db, now
from app.jobs import create_job, run_job
from app.services import brief as brief_svc
from app.services import interview as interview_svc
from app.services import matching
from app.services.users import get_user_doc

router = APIRouter(tags=["matching"])


def _done_job(kind: str, result: dict) -> m.JobRef:
    """Stub helper: write an already-finished job so the frontend's polling path is exercised."""
    job_id = create_job(kind)
    get_db().collection(JOBS).document(job_id).update(
        {"status": "done", "result": result, "progress": "done", "updated_at": now()})
    return m.JobRef(job_id=job_id)


@router.post("/scout/{user_id}", response_model=m.JobRef)
async def run_scout(user_id: str, bg: BackgroundTasks):
    """Filter → semantic → Gemini scoring. Poll GET /jobs/{job_id}; `progress` is user-friendly text
    and `result` has the scout summary (passed_filter, excluded_dealbreakers, top, …)."""
    get_user_doc(user_id)
    job_id = create_job("scout", {"user_id": user_id})
    bg.add_task(run_job, job_id, lambda progress: matching.scout(user_id, progress))
    return m.JobRef(job_id=job_id)


@router.get("/pipeline/{user_id}", response_model=m.PipelineResponse)
async def pipeline(user_id: str):
    try:
        return matching.pipeline(user_id)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e


@router.post("/matches/{match_id}/interview", response_model=m.JobRef)
async def run_interview(match_id: str, bg: BackgroundTasks, body: m.InterviewRequest | None = None,
                        rerun: bool = False, x_user_id: str | None = Header(default=None)):
    """Run the 3-round matchmaker interview + briefs as a job. Poll GET /matches/{id}/interview every
    1–2 s to render turns live. If an interview already finished (e.g. the pre-computed Arjun–Meera one),
    returns a finished job instantly — pass `?rerun=true` to run it live again."""
    snap = get_db().collection("matches").document(match_id).get()
    if not snap.exists:
        raise HTTPException(404, "match not found")
    match = snap.to_dict()
    requester = x_user_id if x_user_id in match["users"] else match["user_a"]
    if match.get("interview_status") == "running":
        raise HTTPException(409, "interview already running")
    if match.get("interview_status") in ("done", "ended_dealbreaker") and not rerun:
        return _done_job("interview", {"match_id": match_id, "status": match["interview_status"], "cached": True})
    if match.get("status") == "closed" and not rerun:
        raise HTTPException(409, "match is closed")
    job_id = create_job("interview", {"match_id": match_id, "requested_by": requester})
    instructions = body.instructions if body else None
    bg.add_task(run_job, job_id, lambda progress: interview_svc.run_interview(match_id, requester, instructions, progress))
    return m.JobRef(job_id=job_id)


@router.get("/matches/{match_id}/interview", response_model=m.InterviewResponse)
async def get_interview(match_id: str):
    try:
        return interview_svc.get_interview(match_id)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e


@router.get("/matches/{match_id}/brief/{user_id}", response_model=m.Brief)
async def get_brief(match_id: str, user_id: str):
    b = brief_svc.build_brief(match_id, user_id)
    if not b:
        raise HTTPException(404, "No brief available for this user yet")
    return b


@router.get("/briefs/next/{user_id}", response_model=m.Brief | None)
async def next_brief(user_id: str):
    get_user_doc(user_id)
    return brief_svc.next_brief(user_id)


@router.post("/matches/{match_id}/decision", response_model=m.DecisionResponse)
async def decide(match_id: str, body: m.DecisionRequest):
    if body.decision == "pass":
        return m.DecisionResponse(match=mocks.match("closed"), mutual=False,
                                  learning=mocks.learning_result())
    return m.DecisionResponse(match=mocks.match("awaiting_them"), mutual=False)
