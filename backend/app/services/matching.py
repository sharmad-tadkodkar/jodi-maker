"""Scouting & ranking (spec §4.2): hard filter → semantic top-N → Gemini scoring → priority queue.

Scores are stored per viewer as raw dimension scores; `overall` is computed at read time from the
viewer's *current* preference weights, so the learning loop re-ranks the queue instantly.
"""
import asyncio
import logging

import numpy as np
from pydantic import BaseModel

from app import models as m
from app.config import get_settings
from app.db import MATCHES, USERS, get_db, now
from app.jobs import ProgressFn
from app.llm.gemini import generate_json, load_prompt
from app.services.users import candidate_summary, list_aspects

log = logging.getLogger(__name__)
SCORING_CONCURRENCY = 4  # don't burst Vertex shared capacity
EDU_RANK = {"bachelors": 1, "masters": 2, "doctorate": 3}
UNAVAILABLE = {"in_focus", "locked", "paused"}


def match_id(a: str, b: str) -> str:
    x, y = sorted([a, b])
    return f"m_{x}__{y}"


# ---------- Hard filter (deterministic, no LLM) ----------

def _diet_ok(required: str | None, diet: str | None) -> bool:
    if not required or required in ("any", "non_veg"):
        return True
    allowed = {"veg": {"veg", "vegan"}, "vegan": {"vegan"}, "eggetarian": {"veg", "vegan", "eggetarian"}}
    return diet in allowed.get(required, {required})


def fits_criteria(criteria: dict, other: dict) -> tuple[bool, str]:
    """Does `other` satisfy `criteria`? Returns (ok, reason-if-not)."""
    f = other.get("self_facts") or {}
    c = criteria or {}
    age = f.get("age")
    if age is not None and not (c.get("age_min", 0) <= age <= c.get("age_max", 200)):
        return False, f"age {age} outside {c.get('age_min')}-{c.get('age_max')}"
    cities = c.get("cities") or []
    other_relocates = (other.get("hard_criteria") or {}).get("open_to_relocate", False)
    if cities and f.get("city") not in cities and not other_relocates:
        return False, f"lives in {f.get('city')}, not open to relocate"
    marital = c.get("marital_status") or []
    if marital and f.get("marital_status") and f["marital_status"] not in marital:
        return False, f"marital status {f['marital_status']}"
    if not _diet_ok(c.get("diet"), f.get("diet")):
        return False, f"diet {f.get('diet')} (requires {c.get('diet')})"
    edu_min = EDU_RANK.get(c.get("education_min") or "", 0)
    if edu_min and EDU_RANK.get(f.get("education") or "", edu_min) < edu_min:
        return False, f"education {f.get('education')}"
    langs = set(c.get("languages") or [])
    if langs and f.get("languages") and not langs & set(f["languages"]):
        return False, "no common language"
    if c.get("community_pref") and f.get("community") != c["community_pref"]:
        return False, "community filter"  # user-set only; never inferred
    return True, ""


def hard_filter(me: dict, cand: dict) -> tuple[bool, str]:
    """Bidirectional: candidate fits my criteria AND I fit theirs."""
    if cand["id"] == me["id"] or cand.get("role", "candidate") != "candidate":
        return False, "self/parent"
    if cand.get("gender") != me.get("seeking_gender") or me.get("gender") != cand.get("seeking_gender"):
        return False, "gender"
    if cand.get("status") in UNAVAILABLE or cand.get("status") == "onboarding":
        return False, f"unavailable ({cand.get('status')})"
    if not cand.get("embedding"):
        return False, "no profile yet"
    ok, why = fits_criteria(me.get("hard_criteria") or {}, cand)
    if not ok:
        return False, f"my filter: {why}"
    ok, why = fits_criteria(cand.get("hard_criteria") or {}, me)
    if not ok:
        return False, f"their filter: {why}"
    return True, ""


# ---------- Gemini scoring ----------

class DimScore(BaseModel):
    score: int
    reason: str


class CompatibilityOut(BaseModel):
    values: DimScore
    family_fit: DimScore
    lifestyle: DimScore
    career: DimScore
    location: DimScore
    communication: DimScore
    dealbreaker_conflict: bool
    dealbreaker_reason: str


def profile_for_prompt(user: dict, aspects: list[dict], *, include_private: bool) -> str:
    f = user.get("self_facts") or {}
    head = (f"{user['name'].split()[0]}, {f.get('age')}, {f.get('profession')} in {f.get('city')}. "
            f"Education: {f.get('education')}. Diet: {f.get('diet')}. "
            f"Open to relocate: {(user.get('hard_criteria') or {}).get('open_to_relocate')}.")
    lines = [head]
    for a in aspects:
        if a.get("visibility") == "private" and not include_private:
            continue
        tag = "" if a.get("visibility") == "public" else f" [{a.get('visibility')}]"
        lines.append(f"- ({a['category']}){tag} {a['statement']}")
    return "\n".join(lines)


async def score_pair(me: dict, my_aspects: list[dict], cand: dict, cand_aspects: list[dict]) -> CompatibilityOut:
    prompt = (
        f"SEEKER:\n{profile_for_prompt(me, my_aspects, include_private=True)}\n\n"
        f"CANDIDATE:\n{profile_for_prompt(cand, cand_aspects, include_private=False)}"
    )
    return await generate_json(prompt, CompatibilityOut, system=load_prompt("compatibility"),
                               tier="reason", temperature=0.3)


def overall(dims: dict, weights: dict) -> float:
    w = {d: float((weights or {}).get(d, 1 / 6)) for d in m.DIMENSIONS}
    total = sum(w.values()) or 1
    return round(sum(w[d] * float(dims.get(d, 0)) for d in m.DIMENSIONS) / total, 1)


