"""Fast path — Needle first, Ollama as fallback.

Needle (app.services.needle) is a ~30 MB model that maps one sentence to tool
calls in ~200 ms, but it can't write prose, can't chain lookups, and does best
with a handful of simple tools whose arguments are closed enums. So this path
exposes a small, name-based tool set: widgets are referred to by type ("clock"),
never by id, and ids are looked up here afterwards. (Measured: putting ids in the
query, `system` facts or enum labels made the model pick the wrong widget far more
often than type names do.) The schema is deliberately STATIC: the engine takes
~1.2 s to re-initialise whenever the toolset differs from the one it last ran, so a
per-request schema (e.g. an enum of only the widgets currently on the dashboard)
or a multi-pass design that alternates toolsets pays that on most queries, with no
accuracy gain (17/24 either way; two passes scored 15/24). It only changes when a
custom widget type is created. Calls then execute through the same `dispatch` the Ollama agent uses so
validation and SSE broadcasts stay identical.

`reset_layout` is intentionally not offered: it is destructive, and a sixth tool engages
Needle's retrieval step; it goes to the Ollama agent.

If Needle is unavailable, refuses (no matching tool), is below the confidence
floor, or a call fails `check_fast_calls`, the request falls through to the full
Ollama loop (app.agent.loop). Replies are assembled from tool results since
Needle generates no text.
"""
from __future__ import annotations

import logging
import sqlite3
import time
from collections.abc import AsyncIterator
from typing import Any

from app.agent.loop import _announce, _compact, _tool_label, run_agent
from app.agent.tools import dispatch
from app.agent.widget_registry import WIDGET_REGISTRY, WIDGET_TYPES
from app.events import Broadcaster
from app.repositories import custom_widgets as custom_widgets_repo
from app.repositories import settings as settings_repo
from app.repositories import widgets as widgets_repo
from app.schemas.chat import ChatMessage
from app.schemas.settings import KNOWN_THEMES
from app.services.needle import NeedleService, NeedleUnavailable
from app.services.ollama import OllamaService

logger = logging.getLogger(__name__)

# Named regions → (vertical, horizontal) fraction of the grid, 0 = start, 1 = end.
POSITIONS: dict[str, tuple[float, float]] = {
    "top-left": (0.0, 0.0),
    "top-right": (0.0, 1.0),
    "middle-left": (0.5, 0.0),
    "middle-right": (0.5, 1.0),
    "bottom-left": (1.0, 0.0),
    "bottom-right": (1.0, 1.0),
}

# direction → (row delta, col delta)
DIRECTIONS: dict[str, tuple[int, int]] = {
    "up": (-1, 0),
    "down": (1, 0),
    "left": (0, -1),
    "right": (0, 1),
}

_FAST_TOOL_NAMES = {"add_widget", "remove_widget", "nudge_widget", "move_widget", "set_theme"}

# Spoken names for widget types whose key is not what a user would say. Needle matches the
# enum against the sentence, so labels should be user language; mapped back to keys below.
_LABELS: dict[str, str] = {
    "datetime": "date and time",
    "weather_forecast": "weather forecast",
    "todo": "todo list",
}
_KEYS: dict[str, str] = {v: k for k, v in _LABELS.items()}

# Extra words a user may say for a widget type (beyond the words in its key).
_SYNONYMS: dict[str, tuple[str, ...]] = {
    "datetime": ("date", "time", "clock"),
    "todo": ("to-do", "to do", "task", "list"),
    "spotify": ("music", "song", "player"),
    "flights": ("flight", "plane", "aircraft"),
    "transit": ("bus", "train", "tram", "metro"),
    "countdown": ("timer", "count down"),
    "weather_forecast": ("forecast",),
}


def _fn(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "parameters": {"type": "object", "properties": properties, "required": required},
    }


