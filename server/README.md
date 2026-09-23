# aifactory backend

FastAPI service for FormFit AI.

## Endpoints

### Auth & profile

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/signup` | Create an account, returns a bearer token |
| `POST` | `/api/auth/login` | Exchange credentials for a bearer token |
| `GET` | `/api/auth/me` | Current authenticated user |
| `GET` | `/api/users/me/profile` | Read the stored onboarding profile |
| `PUT` | `/api/users/me/profile` | Persist the onboarding wizard's Q&A responses |

Known fields (goal, experience, age, height, weight, training days, primary exercises,
injuries, equipment) are typed columns; anything else the wizard collects goes into the
`onboardingAnswers` JSON blob, so new questions do not need a migration.

Passwords are stored as PBKDF2-HMAC-SHA256 with 600,000 iterations and a per-user salt.
Tokens are HS256 JWTs — set `JWT_SECRET` in production.

### Workout capture

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/workout/session` | Store completed workout telemetry on "End Session" |
| `GET` | `/api/workout/summary/{id}` | Full session data for the summary screen |

The bearer token is optional here. Sent with one, the session is owned by that user and
becomes private; sent without, the session stays anonymous and behaves as it did before.

### History

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/workouts/history` | Paginated past workouts (`exerciseId`, `since`, `until`, `limit`, `offset`) |
| `GET` | `/api/workouts/history/{id}` | One past workout with its full rep array |
| `GET` | `/api/workouts/history/{id}/telemetry` | Rep-by-rep telemetry log + flaw counts (`severity` filter) |
| `GET` | `/api/workouts/stats` | Totals, per-exercise breakdown and top flaws for the terminal UI |

All four require a bearer token and only ever return the caller's own sessions.

### LLM coach summary

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/workout/generate-summary` | Queue a summary job, returns `202` with a `jobId` |
| `GET` | `/api/workout/generate-summary/{jobId}` | Poll the job (`pending` / `running` / `complete` / `failed`) |
| `GET` | `/api/workout/{sessionId}/coach-summary` | Latest summary for a session |

The job runs off the request path, builds the coach prompt from the session's rep-by-rep
telemetry plus the lifter's profile, and calls the model through
[OpenRouter](https://openrouter.ai/models) — an OpenAI-compatible model gateway — so the response
lands as `{headline, summary, focusAreas, nextSession}`.

`COACH_MODEL` defaults to `anthropic/claude-sonnet-4.6`. Any OpenRouter chat-completions model works;
model ids are namespaced (`anthropic/...`, `openai/...`) and can be changed without code edits.

The reply is requested as `response_format: {"type": "json_object"}` and the JSON shape is
also stated in the prompt. If a model rejects `response_format` with a 400 the call is
retried without it, and the parser tolerates markdown fences and surrounding prose, so
swapping models does not break parsing.

Failures are recorded on the job rather than raised at the caller, and upstream errors are
translated into something actionable — an empty OpenRouter balance reports as
"The OpenRouter account is out of funds" rather than a bare upstream status.

The generator is injected via `create_app(coach_generator=...)`, so the suite runs without
touching the network or needing an API key.

## Run

```bash
cd server
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Windows
cp .env.example .env                            # set DATABASE_URL, JWT_SECRET, OPENROUTER_API_KEY
.venv/Scripts/python -m uvicorn app.main:app --port 4000
```

Interactive docs: <http://127.0.0.1:4000/docs>

## Test

```bash
.venv/Scripts/pip install -r requirements-dev.txt
.venv/Scripts/python -m pytest
```

Tests run against SQLite (aiosqlite), no PostgreSQL needed locally.

## Schema note

Tables are created with `Base.metadata.create_all` on startup. This release adds `users`,
`user_profiles`, `coach_summaries` and a nullable `workout_sessions.user_id`; an existing
PostgreSQL database needs that column added by hand before deploying.
