"""Conversational intake + extraction (spec §4.1).

Each user turn runs two Gemini calls in parallel:
- the matchmaker reply (steered towards still-missing topics, with adaptive follow-ups)
- extraction of aspects / self facts / partner criteria from the user's latest message
Completeness is computed from coverage, not a fixed number of questions.
"""
import asyncio
import uuid

from pydantic import BaseModel

from app import models as m
from app.db import USERS, get_db, now
from app.llm.gemini import generate_json, generate_text, load_prompt
from app.services import guardrails
from app.services.users import get_user_doc, list_aspects

DONE_THRESHOLD = 0.8
CORE_FACTS = ["age", "city", "profession", "education", "diet", "marital_status"]
# Most important first — the agent is steered in this order.
CATEGORY_PRIORITY = [
    "family_structure", "values", "career_ambition", "location_plans", "partner_expectations",
    "dealbreakers", "lifestyle", "communication_style", "faith_practice", "finances", "interests",
]
CATEGORY_LABELS = {
    "values": "core values", "family_structure": "their family", "career_ambition": "work and ambitions",
    "lifestyle": "daily routine and lifestyle", "location_plans": "where they want to live",
    "finances": "money habits and plans", "faith_practice": "faith and traditions in daily life",
    "communication_style": "how they handle disagreements", "interests": "hobbies and interests",
    "partner_expectations": "what they want in a partner", "dealbreakers": "their dealbreakers",
}
OPENING = ("Namaste {first}! I'm Jodi, your AI matchmaker. Think of me as the family friend who does the "
           "legwork — I'll get to know you, quietly scout, and bring you just one person at a time, "
           "with a proper briefing. Nothing you tell me is shown to anyone without your say. "
           "To start: tell me a little about yourself — what do you do, and where's home right now?")


# ---------- Extraction schema ----------

class ExtractedAspect(BaseModel):
    category: m.AspectCategory
    statement: str
    evidence: str
    confidence: float
    visibility: m.Visibility


class ExtractedFacts(BaseModel):
    age: int | None = None
    city: str | None = None
    education: str | None = None
    profession: str | None = None
    income_band: str | None = None
    diet: str | None = None
    marital_status: str | None = None
    languages: list[str] | None = None
    height_cm: int | None = None


class ExtractedCriteria(BaseModel):
    age_min: int | None = None
    age_max: int | None = None
    cities: list[str] | None = None
    open_to_relocate: bool | None = None
    education_min: str | None = None
    diet: str | None = None
    marital_status: list[str] | None = None
    languages: list[str] | None = None


class Extraction(BaseModel):
    new_aspects: list[ExtractedAspect]
    facts: ExtractedFacts
    criteria: ExtractedCriteria


# ---------- Helpers ----------

def _messages_ref(user_id: str):
    return get_db().collection(USERS).document(user_id).collection("intake_messages")


def get_messages(user_id: str) -> list[dict]:
    snaps = _messages_ref(user_id).order_by("created_at").stream()
    return [{"id": s.id, **s.to_dict()} for s in snaps]


def _add_message(user_id: str, role: str, text: str) -> dict:
    msg = {"role": role, "text": text, "created_at": now()}
    ref = _messages_ref(user_id).document(uuid.uuid4().hex[:10])
    ref.set(msg)
    return {"id": ref.id, **msg}


def ensure_opening(user: dict) -> list[dict]:
    msgs = get_messages(user["id"])
    if not msgs:
        msgs = [_add_message(user["id"], "agent", OPENING.format(first=user["name"].split()[0]))]
    return msgs


def coverage(aspects: list[dict], facts: dict) -> tuple[float, list[str], list[str]]:
    covered = {a["category"] for a in aspects if a.get("confidence", 1) >= 0.5}
    missing_cats = [c for c in CATEGORY_PRIORITY if c not in covered]
    missing_facts = [f for f in CORE_FACTS if not facts.get(f)]
    score = 0.8 * (1 - len(missing_cats) / len(CATEGORY_PRIORITY)) + 0.2 * (1 - len(missing_facts) / len(CORE_FACTS))
    return round(score, 2), missing_cats, missing_facts


def _known_summary(user: dict, aspects: list[dict]) -> str:
    facts = {k: v for k, v in (user.get("self_facts") or {}).items() if v}
    lines = [f"Facts: {facts}"] + [f"- [{a['category']}] {a['statement']}" for a in aspects]
    return "\n".join(lines) if aspects or facts else "Nothing yet."


def _transcript(msgs: list[dict], last_n: int = 12) -> str:
    who = {"agent": "Matchmaker", "user": "User"}
    return "\n".join(f"{who[x['role']]}: {x['text']}" for x in msgs[-last_n:])


# ---------- Main turn ----------

