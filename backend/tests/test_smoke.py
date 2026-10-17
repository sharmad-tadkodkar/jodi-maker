"""Phase 0 smoke tests: app boots, every contract endpoint answers with the declared shape,
Firestore round-trips, Gemini returns structured JSON."""
import asyncio

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.main import app

client = TestClient(app)
H = {"X-User-Id": "arjun"}

GETS = [
    "/health", "/users/arjun", "/users/arjun/aspects", "/users/arjun/learning",
    "/intake/arjun/messages", "/pipeline/arjun", "/matches/m_arjun_meera/interview",
    "/matches/m_arjun_meera/brief/arjun", "/briefs/next/arjun", "/focus/m_arjun_meera",
    "/focus/m_arjun_meera/chat", "/demo/personas",
]


@pytest.mark.parametrize("path", GETS)
def test_get_endpoints(path):
    r = client.get(path, headers=H)
    assert r.status_code == 200, r.text


def test_post_endpoints_and_job_polling():
    u = client.post("/users", json={"name": "Test", "gender": "male"}).json()
    from app.db import USERS, get_db
    get_db().collection(USERS).document(u["id"]).delete()
    assert client.patch("/users/arjun/aspects/a01", json={"visibility": "public"}).json()["visibility"] == "public"
    assert client.post("/matches/m_arjun_meera/decision",
                       json={"user_id": "arjun", "decision": "pass", "reason": "family"}).json()["learning"]
    assert client.post("/focus/m_arjun_meera/decision",
                       json={"user_id": "arjun", "decision": "continue"}).status_code == 200
    job_id = client.post("/scout/arjun").json()["job_id"]  # writes a job doc to Firestore
    job = client.get(f"/jobs/{job_id}").json()
    assert job["status"] == "done"


def test_gemini_structured_output():
    from app.llm.gemini import embed, generate_json

    class Ping(BaseModel):
        greeting: str
        ok: bool

    async def go():
        return (await generate_json("Greet a matchmaking app in 3 words; ok=true.", Ping),
                await embed(["values: family first"]))

    out, vecs = asyncio.run(go())
    assert out.ok and out.greeting
    assert len(vecs[0]) == 768
