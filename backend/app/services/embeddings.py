"""Profile embeddings (spec §4.2 Semantic match).

Two vectors per user:
- `embedding`      — public + agent_only aspects. What *other* users are matched against.
- `embedding_self` — all aspects incl. private. Used only as *my own* query vector.
"""
from app.db import USERS, get_db
from app.llm.gemini import embed
from app.services.users import get_user_doc, list_aspects


def profile_text(self_facts: dict, aspects: list[dict], include_private: bool) -> str:
    f = self_facts or {}
    lines = [
        f"{f.get('age', '')}-year-old {f.get('profession', '')} in {f.get('city', '')}; "
        f"education {f.get('education', '')}; diet {f.get('diet', '')}."
    ]
    for a in sorted(aspects, key=lambda a: a["category"]):
        if a.get("visibility") == "private" and not include_private:
            continue
        lines.append(f"{a['category']}: {a['statement']}")
    return "\n".join(lines)


async def refresh_user_embeddings(user_id: str) -> None:
    """Re-embed one user after their aspects or facts change (intake turn, edit, delete)."""
    user = get_user_doc(user_id)
    aspects = list_aspects(user_id)
    if not aspects:
        get_db().collection(USERS).document(user_id).update({"embedding": None, "embedding_self": None})
        return
    [(emb, emb_self)] = await embed_profiles([(user.get("self_facts") or {}, aspects)])
    get_db().collection(USERS).document(user_id).update({"embedding": emb, "embedding_self": emb_self})


async def embed_profiles(profiles: list[tuple[dict, list[dict]]]) -> list[tuple[list[float], list[float]]]:
    """Batch-embed many (self_facts, aspects) profiles → [(embedding, embedding_self), ...]."""
    texts: list[str] = []
    for facts, aspects in profiles:
        texts += [profile_text(facts, aspects, False), profile_text(facts, aspects, True)]
    vecs = await embed(texts)  # batched + concurrent inside embed()
    return [(vecs[i], vecs[i + 1]) for i in range(0, len(vecs), 2)]
