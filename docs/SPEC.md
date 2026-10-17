# Jodi — Your AI Matchmaker
### Product & Build Spec · Google Cloud AI Builder Cup 2026

> **Working name:** Jodi (alternatives: Rishta Agent, Saath)
> **Theme:** Media, Content & Digital Experiences (backup: Sustainability & Social Impact)
> **Deadline:** Oct 18, 2026 — **confirm exact submission time on the Hack2skill dashboard**
> **Stack:** FastAPI (Cloud Run) · React (Firebase Hosting) · Gemini via Vertex AI / AI Studio · Firestore

---

## 0. How to use this doc

This is the single source of truth for both builders. Read sections 1–3 for context, section 4 for what to build, sections 6–9 for the shared contracts. **Do not change the data model (§6) or API contract (§7) without telling your partner.**

Priority tags:
- **P0** — must ship; the demo breaks without it
- **P1** — should ship; strong differentiators
- **P2** — stretch; mention in deck as roadmap if not built

Rule: if P0s are not done by **Sun 10 AM IST**, drop P1s and polish.

---

## 1. Problem

Indian matrimonial platforms (Shaadi, BharatMatrimony, Jeevansathi…) are **profile directories**. Filters cover only hard facts (age, city, income, community, education). Result:

- Users get **flooded** with profiles and talk to many people at once.
- Families and candidates do all the **vetting manually** — calls, background checks, reading people.
- A few bad matches early → **frustration → churn** → longer wait to find a partner.
- Working professionals meet a tiny circle of people, so organic discovery is limited.

## 2. Origin story (use this to open the video and deck)

The founder's father ran a disciplined matchmaking process:

1. **Hard-filter** profiles on facts (community, income, location, education, profession), tracking new and departing profiles daily.
2. **Shortlist & prioritize**; get a thumbs-up from his son before reaching out.
3. **Call the family**: introduce his own family, learn their background, read between the lines.
4. **Talk to the candidate** in an "HR style" — simple questions about routine and life, really reading the person.
5. **Confirm with the family** again, then hand his son the contact.
6. **One week, one person.** Transactional, practical conversation first; emotions only once both are sure.
7. **Decide fast.** Continue exclusively, or stop and move to the next in the queue — max 1–2 weeks, nobody left waiting.

**Jodi turns this father into an AI agent that every user gets.**

## 3. Solution in one line

Every user gets a personal **AI Matchmaker** that knows them and their family, scouts daily, **interviews other users' matchmakers** to pre-screen candidates, and delivers **one vetted match at a time** via a **Match Brief**, followed by an exclusive, time-boxed **Focus Week** — and learns from every decision.

**You never browse profiles. You get a briefing.**

### Father's step → Jodi feature

| Father's step | Jodi feature |
|---|---|
| Knows us deeply | Conversational Intake + Aspects profile + Parent Mode |
| Filters the obvious | Hard Filter (bidirectional) |
| Shortlists, prioritizes, searches daily | Semantic Matcher + Gemini scoring + Priority Queue + Scout |
| Talks to family, then candidate | Matchmaker-to-Matchmaker Interview (3 rounds) |
| Gives me the update | Match Brief |
| Contact only when both agree | Mutual Consent |
| One week, transactional first | Focus Week |
| Stop & move on / lock in | Day-7 Decision + Learning Loop |

---

## 4. Feature spec

### 4.1 Onboarding — "Let your matchmaker get to know you"

**P0 — Conversational intake**
- Gemini-led chat. Opens warmly, explains it is an AI matchmaker.
- Covers: basics, work, education, family, lifestyle, values, future plans, partner expectations, dealbreakers.
- **Adaptive follow-ups** (e.g. user says "moving to Bangalore next year" → agent asks about relocation expectations for a partner).
- Ends when completeness ≥ threshold (agent tracks which aspect categories are still empty), not after a fixed number of questions. Show a progress indicator ("Your matchmaker knows you 70%").
- After each user turn, backend runs **extraction** → updates hard criteria + aspects.

