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

- 4 px base (Tailwind's scale). Page gutter `px-4`; content column `max-w-2xl mx-auto`.
- Vertical rhythm: `space-y-6` between blocks on a screen, `space-y-8` on long pages, `space-y-3`–`4`
  inside cards. Card padding `p-5` (`p-4` for dense list rows).
- Sticky header at the top (`z-20`); on mobile a fixed bottom tab bar (`z-20`, ~64 px). Anything sticky at
  the bottom of a page (decision bars, composers) sits at `bottom-16 sm:bottom-4` with `z-10` so it clears
  the tab bar. Pages reserve space with `pb-28 sm:pb-12`.
- Tap targets ≥ 44 px (`min-h-11` on buttons).

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

Shared non-UI pieces: `LearningCard`, `ReasonSheet`, `FitRadar` (`components/`).

## Motion

- `animate-[fadeUp_.35s_ease-out]` for things that arrive (chat bubbles, learned notes, cards after an action).
- Progress bars and rings animate width / dash offset over 700 ms. Nothing bounces except the typing dots.

## Voice in the UI

- Jodi speaks in the first person ("I've moved 2 people up"), warmly and briefly.
- Errors are calm and never show raw server text: "Your matchmaker hit a snag — please try again." Backend
  403/409 `detail` messages are written for people and may be shown.
- Never reveal that someone passed. Avoid gendered pronouns for the other person in generic copy ("their").

## Don'ts

- No raw hex or default Tailwind colours in components — add a token here first.
- No red, no swipe/feed patterns, no badges that count or rank people publicly.
- Don't put text on `-500` colours, and don't use gold/amber for errors.
