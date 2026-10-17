"""Phase 5: mutual consent → Focus Week → Day-7 decision, learning loop, fairness.
Runs on the test_ collections (see conftest.py) (soft reset: matches + hero state; profiles kept)."""
from fastapi.testclient import TestClient

from app.db import MATCHES, USERS, get_db
from app.main import app
from app.services.learning import clamp_weights

client = TestClient(app)
MID = "m_arjun__meera"


def soft_reset():
    assert client.post("/demo/reset?soft=true").status_code == 200


def user(uid):
    return client.get(f"/users/{uid}").json()


def mutual():
    soft_reset()
    assert client.post(f"/matches/{MID}/decision", json={"user_id": "arjun", "decision": "interested"}).status_code == 200
    r = client.post("/demo/simulate-response", json={"match_id": MID, "user_id": "meera", "decision": "interested"})
    assert r.status_code == 200 and r.json()["mutual"] is True


def test_clamp_weights():
    old = {d: 1 / 6 for d in ("values", "family_fit", "lifestyle", "career", "location", "communication")}
    new = clamp_weights(old, {**old, "family_fit": 0.9, "career": 0.0}, 0.1)
    assert abs(sum(new.values()) - 1) < 0.01
    assert new["family_fit"] > old["family_fit"] and new["career"] < old["career"]
    assert new["family_fit"] < 0.3  # clamped, not 0.9


def test_consent_order_and_mutual():
    soft_reset()
    # Meera can't see (or decide on) the brief before Arjun says Interested.
    assert client.post(f"/matches/{MID}/decision", json={"user_id": "meera", "decision": "interested"}).status_code == 409
    assert client.post(f"/matches/{MID}/decision", json={"user_id": "arjun", "decision": "pass"}).status_code == 422
    assert client.get(f"/focus/{MID}/chat", headers={"X-User-Id": "arjun"}).status_code == 403

    r = client.post(f"/matches/{MID}/decision", json={"user_id": "arjun", "decision": "interested"}).json()
    assert r["mutual"] is False and r["match"]["status"] == "awaiting_them"
    assert client.get(f"/matches/{MID}/brief/meera").status_code == 200
    assert client.get("/briefs/next/meera").json()["match_id"] == MID
    assert client.post(f"/focus/{MID}/chat", json={"sender_id": "arjun", "text": "hi"}).status_code == 403

    r = client.post(f"/matches/{MID}/decision", json={"user_id": "meera", "decision": "interested"}).json()
    assert r["mutual"] is True and r["match"]["status"] == "focus_week"
    for uid in ("arjun", "meera"):
        u = user(uid)
        assert u["status"] == "in_focus" and u["active_match_id"] == MID
        assert client.get(f"/pipeline/{uid}").json()["paused"] is True
        assert client.get(f"/briefs/next/{uid}").json() is None
    # Exclusivity: Arjun drops out of everyone else's scouting while he's in a Focus Week.
    from app.services.matching import hard_filter
    from app.services.users import get_user_doc
    ok, why = hard_filter(get_user_doc("s07_riya"), get_user_doc("arjun"))
    assert not ok and "in_focus" in why


