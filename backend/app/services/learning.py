"""Learning loop (spec §4.7): every Pass / Stop / Continue updates the user's preference weights and may add
learned aspects. Gemini proposes; we clamp (±0.1 per dimension) and normalise for stability. Because
`overall` is computed at read time from current weights, the queue re-ranks the moment weights change.
"""
import logging
import uuid

from pydantic import BaseModel

from app import models as m
from app.config import get_settings
from app.db import MATCHES, USERS, get_db, now
from app.llm.gemini import generate_json, load_prompt
from app.services.matching import pipeline, profile_for_prompt, scores_for
from app.services.users import get_user_doc, list_aspects

log = logging.getLogger(__name__)

# Pass/Stop reason chips (spec §4.4) → the dimension they point at. Used for the no-LLM fallback.
REASON_DIMENSION = {"values": "values", "family": "family_fit", "lifestyle": "lifestyle",
                    "location": "location", "career": "career", "communication": "communication"}
MIN_WEIGHT = 0.03


class WeightsOut(BaseModel):
    values: float
    family_fit: float
    lifestyle: float
    career: float
    location: float
    communication: float


class LearnedAspect(BaseModel):
    category: str
    statement: str
    evidence: str


class LearningOut(BaseModel):
    new_weights: WeightsOut
    new_aspects: list[LearnedAspect]
    explanation: str


def clamp_weights(old: dict, proposed: dict, clamp: float) -> dict:
    """Limit each dimension's move to ±clamp, floor at MIN_WEIGHT, renormalise to sum 1."""
    w = {}
    for d in m.DIMENSIONS:
        o, p = float(old.get(d, 1 / 6)), float(proposed.get(d, old.get(d, 1 / 6)))
        w[d] = max(MIN_WEIGHT, min(o + clamp, max(o - clamp, p)))
    total = sum(w.values())
    return {d: round(v / total, 3) for d, v in w.items()}


def _fallback(old: dict, decision: str, reason: str | None, scores: m.Scores) -> LearningOut:
    """No-LLM path so a decision never fails on a Gemini hiccup."""
    w = dict(old)
    dim = REASON_DIMENSION.get((reason or "").split(":")[0].strip().lower())
    if decision == "continue":
        dim = max(m.DIMENSIONS, key=lambda d: getattr(scores, d))
    if dim:
        w[dim] = w.get(dim, 1 / 6) + 0.06
        nice = dim.replace("_fit", "").replace("_", " ")
        text = (f"I've noted how much {nice} mattered here." if decision == "continue"
                else f"{nice.capitalize()} matters more to you than I'd weighted — I'll look harder at it.")
    else:
        text = "Noted — I'll keep that in mind for the next one."
    return LearningOut(new_weights=WeightsOut(**w), new_aspects=[], explanation=text)


def _ranks(user_id: str) -> dict[str, int]:
    return {i.match_id: n for n, i in enumerate(pipeline(user_id).items)}


async def learn(user_id: str, match_id: str, decision: str, reason: str | None) -> m.LearningResult:
    """Run the learning loop for one user's decision and persist it. Call AFTER the match status change,
    so the decided match is already out of the queue when we measure re-ranking."""
    db = get_db()
    user = get_user_doc(user_id)
    match = db.collection(MATCHES).document(match_id).get().to_dict()
    other_id = match["user_b"] if match["user_a"] == user_id else match["user_a"]
    other_name = get_user_doc(other_id)["name"].split()[0]
    old = {d: float((user.get("preference_weights") or {}).get(d, 1 / 6)) for d in m.DIMENSIONS}
    scores = scores_for(user, (match.get("scores_by_user") or {}).get(user_id, {}))

    brief = db.collection(MATCHES).document(match_id).collection("briefs").document(user_id).get()
    b = brief.to_dict() if brief.exists else {}
    name = user["name"].split()[0]
    prompt = (
        f"CURRENT WEIGHTS: {old}\n\n"
        f"{name.upper()}'S PROFILE:\n{profile_for_prompt(user, list_aspects(user_id), include_private=True)}\n\n"
        f"THE CANDIDATE: {other_name}\n"
        f"Brief snapshot: {b.get('snapshot', '(no brief)')}\n"
        f"Worth exploring: {[f.get('text') for f in b.get('explore', [])]}\n"
        f"Scores you gave (0-100): " + ", ".join(f"{d} {getattr(scores, d)} ({scores.reasons.get(d, '')})" for d in m.DIMENSIONS) + "\n\n"
        f"DECISION: {decision}\nREASON: {reason or '(none given)'}"
    )
    try:
        out = await generate_json(prompt, LearningOut, system=load_prompt("learning").format(name=name),
                                  tier="fast", temperature=0.3)
    except Exception as e:  # noqa: BLE001
        log.warning("learning loop LLM failed, using fallback: %s", e)
        out = _fallback(old, decision, reason, scores)

    ranks_before = _ranks(user_id)
    new = clamp_weights(old, out.new_weights.model_dump(), get_settings().learning_clamp)
    uref = db.collection(USERS).document(user_id)
    uref.update({"preference_weights": new, "last_active_at": now()})

    t = now()
    learned = []
    for a in out.new_aspects[:2]:
        if a.category not in m.ASPECT_CATEGORIES:
            continue
        aid = f"l_{uuid.uuid4().hex[:8]}"
        doc = {"category": a.category, "statement": a.statement, "evidence": a.evidence, "source": "learned",
               "confidence": 0.6, "visibility": "agent_only", "created_at": t}
        uref.collection("aspects").document(aid).set(doc)
        learned.append(m.Aspect(id=aid, **doc))

    ranks_after = _ranks(user_id)
    moved_up = sum(1 for mid, r in ranks_after.items() if mid in ranks_before and r < ranks_before[mid])
    explanation = out.explanation.strip()
    if moved_up:
        explanation += f" I've moved {moved_up} candidate{'s' if moved_up > 1 else ''} up."

    uref.collection("learning_log").document().set({
        "match_id": match_id, "decision": decision, "reason": reason, "old_weights": old, "new_weights": new,
        "explanation": explanation, "new_aspect_ids": [a.id for a in learned], "created_at": t,
    })
    return m.LearningResult(old_weights=old, new_weights=new, explanation=explanation,
                            new_aspects=learned, moved_up=moved_up)
