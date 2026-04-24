from __future__ import annotations

import pytest
from sqlalchemy import delete

from app.db.session import SessionLocal
from app.models.recipe_models import Recipe
from app.repositories.recipe_repository import RecipeListFilters, RecipeRepository


pytestmark = pytest.mark.integration


def test_recipe_list_fetch() -> None:
    with SessionLocal() as db:
        repo = RecipeRepository(db)
        rows, total = repo.list_recipes(
            RecipeListFilters(category="staple", min_protein_g=1, limit=10, offset=0)
        )
    assert total > 0
    assert len(rows) > 0


def test_donburi_is_staple_compatible() -> None:
    recipe_id = "DON_TEST_STAPLE_001"

    with SessionLocal() as db:
        db.execute(delete(Recipe).where(Recipe.recipe_id == recipe_id))
        db.add(
            Recipe(
                recipe_id=recipe_id,
                recipe_name="Donburi Staple Compatibility",
                category_lv1="丼",
                category_lv2="丼",
                category_lv3="seed",
                energy_kcal=520,
                protein_g=24,
                fat_g=12,
                carbohydrate_g=78,
                p_ratio=21.05,
                f_ratio=10.53,
                c_ratio=68.42,
                tags="dinner",
                cooking_method="assemble",
                notes="repository slot test",
                source_file="app_api_test_seed.csv",
                source_batch="app_api_tests",
                qa_status="passed",
                version="v1",
            )
        )
        db.commit()

        repo = RecipeRepository(db)
        rows = repo.list_by_slot("staple")
        row_ids = {row.recipe_id for row in rows}
        db.execute(delete(Recipe).where(Recipe.recipe_id == recipe_id))
        db.commit()

    assert recipe_id in row_ids


def test_recipe_detail_fetch() -> None:
    with SessionLocal() as db:
        repo = RecipeRepository(db)
        rows, _ = repo.list_recipes(RecipeListFilters(limit=1, offset=0))
        assert rows, "recipes table is empty"
        recipe_id = rows[0].recipe_id

        recipe = repo.get_recipe_by_id(recipe_id)
        ingredients = repo.get_recipe_ingredients(recipe_id)
        steps = repo.get_recipe_steps(recipe_id)

    assert recipe is not None
    assert len(ingredients) > 0
    assert len(steps) > 0


def test_invalid_category_for_random() -> None:
    with SessionLocal() as db:
        repo = RecipeRepository(db)
        try:
            repo.get_random_recipe_by_slot("invalid_category")
            assert False, "ValueError should be raised for invalid slot"
        except ValueError:
            assert True
