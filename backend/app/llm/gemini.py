"""Single Gemini client wrapper: retries, structured JSON output, embeddings (spec §8, §9)."""
import asyncio
import json
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


@lru_cache
def client() -> genai.Client:
    s = get_settings()
    return genai.Client(vertexai=True, project=s.gcp_project, location=s.gcp_llm_location)


@lru_cache
def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.md").read_text()


def _models_for(tier: str) -> list[str]:
    s = get_settings()
    if tier == "smart":
        return [s.model_smart, s.model_smart_fallback]
    return [s.model_fast]


async def generate_json(
    prompt: str,
    schema: type[T],
    *,
    system: str | None = None,
    tier: str = "fast",
    temperature: float = 0.7,
    retries: int = 2,
) -> T:
    """Call Gemini with a response schema and parse into `schema`. Falls back across models."""
    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=temperature,
        response_mime_type="application/json",
        response_schema=schema,
    )
    last_err: Exception | None = None
    for model in _models_for(tier):
        for attempt in range(retries + 1):
            try:
                resp = await client().aio.models.generate_content(
                    model=model, contents=prompt, config=config
                )
                if resp.parsed is not None:
                    return resp.parsed
                return schema.model_validate(json.loads(resp.text))
            except Exception as e:  # noqa: BLE001 — retry on anything, log and move on
                last_err = e
                log.warning("gemini %s attempt %d failed: %s", model, attempt + 1, e)
                await asyncio.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"Gemini call failed after retries: {last_err}")


async def generate_text(
    prompt: str, *, system: str | None = None, tier: str = "fast", temperature: float = 0.8
) -> str:
    config = types.GenerateContentConfig(system_instruction=system, temperature=temperature)
    last_err: Exception | None = None
    for model in _models_for(tier):
        for attempt in range(3):
            try:
                resp = await client().aio.models.generate_content(
                    model=model, contents=prompt, config=config
                )
                return (resp.text or "").strip()
            except Exception as e:  # noqa: BLE001
                last_err = e
                log.warning("gemini %s attempt %d failed: %s", model, attempt + 1, e)
                await asyncio.sleep(0.5 * (attempt + 1))
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
