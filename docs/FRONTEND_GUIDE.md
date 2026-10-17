# Frontend guide — building against the Jodi API

The backend and frontend agree on one contract: **`backend/app/models.py`**. FastAPI publishes it as
OpenAPI, and the frontend's TypeScript types are **generated** from it. If you build through the typed
client, the compiler tells you when a page doesn't match the backend.

## Setup (5 min)

```bash
# backend (needs gcloud auth application-default login on the ai-build-cup-2026 project)
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8080

# frontend
cd frontend && npm install && npm run dev -- --port 5180
```

- Interactive API docs: http://localhost:8080/docs — try every endpoint, see every shape.
- No backend running? Point `VITE_API_URL` (in `frontend/.env.local`) at the deployed Cloud Run URL.

## The three rules

1. **Call the backend only through `src/api/client.ts`** (`api.getPipeline(...)`, etc.). Never raw `fetch`.
2. **Never edit `src/api/schema.ts`** — it's generated. When the backend changes, run
   `npm run gen:api` (from a running backend) and fix whatever TypeScript flags.
3. **Auth = `X-User-Id` header**, set automatically from the persona switcher (`getUserId()`).

## Stubs → real data

Every endpoint already returns realistic mock data (Arjun & Meera) in the final shape. As each backend
phase lands, the same endpoint starts returning real data — **no frontend change needed**. Build the UI
against the stubs now.

| Phase | Endpoints that go real |
|---|---|
| 1 | `/demo/seed`, `/demo/reset`, `/demo/personas`, `GET /users/{id}` |
| 2 | `/intake/*`, `/users/{id}/aspects*`, `/hard-criteria`, `/users/{id}/data` |
| 3 | `POST /scout/{id}`, `GET /pipeline/{id}` |
| 4 | `/matches/{id}/interview`, `/matches/{id}/brief/{uid}`, `/briefs/next/{uid}`, `/matches/{id}/decision` |
| 5 | `/focus/*`, `/demo/simulate-response`, `/demo/fast-forward`, learning on decisions |
| 6 | `/demo/new-profile` |

## Screens → endpoints (spec §5)

| Route | Calls | Notes |
|---|---|---|
| `/` | — | Landing: father's story, "Meet your matchmaker" CTA |
| `/onboard` | `getIntakeMessages`, `sendIntakeMessage` | Progress bar from `completeness`; show `new_aspects` as they're learned; stop when `done` |
| `/me` | `getUser`, `getAspects`, `patchAspect`, `deleteAspect`, `patchHardCriteria`, `getLearning`, `wipeData` | Group aspects by `category`; visibility toggle public / agent_only / private |
| `/pipeline` | `runScout` → `waitForJob`, `getPipeline` | Cards only (name+initial, age, city, profession, score, mini bars, status chip). No full profiles |
| `/brief/:matchId` | `getBrief`, `decide` | Radar (recharts) from `why_fit`; Pass needs a reason chip |
| `/brief/:matchId/transcript` | `runInterview` → poll `getInterview` every 1.5s | Render turns as they land; round dividers; green/yellow highlights |
| `/mutual/:matchId` | `getFocus` | "It's mutual 💛" → CTA to Focus Week |
| `/focus/:matchId` | `getFocus`, `getChat` (poll 2s), `sendChat`, `focusDecide` | Day counter, today's 3 prompts (tap → send to chat), Day 7 decision |
| `/demo` | `personas`, `reset`, `seed`, `runScout`, `runInterview`, `simulateResponse`, `fastForward`, `newProfile` | Hidden route for the video |

## Flow the UI needs to support

- **Pipeline → brief:** after `runScout`, call `runInterview(topMatchId)`; when done, `getNextBrief(userId)`.
- **Interested:** `decide(...)` → `mutual: false` means waiting on them. In the demo, `simulateResponse`
  for the other user returns `mutual: true` → go to `/mutual/:matchId`.
- **Pass / Stop:** response includes `learning` → show the "What I learned about you" card
  (`learning.explanation`, before/after weights), then fetch the next brief.
- **In Focus Week:** `getUser().status === "in_focus"` and `active_match_id` tells you where to route.

## UX principles (spec §5)

Calm, warm, premium — not a dating app. One thing at a time. Mobile-first. Every AI output shows *why*
(evidence, reasons).
