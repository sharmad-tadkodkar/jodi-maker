"""Demo controls (spec §4.9, §7). Only mounted when DEMO_MODE=true.
Real: personas, seed, reset, new-profile (Phase 1); simulate-response, fast-forward (Phase 5)."""
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from google.cloud.firestore_v1.base_query import FieldFilter

from app import models as m
from app.db import MATCHES, USERS, get_db
from app.jobs import create_job, run_job
from app.services import brief as brief_svc
from app.services import focus as focus_svc
from app.services import interview as interview_svc
from app.services import matching
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
    for snap in db.collection(USERS).where(filter=FieldFilter("is_seed", "==", False)).stream():
        d = snap.to_dict()
        out.append(m.Persona(user_id=snap.id, name=d["name"], role=d.get("role", "candidate"),
                             tagline="New user · onboarding" if d.get("status") == "onboarding" else "New user"))
    return out


@router.post("/seed", response_model=m.OkResponse)
async def seed(body: m.SeedRequest):
    n = await seed_svc.seed_world(body.count)
    return m.OkResponse(detail=f"Seeded {n} profiles")


@router.post("/reset", response_model=m.OkResponse)
async def reset(body: m.SeedRequest | None = None, soft: bool = False):
    """Full reset (~15–20 s): wipe + reseed profiles + load pre-computed matches.
    `?soft=true` (~2 s): keep profiles, restore all matches and the heroes' starting state — use between takes."""
    if soft:
        n = seed_svc.soft_reset()
        return m.OkResponse(detail=f"Soft reset: {n} matches restored")
    n = await seed_svc.reset_world((body or m.SeedRequest()).count)
    return m.OkResponse(detail=f"Reset: {n} profiles loaded")


@router.post("/simulate-response", response_model=m.DecisionResponse)
async def simulate_response(body: m.SimulateResponseRequest, bg: BackgroundTasks):
    """Answer the brief as the *other* side (`user_id`), e.g. Meera says Interested → mutual → Focus Week.
    Needs the requester to have said Interested first. A simulated Pass uses reason "just not feeling it"
    and skips the learning loop (it's not the demo user's learning)."""
    res = await focus_svc.decide(body.match_id, body.user_id, body.decision,
                                 "just not feeling it" if body.decision == "pass" else None, run_learning=False)
    if res.mutual:
        bg.add_task(focus_svc.ensure_deck, body.match_id)
    return res


@router.post("/fast-forward", response_model=m.FocusState)
async def fast_forward(body: m.FastForwardRequest, x_user_id: str | None = Header(default=None)):
    """Jump an active Focus Week to `day` (e.g. 4 or 7). `day` = total_days + 1 demos the auto-close
    (nobody waits forever)."""
    focus_svc.fast_forward(body.match_id, body.day)
    _, match = focus_svc.load_match(body.match_id)
    viewer = x_user_id if x_user_id in match["users"] else match["user_a"]
    return await focus_svc.state(body.match_id, viewer)


@router.post("/interview-top/{user_id}", response_model=m.InterviewStarted)
async def interview_top(user_id: str, bg: BackgroundTasks):
    """"Run interview for top candidate now": starts a live interview (~2 min) with the highest-ranked candidate in
    `user_id`'s queue that hasn't been interviewed yet. Poll GET /matches/{match_id}/interview for the turns."""
    try:
        items = matching.pipeline(user_id).items
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    top = next((i for i in items if i.status == "queued"), None)
    if not top:
        raise HTTPException(409, "No un-interviewed candidates in the queue — run scout first")
    job_id = create_job("interview", {"match_id": top.match_id, "requested_by": user_id})
    bg.add_task(run_job, job_id, lambda progress: interview_svc.run_interview(top.match_id, user_id, None, progress))
    return m.InterviewStarted(match_id=top.match_id, job_id=job_id, candidate=top.candidate)


@router.get("/state", response_model=m.DemoState)
async def state():
    """Where the demo is right now: each hero's status, Focus Week day, queue size and next brief."""
    db = get_db()
    heroes = []
    for uid in seed_svc.HERO_IDS:
        snap = db.collection(USERS).document(uid).get()
        if not snap.exists:
            continue
        u = snap.to_dict()
        day = None
        if u.get("status") == "in_focus" and u.get("active_match_id"):
            mt = db.collection(MATCHES).document(u["active_match_id"]).get().to_dict() or {}
            day = focus_svc.current_day(mt)
        nb = brief_svc.next_brief(uid)
        heroes.append(m.HeroState(user_id=uid, name=u["name"], status=u.get("status", "active"),
                                  active_match_id=u.get("active_match_id"), focus_day=day,
                                  queue_size=matching.pipeline(uid).count,
                                  next_brief_match_id=nb.match_id if nb else None))
    hero = db.collection(MATCHES).document(matching.match_id(*seed_svc.HERO_IDS)).get()
    _, reserves = seed_svc._load_fixtures(0)
    return m.DemoState(
        heroes=heroes, hero_match_status=hero.to_dict().get("status") if hero.exists else None,
        profiles=db.collection(USERS).count().get()[0][0].value,
        reserves_left=sum(1 for p in reserves if not db.collection(USERS).document(p["id"]).get().exists),
    )


@router.post("/new-profile", response_model=m.CandidateSummary)
async def new_profile():
    """"Someone just joined": loads a held-back profile with a `new` badge (2 available per reset). Run scout for
    a hero afterwards to see them appear in the queue."""
    p = await seed_svc.add_reserve_profile()
    if not p:
        raise HTTPException(409, "No reserve profiles left — reset the demo to reuse them")
    snap = get_db().collection(USERS).document(p["id"]).get()
    return candidate_summary(snap.to_dict(), snap.id)
