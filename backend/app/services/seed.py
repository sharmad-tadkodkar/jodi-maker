"""Seeded world (spec §4.9).

Profiles are generated ONCE by Gemini into `seed/profiles.json` (checked in), so demo resets are fast
and deterministic. Heroes (Arjun, Meera) are hand-tuned in `seed/heroes.json`.

    uv run python -m app.services.seed generate            # 20 profiles + 2 reserves
    uv run python -m app.services.seed generate --count 60 # scale up later (keeps existing ones)
    COLLECTION_PREFIX=pc_ uv run python -m app.services.seed interview --pair arjun s07_riya
"""
import argparse
import asyncio
import gzip
import hashlib
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, Field

from app import models as m
from app.config import get_settings
from app.db import JOBS, MATCHES, USERS, delete_tree, get_db, now
from app.llm.gemini import embed, generate_json
from app.services.embeddings import profile_text

log = logging.getLogger(__name__)
SEED_DIR = Path(__file__).resolve().parents[2] / "seed"
HEROES_FILE = SEED_DIR / "heroes.json"
PROFILES_FILE = SEED_DIR / "profiles.json"
# Hero scout results (and later interviews/briefs) computed once with real Gemini calls and loaded on
# reset, so the demo's happy path never waits on live LLM capacity. Regenerate: `... seed precompute`.
PRECOMPUTED_FILE = SEED_DIR / "precomputed.json"
EMBED_CACHE = SEED_DIR / "embeddings.json.gz"
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

# Profiles 23–62 (scale-up to 60). Designed rather than random so the bigger world stays realistic and keeps
# the demo intact: deeper, plausible queues for both heroes, nobody engineered to outrank them, and the same
# mix of friction, dealbreakers and hard-filter failures. First names are pre-assigned so they stay unique.
ROLES = {
    "ordinary": "A realistic, likeable person with a mix of strengths and quirks — a plausible but imperfect match.",
    "abroad": "Plausible fit, but plans to settle abroad (Canada/Australia) within five years.",
    "ritual": "Plausible fit; quite religious, daily puja and fasts matter, wants a partner who joins in.",
    "hometown": "Plausible fit; wants to move back to their hometown near their parents within two years.",
    "hours": "Plausible fit; works very long or irregular hours (shifts / startup) and is honest that it's hard on relationships.",
    "kids": "Plausible fit; wants children within the first year of marriage and says so clearly.",
    "joint": "Plausible fit; expects to live permanently in a joint family with parents.",
    "smoker": "Likeable, BUT smokes regularly and isn't planning to quit. Mention smoking explicitly in a lifestyle aspect.",
    "drinks": "Likeable; drinks heavily most weekends and loves the party scene. Mention it explicitly in a lifestyle aspect.",
    "quit_career": "Decent on paper, BUT expects his wife to stop working after marriage. Say this explicitly in partner_expectations.",
    "no_inlaws": "Decent on paper; her dealbreaker: will never live with in-laws, not even for a few months.",
    "divorced": "HARD-FILTER FAIL: divorced (marital_status 'divorced'); open to never-married or divorced partners.",
    "older": "HARD-FILTER FAIL: older than most seekers' ranges; seeks partners close to their own age.",
    "local_only": "HARD-FILTER FAIL on location: not open to relocate and only considers partners in their own city.",
    "veg": "HARD-FILTER FAIL the other way: strict vegetarian who requires a vegetarian partner (hard_criteria.diet='veg').",
}
EXTRA_BRIEFS: list[tuple] = [
    # (gender, first name, age, city, profession, role, days since joining)
    ("female", "Aisha", 26, "Bangalore", "Product Analyst", "ordinary", 12),
    ("female", "Bhavna", 28, "Bangalore", "HR Business Partner", "joint", 30),
    ("female", "Chitra", 25, "Kolkata", "Chartered Accountant", "ordinary", 8),
    ("female", "Deepika", 27, "Bangalore", "Cloud Architect", "abroad", 15),
    ("female", "Esha", 24, "Kolkata", "Graphic Designer", "ordinary", 2),
    ("female", "Farah", 29, "Bangalore", "Journalist", "hours", 25),
    ("female", "Gauri", 26, "Pune", "Physiotherapist", "ritual", 40),
    ("female", "Harini", 28, "Chennai", "Data Engineer", "hometown", 18),
    ("female", "Ira", 27, "Bangalore", "Brand Strategist", "drinks", 10),
    ("female", "Jasleen", 25, "Delhi", "Fashion Buyer", "ordinary", 22),
    ("female", "Kritika", 30, "Mumbai", "Investment Analyst", "kids", 35),
    ("female", "Lavanya", 26, "Hyderabad", "Pharmacist", "local_only", 28),
    ("female", "Madhuri", 28, "Bangalore", "Clinical Psychologist", "no_inlaws", 14),
    ("female", "Nandini", 24, "Kolkata", "Bank PO", "veg", 45),
    ("female", "Pallavi", 33, "Bangalore", "Engineering Manager", "older", 20),
    ("female", "Rashmi", 27, "Pune", "Civil Engineer", "ordinary", 9),
    ("female", "Shreya", 29, "Kolkata", "Professor", "divorced", 33),
    ("female", "Tara", 26, "Bangalore", "Veterinarian", "smoker", 6),
    ("female", "Urvashi", 28, "Mumbai", "Film Editor", "hours", 16),
    ("female", "Zoya", 25, "Ahmedabad", "Interior Designer", "ordinary", 1),
    ("male", "Abhishek", 30, "Bangalore", "Backend Engineer", "ordinary", 11),
    ("male", "Bharat", 32, "Bangalore", "Management Consultant", "hours", 24),
    ("male", "Chirag", 29, "Ahmedabad", "Family Business Owner", "joint", 30),
    ("male", "Dev", 28, "Bangalore", "UX Designer", "ordinary", 2),
    ("male", "Farhan", 31, "Bangalore", "Doctor", "kids", 19),
    ("male", "Gaurav", 30, "Pune", "Mechanical Engineer", "hometown", 27),
    ("male", "Harsh", 29, "Bangalore", "Sales Lead", "drinks", 13),
    ("male", "Imran", 33, "Hyderabad", "Data Scientist", "abroad", 21),
    ("male", "Jay", 27, "Mumbai", "Photographer", "ordinary", 7),
    ("male", "Kunal", 31, "Bangalore", "Chartered Accountant", "quit_career", 17),
    ("male", "Manav", 29, "Kolkata", "Journalist", "ordinary", 26),
    ("male", "Naveen", 30, "Chennai", "Robotics Engineer", "ritual", 38),
    ("male", "Omkar", 28, "Bangalore", "Musician and Teacher", "smoker", 9),
    ("male", "Pranav", 36, "Bangalore", "Startup CTO", "older", 15),
    ("male", "Rajat", 30, "Delhi", "Lawyer", "local_only", 29),
    ("male", "Sameer", 31, "Bangalore", "Product Designer", "divorced", 23),
    ("male", "Tushar", 28, "Bangalore", "Biotech Researcher", "veg", 31),
    ("male", "Uday", 32, "Kolkata", "Bank Manager", "quit_career", 42),
    ("male", "Vikram", 29, "Mumbai", "Pilot", "hours", 12),
    ("male", "Yash", 27, "Bangalore", "Game Developer", "ordinary", 3),
]


