# Jodi design system

Calm, warm, premium — **not a dating app**. One thing at a time, mobile-first, and every AI output shows
*why*. This file is the source of truth for how the frontend looks; the tokens live in
[`frontend/src/index.css`](../frontend/src/index.css) and the components in
[`frontend/src/components/ui.tsx`](../frontend/src/components/ui.tsx). Use tokens and components — never raw
hex values or Tailwind's default palette.

## Colour

### Tokens

| Token | Hex | Use |
|---|---|---|
| `cream` | `#fbf7f2` | Page background (ivory) |
| `sand` | `#f1e9df` | Quiet fills: tracks, muted chips, inset panels |
| `line` | `#e6dccf` | Hairline borders, dividers |
| `ink` | `#2b2420` | Body text, headings |
| `muted` | `#72655b` | Secondary text, captions, evidence quotes |
| `brand-50` / `100` / `200` | `#fbf1f2` / `#f5dfe2` / `#ebbdc4` | Brand tints: selected states, avatar fill, disabled primary |
| `brand-500` | `#a8434f` | Score bars, radar, rings, focus borders |
| `brand-600` | `#8e3440` | **Primary** — buttons, links, my chat bubbles, percentages |
| `brand-700` | `#742a35` | Hover / pressed primary, text on brand tints |
| `gold-100` / `500` / `700` | `#f6ecd4` / `#c09a4a` / `#836422` | Accent: eyebrows, "New", learning card, family notes |
| `sage-50` … `700` | `#f1f6f1` `#e3eee4` `#6a9470` `#4f7a56` `#3d5f43` | Green flags, verified, positive outcomes |
| `amber-50` … `700` | `#fdf6e9` `#f7ead2` `#d39a3a` `#b07a1e` `#8a5a14` | Worth exploring — open questions, never errors |
| `teal-50` … `700` | `#eef6f6` `#d6ebea` `#3f8f8b` `#2f726f` `#245a58` | Secondary — **their matchmaker** / the other side |

Tailwind's own `amber-*` and `teal-*` are cleared, so only the shades above exist.

### Semantic colours — each colour has one job

| Meaning | Colour | Where |
|---|---|---|
| Primary action, "mine", scores | brand (maroon) | Primary buttons, my matchmaker, my chat bubbles, fit % |
| Accent, warmth, learning | gold | Eyebrows, "New" chip, "What I learned" card, family notes |
| Green flag / positive | sage | Brief green flags, transcript `highlight: green`, verified badge |
| Worth exploring | amber | Brief "worth exploring", transcript `highlight: yellow` |
| Their matchmaker / other side | teal | Their matchmaker's avatar in the transcript |
| Errors | brand-50 fill + brand-700 text | Calm messages only — no red |

Amber means "talk about this", not "danger". There is no red in Jodi.

### Contrast (WCAG AA ≥ 4.5:1 for small text)

| Text on background | Ratio |
|---|---|
| ink on cream | 14.3 |
| muted on cream / white / sand | 5.3 / 5.6 / 4.7 |
| white on brand-600 | 7.7 |
| brand-700 on brand-50 | 8.9 |
| gold-700 on gold-100 | 4.7 |
| sage-700 on sage-100 | 6.0 |
| amber-700 on amber-100 | 5.0 |
| teal-700 on teal-100 | 6.3 |

Chip text always uses the `-700` shade on its `-100` tint. `sage-500`, `amber-500`, `teal-500` and
`gold-500` are for dots, rings and borders — not text.

## Typography

- **Display:** Fraunces (`font-display`) — headings, names, big numbers, quotes.
- **Body:** Inter (`font-sans`, default) — everything else.
- Both load from Google Fonts in `index.html`.

| Role | Classes |
|---|---|
| Hero (landing) | `font-display text-4xl sm:text-5xl leading-[1.1]` |
| Page title (`PageHeader`) | `font-display text-3xl leading-tight` |
| Section title (`SectionTitle`) | `font-display text-xl` |
| Card lead / big statement | `font-display text-lg` – `text-xl` |
| Eyebrow | `text-xs font-medium uppercase tracking-[0.14em] text-gold-700` |
| Body | `text-sm` (default reading size), `leading-relaxed` for paragraphs |
| Caption / meta | `text-xs text-muted`; `text-[11px]` only for labels under bubbles and bars |
| Evidence / quotes | `text-sm italic text-muted` |
| Numbers | `tabular-nums`; percentages in `font-display` |

