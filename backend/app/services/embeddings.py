"""Profile embeddings (spec §4.2 Semantic match).

Two vectors per user:
- `embedding`      — public + agent_only aspects. What *other* users are matched against.
- `embedding_self` — all aspects incl. private. Used only as *my own* query vector.
"""
from app.llm.gemini import embed


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


async def embed_profiles(profiles: list[tuple[dict, list[dict]]]) -> list[tuple[list[float], list[float]]]:
    """Batch-embed many (self_facts, aspects) profiles → [(embedding, embedding_self), ...]."""
    texts: list[str] = []
    for facts, aspects in profiles:
        texts += [profile_text(facts, aspects, False), profile_text(facts, aspects, True)]
    vecs: list[list[float]] = []
    for i in range(0, len(texts), 100):  # stay well under per-request limits
        vecs += await embed(texts[i : i + 100])
    return [(vecs[i], vecs[i + 1]) for i in range(0, len(vecs), 2)]
