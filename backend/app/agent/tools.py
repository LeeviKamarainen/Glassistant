"""Agent tool definitions and dispatcher.

TOOL_SCHEMAS — OpenAI-format definitions sent to the LLM each tool-use pass.
dispatch()   — routes a tool call name + args to the right implementation.

Mutating tools publish layout_changed SSE so the mirror updates live.
On domain errors (WidgetError) we return the error string rather than raising —
the agent sees it and can decide what to do (explain to user, retry with correction).

Widget types are sourced from app.agent.widget_registry — add new entries there
and the tool schema updates automatically with no changes needed here.
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from app.agent.widget_registry import WIDGET_TYPES, widget_type_summary
from app.events import Broadcaster
from app.repositories import widgets as widgets_repo
from app.repositories.widgets import WidgetError
from app.schemas.widget import WidgetCreate, WidgetUpdate

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_widgets",
            "description": (
                "Return the current widget layout and grid dimensions. "
                "Call this before making any changes."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_free_positions",
            "description": (
                "Return all unoccupied grid cells so you know where new widgets can be placed."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_widget",
            "description": (
                "Add a new widget to the grid. Available types and their default spans:\n"
                + widget_type_summary()
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "description": "Widget type key",
                        "enum": WIDGET_TYPES,
                    },
                    "row": {"type": "integer", "description": "Starting row (0-indexed)"},
                    "col": {"type": "integer", "description": "Starting column (0-indexed)"},
                    "row_span": {"type": "integer", "description": "Rows to occupy (default 1)"},
                    "col_span": {"type": "integer", "description": "Columns to occupy (default 1)"},
                    "config": {
                        "type": "object",
                        "description": "Optional widget-specific config",
                    },
                },
                "required": ["type", "row", "col"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "move_widget",
            "description": "Move and/or resize an existing widget by ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer", "description": "Widget ID from list_widgets"},
                    "row": {"type": "integer"},
                    "col": {"type": "integer"},
                    "row_span": {"type": "integer"},
                    "col_span": {"type": "integer"},
                },
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_widget",
            "description": "Remove a widget from the grid by ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer", "description": "Widget ID to remove"},
                },
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reset_layout",
            "description": "Reset the entire layout to the default configuration.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]


async def _publish_layout(broadcaster: Broadcaster, conn: sqlite3.Connection) -> None:
    layout = widgets_repo.list_widgets(conn)
    await broadcaster.publish(
        "layout_changed",
        {"widgets": [w.model_dump(mode="json") for w in layout]},
    )


async def dispatch(
    name: str,
    args: dict[str, Any],
    conn: sqlite3.Connection,
    broadcaster: Broadcaster,
) -> str:
    """Route a tool call to the right implementation. Always returns a string."""
    try:
        if name == "list_widgets":
            widgets = widgets_repo.list_widgets(conn)
            grid_rows, grid_cols = widgets_repo.get_grid_dims(conn)
            result = {
                "grid_rows": grid_rows,
                "grid_cols": grid_cols,
                "widgets": [
                    {
                        "id": w.id,
                        "type": w.type,
                        "row": w.row,
                        "col": w.col,
                        "row_span": w.row_span,
                        "col_span": w.col_span,
                        "enabled": w.enabled,
                    }
                    for w in widgets
                ],
            }
            return json.dumps(result)

        if name == "get_free_positions":
            return json.dumps(widgets_repo.get_free_positions(conn))

        if name == "add_widget":
            data = WidgetCreate(
                type=args["type"],
                row=int(args["row"]),
                col=int(args["col"]),
                row_span=int(args.get("row_span", 1)),
                col_span=int(args.get("col_span", 1)),
                config=args.get("config") or {},
            )
            widget = widgets_repo.create_widget(conn, data)
            await _publish_layout(broadcaster, conn)
            return f"Added widget id={widget.id} ({widget.type}) at row={widget.row} col={widget.col}."

        if name == "move_widget":
            patch = WidgetUpdate(
                **{k: v for k, v in args.items() if k != "id"}
            )
            widget = widgets_repo.update_widget(conn, int(args["id"]), patch)
            await _publish_layout(broadcaster, conn)
            return f"Moved widget id={widget.id} to row={widget.row} col={widget.col} span={widget.row_span}×{widget.col_span}."

        if name == "remove_widget":
            deleted = widgets_repo.delete_widget(conn, int(args["id"]))
            if not deleted:
                return f"Widget id={args['id']} not found."
            await _publish_layout(broadcaster, conn)
            return f"Removed widget id={args['id']}."

        if name == "reset_layout":
            widgets_repo.reset_to_defaults(conn)
            await _publish_layout(broadcaster, conn)
            return "Layout reset to defaults."

        return f"Unknown tool: {name}"

    except WidgetError as e:
        return f"Error: {e}"
    except Exception as e:
        return f"Unexpected error in {name}: {e}"
