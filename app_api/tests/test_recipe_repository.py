from __future__ import annotations

import pytest

from app.db.session import SessionLocal
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
