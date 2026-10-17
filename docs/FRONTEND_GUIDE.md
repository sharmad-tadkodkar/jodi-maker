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
| 5 Decisions + Focus Week | ✅ live | `POST /matches/{id}/decision` (+ learning), `GET /matches/{id}`, `/focus/*` (state, deck, chat, Day-7 decision), simulate-response, fast-forward, soft reset |
| 6 Demo panel + polish | ✅ live | `GET /demo/state`, `POST /demo/interview-top/{uid}`, pre-computed next brief (Riya) |

**No mocks left** — every endpoint now returns real data. Phase 6 is polish only; shapes won't change.

### Changelog

- **Scale-up** — The world now has **60 profiles** (+ Arjun & Meera + 2 reserves). Nothing changes in the API.
  Pipelines are deeper (8 candidates each); Arjun and Meera are still each other's #1. Full reset ≈ 15–25 s.

- **Phase 6** — Demo panel helpers. Run `npm run gen:api`. New client functions: `api.demoState()`,
  `api.interviewTop(userId)`, `api.rerunInterview(matchId)`.
  - **The video's "Stop/Pass → next brief" beat is instant now:** Arjun's #2 (Riya, ~81%) is pre-computed, so
    right after a Pass or Stop, `getNextBrief('arjun')` returns Riya's brief. Riya's brief stays hidden from her
    (consent) like Meera's.
  - **Suggested `/demo` panel** (spec §4.9), top to bottom:
    | Button | Call |
    |---|---|
    | Persona: Arjun / Meera / any onboarded user | `personas()` → `setUserId(id)` |
    | Status strip (refresh every 3 s) | `demoState()` → per hero: `status`, `focus_day`, `queue_size`, `next_brief_match_id`; `hero_match_status`; `reserves_left` |
    | Run scout now | `runScout(userId)` → `waitForJob` (show `progress`) |
    | Run interview for top candidate | `interviewTop(userId)` → navigate to `/brief/{match_id}/transcript` and poll `getInterview` (~2 min live). 409 = nobody left to interview |
    | Replay Arjun–Meera interview live | `rerunInterview('m_arjun__meera')` → transcript page (only before Arjun decides) |
    | Meera says Interested / Pass | `simulateResponse(matchId, 'meera', …)` |
    | Fast-forward Day 4 / Day 7 / "time runs out" | `fastForward(matchId, 4 \| 7 \| 8)` |
    | Someone just joined | `newProfile()` (2 per full reset) → then Run scout for the hero to see the "new" badge |
    | Reset (soft, ~2 s) / Full reset (~15–25 s) | `reset(true)` / `reset()` |
  - Errors from the API (`409` etc.) carry a human-readable `detail` — fine to show in the demo panel as a toast.

