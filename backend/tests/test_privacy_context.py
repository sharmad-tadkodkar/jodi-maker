"""Privacy by construction: a private aspect must never reach a prompt that speaks for, or about, someone to the
other side. Checked for every seeded profile, with no LLM or database (the profiles come from seed/profiles.json)."""
import json
from pathlib import Path

from app.services.interview import _dealbreakers, _shareable
from app.services.matching import profile_for_prompt

PROFILES = json.loads((Path(__file__).parents[1] / "seed" / "profiles.json").read_text())


def _privates(p):
    return [a["statement"] for a in p["aspects"] if a["visibility"] == "private"]


def test_seed_has_private_aspects_to_protect():
    assert sum(len(_privates(p)) for p in PROFILES) > 0


def test_private_aspects_never_enter_shared_contexts():
    leaks = []
    for p in PROFILES:
        contexts = {
            # what each interview agent is told about its own client
            "interview_agent": profile_for_prompt(p, _shareable(p["aspects"]), include_private=False),
            "interview_dealbreakers": _dealbreakers(p["aspects"]),
            # how this person appears as the *candidate* in the other side's scoring and brief prompts
            "as_candidate": profile_for_prompt(p, p["aspects"], include_private=False),
        }
        for name, text in contexts.items():
            leaks += [(p["id"], name, s) for s in _privates(p) if s in text]
    assert not leaks, leaks
