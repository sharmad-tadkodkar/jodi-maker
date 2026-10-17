# Jodi — demo flow (video + live presentation)

Built from the current code (frontend `66d4857`, backend `924d97b`). It follows the 3-minute script in SPEC §10.
Screens are the partner's frontend; **D** = the hidden director's panel at `/demo`.

## 0. Setup (once per recording session, ~2 min)

```bash
cd frontend
echo "VITE_API_URL=https://jodi-api-560807723160.asia-south1.run.app" > .env.local
npm run dev -- --port 5180                     # http://localhost:5180
```

1. Open `http://localhost:5180/demo` → **Full reset…** → *Yes, full reset* (~15 s). This gives a fresh world:
   62 profiles, heroes in their starting state, and both "new joiner" reserves available.
2. Create a **fresh person for the intake scene**. The seeded Arjun already has a full profile, so his chat
   would open at "90%". Create a separate one; it shows up in the persona list:
   ```bash
   curl -s -X POST https://jodi-api-560807723160.asia-south1.run.app/users \
     -H 'Content-Type: application/json' -d '{"name":"Arjun Intake","gender":"male"}'
   ```
3. On **D**, press **Someone just joined** once. Niharika (UX researcher, Bangalore) joins, and she'll appear
   with a **New** badge when Arjun runs his search.
4. Browser at phone width (~400 px) or a clean desktop window; zoom 110–125% so text reads well on video.

**Before every take:** on **D**, run **Soft reset (~2 s)**, then pick *Viewing as → Arjun Mehta*. The status strip
should read: *Arjun Mehta — Searching · 8 in queue · brief waiting · Hero match: Briefed*.
(Niharika stays in the world after a soft reset, so the next search still shows her as new.)

## 1. The story — 0:00–0:25 · `/`

- Open **Home**. Scroll slowly through *Where Jodi comes from*: the father's five steps, each mapped to a Jodi
  feature, then *How it works*.
- VO: the father's story; the profile flood; "Jodi turns that father into a matchmaker everyone gets."

## 2. Getting to know Arjun — 0:25–1:00 · `/onboard` → `/me`

- Persona: **Arjun Intake**. Go to **Chat**. Jodi greets him.
- Paste these one at a time (each reply takes ~3 s; cut the waits in the edit). Watch the
  **"Jodi noted · …"** chips and the **"knows you N%"** bar climb:
  1. `I'm 28, software engineer in Kolkata, B.Tech. Gujarati family but we've been in Kolkata for three generations. I speak English, Hindi, Bengali and Gujarati. Never married, I eat non-veg.`
  2. `I live with my parents and my dadi — we watch every cricket match together. I'm moving to Bangalore next year, the transfer is confirmed. I'd like my partner in Kolkata or Bangalore, aged 24 to 30.`
  3. `Family matters a lot to me, but I don't want someone who just fits in — I want someone with her own ambitions. Honestly, ideally we'd stay with my parents for the first year.`
  4. `Sunday mornings are football, then I cook thepla for everyone. I trek every year. When we disagree I need ten minutes to cool off, but I never go to bed angry.`
  5. `Culturally Hindu — Diwali is big at home, but no daily puja. I still have two years left on my education loan and I send money home every month.`
  6. `Smoking is a hard no for me. My grandfather had lung problems.`
- When **"I know enough to start looking 💛"** appears, tap **See what I learned about you** (`/me`). Show:
  - aspects grouped by topic, each with its *evidence quote*;
  - the **visibility toggle** (public / agent-only / private). Point at the **loan → private** item:
    "My matchmaker uses it, but it never leaves Jodi";
  - **Your must-haves** (the hard filters it extracted) and **What matters most to you** (weights).
- VO: "No forms. A conversation, like with a family elder, and I control who sees what."

> If a reply is slow, keep going: the take is edited anyway. If the chat isn't done after message 6, send one
> more line about career ("I want to lead a team in three years, but I protect my weekends").

## 3. Scout → matchmakers talk → the brief — 1:00–1:45 · `/pipeline` → brief → transcript → brief

- Switch persona to **Arjun Mehta** (the seeded one; the voiceover carries on as "Arjun").
- **Matches** → **Find new matches**. Live progress text, then the **Today's search** card: profiles checked → passed
  the filters → excluded for dealbreakers, with **Niharika (New)** in the queue (~5–10 s).
- The queue: **Meera S. 90%** on top (Briefed), with mini-bars per dimension; Niharika, Bhavna, Riya and others below.
- Tap Meera's card (**Read brief →**) → at the bottom of the brief, **Read the full matchmaker conversation →**
  (or open `/brief/m_arjun__meera/transcript` directly to show the conversation first). Press **Replay**: 12 turns animate in (~1 s each) across three rounds
  (Family → Getting to know them → Closing), with green and yellow highlights and round summaries. Speed it up 2–3× in the edit.
  Point out: "Does Meera smoke?" is *asked*, never "Arjun's dealbreaker is smoking". The education loan never comes up.
- Tap **Read the brief**: compatibility + **Why you fit** radar, **Green flags** and **Worth exploring** (each with a
  quote from the conversation), **Questions only you can ask**, and **For your family** (a paragraph for his parents).
- VO: "Before Arjun ever sees her, his matchmaker interviewed hers, the way my father called their family first."

## 4. Mutual → Focus Week — 1:45–2:20 · brief → **D** → `/mutual` → `/focus`

