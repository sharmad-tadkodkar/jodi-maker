"""Demo controls (spec §4.9, §7). Only mounted when DEMO_MODE=true. STUB — real logic in Phase 1/5/6."""
from fastapi import APIRouter

from app import mocks
from app import models as m

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/personas", response_model=list[m.Persona])
async def personas():
    return mocks.personas()


@router.post("/seed", response_model=m.OkResponse)
async def seed(body: m.SeedRequest):
    return m.OkResponse(detail=f"Seeded {body.count} profiles (stub)")


@router.post("/reset", response_model=m.OkResponse)
async def reset():
    return m.OkResponse(detail="Demo reset (stub)")


@router.post("/simulate-response", response_model=m.DecisionResponse)
async def simulate_response(body: m.SimulateResponseRequest):
    mutual = body.decision == "interested"
    return m.DecisionResponse(match=mocks.match("focus_week" if mutual else "closed"), mutual=mutual)


@router.post("/fast-forward", response_model=m.FocusState)
async def fast_forward(body: m.FastForwardRequest):
    return mocks.focus_state().model_copy(update={"day": body.day})


@router.post("/new-profile", response_model=m.CandidateSummary)
async def new_profile():
    return m.CandidateSummary(user_id="new1", display_name="Kavya I.", age=26, city="Bangalore",
                              profession="UX Researcher", is_new=True)
