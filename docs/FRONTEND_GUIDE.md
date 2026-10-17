# Frontend guide — building against the Jodi API

The backend and frontend agree on one contract: **`backend/app/models.py`**. FastAPI publishes it as
OpenAPI, and the frontend's TypeScript types are **generated** from it. If you build through the typed
client, the compiler tells you when a page doesn't match the backend.

## Backend status (check this first — updated every phase)

| Phase | Status | What's real |
|---|---|---|
| 1 Seeded world | ✅ live | personas, reset, seed, new-profile, `GET/POST /users` |
| 2 Intake + /me | ✅ live | intake chat, aspects (edit/visibility/delete), hard criteria, delete-everything, learning history |
| 3 Scout + pipeline | ✅ live | `POST /scout/{id}` (job), `GET /pipeline/{id}` |
| 4 Interview + brief | ✅ live | `POST/GET /matches/{id}/interview`, `GET /matches/{id}/brief/{uid}`, `GET /briefs/next/{uid}` |
| 5 Decisions + Focus Week | ⏳ mock | decision, focus, chat, simulate-response, fast-forward |

### Changelog

- **Phase 4** — Interview + brief are live.
  - **Transcript page**: after `runInterview(matchId)`, poll `getInterview(matchId)` every 1.5 s and render
    `turns` as they arrive (they land one by one, ~5–8 s apart — it feels like watching two matchmakers talk).
    Stop polling when `status` is `done` or `ended_dealbreaker`. A full live interview + briefs takes ~2 min.
  - Turn fields: `round` (1 Family, 2 Candidate, 3 Closing — draw a divider when it changes), `speaker`
    (`agent_a` | `agent_b` | `moderator`), `speaker_name` ("Arjun's matchmaker"), `highlight` (`green` | `yellow` |
    null — highlights are added at the end of each round, so re-render existing turns on every poll).
    `round_summaries[i]` is the summary of round i+1.
  - `status === "ended_dealbreaker"`: last turn is from `moderator` explaining why. Show it calmly; the match
    disappears from the pipeline.
  - **Pre-computed**: after Reset, the Arjun–Meera interview + briefs already exist (status `done`), so
    `runInterview` returns an instantly-finished job. To show it running live, call
    `POST /matches/{id}/interview?rerun=true` (add a "Run live again" button on `/demo`). Other matches run live.
  - **Brief**: `getBrief(matchId, userId)` returns **404 until it's that user's turn** — mutual consent: Meera's
    brief about Arjun stays hidden until Arjun says Interested (Phase 5). Treat 404 as "no brief yet".
    `getNextBrief(userId)` returns the single brief to show now, or `null` → show a calm empty state
    ("Your matchmaker is still scouting").
  - Brief fields: `compatibility` (0–100, show as %), `why_fit` (6 items → radar chart: `dimension`, `score`,
    `reason`), `green_flags` / `explore` (`text` + `evidence` — show evidence as a quote under each),
    `questions_only_you`, `family_fit` (paragraph for parents), `candidate` (header: name, age, city,
    profession, `verified` badge).
  - The pipeline → brief flow for the demo: Pipeline → tap top card → if `status` is `queued`, run the interview
    (go to the transcript page) → when done, open the brief.

- **Phase 3** — Real match IDs look like `m_arjun__meera` (sorted user IDs, double underscore). Use whatever
  `getPipeline` returns; never build IDs yourself. Right after **Reset demo**, Arjun's and Meera's pipelines
  are already filled (pre-computed), so the pipeline page works instantly. A new user must run scout first
  (≈ 20–40 s) — see "Long-running jobs" below. Pipeline items exclude closed (dealbreaker) matches.
- **Phase 2** — Intake chat is live. One turn takes ≈ 3 s (occasionally up to ≈ 10 s): show a typing
  indicator, disable the send button while waiting. When `done` is true show a "See what I learned about you →
  /me" CTA, but let them keep chatting. `GET /demo/personas` returns Arjun, Meera, then any onboarded users
  (no parent persona — Parent Mode is cut).
- **Phase 1** — Seeded world live; persona IDs `arjun` / `meera` are stable.

### Long-running jobs (scout now; interview in Phase 4)

`POST /scout/{userId}` returns `{job_id}`. Poll `waitForJob(job_id, onProgress)` from `client.ts`:
- `job.progress` is friendly text for the user — show it as-is (e.g. *"8 passed the filters. Your matchmaker is
  reading 8 profiles closely…"*, *"Scored 3/8 candidates…"*).
- When `status === "done"`, `job.result` contains: `profiles_checked`, `passed_filter`, `filtered_out`,
  `scored`, `new_in_queue`, `queue_size`, `top` (display names), and `excluded_dealbreakers`
  (`[{name, reason}]`). Great material for a "Your matchmaker checked 22 profiles → 8 passed → 3 excluded for
  dealbreakers" summary card — it shows the AI doing the father's filtering work.
- If `status === "error"`, show a calm message ("Your matchmaker hit a snag — try again") with a retry button.
  Never show raw error text. Gemini can occasionally be slow; the backend already retries and falls back.

## Start here (10 min, no Google Cloud access needed)

You only need Node 20+ and git. The backend is already live on Cloud Run — you don't run it locally.

```bash
git clone https://github.com/sharmad-tadkodkar/jodi-maker.git && cd jodi-maker/frontend
echo "VITE_API_URL=https://jodi-api-560807723160.asia-south1.run.app" > .env.local
npm install
npm run dev -- --port 5180        # open http://localhost:5180
```

- **Live API docs:** https://jodi-api-560807723160.asia-south1.run.app/docs — try every endpoint, see every shape.
- **Regenerate types from the live API:** `VITE_API_URL=https://jodi-api-560807723160.asia-south1.run.app npm run gen:api`
- The shell in `src/App.tsx` already has every route, a persona switcher, and pages that dump raw
  JSON. Replace each placeholder page with the real screen — start with `/pipeline` and `/brief/:matchId`
  (they're the heart of the video).

### Working together

- **You own `frontend/`. Don't edit `backend/`** — ask instead. That keeps merge conflicts at zero.
- Commit small and often to `main`; `git pull --rebase` before every push.
- **Backend redeploys at the end of each phase** (≈ every 30–45 min). When a phase lands, endpoints in the
  table below switch from mock to real data. If a contract shape ever changes, you'll be told — run
  `npm run gen:api` and fix what TypeScript flags.
- **Don't hard-code IDs.** `arjun` and `meera` are stable persona IDs, but match IDs like `m_arjun_meera`
  only exist in the mocks — real ones come from `getPipeline` / `getNextBrief`.
- **Shared database:** pressing "Reset demo" on `/demo` wipes and reseeds the data for everyone.
  Fine for testing — just shout before you do it.
- **Firebase Hosting deploy** happens in the deploy window (after Phase 6); you'll need to be added to the
  Google Cloud project for that. Until then, everything runs on localhost against the live API.

### Running the backend locally (optional)

Only if you've been given access to the `ai-build-cup-2026` project:

```bash
gcloud auth application-default login
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8080
```

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
| `/pipeline` | `runScout` → `waitForJob`, `getPipeline` | Cards only (name+initial, age, city, profession, `scores.overall`, mini bars from the 6 dimension scores, status chip, "new" badge from `candidate.is_new`). No full profiles. `paused: true` → show "Scouting paused during your Focus Week" |
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
