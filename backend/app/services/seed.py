"""Seeded world (spec §4.9).

Profiles are generated ONCE by Gemini into `seed/profiles.json` (checked in), so demo resets are fast
and deterministic. Heroes (Arjun, Meera) are hand-tuned in `seed/heroes.json`.

    uv run python -m app.services.seed generate            # 20 profiles + 2 reserves
    uv run python -m app.services.seed generate --count 60 # scale up later (keeps existing ones)
"""
import argparse
import asyncio
import json
import logging
import random
import re
from datetime import timedelta
from pathlib import Path

from pydantic import BaseModel, Field

from app import models as m
from app.db import JOBS, MATCHES, USERS, delete_tree, get_db, now
from app.llm.gemini import generate_json
from app.services.embeddings import embed_profiles

log = logging.getLogger(__name__)
SEED_DIR = Path(__file__).resolve().parents[2] / "seed"
HEROES_FILE = SEED_DIR / "heroes.json"
PROFILES_FILE = SEED_DIR / "profiles.json"
# Hero scout results (and later interviews/briefs) computed once with real Gemini calls and loaded on
# reset, so the demo's happy path never waits on live LLM capacity. Regenerate: `... seed precompute`.
PRECOMPUTED_FILE = SEED_DIR / "precomputed.json"
HERO_IDS = ["arjun", "meera"]


# ---------- Generation schema ----------

class SeedAspect(BaseModel):
    category: m.AspectCategory
    statement: str
    evidence: str
    confidence: float = Field(ge=0, le=1)
    visibility: m.Visibility


class GeneratedProfile(BaseModel):
    name: str
    bio_note: str
    self_facts: m.SelfFacts
    hard_criteria: m.HardCriteria
    preference_weights: m.PreferenceWeights
    aspects: list[SeedAspect]


