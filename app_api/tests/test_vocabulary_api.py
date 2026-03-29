from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_meta_options_endpoint_returns_vocabulary_sets() -> None:
    response = client.get("/meta/options")
    assert response.status_code == 200
    payload = response.json()
    assert "meal_type" in payload
    assert "scene" in payload
    assert "tags_recommended" in payload
    assert any(item["code"] == "breakfast" for item in payload["meal_type"])
    assert any(item["code"] == "pre_game" for item in payload["scene"])


def test_recipes_meal_type_accepts_compatible_code_alias() -> None:
    jp = client.get("/recipes", params={"meal_type": "試合後"})
    code = client.get("/recipes", params={"meal_type": "post_game"})
    assert jp.status_code == 200
    assert code.status_code == 200
    assert code.json()["total"] == jp.json()["total"]


def test_menu_generate_applied_conditions_include_normalized_values() -> None:
    response = client.post(
        "/menu/generate",
        json={
            "target_kcal": 800,
            "target_protein_g": 35,
            "scene": "試合前",
            "meal_type": "post_game",
        },
    )
    assert response.status_code == 200, response.text
    first = response.json()["patterns"][0]["applied_conditions"]
    assert first["scene"] == "試合前"
    assert first["scene_normalized"] == "pre_game"
    assert first["meal_type"] == "post_game"
    assert first["meal_type_normalized"] == "post_game"
