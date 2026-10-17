"""Focus Week (spec §7). STUB — real logic lands in Phase 5."""
from fastapi import APIRouter, Header

from app import mocks
from app import models as m

router = APIRouter(prefix="/focus", tags=["focus"])


@router.get("/{match_id}", response_model=m.FocusState)
async def focus_state(match_id: str, x_user_id: str = Header(default=mocks.ARJUN)):
    return mocks.focus_state(x_user_id)


@router.get("/{match_id}/chat", response_model=list[m.ChatMessage])
async def get_chat(match_id: str):
    return mocks.chat()


@router.post("/{match_id}/chat", response_model=m.ChatMessage)
async def post_chat(match_id: str, body: m.ChatPost):
    return m.ChatMessage(id="c_new", sender_id=body.sender_id, text=body.text, created_at=mocks.NOW)


@router.post("/{match_id}/decision", response_model=m.FocusDecisionResponse)
async def focus_decision(match_id: str, body: m.FocusDecisionRequest):
    if body.decision == "stop":
        return m.FocusDecisionResponse(match=mocks.match("closed"), outcome="closed",
                                       learning=mocks.learning_result())
    if body.decision == "extend":
        return m.FocusDecisionResponse(match=mocks.match("focus_week"), outcome="pending")
    return m.FocusDecisionResponse(match=mocks.match("focus_week"), outcome="pending")