- **Phase 5** — Mutual consent, Focus Week and the learning loop are live. New: `api.getMatch(matchId)`
  (match status + decisions), `api.reset(true)` (**soft reset ≈ 2 s** — restores all matches and the heroes'
  starting state; use it between video takes. Full reset reseeds profiles). Run `npm run gen:api`.
  - **The demo path:** Arjun → brief → **Interested** (`decide` → `mutual: false`, status `awaiting_them`; Meera's
    brief now unlocks) → on `/demo` press "Meera says Interested" (`simulateResponse(matchId, 'meera',
    'interested')` → `mutual: true`) → `/mutual/:matchId` "It's mutual 💛" → `/focus/:matchId`.
  - **Pass** needs a reason (422 without). Send a chip value: `values` | `family` | `lifestyle` | `location` |
    `career` | `just not feeling it`, or `other: <free text>` (free text teaches the most). Response has
    `learning` → the **"What I learned about you" card**: `learning.explanation` (one sentence, already ends with
    "I've moved N candidates up." when that happened), `old_weights` → `new_weights` (6 bars, before/after),
    `new_aspects` (things it learned, `source: "learned"`; they also appear on `/me`), `moved_up`. The call takes
    ≈ 3–7 s (Gemini) — show "Your matchmaker is thinking about this…". Then `getNextBrief`.
  - **A Pass is never revealed.** The other side just never gets the brief. Don't show "they passed" anywhere.
  - **Focus Week** (`getFocus(matchId)`, sends X-User-Id): `day` / `total_days` (7, or 14 if `extended`) → day
    counter; `ends_at`; `partner` (header); `deck_today` = today's 3 prompts — tap one to `sendChat` it.
    `decision_me` / `decision_them_submitted` (we never reveal *what* they chose).
    The deck is personalised from both briefs; for Arjun–Meera it's pre-computed.
  - **Chat**: poll `getChat` every 2 s. 403 before mutual (don't render chat then). Show sender by `sender_id`.
    In the demo, switch persona to Meera to reply (or just show Arjun's side).
  - **Day-7 decision** (`focusDecide`): **Stop** works any day (reason required, same chips) → `outcome:
    "closed"` + `learning` card → back to the pipeline. **Continue / Extend** only from the last day (409
    before — the message says so). First answer → `outcome: "pending"` ("Waiting for Meera…"); both continue →
    `"locked"` → celebration screen ("We're moving forward" 🎉); either extends → `"extended"` (+7 days,
    once; extending again → 409).
  - **Demo panel:** "Fast-forward to Day 4 / Day 7" → `fastForward(matchId, day)` (returns the new FocusState).
    `day = total_days + 1` demos the fairness rule: the week auto-closes (`status: "closed"`), nobody waits forever.
  - **Exclusivity:** while in a Focus Week, `getPipeline` returns `paused: true`, `getNextBrief` returns `null`,
    `runScout` returns a finished job with `result.paused`. `getUser().status` is `in_focus` (or `locked`) and
    `active_match_id` tells you where to route on app load.
  - Fairness: a brief that the other side doesn't answer within 72 h quietly closes (no UI needed).

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

### Long-running jobs (scout, interview)

`POST /scout/{userId}` returns `{job_id}`. Poll `waitForJob(job_id, onProgress)` from `client.ts`:
- `job.progress` is friendly text for the user — show it as-is (e.g. *"8 passed the filters. Your matchmaker is
  reading 8 profiles closely…"*, *"Scored 3/8 candidates…"*).
- When `status === "done"`, `job.result` contains: `profiles_checked`, `passed_filter`, `filtered_out`,
  `scored`, `new_in_queue`, `queue_size`, `top` (display names), and `excluded_dealbreakers`
  (`[{name, reason}]`). Great material for a "Your matchmaker checked 61 profiles → 8 passed → 3 excluded for
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
- **Backend redeploys at the end of each phase** (≈ every 30–45 min). If a contract shape ever changes, you'll
  be told — run `npm run gen:api` and fix what TypeScript flags.
- **Don't hard-code match IDs** — use what `getPipeline` / `getNextBrief` return. `arjun` and `meera` are stable
  persona IDs (the hero match is `m_arjun__meera`).
- **Shared database:** "Reset demo" on `/demo` resets the data for everyone (soft reset: matches + heroes;
  full: everything). Fine for testing — just shout before you do it.
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

## Screens → endpoints (spec §5)

| Route | Calls | Notes |
|---|---|---|
| `/` | — | Landing: father's story, "Meet your matchmaker" CTA |
| `/onboard` | `getIntakeMessages`, `sendIntakeMessage` | Progress bar from `completeness`; show `new_aspects` as they're learned; stop when `done` |
| `/me` | `getUser`, `getAspects`, `patchAspect`, `deleteAspect`, `patchHardCriteria`, `getLearning`, `wipeData` | Group aspects by `category`; visibility toggle public / agent_only / private |
| `/pipeline` | `runScout` → `waitForJob`, `getPipeline` | Cards only (name+initial, age, city, profession, `scores.overall`, mini bars from the 6 dimension scores, status chip, "new" badge from `candidate.is_new`). No full profiles. `paused: true` → show "Scouting paused during your Focus Week" |
| `/brief/:matchId` | `getBrief`, `decide` | Radar (recharts) from `why_fit`; Pass needs a reason chip |
| `/brief/:matchId/transcript` | `runInterview` → poll `getInterview` every 1.5s | Render turns as they land; round dividers; green/yellow highlights |
| `/mutual/:matchId` | `getFocus` | "It's mutual 💛" (partner name from `partner`) → CTA to Focus Week |
| `/focus/:matchId` | `getFocus`, `getChat` (poll 2s), `sendChat`, `focusDecide` | Day counter, today's 3 prompts (tap → send to chat), Stop any day, Continue/Extend on the last day, learning card after Stop |
| `/demo` | `personas`, `reset(true)`, `reset()`, `seed`, `runScout`, `runInterview` (+`?rerun=true`), `simulateResponse`, `fastForward`, `newProfile` | Hidden route for the video |

## Flow the UI needs to support

- **Pipeline → brief:** after `runScout`, call `runInterview(topMatchId)`; when done, `getNextBrief(userId)`.
- **Interested:** `decide(...)` → `mutual: false` means waiting on them. In the demo, `simulateResponse`
  for the other user returns `mutual: true` → go to `/mutual/:matchId`.
- **Pass / Stop / Continue:** response includes `learning` → show the "What I learned about you" card
  (`learning.explanation`, before/after weights, `new_aspects`), then fetch the next brief (after Pass/Stop).
- **In Focus Week:** `getUser().status === "in_focus"` and `active_match_id` tells you where to route.

## UX principles (spec §5)

Calm, warm, premium — not a dating app. One thing at a time. Mobile-first. Every AI output shows *why*
(evidence, reasons).
