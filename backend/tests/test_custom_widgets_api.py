from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import connection
from app.repositories import custom_widgets as custom_widgets_repo
from app.repositories.custom_widgets import CustomWidgetError

VALID_SOURCE = (
    "({ widget }) => {\n"
    "  const label = (widget.config && widget.config.label) || 'Hello';\n"
    "  return <div className=\"text-2xl font-light\">{label}</div>;\n"
    "}"
)


def test_create_list_delete_custom_widget(client: TestClient) -> None:
    create = client.post(
        "/api/custom-widgets",
        json={"name": "Greeting", "description": "Shows a greeting", "source_code": VALID_SOURCE},
    )
    assert create.status_code == 201
    body = create.json()
    assert body["key"] == "ai_greeting"
    assert body["status"] == "active"

    listed = client.get("/api/custom-widgets").json()
    assert any(w["key"] == "ai_greeting" for w in listed)

    delete = client.delete(f"/api/custom-widgets/{body['id']}")
    assert delete.status_code == 204

    after = client.get("/api/custom-widgets").json()
    assert all(w["id"] != body["id"] for w in after)


def test_duplicate_name_gets_disambiguated_key(client: TestClient) -> None:
    first = client.post(
        "/api/custom-widgets",
        json={"name": "Greeting", "source_code": VALID_SOURCE},
    )
    second = client.post(
        "/api/custom-widgets",
        json={"name": "Greeting", "source_code": VALID_SOURCE},
    )
    assert first.json()["key"] == "ai_greeting"
    assert second.json()["key"] == "ai_greeting_2"


def test_rejects_bad_shape(client: TestClient) -> None:
    resp = client.post(
        "/api/custom-widgets",
        json={"name": "Bad", "source_code": "function notAWidget() { return 1; }"},
    )
    assert resp.status_code == 422
    assert "shape" in resp.json()["detail"].lower()


def test_rejects_denylisted_apis(client: TestClient) -> None:
    source = (
        "({ widget }) => {\n"
        "  fetch('https://example.com');\n"
        "  return <div>nope</div>;\n"
        "}"
    )
    resp = client.post(
        "/api/custom-widgets",
        json={"name": "Sneaky", "source_code": source},
    )
    assert resp.status_code == 422
    assert "disallowed" in resp.json()["detail"].lower()


def test_rejects_oversized_source(client: TestClient) -> None:
    # Exceeds the Pydantic schema's max_length — rejected before it ever reaches
    # the repository's own (redundant, defense-in-depth) length check.
    huge = "({ widget }) => { " + ("x" * 9000) + "; return <div/>; }"
    resp = client.post(
        "/api/custom-widgets",
        json={"name": "Huge", "source_code": huge},
    )
    assert resp.status_code == 422


def test_delete_missing_returns_404(client: TestClient) -> None:
    resp = client.delete("/api/custom-widgets/9999")
    assert resp.status_code == 404


def test_numbered_source_has_line_prefixes() -> None:
    numbered = custom_widgets_repo.numbered_source("a\nb\nc")
    assert numbered == "1\ta\n2\tb\n3\tc"


def test_edit_by_lines_replaces_range(client: TestClient, settings: Settings) -> None:
    create = client.post(
        "/api/custom-widgets",
        json={"name": "Greeting", "source_code": VALID_SOURCE},
    ).json()

    with connection(settings.db_path) as conn:
        updated = custom_widgets_repo.edit_by_lines(
            conn,
            create["key"],
            2,
            2,
            "  const label = (widget.config && widget.config.label) || 'Hi there';",
        )
        assert "Hi there" in updated.source_code
        assert "Hello" not in updated.source_code
        # Shape and rest of the function are untouched
        assert updated.source_code.startswith("({ widget }) => {")
        assert "return <div" in updated.source_code


def test_edit_by_lines_rejects_out_of_bounds_range(client: TestClient, settings: Settings) -> None:
    create = client.post(
        "/api/custom-widgets",
        json={"name": "Greeting", "source_code": VALID_SOURCE},
    ).json()

    with connection(settings.db_path) as conn:
        try:
            custom_widgets_repo.edit_by_lines(conn, create["key"], 10, 12, "x")
            assert False, "expected CustomWidgetError"
        except CustomWidgetError as e:
            assert "out of bounds" in str(e)


def test_edit_by_string_replaces_unique_match(client: TestClient, settings: Settings) -> None:
    create = client.post(
        "/api/custom-widgets",
        json={"name": "Greeting", "source_code": VALID_SOURCE},
    ).json()

    with connection(settings.db_path) as conn:
        updated = custom_widgets_repo.edit_by_string(conn, create["key"], "'Hello'", "'Howdy'")
        assert "'Howdy'" in updated.source_code
        assert "'Hello'" not in updated.source_code


def test_edit_by_string_requires_unique_match(client: TestClient, settings: Settings) -> None:
    source = (
        "({ widget }) => {\n"
        "  const a = 'x';\n"
        "  const b = 'x';\n"
        "  return <div>{a}{b}</div>;\n"
        "}"
    )
    create = client.post(
        "/api/custom-widgets",
        json={"name": "Dup", "source_code": source},
    ).json()

    with connection(settings.db_path) as conn:
        try:
            custom_widgets_repo.edit_by_string(conn, create["key"], "'x'", "'y'")
            assert False, "expected CustomWidgetError"
        except CustomWidgetError as e:
            assert "not unique" in str(e)


def test_edit_by_string_rejects_contract_violation(client: TestClient, settings: Settings) -> None:
    create = client.post(
        "/api/custom-widgets",
        json={"name": "Greeting", "source_code": VALID_SOURCE},
    ).json()

    with connection(settings.db_path) as conn:
        try:
            custom_widgets_repo.edit_by_string(
                conn, create["key"], "return <div", "fetch('https://x'); return <div"
            )
            assert False, "expected CustomWidgetError"
        except CustomWidgetError as e:
            assert "disallowed" in str(e)