def scores_for(viewer: dict, stored: dict) -> m.Scores:
    dims = {d: stored.get(d, 0) for d in m.DIMENSIONS}
    return m.Scores(overall=overall(dims, viewer.get("preference_weights")), **dims,
                    reasons=stored.get("reasons", {}))


# ---------- Scout ----------

def _cosine(a: list[float], b: list[float]) -> float:
    va, vb = np.asarray(a), np.asarray(b)
    return float(va @ vb / (np.linalg.norm(va) * np.linalg.norm(vb) + 1e-9))


def _matches_for(user_id: str) -> list[dict]:
    snaps = get_db().collection(MATCHES).where("users", "array_contains", user_id).stream()
    return [{"id": s.id, **s.to_dict()} for s in snaps]


async def scout(user_id: str, progress: ProgressFn = lambda _: None) -> dict:
    db = get_db()
    users = {s.id: {"id": s.id, **s.to_dict()} for s in db.collection(USERS).stream()}
    me = users.get(user_id)
    if not me:
        raise ValueError(f"user {user_id} not found")
    if me.get("status") in UNAVAILABLE:
        return {"paused": True, "message": "You're in a Focus Week — scouting is paused."}
    query_vec = me.get("embedding_self") or me.get("embedding")
    if not query_vec:
        raise ValueError("Finish onboarding first — your matchmaker doesn't know you yet.")

    existing = {mt["id"]: mt for mt in _matches_for(user_id)}
    closed_with = {u for mt in existing.values() if mt.get("status") == "closed" for u in mt["users"]}

    progress(f"Checking {len(users) - 1} profiles against both sides' must-haves…")
    passed, filtered = [], []
    for cand in users.values():
        if cand["id"] == user_id:
            continue
        ok, why = hard_filter(me, cand)
        if ok and cand["id"] in closed_with:
            ok, why = False, "already closed"
        (passed if ok else filtered).append((cand, why))

    ranked = sorted(passed, key=lambda cw: _cosine(query_vec, cw[0]["embedding"]), reverse=True)
    top = [c for c, _ in ranked[: get_settings().semantic_top_n]]

    # Score only pairs we haven't scored from this user's side before (cache).
    to_score = [c for c in top if user_id not in (existing.get(match_id(user_id, c["id"]), {}).get("scores_by_user") or {})]
    if to_score:
        progress(f"{len(passed)} passed the filters. Your matchmaker is reading {len(to_score)} profiles closely…")
    else:
        progress(f"{len(passed)} passed the filters — all already assessed. Refreshing your queue…")

    my_aspects = list_aspects(user_id)
    sem = asyncio.Semaphore(SCORING_CONCURRENCY)
    done = 0

    async def run(cand: dict):
        nonlocal done
        async with sem:
            try:
                out = await score_pair(me, my_aspects, cand, list_aspects(cand["id"]))
            except Exception as e:  # noqa: BLE001 — one bad call shouldn't sink the scout
                log.warning("scoring %s failed: %s", cand["id"], e)
                out = None
        done += 1
        progress(f"Scored {done}/{len(to_score)} candidates…")
        return cand, out

    results = await asyncio.gather(*[run(c) for c in to_score])

    t = now()
    excluded, added = [], 0
    for cand, out in results:
        if out is None:
            continue
        mid = match_id(user_id, cand["id"])
        stored = {d: getattr(out, d).score for d in m.DIMENSIONS}
        stored["reasons"] = {d: getattr(out, d).reason for d in m.DIMENSIONS}
        ref = db.collection(MATCHES).document(mid)
        if mid not in existing:
            ref.set({"user_a": user_id, "user_b": cand["id"], "users": [user_id, cand["id"]],
                     "status": "queued", "scores_by_user": {}, "created_at": t,
                     "decision_a": None, "decision_b": None, "extended": False})
            added += 1
        update = {f"scores_by_user.{user_id}": stored, "updated_at": t}
        if out.dealbreaker_conflict:
            update.update(status="closed", closed_reason=f"dealbreaker:{out.dealbreaker_reason}")
            excluded.append({"name": candidate_summary(cand).display_name, "reason": out.dealbreaker_reason})
        ref.update(update)

    pipe = pipeline(user_id)
    return {
        "profiles_checked": len(users) - 1,
        "passed_filter": len(passed),
        "filtered_out": len(filtered),
        "scored": sum(1 for _, o in results if o is not None),
        "new_in_queue": added - len(excluded),
        "excluded_dealbreakers": excluded,
        "queue_size": pipe.count,
        "top": [i.candidate.display_name for i in pipe.items[:3]],
    }


# ---------- Pipeline ----------

def pipeline(user_id: str) -> m.PipelineResponse:
    db = get_db()
    me_snap = db.collection(USERS).document(user_id).get()
    if not me_snap.exists:
        raise ValueError(f"user {user_id} not found")
    me = me_snap.to_dict()
    items = []
    for mt in _matches_for(user_id):
        stored = (mt.get("scores_by_user") or {}).get(user_id)
        if not stored or mt.get("status") == "closed":
            continue
        other_id = mt["user_b"] if mt["user_a"] == user_id else mt["user_a"]
        other = db.collection(USERS).document(other_id).get()
        if not other.exists:
            continue
        items.append(m.PipelineItem(match_id=mt["id"], candidate=candidate_summary(other.to_dict(), other_id),
                                    scores=scores_for(me, stored), status=mt["status"]))
    items.sort(key=lambda i: i.scores.overall, reverse=True)
    return m.PipelineResponse(count=len(items), paused=me.get("status") in UNAVAILABLE, items=items)