**P0 — Two-layer profile**
- **Hard criteria** (user-editable, used for filtering): age, gender, seeking gender, city, open to relocate, education level, profession, income band, community preference (user-set, optional), diet, marital status, height (optional), languages.
- **Compatibility aspects** (extracted, used for semantic matching). Categories:
  `values`, `family_structure`, `career_ambition`, `lifestyle`, `location_plans`, `finances`, `faith_practice`, `communication_style`, `interests`, `partner_expectations`, `dealbreakers`
- Each aspect = `{category, statement, evidence (quote/source), confidence 0–1, visibility}`.

**P0 — "What my matchmaker knows about me" page**
- Lists all aspects grouped by category, with evidence and confidence.
- User can **edit, delete, change visibility** of any aspect.
- Hard criteria editable here too.

**P0 — Visibility per aspect**
- `public` — may appear on others' Match Briefs
- `agent_only` — matchmaker may use in conversation/scoring, never displayed verbatim
- `private` — used only for *your* matching; never shared with any other agent or user

**P1 — Upload what you choose (consent-based, no scraping)**
- Upload LinkedIn PDF / resume, paste Instagram bio/captions, upload a few photos.
- Gemini multimodal extracts aspects (e.g. "hikes often", "career progression in fintech") into the same evidence-backed list, source = document name.
- User reviews before they are saved.

**P1 — Parent Mode**
- Separate short intake for a parent/family member: family background, traditions, expectations, preferences.
- Stored as `family` aspects with `source = parent`.
- **Conflict detection**: agent compares parent vs user preferences and surfaces conflicts:
  > "Your parents prefer someone in Kolkata; you said you're open to relocating. Which should I prioritize?"
- User resolves each conflict (user wins / parent wins / flexible) → affects weights.

**P2 — Voice intake** (English / Hindi / Hinglish).

---

### 4.2 Scouting & Ranking — "Dad's daily search"

**P0 — Hard filter (bidirectional)**
- Candidate passes only if *candidate fits my hard criteria* AND *I fit theirs*.
- Deterministic Python, no LLM.
- Excludes: self, users in an active Focus Week, users already closed with me, users marked unavailable.

**P0 — Semantic match**
- Embed each user's aspect set (public + agent_only; for *my own* query also private) into a profile embedding (concatenate statements per category → embed; store per-category + overall).
- Cosine similarity → top N (default 20).

