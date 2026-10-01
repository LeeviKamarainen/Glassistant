# Glassistant — Roadmap

Single source of truth for what is built and what is planned. Replaces the old per-iteration `TASKS.md`.
Last reviewed: 2026-10-01.

**Effort scale** (rough, for one developer who knows the codebase):

| Tag | Meaning |
|-----|---------|
| 🟢 S | A few hours. Follows an existing pattern, little risk. |
| 🟡 M | A day or two. New backend + frontend pieces, or one external integration. |
| 🟠 L | Several days. New subsystem, hardware, or real design decisions. |
| 🔴 XL | A week+. Open-ended or high-risk (security, on-device ML, hardware timing). |

When you finish something, move it from **Planned** to **Done** and (if it adds widgets, routes, settings or env vars) update `CLAUDE.md` and `README.md` in the same commit.

---

## Planned

### Agent capabilities

| Effort | Feature | Notes |
|--------|---------|-------|
| 🟢 S | Agent tools for existing widgets: todos (`add_todo`, `complete_todo`, `list_todos`), countdowns, theme / font scale / borders, saved layouts (save/load) | Agent can currently only touch layout + custom widgets. Each tool is a thin wrapper over an existing repository. Biggest bang for the buck. |
| 🟢 S | Weather / flights / transit / calendar *read* tools | Lets the agent answer "will it rain tomorrow?" without a widget. Keep results truncated (see context-engineering note below). |
| 🟡 M | Agent memory (`remember` / `recall_memories`, `agent_memories` table) | Schema should leave room for a vector column later; start with keyed lookup. |
| 🟡 M | Persist chat history server-side | Today history lives in the client (`useChat.ts`); admin and mobile don't share a conversation. |
| 🟡 M | Camera + vision (`VisionBackend`, `capture_camera_frame`, `analyze_image`) | Gemma 4 is already multimodal via Ollama, so the model side is easy; the camera capture on the Pi is the unknown. Off by default behind a config flag. |
| 🟠 L | Proactive agent (morning brief on the mirror, reminders, "leave now for your bus") | Needs a scheduler and a way to push text to `/mirror` (display-only, so via a widget). |

#### Agent experiments: small / fast decision models

Goal: stop spending a 12B chat model (and its context) on decisions a tiny model can make, and find out whether that is faster or more reliable. Do the eval harness first; the other two are comparisons against it.

