from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import psycopg
import pytest
from psycopg import sql

from tests.conftest import PostgresTestConfig, fetch_table_counts, parse_json_stdout, run_pipeline_cli

ROOT = Path(__file__).resolve().parents[1]
PIPELINE_SCRIPT = "scripts/import_recipe_excel_pipeline.py"
MIGRATION_SQL = ROOT / "app_api" / "sql" / "migrations" / "20260328_02_option2_amount_value_unit_and_nullable_weight.sql"
TEMPLATE = ROOT / "templates" / "recipe_excel_canonical_template_v1.xlsx"
INVALID_DIR = ROOT / "templates" / "invalid_samples"

pytestmark = pytest.mark.integration


def run_pipeline_with_db(
    excel_path: Path,
    output_dir: Path,
    cfg: PostgresTestConfig,
    *extra_args: str,
):
    return run_pipeline_cli(
        str(excel_path),
        "--json",
        "--output-dir",
        str(output_dir),
        "--import-db",
        "--db-host",
        cfg.host,
        "--db-port",
        str(cfg.port),
        "--db-name",
        cfg.db_name,
        "--db-user",
        cfg.user,
        "--db-password",
        cfg.password,
        "--db-schema",
        cfg.schema,
        *extra_args,
    )


def _write_canonical_workbook(
    path: Path,
    *,
    recipe_id: str,
    ingredient_rows: list[dict],
) -> Path:
    recipes = pd.DataFrame(
        [
            {
                "Recipe_ID": recipe_id,
                "Recipe_Name": f"Recipe {recipe_id}",
                "Category_Code": "main_dish",
                "Servings": 2,
                "Tags": "dinner|quick",
            }
        ]
    )
    ingredients = pd.DataFrame(ingredient_rows)
    steps = pd.DataFrame([{"Recipe_ID": recipe_id, "Step_No": 1, "Instruction": "Cook."}])

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        recipes.to_excel(writer, sheet_name="Recipes", index=False)
        ingredients.to_excel(writer, sheet_name="Ingredients", index=False)
        steps.to_excel(writer, sheet_name="Steps", index=False)
    return path


def _fetch_ingredient_amount_unit_weight(
    cfg: PostgresTestConfig,
    recipe_id: str,
    line_no: int,
) -> tuple[float | None, str | None, float | None]:
    with psycopg.connect(
        host=cfg.host,
        port=cfg.port,
        dbname=cfg.db_name,
        user=cfg.user,
        password=cfg.password,
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    """
                    SELECT amount_value, unit, weight_g
                    FROM {}.recipe_ingredients
                    WHERE recipe_id = %s AND line_no = %s
                    """
                ).format(sql.Identifier(cfg.schema)),
                (recipe_id, line_no),
            )
            row = cur.fetchone()
            assert row is not None
            amount_value = None if row[0] is None else float(row[0])
            unit = None if row[1] is None else str(row[1])
            weight_g = None if row[2] is None else float(row[2])
            return amount_value, unit, weight_g


