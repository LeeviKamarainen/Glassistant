# Glassistant — CLAUDE.md

## What this project is

A wall-mounted "magic mirror" home assistant. A Raspberry Pi drives a monitor behind a two-way mirror; widgets are arranged on a configurable grid (default 12×7, stored in `app_settings`). An AI agent running on a separate desktop via Ollama can rearrange the dashboard, write custom widgets, and take voice input. Camera, memory, TTS and Pi deployment are still planned.

**What is built vs planned lives in [ROADMAP.md](ROADMAP.md).** Update it in the same commit as any feature work.

## Architecture ground rules

- **Pi stays lean.** No ML/torch/transformers/vector DBs in the Pi process. Anything model-related is offloaded to the desktop over HTTP. The mirror bundle (`/mirror`) is aggressively code-split away from `/admin`.
- **Swappable backends.** LLM, vision, STT, TTS, wake-word — each fronted by a Python interface so the implementation can move on-device without restructuring callers. (Today only `OllamaService` exists, used directly; introduce the interface when a second implementation appears.)
- **One React app, three routes.** `/mirror` is the kiosk view (lean bundle, lazy-loaded, **display-only — no buttons/inputs/interactive elements**). `/admin` is the desktop controller. `/mobile` is the touch controller. All share the widget library.
- **SQLite is the source of truth.** All layout and settings changes go through the backend, which broadcasts via SSE to subscribed clients.
- **SSE not WebSocket.** Backend → client push uses Server-Sent Events. Client → backend is plain HTTP.
- **No ORM, no Alembic.** Plain `sqlite3`, hand-written SQL, numbered migration files in `backend/migrations/`.
- **Keep LLM context small.** Local models have small windows: short system prompt (target ≤150 tokens), trimmed history, truncated tool results, no data the call doesn't need.

## Repository layout

```
glassistant/
├── ROADMAP.md                 # done / planned features with effort ratings
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py            # FastAPI factory, lifespan (services on app.state), static mount
│   │   ├── config.py          # pydantic-settings, GLASSISTANT_* env vars
│   │   ├── db.py              # sqlite3 helpers, migration runner
│   │   ├── events.py          # SSE broadcaster (asyncio.Queue per subscriber)
│   │   ├── dependencies.py    # FastAPI Depends helpers (get_db, get_broadcaster)
│   │   ├── agent/
│   │   │   ├── loop.py            # streaming ReAct loop, system prompt, history trimming
│   │   │   ├── tools.py           # tool schemas + dispatch (layout + custom-widget tools)
│   │   │   ├── fast.py            # opt-in Needle fast path: name-based tools → dispatch, Ollama fallback
│   │   │   └── widget_registry.py # backend widget registry (feeds agent + /api/widget-types)
│   │   ├── routers/           # layout, saved_layouts, settings, events, chat, transcribe,
│   │   │                      # custom_widgets, todos, weather, flights, transit, calendar,
│   │   │                      # spotify, system
│   │   ├── repositories/      # widgets, saved_layouts, settings, todos, custom_widgets
│   │   ├── schemas/           # Pydantic models (widget, settings, chat, todo, calendar,
│   │   │                      #   saved_layout, custom_widget); KNOWN_THEMES etc.
│   │   └── services/          # ollama (chat stream + audio transcribe), needle (tiny tool-call model), weather, flights,
│   │                          #   transit, calendar, spotify — external API clients
│   ├── migrations/            # 001_init … 009_widget_borders (note: two files numbered 004)
│   └── tests/                 # conftest, test_layout_api, test_weather_cache, test_custom_widgets_api, test_fast_agent
├── frontend/
│   ├── vite.config.ts         # proxies /api → backend:8000 in dev
│   └── src/
│       ├── main.tsx           # router, lazy code-split Mirror/Admin/Mobile
│       ├── routes/            # mirror.tsx, admin.tsx, mobile.tsx
│       ├── lib/               # api.ts, sse.ts, types.ts (manually mirrors Pydantic),
│       │                      # themes.ts, useTheme / useEffectStyle / useFontScale /
│       │                      # useWidgetBorders / useGridConfig (settings + SSE hooks),
│       │                      # useChat.ts, useVoiceRecorder.ts, customWidgets.ts,
│       │                      # fitOverflowStore.ts, previewContext.ts
│       ├── components/
│       │   ├── Grid.tsx, AdminGrid.tsx, MobileGrid.tsx   # mirror / drag-and-drop / mobile grids
│       │   ├── FitCell.tsx        # scales overflowing widget content to fit its cell
│       │   ├── ChatPanel.tsx, VoiceButton.tsx, WidgetConfigEditor.tsx, AutoScroll.tsx
│       │   ├── WeatherEffect.tsx, WeatherEffectDynamic.tsx
│       │   └── widgets/       # registry.ts + one file per widget + CustomWidgetRenderer.tsx
│       └── styles.css
├── docs/screenshots/          # images referenced by README
├── .env.example
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

Open `http://localhost:5173/mirror`, `/admin` and `/mobile`.