# Each brief shapes one profile. Designed so the demo shows every path: strong fits, dealbreaker
# exclusions, and hard-filter failures (both directions). Fields: gender, age, city, profession,
# role in the demo, days since joining (<3 → "new" badge), reserve (held back for /demo/new-profile).
BRIEFS: list[dict] = [
    # --- Women (Arjun's pool). Arjun: 24–30, Kolkata/Bangalore, never married, dealbreaker: smoking.
    dict(gender="female", age=26, city="Bangalore", profession="Data Scientist",
         role="Strong fit for a family-oriented software engineer moving to Bangalore, but prefers a nuclear family from day one (worth exploring). Open to relocate: no; seeks Bangalore."),
    dict(gender="female", age=27, city="Kolkata", profession="Resident Doctor", days=1,
         role="Good fit on values and family; very long hospital hours; wants to stay in Kolkata long term (location tension). Accepts partners in Kolkata or Bangalore."),
    dict(gender="female", age=25, city="Pune", profession="Chartered Accountant",
         role="Moderate fit; quite traditional and religious, wants a partner who does daily puja. Open to relocate."),
    dict(gender="female", age=28, city="Bangalore", profession="Marketing Manager",
         role="Great lifestyle and values fit, BUT she smokes socially and is unapologetic about it (should trigger a smoking dealbreaker). Mention smoking explicitly in a lifestyle aspect."),
    dict(gender="female", age=26, city="Bangalore", profession="Startup Founder",
         role="Moderate fit; plans to move to Berlin within two years; her dealbreaker: will never live with in-laws, even briefly."),
    dict(gender="female", age=29, city="Mumbai", profession="Corporate Lawyer",
         role="Moderate fit; workaholic, values independence; open to relocate to Bangalore."),
    dict(gender="female", age=24, city="Kolkata", profession="School Teacher",
         role="Warm, family-oriented, less career-driven; decent fit. Accepts Kolkata or Bangalore."),
    dict(gender="female", age=34, city="Delhi", profession="IAS Officer",
         role="HARD-FILTER FAIL: age 34 is outside a 24–30 range. Seeks partners aged 32–40 in Delhi only."),
    dict(gender="female", age=27, city="Hyderabad", profession="Architect",
         role="HARD-FILTER FAIL on location: lives in Hyderabad, not open to relocate, seeks Hyderabad only."),
    dict(gender="female", age=28, city="Bangalore", profession="Software Engineer",
         role="HARD-FILTER FAIL: divorced (marital_status 'divorced'); open to never-married or divorced partners."),
    dict(gender="female", age=26, city="Bangalore", profession="Nutritionist",
         role="HARD-FILTER FAIL in the other direction: strict vegetarian and requires a vegetarian partner (hard_criteria.diet='veg')."),
    # --- Men (Meera's pool). Meera: 26–32, Bangalore only, never married, dealbreakers: career sacrifice, smoking.
    dict(gender="male", age=29, city="Bangalore", profession="Product Manager",
         role="Good fit; ambitious and supportive of a working partner; parents in Chennai, lives alone."),
    dict(gender="male", age=30, city="Bangalore", profession="Orthopaedic Surgeon",
         role="Good fit; long hours; traditional joint family that expects the couple to visit every weekend."),
    dict(gender="male", age=28, city="Bangalore", profession="Sound Engineer",
         role="Creative, strong interest overlap with a designer; irregular income (worth exploring)."),
    dict(gender="male", age=31, city="Bangalore", profession="Investment Banker",
         role="Strong on paper, BUT expects his wife to step back from her career once they have kids (should trigger a career dealbreaker for an ambitious woman). Say this explicitly in partner_expectations."),
    dict(gender="male", age=27, city="Bangalore", profession="EV Engineer", days=2,
         role="Outdoorsy hiker; quiet, avoids conflict and tends to go silent in disagreements (worth exploring)."),
    dict(gender="male", age=33, city="Mumbai", profession="Chartered Accountant",
         role="HARD-FILTER FAIL: age 33 and lives in Mumbai, not open to relocate."),
    dict(gender="male", age=29, city="Delhi", profession="Civil Servant",
         role="HARD-FILTER FAIL on location: Delhi only, not open to relocate."),
    dict(gender="male", age=30, city="Chennai", profession="Data Engineer",
         role="Decent fit; open to relocate to Bangalore; reserved but thoughtful."),
    dict(gender="male", age=28, city="Bangalore", profession="Chef",
         role="Warm and fun, BUT a regular smoker (should trigger a smoking dealbreaker). Mention smoking explicitly in a lifestyle aspect."),
    # --- Reserves for "someone just joined" (/demo/new-profile)
    dict(gender="female", age=27, city="Bangalore", profession="UX Researcher", reserve=True,
         role="Very strong fit for a family-oriented software engineer moving to Bangalore; warm with elders, ambitious, hikes. Should rank near the top."),
    dict(gender="male", age=29, city="Bangalore", profession="Architect", reserve=True,
         role="Very strong fit for an ambitious product designer in Bangalore; proud of a partner's career, hikes, talks things through."),
]

EXTRA_CITIES = ["Bangalore", "Kolkata", "Pune", "Mumbai", "Hyderabad", "Chennai", "Delhi", "Ahmedabad"]
EXTRA_PROFESSIONS = ["Software Engineer", "Doctor", "Teacher", "Consultant", "Designer", "Banker",
                     "Civil Engineer", "Pharmacist", "Journalist", "Entrepreneur", "Researcher"]


def _extra_brief(i: int) -> dict:
    r = random.Random(i)
    return dict(gender=r.choice(["male", "female"]), age=r.randint(24, 33),
                city=r.choice(EXTRA_CITIES), profession=r.choice(EXTRA_PROFESSIONS),
                role="An ordinary, realistic profile with a mix of strengths and quirks.")


