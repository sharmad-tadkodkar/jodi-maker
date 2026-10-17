"""Phase 3: hard filter (pure), precomputed pipeline after reset, re-rank on weight change.
Runs on the test_ collections (see conftest.py)."""
from fastapi.testclient import TestClient

from app.db import USERS, get_db
from app.main import app
from app.services.matching import hard_filter, overall

client = TestClient(app)


def _u(uid, gender, age, city, *, relocate=False, crit=None, **facts):
    return {"id": uid, "gender": gender, "seeking_gender": "female" if gender == "male" else "male",
            "status": "active", "embedding": [1.0],
            "self_facts": {"age": age, "city": city, "marital_status": "never_married", **facts},
            "hard_criteria": {"age_min": 21, "age_max": 40, "open_to_relocate": relocate, **(crit or {})}}


def test_hard_filter_is_bidirectional():
    me = _u("a", "male", 28, "Kolkata", relocate=True, crit={"cities": ["Bangalore"]}, diet="non_veg")
    ok = _u("b", "female", 27, "Bangalore", crit={"cities": ["Bangalore"]})
    assert hard_filter(me, ok) == (True, "")  # I'm in Kolkata but open to relocate
    veg_only = _u("c", "female", 27, "Bangalore", crit={"diet": "veg"}, diet="veg")
    assert hard_filter(me, veg_only)[1].startswith("their filter: diet")
    too_old = _u("d", "female", 35, "Bangalore")
    me["hard_criteria"]["age_max"] = 30
    assert hard_filter(me, too_old)[1].startswith("my filter: age")
    divorced = _u("e", "female", 27, "Bangalore", marital_status="divorced")
    me["hard_criteria"]["marital_status"] = ["never_married"]
    assert "marital" in hard_filter(me, divorced)[1]
    busy = {**ok, "status": "in_focus"}
    assert not hard_filter(me, busy)[0]
    same_gender = _u("f", "male", 27, "Bangalore")
    assert not hard_filter(me, same_gender)[0]


def test_overall_uses_weights():
    dims = {"values": 100, "family_fit": 0, "lifestyle": 0, "career": 0, "location": 0, "communication": 0}
    assert overall(dims, {"values": 1, "family_fit": 0, "lifestyle": 0, "career": 0, "location": 0, "communication": 0}) == 100
    assert round(overall(dims, None), 1) == round(100 / 6, 1)


def test_reset_loads_precomputed_pipeline_and_reranks():
    assert client.post("/demo/reset", json={"count": 20}).status_code == 200
    for hero, other in (("arjun", "meera"), ("meera", "arjun")):
        p = client.get(f"/pipeline/{hero}").json()
        assert p["count"] >= 4 and not p["paused"]
        assert p["items"][0]["candidate"]["user_id"] == other  # heroes are each other's #1
        assert all(i["status"] != "closed" for i in p["items"])
        assert all(i["scores"]["reasons"].get("values") for i in p["items"])

    # Learning-loop precondition: weights change → order changes, no Gemini call needed.
    before = [i["match_id"] for i in client.get("/pipeline/arjun").json()["items"]]
    ref = get_db().collection(USERS).document("arjun")
    original = ref.get().to_dict()["preference_weights"]
    ref.update({"preference_weights": {"values": 0, "family_fit": 0, "lifestyle": 0, "career": 0,
                                       "location": 0, "communication": 1}})
    after = [i["match_id"] for i in client.get("/pipeline/arjun").json()["items"]]
    ref.update({"preference_weights": original})
    assert before != after


def test_scout_job_reuses_cached_scores():
    job = client.post("/scout/arjun").json()["job_id"]
    result = client.get(f"/jobs/{job}").json()  # TestClient runs background tasks before returning
    assert result["status"] == "done", result
    assert result["result"]["passed_filter"] >= 5
    assert result["result"]["queue_size"] >= 4
