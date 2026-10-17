"""User reads/writes shared by routers and services."""
import re
import uuid
from datetime import timedelta

from fastapi import HTTPException

from app import models as m
from app.db import USERS, get_db, now


def get_user_doc(user_id: str) -> dict:
    snap = get_db().collection(USERS).document(user_id).get()
    if not snap.exists:
        raise HTTPException(404, f"user {user_id} not found")
    return {"id": snap.id, **snap.to_dict()}


def list_aspects(user_id: str) -> list[dict]:
    snaps = get_db().collection(USERS).document(user_id).collection("aspects").stream()
    return [{"id": s.id, **s.to_dict()} for s in snaps]


def display_name(full_name: str) -> str:
    parts = full_name.split()
    return f"{parts[0]} {parts[-1][0]}." if len(parts) > 1 else parts[0]


def candidate_summary(user: dict, user_id: str | None = None) -> m.CandidateSummary:
    f = user.get("self_facts") or {}
    created = user.get("created_at")
    return m.CandidateSummary(
        user_id=user_id or user["id"], display_name=display_name(user["name"]), age=f.get("age"),
        city=f.get("city"), profession=f.get("profession"), verified=True,
        is_new=bool(created and now() - created < timedelta(days=3)),
    )


def create_user(body: m.CreateUserRequest) -> dict:
    slug = re.sub(r"[^a-z]", "", body.name.split()[0].lower()) or "user"
    user_id = f"u_{slug}_{uuid.uuid4().hex[:6]}"
    t = now()
    user = m.User(
        id=user_id, name=body.name, gender=body.gender,
        seeking_gender="female" if body.gender == "male" else "male", role=body.role,
        status="onboarding", is_seed=False, created_at=t, last_active_at=t,
    ).model_dump()
    get_db().collection(USERS).document(user_id).set(user)
    return user
