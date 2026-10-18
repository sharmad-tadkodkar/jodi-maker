"""Guardrails for user-written text (intake chat, Jodi Week chat, decision reasons, matchmaker instructions).

Two layers:
1. `screen_text` — instant, deterministic, and only for things that are never a genuine answer: unambiguous
   profanity (English + Hindi/Hinglish, leetspeak/spacing/masking/repeats normalised), explicit requests for code,
   arithmetic or essays, size limits. Anything that depends on context (self-harm wording, "weather in", "Lund",
   "Randi", "summa cum laude") is left to layer 2, because a word list blocks real people talking about their lives.
2. A small Gemini call that judges the whole message:
   - `classify_intake` for the chat with Jodi: illegal requests (dowry, underage marriage, forged documents, finding
     a specific person's private details), harm, jailbreak attempts, and anything outside matrimony.
   - `guard_chat` for Jodi Week person-to-person chat: harassment, sexual content, threats, money requests/scams.
   If the model is unavailable both fail open, except that self-harm wording still gets the crisis message.

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
    "dickhead", "slut", "whore", "wanker", "nigger", "nigga", "faggot",
    # Hindi / Hinglish
    "madarchod", "maderchod", "behenchod", "bhenchod", "benchod", "bhencho", "chutiya", "chutiye", "chutia",
    "bhosdi", "bhosda", "bhosadi", "gaandu", "haramkhor", "jhaant", "kutiya", "chinal",
]
# Whole words only (+s/ed/ing): as a prefix these block cocktail, cockpit, pussycat, fire retardant.
PROFANITY_WORDS = ["cock", "pussy", "retard", "gandu", "twat"]
# Deliberately left to the model: lund / laude / lauda / randi / harami / tatti are also a university, "summa cum
# laude", a racing driver, a first name and everyday banter.
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i", "|": "i"})


def _normalise(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower().translate(_LEET)
    # f.u.c.k / f u c k → fuck: only runs of 3+ single letters, so "a b**ch" or "I am a" stay apart
    t = re.sub(r"\b(?:\w[\s._\-]+){2,}\w\b", lambda m: re.sub(r"[\s._\-]+", "", m.group(0)), t)
    return re.sub(r"(\w)\1{2,}", r"\1", t)  # fuuuuck → fuck (keeps legit double letters)


_SUFFIXES = ("", "s", "ed", "ing", "er", "y")
_PROFANITY_RE = re.compile(
    r"\b(?:" + "|".join(map(re.escape, PROFANITY_STEMS)) + r")\w*"
    r"|\b(?:" + "|".join(map(re.escape, PROFANITY_WORDS)) + r")(?:s|ed|ing)?\b"
)


def _masked_profanity(n: str) -> bool:
    """f*ck, sh*t, b**ch, f***: a word where * or # stands in for letters and the whole word lines up with a listed
    term (optionally +ing/ed/er/s/y). Needs 2+ visible letters, or a leading letter and 4+ characters ("f***").
    "5*", "C#", "*nix" and "a**" don't count."""
    for tok in re.findall(r"[a-z*#]*[*#][a-z*#]*", n):
        letters = len(re.findall(r"[a-z]", tok))
        if len(tok) < 3 or not (letters >= 2 or (letters == 1 and tok[0].isalpha() and len(tok) >= 4)):
            continue
        pat = re.compile(re.sub(r"[*#]", "[a-z]", re.escape(tok).replace(r"\*", "*").replace(r"\#", "#")))
        if any(pat.fullmatch(w + suf) for w in PROFANITY_STEMS + PROFANITY_WORDS for suf in _SUFFIXES):
            return True
    return False


# Self-harm wording is only a hint: "my brother died by suicide" or "I could die laughing" are real answers.
# The model decides; this is the fallback when the model is unavailable, and the check for text the model never sees.
_SELF_HARM_RE = re.compile(
    r"\b(kill myself|end my life|suicid\w*|want to die|don'?t want to (live|be alive)|self[- ]harm|cut myself|"
    r"marna chahta|marna chahti|jeena nahi)\b"
)
# Only *requests* for code count ("can you write…", "write me…", "please debug…") — never someone describing their job
# ("I write Python at work", "I run an import-export business").
_ASK = r"(?:^|[.?!]\s*|\b(?:can|could|would|will) you\s+|\bplease\s+|\bpls\s+|\bhelp me\s+|\bi need you to\s+|\bi want you to\s+)"
# ("give me a partner who knows Python" and "make sure the app…" are not requests for code.)
_CODE_RE = re.compile(
    r"```|\bdef \w+\(|\bconsole\.log\(|\bfunction\s+\w+\s*\(|"
    + _ASK + r"(?:write|generate|create|fix|debug)\b[^.?!]{0,40}\b(?:code|script|program|function|sql|query|"
    r"regex|python|javascript|java|html|css|c\+\+)\b"
)
# Only unmistakable assistant tasks; "the IT capital of India", "the weather in Pune", "a recipe for disaster" and
# everything else off-topic is the model's call.
_TRIVIA_RE = re.compile(
    r"\b(what(?:'s| is) the capital of|solve (this|for x)|what(?:'s| is) \d+\s*[-+*/x]\s*\d+)\b"
    r"|" + _ASK + r"write (an?|my) (essay|poem|story|email|cover letter|resume)\b"
)


