# Jodi — demo

How to show Jodi in 3 minutes (video or live), and how a judge can try it themselves.
Screens are the React frontend. **D** = the hidden director's panel at `/demo` (not in the nav).

**Jodi Week**: once both people say yes, they get 7 days with each other only. Both searches pause, they chat with daily
prompts, and on Day 7 each chooses to move forward, take one more week, or end it kindly. (In code and the API it's still
`focus` / `focus_week`.)

## For judges: try it yourself (~5 min)

1. Open the app → **Try it as a new person** (on Home, or **+ Try it as yourself…** in the menu at the top).
2. Enter a first name and choose *A bride* / *A groom* → **Start talking to Jodi**.
3. Chat as yourself, real or made up: work, city, family, how you spend weekends, what you want in a partner,
   any dealbreakers. After each reply, watch the **"Jodi noted · …"** chips and the **"knows you N%"** bar.
4. When Jodi says **"I know enough to start looking 💛"**:
   - **See what I learned about you** shows every note with the quote it came from. Set each one to Shown, Matchmaker only or
     Private, edit it, or forget it.
   - **Start matching** → **Find new matches**: Jodi checks the 60-person world against both sides' must-haves and ranks the
     rest by fit.
5. On any queued card, **Let the matchmakers talk →** runs a live AI-to-AI interview (~2 min). Then read the brief.

Your person is private: you're matched against the seeded world, but you never appear in anyone else's search, so you
can't disturb the Arjun & Meera story or other judges. To watch the full story (mutual → Jodi Week → learning), switch the
menu at the top to **Arjun Mehta** and follow the script below.

## Setup (once per recording session, ~2 min)

```bash
cd frontend
echo "VITE_API_URL=https://jodi-api-560807723160.asia-south1.run.app" > .env.local
npm run dev -- --port 5180                     # http://localhost:5180
```

1. **D** → **Full reset…** → *Yes, full reset* (~15 s): fresh world, heroes in their starting state, both "new joiner"
   reserves available. This also wipes every person created with *Try it as a new person*.
2. **D** → **Someone just joined** once. Niharika (UX researcher, Bangalore) joins and shows a **New** badge in Arjun's next search.
3. Phone width (~400 px) or a clean desktop window; zoom 110–125% so text reads on video.

**Before every take:** **D** → **Soft reset (~2 s)** → *Viewing as → Arjun Mehta*. The status strip should read
*Arjun Mehta — Searching · 8 in queue · brief waiting · Hero match: Briefed*.

## The script

### 1. The story — 0:00–0:25 · Home

