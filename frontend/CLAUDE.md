# Jodi frontend — notes for AI coding assistants

Read `../docs/FRONTEND_GUIDE.md` (how to build against the API) and `../docs/SPEC.md` §4–§5 (screens, UX).

- Stack: React 19 + Vite + TypeScript + Tailwind v4 + react-router-dom + recharts (radar chart).
- Call the backend ONLY through `src/api/client.ts`. Never edit `src/api/schema.ts` — it's generated
  from the backend contract via `npm run gen:api`.
- Only edit files under `frontend/`. The backend is owned by someone else.
- Don't hard-code match IDs; persona IDs `arjun` / `meera` are stable.
- UX: calm, warm, premium — not a dating app. One thing at a time. Mobile-first. Every AI output shows
  *why* (evidence, reasons).
- `npm run build` must pass (it type-checks) before committing.
