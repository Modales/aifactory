# aifactory backend

FastAPI service for FormFit AI.

- **Task 2 — DB Session Persistence:** `POST /api/workout/session` stores completed workout telemetry (rep-by-rep flaw arrays, form/effort scores) when the user clicks "End Session".
- **Task 3 — Summary REST Endpoint:** `GET /api/workout/summary/{id}` returns full session data for the summary screen.

## Run

```bash
cd server
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Windows
cp .env.example .env                            # set DATABASE_URL (PostgreSQL)
.venv/Scripts/python -m uvicorn app.main:app --port 4000
```

## Test

```bash
.venv/Scripts/pip install -r requirements-dev.txt
.venv/Scripts/python -m pytest
```

Tests run against SQLite (aiosqlite), no PostgreSQL needed locally.
