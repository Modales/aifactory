# FormFit AI — Base44 dev notes

## Architecture
- **Frontend**: Vite + React 19 + TypeScript (repo root). Runs on port 3000.
- **Backend**: FastAPI app in `server/` (`app.main:app`). Runs on port 8000.
- **Database**: PostgreSQL (compose `db` service, db `aifactory`). Tables auto-created on startup via `Base.metadata.create_all` — no migration step needed.
- Auth is bearer-token (JWT, HS256) stored in `localStorage` — no cookies, so separate origins work fine. CORS is `allow_origins=["*"]`.

## How the frontend reaches the backend
- `src/lib/api.ts` reads `import.meta.env.VITE_API_URL`, defaulting to `http://127.0.0.1:4000`.
- Compose passes `VITE_API_URL=https://8000-${BASE44_PUBLIC_HOST_SUFFIX}` to the web service so the browser calls the public API origin.

## Secrets
- `AIML_API_KEY` (AIML API, https://aimlapi.com) — only used by the post-workout LLM coach summary feature. **Not required at boot**: the app renders and works without it; only `POST /api/workout/generate-summary` needs it. Delivered via `/run/base44/app.env`.
- `JWT_SECRET` and `DATABASE_URL` are local/dev credentials generated inline in the compose file (not user secrets).

## Run
```
docker compose -f docker-compose.base44.yml up -d --build
```
Verify: `curl -sf http://localhost:3000/` (frontend) and `curl -sf http://localhost:8000/docs` (backend).

## Tests
- Frontend: `npm test` (vitest)
- Backend: `cd server && python -m pytest` (uses SQLite via aiosqlite, no Postgres needed)

## Quirks
- The backend `load_dotenv()` is a no-op in compose (no committed `.env`); config falls back to compose `environment:`.
- Vite config sets `server.host: true` and `allowedHosts: true` so the preview's external hostname is accepted.
- The README says AI analysis is simulated in the browser (`src/lib/simulation.ts`); the real pose model is not wired in.