def test_option2_schema_columns_and_nullable_weight(clean_test_tables: PostgresTestConfig) -> None:
    cfg = clean_test_tables
    with psycopg.connect(
        host=cfg.host,
        port=cfg.port,
        dbname=cfg.db_name,
        user=cfg.user,
        password=cfg.password,
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name, is_nullable
                FROM information_schema.columns
                WHERE table_schema = %s
                  AND table_name = 'recipe_ingredients'
                  AND column_name IN ('amount_value', 'unit', 'weight_g')
                ORDER BY column_name
                """,
                (cfg.schema,),
            )
            rows = cur.fetchall()
            got = {str(r[0]): str(r[1]) for r in rows}
            assert got["amount_value"] == "YES"
            assert got["unit"] == "YES"
            assert got["weight_g"] == "YES"

            cur.execute(
                """
                SELECT conname
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE n.nspname = %s
                  AND t.relname = 'recipe_ingredients'
                  AND conname IN (
                      'ck_recipe_ingredients_amount_value_positive',
                      'ck_recipe_ingredients_unit',
                      'ck_recipe_ingredients_weight_positive'
                  )
                ORDER BY conname
                """,
                (cfg.schema,),
            )
            constraints = {str(r[0]) for r in cur.fetchall()}
            assert constraints == {
                "ck_recipe_ingredients_amount_value_positive",
                "ck_recipe_ingredients_unit",
                "ck_recipe_ingredients_weight_positive",
            }


def test_option2_g_unit_persists_amount_unit_and_weight(clean_test_tables: PostgresTestConfig, tmp_path: Path) -> None:
    cfg = clean_test_tables
    recipe_id = "R_OPT2_G_001"
    excel = _write_canonical_workbook(
        tmp_path / "opt2_g.xlsx",
        recipe_id=recipe_id,
        ingredient_rows=[
            {
                "Recipe_ID": recipe_id,
                "Ingredient_No": 1,
                "Food_ID": "F1001",
                "Ingredient_Name": "salt",
                "Amount_Value": 12,
                "Unit": "g",
                "Process_Code": "RAW",
            }
        ],
    )

    proc = run_pipeline_with_db(excel, tmp_path, cfg)
    payload = parse_json_stdout(proc)
    assert proc.returncode == 0
    assert payload["status"] == "passed"

    amount_value, unit, weight_g = _fetch_ingredient_amount_unit_weight(cfg, recipe_id, 1)
    assert amount_value == 12.0
    assert unit == "g"
    assert weight_g == 12.0


def test_option2_ml_unit_persists_amount_and_unit_but_keeps_weight_null(
    clean_test_tables: PostgresTestConfig,
    tmp_path: Path,
) -> None:
    cfg = clean_test_tables
    recipe_id = "R_OPT2_ML_001"
    excel = _write_canonical_workbook(
        tmp_path / "opt2_ml.xlsx",
        recipe_id=recipe_id,
        ingredient_rows=[
            {
                "Recipe_ID": recipe_id,
                "Ingredient_No": 1,
                "Food_ID": "F2001",
                "Ingredient_Name": "しょうゆ",
                "Amount_Value": 15,
                "Unit": "ml",
                "Process_Code": "RAW",
            }
        ],
    )

    proc = run_pipeline_with_db(excel, tmp_path, cfg)
    payload = parse_json_stdout(proc)
    assert proc.returncode == 0
    assert payload["status"] == "passed"

    amount_value, unit, weight_g = _fetch_ingredient_amount_unit_weight(cfg, recipe_id, 1)
    assert amount_value == 15.0
    assert unit == "ml"
    assert weight_g is None


def test_option2_validator_gate_blocks_invalid_before_db_write(
    clean_test_tables: PostgresTestConfig,
    tmp_path: Path,
) -> None:
    cfg = clean_test_tables
    before = fetch_table_counts(cfg)

    proc = run_pipeline_with_db(INVALID_DIR / "invalid_bad_unit.xlsx", tmp_path, cfg)
    payload = parse_json_stdout(proc)

    assert proc.returncode == 1
    assert payload["status"] == "failed"
    assert payload["db_import_executed"] is False
    assert payload["errors"]
    assert payload["errors"][0]["code"] == "P004_VALIDATION_FAILED"
    assert payload["errors"][0]["first_failure"] is not None
    assert payload["errors"][0]["all_errors"]

    after = fetch_table_counts(cfg)
    assert after == before


def test_option2_canonical_template_with_header_only_is_db_safe(
    clean_test_tables: PostgresTestConfig,
    tmp_path: Path,
) -> None:
    cfg = clean_test_tables
    proc = run_pipeline_with_db(TEMPLATE, tmp_path, cfg)
    payload = parse_json_stdout(proc)

    assert proc.returncode == 0
    assert payload["status"] == "passed"
    assert payload["db_import_executed"] is True

    db_report_path = payload["artifacts"]["db_import_report"]
    assert db_report_path
    db_report = json.loads(Path(db_report_path).read_text(encoding="utf-8"))
    assert db_report["insert_counts"]["recipes"] == 0
    assert db_report["insert_counts"]["recipe_ingredients"] == 0
    assert db_report["insert_counts"]["recipe_steps"] == 0


def test_option2_migration_backfills_legacy_like_rows(clean_test_tables: PostgresTestConfig) -> None:
    cfg = clean_test_tables

    with psycopg.connect(
        host=cfg.host,
        port=cfg.port,
        dbname=cfg.db_name,
        user=cfg.user,
        password=cfg.password,
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            # This test verifies Option2 backfill behavior for recipe_ingredients only.
            # Parent row is inserted as a valid current-schema record so the test does
            # not rely on legacy-nullability assumptions in recipes.
            cur.execute(
                sql.SQL(
                    """
                    INSERT INTO {}.recipes (
                        recipe_id, recipe_name,
                        category_lv1, category_lv2, category_lv3,
                        energy_kcal, protein_g, fat_g, carbohydrate_g,
                        p_ratio, f_ratio, c_ratio,
                        tags, cooking_method, notes,
                        source_file, source_batch, qa_status, version
                    ) VALUES (
                        'R_LEGACY_001', 'Legacy',
                        'main_dish', 'canonical_v1', 'legacy_stub',
                        0, 0, 0, 0,
                        0, 0, 0,
                        'dinner', NULL, NULL,
                        'legacy.xlsx', 'batch_legacy', 'passed', 'v1'
                    )
                    """
                ).format(sql.Identifier(cfg.schema))
            )
            cur.execute(
                sql.SQL(
                    """
                    INSERT INTO {}.recipe_ingredients (
                        recipe_id, line_no, ingredient_name, ingredient_alias,
                        food_id, process, weight_g, amount_value, unit,
                        notes, source_file, source_batch, qa_status, version
                    ) VALUES (
                        'R_LEGACY_001', 1, 'legacy_item', NULL,
                        'F9999', 'RAW', 80, NULL, NULL,
                        NULL, 'legacy.xlsx', 'batch_legacy', 'passed', 'v1'
                    )
                    """
                ).format(sql.Identifier(cfg.schema))
            )

            sql_text = MIGRATION_SQL.read_text(encoding="utf-8")
            cur.execute(sql.SQL("SET search_path TO {}, public").format(sql.Identifier(cfg.schema)))
            cur.execute(sql_text)

            cur.execute(
                sql.SQL(
                    """
                    SELECT amount_value, unit, weight_g
                    FROM {}.recipe_ingredients
                    WHERE recipe_id = 'R_LEGACY_001' AND line_no = 1
                    """
                ).format(sql.Identifier(cfg.schema))
            )
            row = cur.fetchone()
            assert row is not None
            assert float(row[0]) == 80.0
            assert str(row[1]) == "g"
            assert float(row[2]) == 80.0
