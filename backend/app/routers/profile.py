"""Onboarding & profile (spec §7). STUB — real logic lands in Phase 1 (users) and Phase 2 (intake, /me)."""
from fastapi import APIRouter

from app import mocks
from app import models as m

router = APIRouter(tags=["profile"])


@router.post("/users", response_model=m.User)
async def create_user(body: m.CreateUserRequest):
    u = mocks.user()
    return u.model_copy(update={"id": "new_user", "name": body.name, "gender": body.gender,
                                "seeking_gender": "female" if body.gender == "male" else "male",
                                "role": body.role, "status": "onboarding",
                                "intake_completeness": 0.0, "is_seed": False})


@router.get("/users/{user_id}", response_model=m.User)
async def get_user(user_id: str):
    return mocks.user(user_id)


@router.get("/users/{user_id}/aspects", response_model=list[m.Aspect])
async def list_aspects(user_id: str):
    return mocks.aspects()


@router.patch("/users/{user_id}/aspects/{aspect_id}", response_model=m.Aspect)
async def patch_aspect(user_id: str, aspect_id: str, body: m.AspectPatch):
    a = next((a for a in mocks.aspects() if a.id == aspect_id), mocks.aspects()[0])
    return a.model_copy(update=body.model_dump(exclude_none=True))


@router.delete("/users/{user_id}/aspects/{aspect_id}", response_model=m.OkResponse)
async def delete_aspect(user_id: str, aspect_id: str):
    return m.OkResponse()


@router.patch("/users/{user_id}/hard-criteria", response_model=m.User)
async def patch_hard_criteria(user_id: str, body: m.HardCriteriaPatch):
    u = mocks.user(user_id)
    hc = u.hard_criteria.model_copy(update=body.model_dump(exclude_none=True))
    return u.model_copy(update={"hard_criteria": hc})


@router.delete("/users/{user_id}/data", response_model=m.OkResponse)
async def wipe_data(user_id: str):
    return m.OkResponse(detail="Aspects and embeddings deleted")


@router.get("/users/{user_id}/learning", response_model=list[m.LearningEntry])
async def learning_history(user_id: str):
    return mocks.learning_log()


# ---- Intake ----

@router.get("/intake/{user_id}/messages", response_model=list[m.IntakeMessage])
async def intake_history(user_id: str):
    """Not in original §7 — needed so the chat can resume after a refresh. Returns the opening
    agent message for a brand-new user."""
    return mocks.intake_messages()


@router.post("/intake/{user_id}/message", response_model=m.IntakeMessageResponse)
async def intake_message(user_id: str, body: m.IntakeMessageRequest):
    return mocks.intake_reply()
