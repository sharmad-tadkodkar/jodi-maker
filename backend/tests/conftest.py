"""Tests run against `test_`-prefixed Firestore collections (test_users, test_matches, test_jobs), so they never
touch the live demo data the frontend and the video use. Set before any `app` import."""
import asyncio
import os

os.environ["COLLECTION_PREFIX"] = "test_"

import pytest  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def seeded_test_world():
    from app.db import USERS, get_db
    from app.services.seed import reset_world

    if not get_db().collection(USERS).document("arjun").get().exists:
        asyncio.run(reset_world(20))
