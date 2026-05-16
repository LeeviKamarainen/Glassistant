# Glassistant — CLAUDE.md

## What this project is

A wall-mounted "magic mirror" home assistant. A Raspberry Pi drives a monitor behind a two-way mirror; widgets are arranged on a dynamic 3×3 grid. An AI agent (later iteration) running on a separate desktop via Ollama can rearrange the dashboard, answer questions, read camera input, and use tools.

Development is on Windows; Pi deployment is a later iteration.

## Architecture ground rules

- **Pi stays lean.** No ML/torch/transformers/vector DBs in the Pi process. Anything model-related is offloaded to the desktop over HTTP. The mirror bundle (`/mirror`) is aggressively code-split away from `/admin`.
- **Swappable backends.** LLM, vision, STT, TTS, wake-word — each fronted by a Python interface so the implementation can move on-device without restructuring callers.
- **One React app, two routes.** `/mirror` is the kiosk view (lean bundle, lazy-loaded). `/admin` is the responsive controller (heavier). Both share the widget library.
- **SQLite is the source of truth.** All layout and settings changes go through the backend, which broadcasts via SSE to subscribed clients.
- **SSE not WebSocket.** Backend → client push uses Server-Sent Events. Admin → backend is plain HTTP.
- **No ORM, no Alembic.** Plain `sqlite3`, hand-written SQL, numbered migration files in `backend/migrations/`.

## Repository layout

```
glassistant/
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py            # FastAPI factory, lifespan, static mount
│   │   ├── config.py          # pydantic-settings, .env loader
│   │   ├── db.py              # sqlite3 helpers, migration runner
│   │   ├── events.py          # SSE broadcaster (asyncio.Queue per subscriber)
│   │   ├── dependencies.py    # FastAPI Depends helpers (get_db, get_broadcaster)
│   │   ├── routers/
│   │   │   ├── layout.py      # GET/POST/PATCH/DELETE widgets, reset
│   │   │   ├── events.py      # GET /api/events (SSE stream)
│   │   │   ├── weather.py     # GET /api/weather (Open-Meteo proxy + cache)
│   │   │   └── settings.py    # GET /api/settings, PUT /api/settings/{key}
│   │   ├── repositories/
│   │   │   ├── widgets.py     # SQL CRUD for widgets table
│   │   │   └── settings.py    # SQL CRUD for app_settings table
│   │   ├── schemas/
│   │   │   ├── widget.py      # Pydantic models for widgets
│   │   │   └── settings.py    # Pydantic models for settings; KNOWN_THEMES, KNOWN_EFFECT_STYLES
│   │   └── services/
│   │       └── weather.py     # httpx Open-Meteo client, in-memory TTL cache
│   ├── migrations/
│   │   ├── 001_init.sql       # widgets table + position index
│   │   ├── 002_settings.sql   # app_settings table (key/value), theme default
│   │   └── 003_effect_style.sql  # seeds weather_effect_style default
│   └── tests/
│       ├── conftest.py
│       ├── test_layout_api.py
│       └── test_weather_cache.py
├── frontend/
│   ├── vite.config.ts         # proxies /api → backend:8000 in dev
│   ├── tailwind.config.js
│   └── src/
│       ├── main.tsx           # router, lazy code-split Mirror/Admin
│       ├── routes/
│       │   ├── mirror.tsx     # kiosk view
│       │   └── admin.tsx      # control panel
│       ├── lib/
│       │   ├── api.ts         # typed fetch wrappers
│       │   ├── sse.ts         # EventSource hook with exponential backoff
│       │   ├── types.ts       # mirrors backend Pydantic shapes
│       │   ├── themes.ts      # ThemePalette definitions (mirror/moonlight/ember/forest)
│       │   ├── useTheme.ts    # theme state + SSE sync hook
│       │   └── useEffectStyle.ts  # weather effect style state + SSE sync hook
│       ├── components/
│       │   ├── Grid.tsx           # 3×3 CSS-grid layout container
│       │   ├── WeatherEffect.tsx  # Ambient weather overlay (CSS calm mode)
│       │   ├── WeatherEffectDynamic.tsx  # Canvas particle system (lazy-loaded)
│       │   └── widgets/
│       │       ├── registry.ts    # type → component map
│       │       ├── Clock.tsx
│       │       ├── DateW.tsx
│       │       ├── Weather.tsx
│       │       └── weather/icons.tsx  # WMO weather code → condition + SVG icons
│       └── styles.css
├── .env.example
├── .gitignore
└── README.md
```

