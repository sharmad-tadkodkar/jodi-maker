"""Phase 4: interview + brief + mutual-consent visibility, against the pre-computed hero match.
NOTE: resets the shared demo data. Live interview runs (~2 min) are exercised via the precompute
command and manual runs, not here."""
from fastapi.testclient import TestClient

from app.db import USERS, get_db
from app.main import app

client = TestClient(app)
MID = "m_arjun__meera"


def test_reset_and_interview_transcript():
    assert client.post("/demo/reset", json={"count": 20}).status_code == 200
    iv = client.get(f"/matches/{MID}/interview").json()
    assert iv["status"] == "done"
    assert len(iv["turns"]) == 12 and {t["round"] for t in iv["turns"]} == {1, 2, 3}
    assert [t["turn_index"] for t in iv["turns"]] == list(range(12))
    assert any(t["highlight"] == "green" for t in iv["turns"])
    assert len(iv["round_summaries"]) == 3
    assert iv["turns"][0]["speaker_name"] == "Arjun's matchmaker"


def test_private_aspects_never_leak():
    iv = client.get(f"/matches/{MID}/interview").json()
    brief = client.get(f"/matches/{MID}/brief/arjun").json()
    blob = (" ".join(t["text"] for t in iv["turns"]) + str(brief)).lower()
    for uid, words in (("arjun", ["loan", "sends money"]), ("meera", ["four years", "relationship ended"])):
        privates = [a.to_dict()["statement"] for a in get_db().collection(USERS).document(uid)
                    .collection("aspects").where("visibility", "==", "private").stream()]
        assert privates, f"{uid} should have private aspects"
        assert not [w for w in words if w in blob], f"private detail of {uid} leaked"


def test_brief_and_mutual_consent_visibility():
    b = client.get(f"/matches/{MID}/brief/arjun").json()
    assert b["candidate"]["display_name"] == "Meera S."
    assert len(b["why_fit"]) == 6 and 2 <= len(b["green_flags"]) <= 4
    assert 3 <= len(b["questions_only_you"]) <= 5 and b["family_fit"]
    assert b["compatibility"] > 80
    # Meera's brief exists but stays hidden until Arjun says Interested (spec §4.5).
    assert client.get(f"/matches/{MID}/brief/meera").status_code == 404
    assert client.get("/briefs/next/meera").json() is None
    assert client.get("/briefs/next/arjun").json()["match_id"] == MID
    assert client.get(f"/matches/{MID}/brief/s07_riya").status_code == 404  # not in the match


def test_interview_job_is_instant_when_cached():
    job = client.post(f"/matches/{MID}/interview", headers={"X-User-Id": "arjun"}).json()["job_id"]
    j = client.get(f"/jobs/{job}").json()
    assert j["status"] == "done" and j["result"]["cached"] is True
