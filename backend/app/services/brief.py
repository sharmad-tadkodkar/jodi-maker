"""Match Brief (spec §4.4) — perspective-specific: each side gets their own brief about the other.

Narrative parts come from Gemini (smart tier); the "why you fit" radar comes from stored scores, so the
numbers are consistent with the pipeline and re-weight with the learning loop.
"""
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel

from app import models as m
from app.db import MATCHES, USERS, get_db, now
from app.llm.gemini import generate_json, load_prompt
from app.services.matching import profile_for_prompt, scores_for
from app.services.users import candidate_summary


class BriefOut(BaseModel):
    snapshot: str
    green_flags: list[m.FlagItem]
    explore: list[m.FlagItem]
    questions_only_you_can_ask: list[str]
    family_fit: str


async def generate_and_store(match_id: str, *, viewer: dict, viewer_aspects: list[dict], cand: dict,
                             cand_aspects: list[dict], turns: list[dict], summaries: list[str],
                             open_questions: list[str], scores: dict) -> None:
    vf, cf = viewer["name"].split()[0], cand["name"].split()[0]
    transcript = "\n".join(f"{t['speaker_name']}: {t['text']}" for t in turns if t["speaker"] != "moderator")
    reasons = "\n".join(f"- {d}: {scores.get(d)} — {scores.get('reasons', {}).get(d, '')}" for d in m.DIMENSIONS)
    prompt = (
        f"{vf.upper()}'S PROFILE (your client):\n{profile_for_prompt(viewer, viewer_aspects, include_private=True)}\n\n"
        f"{cf.upper()}'S PROFILE (as shared by their matchmaker):\n{profile_for_prompt(cand, cand_aspects, include_private=False)}\n\n"
        f"INTERVIEW TRANSCRIPT:\n{transcript}\n\n"
        f"ROUND SUMMARIES:\n" + "\n".join(f"- {s}" for s in summaries) + "\n\n"
        f"OPEN QUESTIONS FROM THE INTERVIEW:\n" + ("\n".join(f"- {q}" for q in open_questions) or "- none") + "\n\n"
        f"COMPATIBILITY (from {vf}'s perspective):\n{reasons}"
    )
    out = await generate_json(prompt, BriefOut, system=load_prompt("brief").format(viewer_name=vf, cand_name=cf),
                              tier="smart", temperature=0.5)
    get_db().collection(MATCHES).document(match_id).collection("briefs").document(viewer["id"]).set({
        "for_user_id": viewer["id"], "candidate_id": cand["id"], "snapshot": out.snapshot,
        "green_flags": [f.model_dump() for f in out.green_flags[:4]],
        "explore": [f.model_dump() for f in out.explore[:3]],
        "questions_only_you": out.questions_only_you_can_ask[:5], "family_fit": out.family_fit,
        "generated_at": now(),
    })


def visible_to(match: dict, viewer_id: str) -> bool:
    """Mutual consent (spec §4.5): the requester sees their brief first; the other side only after the
    requester says Interested. A Pass is never revealed — the other side simply never gets a brief."""
    if viewer_id not in match.get("users", []):
        return False
    requester = match.get("interview_requested_by") or match["user_a"]
    if viewer_id == requester:
        return True
    requester_decision = match["decision_a"] if requester == match["user_a"] else match.get("decision_b")
    return requester_decision == "interested"


def build_brief(match_id: str, viewer_id: str) -> m.Brief | None:
    db = get_db()
    mref = db.collection(MATCHES).document(match_id)
    msnap = mref.get()
    if not msnap.exists:
        return None
    match = msnap.to_dict()
    if not visible_to(match, viewer_id):
        return None
    bsnap = mref.collection("briefs").document(viewer_id).get()
    if not bsnap.exists:
        return None
    b = bsnap.to_dict()
    viewer = db.collection(USERS).document(viewer_id).get().to_dict()
    cand_snap = db.collection(USERS).document(b["candidate_id"]).get()
    sc = scores_for(viewer, (match.get("scores_by_user") or {}).get(viewer_id, {}))
    return m.Brief(
        match_id=match_id, for_user_id=viewer_id, candidate=candidate_summary(cand_snap.to_dict(), cand_snap.id),
        compatibility=sc.overall,
        snapshot=b["snapshot"],
        why_fit=[m.WhyFitItem(dimension=d, score=getattr(sc, d), reason=sc.reasons.get(d, "")) for d in m.DIMENSIONS],
        green_flags=b["green_flags"], explore=b["explore"], questions_only_you=b["questions_only_you"],
        family_fit=b["family_fit"], generated_at=b.get("generated_at"),
    )


def next_brief(viewer_id: str) -> m.Brief | None:
    """The single brief to show now (spec §4.4: one at a time, no feed): highest-ranked briefed match the
    viewer can see and hasn't decided on yet."""
    db = get_db()
    viewer = db.collection(USERS).document(viewer_id).get().to_dict() or {}
    if viewer.get("status") in ("in_focus", "locked"):
        return None  # queue paused during a Focus Week (spec §4.6)
    best = None
    for snap in db.collection(MATCHES).where(filter=FieldFilter("users", "array_contains", viewer_id)).stream():
        mt = snap.to_dict()
        if mt.get("status") not in ("briefed", "awaiting_them"):
            continue
        other_id = mt["user_b"] if mt["user_a"] == viewer_id else mt["user_a"]
        other = db.collection(USERS).document(other_id).get().to_dict() or {}
        if other.get("status") in ("in_focus", "locked") and other.get("active_match_id") != snap.id:
            continue  # on hold: they're in a Focus Week with someone else
        my_decision = mt.get("decision_a") if mt["user_a"] == viewer_id else mt.get("decision_b")
        if my_decision or not visible_to(mt, viewer_id):
            continue
        score = scores_for(viewer, (mt.get("scores_by_user") or {}).get(viewer_id, {})).overall
        if best is None or score > best[0]:
            best = (score, snap.id)
    return build_brief(best[1], viewer_id) if best else None