def self_harm_hint(text: str) -> bool:
    return bool(_SELF_HARM_RE.search(_normalise(text)))


def screen_text(text: str) -> Verdict:
    """Deterministic check for any user-written text: blocks only what is never a genuine answer."""
    if len(text) > MAX_CHARS:
        return Verdict.too_long
    n = _normalise(text)
    if _PROFANITY_RE.search(n) or _masked_profanity(n):
        return Verdict.profanity
    low = text.lower()  # off-topic patterns need real digits/punctuation, so not the leet-normalised text
    if _CODE_RE.search(low) or _TRIVIA_RE.search(low):
        return Verdict.off_topic
    return Verdict.ok


class _Classification(BaseModel):
    verdict: Verdict
    reason: str


async def _classify(kind: str, system_prompt: str, prompt: str, text: str) -> Verdict:
    """One fast-tier call. If the model is unavailable: self-harm wording still gets the crisis message, the rest
    fails open (layer 1 already ran)."""
    try:
        c = await generate_json(prompt, _Classification, system=load_prompt(system_prompt), tier="fast", temperature=0)
        if c.verdict != Verdict.ok:
            log.info("%s guardrail: %s (%s)", kind, c.verdict.value, c.reason[:120])
        return c.verdict
    except Exception as e:  # noqa: BLE001
        fallback = Verdict.self_harm if self_harm_hint(text) else Verdict.ok
        log.warning("%s guardrail unavailable, falling back to %s: %s", kind, fallback.value, str(e)[:160])
        return fallback


async def classify_intake(text: str, last_agent_message: str) -> Verdict:
    """LLM check for the intake chat."""
    return await _classify(
        "intake", "guardrail", f"Jodi's last message:\n{last_agent_message}\n\nUser's message to classify:\n<<<{text}>>>", text)


async def classify_chat(text: str) -> Verdict:
    """LLM check for a Jodi Week message from one person to the other. Off-topic is fine between two people, and
    prompt injection doesn't apply (no model reads it as instructions) — both map to ok."""
    v = await _classify("chat", "chat_guardrail", f"Message to classify:\n<<<{text}>>>", text)
    return Verdict.ok if v in (Verdict.off_topic, Verdict.prompt_injection) else v


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

def _reject(v: Verdict) -> None:
    from fastapi import HTTPException

    raise HTTPException(422, TEXT_DETAIL[v])


def guard_screen(text: str | None) -> None:
    """Deterministic screen only (no model, no database) — a cheap early 422 in front of `guard_chat`."""
    if text and (v := screen_text(text)) != Verdict.ok:
        _reject(v)


def guard_text(text: str | None) -> None:
    """Reject user-written text that fails the deterministic screen (HTTP 422 with a human-readable detail). For
    decision reasons and matchmaker instructions, which no person reads and the model never treats as orders."""
    if not text:
        return
    v = screen_text(text)
    if v == Verdict.ok and self_harm_hint(text):
        v = Verdict.self_harm
    if v != Verdict.ok:
        _reject(v)


async def guard_chat(text: str) -> None:
    """Deterministic screen, then the model: a Jodi Week message is only delivered if both pass (else HTTP 422)."""
    v = screen_text(text)
    if v == Verdict.ok:
        v = await classify_chat(text)
    if v != Verdict.ok:
        _reject(v)


# For person-to-person chat, decision reasons and matchmaker instructions (HTTP 422 detail, shown in the UI).
TEXT_DETAIL = {
    Verdict.profanity: "Let's keep it kind — that message wasn't sent. Try saying it another way.",
    Verdict.off_topic: "Jodi only handles things to do with finding a partner, so that wasn't sent.",
    Verdict.illegal: (
        "That wasn't sent. For everyone's safety Jodi doesn't pass on requests for money, dowry, or anyone's "
        "private details."
    ),
    Verdict.harmful: "That wasn't sent. Jodi doesn't pass on anything insulting, sexual, threatening or pressuring.",
    Verdict.prompt_injection: "That isn't something Jodi can pass on.",
    Verdict.self_harm: (
        "We're worried about you. Please talk to someone now: Tele-MANAS, free and 24×7, at 14416 "
        "(or 1-800-891-4416). In immediate danger, call 112."
    ),
    Verdict.too_long: f"That's too long — please keep it under {MAX_CHARS} characters.",
}