GEN_SYSTEM = """You create realistic, fictional Indian matrimonial profiles for a demo of an AI matchmaker.
Rules:
- Fictional people only. Realistic Indian full names from varied regions. No real or famous people.
- Never mention caste or community; leave self_facts.community and hard_criteria.community_pref null.
- Aspects read like what a matchmaker learned in a warm intake chat. `evidence` is a short first-person
  quote in natural Indian English (light Hinglish is fine). `statement` is a third-person summary.
- 10–13 aspects covering at least 9 of the 11 categories, always including dealbreakers and partner_expectations.
- Visibility mix: ~60% public, ~30% agent_only (sensitive but useful: dealbreakers, expectations),
  1–2 private (personal things only for their own matching, e.g. finances, past relationships, health).
- preference_weights: six floats summing to 1.0 that reflect what this person cares about.
- education is one of: bachelors, masters, doctorate. income_band like "10-20L", "20-30L", "30-50L".
- diet one of: veg, non_veg, eggetarian, vegan. hard_criteria.diet is "any" unless the brief says otherwise.
- Follow the demo brief exactly — it is what makes the demo work."""


async def _generate_one(brief: dict, sem: asyncio.Semaphore) -> dict:
    seeking = "male" if brief["gender"] == "female" else "female"
    prompt = (
        f"Create one profile.\nGender: {brief['gender']} (seeking {seeking})\nAge: {brief['age']}\n"
        f"City: {brief['city']}\nProfession: {brief['profession']}\nDemo brief: {brief['role']}"
    )
    async with sem:
        p = await generate_json(prompt, GeneratedProfile, system=GEN_SYSTEM, tier="smart", temperature=1.0)
    data = p.model_dump()
    # Enforce the brief's hard facts — the LLM doesn't get to drift on these.
    data["self_facts"].update(age=brief["age"], city=brief["city"], profession=brief["profession"])
    data["self_facts"]["community"] = None
    data["hard_criteria"]["community_pref"] = None
    data.update(gender=brief["gender"], seeking_gender=seeking, days_ago=brief.get("days", 20),
                reserve=brief.get("reserve", False), brief=brief["role"])
    return data


CITY_ALIASES = {"bengaluru": "Bangalore", "bombay": "Mumbai", "calcutta": "Kolkata", "gurugram": "Gurgaon"}


def _city(c: str) -> str:
    return CITY_ALIASES.get(c.strip().lower(), c.strip())


def _snake(v: str | None) -> str | None:
    return re.sub(r"[\s-]+", "_", v.strip().lower()) if isinstance(v, str) else v


def normalize(p: dict) -> dict:
    """Canonicalise LLM output so the deterministic hard filter compares like with like."""
    f, h = p["self_facts"], p["hard_criteria"]
    f["city"] = _city(f["city"])
    f["marital_status"] = _snake(f.get("marital_status"))
    f["diet"] = _snake(f.get("diet"))
    f["education"] = _snake(f.get("education"))
    h["cities"] = list(dict.fromkeys(_city(c) for c in h.get("cities", []) if c.lower() not in {"any", "anywhere"}))
    h["marital_status"] = [_snake(s) for s in h.get("marital_status", [])] or ["never_married"]
    h["diet"] = _snake(h.get("diet")) or "any"
    h["education_min"] = _snake(h.get("education_min"))
    return p


def rename(p: dict, new_name: str) -> dict:
    """Swap a profile's name everywhere it appears (aspects often mention the first name)."""
    old_parts, new_parts = p["name"].split(), new_name.split()
    pairs = [(p["name"], new_name), (old_parts[0], new_parts[0])]
    if len(old_parts) > 1 and len(new_parts) > 1:
        pairs.append((old_parts[-1], new_parts[-1]))
    text = json.dumps({k: v for k, v in p.items() if k in ("bio_note", "aspects")}, ensure_ascii=False)
    for old, new in pairs:
        text = text.replace(old, new)
    p.update(json.loads(text), name=new_name)
    return p


def assign_ids(profiles: list[dict]) -> None:
    for i, p in enumerate(profiles):
        slug = re.sub(r"[^a-z]", "", p["name"].split()[0].lower())
        p["id"] = f"s{i + 1:02d}_{slug}"