## Spacing & layout

- 4 px base (Tailwind's scale). Page gutter `px-4`, `lg:px-8`.
- **Breakpoints:** below `md` (768 px) is mobile — bottom tab bar. From `md` the nav moves inline into the
  header and the tab bar is hidden. From `lg` (1024 px) screens use multi-column layouts.
- **Content width:** Home, Pipeline, Brief, Transcript and Chat use `max-w-6xl` (they have desktop layouts);
  other screens keep the `max-w-2xl` reading column. Conversations (Transcript, Chat) cap the thread at
  `760px` with a 280 px side panel from `lg`.
- **Desktop patterns:** Pipeline is a 2-column card grid from `md` (compact cards: avatar, name, facts,
  `ScoreRing`, top-2 strength chips, status; tap the summary to expand the six dimension bars; `briefed`
  cards sort first with a gold border, the first one labelled "Next up"; framer-motion `layout` animates
  re-ordering and expansion, honouring reduced motion); Brief is a sticky 300–340 px left column
  (profile, `ScoreRing`, fact chips, decision buttons) + content; Transcript shows round progress and Chat
  shows intake progress in a sticky side panel. Sticky columns sit at `top-20` (header is 56 px).
- Vertical rhythm: `space-y-6` between blocks on a screen, `space-y-8` on long pages, `space-y-3`–`4`
  inside cards. Card padding `p-5` (`p-4` for dense list rows and side panels).
- Sticky header at the top (`z-20`, 56 px); on mobile a fixed bottom tab bar (`z-20`, ~56 px). Anything
  sticky at the bottom of a page (decision bars, composers) sits at `bottom-16 md:bottom-4` with `z-10` so it
  clears the tab bar; on Brief the decision bar is `fixed` above the tab bar with a spacer measured to its live height (so even the
  open Pass sheet never covers content), and `lg:hidden` — from `lg` the buttons live in the sticky left column,
  which scrolls on its own (`max-h-[calc(100dvh-6rem)]`) on short screens.
  `<main>` reserves space with `pb-28 md:pb-12`.
- Grids of cards use `grid-cols-1` explicitly — an implicit track lets `truncate` text push cards wider
  than the screen.
- Tap targets ≥ 44 px (`min-h-11` on buttons).

## Dimension palette (data)

The six fit dimensions are **categorical identity**, so they get their own fixed palette — never the semantic
colours above, never re-ordered, never assigned by rank. Tokens `--color-dim-*` / classes via
`DIMENSION_COLOR` in `lib/format.ts`.

| Dimension | Token | Hex |
|---|---|---|
| Values | `dim-values` | `#a8434f` |
| Family | `dim-family` | `#c08a1f` |
| Lifestyle | `dim-lifestyle` | `#2a7fb0` |
| Career | `dim-career` | `#d0612f` |
| Location | `dim-location` | `#8a4fb0` |
| Communication | `dim-communication` | `#3f9a55` |

Validated with the dataviz validator (light, white surface): lightness band, chroma floor and ≥ 3:1 pass;
worst adjacent CVD ΔE 17.0, normal-vision ΔE 20.2. On the sand bar track gold and green are 2.5–2.9:1, so
**bars always carry their label and value** (that's the required relief). Labels and numbers stay in text
colours; only the bar or dot carries the hue. Used by `ScoreBar` (`color` prop) and the strength dots on
pipeline cards. (The Brief radar is a single series and stays maroon.)

## Icons

- lucide-react via `Icon`. Visibility: `Globe` shown · `Sparkles` matchmaker only · `Lock` private
  (`VISIBILITY_ICON`). Aspect categories: `ASPECT_ICON` in `lib/icons.ts`. Dimensions: `DIMENSION_ICON` (Brief).

## Imagery

- **Files:** `frontend/public/avatars/` (256 px square WebP, q82) and `frontend/public/illustrations/`
  (≤ 1600 px wide WebP, q82). Sources live untracked in `frontend/src/assets/raw/`; the Gemini sparkle
  watermark is removed before export.
- **Avatars:** `avatarFor(userId, gender, photoUrl)` in `lib/avatars.ts` — profile photo, then
  `public/avatars/{userId}.webp` if that file exists (Arjun, Meera, or any you drop in — the
  `virtual:avatar-files` Vite plugin lists the folder at build time, so missing files are never requested;
  both Vite and Firebase would answer a missing file with index.html), then a seed portrait
  `avatar-{w|m}-1..9` chosen by gender + FNV-1a hash of the user id. Candidates' gender = the viewer's `seeking_gender` (`useViewerGenders`).
  Unknown gender → the `Avatar` letter fallback. Avatars are always shown round.
- **Matchmakers:** `MATCHMAKER_AVATAR.mine` = maroon paisley (`agent-a`), `.theirs` = teal paisley
  (`agent-b`) — chosen by mine/theirs, not by the interview's `agent_a`/`agent_b` slot.
- Illustrations are decorative: `alt=""`, never the only carrier of meaning. In use: `hero-father`
  (`-mobile` under 768 px via `<picture>`) on Home, `step-1..5` in "How it works". Not yet used: `value-1..3`,
  `scouting`, `empty-queue`, `mutual`, `focus-week`, `learning`, `og-image`.
- **Loading:** every `<img>` is WebP with `width`/`height` (no layout shift) and `loading="lazy"` —
  except the Home hero, which is the LCP image: eager + `fetchpriority="high"`.

## Shape & elevation

| Element | Radius | Other |
|---|---|---|
| Card | `rounded-2xl` | `border border-line bg-white shadow-card` |
| Button, chip, pill toggles, avatars | `rounded-full` | |
| Inputs, inset panels, small notes | `rounded-xl` | inputs: `border-line bg-cream`, `focus:border-brand-500` |
| Chat bubbles | `rounded-2xl` with the speaker-side corner `rounded-br-sm` / `rounded-bl-sm` | |

`shadow-card` is a 1 px whisper; use `shadow-lg` only for floating bars (decision bar, composer).

## Components (`components/ui.tsx`)

| Component | Props | Notes |
|---|---|---|
| `Button` | `variant: primary \| secondary \| ghost`, `busy` | Primary = maroon fill; secondary = white + hairline; ghost = maroon text. `busy` shows a spinner and disables. One primary per view. |
| `Card` | `className` | The default container. |
| `Chip` | `tone: brand \| gold \| sage \| amber \| teal \| muted` | Status and small labels. `-100` fill, `-700` text. |
| `Avatar` | `name`, `src?`, `size: sm \| md \| lg \| xl` (32/48/64/80 px), `tone: brand \| teal` | Shows the photo when `src` loads, otherwise the first letter. Decorative (`aria-hidden`) — always show the name next to it. `tone="teal"` for the other side. |
| `ScoreRing` | `value` (0–100), `size` (px, default 56), `stroke`, `label?`, `tone` | Circular score. Pass percentages (`pct()` from `lib/format` for raw scores). The label shows inside when `size ≥ 64`. |
| `ScoreBar` | `label`, `value` (0–100), `title?` | Thin per-dimension bar; `title` carries the reason. |
| `Icon` | `icon` (a lucide-react component), `size: xs \| sm \| md \| lg` (14/16/20/24 px), `label?` | Stroke 1.75 (2.25 at `xs`). Decorative unless `label` is set. Import glyphs from `lucide-react` and pass them in: `<Icon icon={Heart} />`. |
| `VerifiedBadge` | — | Sage `BadgeCheck` + "Verified". |
| `PageHeader` | `eyebrow?`, `title`, children (subtitle) | Top of every main screen. |
| `SectionTitle` | children | Card / section heading. |
| `Loading`, `ErrorState`, `Spinner`, `Typing` | | `ErrorState` shows calm copy only (see below). |

Shared pieces in `components/`: `LearningCard`, `ReasonSheet`, `FitRadar` (radar; shortens "Communication"
to "Comms" under 400 px so it isn't clipped), `PersonaMenu` (avatar pill + dropdown in the header),
illustrations are plain `<img>`s (see Imagery).

## Brief patterns

- **Snapshot:** lead sentence as a 2-line serif pull-quote (gold rule), gold fact chips found in the text
  (`lib/snapshot.ts` — literal matches only: hometown, interests), full text behind "Read more".
- **Why you fit:** radar (single series, maroon with gold vertices) + rows: icon, dimension dot, label, score pill,
  one-line reason.
- **Green flags / Worth exploring:** one tinted card per item — `sage-50` + `CircleCheck` / `amber-50` + `Compass`;
  claim `font-semibold`, evidence muted italic.
- **Questions only you can ask:** gold note cards with a Copy button (clipboard API; calm fallback text if refused).

## Transcript patterns

- **Bubbles:** matchmaker avatar (paisley badge) + speaker name + an "AI matchmaker" tag on every turn. Mine:
  `bg-brand-50` / `border-brand-100` with ink text (never solid maroon — long text must stay readable); theirs:
  white with `border-line`. Moderator lines: centred muted italic.
- **Key moments:** 3 px left border (`sage-600` green flag, `amber-600` worth exploring — both ≥ 3:1) plus a tag
  "Key moment · Green flag / Worth exploring" inside the bubble, so the meaning never rests on colour.
- **Rounds:** each round is a collapsible section (header button with `aria-expanded`, line and highlight
  counts); collapsed, it shows the round summary. A stepper at the top (Family → Getting to know → Closing:
  done ✓ / live / up next) jumps to and re-opens a round; the desktop side panel uses the same round states.

## Chat (intake) patterns

- **History:** renders `intake_messages` as-is. Aspects Jodi already holds (seeded profiles, earlier sessions)
  appear in a collapsible "What you've already told Jodi" notes card — never re-written as fake chat turns.
- **Topics:** one chip per aspect category under the progress bar (swipeable single row on mobile, wrapped in
  the desktop panel); lit (gold, ✓) once an aspect exists or the latest reply no longer lists it as missing;
  a newly lit chip gets a gold ring and scrolls into view.
- **Composer:** the chat column is at least one screen tall, so the composer sits at the bottom above the tab
  bar even in a short conversation, and sticks there in a long one. Send is neutral (sand) when empty and
  full maroon once there's text. Jodi "typing" is a dots bubble with the matchmaker avatar.
- Absolutely positioned children (e.g. `sr-only` text) inside a scrolling row need a `relative` scroll
  container, or they escape its clipping and widen the page.

## Motion

- `animate-[fadeUp_.35s_ease-out]` for things that arrive (chat bubbles, learned notes, cards after an action).
- Scroll-reveal uses `<Reveal>` (components/Reveal.tsx): visible by default; JS hides a section only when
  motion is allowed, IntersectionObserver exists and it starts below the fold; reveals at 5% (10% early
  margin), with a 2.5 s timer fallback. Never hide above-the-fold content.
- Page sections enter with `.rise` + `--rise-i` (70 ms stagger). It's defined only under
  `prefers-reduced-motion: no-preference`, so the resting state is always visible — never hide content
  behind an animation (no JS-driven `opacity: 0` initial states).
- Progress bars and rings animate width / dash offset over 700 ms. Nothing bounces except the typing dots.
- Lists that re-order (Pipeline) use framer-motion `layout` (spring, ~0.3 s) inside
  `<MotionConfig reducedMotion="user">`; expanding content animates height over ~220 ms. Use framer-motion
  only where layout changes — CSS for everything else.

## Voice in the UI

- Jodi speaks in the first person ("I've moved 2 people up"), warmly and briefly.
- Errors are calm and never show raw server text: "Your matchmaker hit a snag — please try again." Backend
  403/409 `detail` messages are written for people and may be shown.
- Never reveal that someone passed. Avoid gendered pronouns for the other person in generic copy ("their").

## Don'ts

- No raw hex or default Tailwind colours in components — add a token here first.
- No red, no swipe/feed patterns, no badges that count or rank people publicly.
- Don't put text on `-500` colours, and don't use gold/amber for errors.
