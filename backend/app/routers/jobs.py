from fastapi import APIRouter, HTTPException

from app import models as m
from app.db import JOBS, doc_to_dict, get_db

router = APIRouter(tags=["jobs"])


@router.get("/jobs/{job_id}", response_model=m.Job)
async def get_job(job_id: str):
    job = doc_to_dict(get_db().collection(JOBS).document(job_id).get())
    if not job:
        raise HTTPException(404, "job not found")
    return job