async def generate(count: int) -> None:
    existing = json.loads(PROFILES_FILE.read_text()) if PROFILES_FILE.exists() else []
    briefs = BRIEFS + [_extra_brief(i) for i in range(max(0, count + 2 - len(BRIEFS)))]
    todo = briefs[len(existing) : count + 2]
    log.info("generating %d profiles (%d already exist)", len(todo), len(existing))
    sem = asyncio.Semaphore(6)
    new = await asyncio.gather(*[_generate_one(b, sem) for b in todo])
    profiles = existing + [normalize(p) for p in new]
    taken = {p["name"].split()[0] for p in existing} | {"Arjun", "Meera"}
    for p in profiles[len(existing):]:
        if p["name"].split()[0] in taken:
            log.warning("duplicate first name %s (%s) — rename it in profiles.json", p["name"], p["brief"][:40])
        taken.add(p["name"].split()[0])
    assign_ids(profiles)
    PROFILES_FILE.write_text(json.dumps(profiles, indent=2, ensure_ascii=False, sort_keys=True))
    log.info("wrote %d profiles to %s", len(profiles), PROFILES_FILE)


# ---------- Loading into Firestore ----------

def _load_fixtures(count: int) -> tuple[list[dict], list[dict]]:
    heroes = json.loads(HEROES_FILE.read_text())
    profiles = json.loads(PROFILES_FILE.read_text()) if PROFILES_FILE.exists() else []
    world = [p for p in profiles if not p.get("reserve")][:count]
    reserves = [p for p in profiles if p.get("reserve")]
    return heroes + world, reserves


async def _write_profiles(profiles: list[dict]) -> None:
    db = get_db()
    vectors = await embed_profiles([(p["self_facts"], p["aspects"]) for p in profiles])
    t = now()
    batch, ops = db.batch(), 0
    for p, (emb, emb_self) in zip(profiles, vectors):
        joined = t - timedelta(days=p.get("days_ago", 20))
        user = m.User(
            id=p["id"], name=p["name"], gender=p["gender"], seeking_gender=p["seeking_gender"],
            status="active", is_seed=True, self_facts=p["self_facts"], hard_criteria=p["hard_criteria"],
            preference_weights=p["preference_weights"], intake_completeness=0.9,
            created_at=joined, last_active_at=t,
        ).model_dump()
        ref = db.collection(USERS).document(p["id"])
        batch.set(ref, {**user, "embedding": emb, "embedding_self": emb_self, "bio_note": p.get("bio_note")})
        ops += 1
        for i, a in enumerate(p["aspects"]):
            batch.set(ref.collection("aspects").document(f"a{i + 1:02d}"),
                      {**a, "source": "intake", "created_at": joined})
            ops += 1
        if ops > 400:
            batch.commit()
            batch, ops = db.batch(), 0
    batch.commit()


async def seed_world(count: int = 20) -> int:
    profiles, _ = _load_fixtures(count)
    await _write_profiles(profiles)
    return len(profiles)


def wipe_all() -> None:
    db = get_db()
    for name in (USERS, MATCHES, JOBS):
        delete_tree(db.collection(name))


def _strip_times(d: dict) -> dict:
    return {k: v for k, v in d.items() if not k.endswith("_at")}


def dump_matches() -> dict:
    """Serialise all matches (+ subcollections) for the precomputed file. Timestamps are dropped
    and re-stamped at load time."""
    out = {}
    for snap in get_db().collection(MATCHES).stream():
        doc = _strip_times(snap.to_dict())
        doc["_sub"] = {sub.id: {d.id: _strip_times(d.to_dict()) for d in sub.stream()}
                       for sub in snap.reference.collections()}
        out[snap.id] = doc
    return out


def load_precomputed() -> int:
    if not PRECOMPUTED_FILE.exists():
        return 0
    data = json.loads(PRECOMPUTED_FILE.read_text())
    db, t = get_db(), now()
    batch, ops = db.batch(), 0
    for mid, doc in data.get("matches", {}).items():
        subs = doc.pop("_sub", {})
        ref = db.collection(MATCHES).document(mid)
        batch.set(ref, {**doc, "created_at": t, "updated_at": t})
        for sub, docs in subs.items():
            for did, d in docs.items():
                batch.set(ref.collection(sub).document(did), {**d, "created_at": t})
                ops += 1
        ops += 1
        if ops > 400:
            batch.commit()
            batch, ops = db.batch(), 0
    batch.commit()
    return len(data.get("matches", {}))