## Dev workflow (Windows)

### Backend
```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

### Frontend
```powershell
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to :8000
```

Open `http://localhost:5173/mirror` and `http://localhost:5173/admin`.

### Tests
```powershell
cd backend
pytest
```

### Production build (single process)
```powershell
cd frontend && npm run build
cd ..\backend && uvicorn app.main:app --port 8000
# visit http://localhost:8000/mirror
```

SQLite file: `backend/glassistant.db`. Delete to reset all state.

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/layout` | Full widget list |
| POST | `/api/widgets` | Create widget |
| PATCH | `/api/widgets/{id}` | Update widget (partial) |
| DELETE | `/api/widgets/{id}` | Delete widget |
| POST | `/api/layout/reset` | Reset to default layout |
| GET | `/api/weather?lat=&lon=` | Open-Meteo proxy (10-min TTL cache) |
| GET | `/api/events` | SSE stream (`layout_changed`, `settings_changed`) |
| GET | `/api/settings` | Key/value settings dict |
| PUT | `/api/settings/{key}` | Update a setting |
| GET | `/healthz` | Health check |

## SQLite schema

- **`widgets`** — id, type, row, col, row_span, col_span, config_json, enabled, z_order, created_at, updated_at
- **`app_settings`** — key (PK), value — currently stores `theme` and `weather_effect_style`

Migrations live in `backend/migrations/` numbered `NNN_name.sql`. The migration runner in `db.py` tracks applied migrations in a `schema_migrations` table.

## Widget system

Adding a widget type requires:
1. A new React component in `frontend/src/components/widgets/`
2. An entry in `frontend/src/components/widgets/registry.ts`
3. No backend changes unless the widget needs its own data endpoint

## Themes

Four themes defined in `frontend/src/lib/themes.ts`: `mirror`, `moonlight`, `ember`, `forest`. Each has `bg`, `fg`, `accent` CSS variables. The active theme is persisted in `app_settings` and broadcast via `settings_changed` SSE events. Theme names must stay in sync between `themes.ts` and `backend/app/schemas/settings.py::KNOWN_THEMES`.

## Weather ambient effects

The `WeatherEffect` component renders a full-screen ambient overlay behind widgets on `/mirror`. Two modes:
- **calm** — pure CSS animations (rain drops, snowflakes, fog wisps, glow blobs)
- **dynamic** — canvas-based particle system (`WeatherEffectDynamic.tsx`), lazy-loaded only when selected

The active mode (`weather_effect_style`) is persisted in `app_settings` and synced via SSE.

## Constraints and style

- No ORM, no Alembic, no lodash, no moment, no heavy UI libraries (MUI, AntD).
- No drag-and-drop in admin (numeric inputs for now).
- No auth — single-user local use.
- Frontend types in `lib/types.ts` are manually mirrored from backend Pydantic shapes.
- Overlap and bounds validation lives in the repository layer, not the router.
- All mutating layout/settings endpoints publish an SSE event after committing.

## Roadmap iterations

| # | Iteration | Status |
|---|-----------|--------|
| 1 | Foundation (backend, frontend, Clock/Date/Weather, SSE, themes, ambient effects) | **Done** |
| 2 | AI agent core (Ollama, ReAct loop, tool registry, admin chat UI) | Not started |
| 3 | Shopping list widget + agent tools | Not started |
| 4 | Google Calendar widget + OAuth | Not started |
| 5 | Camera + vision (VisionBackend, multimodal Ollama) | Not started |
| 6 | Agent memory (remember/recall, SQLite keyed table) | Not started |
| 7 | Pi deployment (systemd, Chromium kiosk, deploy script) | Not started |
| 8 | Voice — push-to-talk (STTBackend, browser mic → Whisper) | Not started |
| 9 | Wake word (openWakeWord on-device) | Not started |
| 10 | AI-generated widget components (stretch) | Not started |

Iterations 3–6 are independent and can be reordered. Iteration 7 can land any time after 1.
