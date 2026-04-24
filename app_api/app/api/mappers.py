from __future__ import annotations

from app.models.recipe_models import Recipe, RecipeIngredient, RecipeStep


def recipe_to_dict(recipe: Recipe) -> dict:
    return {
        "recipe_id": recipe.recipe_id,
        "recipe_name": recipe.recipe_name,
        "category_lv1": recipe.category_lv1,
        "category_lv2": recipe.category_lv2,
        "category_lv3": recipe.category_lv3,
        "tags": recipe.tags,
        "energy_kcal": float(recipe.energy_kcal),
        "protein_g": float(recipe.protein_g),
        "fat_g": float(recipe.fat_g),
        "carbohydrate_g": float(recipe.carbohydrate_g),
        "cooking_method": recipe.cooking_method,
        "notes": recipe.notes,
    }


def ingredient_to_dict(ingredient: RecipeIngredient) -> dict:
    return {
        "line_no": ingredient.line_no,
        "ingredient_name": ingredient.ingredient_name,
        "ingredient_alias": ingredient.ingredient_alias,
        "weight_g": None if ingredient.weight_g is None else float(ingredient.weight_g),
        "amount_value": None if ingredient.amount_value is None else float(ingredient.amount_value),
        "unit": ingredient.unit,
        "notes": ingredient.notes,
    }


def step_to_dict(step: RecipeStep) -> dict:
    return {
        "step_number": step.step_number,
        "instruction": step.instruction,
    }

