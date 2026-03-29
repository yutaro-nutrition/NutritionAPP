from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.engine import Engine


PROJECT_ROOT = Path(__file__).resolve().parents[3]
CREATE_TABLES_SQL = PROJECT_ROOT / "app_api" / "sql" / "create_tables.sql"
MIGRATIONS_DIR = PROJECT_ROOT / "app_api" / "sql" / "migrations"


@dataclass(frozen=True)
class SeedRecipe:
    recipe_id: str
    recipe_name: str
    category_lv1: str
    category_lv2: str
    category_lv3: str
    energy_kcal: float
    protein_g: float
    fat_g: float
    carbohydrate_g: float
    tags: str
    notes: str


SEED_RECIPES: tuple[SeedRecipe, ...] = (
    SeedRecipe("RICE_TEST_001", "Seed Staple 1", "主食", "ごはん", "seed", 220.0, 12.0, 3.0, 35.0, "post_game|試合後|dinner", "seed data"),
    SeedRecipe("RICE_TEST_002", "Seed Staple 2", "主食", "麺", "seed", 230.0, 12.0, 4.0, 36.0, "pre_game|試合前|post_game|試合後|breakfast", "seed data"),
    SeedRecipe("MAIN_TEST_001", "Seed Main 1", "主菜", "肉", "seed", 240.0, 16.0, 8.0, 10.0, "post_game|試合後|dinner|high_protein", "seed data"),
    SeedRecipe("MAIN_TEST_002", "Seed Main 2", "主菜", "魚", "seed", 235.0, 16.0, 7.0, 11.0, "pre_game|試合前|post_game|試合後|lunch", "seed data"),
    SeedRecipe("SIDE_TEST_001", "Seed Side 1", "副菜", "副菜", "seed", 140.0, 10.0, 4.0, 14.0, "post_game|試合後|dinner", "seed data"),
    SeedRecipe("SIDE_TEST_002", "Seed Side 2", "副菜", "副菜", "seed", 130.0, 10.0, 3.0, 13.0, "pre_game|試合前|post_game|試合後|lunch", "seed data"),
    SeedRecipe("SOUP_TEST_001", "Seed Soup 1", "汁物", "汁物", "seed", 120.0, 10.0, 3.0, 10.0, "post_game|試合後|dinner", "seed data"),
    SeedRecipe("SOUP_TEST_002", "Seed Soup 2", "汁物", "汁物", "seed", 115.0, 10.0, 2.0, 10.0, "pre_game|試合前|post_game|試合後|lunch", "seed data"),
)


def _read_sql(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def apply_schema(engine: Engine) -> None:
    ddl = _read_sql(CREATE_TABLES_SQL)
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cur:
            cur.execute(ddl)
            for migration in migrations:
                cur.execute(_read_sql(migration))
        raw.commit()
    except Exception:
        raw.rollback()
        raise
    finally:
        raw.close()


def _reset_seed_rows(engine: Engine, recipe_ids: Iterable[str]) -> None:
    ids = list(recipe_ids)
    if not ids:
        return
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM recipe_steps WHERE recipe_id = ANY(:ids)"),
            {"ids": ids},
        )
        conn.execute(
            text("DELETE FROM recipe_ingredients WHERE recipe_id = ANY(:ids)"),
            {"ids": ids},
        )
        conn.execute(
            text("DELETE FROM recipes WHERE recipe_id = ANY(:ids)"),
            {"ids": ids},
        )


def _insert_seed_rows(engine: Engine, recipes: Iterable[SeedRecipe]) -> None:
    with engine.begin() as conn:
        for recipe in recipes:
            kcal = recipe.energy_kcal
            protein = recipe.protein_g
            fat = recipe.fat_g
            carb = recipe.carbohydrate_g
            total = protein + fat + carb
            p_ratio = (protein / total) * 100 if total > 0 else 0
            f_ratio = (fat / total) * 100 if total > 0 else 0
            c_ratio = (carb / total) * 100 if total > 0 else 0
            conn.execute(
                text(
                    """
                    INSERT INTO recipes (
                        recipe_id, recipe_name,
                        category_lv1, category_lv2, category_lv3,
                        energy_kcal, protein_g, fat_g, carbohydrate_g,
                        p_ratio, f_ratio, c_ratio,
                        tags, cooking_method, notes,
                        source_file, source_batch, qa_status, version
                    ) VALUES (
                        :recipe_id, :recipe_name,
                        :category_lv1, :category_lv2, :category_lv3,
                        :energy_kcal, :protein_g, :fat_g, :carbohydrate_g,
                        :p_ratio, :f_ratio, :c_ratio,
                        :tags, :cooking_method, :notes,
                        :source_file, :source_batch, :qa_status, :version
                    )
                    """
                ),
                {
                    "recipe_id": recipe.recipe_id,
                    "recipe_name": recipe.recipe_name,
                    "category_lv1": recipe.category_lv1,
                    "category_lv2": recipe.category_lv2,
                    "category_lv3": recipe.category_lv3,
                    "energy_kcal": kcal,
                    "protein_g": protein,
                    "fat_g": fat,
                    "carbohydrate_g": carb,
                    "p_ratio": round(p_ratio, 2),
                    "f_ratio": round(f_ratio, 2),
                    "c_ratio": round(c_ratio, 2),
                    "tags": recipe.tags,
                    "cooking_method": "boil",
                    "notes": recipe.notes,
                    "source_file": "app_api_test_seed.csv",
                    "source_batch": "app_api_tests_minimum_seed",
                    "qa_status": "passed",
                    "version": "v1",
                },
            )
            conn.execute(
                text(
                    """
                    INSERT INTO recipe_ingredients (
                        recipe_id, line_no, ingredient_name, ingredient_alias,
                        food_id, process, weight_g, amount_value, unit,
                        notes, source_file, source_batch, qa_status, version
                    ) VALUES (
                        :recipe_id, 1, :ingredient_name, NULL,
                        :food_id, 'RAW', :weight_g, :amount_value, 'g',
                        NULL, 'app_api_test_seed.csv', 'app_api_tests_minimum_seed', 'passed', 'v1'
                    )
                    """
                ),
                {
                    "recipe_id": recipe.recipe_id,
                    "ingredient_name": f"{recipe.recipe_name} Ingredient",
                    "food_id": "F9999",
                    "weight_g": 100.0,
                    "amount_value": 100.0,
                },
            )
            conn.execute(
                text(
                    """
                    INSERT INTO recipe_steps (
                        recipe_id, step_number, instruction,
                        source_file, source_batch, qa_status, version
                    ) VALUES (
                        :recipe_id, 1, :instruction,
                        'app_api_test_seed.csv', 'app_api_tests_minimum_seed', 'passed', 'v1'
                    )
                    """
                ),
                {
                    "recipe_id": recipe.recipe_id,
                    "instruction": f"Cook {recipe.recipe_name}",
                },
            )


def ensure_minimum_seed(engine: Engine) -> None:
    apply_schema(engine)
    recipe_ids = [x.recipe_id for x in SEED_RECIPES]
    _reset_seed_rows(engine, recipe_ids)
    _insert_seed_rows(engine, SEED_RECIPES)
