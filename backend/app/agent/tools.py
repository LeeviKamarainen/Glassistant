"""Agent tool definitions and dispatcher.

build_tool_schemas() — OpenAI-format definitions sent to the LLM each tool-use pass.
                       Built per-call (not a constant) because add_widget's type
                       enum must include any custom widgets created so far.
dispatch()           — routes a tool call name + args to the right implementation.

Mutating tools publish layout_changed / custom_widgets_changed SSE so the mirror
and admin update live. On domain errors (WidgetError, CustomWidgetError) we return
the error string rather than raising — the agent sees it and can decide what to do
(explain to user, retry with correction).

Widget types are sourced from app.agent.widget_registry — add new entries there
and the tool schema updates automatically with no changes needed here. Custom
(AI-generated) widget types are sourced live from the custom_widgets table.
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from app.agent.widget_registry import WIDGET_TYPES, widget_type_summary
from app.events import Broadcaster
from app.repositories import custom_widgets as custom_widgets_repo
from app.repositories import widgets as widgets_repo
from app.repositories.custom_widgets import CustomWidgetError
from app.repositories.widgets import WidgetError
from app.schemas.custom_widget import CustomWidgetCreate
from app.schemas.widget import WidgetCreate, WidgetUpdate

# The exact contract a custom widget's source code must follow — embedded in the
# create_custom_widget tool description so the model has the best chance of
# producing code that survives validation (app.repositories.custom_widgets) and
# renders correctly (frontend CustomWidgetRenderer, which transpiles and mounts
# it the same way every other widget is mounted).
CUSTOM_WIDGET_CONTRACT = (
    "Write the widget as a SINGLE function expression of the exact shape:\n"
    "  ({ widget }) => { ... return <div>...</div>; }\n"
    "Rules:\n"
    "- No imports, no top-level statements — just that one function.\n"
    "- React and the hooks (useState, useEffect, useMemo, useRef) are already "
    "in scope — do not import them.\n"
    "- Style with Tailwind utility classes on JSX elements (e.g. className=\"text-2xl "
    "font-light\"), matching the look of other widgets — large readable text on a dark "
    "background, no borders or card chrome (the grid cell already provides that).\n"
    "- Read configuration from `widget.config` (a plain object) with sensible "
    "defaults — never assume a key exists.\n"
    "- Pure presentation only: no network requests (fetch/XHR/WebSocket), no "
    "browser storage (localStorage/sessionStorage/cookies), no direct DOM or "
    "window access, no dangerouslySetInnerHTML. If the widget needs live external "
    "data, say so instead of writing the widget — that requires a backend data "
    "endpoint which this tool cannot create."
)


def build_tool_schemas(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Build the tool schema list for this turn.

    add_widget's `type` enum is rebuilt each call so newly created custom
    widgets become placeable immediately, without restarting the agent.
    """
    custom_keys = custom_widgets_repo.list_keys(conn)
    all_types = WIDGET_TYPES + custom_keys

    type_summary = widget_type_summary()
    if custom_keys:
        type_summary += "\n  Custom (AI-generated) widgets:\n" + "\n".join(
            f"  {key}" for key in custom_keys
        )

    return [
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
                    + type_summary
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "description": "Widget type key",
                            "enum": all_types,
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
        {
            "type": "function",
            "function": {
                "name": "create_custom_widget",
                "description": (
                    "Write and register a brand-new widget type when none of the existing "
                    "types fit what the user asked for. Stores the source code, validates "
                    "it, and returns a new type key you can then place with add_widget. "
                    "Only use this when you're confident an existing type genuinely can't "
                    "do the job — prefer reusing existing types.\n\n"
                    + CUSTOM_WIDGET_CONTRACT
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Short human-readable name, e.g. 'Inspirational Quote'",
                        },
                        "description": {
                            "type": "string",
                            "description": "One sentence describing what it shows",
                        },
                        "source_code": {
                            "type": "string",
                            "description": "The widget source code, following the contract exactly",
                        },
                    },
                    "required": ["name", "source_code"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_custom_widget_source",
                "description": (
                    "Fetch the current source code of a custom (AI-generated) widget, "
                    "with line-number prefixes (like `cat -n`). Call this before editing "
                    "one with edit_custom_widget_lines or edit_custom_widget_string so you "
                    "know the exact current line numbers and text."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "key": {
                            "type": "string",
                            "description": "The custom widget's type key, e.g. 'ai_inspirational_quote'",
                        },
                    },
                    "required": ["key"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "edit_custom_widget_lines",
                "description": (
                    "Replace an inclusive range of lines (1-indexed, as shown by "
                    "get_custom_widget_source) in a custom widget's source with new code. "
                    "Use for structural edits spanning whole lines. The result is "
                    "re-validated against the widget contract before saving — "
                    "" + CUSTOM_WIDGET_CONTRACT
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "key": {
                            "type": "string",
                            "description": "The custom widget's type key",
                        },
                        "start_line": {
                            "type": "integer",
                            "description": "First line to replace (1-indexed, inclusive)",
                        },
                        "end_line": {
                            "type": "integer",
                            "description": "Last line to replace (1-indexed, inclusive)",
                        },
                        "new_code": {
                            "type": "string",
                            "description": "The code to put in place of those lines (may be multiple lines, or empty to delete them)",
                        },
                    },
                    "required": ["key", "start_line", "end_line", "new_code"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "edit_custom_widget_string",
                "description": (
                    "Find a unique snippet of text in a custom widget's source and replace "
                    "it with new text. old_string must match exactly once — include enough "
                    "surrounding context to make it unique (whitespace included). Use for "
                    "small, surgical edits. The result is re-validated against the widget "
                    "contract before saving — " + CUSTOM_WIDGET_CONTRACT
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "key": {
                            "type": "string",
                            "description": "The custom widget's type key",
                        },
                        "old_string": {
                            "type": "string",
                            "description": "Exact text to find — must occur exactly once in the source",
                        },
                        "new_string": {
                            "type": "string",
                            "description": "Text to replace it with",
                        },
                    },
                    "required": ["key", "old_string", "new_string"],
                },
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

        if name == "create_custom_widget":
            data = CustomWidgetCreate(
                name=args["name"],
                description=args.get("description") or "",
                source_code=args["source_code"],
            )
            try:
                widget = custom_widgets_repo.create_custom_widget(conn, data)
            except CustomWidgetError as e:
                return f"Error: {e}"
            await broadcaster.publish(
                "custom_widgets_changed",
                {"widgets": [w.model_dump(mode="json") for w in custom_widgets_repo.list_custom_widgets(conn)]},
            )
            return (
                f"Created custom widget type={widget.key!r} ({widget.name!r}). "
                f"Place it on the grid with add_widget using type={widget.key!r}."
            )

        if name == "get_custom_widget_source":
            key = args["key"]
            widget = custom_widgets_repo.get_by_key(conn, key)
            if widget is None:
                return f"Error: no custom widget with key {key!r}."
            return (
                f"Source for {key!r} ({widget.name!r}):\n"
                + custom_widgets_repo.numbered_source(widget.source_code)
            )

        if name == "edit_custom_widget_lines":
            try:
                widget = custom_widgets_repo.edit_by_lines(
                    conn,
                    args["key"],
                    int(args["start_line"]),
                    int(args["end_line"]),
                    args["new_code"],
                )
            except CustomWidgetError as e:
                return f"Error: {e}"
            await broadcaster.publish(
                "custom_widgets_changed",
                {"widgets": [w.model_dump(mode="json") for w in custom_widgets_repo.list_custom_widgets(conn)]},
            )
            return f"Updated custom widget {widget.key!r} (lines {args['start_line']}-{args['end_line']} replaced)."

        if name == "edit_custom_widget_string":
            try:
                widget = custom_widgets_repo.edit_by_string(
                    conn, args["key"], args["old_string"], args["new_string"]
                )
            except CustomWidgetError as e:
                return f"Error: {e}"
            await broadcaster.publish(
                "custom_widgets_changed",
                {"widgets": [w.model_dump(mode="json") for w in custom_widgets_repo.list_custom_widgets(conn)]},
            )
            return f"Updated custom widget {widget.key!r}."

        return f"Unknown tool: {name}"

    except WidgetError as e:
        return f"Error: {e}"
    except CustomWidgetError as e:
        return f"Error: {e}"
    except Exception as e:
        return f"Unexpected error in {name}: {e}"