def _extra_brief(i: int) -> dict:
    gender, name, age, city, profession, role, days = EXTRA_BRIEFS[i % len(EXTRA_BRIEFS)]
    return dict(gender=gender, first_name=name, age=age, city=city, profession=profession, role=ROLES[role],
                days=days)


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
        + (f"\nFirst name: {brief['first_name']} (choose a fitting surname)" if brief.get("first_name") else "")
    )
    async with sem:
        p = await generate_json(prompt, GeneratedProfile, system=GEN_SYSTEM, tier="smart", temperature=1.0)
    data = p.model_dump()
    # Enforce the brief's hard facts — the LLM doesn't get to drift on these.
    data["self_facts"].update(age=brief["age"], city=brief["city"], profession=brief["profession"])
    if brief.get("first_name") and data["name"].split()[0] != brief["first_name"]:
        data = rename(data, f"{brief['first_name']} {data['name'].split()[-1]}")
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


def _cache_key(text: str) -> str:
    st = get_settings()
    return hashlib.sha1(f"{st.model_embedding}|{st.embedding_dim}|{text}".encode()).hexdigest()


async def _seed_vectors(profiles: list[dict]) -> list[tuple[list[float], list[float]]]:
    """Seed profiles never change, so their vectors live in seed/embeddings.json.gz (keyed by model + text hash,
    so an edited profile is simply re-embedded). Saves ~15 s per reset."""
    cache = json.loads(gzip.decompress(EMBED_CACHE.read_bytes())) if EMBED_CACHE.exists() else {}
    texts = [(profile_text(p["self_facts"], p["aspects"], False), profile_text(p["self_facts"], p["aspects"], True))
             for p in profiles]
    missing = list(dict.fromkeys(t for pair in texts for t in pair if _cache_key(t) not in cache))
    if missing:
        log.info("embedding %d seed texts not in the cache", len(missing))
        for t, v in zip(missing, await embed(missing)):
            cache[_cache_key(t)] = [round(x, 6) for x in v]
        try:
            EMBED_CACHE.write_bytes(gzip.compress(json.dumps(cache, sort_keys=True).encode(), mtime=0))
        except OSError:
            pass  # read-only deploys just embed again next time
    return [(cache[_cache_key(a)], cache[_cache_key(b)]) for a, b in texts]


