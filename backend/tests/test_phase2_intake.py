"""Phase 2: intake chat + 'What my matchmaker knows' endpoints. Uses a throwaway user."""
import pytest
from fastapi.testclient import TestClient

from app.db import USERS, delete_tree, get_db
from app.main import app

client = TestClient(app)


@pytest.fixture
def user():
    u = client.post("/users", json={"name": "Priyanka Test", "gender": "female"}).json()
    yield u
    delete_tree(get_db().collection(USERS).document(u["id"]))


def test_intake_turn_extracts_with_evidence(user):
    uid = user["id"]
    opening = client.get(f"/intake/{uid}/messages").json()
    assert len(opening) == 1 and opening[0]["role"] == "agent"

    r = client.post(f"/intake/{uid}/message", json={"text": (
        "I'm 27, a pediatrician in Pune, and I live with my parents and grandmother. "
        "Ideally I'd love someone who enjoys trekking. I absolutely won't consider anyone who smokes."
    )}).json()
    assert r["reply"] and "?" in r["reply"]
    assert 0 < r["completeness"] < 1
    cats = {a["category"] for a in r["new_aspects"]}
    assert "family_structure" in cats and "dealbreakers" in cats
    assert all(a["evidence"] for a in r["new_aspects"])
    dealbreaker = next(a for a in r["new_aspects"] if a["category"] == "dealbreakers")
    assert dealbreaker["visibility"] != "public"  # screening info, not for display

    me = client.get(f"/users/{uid}").json()
    assert me["self_facts"]["age"] == 27 and me["self_facts"]["city"] == "Pune"
    assert me["hard_criteria"].get("community_pref") is None
    assert len(client.get(f"/intake/{uid}/messages").json()) == 3  # opening, user, reply


def test_me_page_edits(user):
    uid = user["id"]
    ref = get_db().collection(USERS).document(uid).collection("aspects").document("x1")
    ref.set({"category": "values", "statement": "Values honesty.", "evidence": "\"honesty\"",
             "confidence": 0.9, "visibility": "public", "source": "intake"})

    a = client.patch(f"/users/{uid}/aspects/x1", json={"visibility": "private", "statement": "Values honesty a lot."}).json()
    assert a["visibility"] == "private" and a["statement"] == "Values honesty a lot."
    assert client.get(f"/users/{uid}/aspects").json()[0]["visibility"] == "private"

    u = client.patch(f"/users/{uid}/hard-criteria", json={"age_min": 28, "cities": ["Pune", "Mumbai"]}).json()
    assert u["hard_criteria"]["age_min"] == 28 and u["hard_criteria"]["cities"] == ["Pune", "Mumbai"]
    assert u["hard_criteria"]["age_max"] == 40  # untouched fields survive

    assert client.delete(f"/users/{uid}/aspects/x1").status_code == 200
    assert client.get(f"/users/{uid}/aspects").json() == []
    assert client.patch(f"/users/{uid}/aspects/x1", json={"visibility": "public"}).status_code == 404


def test_wipe_everything(user):
    uid = user["id"]
    client.get(f"/intake/{uid}/messages")
    get_db().collection(USERS).document(uid).collection("aspects").document("y").set(
        {"category": "values", "statement": "s", "evidence": "e", "confidence": 1, "visibility": "public"})
    assert client.delete(f"/users/{uid}/data").status_code == 200
    assert client.get(f"/users/{uid}/aspects").json() == []
    assert client.get(f"/users/{uid}").json()["intake_completeness"] == 0
    assert client.get(f"/users/{uid}/learning").json() == []
