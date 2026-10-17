"""Phase 6: demo panel endpoints. Runs on the test_ collections (see conftest.py)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
MID = "m_arjun__meera"


def test_soft_reset_and_state():
    assert client.post("/demo/reset?soft=true").status_code == 200
    st = client.get("/demo/state").json()
    assert st["hero_match_status"] == "briefed" and st["profiles"] >= 22
    arjun = next(h for h in st["heroes"] if h["user_id"] == "arjun")
    assert arjun["status"] == "active" and arjun["next_brief_match_id"] == MID and arjun["queue_size"] >= 3


def test_pass_releases_precomputed_next_brief():
    """Video beat: Pass/Stop → learning → next brief appears instantly (Arjun's #2 is pre-computed)."""
    client.post("/demo/reset?soft=true")
    r = client.post(f"/matches/{MID}/decision", json={"user_id": "arjun", "decision": "pass", "reason": "location"})
    assert r.status_code == 200
    nxt = client.get("/briefs/next/arjun").json()
    assert nxt and nxt["match_id"] == "m_arjun__s07_riya" and nxt["candidate"]["display_name"].startswith("Riya")


def test_focus_state_in_demo_panel():
    client.post("/demo/reset?soft=true")
    client.post(f"/matches/{MID}/decision", json={"user_id": "arjun", "decision": "interested"})
    client.post("/demo/simulate-response", json={"match_id": MID, "user_id": "meera", "decision": "interested"})
    client.post("/demo/fast-forward", json={"match_id": MID, "day": 4})
    st = client.get("/demo/state").json()
    assert st["hero_match_status"] == "focus_week"
    assert all(h["status"] == "in_focus" and h["focus_day"] == 4 for h in st["heroes"])
    client.post("/demo/reset?soft=true")


def test_new_profile_shows_up_in_scout():
    client.post("/demo/reset?soft=true")
    before = client.get("/demo/state").json()["reserves_left"]
    p = client.post("/demo/new-profile")
    if p.status_code == 409:  # both reserves used in an earlier run — full reset restores them
        client.post("/demo/reset", json={"count": 20})
        p = client.post("/demo/new-profile")
        before = 2
    new = p.json()
    assert new["is_new"] is True
    assert client.get("/demo/state").json()["reserves_left"] == before - 1
    hero = "arjun" if new["user_id"] == "s21_niharika" else "meera"
    job = client.post(f"/scout/{hero}").json()["job_id"]  # TestClient runs the background task before returning
    assert client.get(f"/jobs/{job}").json()["status"] == "done"
    items = client.get(f"/pipeline/{hero}").json()["items"]
    assert new["user_id"] in [i["candidate"]["user_id"] for i in items]
    assert next(i for i in items if i["candidate"]["user_id"] == new["user_id"])["candidate"]["is_new"]