async def _reply(user: dict, msgs: list[dict], aspects: list[dict], missing_cats: list[str],
                 missing_facts: list[str], nearly_done: bool) -> str:
    first = user["name"].split()[0]
    ending = (
        "You now know them well. In this reply, warmly tell them you know enough to start scouting, "
        "that they can review everything you've learned on their profile page, and that they're "
        "welcome to keep chatting to add more. Do not ask another question."
        if nearly_done else "Keep going — don't wrap up yet."
    )
    system = load_prompt("intake_agent").format(
        name=first,
        missing=", ".join(CATEGORY_LABELS[c] for c in missing_cats[:4]) or "nothing major — go deeper on what matters to them",
        missing_facts=", ".join(missing_facts) or "none",
        ending_instruction=ending,
        known=_known_summary(user, aspects),
    )
    return await generate_text(f"Conversation so far:\n{_transcript(msgs, 40)}\n\nWrite your next message.",
                               system=system, tier="fast", temperature=0.8)


async def _extract(user: dict, msgs: list[dict], aspects: list[dict]) -> Extraction:
    system = load_prompt("intake_extract").format(name=user["name"].split()[0],
                                                  known=_known_summary(user, aspects))
    return await generate_json(f"Conversation (latest user message is last):\n{_transcript(msgs, 4)}",
                               Extraction, system=system, tier="fast", temperature=0.2)


def _apply_extraction(user: dict, ex: Extraction) -> list[dict]:
    ref = get_db().collection(USERS).document(user["id"])
    t = now()
    created = []
    for a in ex.new_aspects:
        if a.confidence < 0.4 or not a.statement.strip():
            continue
        doc = {**a.model_dump(), "confidence": max(0.0, min(1.0, a.confidence)), "source": "intake", "created_at": t}
        aref = ref.collection("aspects").document(uuid.uuid4().hex[:10])
        aref.set(doc)
        created.append({"id": aref.id, **doc})

    updates: dict = {"last_active_at": t}
    for k, v in ex.facts.model_dump(exclude_none=True).items():
        updates[f"self_facts.{k}"] = v
        user.setdefault("self_facts", {})[k] = v
    for k, v in ex.criteria.model_dump(exclude_none=True).items():
        if v == [] or v == "":
            continue
        updates[f"hard_criteria.{k}"] = v
    ref.update(updates)
    return created


async def handle_message(user_id: str, text: str) -> tuple[m.IntakeMessageResponse, bool]:
    """Returns (response, should_refresh_embeddings).

    Guardrails (services/guardrails.py): a deterministic screen runs first (no model calls if it blocks); the
    LLM classifier runs in parallel with the reply + extraction. Nothing — the user's message, extracted notes or
    the reply — is stored until the message has cleared both.
    """
    user = get_user_doc(user_id)
    history = ensure_opening(user)
    aspects = list_aspects(user_id)
    before, missing_cats, missing_facts = coverage(aspects, user.get("self_facts") or {})

    verdict = guardrails.screen_text(text)
    if verdict != guardrails.Verdict.ok:
        return _blocked(verdict, before, missing_cats), False

    # Work on the transcript in memory; persist only if the message is allowed.
    msgs = history + [{"id": "pending", "role": "user", "text": text, "created_at": now()}]
    # Reply and extraction in parallel. The reply sees the user's message, so it already knows what
    # was just covered; "nearly done" uses pre-extraction coverage plus this turn's likely gain.
    nearly_done = before >= DONE_THRESHOLD - 0.1 and len(missing_cats) <= 2
    last_agent = next((x["text"] for x in reversed(history) if x["role"] == "agent"), "")
    verdict, reply, ex = await asyncio.gather(
        guardrails.classify_intake(text, last_agent),
        _reply(user, msgs, aspects, missing_cats, missing_facts, nearly_done),
        _extract(user, msgs, aspects),
    )
    if verdict != guardrails.Verdict.ok:
        return _blocked(verdict, before, missing_cats), False

    _add_message(user_id, "user", text)
    created = _apply_extraction(user, ex)
    completeness, missing_cats, _ = coverage(aspects + created, user.get("self_facts") or {})
    done = completeness >= DONE_THRESHOLD

    status_update = {"intake_completeness": completeness}
    if done and user.get("status") == "onboarding":
        status_update["status"] = "active"
    get_db().collection(USERS).document(user_id).update(status_update)
    _add_message(user_id, "agent", reply)

    resp = m.IntakeMessageResponse(
        reply=reply, completeness=completeness, missing_categories=missing_cats,
        new_aspects=[m.Aspect(**a) for a in created], done=done,
    )
    return resp, bool(created or ex.facts.model_dump(exclude_none=True))


def _blocked(verdict: "guardrails.Verdict", completeness: float, missing_cats: list[str]) -> m.IntakeMessageResponse:
    """Calm redirect for a message that failed a guardrail. Nothing is stored; progress is unchanged."""
    return m.IntakeMessageResponse(
        reply=guardrails.INTAKE_REPLY[verdict], completeness=completeness, missing_categories=missing_cats,
        new_aspects=[], done=completeness >= DONE_THRESHOLD,
    )


