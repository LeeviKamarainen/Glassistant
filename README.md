# Glassistant

Magic-mirror-style home assistant. Raspberry Pi + monitor + two-way mirror eventually; for now this repo is the foundation: FastAPI backend, React frontend, a 3x3 widget grid with Clock / Date / Weather, and live layout sync via Server-Sent Events.

AI / Ollama integration, Google Calendar, camera, voice, and Pi deployment are tracked as later iterations — see `.claude/plans/yes-lets-plan-create-glowing-engelbart.md`.

## Stack

- **Backend:** Python 3.11+, FastAPI, uvicorn, stdlib `sqlite3` (no ORM).
- **Frontend:** Vite, React 18, TypeScript, Tailwind, React Router.
- **Persistence:** SQLite file in `backend/glassistant.db`.

## Local development (Windows)

Requires Python 3.11+ available as `py` and Node 20+.

### Backend

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

Backend serves on `http://localhost:8000`. Health check at `/healthz`.

> The plan originally specified `uv`. We use plain venv + pip here because uv isn't installed on this machine; switching later is a no-op since `pyproject.toml` is the source of truth either way.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend dev server runs on `http://localhost:5173` and proxies `/api` + `/api/events` to the backend.

Open two tabs:
- `http://localhost:5173/mirror` — the kiosk view
- `http://localhost:5173/admin` — the controller

### Tests

```powershell
cd backend
pytest
```

### Production-style serving (single process)

```powershell
cd frontend
npm run build
cd ..\backend
uvicorn app.main:app --port 8000
```

Then open `http://localhost:8000/mirror` — FastAPI serves the built frontend from `frontend/dist`.
