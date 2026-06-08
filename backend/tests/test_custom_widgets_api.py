from __future__ import annotations

from fastapi.testclient import TestClient

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
