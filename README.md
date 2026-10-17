# Jodi — your AI matchmaker

Google Cloud AI Builder Cup 2026. Spec: [docs/SPEC.md](docs/SPEC.md) · Frontend guide: [docs/FRONTEND_GUIDE.md](docs/FRONTEND_GUIDE.md)

- `backend/` — FastAPI + Gemini (Vertex AI) + Firestore → Cloud Run. GCP project `ai-build-cup-2026`.
- `frontend/` — React + Vite + TS + Tailwind → Firebase Hosting.

```bash
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8080   # API docs: /docs
cd frontend && npm install && npm run dev -- --port 5180
cd backend && uv run pytest -q                                              # smoke tests
```