### Tests / typecheck
```powershell
cd backend; pytest            # 47 tests
cd frontend; npm run typecheck
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
| GET | `/api/layout` | Widget list + grid dimensions |
| POST | `/api/widgets` | Create widget |
| PATCH | `/api/widgets/{id}` | Update widget (partial) |
| DELETE | `/api/widgets/{id}` | Delete widget |
| POST | `/api/layout/reset` | Reset to default layout |
| GET | `/api/widget-types` | Backend widget registry |
| GET/POST/DELETE | `/api/saved-layouts`, `/api/saved-layouts/{id}` | List / save current / delete |
| POST | `/api/saved-layouts/{id}/load` | Restore a saved layout |
| GET/POST/DELETE | `/api/custom-widgets`, `/api/custom-widgets/{id}` | AI-generated widget source |
| GET/POST/PATCH/DELETE | `/api/todos`, `/api/todos/{id}` | Todo items |
| GET | `/api/weather?lat=&lon=` | Open-Meteo proxy (10-min TTL cache) |
| GET | `/api/flights` | OpenSky proxy (short TTL cache) |
| POST | `/api/transit/plan` | HSL Digitransit route planning |
| GET | `/api/calendar/{status,auth,callback,events}` | Google Calendar OAuth + events |
| GET | `/api/spotify/{status,auth,callback,now-playing}` | Spotify OAuth + now playing |
| POST | `/api/chat` | Streaming agent (SSE) |
| POST | `/api/transcribe` | Base64 WAV → transcript (Ollama, Gemma 4 audio) |
| GET | `/api/system` | Non-secret env config (home lat/lon) |
| GET | `/api/events` | SSE: `layout_changed`, `settings_changed`, `todos_changed`, `custom_widgets_changed`, `agent_activity`, `server_restarting` |
| GET | `/api/settings` | Key/value settings dict |
| PUT | `/api/settings/{key}` | Update a setting (validated per key) |
| GET | `/healthz` | Health check |

## SQLite schema

Tables: `widgets`, `app_settings` (key/value), `saved_layouts`, `oauth_tokens` (Google + Spotify, keyed by provider), `todos`, `custom_widgets`, `schema_migrations`.

`app_settings` keys: `theme`, `weather_effect_style`, `grid_rows`, `grid_cols`, `font_scale`, `show_widget_borders`. Validation (enums, int/float ranges) lives in `routers/settings.py`.

Migrations live in `backend/migrations/` numbered `NNN_name.sql`; the runner tracks applied files by name in `schema_migrations`. Continue numbering from the highest existing number (currently `009`); never rename an applied file.

## Widget system

### Adding a new widget type

Every new widget requires exactly these steps — no exceptions:

1. **React component** — create `frontend/src/components/widgets/YourWidget.tsx`
2. **Frontend registry** — add an entry to `frontend/src/components/widgets/registry.ts` with `component`, `label`, `description`, and `defaultSize`
3. **Backend registry** — add a matching entry to `backend/app/agent/widget_registry.py` with the same `label`, `description`, and default spans

   This is what keeps the AI agent's tool prompt accurate. Skipping it means the agent won't know the widget exists.

4. **Data endpoint** *(only if needed)* — add a router/service/repository under `backend/app/` if the widget fetches its own data
5. **Docs** — add a row to the widget tables in `README.md` and `ROADMAP.md`

The type key must be identical between frontend and backend. `GET /api/widget-types` reflects the backend registry and can be used to verify alignment. Widgets must be display-only (see ground rules); state that can change is edited from admin/mobile.

Widgets are wrapped in `FitCell`, which scales content down if it overflows its grid cell — design for the cell, but overflow degrades gracefully.

### Custom (AI-generated) widgets

The agent can write new widgets via `create_custom_widget` and modify them with `get_custom_widget_source`, `edit_custom_widget_lines` and `edit_custom_widget_string`. Source (a single JSX function expression, max 8 KB, validated server-side with an API denylist) is stored in `custom_widgets`; the type key is `ai_*`. `CustomWidgetRenderer.tsx` transpiles with Sucrase and runs it via `new Function` inside an error boundary. **This is not a security sandbox** — acceptable for single-user LAN only.

## Agent

- `agent/loop.py` — one streaming loop against Ollama (`MAX_ITERS=6`, `MAX_HISTORY=6`, tool results truncated to 600 chars). Broadcasts `agent_activity` so the mirror's Assistant Activity widget can show progress.
- `agent/tools.py` — tool schemas (built dynamically from the widget registry) and `dispatch`. Layout-mutating tools publish `layout_changed` like the REST endpoints do.
- Models: `ollama_model` (chat, default `gemma4:12b`) and `ollama_transcription_model` (audio → text, default `gemma4:4b`). Thinking is off by default.
- Fast mode (experimental): `ChatRequest.fast` → `agent/fast.py` sends only the last user message to Needle (`services/needle.py`, optional `[needle]` extra, runs in a worker thread). It uses its own 5-tool set (`add_widget(type, position?)`, `remove_widget(widget)`, `nudge_widget(widget, direction, steps=1)`, `move_widget(widget, x?, y?, position?)`, `set_theme(theme)`; above 5 tools Needle's retrieval step engages, so `reset_layout` stays with Ollama), with user-language widget labels ("todo list") mapped back to type keys, bounds in the schema and argument descriptions saying which words to copy. Widgets are named by **type** and resolved to ids/row/col in `fast.py` — ids/lists in the query, `system` facts or enum labels measurably made Needle pick the wrong widget. The tool schema is **static** (changes only when a custom widget type is created): the engine needs ~1.2 s to re-initialise whenever its toolset changes, so per-request schemas and multi-pass designs that alternate toolsets are slow and were not more accurate. The `nudge`/`move` split and which one carries the verb "move" matters (see ROADMAP). `check_fast_calls` runs before anything executes (widget mentioned in the sentence, unique move target, destination present) and, with no match / `ungrounded` / confidence < `needle_min_confidence` (0.7) / Needle missing, the request falls back to `run_agent`. Replies are built from tool results (Needle writes no text); a `needle` SSE event (outcome, reason, confidence, threshold, ms, proposed/held calls, reasoning) renders as a collapsible `NeedleCard` in the chat. Toggle is per client (`useFastMode`, localStorage). Misses are logged as `needle q=…` for fine-tuning; a tuned `.cact` goes in `GLASSISTANT_NEEDLE_WEIGHTS`. Don't lower the floor to make it look better — wrong calls score up to ~0.55.
- Voice: frontend records, converts to 16 kHz mono WAV, posts to `/api/transcribe`; transcript is fed into the normal chat flow.

## Themes

Four themes defined in `frontend/src/lib/themes.ts`: `mirror`, `moonlight`, `ember`, `forest`. Each has `bg`, `fg`, `accent` CSS variables. The active theme is persisted in `app_settings` and broadcast via `settings_changed`. Names must stay in sync with `backend/app/schemas/settings.py::KNOWN_THEMES`.

## Weather ambient effects

`WeatherEffect` renders a full-screen overlay behind widgets on `/mirror`. `calm` = pure CSS; `dynamic` = canvas particles (`WeatherEffectDynamic.tsx`, lazy-loaded). Mode is `weather_effect_style` in `app_settings`, synced via SSE.

## Constraints and style

- No ORM, no Alembic, no lodash, no moment, no heavy UI libraries (MUI, AntD).
- Drag-and-drop in admin is hand-rolled (no DnD library); mobile uses numeric inputs.
- No auth — single-user local use. Revisit before exposing beyond the LAN (see ROADMAP).
- Frontend types in `lib/types.ts` are manually mirrored from backend Pydantic shapes.
- Overlap and bounds validation lives in the repository layer, not the router.
- All mutating layout/settings/todo/custom-widget endpoints publish an SSE event after committing.
- Secrets (API keys, OAuth client secrets, home coordinates) come from `.env` only; never hardcode or commit them.