async def _write_profiles(profiles: list[dict]) -> None:
    db = get_db()
    vectors = await _seed_vectors(profiles)
    t = now()
    batches, batch, ops = [], db.batch(), 0
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
        if ops > 100:  # small batches committed in parallel: the user docs carry two 768-d vectors each
            batches.append(batch)
            batch, ops = db.batch(), 0
    batches.append(batch)
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda b: b.commit(), batches))


async def seed_world(count: int = 60) -> int:
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


async def reset_world(count: int = 60) -> int:
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
    for snap in db.collection(USERS).where(filter=FieldFilter("status", "in", ["in_focus", "locked"])).stream():
        snap.reference.update({"status": "active", "active_match_id": None})
    for uid, h in heroes.items():
        ref = db.collection(USERS).document(uid)
        ref.update({"status": "active", "active_match_id": None, "preference_weights": h["preference_weights"]})
        delete_tree(ref.collection("learning_log"))
        for a in ref.collection("aspects").where(filter=FieldFilter("source", "==", "learned")).stream():
            a.reference.delete()
    return n


HERO_MATCH = ("arjun", "meera")  # (requester, candidate) for the pre-computed interview


async def precompute(count: int = 60, fresh: bool = False) -> None:
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


async def rescout_heroes(count: int) -> None:
    """After scaling the world: load all `count` profiles + the frozen matches, re-run both heroes' scouts (cached
    pairs keep their scores, so only new candidates are scored; interviews/briefs/deck are untouched) and freeze
    the result. Run with COLLECTION_PREFIX=pc_ so the live demo data isn't touched."""
    from app.services.matching import pipeline, scout

    wipe_all()
    await seed_world(count)
    load_precomputed()
    for hero in HERO_IDS:
        r = await scout(hero, lambda msg: log.info("%s: %s", hero, msg))
        log.info("%s → passed %s, scored %s, excluded %s", hero, r["passed_filter"], r["scored"],
                 [e["name"] for e in r["excluded_dealbreakers"]])
        for i in pipeline(hero).items:
            log.info("   %5.1f  %-22s %s", i.scores.overall, i.candidate.display_name, i.status)
    PRECOMPUTED_FILE.write_text(json.dumps({"matches": dump_matches()}, indent=2, ensure_ascii=False, sort_keys=True))


async def precompute_deck() -> None:
    """Add the hero Focus Week deck to the frozen file without re-running the interview."""
    from app.services.focus import generate_deck
    from app.services.matching import match_id

    soft_reset()
    deck = await generate_deck(match_id(*HERO_MATCH))
    log.info("deck → %s", deck)
    PRECOMPUTED_FILE.write_text(json.dumps({"matches": dump_matches()}, indent=2, ensure_ascii=False, sort_keys=True))


async def precompute_interview(requester: str, cand: str) -> dict:
    """Freeze one more interview + briefs into the file (e.g. Arjun's #2, so the next brief after a Pass is
    instant). Run with COLLECTION_PREFIX=pc_ so the live demo data isn't touched."""
    from app.services.interview import run_interview
    from app.services.matching import match_id

    if not get_db().collection(USERS).document(requester).get().exists:
        await seed_world()
    soft_reset()
    r = await run_interview(match_id(requester, cand), requester, None, lambda msg: log.info("interview: %s", msg))
    log.info("interview → %s", r)
    PRECOMPUTED_FILE.write_text(json.dumps({"matches": dump_matches()}, indent=2, ensure_ascii=False, sort_keys=True))
    return r


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
    ap.add_argument("cmd", choices=["generate", "load", "precompute", "deck", "interview", "rescout"])
    ap.add_argument("--pair", nargs=2, metavar=("REQUESTER", "CANDIDATE"), help="interview: e.g. arjun s07_riya")
    ap.add_argument("--count", type=int, default=60)
    ap.add_argument("--fresh", action="store_true", help="precompute: re-run scouts instead of keeping frozen scores")
    args = ap.parse_args()
    if args.cmd == "generate":
        asyncio.run(generate(args.count))
    elif args.cmd == "precompute":
        asyncio.run(precompute(args.count, args.fresh))
    elif args.cmd == "rescout":
        asyncio.run(rescout_heroes(args.count))
    elif args.cmd == "interview":
        asyncio.run(precompute_interview(*args.pair))
    elif args.cmd == "deck":
        asyncio.run(precompute_deck())
    else:
        print("loaded", asyncio.run(reset_world(args.count)))
