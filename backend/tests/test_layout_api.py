from __future__ import annotations

from fastapi.testclient import TestClient


def test_default_layout_seeded_on_first_boot(client: TestClient) -> None:
    resp = client.get("/api/layout")
    assert resp.status_code == 200
    body = resp.json()
    types = sorted(w["type"] for w in body["widgets"])
    assert types == ["clock", "date", "weather"]


def test_create_update_delete_widget(client: TestClient) -> None:
    create = client.post("/api/widgets", json={"type": "clock", "row": 2, "col": 2})
    assert create.status_code == 201
    widget_id = create.json()["id"]

    patch = client.patch(f"/api/widgets/{widget_id}", json={"row": 2, "col": 1})
    assert patch.status_code == 200
    assert patch.json()["col"] == 1

    delete = client.delete(f"/api/widgets/{widget_id}")
    assert delete.status_code == 204

    after = client.get("/api/layout").json()
    assert all(w["id"] != widget_id for w in after["widgets"])


def test_overlap_rejected(client: TestClient) -> None:
    # default clock is at (0, 1); placing another there should 409.
    resp = client.post("/api/widgets", json={"type": "clock", "row": 0, "col": 1})
    assert resp.status_code == 409
    assert "overlap" in resp.json()["detail"].lower()


def test_out_of_bounds_rejected(client: TestClient) -> None:
    resp = client.post("/api/widgets", json={"type": "clock", "row": 3, "col": 0})
    # Pydantic catches the out-of-range row before we hit the repo.
    assert resp.status_code == 422


def test_span_exceeds_grid_rejected(client: TestClient) -> None:
    # row=2 + row_span=2 > 3
    resp = client.post(
        "/api/widgets",
        json={"type": "clock", "row": 2, "col": 0, "row_span": 2, "col_span": 1},
    )
    assert resp.status_code == 422


def test_reset_restores_defaults(client: TestClient) -> None:
    # mutate state
    client.delete("/api/widgets/1")
    client.post("/api/widgets", json={"type": "clock", "row": 2, "col": 2})

    resp = client.post("/api/layout/reset")
    assert resp.status_code == 200
    types = sorted(w["type"] for w in resp.json()["widgets"])
    assert types == ["clock", "date", "weather"]


def test_update_can_disable_and_reenable_in_same_slot(client: TestClient) -> None:
    layout = client.get("/api/layout").json()["widgets"]
    clock = next(w for w in layout if w["type"] == "clock")
    # Disable, then place a new widget where clock was — should be allowed since
    # the original is disabled and excluded from overlap checks.
    r = client.patch(f"/api/widgets/{clock['id']}", json={"enabled": False})
    assert r.status_code == 200
    r2 = client.post(
        "/api/widgets",
        json={"type": "clock", "row": clock["row"], "col": clock["col"]},
    )
    assert r2.status_code == 201
