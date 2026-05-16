# Glassistant — Task List

Legend: ✅ Done · 🔲 Not started · ⚠️ Dependency noted

---

## Iteration 1 — Foundation

### Backend
- ✅ FastAPI app factory with lifespan (db bootstrap, SSE broadcaster, weather service)
- ✅ SQLite migration runner (`db.py`) with `schema_migrations` tracking
- ✅ Migration 001: `widgets` table + position index
- ✅ Migration 002: `app_settings` table, default `theme = mirror`
- ✅ Migration 003: seed `weather_effect_style = calm`
- ✅ Widget repository — create, read, list, update, delete, reset, seed defaults
- ✅ Layout router — GET /api/layout, POST /api/widgets, PATCH, DELETE, POST /api/layout/reset
- ✅ SSE broadcaster (`events.py`) — per-subscriber queue, heartbeat, bounded drop
- ✅ SSE router — GET /api/events
- ✅ Weather service — Open-Meteo httpx client, 10-min TTL in-memory cache
- ✅ Weather router — GET /api/weather
- ✅ Settings repository — get_all, set_value
- ✅ Settings router — GET /api/settings, PUT /api/settings/{key}
- ✅ pydantic-settings config (db_path, CORS origins, TTL, default lat/lon)
- ✅ FastAPI Depends helpers (`dependencies.py`)
- ✅ `pyproject.toml` with dev extras
- ✅ `.env.example`

### Backend tests
- ✅ `conftest.py` — in-memory/tmp test DB fixture, TestClient fixture
- ✅ `test_layout_api.py` — seed on first boot, CRUD round-trip, overlap rejected, out-of-bounds rejected, span exceeds grid rejected, reset restores defaults, disable allows slot reuse
- ✅ `test_weather_cache.py` — cache hit within TTL, cache expires after TTL, cache key rounding

### Frontend
- ✅ Vite + React 18 + TypeScript + Tailwind setup
- ✅ `vite.config.ts` — proxy `/api` + `/api/events` → backend:8000
- ✅ Lazy code-split routing: `/mirror` (lean bundle) and `/admin` (heavier)
- ✅ `lib/types.ts` — mirrors backend Pydantic shapes (Widget, WidgetCreate, WidgetUpdate, Layout, SseEvent, SettingsPayload, GRID_SIZE)
- ✅ `lib/api.ts` — typed fetch wrappers (getLayout, createWidget, updateWidget, deleteWidget, resetLayout, getWeather, getSettings, setSetting)
- ✅ `lib/sse.ts` — EventSource hook with exponential reconnect backoff
- ✅ `components/Grid.tsx` — 3×3 CSS-grid, per-widget `grid-row`/`grid-column` inline placement
- ✅ `components/widgets/registry.ts` — type-string → component map + WIDGET_TYPES list
- ✅ `components/widgets/Clock.tsx` — live ticking clock
- ✅ `components/widgets/DateW.tsx` — current date
- ✅ `components/widgets/Weather.tsx` — Open-Meteo temperature + WMO condition icon
- ✅ `components/widgets/weather/icons.tsx` — WMO code → condition mapping + SVG icon set
- ✅ `routes/mirror.tsx` — fetch layout on mount, SSE subscription, renders Grid
- ✅ `routes/admin.tsx` — widget list, add form, save/delete per row, reset button, SSE sync
- ✅ Themes system — 4 palettes (mirror, moonlight, ember, forest), CSS variables, `lib/themes.ts`
- ✅ `lib/useTheme.ts` — theme state persisted to /api/settings, synced via SSE
- ✅ Theme picker in admin UI
- ✅ `components/WeatherEffect.tsx` — CSS-only ambient overlays (rain, snow, fog, clear, cloudy)
- ✅ `components/WeatherEffectDynamic.tsx` — lazy canvas particle system
- ✅ `lib/useEffectStyle.ts` — effect style state persisted to /api/settings, synced via SSE
- ✅ Effect style picker + weather preview dropdown in admin UI
- ✅ Production build confirmed working (`npm run build` → FastAPI serves `frontend/dist`)

