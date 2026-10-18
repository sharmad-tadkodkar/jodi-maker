from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gcp_project: str = "ai-build-cup-2026"
    gcp_llm_location: str = "global"

    # Model IDs live here so we can swap without touching code (spec §8).
    model_fast: str = "gemini-3.5-flash"
    model_fast_fallback: str = "gemini-3.5-flash-lite"
    # reason tier: scoring + interview agents — needs judgement but runs many times per action
    model_reason: str = "gemini-3.6-flash"
    model_reason_fallback: str = "gemini-3.7-flash"
    # smart tier: briefs — few calls, highest quality
    model_smart: str = "gemini-3.1-pro-preview"
    model_smart_fallback: str = "gemini-3.6-flash"
    model_embedding: str = "text-multilingual-embedding-002"
    embedding_dim: int = 768

    demo_mode: bool = True

    # Each person's messages per conversation per day (intake chat; each Jodi Week chat). Resets at IST midnight.
    chat_turns_per_day: int = 50
    # Prefix for Firestore collections. Tests use "test_" so they never touch the live demo data.
    collection_prefix: str = ""
    cors_origins: str = "http://localhost:5173,http://localhost:5180,http://127.0.0.1:5180"

    # Matching knobs
    semantic_top_n: int = 8
    interview_exchanges_per_round: int = 2
    learning_clamp: float = 0.1

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