def build_fast_tools(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Needle-format (raw JSON schema) tools. Stable between requests - see module docstring.

    Design notes (each measured on a 51-query set, see ROADMAP):
    - 5 tools: above 5, Needle's retrieval step engages and drops tools from the turn.
    - `nudge_widget` (direction) and `move_widget` (x/y or region) are split and named
      this way on purpose: with "move" on the direction tool the model sent
      "move X to the bottom right" there as direction=right.
    - Bounds (steps, x, y) live in the schema so out-of-grid values cannot be decoded;
      `steps` is required with a default so "move the clock up" means one cell.
    - Argument descriptions say which words to copy (Needle fills args from spans).
    """
    grid_rows, grid_cols = widgets_repo.get_grid_dims(conn)
    labels = [_LABELS.get(k, k) for k in WIDGET_TYPES + custom_widgets_repo.list_keys(conn)]
    region = {"type": "string", "enum": list(POSITIONS),
              "description": "the screen region the user names"}

    def widget(description: str) -> dict[str, Any]:
        return {"type": "string", "enum": labels, "description": description}

    return [
        _fn("add_widget", "Add a widget to the dashboard",
            {"type": widget("the widget to add"), "position": region}, ["type"]),
        _fn("remove_widget", "Remove a widget from the dashboard",
            {"widget": widget("the widget the user names")}, ["widget"]),
        _fn("nudge_widget", "Nudge a widget up, down, left or right by a number of grid cells",
            {"widget": widget("the widget the user names"),
             "direction": {"type": "string", "enum": list(DIRECTIONS)},
             "steps": {"type": "integer", "minimum": 1, "maximum": max(grid_rows, grid_cols),
                       "default": 1,
                       "description": "number of grid cells, the number in 'two steps down' or '3 down'"}},
            ["widget", "direction", "steps"]),
        _fn("move_widget", "Move a widget to coordinates x and y, or to a named region of the screen",
            {"widget": widget("the widget the user names"),
             "x": {"type": "integer", "minimum": 0, "maximum": grid_cols - 1,
                   "description": "column number, the x in 'x 2' or '2, 3'"},
             "y": {"type": "integer", "minimum": 0, "maximum": grid_rows - 1,
                   "description": "row number, the y in 'y 3' or '2, 3'"},
             "position": region},
            ["widget"]),
        _fn("set_theme", "Change the color theme of the dashboard",
            {"theme": {"type": "string", "enum": sorted(KNOWN_THEMES)}}, ["theme"]),
    ]


def _normalize_calls(calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map spoken widget labels in Needle's arguments back to widget type keys."""
    out = []
    for call in calls:
        args = dict(call.get("arguments") or {})
        for field in ("widget", "type"):
            if isinstance(args.get(field), str):
                args[field] = _KEYS.get(args[field], args[field])
        out.append({**call, "arguments": args})
    return out


def _find_spot(
    conn: sqlite3.Connection,
    row_span: int,
    col_span: int,
    position: str | None,
    exclude_id: int | None = None,
) -> tuple[int, int] | None:
    """Pick a free top-left cell for a widget of the given size.

    With a named position, returns the fitting cell closest to that region of the
    grid; without one, the first fit in reading order.
    """
    grid_rows, grid_cols = widgets_repo.get_grid_dims(conn)
    occupied: set[tuple[int, int]] = set()
    for w in widgets_repo.list_widgets(conn):
        if w.enabled and w.id != exclude_id:
            occupied |= {
                (r, c)
                for r in range(w.row, w.row + w.row_span)
                for c in range(w.col, w.col + w.col_span)
            }

    candidates = [
        (r, c)
        for r in range(grid_rows - row_span + 1)
        for c in range(grid_cols - col_span + 1)
        if not any(
            (rr, cc) in occupied
            for rr in range(r, r + row_span)
            for cc in range(c, c + col_span)
        )
    ]
    if not candidates:
        return None
    anchor = POSITIONS.get(position or "")
    if anchor is None:
        return candidates[0]
    target_r = anchor[0] * (grid_rows - row_span)
    target_c = anchor[1] * (grid_cols - col_span)
    return min(candidates, key=lambda rc: abs(rc[0] - target_r) + abs(rc[1] - target_c))


def _spans(widget_type: str) -> tuple[int, int]:
    meta = WIDGET_REGISTRY.get(widget_type)
    return (meta.default_row_span, meta.default_col_span) if meta else (1, 1)


def _widget_arg(args: dict[str, Any]) -> str | None:
    return args.get("widget") or args.get("type")


def _mentions(query: str, widget_type: str) -> bool:
    """Did the user's sentence plausibly refer to this widget type?"""
    q = query.lower()
    words = [w for w in widget_type.removeprefix("ai_").split("_") if w]
    words += _SYNONYMS.get(widget_type, ())
    return any(w in q for w in words)


def check_fast_calls(
    calls: list[dict[str, Any]], query: str, conn: sqlite3.Connection
) -> str | None:
    """Return a reason to fall back to Ollama, or None if every call is safe to run.

    Runs before anything executes so a bad call never half-applies a command.
    Confidence alone isn't enough: the base model produced `add_widget calendar`
    at 0.55 for "what's on my calendar today?".
    """
    layout = widgets_repo.list_widgets(conn)
    for call in calls:
        name, args = call.get("name", ""), call.get("arguments") or {}
        if name not in _FAST_TOOL_NAMES:
            return f"unknown tool {name!r}"
        wtype = _widget_arg(args)
        if wtype is not None and not _mentions(query, wtype):
            return f"{wtype} not mentioned in the request"
        if name in ("nudge_widget", "move_widget"):
            count = sum(w.type == wtype for w in layout)
            if count != 1:
                return f"{count or 'no'} {wtype} widgets on the dashboard"
        if name == "move_widget" and all(args.get(k) is None for k in ("x", "y", "position")):
            return "no destination given"
    return None


async def execute_fast_call(
    name: str,
    args: dict[str, Any],
    conn: sqlite3.Connection,
    broadcaster: Broadcaster,
) -> str:
    """Resolve a Needle call (names/regions) into dispatch calls (ids/row/col)."""
    wtype = _widget_arg(args)
    position = args.get("position")

    if name == "add_widget":
        row_span, col_span = _spans(wtype)
        spot = _find_spot(conn, row_span, col_span, position)
        if spot is None:
            return f"Error: no free space for a {wtype} widget."
        return await dispatch(
            "add_widget",
            {"type": wtype, "row": spot[0], "col": spot[1],
             "row_span": row_span, "col_span": col_span},
            conn, broadcaster,
        )

    if name in ("remove_widget", "nudge_widget", "move_widget"):
        matches = [w for w in widgets_repo.list_widgets(conn) if w.type == wtype]
        if not matches:
            return f"No {wtype} widget is on the dashboard."
        if name == "remove_widget":
            for w in matches:
                await dispatch("remove_widget", {"id": w.id}, conn, broadcaster)
            return f"Removed {len(matches)} {wtype} widget(s)."

        target = matches[0]
        if name == "nudge_widget":
            d_row, d_col = DIRECTIONS[args["direction"]]
            steps = max(1, int(args.get("steps") or 1))
            row, col = target.row + d_row * steps, target.col + d_col * steps
        elif args.get("x") is not None or args.get("y") is not None:
            # Explicit coordinates win — the model sometimes adds a stray position too.
            col = int(args["x"]) if args.get("x") is not None else target.col
            row = int(args["y"]) if args.get("y") is not None else target.row
        else:
            spot = _find_spot(
                conn, target.row_span, target.col_span, position, exclude_id=target.id
            )
            if spot is None:
                return f"Error: no free space to move the {wtype} widget."
            row, col = spot
        grid_rows, grid_cols = widgets_repo.get_grid_dims(conn)
        if not (0 <= row <= grid_rows - target.row_span and 0 <= col <= grid_cols - target.col_span):
            return (
                f"Error: the {wtype} widget can't go to x={col}, y={row} — it would leave the "
                f"{grid_cols}×{grid_rows} grid (x 0–{grid_cols - target.col_span}, "
                f"y 0–{grid_rows - target.row_span} for this size)."
            )
        return await dispatch(
            "move_widget", {"id": target.id, "row": row, "col": col}, conn, broadcaster
        )

    if name == "set_theme":
        theme = args.get("theme")
        if theme not in KNOWN_THEMES:
            return f"Error: unknown theme {theme!r}."
        settings_repo.set_value(conn, "theme", theme)
        await broadcaster.publish("settings_changed", {"settings": settings_repo.get_all(conn)})
        return f"Theme set to {theme}."

    return f"Unknown tool: {name}"


def _last_user_message(messages: list[ChatMessage]) -> str:
    for m in reversed(messages):
        if m.role == "user":
            return m.content
    return ""


async def run_fast_agent(
    messages: list[ChatMessage],
    conn: sqlite3.Connection,
    broadcaster: Broadcaster,
    ollama: OllamaService,
    needle: NeedleService,
    min_confidence: float,
) -> AsyncIterator[dict[str, Any]]:
    query = _last_user_message(messages)

    fallback_reason: str | None = None
    result: dict[str, Any] = {}
    started = time.perf_counter()
    try:
        result = await needle.complete(query, build_fast_tools(conn))
    except NeedleUnavailable as e:
        fallback_reason = f"unavailable ({e})"
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    calls = _normalize_calls(result.get("function_calls") or [])
    confidence: float | None = result.get("confidence")
    ungrounded = (result.get("validation") or {}).get("ungrounded")

    if fallback_reason is None:
        if not calls:
            fallback_reason = "no matching tool"
        elif ungrounded:
            fallback_reason = f"ungrounded value ({', '.join(map(str, ungrounded))})"
        elif confidence is not None and confidence < min_confidence:
            fallback_reason = f"low confidence {confidence:.2f} < {min_confidence:.2f}"
        else:
            fallback_reason = check_fast_calls(calls, query, conn)

    # Query + outcome are logged so misses can seed a fine-tuning set later.
    logger.info(
        "needle q=%r calls=%s conf=%s ms=%d fallback=%s",
        query, calls, confidence, elapsed_ms, fallback_reason,
    )

    # One event per fast-mode turn, whichever way it goes, so the chat can show what
    # Needle proposed and how sure it was. Needle reports a single confidence per
    # turn (no ranked alternatives); `held` is what the engine itself withheld.
    yield {
        "type": "needle",
        "outcome": "fallback" if fallback_reason is not None else "executed",
        "reason": fallback_reason,
        "confidence": confidence,
        "threshold": min_confidence,
        "ms": elapsed_ms,
        "calls": calls,
        "held": result.get("suppressed_calls") or [],
        "reasoning": result.get("reasoning"),
    }

    if fallback_reason is not None:
        async for event in run_agent(messages, conn, broadcaster, ollama):
            yield event
        return

    summaries: list[str] = []
    for call in calls:
        name = call.get("name", "")
        args = call.get("arguments") or {}
        await _announce(broadcaster, "tool", _tool_label(name))
        yield {"type": "tool_start", "tool": name, "args": args}
        outcome = _compact(await execute_fast_call(name, args, conn, broadcaster))
        yield {"type": "tool_result", "tool": name, "result": outcome}
        summaries.append(outcome)

    yield {"type": "text_delta", "content": "\n".join(summaries)}
    await _announce(broadcaster, "done", "Done")
    yield {"type": "done"}