### Docs
- ✅ `README.md` — stack, dev setup, test, production serving

---

## Iteration 2 — AI Agent Core

> **Depends on:** Iteration 1 complete (it is).

All tasks below are independent of each other unless marked.

### Backend
- 🔲 `ChatBackend` abstract interface (`backend/app/services/chat.py`) — `stream_chat(messages) -> AsyncIterator[str]`
- 🔲 Ollama HTTP client implementing `ChatBackend` (`backend/app/services/ollama.py`) — uses `httpx.AsyncClient`, streams `/api/chat`
- 🔲 Azure OpenAI fallback client implementing `ChatBackend` (`backend/app/services/azure_openai.py`)
- 🔲 Tool registry (`backend/app/agent/tools.py`) — register/lookup callables by name + JSON schema
- 🔲 ReAct agent loop (`backend/app/agent/loop.py`) — parse tool calls from streamed output, dispatch, accumulate context
- 🔲 Layout tools wired into tool registry: `list_widgets`, `add_widget`, `move_widget`, `remove_widget`, `reset_layout`
- 🔲 Chat router (`backend/app/routers/chat.py`) — POST /api/chat with SSE streaming of text + tool-call progress events
- 🔲 Config additions: `ollama_base_url`, `ollama_model`, `azure_openai_*` keys
- 🔲 Agent router included in `main.py`

### Frontend
- 🔲 Chat types in `lib/types.ts` — `ChatMessage`, `ChatEvent` (text delta, tool start, tool result, done)
- 🔲 Chat API wrapper in `lib/api.ts` — `streamChat(messages): AsyncIterable<ChatEvent>`
- 🔲 `components/ChatPanel.tsx` — message thread, input box, streamed tool-call progress display
- 🔲 Chat panel wired into `/admin` route (collapsible sidebar or bottom drawer)

### Tests
- 🔲 `tests/test_agent_loop.py` — mock tool dispatcher, verify ReAct parse → dispatch → response cycle

---

## Iteration 3 — Shopping List Widget

> **Independent of iterations 2, 4, 5, 6.** Can be done before or after AI agent.

### Backend
- 🔲 Migration `004_shopping.sql` — `shopping_items` table (id, text, done, position, created_at)
- 🔲 Shopping repository (`backend/app/repositories/shopping.py`) — list, add, update (done/text), delete, reorder
- 🔲 Shopping router (`backend/app/routers/shopping.py`) — GET/POST/PATCH/DELETE /api/shopping
- 🔲 Mutating shopping endpoints broadcast `shopping_changed` SSE event

> **If AI agent (Iteration 2) is done first:**
- 🔲 Shopping agent tools: `list_shopping_items`, `add_shopping_item`, `complete_shopping_item`, `remove_shopping_item`

### Frontend
- 🔲 `components/widgets/ShoppingList.tsx` — scrollable list, checked-off items styled distinctly
- 🔲 Register `shopping` in `widgets/registry.ts`
- 🔲 Shopping API wrappers in `lib/api.ts`
- 🔲 SSE handler for `shopping_changed` in ShoppingList widget

---

## Iteration 4 — Google Calendar Widget

> **Independent of iterations 2, 3, 5, 6.**

### Backend
- 🔲 Migration `005_calendar.sql` — `calendar_tokens` table (id, token_json, expires_at), `calendar_events_cache` table
- 🔲 OAuth loopback flow router (`backend/app/routers/oauth.py`) — GET /api/oauth/google/start, GET /api/oauth/google/callback
- 🔲 Token storage/refresh helper (`backend/app/services/google_calendar.py`)
- 🔲 Calendar fetch + cache service — fetch upcoming events, store in SQLite cache, TTL refresh
- 🔲 Calendar router — GET /api/calendar/events

> **If AI agent (Iteration 2) is done first:**
- 🔲 Calendar agent tool: `query_calendar(from_dt, to_dt)`

### Frontend
- 🔲 `components/widgets/Calendar.tsx` — next N events list with time + title
- 🔲 Register `calendar` in `widgets/registry.ts`
- 🔲 OAuth trigger button in admin (opens loopback URL)

