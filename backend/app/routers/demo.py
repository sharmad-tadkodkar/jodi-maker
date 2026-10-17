"""Demo controls (spec §4.9, §7). Only mounted when DEMO_MODE=true.
Real: personas, seed, reset, new-profile (Phase 1). STUB: simulate-response, fast-forward (Phase 5)."""
from fastapi import APIRouter, HTTPException

from app import mocks
from app import models as m
from app.db import USERS, get_db
from app.services import seed as seed_svc
from app.services.users import candidate_summary

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/personas", response_model=list[m.Persona])
async def personas():
    """Heroes first, then any users created through onboarding."""
    out = []
    db = get_db()
    for uid in seed_svc.HERO_IDS:
        u = db.collection(USERS).document(uid).get()
        if u.exists:
            d = u.to_dict()
            f = d.get("self_facts", {})
            out.append(m.Persona(user_id=uid, name=d["name"], role="candidate",
                                 tagline=f"{f.get('age')} · {f.get('profession')} · {f.get('city')}"))
    for snap in db.collection(USERS).where("is_seed", "==", False).stream():
        d = snap.to_dict()
        out.append(m.Persona(user_id=snap.id, name=d["name"], role=d.get("role", "candidate"),
                             tagline="New user · onboarding" if d.get("status") == "onboarding" else "New user"))
    return out


@router.post("/seed", response_model=m.OkResponse)
async def seed(body: m.SeedRequest):
    n = await seed_svc.seed_world(body.count)
    return m.OkResponse(detail=f"Seeded {n} profiles")


@router.post("/reset", response_model=m.OkResponse)
async def reset(body: m.SeedRequest | None = None):
    n = await seed_svc.reset_world((body or m.SeedRequest()).count)
    return m.OkResponse(detail=f"Reset: {n} profiles loaded")


@router.post("/simulate-response", response_model=m.DecisionResponse)
async def simulate_response(body: m.SimulateResponseRequest):
    mutual = body.decision == "interested"
    return m.DecisionResponse(match=mocks.match("focus_week" if mutual else "closed"), mutual=mutual)


@router.post("/fast-forward", response_model=m.FocusState)
async def fast_forward(body: m.FastForwardRequest):
    return mocks.focus_state().model_copy(update={"day": body.day})


@router.post("/new-profile", response_model=m.CandidateSummary)
async def new_profile():
    p = await seed_svc.add_reserve_profile()
    if not p:
        raise HTTPException(409, "No reserve profiles left — reset the demo to reuse them")
    snap = get_db().collection(USERS).document(p["id"]).get()
    return candidate_summary(snap.to_dict(), snap.id)