Scroll slowly through *Where Jodi comes from* (the father's five steps, each mapped to a Jodi feature) and *How it works*.
VO: the father's story; the flood of profiles; "Jodi turns that father into a matchmaker everyone gets."

### 2. Tell Jodi about yourself and watch it learn — 0:25–1:00 · `/start` → `/onboard` → `/me`

- Home → **Try it as a new person** → name *Arjun*, *A bride* → **Start talking to Jodi**.
- A real chat. Send these one at a time (each reply takes ~3 s; cut the waits in the edit), or speak as yourself:
  1. `I'm 28, software engineer in Kolkata, B.Tech. Gujarati family but we've been in Kolkata for three generations. I speak English, Hindi, Bengali and Gujarati. Never married, I eat non-veg.`
  2. `I live with my parents and my dadi — we watch every cricket match together. I'm moving to Bangalore next year, the transfer is confirmed. I'd like my partner in Kolkata or Bangalore, aged 24 to 30.`
  3. `Family matters a lot to me, but I don't want someone who just fits in — I want someone with her own ambitions. Honestly, ideally we'd stay with my parents for the first year.`
  4. `Sunday mornings are football, then I cook thepla for everyone. I trek every year. When we disagree I need ten minutes to cool off, but I never go to bed angry.`
  5. `Culturally Hindu — Diwali is big at home, but no daily puja. I still have two years left on my education loan and I send money home every month.`
  6. `Smoking is a hard no for me. My grandfather had lung problems.`
- Watch the **"Jodi noted · …"** chips and the bar climb (~85–93% after six messages). At
  **"I know enough to start looking 💛"** → **See what I learned about you**:
  - notes grouped by topic, each with its quote;
  - the **loan is Private** ("my matchmaker uses it, but it never leaves Jodi"); the live-with-parents wish and the smoking
    dealbreaker are **Matchmaker only**;
  - **Your must-haves** (extracted: 24–30, Kolkata/Bangalore) and **What matters most to you**.
- VO: "No forms. A conversation, like with a family elder, and I control who sees what."

> If the chat isn't done after message 6, add: `I want to lead a team in three years, but I protect my weekends.`

### 3. Scout → matchmakers talk → the brief — 1:00–1:45 · `/pipeline` → transcript → brief

- Menu at the top → **Arjun Mehta** (the seeded Arjun, with the reviewed hero data; the voiceover carries on as "Arjun").
- **Matches** → **Find new matches**. Live progress, then **Today's search**: profiles checked → met your must-haves → excluded
  for dealbreakers, with **Niharika (New)** in the queue (~5–10 s).
- Queue: **Meera S. ~91%** on top (*Brief ready*), with bars per dimension; Niharika, Bhavna, Riya and others below.
- Meera's card → **Read brief →** → at the bottom, **Read the full matchmaker conversation →** → **Replay**: the conversation
  animates in over three rounds (Family → Getting to know them → Closing), with green and yellow highlights and round
  summaries. Speed it up 2–3× in the edit. Point out: "Does Meera smoke?" is *asked*, never "Arjun's dealbreaker is
  smoking". The education loan never comes up.
- Back to the brief: compatibility and the **Why you fit** radar, **Green flags** and **Worth exploring** (each with a quote),
  **Questions only you can ask**, **For your family**.
- VO: "Before Arjun ever sees her, his matchmaker interviewed hers, the way my father called their family first."

### 4. Mutual → Jodi Week — 1:45–2:20 · brief → **D** → `/mutual` → `/focus`

- On the brief, **I'm interested** → *"Your interest is with Jodi"*. Only now can Meera see *her* brief about Arjun.
- **D** → *Their response* → **Meera says Interested** → **You and Meera both said yes** → **Start your Jodi Week with Meera**.
- **Jodi Week**: *Day 1 of 7* and **Today's prompts**, written from both briefs. Tap one and it lands in the chat.
- Optional: switch to **Meera Sen**, open the same Jodi Week, reply, switch back.
- VO: "One person, one week. Both searches pause, and they disappear from everyone else's queue."

### 5. Decide → learn → next — 2:20–2:45 · **D** → `/focus` → learning card → `/brief`

- **D** → **Jump to Day 7** → the Jodi Week opens on **Time to decide** (*Move forward with Meera* / *Take one more week* /
  *End it kindly*).
- **End it kindly** → *"What made you decide to stop with Meera?"* → **Other** →
  `She wants to stay in Bangalore for good; I'd like to be near my parents in Kolkata eventually` → **End Jodi Week**.
- *"Your matchmaker is thinking about this…"* (~3–5 s), then **What I learned about you**: one line (e.g. *"…returning to
  Kolkata to be near your parents is in your long-term plans… I've moved 1 candidate up."*), before/after weights (Location
  up ~8 points, the rest down 1–2), and a new Location note on the profile.
- **See my next brief** → **Riya's brief**, instantly (pre-computed).
- VO: "Every decision teaches Jodi. Nobody waits forever: briefs expire and weeks end."

**Happy ending** (live presentation): at Day 7 **Move forward with Meera** → switch to Meera → **Move forward with Arjun** →
🎉 both searches stop.

### 6. Architecture — 2:45–3:00 (slide)

Gemini on Vertex AI: 3.5 Flash for chat, extraction, moderation, the Jodi Week prompts and learning; 3.6 Flash for scoring
and the matchmaker agents; 3.1 Pro for briefs; text-multilingual-embedding-002. FastAPI on Cloud Run, Firestore, React.
Safety: agents disclose they're AI; private notes never enter an agent's context; caste is never inferred; one-click
"delete everything"; data minimisation in line with the DPDP Act.

## Timings (live API)

| Action | Time |
|---|---|
| Soft / full reset | ~2 s / ~15 s |
| Intake reply | ~3 s (occasionally up to 10 s) |
| Find new matches: Arjun (cached) / a new person | ~1–10 s / ~20–40 s (estimate, not yet timed) |
| Transcript, brief, mutual, Jodi Week, chat | instant |
| End it kindly / Pass, with learning | ~3–5 s |
| A live interview (*Let the matchmakers talk*, *Interview top candidate*) | ~2 min |

## Don'ts on camera

- Don't press **Replay target interview live** on **D** for Arjun–Meera unless you mean to: it re-runs the real interview
  (~2 min) and replaces the reviewed transcript and brief until the next soft reset. **Replay** on the transcript page
  is the safe, client-side animation.
- Don't chat in **Chat** as the seeded **Arjun Mehta**: it adds to his profile until the next *full* reset. Use
  *Try it as a new person* for the intake scene.
- The heroes are shared: two people using Arjun at once see each other's actions. **D → Soft reset** restores them. Tell your
  partner before resetting while they're testing.