async def reset_world(count: int = 20) -> int:
    wipe_all()
    n = await seed_world(count)
    load_precomputed()
    return n


def soft_reset() -> int:
    """Fast demo reset (~2 s): restore all matches from the pre-computed file and put the heroes back to their
    starting state (weights, no learned aspects / learning history, not in a Focus Week). Profiles and
    embeddings are kept — use `reset_world` to reseed everything."""
    db = get_db()
    delete_tree(db.collection(MATCHES))
    n = load_precomputed()
    heroes = {h["id"]: h for h in json.loads(HEROES_FILE.read_text())}
    for snap in db.collection(USERS).where("status", "in", ["in_focus", "locked"]).stream():
        snap.reference.update({"status": "active", "active_match_id": None})
    for uid, h in heroes.items():
        ref = db.collection(USERS).document(uid)
        ref.update({"status": "active", "active_match_id": None, "preference_weights": h["preference_weights"]})
        delete_tree(ref.collection("learning_log"))
        for a in ref.collection("aspects").where("source", "==", "learned").stream():
            a.reference.delete()
    return n


HERO_MATCH = ("arjun", "meera")  # (requester, candidate) for the pre-computed interview


async def precompute(count: int = 20, fresh: bool = False) -> None:
    """Run the heroes' scouts and the Arjun–Meera interview for real, then freeze the results into
    seed/precomputed.json. Keeps existing frozen scout scores unless `fresh` (scores drift run to run)."""
    from app.services.focus import generate_deck  # these depend on seeded data, not vice versa
    from app.services.interview import run_interview
    from app.services.matching import match_id, scout

    wipe_all()
    await seed_world(count)
    if fresh or not load_precomputed():
        for hero in HERO_IDS:
            r = await scout(hero, lambda msg: log.info("%s: %s", hero, msg))
            log.info("%s → top %s, excluded %s", hero, r["top"], [e["name"] for e in r["excluded_dealbreakers"]])
    requester, cand = HERO_MATCH
    r = await run_interview(match_id(requester, cand), requester, None, lambda msg: log.info("interview: %s", msg))
    log.info("interview → %s", r)
    await generate_deck(match_id(requester, cand))
    PRECOMPUTED_FILE.write_text(json.dumps({"matches": dump_matches()}, indent=2, ensure_ascii=False, sort_keys=True))
    log.info("wrote %s", PRECOMPUTED_FILE)


async def precompute_deck() -> None:
    """Add the hero Focus Week deck to the frozen file without re-running the interview."""
    from app.services.focus import generate_deck
    from app.services.matching import match_id

    soft_reset()
    deck = await generate_deck(match_id(*HERO_MATCH))
    log.info("deck → %s", deck)
    PRECOMPUTED_FILE.write_text(json.dumps({"matches": dump_matches()}, indent=2, ensure_ascii=False, sort_keys=True))


async def add_reserve_profile() -> dict | None:
    """'Someone just joined' — load the next held-back reserve profile with a `new` badge."""
    _, reserves = _load_fixtures(0)
    db = get_db()
    for p in reserves:
        if not db.collection(USERS).document(p["id"]).get().exists:
            await _write_profiles([{**p, "days_ago": 0}])
            return p
    return None


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["generate", "load", "precompute", "deck"])
    ap.add_argument("--count", type=int, default=20)
    ap.add_argument("--fresh", action="store_true", help="precompute: re-run scouts instead of keeping frozen scores")
    args = ap.parse_args()
    if args.cmd == "generate":
        asyncio.run(generate(args.count))
    elif args.cmd == "precompute":
        asyncio.run(precompute(args.count, args.fresh))
    elif args.cmd == "deck":
        asyncio.run(precompute_deck())
    else:
        print("loaded", asyncio.run(reset_world(args.count)))
