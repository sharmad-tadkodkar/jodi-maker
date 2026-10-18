"""Mutual consent → Focus Week (spec §4.5, §4.6).

- Interested/Pass on a brief. The other side's brief unlocks only after the requester says Interested; a Pass is
  never revealed (the match just quietly closes). Two Interested → "It's mutual" → Focus Week.
- Focus Week: exclusivity (both users `in_focus`, queues paused), chat, a personalised 7-day deck, and a Day-7
  decision: continue (both → locked), stop (either side, reason required → closed + learning), extend once
  (both → +7 days, 14 max).
- Fairness, evaluated lazily on read: a brief nobody answers within 72 h expires; a Focus Week that reaches its
  end without both decisions auto-closes.
- Day arithmetic is relative to `focus_start`, so the demo fast-forward just moves `focus_start` back.
"""
import logging
from datetime import timedelta

from fastapi import HTTPException
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel

from app import models as m
from app.db import MATCHES, USERS, get_db, now
from app.llm.gemini import generate_json, load_prompt
from app.services import brief as brief_svc
from app.services import learning, limits
from app.services.matching import scores_for
from app.services.users import candidate_summary, get_user_doc

log = logging.getLogger(__name__)

WEEK = 7
BRIEF_EXPIRY = timedelta(hours=72)
BUSY = ("in_focus", "locked")


# ---------- helpers ----------

def side(match: dict, user_id: str) -> str:
    if user_id == match["user_a"]:
        return "a"
    if user_id == match["user_b"]:
        return "b"
    raise HTTPException(403, "You're not part of this match")


def other_of(match: dict, user_id: str) -> str:
    return match["user_b"] if user_id == match["user_a"] else match["user_a"]


