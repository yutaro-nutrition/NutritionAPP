from __future__ import annotations

from pathlib import Path

import pandas as pd


def _recipes_df(recipe_id: str = "MAIN_TEST_0001") -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Recipe_ID": recipe_id,
                "Recipe_Name": "テストレシピ",
                "Category_Code": "main_dish",
                "Servings": 1,
                "Tags": "dinner|quick",
            }
        ]
    )


def _ingredients_df(
    recipe_id: str = "MAIN_TEST_0001",
    ingredient_name: object = "鶏むね肉",
    food_id: object = "F1234",
    process: object = "RAW",
) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Recipe_ID": recipe_id,
                "Ingredient_No": 1,
                "Food_ID": food_id,
                "Ingredient_Name": ingredient_name,
                "Amount_Value": 100,
                "Unit": "g",
                "Process_Code": process,
            }
        ]
    )


def _steps_df(recipe_id: str = "MAIN_TEST_0001", step_text: object = "加熱する") -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Recipe_ID": recipe_id,
                "Step_No": 1,
                "Instruction": step_text,
            }
        ]
    )


def write_canonical_workbook(
    path: Path,
    *,
    include_steps: bool = True,
    ingredient_name: object = "鶏むね肉",
    food_id: object = "F1234",
    process: object = "RAW",
    ingredient_token: object | None = None,
) -> Path:
    recipes = _recipes_df()
    ingredients = _ingredients_df(ingredient_name=ingredient_name, food_id=food_id, process=process)
    if ingredient_token is not None:
        ingredients.loc[0, "Ingredient_Name"] = ingredient_token
    steps = _steps_df()

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        recipes.to_excel(writer, sheet_name="Recipes", index=False)
        ingredients.to_excel(writer, sheet_name="Ingredients", index=False)
        if include_steps:
            steps.to_excel(writer, sheet_name="Steps", index=False)

    return path


def write_legacy_workbook(path: Path) -> Path:
    recipe_master = pd.DataFrame(
        [
            {
                "Recipe_ID": "MAIN_LEGACY_0001",
                "Recipe_Name": "レガシーテスト",
                "Category": "主菜",
                "Subcategory": "主菜",
                "serving_size": 1,
                "yield_flag": 0,
                "retention_flag": 0,
                "Cook_Time_Min": 25,
                "version": "v1.0",
                "is_active": 1,
                "Energy(kcal)": 400,
                "Protein(g)": 25,
                "Fat(g)": 15,
                "Carbohydrate(g)": 40,
            }
        ]
    )

    ingredients = pd.DataFrame(
        [
            {
                "Recipe_ID": "MAIN_LEGACY_0001",
                "line_no": 1,
                "Food_Code": "F1234",
                "Food_Name": "鶏むね肉",
                "Weight(g)": 120,
                "unit": "g",
                "optional_flag": 0,
            }
        ]
    )

    steps = pd.DataFrame(
        [
            {
                "Recipe_ID": "MAIN_LEGACY_0001",
                "Step_Number": 1,
                "Instruction": "焼く",
            }
        ]
    )

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        recipe_master.to_excel(writer, sheet_name="Recipe_Master", index=False)
        ingredients.to_excel(writer, sheet_name="Ingredients", index=False)
        steps.to_excel(writer, sheet_name="Steps", index=False)

    return path
