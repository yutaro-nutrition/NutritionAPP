from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


pytestmark = pytest.mark.integration

client = TestClient(app)


def test_menu_generation() -> None:
    response = client.post(
        "/menu/generate",
        json={
            "target_kcal": 900,
            "target_protein_g": 45,
            "scene": "試合後",
            "include_dessert": True,
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert len(payload["patterns"]) == 3
    for pattern in payload["patterns"]:
        slots = {slot["slot"] for slot in pattern["slots"]}
        assert {"staple", "main", "side", "soup"}.issubset(slots)
        assert "nutrition_summary" in pattern
        assert "constraint_evaluation" in pattern
        assert "applied_conditions" in pattern
        assert "generation_note" in pattern


def test_menu_generation_no_match() -> None:
    response = client.post(
        "/menu/generate",
        json={
            "target_kcal": 300,
            "target_protein_g": 300,
            "scene": "不存在シーン",
            "include_dessert": False,
        },
    )
    assert response.status_code == 404
    payload = response.json()
    assert payload["error_code"] == "NO_RECIPES_FOUND"
    assert "detail" in payload


def test_invalid_recipe_id() -> None:
    response = client.get("/recipes/NO_SUCH_RECIPE_ID")
    assert response.status_code == 404
    payload = response.json()
    assert payload["error_code"] == "RECIPE_NOT_FOUND"
    assert "detail" in payload


def test_validation_error_has_error_code() -> None:
    response = client.get("/recipes", params={"limit": 0})
    assert response.status_code == 422
    payload = response.json()
    assert payload["error_code"] == "VALIDATION_ERROR"
    assert isinstance(payload["detail"], list)
