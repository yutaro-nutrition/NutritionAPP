from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, text

from app.db.session import SessionLocal
from app.main import app
from app.models.recipe_models import Recipe, RecipeStep


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


def test_recipe_detail_allows_null_weight_g() -> None:
    recipe_id = "API_NULL_WEIGHT_001"

    with SessionLocal() as db:
        db.execute(delete(RecipeStep).where(RecipeStep.recipe_id == recipe_id))
        db.execute(text("DELETE FROM recipe_ingredients WHERE recipe_id = :recipe_id"), {"recipe_id": recipe_id})
        db.execute(delete(Recipe).where(Recipe.recipe_id == recipe_id))
        db.add(
            Recipe(
                recipe_id=recipe_id,
                recipe_name="Null Weight Recipe",
                category_lv1="副菜",
                category_lv2="seed",
                category_lv3="test",
                energy_kcal=120,
                protein_g=10,
                fat_g=3,
                carbohydrate_g=12,
                p_ratio=40,
                f_ratio=20,
                c_ratio=40,
                tags="dinner",
                cooking_method="boil",
                notes="null weight test",
                source_file="app_api_test_seed.csv",
                source_batch="app_api_tests",
                qa_status="passed",
                version="v1",
            )
        )
        db.flush()
        db.execute(
            text(
                """
                INSERT INTO recipe_ingredients (
                    recipe_id, line_no, ingredient_name, ingredient_alias,
                    food_id, process, weight_g, amount_value, unit,
                    notes, source_file, source_batch, qa_status, version
                ) VALUES (
                    :recipe_id, 1, :ingredient_name, NULL,
                    :food_id, 'RAW', NULL, 15, 'ml',
                    NULL, 'app_api_test_seed.csv', 'app_api_tests', 'passed', 'v1'
                )
                """
            ),
            {
                "recipe_id": recipe_id,
                "ingredient_name": "しょうゆ",
                "food_id": "F1234",
            },
        )
        db.add(
            RecipeStep(
                recipe_id=recipe_id,
                step_number=1,
                instruction="混ぜる",
                source_file="app_api_test_seed.csv",
                source_batch="app_api_tests",
                qa_status="passed",
                version="v1",
            )
        )
        db.commit()

    response = client.get(f"/recipes/{recipe_id}")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ingredients"][0]["weight_g"] is None