| Effort | Experiment | Notes |
|--------|-----------|-------|
| 🟡 M | **Agent eval harness** (prerequisite) | A fixed set of prompts ("put the clock top-left", "what's on my todo?", "make me a sunrise widget") with expected tool calls + args, run against any backend and scored for tool accuracy, argument accuracy, refusal when no tool applies, and latency. Reuses the real schemas from `agent/tools.py`. Also covers the missing `test_agent_loop.py`. |
| 🟡 M | **[Needle](https://github.com/cactus-compute/needle) as a tool-call router** | Apache-2.0, 8–29 MB, pip-installable (`cactus-needle`), runs on-device incl. Linux-ARM64 — so it could even live on the Pi without breaking the "Pi stays lean" rule. Returns `function_calls` + calibrated `confidence`, and an empty list for off-topic input. Try: Needle picks the tool and fills arguments from the existing tool schemas; empty list / low confidence → fall through to the normal Ollama chat loop. Win condition: lower latency and no tool schemas in the chat model's context. Open questions: how it handles our ~10 tools with enum/enumerated widget types, multi-step requests ("add a clock then move it"), and whether it can edit custom-widget code (probably not — keep those on the LLM). Needs a `ToolRouter` interface so it is swappable. |
| 🟡 M | **Small decision model for routing and gating (any backend)** | Use a fast, small model that returns a typed/constrained answer instead of free text, for decisions around the agent: intent routing (layout command / question / small talk / custom-widget request), confidence-gating destructive tool calls (`remove_widget`, `reset_layout`), validating the agent's tool args, extracting a todo/countdown from free text. Put it behind a `DecisionBackend` interface (`decide(text, schema) -> value + confidence`) so implementations are interchangeable and compared on the eval harness. Candidates: **local** — a small instruct model (Gemma/Qwen class, ideally sub-2B) via Ollama with JSON-schema-constrained output, a sentence-embedding + classifier head, or Needle (see above); **hosted** — [Jev / System One models](https://typesafe.ai/blog/introducing-system-one-models-and-jev) (TypeSafe, typed calibrated outputs in ~70–500 ms; API-only, early access, no published weights as of the blog post). Prefer local: hosted backends send user text off-device, so keep them optional and off by default. Compare on accuracy, calibration (does low confidence actually predict mistakes?), latency, and RAM — and whether it can run on the Pi or must live on the desktop. |
| 🟢 S | Record latency + token counts per agent turn (and per router stage) | Needed to say anything meaningful about the experiments above; also useful for the Assistant Activity widget. |

Suggested order: harness → Needle router vs. current loop → decision-model backends (local first, hosted optional) for intent routing and confirmation gating. Document results in this file or a short `docs/agent-experiments.md` so the decision is not lost.

### Widgets

| Effort | Feature | Notes |
|--------|---------|-------|
| 🟢 S | Shopping list | Cheapest path: generalise `todos` to named lists rather than a second table. Display-only on `/mirror`; edit from admin/mobile. |
| 🟢 S | Quote / news headline / RSS widget | Pure backend proxy + cache, same shape as weather. |
| 🟡 M | Per-widget settings UI that is generated from a schema | `WidgetConfigEditor.tsx` exists; backend registry could declare config fields so new widgets get an editor for free. |
| 🟡 M | Custom widgets: approve/discard flow before rendering on `/mirror` | `custom_widgets.status` column already exists; no UI uses it yet. |
| 🟡 M | Custom widgets: allow data access (e.g. a read-only proxy to the existing `/api/*` endpoints) | Today they are pure render functions. |
| 🟠 L | Custom widgets: real sandbox (iframe / CSP) | Currently `new Function` in page scope; fine for a single-user LAN, not for anything exposed. See `CustomWidgetRenderer.tsx`. |

### Voice

| Effort | Feature | Notes |
|--------|---------|-------|
| 🟡 M | TTS (`TTSBackend`, Piper on desktop, `POST /api/voice/speak`) | Needs somewhere to play audio: mirror speaker via browser audio, or the admin/mobile device. |
| 🟡 M | Swap transcription from "chat model with audio input" to a dedicated Whisper backend | Behind a `STTBackend` interface; current Gemma-4 path is a hack that works. |
| 🔴 XL | Wake word (openWakeWord on the Pi) + shared `wake_source` abstraction | Latency, false positives, mic hardware, a second process on the Pi. |

### Platform / deployment

| Effort | Feature | Notes |
|--------|---------|-------|
| 🟡 M | Pi deployment: systemd unit for backend, Chromium kiosk unit, deploy script, `.env` hardening | Nothing Pi-specific exists in the repo yet. |
| 🟡 M | Auth for non-local access (token or basic auth in front of `/admin`, `/mobile`, `/api` mutations) | Currently "no auth, single-user LAN". Needed the moment the Pi is reachable beyond localhost. |
| 🟢 S | Settings for location (weather/flights) editable from admin instead of `.env` only | |
| 🟡 M | Frontend tests (Vitest) for admin grid + config editor | Deferred since iteration 1. |
| 🟡 M | Generate `lib/types.ts` from the OpenAPI schema | Revisit if manual mirroring becomes painful. |

### Housekeeping (do these first — all 🟢 S)

- **Commit the uncommitted work.** 26 modified + 10 untracked files: voice input, font scale, widget borders, `FitCell`, `useChat` refactor, `/api/transcribe`, migrations 008–009.
- Add `frontend/tsconfig.tsbuildinfo` to `.gitignore` (it shows as modified on every build) and untrack it.
- Add a `.gitattributes` (`* text=auto eol=lf`); git warns about LF→CRLF on every touched file.
- Two migrations share the number `004` (`004_grid_config.sql`, `004_saved_layouts.sql`). Works today because the runner tracks by filename, but renumbering a deployed DB is risky — decide on a convention (e.g. never rename; just continue at `010`) and note it in `CLAUDE.md`.
- `.env.example` is still missing `GLASSISTANT_FLIGHTS_CACHE_TTL_SECONDS` and `GLASSISTANT_WEATHER_CACHE_TTL_SECONDS` (model defaults were fixed 2026-10-01).
- Add `tests/test_agent_loop.py` (mock Ollama stream → tool dispatch → final text) and a test for `/api/transcribe` with a stubbed service. Current suite: 22 tests, none cover the agent loop, todos, saved layouts, or settings validation.
- Agent `SYSTEM_PROMPT` is ~200 tokens and growing; the project guideline is ≤150. Move the custom-widget instructions into the tool descriptions where they already partly live.

---

## Done

### Foundation
- ✅ FastAPI app factory + lifespan, pydantic-settings config, `.env` loader
- ✅ Plain-`sqlite3` layer with numbered migrations (`001`–`009`) and `schema_migrations` tracking
- ✅ SSE broadcaster + `GET /api/events` (`layout_changed`, `settings_changed`, `todos_changed`, `custom_widgets_changed`, `agent_activity`, `server_restarting`)
- ✅ Widget CRUD with overlap/bounds validation in the repository layer
- ✅ Configurable grid (`grid_rows` / `grid_cols` in settings, default 12×7 — no longer the original 3×3)
- ✅ Saved layouts (save / load / delete)
- ✅ Backend widget registry (`agent/widget_registry.py`) + `GET /api/widget-types`
- ✅ Vite + React 18 + TS + Tailwind 4; `/mirror` lazy-loaded and split from `/admin` and `/mobile`

### Frontend views
- ✅ `/mirror` — kiosk view, display-only
- ✅ `/admin` — desktop controller: drag-and-drop grid editor, widget config editor, component browser, saved layouts, theme / effect / font-scale / border settings, Google Calendar auth, floating AI chat
- ✅ `/mobile` — tabbed touch controller (layout, todos, countdowns, theme, components, AI)
- ✅ Themes: mirror, moonlight, ember, forest
- ✅ Weather ambient effects: calm (CSS) and dynamic (canvas, lazy-loaded)
- ✅ Font-scale slider and widget-border toggle (synced via SSE)
- ✅ `FitCell` — shrinks overflowing widget content to its cell; admin highlights overflowing widgets

### Widgets
- ✅ Clock, Date, Date & Time
- ✅ Weather, Weather Forecast (Open-Meteo, 10-min cache)
- ✅ Transit (HSL Digitransit)
- ✅ Calendar (Google OAuth, week view)
- ✅ Todo (SQLite-backed, editable from admin/mobile)
- ✅ Countdown
- ✅ Spotify (OAuth, now-playing)
- ✅ Flights (OpenSky, overhead aircraft)
- ✅ Assistant Activity (live agent status on the mirror)
- ✅ AI-generated custom widgets (`ai_*` keys): JSX stored in `custom_widgets`, transpiled in-browser with Sucrase, error-boundary protected

### AI agent
- ✅ Ollama streaming client (`services/ollama.py`)
- ✅ Streaming ReAct loop (`agent/loop.py`) — max 6 iterations, trimmed history, truncated tool results
- ✅ Tools: `list_widgets`, `get_free_positions`, `add_widget`, `move_widget`, `remove_widget`, `reset_layout`, `create_custom_widget`, `get_custom_widget_source`, `edit_custom_widget_lines`, `edit_custom_widget_string`
- ✅ `POST /api/chat` SSE stream with collapsible tool-step cards in the UI
- ✅ Voice input: push-to-talk in chat, browser mic → 16 kHz WAV → `POST /api/transcribe` → Ollama (Gemma 4 native audio)

### Tests
- ✅ 22 backend tests: layout API, weather cache, custom widgets API

---

## Original iteration plan → status

Kept for traceability with older commits and notes.

| # | Iteration | Status |
|---|-----------|--------|
| 1 | Foundation | ✅ Done |
| 2 | AI agent core | ✅ Done (layout + custom-widget tools only; no Azure fallback) |
| 3 | Shopping list widget + agent tools | 🔲 Planned |
| 4 | Google Calendar widget + OAuth | ✅ Done (no agent tool yet) |
| 5 | Camera + vision | 🔲 Planned |
| 6 | Agent memory | 🔲 Planned |
| 7 | Pi deployment | 🔲 Planned |
| 8 | Voice — push-to-talk | 🟡 Partly done (STT only; no TTS, no dedicated Whisper backend) |
| 9 | Wake word | 🔲 Planned |
| 10 | AI-generated widgets | 🟡 Mostly done (no sandbox, no approve/discard UI) |

Added outside the original plan: Transit, Spotify, Flights, Countdown, Todo, saved layouts, configurable grid, mobile view, drag-and-drop admin, font scale, widget borders, FitCell.