def test_focus_week_deck_chat_and_day7():
    mutual()
    st = client.get(f"/focus/{MID}", headers={"X-User-Id": "arjun"}).json()
    assert st["day"] == 1 and st["total_days"] == 7 and len(st["deck_today"]) == 3
    assert st["partner"]["display_name"] == "Meera S."

    assert client.post(f"/focus/{MID}/chat", json={"sender_id": "arjun", "text": st["deck_today"][0]}).status_code == 200
    assert client.post(f"/focus/{MID}/chat", json={"sender_id": "meera", "text": "Great question!"}).status_code == 200
    chat = client.get(f"/focus/{MID}/chat", headers={"X-User-Id": "meera"}).json()
    assert [c["sender_id"] for c in chat] == ["arjun", "meera"]

    # Day-7 decision isn't open on day 1; stop is (but we don't stop here).
    assert client.post(f"/focus/{MID}/decision", json={"user_id": "arjun", "decision": "continue"}).status_code == 409
    ff = client.post("/demo/fast-forward", json={"match_id": MID, "day": 7}, headers={"X-User-Id": "arjun"}).json()
    assert ff["day"] == 7 and ff["deck_today"] != st["deck_today"]

    r = client.post(f"/focus/{MID}/decision", json={"user_id": "arjun", "decision": "continue"}).json()
    assert r["outcome"] == "pending" and r["learning"]["explanation"]
    them = client.get(f"/focus/{MID}", headers={"X-User-Id": "meera"}).json()
    assert them["decision_them_submitted"] is True and them["decision_me"] is None

    r = client.post(f"/focus/{MID}/decision", json={"user_id": "meera", "decision": "extend"}).json()
    assert r["outcome"] == "extended"
    st = client.get(f"/focus/{MID}", headers={"X-User-Id": "arjun"}).json()
    assert st["extended"] is True and st["total_days"] == 14 and st["decision_me"] is None

    client.post("/demo/fast-forward", json={"match_id": MID, "day": 14})
    assert client.post(f"/focus/{MID}/decision", json={"user_id": "meera", "decision": "extend"}).status_code == 409
    client.post(f"/focus/{MID}/decision", json={"user_id": "meera", "decision": "continue"})
    r = client.post(f"/focus/{MID}/decision", json={"user_id": "arjun", "decision": "continue"}).json()
    assert r["outcome"] == "locked" and r["match"]["status"] == "locked"
    assert user("arjun")["status"] == "locked" and user("meera")["status"] == "locked"


def test_stop_runs_learning_and_releases_queue():
    mutual()
    assert client.post(f"/focus/{MID}/decision", json={"user_id": "arjun", "decision": "stop"}).status_code == 422
    r = client.post(f"/focus/{MID}/decision",
                    json={"user_id": "arjun", "decision": "stop", "reason": "location"}).json()
    assert r["outcome"] == "closed" and r["match"]["closed_reason"] == "stopped"
    lr = r["learning"]
    assert lr["explanation"] and abs(sum(lr["new_weights"].values()) - 1) < 0.01
    assert all(abs(lr["new_weights"][d] - lr["old_weights"][d]) <= 0.1 + 0.02 for d in lr["old_weights"])
    for uid in ("arjun", "meera"):
        assert user(uid)["status"] == "active" and user(uid)["active_match_id"] is None
    assert client.get("/pipeline/arjun").json()["paused"] is False
    log = client.get("/users/arjun/learning").json()
    assert log and log[-1]["decision"] == "stop" and log[-1]["match_id"] == MID


def test_pass_is_quiet_and_reranks():
    soft_reset()
    r = client.post(f"/matches/{MID}/decision",
                    json={"user_id": "arjun", "decision": "pass", "reason": "family"}).json()
    assert r["match"]["status"] == "closed" and r["mutual"] is False
    lr = r["learning"]
    assert lr["new_weights"] != lr["old_weights"] and "moved_up" in lr
    assert user("arjun")["preference_weights"] == lr["new_weights"]
    assert MID not in [i["match_id"] for i in client.get("/pipeline/arjun").json()["items"]]
    # Meera never learns about the pass: no brief, nothing in her queue.
    assert client.get(f"/matches/{MID}/brief/meera").status_code == 404
    assert client.get("/briefs/next/meera").json() is None


def test_focus_week_auto_closes_when_time_runs_out():
    mutual()
    st = client.post("/demo/fast-forward", json={"match_id": MID, "day": 8}).json()
    assert st["status"] == "closed"
    assert get_db().collection(MATCHES).document(MID).get().to_dict()["closed_reason"] == "expired_no_decision"
    assert get_db().collection(USERS).document("arjun").get().to_dict()["status"] == "active"
    soft_reset()  # leave the demo in its starting state
