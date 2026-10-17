"""Matchmaker-to-matchmaker interview (spec §4.3) — the centrepiece.

Two agents, each representing one user, hold three rounds (family → candidate → closing). After each
round a moderator decides continue / end_dealbreaker, writes a round summary, tags key lines
green/yellow and collects open questions. Turns are persisted as they're generated so the frontend can
render the conversation live.

Privacy by construction: agents are only ever given public + agent_only aspects. Private aspects never
enter an agent's context, so they cannot leak.
"""
import asyncio
import logging
import re

from pydantic import BaseModel

from app import models as m
from app.config import get_settings
from app.db import MATCHES, delete_tree, get_db, now
from app.jobs import ProgressFn
from app.llm.gemini import generate_json, generate_text, load_prompt
from app.services import brief as brief_svc
from app.services.matching import profile_for_prompt, score_pair
from app.services.users import get_user_doc, list_aspects

log = logging.getLogger(__name__)

ROUNDS = [
    (1, "Family round", "a",
     "Learn about each other's families: background, who they live with, traditions, living-arrangement "
     "and in-law expectations, family values. Share {me}'s family picture too."),
    (2, "Candidate round", "b",
     "HR-style, to read the person: a typical day, work and ambitions, weekends, how they handle "
     "disagreement, future plans (city, kids, finances). Ask open questions that reveal character."),
    (3, "Closing round", "a",
     "Resolve open questions and do a dealbreaker check — ask directly about the specific habits or "
     "expectations that matter to {me} (e.g. 'Does she smoke?'), never by listing {me}'s dealbreakers. "
     "In your FINAL turn of this round, give your "
     "recommendation clearly: recommend, recommend with reservations, or do not recommend — with one reason."),
]


class Highlight(BaseModel):
    turn_index: int
    color: str  # green | yellow


class ModeratorOut(BaseModel):
    action: str  # continue | end_dealbreaker
    dealbreaker_detail: str
    round_summary: str
    highlights: list[Highlight]
    open_questions: list[str]


def _first(user: dict) -> str:
    return user["name"].split()[0]


def _shareable(aspects: list[dict]) -> list[dict]:
    return [a for a in aspects if a.get("visibility") != "private"]


def _dealbreakers(aspects: list[dict]) -> str:
    items = [a["statement"] for a in aspects if a["category"] == "dealbreakers" and a.get("visibility") != "private"]
    return "; ".join(items) or "none stated"


def _clean(text: str, names: list[str]) -> str:
    """Models sometimes prefix their own speaker label — strip it."""
    for n in names:
        text = re.sub(rf"^\s*\**{re.escape(n)}'?s? matchmaker\**\s*:\s*", "", text, flags=re.I)
    return text.strip().strip('"').strip()


def _transcript(turns: list[dict]) -> str:
    return "\n".join(f"[{t['turn_index']}] {t['speaker_name']}: {t['text']}" for t in turns if t["speaker"] != "moderator")