- On the brief, tap **I'm interested** → *"Your interest is with Jodi"*. (Meera can now see *her* brief about Arjun.
  Before this, it didn't exist for her.)
- **D** → *Their response* → **Meera says Interested**. The app jumps to **It's mutual 💛** → **Start Focus Week with Meera**.
- **Focus Week**: *Day 1 of 7*, **Today's prompts** ("Practical things"), all written from both briefs. Tap one
  and it lands in the chat.
- Optional reply: switch persona to **Meera Sen** (the page reloads), open the same Focus Week, answer, then switch back.
- VO: "One person, one week. Both searches pause, and they disappear from everyone else's queue."

## 5. Decide → learn → next — 2:20–2:45 · **D** → `/focus` → learning card → `/brief`

- **D** → **Jump to Day 7** → back on Focus Week: **Time to decide** (*Move forward with Meera* / *Take one more week* / *End it kindly*).
- Tap **End it kindly** → *"What made you decide to stop with Meera?"* → **Other** →
  `She wants to stay in Bangalore for good; I'd like to be near my parents in Kolkata eventually` → **End Focus Week**.
- *"Your matchmaker is thinking about this…"* (~3–5 s), then the **What I learned about you** card:
  - one line (e.g. *"…returning to Kolkata for your parents is your long-term plan. I've moved 2 candidates up."*);
  - before/after weights;
  - *Also noted on your profile:* a new location aspect.
- **See my next brief** → **Riya's brief** appears instantly (pre-computed). Optionally flash **Me → What I've
  learned from your decisions**.
- VO: "Every decision teaches Jodi. Nobody waits forever: briefs expire and weeks end."

**Alternative happy ending** (for the live presentation): at Day 7 tap **Move forward with Meera** → *"Jodi will let you know…"* →
switch persona to Meera → **Move forward with Arjun** → 🎉 **We're moving forward**. Both searches stop.

## 6. Architecture — 2:45–3:00 (slide)

Gemini on Vertex AI: 3.5 Flash for chat, extraction, moderation, the deck and learning; 3.6 Flash for scoring and the agents;
3.1 Pro for briefs. text-multilingual-embedding-002. FastAPI on Cloud Run, Firestore, React on Firebase Hosting.
Safety: agents disclose they're AI; private facts never enter an agent's context; caste is never inferred; there's a
one-click "delete everything"; and data minimisation in line with the DPDP Act.

---

## Dry run — Sat 18 Oct, phone width, against prod ✅

Every scene ran end to end in the browser, with these results:
- Intake reached 93% after the 6 scripted messages. The loan was stored as **private**, and the live-with-parents
  wish and the smoking dealbreaker as **matchmaker-only**.
- The search card read "checked 63 profiles → 16 met your must-haves · 1 new · strongest: Meera, Niharika, Bhavna".
- Replay, the brief, I'm interested, Meera says Interested → It's mutual → Day 1 prompts → a tapped prompt → chat all worked.
- Jump to Day 7 → End it kindly (Other + text) → learning card (Location +, "moved 2 candidates up") → Riya's brief.

Fixed after the run (backend, redeployed):
- The intake reply re-greeted with "Namaste" mid-chat.
- A family member's health detail was stored as a public aspect. Health is now private, and reasons are kept as evidence.
- The learning loop could slash an unrelated weight (Communication −10 on a location reason). Now only the
  dimensions the reason points at go up, and the rest rebalance proportionally.
- "reading 1 profiles" → "reading 1 profile".
- New compatibility reasons address the viewer as "you". The frozen Arjun–Meera reasons still say "he"; that's minor.

UI notes for the partner (optional polish):
- On phone width, the *Start Focus Week with Meera* button sits under the bottom tab bar until you scroll.
- The persona dropdown briefly shows a raw user ID (`u_arjun_…`) until the persona list loads.

## Timings to expect (live API)

| Action | Time |
|---|---|
| Soft reset / full reset | ~2 s / ~15 s |
| Intake reply | ~3 s (occasionally up to 10 s) |
| Find new matches (Arjun, cached) | ~1–10 s |
| Transcript / brief / mutual / focus / chat | instant |
| Stop or Pass with learning | ~3–5 s |
| A *live* interview (Interview top candidate, or Replay target interview live) | ~2 min |

## Don'ts on camera

- **Don't press "Replay target interview live"** on D for Arjun–Meera unless you mean to. It re-runs the real
  interview (~2 min) and replaces the reviewed transcript and brief until the next soft reset. The **Replay**
  button on the transcript page is the safe, client-side animation.
- Don't chat in `/onboard` as the seeded **Arjun Mehta**: it adds to his profile until the next *full* reset.
- The database is shared: tell your partner before resetting while they're testing.

## For judges trying it themselves

- The heroes are shared. If two people use Arjun at once they'll see each other's actions. **D → Soft reset** restores them.
- The frontend has **no "start as a new person" button yet**: a new user can only be created via `POST /users`
  (as in setup step 2). See the recommendation below.

## Recommended frontend additions before submission

1. **"Try it as a new person"** button on Home (and on D): `api.createUser({name, gender})` → `setUserId(id)` →
   `/onboard`. This gives judges a private path that doesn't collide with the heroes. It also replaces the curl in setup step 2.
2. D: a **"Meera continues"** shortcut is optional. A persona switch works today.
