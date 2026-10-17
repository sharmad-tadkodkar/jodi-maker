import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import demo, focus, jobs, matching, profile

logging.basicConfig(level=logging.INFO)
settings = get_settings()

app = FastAPI(
    title="Jodi API",
    description="Jodi — your AI matchmaker. Auth for the hackathon is an `X-User-Id` header.",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https://.*\.(web\.app|firebaseapp\.com)",
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (profile.router, matching.router, focus.router, jobs.router):
    app.include_router(r)
if settings.demo_mode:
    app.include_router(demo.router)


@app.get("/health", tags=["meta"])
async def health():
    return {"ok": True, "demo_mode": settings.demo_mode,
            "models": {"fast": settings.model_fast, "smart": settings.model_smart}}
