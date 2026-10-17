"""Single Gemini client wrapper: retries, structured JSON output, embeddings (spec §8, §9)."""
import asyncio
import json
import random
import logging
from functools import lru_cache
from pathlib import Path
from typing import TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

from app.config import get_settings

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)
PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"


_clients: dict[int, genai.Client] = {}


def client() -> genai.Client:
    """One client per event loop — the async transport is bound to the loop that first used it
    (matters for scripts and the test client; the server runs a single loop)."""
    try:
        key = id(asyncio.get_running_loop())
    except RuntimeError:
        key = 0
    if key not in _clients:
        s = get_settings()
        _clients[key] = genai.Client(vertexai=True, project=s.gcp_project, location=s.gcp_llm_location)
    return _clients[key]


@lru_cache
def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.md").read_text()


def _thinking(tier: str) -> types.ThinkingConfig | None:
    """Fast tier (chat, extraction, moderator) runs without thinking: ~4x lower latency.
    Smart tier (scoring, interviews, briefs) keeps the model's default reasoning."""
    return types.ThinkingConfig(thinking_budget=0) if tier == "fast" else None


# Per-call cap: Vertex occasionally holds a request for 30s+ (shared capacity). Better to cut it and
# retry / fall back than to make the user wait.
CALL_TIMEOUT_S = {"fast": 8.0, "smart": 90.0}


def _models_for(tier: str) -> list[str]:
    s = get_settings()
    if tier == "smart":
        return [s.model_smart, s.model_smart_fallback]
    return [s.model_fast, s.model_fast_fallback]


async def _backoff(attempt: int, err: Exception) -> None:
    """Exponential backoff with jitter; longer on 429s (new projects have small Vertex quotas)."""
    base = 2.0 if "429" in str(err) or "RESOURCE_EXHAUSTED" in str(err) else 0.5
    await asyncio.sleep(base * (2**attempt) * (0.75 + random.random() / 2))


async def generate_json(
    prompt: str,
    schema: type[T],
    *,
    system: str | None = None,
    tier: str = "fast",
    temperature: float = 0.7,
    retries: int = 1,
) -> T:
    """Call Gemini with a response schema and parse into `schema`. Falls back across models."""
    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=temperature,
        response_mime_type="application/json",
        response_schema=schema,
        thinking_config=_thinking(tier),
    )
    last_err: Exception | None = None
    for model in _models_for(tier):
        for attempt in range(retries + 1):
            try:
                resp = await asyncio.wait_for(
                    client().aio.models.generate_content(model=model, contents=prompt, config=config),
                    timeout=CALL_TIMEOUT_S[tier],
                )
                if resp.parsed is not None:
                    return resp.parsed
                return schema.model_validate(json.loads(resp.text))
            except Exception as e:  # noqa: BLE001 — retry on anything (incl. timeouts), log and move on
                last_err = e
                log.warning("gemini %s attempt %d failed: %s", model, attempt + 1, e)
                await _backoff(attempt, e)
    raise RuntimeError(f"Gemini call failed after retries: {last_err}")


async def generate_text(
    prompt: str, *, system: str | None = None, tier: str = "fast", temperature: float = 0.8
) -> str:
    config = types.GenerateContentConfig(system_instruction=system, temperature=temperature,
                                         thinking_config=_thinking(tier))
    last_err: Exception | None = None
    for model in _models_for(tier):
        for attempt in range(2):
            try:
                resp = await asyncio.wait_for(
                    client().aio.models.generate_content(model=model, contents=prompt, config=config),
                    timeout=CALL_TIMEOUT_S[tier],
                )
                return (resp.text or "").strip()
            except Exception as e:  # noqa: BLE001
                last_err = e
                log.warning("gemini %s attempt %d failed: %s", model, attempt + 1, e)
                await _backoff(attempt, e)
    raise RuntimeError(f"Gemini call failed after retries: {last_err}")


async def embed(texts: list[str]) -> list[list[float]]:
    s = get_settings()
    resp = await client().aio.models.embed_content(
        model=s.model_embedding,
        contents=texts,
        config=types.EmbedContentConfig(
            output_dimensionality=s.embedding_dim, task_type="SEMANTIC_SIMILARITY"
        ),
    )
    return [e.values for e in resp.embeddings]
