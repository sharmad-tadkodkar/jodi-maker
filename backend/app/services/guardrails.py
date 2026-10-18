"""Guardrails for user-written text (intake chat, Jodi Week chat, decision reasons, matchmaker instructions).

Two layers:
1. `screen_text` — instant, deterministic: profanity (English + Hindi/Hinglish, leetspeak/spacing/repeats
   normalised), self-harm wording, obvious coding / general-knowledge requests, size limits.
2. `classify_intake` — a small Gemini call for the intake chat only, for what word lists can't judge: illegal
   requests (dowry, underage marriage, forged documents, finding a specific person's private details), harm,
   jailbreak attempts, and anything outside matrimony.

A blocked intake message is never stored or extracted; Jodi answers with a calm, on-brand redirect instead.
"""
import logging
import re
import unicodedata
from enum import Enum

from pydantic import BaseModel

from app.llm.gemini import generate_json, load_prompt

log = logging.getLogger(__name__)

MAX_CHARS = 2000


class Verdict(str, Enum):
    ok = "ok"
    profanity = "profanity"
    off_topic = "off_topic"
    illegal = "illegal"
    harmful = "harmful"
    self_harm = "self_harm"
    prompt_injection = "prompt_injection"
    too_long = "too_long"


# Stems (matched at the start of a word after normalisation). Kept to unambiguous terms to avoid false positives
# ("ass" → assets, "bc" → because are deliberately absent).
PROFANITY_STEMS = [
    # English
    "fuck", "fuk", "fck", "motherfuck", "shit", "bullshit", "bitch", "bastard", "asshole", "arsehole", "cunt",
    "dickhead", "slut", "whore", "wanker", "twat", "retard", "nigger", "nigga", "faggot", "pussy", "cock",
    # Hindi / Hinglish
    "madarchod", "maderchod", "behenchod", "bhenchod", "benchod", "bhencho", "chutiya", "chutiye", "chutia",
    "bhosdi", "bhosda", "bhosadi", "randi", "lund", "lauda", "lavda", "laude", "gaandu", "gandu", "harami",
    "haramkhor", "jhaant", "jhant", "kutiya", "chinal", "tatti",
]
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i", "|": "i"})


