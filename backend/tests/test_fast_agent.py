"""Fast path (Needle first, Ollama fallback) through the real /api/chat endpoint."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi.testclient import TestClient

from app.agent.widget_registry import WIDGET_TYPES
from app.services.needle import NeedleUnavailable


class FakeNeedle:
    def __init__(self, result: dict[str, Any] | None = None, error: str | None = None) -> None:
        self.result = result or {}
        self.error = error
        self.queries: list[str] = []
        self.tools: list[dict[str, Any]] = []

    @property
    def tool_names(self) -> list[str]:
        return [t["name"] for t in self.tools]

    async def complete(self, query: str, tools: list[dict[str, Any]]) -> dict[str, Any]:
        self.queries.append(query)
        self.tools = tools
        if self.error:
            raise NeedleUnavailable(self.error)
        return self.result


class FakeOllama:
    def __init__(self) -> None:
        self.calls = 0

    async def stream(self, messages: list[dict[str, Any]], tools: Any = None, think: bool = False) -> AsyncIterator[dict[str, Any]]:
        self.calls += 1
        yield {"message": {"content": "from ollama"}}

    async def aclose(self) -> None:
        pass


def _call(name: str, **arguments: Any) -> dict[str, Any]:
    return {"name": name, "arguments": arguments}


def _result(*calls: dict[str, Any], confidence: float = 0.9) -> dict[str, Any]:
    return {"function_calls": list(calls), "confidence": confidence}


def _setup(client: TestClient, needle: FakeNeedle) -> FakeOllama:
    ollama = FakeOllama()
    client.app.state.needle = needle
    client.app.state.ollama = ollama
    return ollama


def _chat(client: TestClient, text: str, fast: bool = True) -> list[dict[str, Any]]:
    resp = client.post(
        "/api/chat", json={"messages": [{"role": "user", "content": text}], "fast": fast}
    )
    assert resp.status_code == 200
    return [json.loads(line[6:]) for line in resp.text.splitlines() if line.startswith("data: ")]


def _layout(client: TestClient) -> list[dict[str, Any]]:
    return client.get("/api/layout").json()["widgets"]


def _widget(client: TestClient, wtype: str) -> dict[str, Any]:
    return next(w for w in _layout(client) if w["type"] == wtype)


# --- routing / fallback ------------------------------------------------------------


def test_fast_call_executes_and_skips_ollama(client: TestClient) -> None:
    needle = FakeNeedle(_result(_call("add_widget", type="countdown")))
    ollama = _setup(client, needle)

    events = _chat(client, "add a countdown")

    assert [e["type"] for e in events] == ["needle", "tool_start", "tool_result", "text_delta", "done"]
    assert ollama.calls == 0
    assert needle.queries == ["add a countdown"]
    assert any(w["type"] == "countdown" for w in _layout(client))


def test_only_last_user_message_is_sent(client: TestClient) -> None:
    needle = FakeNeedle(_result(_call("set_theme", theme="forest")))
    _setup(client, needle)

    client.post("/api/chat", json={"fast": True, "messages": [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "ok"},
        {"role": "user", "content": "second"},
    ]})
    assert needle.queries == ["second"]


def test_low_confidence_falls_back_to_ollama(client: TestClient) -> None:
    ollama = _setup(client, FakeNeedle(_result(_call("remove_widget", widget="clock"), confidence=0.3)))
    before = _layout(client)

    events = _chat(client, "remove the clock")

    assert ollama.calls >= 1
    assert events[0]["type"] == "needle" and "low confidence" in events[0]["reason"]
    assert any(e["type"] == "text_delta" and e["content"] == "from ollama" for e in events)
    assert _layout(client) == before  # the low-confidence call was NOT executed


def test_empty_calls_fall_back(client: TestClient) -> None:
    ollama = _setup(client, FakeNeedle(_result(confidence=0.1)))

    events = _chat(client, "what's the weather like?")

    assert ollama.calls >= 1
    assert "no matching tool" in events[0]["reason"]


def test_needle_unavailable_falls_back(client: TestClient) -> None:
    ollama = _setup(client, FakeNeedle(error="not installed"))

    events = _chat(client, "add a clock")

    assert ollama.calls >= 1
    assert "unavailable" in events[0]["reason"]


def test_fast_false_ignores_needle(client: TestClient) -> None:
    needle = FakeNeedle(_result(_call("set_theme", theme="forest")))
    ollama = _setup(client, needle)

    _chat(client, "forest theme", fast=False)

    assert needle.queries == []
    assert ollama.calls >= 1


def test_widget_not_mentioned_falls_back_without_executing(client: TestClient) -> None:
    # High confidence but the sentence never mentions a clock → don't trust it.
    ollama = _setup(client, FakeNeedle(_result(_call("remove_widget", widget="clock"), confidence=0.95)))
    before = _layout(client)

    events = _chat(client, "tell me a joke")

    assert ollama.calls >= 1
    assert "clock not mentioned" in events[0]["reason"]
    assert _layout(client) == before


def test_one_bad_call_blocks_the_whole_command(client: TestClient) -> None:
    _setup(client, FakeNeedle(_result(_call("add_widget", type="countdown"), _call("remove_widget", widget="weather"))))
    before = _layout(client)

    events = _chat(client, "add a countdown")  # never mentions the weather

    assert "weather not mentioned" in events[0]["reason"]
    assert _layout(client) == before  # the countdown add did not half-apply


# --- tools handed to Needle ---------------------------------------------------------


def test_tool_schema_is_static_across_layout_changes(client: TestClient) -> None:
    # Re-initialising Needle with a different toolset costs ~1.2 s, so the schema must
    # not depend on what is currently on the dashboard.
    needle = FakeNeedle(_result(confidence=0.0))
    _setup(client, needle)

    _chat(client, "anything")
    before = needle.tools
    client.post("/api/widgets", json={"type": "todo", "row": 8, "col": 0, "row_span": 1, "col_span": 1})
    _chat(client, "anything")

    assert needle.tools == before


def test_tool_schema_follows_needle_design_rules(client: TestClient) -> None:
    needle = FakeNeedle(_result(confidence=0.0))
    _setup(client, needle)

    _chat(client, "anything")

    # <=5 tools: above that Needle's retrieval step engages and can drop tools.
    assert needle.tool_names == ["add_widget", "remove_widget", "nudge_widget", "move_widget", "set_theme"]
    props = {t["name"]: t["parameters"]["properties"] for t in needle.tools}
    required = {t["name"]: t["parameters"]["required"] for t in needle.tools}
    # Every widget type is offered, under the name a user would say.
    labels = set(props["remove_widget"]["widget"]["enum"])
    assert set(WIDGET_TYPES) - {"datetime", "weather_forecast", "todo"} <= labels
    assert {"date and time", "weather forecast", "todo list"} <= labels
    assert not {"datetime", "weather_forecast", "todo"} & labels
    # Bounds live in the schema (default grid 12 rows x 7 cols); steps default to one cell.
    assert props["move_widget"]["x"]["maximum"] == 6 and props["move_widget"]["y"]["maximum"] == 11
    assert props["nudge_widget"]["steps"]["default"] == 1 and "steps" in required["nudge_widget"]


def test_spoken_widget_labels_are_mapped_back_to_types(client: TestClient) -> None:
    client.post("/api/widgets", json={"type": "todo", "row": 8, "col": 0, "row_span": 1, "col_span": 1})
    _setup(client, FakeNeedle(_result(_call("nudge_widget", widget="todo list", direction="down", steps=1))))

    events = _chat(client, "move the todo list down")

    assert events[0]["calls"][0]["arguments"]["widget"] == "todo"
    assert _widget(client, "todo")["row"] == 9


def test_adding_a_widget_by_its_spoken_label(client: TestClient) -> None:
    _setup(client, FakeNeedle(_result(_call("add_widget", type="weather forecast"))))

    _chat(client, "show the weather forecast")

    assert any(w["type"] == "weather_forecast" for w in _layout(client))


def test_moving_a_widget_that_is_not_on_the_dashboard_falls_back(client: TestClient) -> None:
    ollama = _setup(client, FakeNeedle(_result(_call("nudge_widget", widget="flights", direction="down"))))
    before = _layout(client)

    events = _chat(client, "move the flights widget down")

    assert ollama.calls >= 1
    assert "no flights widgets" in events[0]["reason"]
    assert _layout(client) == before


# --- executing calls ----------------------------------------------------------------


def test_add_widget_position_and_remove(client: TestClient) -> None:
    _setup(client, FakeNeedle(_result(_call("add_widget", type="todo", position="bottom-right"))))
    _chat(client, "todo at the bottom right")
    todo = _widget(client, "todo")
    # Default grid is 12×7; the todo should hug the bottom-right corner.
    assert todo["row"] + todo["row_span"] == 12
    assert todo["col"] + todo["col_span"] == 7

    _setup(client, FakeNeedle(_result(_call("remove_widget", widget="todo"))))
    _chat(client, "remove the todo")
    assert not any(w["type"] == "todo" for w in _layout(client))


def test_remove_widget_not_on_dashboard_reports_it(client: TestClient) -> None:
    _setup(client, FakeNeedle(_result(_call("remove_widget", widget="spotify"))))

    events = _chat(client, "remove spotify")

    result = next(e for e in events if e["type"] == "tool_result")
    assert "No spotify widget" in result["result"]


def test_nudge_moves_by_direction_and_steps(client: TestClient) -> None:
    weather = _widget(client, "weather")  # default: row 0, col 4, 2×3
    _setup(client, FakeNeedle(_result(_call("nudge_widget", widget="weather", direction="down", steps=3))))

    _chat(client, "move the weather down by 3")

    moved = _widget(client, "weather")
    assert (moved["row"], moved["col"]) == (weather["row"] + 3, weather["col"])
    assert (moved["row_span"], moved["col_span"]) == (weather["row_span"], weather["col_span"])


def test_nudge_defaults_to_one_step(client: TestClient) -> None:
    weather = _widget(client, "weather")
    _setup(client, FakeNeedle(_result(_call("nudge_widget", widget="weather", direction="down"))))

    _chat(client, "move the weather down")

    assert _widget(client, "weather")["row"] == weather["row"] + 1


def test_nudge_off_grid_is_reported_not_applied(client: TestClient) -> None:
    weather = _widget(client, "weather")
    _setup(client, FakeNeedle(_result(_call("nudge_widget", widget="weather", direction="up"))))

    events = _chat(client, "move the weather up")

    result = next(e for e in events if e["type"] == "tool_result")
    assert "leave the 7×12 grid" in result["result"]
    assert "validation error" not in result["result"]
    assert _widget(client, "weather")["row"] == weather["row"]


def test_move_to_coordinates_outside_grid_is_reported(client: TestClient) -> None:
    weather = _widget(client, "weather")
    _setup(client, FakeNeedle(_result(_call("move_widget", widget="weather", x=20, y=2))))

    events = _chat(client, "move the weather to x 20 y 2")

    result = next(e for e in events if e["type"] == "tool_result")
    assert "leave the 7×12 grid" in result["result"]
    assert _widget(client, "weather")["col"] == weather["col"]


def test_move_to_coordinates_x_is_column_y_is_row(client: TestClient) -> None:
    _setup(client, FakeNeedle(_result(_call("move_widget", widget="weather", x=4, y=5))))

    _chat(client, "move the weather to x 4 y 5")

    moved = _widget(client, "weather")
    assert (moved["row"], moved["col"]) == (5, 4)


def test_coordinates_win_over_a_stray_position(client: TestClient) -> None:
    # Observed with the base model: it fills `position` alongside x/y.
    _setup(client, FakeNeedle(_result(_call("move_widget", widget="weather", x=4, y=5, position="top-left"))))

    _chat(client, "move the weather to x 4 y 5")

    assert (_widget(client, "weather")["row"], _widget(client, "weather")["col"]) == (5, 4)


def test_move_with_only_one_coordinate_keeps_the_other(client: TestClient) -> None:
    weather = _widget(client, "weather")
    _setup(client, FakeNeedle(_result(_call("move_widget", widget="weather", y=6))))

    _chat(client, "move the weather to row 6")

    moved = _widget(client, "weather")
    assert (moved["row"], moved["col"]) == (6, weather["col"])


def test_move_to_region_keeps_size(client: TestClient) -> None:
    clock = _widget(client, "clock")
    _setup(client, FakeNeedle(_result(_call("move_widget", widget="clock", position="bottom-left"))))

    _chat(client, "move the clock to the bottom left")

    moved = _widget(client, "clock")
    assert (moved["row_span"], moved["col_span"]) == (clock["row_span"], clock["col_span"])
    assert moved["row"] > clock["row"] and moved["col"] == 0


def test_move_without_destination_falls_back(client: TestClient) -> None:
    ollama = _setup(client, FakeNeedle(_result(_call("move_widget", widget="clock"))))

    events = _chat(client, "move the clock")

    assert ollama.calls >= 1
    assert "no destination" in events[0]["reason"]


def test_ambiguous_widget_falls_back_for_move_and_nudge(client: TestClient) -> None:
    client.post("/api/widgets", json={"type": "clock", "row": 8, "col": 0, "row_span": 1, "col_span": 1})
    ollama = _setup(client, FakeNeedle(_result(_call("nudge_widget", widget="clock", direction="down"))))

    events = _chat(client, "move the clock down")

    assert ollama.calls >= 1
    assert "2 clock widgets" in events[0]["reason"]


def test_remove_removes_every_instance(client: TestClient) -> None:
    client.post("/api/widgets", json={"type": "clock", "row": 8, "col": 0, "row_span": 1, "col_span": 1})
    _setup(client, FakeNeedle(_result(_call("remove_widget", widget="clock"))))

    _chat(client, "remove the clock")

    assert not any(w["type"] == "clock" for w in _layout(client))


def test_set_theme_persists(client: TestClient) -> None:
    _setup(client, FakeNeedle(_result(_call("set_theme", theme="ember"))))

    _chat(client, "ember theme")

    assert client.get("/api/settings").json()["settings"]["theme"] == "ember"


def test_multiple_calls_run_in_order(client: TestClient) -> None:
    _setup(client, FakeNeedle(_result(_call("add_widget", type="todo"), _call("set_theme", theme="forest"))))

    events = _chat(client, "todo and forest")

    assert [e["tool"] for e in events if e["type"] == "tool_start"] == ["add_widget", "set_theme"]