**P0 — Gemini compatibility scoring**
- For each top-N candidate: Gemini receives both profiles (respecting visibility: the candidate's `private` aspects are excluded) and returns structured JSON:
  - Dimension scores 0–100: `values`, `family_fit`, `lifestyle`, `career`, `location`, `communication`
  - `dealbreaker_conflict: bool` + reason
  - one-line reason per dimension
  - `overall` (weighted by the user's preference weights, see §4.7)
- Dealbreaker conflict → excluded.

**P0 — Priority Queue page**
- "Your pipeline: N candidates."
- Ranked cards: first name + initial, age, city, profession, overall score, mini dimension bars, status chip.
- Statuses: `queued → screening → briefed → awaiting_them → focus_week → closed`
- Candidates are **not** browsable in full here — the brief is the only full view. (Prevents the flood.)

**P1 — Freshness & activity**
- `new` badge for profiles < 3 days old; small ranking boost.
- Inactive (no login > 14 days) → score decay, eventually removed from queue.

**P1 — Scout digest** — on login / via demo button: "3 new candidates joined; 1 entered your top 5."

---

### 4.3 Matchmaker-to-Matchmaker Interview ★ CENTERPIECE

Two AI agents — **mine** (representing me + my family) and **theirs** — hold a structured conversation before either human sees the match.

**P0 — Three rounds** (mirrors the father):
1. **Family round** — backgrounds, traditions, living arrangement expectations, in-law expectations, family values.
2. **Candidate round** — HR-style: typical day, work and ambitions, weekends, how they handle disagreement, future plans (kids, city, finances). Goal is to *read the person*, not just collect answers.
3. **Closing round** — resolve open questions, explicit dealbreaker check, each agent states its recommendation.

Default ~4–6 turns per round (configurable). Each round produces a short round summary.

**P0 — Agent rules (put in system prompt)**
- Speak only from your user's `public` and `agent_only` aspects + hard criteria.
- **Never reveal `private` aspects.** Never reveal `agent_only` aspects verbatim — paraphrase at a general level.
- **Never invent facts.** If unknown: "I don't know that yet — it's a good one for them to discuss directly." → becomes a "question only you can ask".
- Represent your user honestly, warmly, respectfully. No hard selling.
- Never discuss or score caste/community beyond the user-set hard filter.

**P0 — Early exit** — if either agent detects a dealbreaker conflict, interview ends; candidate `closed` with reason `dealbreaker:<detail>`.

**P0 — Transcript view** — chat-style, two agent avatars, round dividers, **highlighted key moments** (green/yellow tagged lines that feed the brief).

**P1 — "Brief your matchmaker"** — before an interview runs, user can add instructions ("Ask whether she'd be okay living with my parents for the first year"). Agent weaves them in naturally; answer is highlighted.

**P1 — "Ask their matchmaker"** — after the brief, user can ask the other side's agent questions directly. Same privacy rules apply.

**Orchestration (backend)** — a loop alternates calls: `my_agent(history) → their_agent(history) → …` with a **moderator** step per round (cheap Gemini call) that decides `continue | next_round | end_dealbreaker` and writes the round summary. Run async; frontend polls or streams.

---

### 4.4 The Match Brief — "Dad's update to me"

**P0 — One brief at a time.** No feed. The top-ranked screened candidate's brief is shown; next one only after a decision.

**P0 — Brief contents**
- Header: first name, age, city, profession, verified badge (mock), compatibility %.
- **Snapshot** — 3–4 line summary of who they are.
- **Why you fit** — radar chart of dimension scores + one-line reasons.
- 🟢 **Green flags** (2–4) — each with evidence from interview.
- 🟡 **Worth exploring** (1–3) — each with evidence.
- **Questions only you can ask** (3–5).
- **Family fit** — short paragraph for parents.
- Link: "Read the full matchmaker conversation" → transcript.

**P0 — Decision** — `Interested` / `Pass`. Pass requires a one-tap reason (chips: values, family, lifestyle, location, career, "just not feeling it", other + free text).

**P1 — Family view + Family thumbs-up** — parent sees the brief and can add 👍 / 💬 note. Endorses, cannot override.

---

### 4.5 Mutual Consent

**P0**
- Their side receives *their* version of the brief (generated from their perspective) **only after I say Interested.**
- Contact/chat unlocks **only when both say Interested.**
- A Pass is never revealed to the other side; they simply never receive the brief (or it quietly expires).
- On mutual yes → "It's mutual 💛" screen → **Focus Week starts**.

---

### 4.6 Focus Week — the one-week rule

**P0 — Exclusivity**
- One active match per user. Both users marked `in_focus` → removed from everyone else's queues; own queue paused.

**P0 — In-app chat** between the two humans (simple, Firestore-backed or polled).

**P0 — Daily conversation deck** (generated at match start, personalised from both briefs' "worth exploring" and "questions only you can ask"):
- Days 1–2 — **practical**: work, routine, family logistics
- Days 3–5 — **values & hard topics**: money, kids, living arrangement, career moves, faith, conflict
- Days 6–7 — **personal**: what matters emotionally, hopes, how they'd want to be supported
Show today's 3 prompts; tap to send one into chat.

**P1 — Private coach panel** — my agent suggests questions based on what's still unresolved. Reads the chat **only if both opted in** (toggle at Focus Week start); otherwise works from the briefs only.

**P1 — Day 4 private check-in** — "How's it going?" (scale + optional note). Private to each user; feeds the coach and the learning loop.

**P0 — Day 7 decision**
- **Continue** → match `locked`; both users' searches stop; queue frozen. Celebration screen + "We're moving forward" signal.
- **Stop** → reason required → match closed → learning loop runs → next brief released.
- **Extend once** → +7 days, max 14 days total. Both must agree to extend.

**P0 — Fairness**
- If one side doesn't respond to a brief within 72h (demo: instant via panel) → expires, next candidate released.
- If a Focus Week hits its end with no decision from one side → auto-close. Nobody waits indefinitely.

---

### 4.7 Learning Loop

**P0 — Preference weights**
- Each user has weights over dimensions (`values, family_fit, lifestyle, career, location, communication`), default equal, sum = 1.
- On every Pass / Stop / Continue (+ reason + optional Day-4 check-in), Gemini receives: current weights, the brief, the reason → returns **updated weights** + **new/modified aspects** (e.g. a dealbreaker learned) + a one-line human explanation.
- Clamp change per update (e.g. ±0.1 per dimension) for stability.
- Queue **re-ranks immediately** using new weights.

**P0 — "What I learned about you" card** — shown after each decision:
> "You weighted family closeness higher than you told me. I've moved 2 candidates up."
Also listed on the "What my matchmaker knows" page as a learning history.

**P1 — Success signal** — "We're moving forward" logged as positive outcome; aggregate stats on an admin view. Deck frames this as the base for future RLHF on matching quality.

---

### 4.8 Trust & Safety

- **P0 (deck slide) / P1 (build)**
- Verified badge (mocked; roadmap: DigiLocker/Aadhaar-based verification, LinkedIn verification).
- Report & block on brief and in chat.
- Agents always disclose they are AI.
- Caste/community: **user-set hard filter only**; never inferred, never part of AI scoring, never discussed by agents beyond the filter.
- Consent-based data only — no scraping.
- "Delete everything my matchmaker knows" — one click wipes aspects + embeddings.
- Data minimisation note for India's DPDP Act 2023 in the deck.

---

### 4.9 Demo controls (P0 — essential for the video)

- **Seeded world** — ~60 synthetic profiles generated by Gemini (varied cities, professions, families, values, some deliberate dealbreaker conflicts), each with full aspects, embeddings, and preference weights. Mix of genders; realistic Indian names; no real people.
- **Two hero personas** — e.g. *Arjun* (28, software engineer, Kolkata → Bangalore, joint family) and *Meera* (27, product designer, Bangalore). Hand-tune them so they're each other's top match.
- **Demo panel** (hidden route `/demo` or floating button, only when `DEMO_MODE=true`):
  - Switch persona (login as Arjun / Meera / parent)
  - Run scout now
  - Run interview for top candidate now
  - Simulate their response: Interested / Pass
  - Fast-forward Focus Week to Day 4 / Day 7
  - Add a new profile ("someone just joined")
  - Reset demo state

---

## 5. Screens (frontend)

| Route | Screen | Priority |
|---|---|---|
| `/` | Landing — story, "Meet your matchmaker" CTA | P0 |
| `/onboard` | Intake chat + progress | P0 |
| `/onboard/parent` | Parent Mode intake | P1 |
| `/me` | What my matchmaker knows (aspects, hard criteria, visibility, learning history, conflicts) | P0 |
| `/pipeline` | Priority queue | P0 |
| `/brief/:matchId` | Match Brief + decision | P0 |
| `/brief/:matchId/transcript` | Interview transcript | P0 |
| `/brief/:matchId/ask` | Ask their matchmaker | P1 |
| `/mutual/:matchId` | "It's mutual" | P0 |
| `/focus/:matchId` | Focus Week: chat, daily deck, day counter, coach, decision | P0 |
| `/family` | Parent view of brief + thumbs-up | P1 |
| `/demo` | Demo panel | P0 |

UX principles: calm, warm, premium (not a dating app). One thing at a time. Mobile-first. Every AI output shows *why* (evidence, reasons).

---

## 6. Data model (Firestore — proposed, shared contract)

```
users/{userId}
  name, gender, seeking_gender, dob, city, photo_url
  role: "candidate" | "parent"
  linked_candidate_id?            # for parents
  status: "onboarding" | "active" | "in_focus" | "locked" | "paused"
  created_at, last_active_at, is_seed: bool
  hard_criteria: {
    age_min, age_max, cities[], open_to_relocate: bool,
    education_min, professions[]?, income_band_min?, community_pref?,
    diet?, marital_status[], languages[]
  }
  self_facts: { age, city, education, profession, income_band, community?, diet, marital_status, languages[], height_cm? }
  preference_weights: { values, family_fit, lifestyle, career, location, communication }
  intake_completeness: 0..1
  embedding: float[]              # overall profile embedding
  embeddings_by_category: { <category>: float[] }

users/{userId}/aspects/{aspectId}
  category, statement, evidence, source ("intake"|"upload:<name>"|"parent"|"learned")
  confidence, visibility ("public"|"agent_only"|"private"), created_at

users/{userId}/intake_messages/{msgId}
  role ("agent"|"user"), text, created_at

users/{userId}/learning_log/{logId}
  match_id, decision, reason, old_weights, new_weights, explanation, created_at

users/{userId}/conflicts/{conflictId}         # P1 Parent Mode
  topic, user_view, parent_view, resolution ("user"|"parent"|"flexible"|null)

matches/{matchId}                              # one doc per pair
  user_a, user_b
  status: "queued"|"screening"|"briefed"|"awaiting_them"|"focus_week"|"locked"|"closed"
  scores: { overall, values, family_fit, lifestyle, career, location, communication, reasons{} }
  decision_a: null|"interested"|"pass", decision_b: same
  pass_reason_a?, pass_reason_b?
  closed_reason?
  briefed_at, mutual_at, focus_start, focus_end, extended: bool
  created_at

matches/{matchId}/interview/{turnId}
  round (1|2|3), speaker ("agent_a"|"agent_b"|"moderator"), text, highlight: null|"green"|"yellow", turn_index

matches/{matchId}/briefs/{forUserId}           # perspective-specific brief
  snapshot, why_fit[], green_flags[{text, evidence}], explore[{text, evidence}],
  questions_only_you[], family_fit, generated_at

matches/{matchId}/focus/deck
  days: [{ day: 1..7, prompts: [str, str, str] }]

matches/{matchId}/chat/{msgId}
  sender_id, text, created_at

matches/{matchId}/checkins/{userId}            # P1
  day, rating 1..5, note
```

Queue = query `matches` where user in (user_a, user_b) and status not closed, ordered by `scores.overall`.

---

## 7. API contract (FastAPI — proposed, shared contract)

All responses JSON. Auth for hackathon: simple `X-User-Id` header (demo persona switcher sets it). Long-running jobs return `{job_id}`; poll `GET /jobs/{id}`.

**Onboarding & profile**
```
POST /users                              -> create user {name, gender, role} -> {user}
POST /intake/{userId}/message            {text} -> {reply, completeness, new_aspects[]}
GET  /users/{userId}                     -> user doc
GET  /users/{userId}/aspects             -> aspects[]
PATCH /users/{userId}/aspects/{id}       {statement?, visibility?}
DELETE /users/{userId}/aspects/{id}
PATCH /users/{userId}/hard-criteria      {...}
POST /users/{userId}/uploads             multipart file | {text} -> {proposed_aspects[]}   (P1)
POST /users/{userId}/uploads/confirm     {aspect_ids[]}                                      (P1)
POST /intake/{userId}/parent/message     {text} -> {reply, completeness}                     (P1)
GET  /users/{userId}/conflicts           ; POST /users/{userId}/conflicts/{id}/resolve        (P1)
DELETE /users/{userId}/data              -> wipe aspects + embeddings
GET  /users/{userId}/learning            -> learning_log[]
```

**Matching**
```
POST /scout/{userId}                     -> runs filter + semantic + scoring -> {job_id}
GET  /pipeline/{userId}                  -> ranked queue [{match_id, candidate_summary, scores, status}]
POST /matches/{matchId}/interview        {instructions?} -> {job_id}   # runs 3-round interview + briefs
GET  /matches/{matchId}/interview        -> turns[]
GET  /matches/{matchId}/brief/{userId}   -> brief
POST /matches/{matchId}/ask              {user_id, question} -> {answer}                     (P1)
POST /matches/{matchId}/decision         {user_id, decision, reason?} -> {match, mutual: bool, learning?}
GET  /briefs/next/{userId}               -> next brief to show (or null)
```

**Focus Week**
```
GET  /focus/{matchId}                    -> {day, deck_today, status, ends_at}
GET  /focus/{matchId}/chat               ; POST /focus/{matchId}/chat {sender_id, text}
POST /focus/{matchId}/coach              {user_id} -> {suggestions[]}                         (P1)
POST /focus/{matchId}/checkin            {user_id, rating, note}                              (P1)
POST /focus/{matchId}/decision           {user_id, decision: continue|stop|extend, reason?} -> {match, learning?}
```

**Demo** (only if `DEMO_MODE=true`)
```
POST /demo/seed                          {count: 60}
POST /demo/reset
POST /demo/simulate-response             {match_id, user_id, decision}
POST /demo/fast-forward                  {match_id, day}
POST /demo/new-profile
GET  /demo/personas
```

**Jobs**
```
GET /jobs/{jobId}                        -> {status: pending|running|done|error, result?, progress?}
```

---

## 8. Gemini usage map (this is the 40% "Technical Merit & Gen AI" story)

| Stage | Gemini role | Output (use structured JSON / response schema) |
|---|---|---|
| Intake chat | Conversational agent with completeness tracking | `{reply, missing_categories[]}` |
| Extraction | Turn chat / documents into aspects + hard facts | `{aspects[{category, statement, evidence, confidence}], facts{}}` |
| Multimodal upload (P1) | Read PDF / images / text | same as extraction |
| Parent conflicts (P1) | Compare parent vs user aspects | `{conflicts[{topic, user_view, parent_view}]}` |
| Embeddings | Gemini embedding model on aspect text | vectors |
| Compatibility scoring | Reason over two profiles | `{scores{}, reasons{}, dealbreaker_conflict, overall}` |
| Interview agents | Two role-played matchmakers, privacy-bounded | turn text + `highlight` |
| Interview moderator | Control flow per round | `{action, round_summary}` |
| Brief generator | Perspective-specific brief | brief schema (§6) |
| Ask their matchmaker (P1) | Grounded Q&A with privacy rules | `{answer}` |
| Focus deck | Personalised 7-day prompts | `{days[]}` |
| Coach (P1) | Suggest next questions | `{suggestions[]}` |
| Learning loop | Reason → weight + aspect updates | `{new_weights{}, new_aspects[], explanation}` |
| Seed generator | Synthetic realistic profiles | full user + aspects JSON |

Model choice: a fast Gemini Flash-class model for chat, extraction, moderator, deck; a Pro-class model for scoring, interview agents, briefs if latency allows. **Check current model IDs in Vertex AI / AI Studio** before coding; keep model names in config.

Always use **structured output (response schema / JSON mode)** for anything the backend parses.

---

## 9. Architecture & infra

```
React (Vite) ── Firebase Hosting
      │  REST (X-User-Id)
      ▼
FastAPI ── Cloud Run (min-instances=1 during judging to avoid cold start)
  ├─ services/intake.py       (chat + extraction)
  ├─ services/matching.py     (hard filter, embeddings, cosine, scoring)
  ├─ services/interview.py    (agent loop, moderator, highlights)
  ├─ services/brief.py
  ├─ services/focus.py        (deck, coach, decisions)
  ├─ services/learning.py
  ├─ services/seed.py
  ├─ llm/gemini.py            (single client wrapper, retries, JSON schema helpers)
  └─ prompts/*.md             (all prompts as files, versioned)
      │
      ├─ Firestore (all data)
      └─ Gemini API (Vertex AI or AI Studio key via Secret Manager)
```

- Vector search: with ≤ a few hundred profiles, load embeddings and do **numpy cosine in memory**. Roadmap: Vertex AI Vector Search / AlloyDB pgvector.
- Long jobs (scout, interview): FastAPI `BackgroundTasks` + job doc in Firestore; frontend polls every 1–2 s and renders interview turns as they land (feels live).
- CORS: allow Firebase Hosting domain.
- Secrets: Gemini key in Secret Manager → env var on Cloud Run.
- **Deploy a hello-world to both Cloud Run and Firebase in the first 2 hours.**

Suggested repo layout:
```
/backend   FastAPI app, Dockerfile, prompts/, tests/
/frontend  React (Vite + TS), Tailwind, recharts (radar)
/docs      SPEC.md, architecture diagram, deck assets
```

---

## 10. Work split

**Partner A — Agents & backend**
Gemini wrapper · intake + extraction · seed generator · hard filter + embeddings + scoring · interview engine + moderator · brief generator · learning loop · focus deck · demo endpoints · Cloud Run deploy

**Partner B — Product & frontend**
Design system + layout · landing · onboarding chat · `/me` aspects page · pipeline · brief card + radar + transcript · mutual screen · Focus Week (chat, deck, counter, decision) · learning card · demo panel · Firebase deploy · video + deck visuals

**Hour 1 together:** agree on §6 and §7 (edit this file if needed), create repo, stub every endpoint with mock JSON so the frontend can build against it immediately.

---

## 11. Timeline (IST — adjust to dashboard deadline)

| When | Goal |
|---|---|
| Sat 1–3 PM | Contracts agreed, repo, stub API with mocks, both deployments live |
| Sat 3–9 PM | Intake + aspects page · seed 60 profiles · matching + pipeline |
| Sat 9 PM–4 AM | Interview engine + transcript · brief · mutual flow |
| Sun 4–10 AM | Focus Week · learning loop · demo panel → **all P0 done** |
| Sun 10 AM–2 PM | P1s: Parent Mode, Brief-your-matchmaker, Ask-their-matchmaker, coach, uploads · polish |
| Sun 2–6 PM | **Feature freeze** · final deploy · record video · build deck PDF |
| Sun 6 PM → deadline | Buffer · submit early |

---

## 12. Submission checklist

- [ ] Deployed prototype URL (Cloud Run backend + Firebase frontend), demo mode works without manual DB edits
- [ ] Uses Gemini (state model names in deck)
- [ ] Public 3-minute video (YouTube / Vimeo / public Drive)
- [ ] Deck exported to PDF: problem, solution, impact, feasibility, scalability
- [ ] Theme stated: **Media, Content & Digital Experiences**
- [ ] All materials in English
- [ ] Team members & eligibility confirmed (working professionals, 21+)

### 3-minute video script
| Time | Content |
|---|---|
| 0:00–0:25 | Father's story + the profile-flood problem |
| 0:25–1:00 | Arjun's intake chat → "What my matchmaker knows" (evidence, visibility) |
| 1:00–1:45 | Pipeline → matchmakers interview each other (sped-up transcript) → Match Brief |
| 1:45–2:20 | Interested → Meera says yes → "It's mutual" → Focus Week deck & chat |
| 2:20–2:45 | Stop with reason → "What I learned about you" → queue re-ranks → next brief |
| 2:45–3:00 | Architecture (Gemini + Cloud Run + Firebase), safety, vision |

### Deck outline (≈10 slides)
1. Title + one-liner
2. The problem (flood, manual vetting, churn, small social circles)
3. The father's method
4. Jodi: every user gets a matchmaker agent
5. How it works — pipeline diagram (Intake → Scout → Agent Interview → Brief → Mutual → Focus Week → Learn)
6. Agent-to-agent interview (screenshot) — the innovation
7. Gen AI architecture on Google Cloud
8. Trust, privacy & ethics (consent, visibility tiers, no caste inference, DPDP)
9. Impact & scalability (India's matrimony market, other cultures with arranged/assisted matchmaking across JAPAC, B2B for existing platforms)
10. Roadmap (verification, voice, Vertex Vector Search, outcome-based learning) + team

---

## 13. Judging criteria → where we score

| Criterion | Weight | Our answer |
|---|---|---|
| Technical merit & Gen AI | 40% | Gemini drives every stage; multi-agent interview with privacy boundaries; structured outputs; visible learning loop; Cloud Run + Firestore scale path |
| Problem alignment & impact | 25% | Real, personal, large-market problem; reduces overload and churn; family-inclusive |
| Innovation & creativity | 25% | Agent-to-agent pre-screening, one-at-a-time briefs, Focus Week, parent-conflict resolution |
| UX & design | 10% | Calm one-thing-at-a-time flow, explainable AI everywhere |

---

## 14. Out of scope (roadmap only)

Social media scraping · real phone/voice calls · real identity verification · payments · full knowledge graph · true RL training · multi-language UI · push notifications.