def _normalise(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower().translate(_LEET)
    # f.u.c.k / f u c k → fuck: only runs of 3+ single letters, so "a b**ch" or "I am a" stay apart
    t = re.sub(r"\b(?:\w[\s._\-]+){2,}\w\b", lambda m: re.sub(r"[\s._\-]+", "", m.group(0)), t)
    return re.sub(r"(\w)\1{2,}", r"\1", t)  # fuuuuck → fuck (keeps legit double letters)


_PROFANITY_RE = re.compile(r"\b(?:" + "|".join(map(re.escape, PROFANITY_STEMS)) + r")\w*")


def _masked_profanity(n: str) -> bool:
    """f*ck, sh*t, b**ch: a word of 3+ characters where * or # stands in for letters and the whole word lines up
    with a listed term (optionally +ing/ed/er/s/y). "5*", "C#" and "*nix" don't."""
    for tok in re.findall(r"[a-z*#]*[*#][a-z*#]*", n):
        if len(tok) < 3 or len(re.findall(r"[a-z]", tok)) < 2:
            continue
        pat = re.compile(re.sub(r"[*#]", "[a-z]", re.escape(tok).replace(r"\*", "*").replace(r"\#", "#")))
        if any(pat.fullmatch(stem + suf) for stem in PROFANITY_STEMS for suf in ("", "ing", "ed", "er", "s", "y")):
            return True
    return False
_SELF_HARM_RE = re.compile(
    r"\b(kill myself|end my life|suicid\w*|want to die|don'?t want to (live|be alive)|self[- ]harm|cut myself|"
    r"marna chahta|marna chahti|jeena nahi)\b"
)
# Only *requests* for code count ("can you write…", "write me…", "please debug…") — never someone describing their job
# ("I write Python at work", "I run an import-export business").
_ASK = r"(?:^|[.?!]\s*|\b(?:can|could|would|will) you\s+|\bplease\s+|\bpls\s+|\bhelp me\s+|\bi need you to\s+|\bi want you to\s+)"
_CODE_RE = re.compile(
    r"```|\bdef \w+\(|\bconsole\.log\(|\bfunction\s+\w+\s*\(|"
    + _ASK + r"(?:write|generate|create|fix|debug|give me|make)\b[^.?!]{0,40}\b(?:code|script|program|function|sql|query|"
    r"regex|python|javascript|java|html|css|c\+\+|api|app)\b"
)
_TRIVIA_RE = re.compile(
    r"\b(capital of|who (is|was) the (president|prime minister|ceo)|solve (this|for x)|what is \d+\s*[-+*/x]\s*\d+|"
    r"translate (this|to)|write (an?|my) (essay|poem|story|email|cover letter|resume)|stock (price|tips)|weather in|"
    r"news (about|today)|recipe for)\b"
)


def screen_text(text: str) -> Verdict:
    """Deterministic check for any user-written text."""
    if len(text) > MAX_CHARS:
        return Verdict.too_long
    n = _normalise(text)
    if _SELF_HARM_RE.search(n):
        return Verdict.self_harm
    if _PROFANITY_RE.search(n) or _masked_profanity(n):
        return Verdict.profanity
    low = text.lower()  # off-topic patterns need real digits/punctuation, so not the leet-normalised text
    if _CODE_RE.search(low) or _TRIVIA_RE.search(low):
        return Verdict.off_topic
    return Verdict.ok


class _Classification(BaseModel):
    verdict: Verdict
    reason: str


async def classify_intake(text: str, last_agent_message: str) -> Verdict:
    """LLM check for the intake chat. Fails open (returns ok) if the model is unavailable — layer 1 already ran."""
    try:
        c = await generate_json(
            f"Jodi's last message:\n{last_agent_message}\n\nUser's message to classify:\n<<<{text}>>>",
            _Classification,
            system=load_prompt("guardrail"),
            tier="fast",
            temperature=0,
        )
        if c.verdict != Verdict.ok:
            log.info("intake guardrail: %s (%s)", c.verdict.value, c.reason[:120])
        return c.verdict
    except Exception as e:  # noqa: BLE001
        log.warning("intake guardrail unavailable, allowing: %s", str(e)[:160])
        return Verdict.ok


# What Jodi says instead (intake). Warm, short, back to the conversation.
INTAKE_REPLY = {
    Verdict.profanity: "Let's keep things kind here — I'm listening. Tell me a bit more about yourself instead?",
    Verdict.off_topic: (
        "I'm only here to help you find a life partner, so I can't help with that. "
        "Shall we get back to you — what matters most to you in a marriage?"
    ),
    Verdict.illegal: (
        "I can't help with that — Jodi only works within the law and with everyone's consent "
        "(no dowry, no underage matches, no tracking down people). Shall we talk about what you're looking for instead?"
    ),
    Verdict.harmful: "I can't help with that. I'm here to help you find someone kind and right for you — shall we continue?",
    Verdict.prompt_injection: "I'll stay your matchmaker, nothing else. So — tell me a little more about you?",
    Verdict.self_harm: (
        "I'm really sorry you're feeling this way, and I'm glad you said it. You don't have to carry it alone — "
        "please talk to someone right now: Tele-MANAS is free and open 24×7 at 14416 (or 1-800-891-4416). "
        "If you're in immediate danger, call 112. I'm here whenever you want to pick up again."
    ),
    Verdict.too_long: "That's a lot to take in at once! Could you share it in a shorter message?",
}

def guard_text(text: str | None) -> None:
    """Reject user-written text that fails the deterministic screen (HTTP 422 with a human-readable detail)."""
    if not text:
        return
    v = screen_text(text)
    if v != Verdict.ok:
        from fastapi import HTTPException

        raise HTTPException(422, TEXT_DETAIL[v])


# For person-to-person chat, decision reasons and matchmaker instructions (HTTP 422 detail, shown in the UI).
TEXT_DETAIL = {
    Verdict.profanity: "Let's keep it kind — that message wasn't sent. Try saying it another way.",
    Verdict.off_topic: "Jodi only handles things to do with finding a partner, so that wasn't sent.",
    Verdict.illegal: "That isn't something Jodi can pass on.",
    Verdict.harmful: "That isn't something Jodi can pass on.",
    Verdict.prompt_injection: "That isn't something Jodi can pass on.",
    Verdict.self_harm: (
        "We're worried about you. Please talk to someone now: Tele-MANAS, free and 24×7, at 14416 "
        "(or 1-800-891-4416). In immediate danger, call 112."
    ),
    Verdict.too_long: f"That's too long — please keep it under {MAX_CHARS} characters.",
}