async def run_interview(match_id: str, requester_id: str, instructions: str | None,
                        progress: ProgressFn = lambda _: None) -> dict:
    db = get_db()
    ref = db.collection(MATCHES).document(match_id)
    snap = ref.get()
    if not snap.exists:
        raise ValueError("match not found")
    match = snap.to_dict()

    # Fresh run: clear any previous interview/briefs.
    delete_tree(ref.collection("interview"))
    delete_tree(ref.collection("briefs"))
    ref.update({"status": "screening", "interview_status": "running", "interview_requested_by": requester_id,
                "round_summaries": [], "open_questions": [], "closed_reason": None, "updated_at": now()})

    ua, ub = get_user_doc(match["user_a"]), get_user_doc(match["user_b"])
    asp_a, asp_b = list_aspects(ua["id"]), list_aspects(ub["id"])
    side = {
        "a": {"user": ua, "aspects": asp_a, "speaker": "agent_a", "other": ub},
        "b": {"user": ub, "aspects": asp_b, "speaker": "agent_b", "other": ua},
    }
    req_side = "a" if requester_id == ua["id"] else "b"
    names = [_first(ua), _first(ub)]
    exchanges = get_settings().interview_exchanges_per_round
    turns: list[dict] = []
    summaries: list[str] = []
    open_qs: list[str] = []

    def save_turn(rnd: int, speaker: str, speaker_name: str, text: str) -> dict:
        t = {"round": rnd, "speaker": speaker, "speaker_name": speaker_name, "text": text,
             "highlight": None, "turn_index": len(turns), "created_at": now()}
        ref.collection("interview").document(f"t{t['turn_index']:03d}").set(t)
        turns.append(t)
        return t

    for rnd, title, opener, goal in ROUNDS:
        progress(f"{title}: the matchmakers are talking…")
        order = [opener, "b" if opener == "a" else "a"] * exchanges
        round_start = len(turns)
        for i, s in enumerate(order):
            me, other = side[s]["user"], side[s]["other"]
            instr = ""
            if instructions and s == req_side:
                instr = (f"\n{_first(me)} asked you to find out: \"{instructions}\". Weave it in naturally "
                         "when it fits (once), and listen carefully to the answer.")
            system = load_prompt("interview_agent").format(
                me_name=_first(me), other_name=_first(other),
                profile=profile_for_prompt(me, _shareable(side[s]["aspects"]), include_private=False),
                round_title=title, round_goal=goal.format(me=_first(me)), instructions=instr,
            )
            if not turns:
                cue = (f"Open the conversation: introduce yourself as the AI matchmaker for {_first(me)}, "
                       f"give a one-line picture of {_first(me)}, and start the family round.")
            elif i == len(order) - 2 and rnd == 3:
                cue = "Your final turn: give your recommendation now (and answer anything pending)."
            elif i == len(order) - 1 and rnd == 3:
                cue = "Last turn of the interview: respond, then give your own recommendation and close warmly."
            elif i == 0:
                cue = f"Start the {title.lower()} with a question that fits its goal."
            else:
                cue = "Your turn."
            prompt = f"Conversation so far:\n{_transcript(turns) or '(none yet)'}\n\n{cue}"
            text = _clean(await generate_text(prompt, system=system, tier="reason", temperature=0.8), names)
            save_turn(rnd, side[s]["speaker"], f"{_first(me)}'s matchmaker", text)
            progress(f"{title}: {len(turns) - round_start}/{len(order)} turns…")

        mod = await generate_json(
            f"Round transcript:\n{_transcript(turns[round_start:])}",
            ModeratorOut,
            system=load_prompt("interview_moderator").format(
                a_name=names[0], b_name=names[1], a_dealbreakers=_dealbreakers(asp_a),
                b_dealbreakers=_dealbreakers(asp_b), round_title=title),
            tier="fast", temperature=0.2,
        )
        for h in mod.highlights:
            if round_start <= h.turn_index < len(turns) and h.color in ("green", "yellow"):
                turns[h.turn_index]["highlight"] = h.color
                ref.collection("interview").document(f"t{h.turn_index:03d}").update({"highlight": h.color})
        summaries.append(mod.round_summary)
        open_qs += mod.open_questions
        ref.update({"round_summaries": summaries, "open_questions": open_qs, "updated_at": now()})

        if mod.action == "end_dealbreaker":
            detail = mod.dealbreaker_detail or "a dealbreaker came up"
            save_turn(rnd, "moderator", "Moderator", f"Interview ended early: {detail}")
            ref.update({"status": "closed", "interview_status": "ended_dealbreaker",
                        "closed_reason": f"dealbreaker:{detail}", "updated_at": now()})
            return {"match_id": match_id, "status": "ended_dealbreaker", "detail": detail}

    progress("Interview done. Writing your Match Brief…")
    # Each side's brief needs scores from their own perspective.
    scores = match.get("scores_by_user") or {}
    for me_s, other_s in (("a", "b"), ("b", "a")):
        uid = side[me_s]["user"]["id"]
        if uid not in scores:
            out = await score_pair(side[me_s]["user"], side[me_s]["aspects"], side[other_s]["user"],
                                   side[other_s]["aspects"])
            scores[uid] = {d: getattr(out, d).score for d in m.DIMENSIONS}
            scores[uid]["reasons"] = {d: getattr(out, d).reason for d in m.DIMENSIONS}
            ref.update({f"scores_by_user.{uid}": scores[uid]})

    await asyncio.gather(*[
        brief_svc.generate_and_store(match_id, viewer=side[v]["user"], viewer_aspects=side[v]["aspects"],
                                     cand=side[c]["user"], cand_aspects=_shareable(side[c]["aspects"]),
                                     turns=turns, summaries=summaries, open_questions=open_qs,
                                     scores=scores[side[v]["user"]["id"]])
        for v, c in (("a", "b"), ("b", "a"))
    ])
    ref.update({"status": "briefed", "interview_status": "done", "briefed_at": now(), "updated_at": now()})
    return {"match_id": match_id, "status": "done", "turns": len(turns)}


def get_interview(match_id: str) -> m.InterviewResponse:
    ref = get_db().collection(MATCHES).document(match_id)
    snap = ref.get()
    if not snap.exists:
        raise ValueError("match not found")
    match = snap.to_dict()
    turns = [{"id": s.id, **s.to_dict()} for s in ref.collection("interview").order_by("turn_index").stream()]
    return m.InterviewResponse(status=match.get("interview_status") or "not_started",
                               turns=turns, round_summaries=match.get("round_summaries") or [])
