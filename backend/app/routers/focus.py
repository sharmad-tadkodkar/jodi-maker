"""Focus Week (spec §4.6, §7)."""
from fastapi import APIRouter, Header

from app import models as m
from app.services import focus as focus_svc
from app.services.guardrails import guard_text

router = APIRouter(prefix="/focus", tags=["focus"])


def _viewer(match_id: str, x_user_id: str | None) -> str:
    _, match = focus_svc.load_match(match_id)
    return x_user_id if x_user_id in match["users"] else match["user_a"]


@router.get("/{match_id}", response_model=m.FocusState)
async def focus_state(match_id: str, x_user_id: str | None = Header(default=None)):
    """Day counter, today's 3 deck prompts, and decision state from the X-User-Id viewer's side.
    `decision_them_submitted` says only *whether* the other side decided, never what.
    Auto-closes (status `closed`) if the week ended without both decisions."""
    return await focus_svc.state(match_id, _viewer(match_id, x_user_id))


@router.get("/{match_id}/chat", response_model=list[m.ChatMessage])
async def get_chat(match_id: str, x_user_id: str | None = Header(default=None)):
    """Oldest first. 403 until both said Interested. Poll every ~2 s."""
    return focus_svc.get_chat(match_id, x_user_id)


@router.post("/{match_id}/chat", response_model=m.ChatMessage)
async def post_chat(match_id: str, body: m.ChatPost):
    """403 unless the Focus Week is active (or locked)."""
    guard_text(body.text)
    return focus_svc.post_chat(match_id, body.sender_id, body.text)


@router.post("/{match_id}/decision", response_model=m.FocusDecisionResponse)
async def focus_decision(match_id: str, body: m.FocusDecisionRequest):
    """Day-7 decision. `stop` works any day (reason required) and closes immediately with `learning`.
    `continue` / `extend` open on the last day (409 before): both continue → `locked`; any extend → `extended`
    (+7 days, once); first answer → `pending`."""
    guard_text(body.reason)
    return await focus_svc.focus_decide(match_id, body.user_id, body.decision, body.reason)
