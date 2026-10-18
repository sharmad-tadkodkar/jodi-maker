# Jodi — performance & privacy benchmarks

Every number below was measured. Nothing is estimated.
- **Run:** Sat 18 Oct 2026, 10:37–10:50 UTC, against production (Cloud Run `asia-south1`, min 1 instance, so no cold starts).
- **Client:** a laptop over the public internet. Times are wall-clock and include the network round trip.
- **Raw data:** [`backend/bench/results/20261018-161946.json`](../backend/bench/results/20261018-161946.json).
- **Reproduce:** `cd backend && uv run python -m bench.benchmark` (script: [`backend/bench/benchmark.py`](../backend/bench/benchmark.py)).

**Sample sizes are small.** Each AI step costs model calls, so we used 4 new people: 24 intake replies, 4 cold searches
and 4 live interviews. Read these as indicative, not as statistically tight.

## The seeded world

| | Count |
|---|---|
| Seeded profiles (`seed/profiles.json`) | 62: 60 + 2 "new joiner" reserves (32 women, 30 men) |
| Plus the two hero profiles | Arjun, Meera |
| Live in the database during the run | 63 (one reserve not yet joined) |
| Cities | Bangalore 32, Kolkata 8, Mumbai 6, Pune 4, Delhi 4, Hyderabad 3, others |
| Aspects (facts with evidence) across the 62 | 690: 408 public · 206 matchmaker-only · **76 private** |

## Latency

| Step | n | Median | p90 | Max | Notes |
|---|---|---|---|---|---|
| Intake chat reply (reply + fact extraction) | 24 | **3.0 s** | 11.0 s | 15.4 s | min 2.1 s; occasional slow model calls |
| **Search for a new person** (filter → embeddings → AI scoring) | 4 | **15.4 s** | 21.0 s | 21.0 s | min 10.1 s; 63 profiles checked, 4–20 passed both sides' must-haves, 4–8 scored by AI |
| Search, already-scored candidates (Arjun) | 5 | 0.68 s | 0.76 s | 0.76 s | scores cached per pair |
| **Live AI-to-AI interview, end to end** | 4 | **123 s** | 156 s | 156 s | min 115 s; includes both briefs |
| ↳ 3 rounds, 12 agent turns + moderator | 4 | 77 s | 86 s | 86 s | |
| ↳ Both Match Briefs | 4 | 46 s | 76 s | 76 s | |
| Read pipeline / transcript / personas | 20 each | 0.21 / 0.05 / 0.07 s | 0.53 / 0.07 / 0.07 s | | |
| Demo soft reset | 3 | 0.49 s | 0.82 s | 0.82 s | |

Intake quality: after the same 6 scripted messages, the 4 people's profiles were **82–93% complete** and all reached "done".

## Privacy: do private facts leak?

**1. By construction (deterministic test, all profiles).**
[`tests/test_privacy_context.py`](../backend/tests/test_privacy_context.py) builds every prompt that speaks for or about a person to
the other side, for all 62 seeded profiles:
- what each interview agent is told about its own client;
- the dealbreaker list;
- how the person appears as the candidate in scoring and briefs.

**0 of 76 private facts appear in any of them.** To prove the test can fail, we ran the same check with private facts
deliberately included: it caught all 76.

**2. In generated output (LLM-judged).** For each interview, Gemini (`gemini-3.6-flash`, temperature 0) read the full
transcript plus the brief written for the *other* person. It was asked whether any private fact, or its substance, was
revealed, and to quote the words if so. An exact-substring check ran as well.

| Interviews | Private facts checked | Flagged |
|---|---|---|
| 4 new live interviews (new person ↔ seeded candidate) | 8 | **0** |
| 2 pre-computed hero interviews (Arjun–Meera, Arjun–Riya) | 8 | 3, explained below |

All 3 flags are about two Arjun facts: his joint family and wanting an ambitious partner. Both are **public in the seed data**,
and the hero conversations were generated while they were public. Someone later switched them to *Private* on the /me page
in the shared demo database. So the model didn't leak anything. The real finding is a **product gap**: changing a
fact to private doesn't remove it from conversations and briefs that were already written. Fix options: regenerate,
or warn on the /me page that the change applies to future conversations only.

The 4 new people each had 1 private fact from intake (an education loan; a parent's hospital bills), and their candidates
each had 1. None appeared in a transcript or brief.

Exact-substring matches: 0 across all 6 interviews.

## Models

| Tier | Model (fallback) | Used for |
|---|---|---|
| fast, thinking off | `gemini-3.5-flash` (`-lite`) | intake chat + extraction, moderator, Jodi Week prompts, learning loop |
| reason | `gemini-3.6-flash` (`3.7-flash`) | compatibility scoring, interview agents, leak judge (benchmark only) |
| smart | `gemini-3.1-pro-preview` (`3.6-flash`) | Match Briefs, seed generation |
| embeddings | `text-multilingual-embedding-002`, 768-d | semantic ranking |
