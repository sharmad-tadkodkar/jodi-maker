"""Onboarding & profile (spec §7)."""
from fastapi import APIRouter, BackgroundTasks, HTTPException

from app import models as m
from app.db import USERS, delete_tree, get_db, now
from app.services import intake, users
from app.services.embeddings import refresh_user_embeddings

router = APIRouter(tags=["profile"])


def _user_ref(user_id: str):
    return get_db().collection(USERS).document(user_id)


def _aspect_ref(user_id: str, aspect_id: str):
    ref = _user_ref(user_id).collection("aspects").document(aspect_id)
    if not ref.get().exists:
        raise HTTPException(404, "aspect not found")
    return ref


@router.post("/users", response_model=m.User)
async def create_user(body: m.CreateUserRequest):
    return users.create_user(body)


@router.get("/users/{user_id}", response_model=m.User)
async def get_user(user_id: str):
    return users.get_user_doc(user_id)


@router.get("/users/{user_id}/aspects", response_model=list[m.Aspect])
async def list_aspects(user_id: str):
    users.get_user_doc(user_id)
    order = {c: i for i, c in enumerate(m.ASPECT_CATEGORIES)}
    return sorted(users.list_aspects(user_id), key=lambda a: (order.get(a["category"], 99), str(a.get("created_at"))))


@router.patch("/users/{user_id}/aspects/{aspect_id}", response_model=m.Aspect)
async def patch_aspect(user_id: str, aspect_id: str, body: m.AspectPatch, bg: BackgroundTasks):
    ref = _aspect_ref(user_id, aspect_id)
    patch = body.model_dump(exclude_none=True)
    if patch:
        ref.update(patch)
        bg.add_task(refresh_user_embeddings, user_id)
    return {"id": aspect_id, **ref.get().to_dict()}


@router.delete("/users/{user_id}/aspects/{aspect_id}", response_model=m.OkResponse)
async def delete_aspect(user_id: str, aspect_id: str, bg: BackgroundTasks):
    _aspect_ref(user_id, aspect_id).delete()
    bg.add_task(refresh_user_embeddings, user_id)
    return m.OkResponse()


@router.patch("/users/{user_id}/hard-criteria", response_model=m.User)
async def patch_hard_criteria(user_id: str, body: m.HardCriteriaPatch):
    users.get_user_doc(user_id)
    patch = {f"hard_criteria.{k}": v for k, v in body.model_dump(exclude_unset=True).items()}
    if patch:
        _user_ref(user_id).update(patch)
    return users.get_user_doc(user_id)


@router.delete("/users/{user_id}/data", response_model=m.OkResponse)
async def wipe_data(user_id: str):
    """'Delete everything my matchmaker knows' — aspects, intake chat, embeddings."""
    users.get_user_doc(user_id)
    ref = _user_ref(user_id)
    for sub in ("aspects", "intake_messages"):
        delete_tree(ref.collection(sub))
    ref.update({"embedding": None, "embedding_self": None, "intake_completeness": 0.0,
                "last_active_at": now()})
    return m.OkResponse(detail="Aspects, intake conversation and embeddings deleted")


@router.get("/users/{user_id}/learning", response_model=list[m.LearningEntry])
async def learning_history(user_id: str):
    snaps = _user_ref(user_id).collection("learning_log").order_by("created_at").stream()
    return [{"id": s.id, **s.to_dict()} for s in snaps]


# ---- Intake ----

@router.get("/intake/{user_id}/messages", response_model=list[m.IntakeMessage])
async def intake_history(user_id: str):
    """Not in original §7 — lets the chat resume after a refresh. Creates the opening message for a
    brand-new user."""
    return intake.ensure_opening(users.get_user_doc(user_id))


@router.post("/intake/{user_id}/message", response_model=m.IntakeMessageResponse)
async def intake_message(user_id: str, body: m.IntakeMessageRequest, bg: BackgroundTasks):
    if not body.text.strip():
        raise HTTPException(422, "empty message")
    resp, changed = await intake.handle_message(user_id, body.text.strip())
    if changed:
        bg.add_task(refresh_user_embeddings, user_id)
    return resp
