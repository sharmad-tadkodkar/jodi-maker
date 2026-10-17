"""Phase 1: seeded world. NOTE: resets the shared Firestore demo data."""
import json

from fastapi.testclient import TestClient

from app.db import USERS, get_db
from app.main import app
from app.services.seed import PROFILES_FILE

client = TestClient(app)


def test_reset_loads_heroes_and_world():
    r = client.post("/demo/reset", json={"count": 20})
    assert r.status_code == 200, r.text
    users = {s.id: s.to_dict() for s in get_db().collection(USERS).stream()}
    assert len(users) == 22  # 20 + Arjun + Meera; reserves held back
    for u in users.values():
        assert len(u["embedding"]) == 768 and len(u["embedding_self"]) == 768
        assert u["hard_criteria"].get("community_pref") is None  # never seeded/inferred
    arjun = client.get("/users/arjun").json()
    assert arjun["name"] == "Arjun Mehta" and "embedding" not in arjun  # vectors never leave the API


def test_world_has_every_aspect_visibility():
    profiles = json.loads(PROFILES_FILE.read_text())
    vis = {a["visibility"] for p in profiles for a in p["aspects"]}
    assert vis == {"public", "agent_only", "private"}
    assert all(any(a["category"] == "dealbreakers" for a in p["aspects"]) for p in profiles)


def test_personas_and_new_profile():
    names = [p["name"] for p in client.get("/demo/personas").json()]
    assert names[:2] == ["Arjun Mehta", "Meera Sen"]
    joined = client.post("/demo/new-profile").json()
    assert joined["is_new"] is True
    client.post("/demo/new-profile")
    assert client.post("/demo/new-profile").status_code == 409  # both reserves used


def test_create_onboarding_user():
    u = client.post("/users", json={"name": "Test User", "gender": "female"}).json()
    assert u["status"] == "onboarding" and u["seeking_gender"] == "male"
    get_db().collection(USERS).document(u["id"]).delete()
