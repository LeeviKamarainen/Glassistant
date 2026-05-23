"""Backend widget registry — single source of truth for all widget types.

Each entry maps a widget type key (matching the frontend registry.ts) to its
metadata: a human-readable label, a short description the agent uses when
deciding what to add, and the recommended default span.

To add a new widget:
  1. Add its React component to frontend/src/components/widgets/
  2. Register it in frontend/src/components/widgets/registry.ts
  3. Add a matching entry here

The agent's tool schema is built dynamically from this dict, so the LLM
always sees an accurate list without any manual prompt updates.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class WidgetMeta:
    label: str
    description: str
    default_row_span: int = 1
    default_col_span: int = 1


# Keep entries in the same order as frontend/src/components/widgets/registry.ts
WIDGET_REGISTRY: dict[str, WidgetMeta] = {
    "clock": WidgetMeta(
        label="Clock",
        description="Current time with optional seconds and 12/24h format.",
    ),
    "date": WidgetMeta(
        label="Date",
        description="Day, date number, and month name in a vertical stack.",
    ),
    "datetime": WidgetMeta(
        label="Date & Time",
        description="Full date header with large clock below — calendar and clock combined.",
    ),
    "weather": WidgetMeta(
        label="Weather",
        description="Current conditions — temperature, icon, humidity and wind.",
    ),
    "weather_forecast": WidgetMeta(
        label="Weather Forecast",
        description="Today's conditions large, with a compact 3-day forecast below.",
        default_row_span=2,
    ),
    "transit": WidgetMeta(
        label="Transit",
        description="Upcoming HSL departures for configured routes (train, bus, tram).",
        default_col_span=2,
    ),
    "calendar": WidgetMeta(
        label="Calendar",
        description="Google Calendar — current week view with events per day.",
        default_row_span=2,
        default_col_span=2,
    ),
    "todo": WidgetMeta(
        label="Todo",
        description="Scrolling task list sorted by due date.",
        default_row_span=2,
    ),
    "countdown": WidgetMeta(
        label="Countdown",
        description="Days (and optionally hours/minutes) until or since a target date.",
    ),
    "spotify": WidgetMeta(
        label="Spotify",
        description="Currently playing track from Spotify — album art, title, artist, progress.",
        default_col_span=2,
    ),
    "flights": WidgetMeta(
        label="Flights",
        description="Live aircraft overhead via OpenSky Network — callsign, altitude, speed, heading.",
        default_col_span=2,
    ),
}

# Flat list of valid type keys — used for enum validation in the tool schema
WIDGET_TYPES: list[str] = list(WIDGET_REGISTRY.keys())


def widget_type_summary() -> str:
    """One-line-per-type summary for the agent's tool description."""
    lines: list[str] = []
    for key, meta in WIDGET_REGISTRY.items():
        span = f"{meta.default_row_span}×{meta.default_col_span}"
        lines.append(f"  {key}: {meta.description} (default span {span})")
    return "\n".join(lines)