---

## Iteration 5 — Camera + Vision

> **Independent of iterations 3, 4, 6. Benefits from Iteration 2 (agent).**

### Backend
- 🔲 `VisionBackend` abstract interface (`backend/app/services/vision.py`) — `analyze(image_bytes, prompt) -> str`
- 🔲 Ollama multimodal implementation of `VisionBackend` (llava or similar)
- 🔲 Camera capture endpoint — GET /api/camera/capture (off by default, gated by config flag)
- 🔲 Config additions: `camera_enabled`, `camera_device_index`

> **If AI agent (Iteration 2) is done first:**
- 🔲 Agent tools: `capture_camera_frame()`, `analyze_image(prompt)`

---

## Iteration 6 — Agent Memory

> **Depends on: Iteration 2 (AI agent core).**

### Backend
- 🔲 Migration `006_memory.sql` — `agent_memories` table (id, key, value, created_at, updated_at) — schema leaves room for a `vector` column (sqlite-vec) later
- 🔲 Memory repository (`backend/app/repositories/memory.py`) — get, set, list, delete
- 🔲 Agent tools: `remember(key, value)`, `recall_memories(query)`

---

## Iteration 7 — Pi Deployment

> **Independent. Can be done any time after Iteration 1.**

- 🔲 Cross-build frontend for Pi (arm64 target, or build on Pi directly)
- 🔲 `systemd` unit file for uvicorn backend (`glassistant-backend.service`)
- 🔲 `systemd` unit file for Chromium in kiosk mode pointing at `http://localhost:8000/mirror`
- 🔲 Deploy script (rsync or scp to Pi + `systemctl restart`)
- 🔲 `.env` hardening guide (bind to localhost, set DB path to persistent volume)
- 🔲 Test: full verification checklist from plan on Pi hardware

---

## Iteration 8 — Voice (Push-to-Talk)

> **Depends on: Iteration 2 (AI agent core).**

### Backend
- 🔲 `STTBackend` abstract interface (`backend/app/services/stt.py`) — `transcribe(audio_bytes) -> str`
- 🔲 Whisper implementation of `STTBackend` (desktop, via Ollama or faster-whisper)
- 🔲 `TTSBackend` abstract interface (`backend/app/services/tts.py`) — `synthesize(text) -> bytes`
- 🔲 Piper TTS implementation of `TTSBackend`
- 🔲 Audio upload endpoint — POST /api/voice/transcribe (multipart audio → transcription)
- 🔲 TTS endpoint — POST /api/voice/speak (text → audio stream)

### Frontend
- 🔲 Push-to-talk button in admin: hold to record mic, release to send to `/api/voice/transcribe`, result fed into chat

---

## Iteration 9 — Wake Word

> **Depends on: Iteration 8 (voice).**

- 🔲 openWakeWord integration running on Pi (separate lightweight process or thread)
- 🔲 Wake-word → HTTP POST to backend to open voice session
- 🔲 `wake_source` abstraction so push-to-talk and wake-word share the same downstream chat flow

---

## Iteration 10 — AI-Generated Widget Components (Stretch)

> **Depends on: Iteration 2 (AI agent core).**

- 🔲 Sandboxed "experimental widget" slot in the grid
- 🔲 Agent can emit React JSX string; backend stores it; frontend evaluates in an isolated sandbox (e.g. iframe or Function constructor with strict CSP)
- 🔲 Admin UI to view, approve, or discard generated widget code before it renders on mirror

---

## Housekeeping (any time)

- 🔲 Initialize git repository (`git init`, first commit)
- 🔲 Set up `.gitignore` for Pi-side secrets (already has Windows venv/dist exclusions)
- 🔲 Add frontend unit tests for admin widget management (deferred from Iteration 1 — revisit when admin grows)
- 🔲 Evaluate switching from `pip install -e .` to `uv` once uv is available on dev machine
- 🔲 Backend/frontend type generation (e.g. datamodel-codegen or openapi-typescript) — revisit if manual mirroring becomes a burden
