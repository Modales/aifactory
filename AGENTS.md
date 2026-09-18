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
- `OPENROUTER_API_KEY` (OpenRouter, https://openrouter.ai/settings/keys) — only used by the post-workout LLM coach summary feature. **Not required at boot**: the app renders and works without it; only `POST /api/workout/generate-summary` needs it. Delivered via `/run/base44/app.env`.
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
- The README's simulation-only status is stale: `usePoseTracking` runs MediaPipe in the browser, with client-side exercise/rep analysis. `usePoseTelemetry` only publishes when `VITE_POSE_WS_URL` is configured; the Base44 compose does not configure it.
- Social API routes already exist under `/api/social` for activities, follows, kudos, comments, clubs and challenges. Reuse and audit these rather than introducing a second social backend.
- Multi-camera analysis deliberately trims every stream to their common timeline before classification, rep counting, and scoring; supplied offsets are alignment inputs, not automatic synchronization.
- Form-analysis range uses a low percentile to reject isolated landmark outliers while the rep state machine retains its three-frame hysteresis gates.
- `pose-rules-2.0` (`server/app/analysis/`): `features.py` = per-frame angles/ratios; `library.py` = ~100 data-driven exercise specs (signature bands → classifier, primary joint + hysteresis gates → rep segmenter, templated checks → grading, muscle priors → heatmap) and `learn()` which derives a spec from an athlete's own reps; `engine.py` = classify/segment/grade. Variants (back/front/goblet squat…) share a parent signature and are offered as one-tap `alternatives` rather than guessed. Custom exercises live in `custom_exercises` per user and are merged into the library on every `/api/analysis/*` call (`user_library()`). Frontend: `ExercisePicker` (search) → `SetupPanel`; `LiveHud`/`SavePanel` confirm variants; `TeachExercisePanel` posts the captured landmark streams to `POST /api/analysis/exercises` and the set is re-scored as the new exercise.
- `pose-rules-1.2`: every check is graded 0–100 by distance outside its target band (`graded()` in `server/app/analysis/engine.py`); cues quote the measured angle/seconds. Lockout targets sit at the segmenter's extension gate (150–155°) because a rep closes the moment the joint re-crosses it. Reports carry `focus` (per-check fail counts) and `headline`.
- Saved analysis workouts get their muscle heatmap from `server/app/muscle_load.py::estimate_muscle_load`, a server copy of `src/lib/muscleModel.ts` demand priors — keep the two tables in sync.
- `/session` is the Strava-style record flow (`src/components/analysis/`): setup → record → review/save (+ optional feed post). `?demo=1` still loads the legacy simulated session.
- Revalidated Base44 compose on 2026-09-16: PostgreSQL and API health checks pass; port 3000 serves Vite source modules. On first boot, wait for the web dependency install after `compose up` returns.