def load_match(match_id: str) -> tuple:
    ref = get_db().collection(MATCHES).document(match_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(404, "match not found")
    return ref, snap.to_dict()


def match_model(match_id: str, match: dict, viewer_id: str) -> m.Match:
    viewer = get_db().collection(USERS).document(viewer_id).get().to_dict() or {}
    sc = scores_for(viewer, (match.get("scores_by_user") or {}).get(viewer_id, {}))
    fields = {k: match.get(k) for k in m.Match.model_fields if k not in ("id", "scores") and k in match}
    return m.Match(id=match_id, scores=sc, **fields)


def _set_users(user_ids: list[str], status: str, active_match_id: str | None) -> None:
    db = get_db()
    for uid in user_ids:
        db.collection(USERS).document(uid).update({"status": status, "active_match_id": active_match_id,
                                                   "last_active_at": now()})


def on_hold(match: dict, viewer_id: str) -> bool:
    """The other person is in a Focus Week (or locked) with someone else → this match is invisible for now."""
    other = get_db().collection(USERS).document(other_of(match, viewer_id)).get().to_dict() or {}
    return other.get("status") in BUSY and other.get("active_match_id") not in (None, match.get("id"))


# ---------- fairness ----------

def expire_stale(user_id: str) -> int:
    """Close briefs nobody answered within 72 h and Focus Weeks past their end (spec §4.6 Fairness)."""
    db, t, n = get_db(), now(), 0
    for snap in db.collection(MATCHES).where(filter=FieldFilter("users", "array_contains", user_id)).stream():
        mt = snap.to_dict()
        if mt.get("status") == "awaiting_them" and mt.get("awaiting_since") and t - mt["awaiting_since"] > BRIEF_EXPIRY:
            snap.reference.update({"status": "closed", "closed_reason": "expired", "updated_at": t})
            n += 1
        elif mt.get("status") == "focus_week" and mt.get("focus_end") and t >= mt["focus_end"]:
            _close_focus(snap.reference, mt, "expired_no_decision")
            n += 1
    return n


def _close_focus(ref, match: dict, reason: str) -> None:
    ref.update({"status": "closed", "closed_reason": reason, "focus_closed_at": now(), "updated_at": now()})
    _set_users(match["users"], "active", None)


# ---------- brief decision (Interested / Pass) ----------

async def decide(match_id: str, user_id: str, decision: str, reason: str | None,
                 *, run_learning: bool = True) -> m.DecisionResponse:
    ref, match = load_match(match_id)
    match["id"] = match_id
    s = side(match, user_id)
    me = get_user_doc(user_id)
    if me.get("status") in BUSY and me.get("active_match_id") != match_id:
        raise HTTPException(409, "You're in a Focus Week — your queue is paused until it ends")
    if match.get("status") not in ("briefed", "awaiting_them") or not brief_svc.visible_to(match, user_id):
        raise HTTPException(409, "There's no brief to decide on for this match right now")
    if match.get(f"decision_{s}"):
        raise HTTPException(409, f"You already decided: {match[f'decision_{s}']}")
    if decision == "pass" and not (reason and reason.strip()):
        raise HTTPException(422, "A reason is required to pass (one tap: values, family, lifestyle, location, "
                                 "career, just not feeling it, or other: <text>)")

    t = now()
    if decision == "pass":
        # Never revealed to the other side: their brief simply never appears / quietly disappears.
        ref.update({f"decision_{s}": "pass", f"pass_reason_{s}": reason, "status": "closed",
                    "closed_reason": "pass", "updated_at": t})
        result = await learning.learn(user_id, match_id, "pass", reason) if run_learning else None
        return m.DecisionResponse(match=match_model(match_id, ref.get().to_dict(), user_id),
                                  mutual=False, learning=result)

    other_decision = match.get(f"decision_{'b' if s == 'a' else 'a'}")
    if other_decision == "interested":
        if on_hold(match, user_id):
            raise HTTPException(409, "This match is on hold right now — try again later")
        start_focus(ref, match)
        ref.update({f"decision_{s}": "interested", "updated_at": t})
        return m.DecisionResponse(match=match_model(match_id, ref.get().to_dict(), user_id), mutual=True)

    ref.update({f"decision_{s}": "interested", "status": "awaiting_them", "awaiting_since": t, "updated_at": t})
    return m.DecisionResponse(match=match_model(match_id, ref.get().to_dict(), user_id), mutual=False)


# ---------- Focus Week ----------

def start_focus(ref, match: dict) -> None:
    t = now()
    ref.update({"status": "focus_week", "mutual_at": t, "focus_start": t, "focus_end": t + timedelta(days=WEEK),
                "extended": False, "focus_decision_a": None, "focus_decision_b": None, "updated_at": t})
    _set_users(match["users"], "in_focus", ref.id)


class DeckDay(BaseModel):
    day: int
    prompts: list[str]


class DeckOut(BaseModel):
    days: list[DeckDay]


FALLBACK_DECK = [
    ["What does a normal workday look like for you?", "How do you like to spend a free Sunday?",
     "How often do you see or call your family?"],
    ["Where do you see yourself living in five years?", "What's one routine you'd never give up?",
     "How involved are your parents in your big decisions?"],
    ["How do you think about money — saving, spending, supporting family?",
     "What does a fair split of housework look like to you?", "How do you handle a disagreement?"],
    ["What would living arrangements look like in our first year?", "How do you feel about kids, and when?",
     "What role does faith or festivals play in your home?"],
    ["What career move are you hoping to make next?", "How would you want me to support your work?",
     "What's a habit of yours that might surprise me?"],
    ["What's something you're proud of that few people know?", "When do you feel most like yourself?",
     "What did your parents' marriage teach you?"],
    ["What does a good marriage look like to you?", "How do you like to be cared for on a bad day?",
     "What are you most hoping for from this week?"],
]


async def generate_deck(match_id: str) -> list[list[str]]:
    """7 days × 3 prompts, personalised from both briefs (spec §4.6). Falls back to a generic deck."""
    db = get_db()
    ref = db.collection(MATCHES).document(match_id)
    match = ref.get().to_dict()
    names = {uid: get_user_doc(uid)["name"].split()[0] for uid in match["users"]}
    parts = []
    for uid in match["users"]:
        b = ref.collection("briefs").document(uid).get()
        if b.exists:
            bd = b.to_dict()
            parts.append(f"{names[uid].upper()}'S BRIEF (about {names[other_of(match, uid)]}):\n"
                         f"Snapshot: {bd.get('snapshot')}\n"
                         f"Worth exploring: {[f.get('text') for f in bd.get('explore', [])]}\n"
                         f"Questions only {names[uid]} can ask: {bd.get('questions_only_you')}")
    try:
        a, b = (names[u] for u in match["users"])
        out = await generate_json("\n\n".join(parts) or "(no briefs)", DeckOut,
                                  system=load_prompt("focus_deck").format(a_name=a, b_name=b),
                                  tier="fast", temperature=0.7)
        days = {d.day: d.prompts[:3] for d in out.days if 1 <= d.day <= WEEK and len(d.prompts) >= 3}
        deck = [days.get(i, FALLBACK_DECK[i - 1]) for i in range(1, WEEK + 1)]
    except Exception as e:  # noqa: BLE001
        log.warning("deck generation failed, using fallback: %s", e)
        deck = FALLBACK_DECK
    ref.collection("focus").document("deck").set({"days": [{"day": i + 1, "prompts": p} for i, p in enumerate(deck)],
                                                  "created_at": now()})
    return deck


async def ensure_deck(match_id: str) -> list[list[str]]:
    snap = get_db().collection(MATCHES).document(match_id).collection("focus").document("deck").get()
    if snap.exists:
        return [d["prompts"] for d in sorted(snap.to_dict()["days"], key=lambda d: d["day"])]
    return await generate_deck(match_id)


def _total_days(match: dict) -> int:
    return WEEK * 2 if match.get("extended") else WEEK


def current_day(match: dict) -> int:
    start = match.get("focus_start")
    if not start:
        return 1
    return max(1, min(_total_days(match), (now() - start).days + 1))


async def state(match_id: str, viewer_id: str) -> m.FocusState:
    expire_stale(viewer_id)
    ref, match = load_match(match_id)
    s = side(match, viewer_id)
    if not match.get("focus_start"):
        raise HTTPException(404, "No Focus Week for this match (it starts when both say Interested)")
    deck = await ensure_deck(match_id)
    day = current_day(match)
    other = get_user_doc(other_of(match, viewer_id))
    return m.FocusState(
        match_id=match_id, day=day, total_days=_total_days(match), status=match["status"],
        ends_at=match.get("focus_end"), partner=candidate_summary(other),
        deck_today=deck[(day - 1) % WEEK], decision_me=match.get(f"focus_decision_{s}"),
        decision_them_submitted=bool(match.get(f"focus_decision_{'b' if s == 'a' else 'a'}")),
        extended=bool(match.get("extended")),
    )


def _chat_open(match: dict) -> bool:
    return bool(match.get("mutual_at")) and match.get("status") in ("focus_week", "locked")


def get_chat(match_id: str, viewer_id: str | None) -> list[m.ChatMessage]:
    ref, match = load_match(match_id)
    if viewer_id:
        side(match, viewer_id)
    if not match.get("mutual_at"):
        raise HTTPException(403, "Chat unlocks only when you both say Interested")
    return [m.ChatMessage(id=s.id, **s.to_dict()) for s in ref.collection("chat").order_by("created_at").stream()]


def post_chat(match_id: str, sender_id: str, text: str) -> m.ChatMessage:
    ref, match = load_match(match_id)
    side(match, sender_id)
    if not _chat_open(match):
        raise HTTPException(403, "Chat is only open during a Focus Week")
    text = text.strip()
    if not text:
        raise HTTPException(422, "Empty message")
    limits.enforce_daily_turns(ref.collection("chat"), "sender_id", sender_id)
    doc = {"sender_id": sender_id, "text": text[:2000], "created_at": now()}
    _, msg_ref = ref.collection("chat").add(doc)
    return m.ChatMessage(id=msg_ref.id, **doc)


async def focus_decide(match_id: str, user_id: str, decision: str, reason: str | None) -> m.FocusDecisionResponse:
    expire_stale(user_id)
    ref, match = load_match(match_id)
    s = side(match, user_id)
    o = "b" if s == "a" else "a"
    if match.get("status") != "focus_week":
        raise HTTPException(409, f"This Focus Week isn't active (status: {match.get('status')})")

    if decision == "stop":
        if not (reason and reason.strip()):
            raise HTTPException(422, "A reason is required to stop")
        ref.update({f"focus_decision_{s}": "stop", f"pass_reason_{s}": reason})
        _close_focus(ref, match, "stopped")
        result = await learning.learn(user_id, match_id, "stop", reason)
        return m.FocusDecisionResponse(match=match_model(match_id, ref.get().to_dict(), user_id),
                                       outcome="closed", learning=result)

    day, total = current_day(match), _total_days(match)
    if day < total:
        raise HTTPException(409, f"The decision opens on Day {total} (today is Day {day}). "
                                 "In the demo, fast-forward from the demo panel.")
    if decision == "extend" and match.get("extended"):
        raise HTTPException(409, "This Focus Week was already extended once (14 days max)")

    ref.update({f"focus_decision_{s}": decision, "updated_at": now()})
    theirs = match.get(f"focus_decision_{o}")
    result = None
    if decision == "continue":
        result = await learning.learn(user_id, match_id, "continue", reason)

    if not theirs:
        outcome = "pending"
    elif decision == "continue" and theirs == "continue":
        ref.update({"status": "locked", "locked_at": now()})
        _set_users(match["users"], "locked", match_id)
        outcome = "locked"
    else:
        # One wants more time (extend + extend, or extend + continue): extending is the shared answer.
        end = match["focus_end"] + timedelta(days=WEEK)
        ref.update({"extended": True, "focus_end": end, "focus_decision_a": None, "focus_decision_b": None})
        outcome = "extended"
    return m.FocusDecisionResponse(match=match_model(match_id, ref.get().to_dict(), user_id),
                                   outcome=outcome, learning=result)


def fast_forward(match_id: str, day: int) -> None:
    """Demo: pretend the Focus Week started `day - 1` days ago. A day past the end triggers auto-close on next read."""
    ref, match = load_match(match_id)
    if match.get("status") != "focus_week":
        raise HTTPException(409, f"No active Focus Week (status: {match.get('status')})")
    total = _total_days(match)
    day = max(1, min(day, total + 1))
    start = now() - timedelta(days=day - 1, minutes=1)
    ref.update({"focus_start": start, "focus_end": start + timedelta(days=total)})
