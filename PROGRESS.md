# Jodi — build progress

Google Cloud AI Builder Cup 2026 · submission **Sat 18 Oct, 6 PM** (confirm on the Hack2skill dashboard).
Updated at the end of every phase. Partner-facing API details live in [docs/FRONTEND_GUIDE.md](docs/FRONTEND_GUIDE.md).

## Timeline (Fri 17 Oct, local time)

| Phase | Planned | Actual | Status |
|---|---|---|---|
| 0 Skeleton: contract, stubs, Gemini wrapper, frontend shell, first deploy | 17:00–17:25 | 17:00–17:30 | ✅ |
| 1 Seeded world (20 + Arjun & Meera + 2 reserves) | –17:55 | –17:40 | ✅ |
| 2 Intake chat + /me | –18:35 | –18:15 | ✅ |
| — Model lineup refresh (drop Gemini 2.5) | | –18:30 | ✅ |
| 3 Scout + pipeline | –19:10 | –18:47 | ✅ |
| 4 Interview + Match Brief | –20:00 | 18:55–19:35 | ✅ |
| 5 Mutual consent + Focus Week + learning loop | –20:45 | 19:40–20:15 | ✅ |
| 6 Demo panel endpoints + polish | –21:00 | | ⏳ |
| Deploy window: Firebase Hosting, end-to-end on prod, scale seed to 60 | 21:00–23:00 | | ⏳ |
| Sat: video, deck, submit (target ~4 PM, buffer to 6 PM) | | | ⏳ |

## Live

- API: https://jodi-api-560807723160.asia-south1.run.app (docs: `/docs`) — Cloud Run `asia-south1`, min 1 instance
- Repo: https://github.com/sharmad-tadkodkar/jodi-maker
- GCP project: `ai-build-cup-2026` · Firestore (Native, `asia-south1`) · Vertex AI (global endpoint)
- Frontend: built by partner against the live API; Firebase Hosting in the deploy window

## Phase log

### Phase 0 — Skeleton ✅
- FastAPI with every spec §7 endpoint stubbed against realistic mocks; Pydantic contract → OpenAPI → generated TS types.
- Gemini wrapper (Vertex AI, structured JSON), Firestore client, job runner. Dedicated service account (`datastore.user`, `aiplatform.user`).
- Partner handoff: typed `client.ts`, `docs/FRONTEND_GUIDE.md`, `frontend/CLAUDE.md`.

### Phase 1 — Seeded world ✅
- 20 Gemini-generated profiles + hand-tuned Arjun & Meera + 2 reserves, checked into `backend/seed/` (instant, deterministic resets).
- Briefs cover strong fits, 5 planted dealbreakers, and hard-filter failures in both directions.
- Fixed: duplicate names / inconsistent values from generation (normalisation now built in).

### Phase 2 — Intake + /me ✅
- Reply + extraction run in parallel; adaptive follow-ups; ends on 80% coverage (8 turns in simulation, no repeats).
- Evidence-backed aspects with visibility tiers; only *hard* requirements become filters.
- Fixed: Gemini "thinking" latency (off for fast tier, ~4x faster); 30 s stalls (per-call timeouts + fallback); Firestore `recursive_delete` deadlock.

### Phase 3 — Scout + pipeline ✅
- Deterministic bidirectional hard filter → embedding similarity → Gemini scoring (top 8, max 4 concurrent) with dealbreaker detection.
- Overall score computed at read time from current weights → instant re-rank for the learning loop.
- Pre-computed hero scouts (`seed/precomputed.json`) loaded on reset. Arjun ↔ Meera are each other's #1.
- Live: pipeline 0.3 s, cached scout 0.8 s, cold scout ~10–20 s.

### Phase 4 — Interview + Match Brief ✅
- 3 rounds (family → candidate → closing), 12 agent turns, moderator per round (green/yellow highlights,
  round summaries, open questions), early exit on dealbreaker (verified: Arjun vs Tanya ends in round 2 on smoking).
- Privacy by construction: agents never receive `private` aspects (leak check clean on every run).
  `agent_only` shared only as themes; dealbreakers are *asked about* ("Does Meera smoke?"), never announced.
- Perspective-specific briefs (Pro model) for both sides; the other side's brief stays hidden until the
  requester says Interested (mutual consent). `/briefs/next` = one brief at a time.
- Arjun–Meera interview + both briefs pre-computed into `seed/precomputed.json`; `?rerun=true` runs it live.
- Live interview ≈ 95 s + briefs ≈ 25 s; turns stream in ~5–8 s apart.
- Fixed: agents stating agent_only details near-verbatim; heroes lacked a "doesn't smoke" fact (agent honestly
  said "I don't know" — correct behaviour, awkward for the demo).

### Phase 5 — Mutual consent + Focus Week + learning loop ✅
- Interested / Pass with consent order: the other side's brief unlocks only after the requester says Interested;
  a Pass closes the match quietly (never revealed). Two Interested → "It's mutual" → Focus Week.
- Focus Week: exclusivity (both `in_focus`, queues paused, invisible to everyone else's scouting), chat (only after
  mutual), personalised 7-day deck from both briefs (practical → hard topics → personal; pre-computed for the
  heroes), Day-7 decision: Stop any day (reason → learning), both Continue → `locked`, any Extend → +7 days once.
- Learning loop on Pass / Stop / Continue: Gemini proposes new weights + learned aspects + one-line explanation;
  clamped ±0.1 per dimension, normalised; queue re-ranks instantly ("I've moved 1 candidate up"). No-LLM
  fallback so a decision never fails. Logged to `learning_log` (shown on /me).
- Fairness, evaluated lazily on read: unanswered brief expires after 72 h; a Focus Week past its end auto-closes.
- Demo: `simulate-response`, `fast-forward` (day = total+1 demos auto-close), **soft reset ≈ 2 s** (was 15–20 s).
- Mocks removed — every endpoint is real. 34 tests pass.
- Fixed: deck prompts written in one person's voice ("I love cooking…") and one touching past relationships →
  prompts are now sender-neutral, with a banned-topics list; learning explanations overclaimed ("absolute priority").

## Key decisions

| Decision | Why |
|---|---|
| Vertex AI on gcloud credentials, no API key | Nothing to leak; Cloud Run uses a service account |
| Models: `gemini-3.5-flash` (fast, thinking off) → `-lite` fallback; `gemini-3.6-flash` (reason: scoring, interview) → `3.7-flash`; `gemini-3.1-pro-preview` (briefs) → `3.6-flash` | Benchmarked on this project: speed + reliability; 2.5 dropped as obsolete; 3.8-flash avoided (429s) |
| Embeddings `text-multilingual-embedding-002` (768-d) | Handles Hinglish |
| No Provisioned Throughput | ≥ ~$1,200/week; retries, timeouts, fallbacks and the pre-computed demo path cover the risk |
| P1s cut (Parent Mode, uploads, Ask-their-matchmaker, coach, check-in, family view) | Fit the build into ~4 h; shown as roadmap in the deck |
| Fairness/expiry evaluated lazily on read (no scheduler) | Nothing extra to deploy; demo fast-forward just moves `focus_start` |
| Seed 20 profiles now, scale to 60 later | `uv run python -m app.services.seed generate --count 60` |

## Open items / risks

- Full reset takes ~15–20 s — use soft reset (`/demo/reset?soft=true`, ~2 s) between takes.
- Vertex shared capacity can cause occasional slow steps; record the video in several takes.
- Firebase Hosting deploy needs the partner added to the GCP project (or the owner deploys).
