from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import psycopg
import pytest
from psycopg import sql

from tests.conftest import (
    PostgresTestConfig,
    fetch_child_rows,
    fetch_recipe_row,
    fetch_table_counts,
    parse_json_stdout,
    run_pipeline_cli,
)
from tests.fixtures.workbook_factory import write_canonical_workbook

PIPELINE_SCRIPT = "scripts/import_recipe_excel_pipeline.py"

pytestmark = pytest.mark.integration


def load_db_report_from_pipeline_report(pipeline_report: dict) -> dict:
    db_report_path = pipeline_report["artifacts"]["db_import_report"]
    assert db_report_path
    return json.loads(Path(db_report_path).read_text(encoding="utf-8"))


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


def rewrite_recipe(
    path: Path,
    *,
    recipe_id: str,
    recipe_name: str,
    ingredient_name: str,
    step_text: str,
    food_id: str | None = None,
    process: str | None = None,
) -> Path:
    sheets = pd.read_excel(path, sheet_name=["Recipes", "Ingredients", "Steps"], dtype=object, engine="openpyxl")
    sheets["Recipes"]["Recipe_ID"] = recipe_id
    sheets["Recipes"]["Recipe_Name"] = recipe_name
    sheets["Ingredients"]["Recipe_ID"] = recipe_id
    sheets["Ingredients"]["Ingredient_Name"] = ingredient_name
    if food_id is not None:
        sheets["Ingredients"]["Food_ID"] = food_id
    if process is not None:
        sheets["Ingredients"]["Process_Code"] = process
    sheets["Steps"]["Recipe_ID"] = recipe_id
    sheets["Steps"]["Instruction"] = step_text
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        sheets["Recipes"].to_excel(writer, sheet_name="Recipes", index=False)
        sheets["Ingredients"].to_excel(writer, sheet_name="Ingredients", index=False)
        sheets["Steps"].to_excel(writer, sheet_name="Steps", index=False)
    return path


def rewrite_recipe_with_children(
    path: Path,
    *,
    recipe_id: str,
    recipe_name: str,
    energy_kcal: float,
    protein_g: float,
    fat_g: float,
    carbohydrate_g: float,
    ingredients: list[str],
    steps: list[str],
    ingredient_food_ids: list[str] | None = None,
    ingredient_processes: list[str] | None = None,
) -> Path:
    sheets = pd.read_excel(path, sheet_name=["Recipes", "Ingredients", "Steps"], dtype=object, engine="openpyxl")

    sheets["Recipes"].loc[0, "Recipe_ID"] = recipe_id
    sheets["Recipes"].loc[0, "Recipe_Name"] = recipe_name

    ingredient_rows = []
    for index, ingredient_name in enumerate(ingredients, start=1):
        food_id = ingredient_food_ids[index - 1] if ingredient_food_ids is not None else f"F{1000 + index}"
        process = ingredient_processes[index - 1] if ingredient_processes is not None else "RAW"
        ingredient_rows.append(
            {
                "Recipe_ID": recipe_id,
                "Ingredient_No": index,
                "Food_ID": food_id,
                "Ingredient_Name": ingredient_name,
                "Amount_Value": 100,
                "Unit": "g",
                "Process_Code": process,
            }
        )
    sheets["Ingredients"] = pd.DataFrame(ingredient_rows)

    step_rows = []
    for index, step_text in enumerate(steps, start=1):
        step_rows.append(
            {
                "Recipe_ID": recipe_id,
                "Step_No": index,
                "Instruction": step_text,
            }
        )
    sheets["Steps"] = pd.DataFrame(step_rows)

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        sheets["Recipes"].to_excel(writer, sheet_name="Recipes", index=False)
        sheets["Ingredients"].to_excel(writer, sheet_name="Ingredients", index=False)
        sheets["Steps"].to_excel(writer, sheet_name="Steps", index=False)
    return path


def fetch_recipe_parent_payload(cfg: PostgresTestConfig, recipe_id: str) -> dict[str, str | float] | None:
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
                    SELECT recipe_name, energy_kcal, protein_g, fat_g, carbohydrate_g
                    FROM {}.recipes
                    WHERE recipe_id = %s
                    """
                ).format(sql.Identifier(cfg.schema)),
                (recipe_id,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            return {
                "recipe_name": str(row[0]),
                "energy_kcal": float(row[1]),
                "protein_g": float(row[2]),
                "fat_g": float(row[3]),
                "carbohydrate_g": float(row[4]),
            }


def fetch_ingredients_ordered(cfg: PostgresTestConfig, recipe_id: str) -> list[str]:
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
                    SELECT ingredient_name
                    FROM {}.recipe_ingredients
                    WHERE recipe_id = %s
                    ORDER BY line_no
                    """
                ).format(sql.Identifier(cfg.schema)),
                (recipe_id,),
            )
            return [str(row[0]) for row in cur.fetchall()]


def fetch_ingredient_food_process_ordered(cfg: PostgresTestConfig, recipe_id: str) -> list[dict[str, str | None]]:
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
                    SELECT ingredient_name, food_id, process
                    FROM {}.recipe_ingredients
                    WHERE recipe_id = %s
                    ORDER BY line_no
                    """
                ).format(sql.Identifier(cfg.schema)),
                (recipe_id,),
            )
            return [
                {
                    "ingredient_name": str(row[0]),
                    "food_id": None if row[1] is None else str(row[1]),
                    "process": None if row[2] is None else str(row[2]),
                }
                for row in cur.fetchall()
            ]


def fetch_steps_ordered(cfg: PostgresTestConfig, recipe_id: str) -> list[str]:
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
                    SELECT instruction
                    FROM {}.recipe_steps
                    WHERE recipe_id = %s
                    ORDER BY step_number
                    """
                ).format(sql.Identifier(cfg.schema)),
                (recipe_id,),
            )
            return [str(row[0]) for row in cur.fetchall()]


def install_replace_failure_trigger(
    cfg: PostgresTestConfig, *, recipe_id: str, failing_ingredient_name: str
) -> tuple[str, str]:
    trigger_fn_name = f"test_fail_replace_{recipe_id.lower()}"
    trigger_name = f"test_fail_replace_trigger_{recipe_id.lower()}"
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
                    CREATE OR REPLACE FUNCTION {}.{}() RETURNS trigger AS $$
                    BEGIN
                        IF NEW.recipe_id = {} AND NEW.ingredient_name = {} THEN
                            RAISE EXCEPTION 'replace failure trigger fired for recipe %', NEW.recipe_id;
                        END IF;
                        RETURN NEW;
                    END;
                    $$ LANGUAGE plpgsql;
                    """
                ).format(
                    sql.Identifier(cfg.schema),
                    sql.Identifier(trigger_fn_name),
                    sql.Literal(recipe_id),
                    sql.Literal(failing_ingredient_name),
                )
            )
            cur.execute(
                sql.SQL(
                    """
                    CREATE TRIGGER {}
                    BEFORE INSERT ON {}.recipe_ingredients
                    FOR EACH ROW
                    EXECUTE FUNCTION {}.{}();
                    """
                ).format(
                    sql.Identifier(trigger_name),
                    sql.Identifier(cfg.schema),
                    sql.Identifier(cfg.schema),
                    sql.Identifier(trigger_fn_name),
                )
            )
    return trigger_name, trigger_fn_name


def uninstall_replace_failure_trigger(cfg: PostgresTestConfig, trigger_name: str, trigger_fn_name: str) -> None:
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
                sql.SQL("DROP TRIGGER IF EXISTS {} ON {}.recipe_ingredients").format(
                    sql.Identifier(trigger_name),
                    sql.Identifier(cfg.schema),
                )
            )
            cur.execute(
                sql.SQL("DROP FUNCTION IF EXISTS {}.{}()").format(
                    sql.Identifier(cfg.schema),
                    sql.Identifier(trigger_fn_name),
                )
            )


def test_postgres_normal_import_only_after_validation_passes(
    tmp_path: Path, clean_test_tables: PostgresTestConfig
) -> None:
    cfg = clean_test_tables
    workbook = write_canonical_workbook(tmp_path / "valid.xlsx")
    before = fetch_table_counts(cfg)

    proc = run_pipeline_with_db(workbook, tmp_path / "out_ok", cfg)
    report = parse_json_stdout(proc)
    after = fetch_table_counts(cfg)
    recipe = fetch_recipe_row(cfg, "MAIN_TEST_0001")

    assert proc.returncode == 0
    assert report["status"] == "passed"
    assert report["gate_result"] == "PASS"
    assert report["db_import_executed"] is True
    assert after["recipes"] == before["recipes"] + 1
    assert after["recipe_ingredients"] == before["recipe_ingredients"] + 1
    assert after["recipe_steps"] == before["recipe_steps"] + 1
    assert recipe is not None
    assert recipe["recipe_name"] == "テストレシピ"


def test_postgres_persists_food_id_and_process_into_recipe_ingredients(
    tmp_path: Path, clean_test_tables: PostgresTestConfig
) -> None:
    cfg = clean_test_tables
    recipe_id = "MAIN_TEST_FOOD_PROCESS_0001"
    workbook = rewrite_recipe(
        write_canonical_workbook(
            tmp_path / "food_process.xlsx",
            food_id="F9900",
            process="RAW",
        ),
        recipe_id=recipe_id,
        recipe_name="Food Process テスト",
        ingredient_name="にんじん",
        step_text="切る",
        food_id="F9900",
        process="RAW",
    )

    proc = run_pipeline_with_db(workbook, tmp_path / "out_food_process", cfg)
    ingredients = fetch_ingredient_food_process_ordered(cfg, recipe_id)

    assert proc.returncode == 0
    assert ingredients == [
        {
            "ingredient_name": "にんじん",
            "food_id": "F9900",
            "process": "RAW",
        }
    ]


def test_postgres_blocks_db_import_when_validation_fails(
    tmp_path: Path, clean_test_tables: PostgresTestConfig
) -> None:
    cfg = clean_test_tables
    invalid = write_canonical_workbook(tmp_path / "invalid.xlsx", ingredient_name=None)
    before = fetch_table_counts(cfg)

    proc = run_pipeline_with_db(invalid, tmp_path / "out_fail", cfg)
    report = parse_json_stdout(proc)
    after = fetch_table_counts(cfg)

    assert proc.returncode == 1
    assert report["status"] == "failed"
    assert report["db_import_executed"] is False
    assert any(err["code"] == "P004_VALIDATION_FAILED" for err in report["errors"])
    assert after == before


def test_postgres_blocks_db_import_on_fail_on_warning(
    tmp_path: Path, clean_test_tables: PostgresTestConfig
) -> None:
    cfg = clean_test_tables
    warning_file = write_canonical_workbook(tmp_path / "warning.xlsx", food_id=None)
    before = fetch_table_counts(cfg)

    proc = run_pipeline_with_db(warning_file, tmp_path / "out_warning", cfg, "--fail-on-warning")
    report = parse_json_stdout(proc)
    after = fetch_table_counts(cfg)

    assert proc.returncode == 1
    assert report["status"] == "failed"
    assert report["db_import_executed"] is False
    assert any(err["code"] == "P004_VALIDATION_FAILED" for err in report["errors"])
    assert after == before


def test_postgres_dry_run_keeps_db_state_unchanged(
    tmp_path: Path, clean_test_tables: PostgresTestConfig
) -> None:
    cfg = clean_test_tables
    workbook = write_canonical_workbook(tmp_path / "dry_run.xlsx")
    before = fetch_table_counts(cfg)

    proc = run_pipeline_with_db(workbook, tmp_path / "out_dry", cfg, "--dry-run")
    report = parse_json_stdout(proc)
    db_report = load_db_report_from_pipeline_report(report)
    after = fetch_table_counts(cfg)

    assert proc.returncode == 0
    assert report["db_import_executed"] is True
    assert db_report["status"] == "DRY_RUN_SUCCESS"
    assert db_report["dry_run_rolled_back"] is True
    assert after == before


def test_postgres_reimport_same_file_is_idempotent(
    tmp_path: Path, clean_test_tables: PostgresTestConfig
) -> None:
    cfg = clean_test_tables
    workbook = write_canonical_workbook(tmp_path / "idempotent.xlsx")

    first_proc = run_pipeline_with_db(workbook, tmp_path / "out_first", cfg)
    first_report = parse_json_stdout(first_proc)
    first_db_report = load_db_report_from_pipeline_report(first_report)
    mid_counts = fetch_table_counts(cfg)

    second_proc = run_pipeline_with_db(workbook, tmp_path / "out_second", cfg)
    second_report = parse_json_stdout(second_proc)
    second_db_report = load_db_report_from_pipeline_report(second_report)
    after_counts = fetch_table_counts(cfg)

    assert first_proc.returncode == 0
    assert second_proc.returncode == 0
    assert first_db_report["insert_counts"] == {"recipes": 1, "recipe_ingredients": 1, "recipe_steps": 1}
    assert second_db_report["insert_counts"] == {"recipes": 0, "recipe_ingredients": 0, "recipe_steps": 0}
    assert after_counts == mid_counts


def test_postgres_parent_existing_mode_skip_keeps_existing_parent_and_children(
    tmp_path: Path, clean_test_tables: PostgresTestConfig
) -> None:
    cfg = clean_test_tables
    recipe_id = "MAIN_TEST_SKIP_0001"
    first = rewrite_recipe(
        write_canonical_workbook(tmp_path / "skip_first.xlsx"),
        recipe_id=recipe_id,
        recipe_name="親レシピ 初回",
        ingredient_name="最初の食材",
        step_text="最初の手順",
        food_id="F1001",
        process="RAW",
    )
    second = rewrite_recipe(
        write_canonical_workbook(tmp_path / "skip_second.xlsx"),
        recipe_id=recipe_id,
        recipe_name="親レシピ 更新版",
        ingredient_name="更新後食材",
        step_text="更新後手順",
        food_id="F2002",
        process="BOIL",
    )

    run1 = run_pipeline_with_db(first, tmp_path / "out_skip_1", cfg, "--parent-existing-mode", "skip")
    run2 = run_pipeline_with_db(second, tmp_path / "out_skip_2", cfg, "--parent-existing-mode", "skip")
    report2 = parse_json_stdout(run2)
    db_report2 = load_db_report_from_pipeline_report(report2)
    recipe = fetch_recipe_row(cfg, recipe_id)
    child = fetch_child_rows(cfg, recipe_id)
    ingredient_details = fetch_ingredient_food_process_ordered(cfg, recipe_id)

    assert run1.returncode == 0
    assert run2.returncode == 0
    assert db_report2["insert_counts"]["recipes"] == 0
    assert recipe is not None
    assert recipe["recipe_name"] == "親レシピ 初回"
    assert child["ingredient_name_line1"] == "最初の食材"
    assert child["step_instruction_1"] == "最初の手順"
    assert ingredient_details[0]["food_id"] == "F1001"
    assert ingredient_details[0]["process"] == "RAW"


# Compatibility-only test:
# update is outside the formal contract and intentionally kept only for legacy behavior verification.
def test_postgres_parent_existing_mode_update_legacy_compatibility_updates_parent_but_not_children(
    tmp_path: Path, clean_test_tables: PostgresTestConfig
) -> None:
    cfg = clean_test_tables
    recipe_id = "MAIN_TEST_UPDATE_0001"
    first = rewrite_recipe(
        write_canonical_workbook(tmp_path / "update_first.xlsx"),
        recipe_id=recipe_id,
        recipe_name="親レシピ 初回",
        ingredient_name="最初の食材",
        step_text="最初の手順",
    )
    second = rewrite_recipe(
        write_canonical_workbook(tmp_path / "update_second.xlsx"),
        recipe_id=recipe_id,
        recipe_name="親レシピ 更新版",
        ingredient_name="更新後食材",
        step_text="更新後手順",
    )

    run1 = run_pipeline_with_db(first, tmp_path / "out_update_1", cfg, "--parent-existing-mode", "update")
    run2 = run_pipeline_with_db(second, tmp_path / "out_update_2", cfg, "--parent-existing-mode", "update")
    report2 = parse_json_stdout(run2)
    db_report2 = load_db_report_from_pipeline_report(report2)
    recipe = fetch_recipe_row(cfg, recipe_id)
    child = fetch_child_rows(cfg, recipe_id)

    assert run1.returncode == 0
    assert run2.returncode == 0
    assert db_report2["insert_counts"]["recipes"] == 1
    assert recipe is not None
    assert recipe["recipe_name"] == "親レシピ 更新版"
    assert child["ingredient_name_line1"] == "最初の食材"
    assert child["step_instruction_1"] == "最初の手順"


def test_postgres_db_failure_does_not_leave_partial_state(
    tmp_path: Path, clean_test_tables: PostgresTestConfig
) -> None:
    cfg = clean_test_tables
    workbook = write_canonical_workbook(tmp_path / "db_failure.xlsx")
    before = fetch_table_counts(cfg)

    proc = run_pipeline_with_db(workbook, tmp_path / "out_db_fail", cfg, "--db-schema", "missing_schema")
    report = parse_json_stdout(proc)
    after = fetch_table_counts(cfg)

    assert proc.returncode == 1
    assert report["db_import_executed"] is True
    assert any(err["code"] == "P006_DB_IMPORT_FAILED" for err in report["errors"])
    assert after == before


def test_postgres_replace_replaces_parent_and_children_atomically(
    tmp_path: Path, clean_test_tables: PostgresTestConfig
) -> None:
    cfg = clean_test_tables
    recipe_id = "MAIN_TEST_REPLACE_0001"

    old_parent = {
        "recipe_name": "親レシピ OLD",
        "energy_kcal": 0,
        "protein_g": 0,
        "fat_g": 0,
        "carbohydrate_g": 0,
    }
    new_parent = {
        "recipe_name": "親レシピ NEW",
        "energy_kcal": 0,
        "protein_g": 0,
        "fat_g": 0,
        "carbohydrate_g": 0,
    }
    old_ingredients = ["旧食材A", "旧食材B"]
    new_ingredients = ["新食材A", "新食材B", "新食材C"]
    old_food_ids = ["F1111", "F1112"]
    new_food_ids = ["F2221", "F2222", "F2223"]
    old_processes = ["RAW", "SAUTE"]
    new_processes = ["RAW", "BOIL", "GRILL"]
    old_steps = ["旧手順1", "旧手順2"]
    new_steps = ["新手順1", "新手順2", "新手順3"]

    first = rewrite_recipe_with_children(
        write_canonical_workbook(tmp_path / "replace_first.xlsx"),
        recipe_id=recipe_id,
        recipe_name=old_parent["recipe_name"],
        energy_kcal=old_parent["energy_kcal"],
        protein_g=old_parent["protein_g"],
        fat_g=old_parent["fat_g"],
        carbohydrate_g=old_parent["carbohydrate_g"],
        ingredients=old_ingredients,
        steps=old_steps,
        ingredient_food_ids=old_food_ids,
        ingredient_processes=old_processes,
    )
    second = rewrite_recipe_with_children(
        write_canonical_workbook(tmp_path / "replace_second.xlsx"),
        recipe_id=recipe_id,
        recipe_name=new_parent["recipe_name"],
        energy_kcal=new_parent["energy_kcal"],
        protein_g=new_parent["protein_g"],
        fat_g=new_parent["fat_g"],
        carbohydrate_g=new_parent["carbohydrate_g"],
        ingredients=new_ingredients,
        steps=new_steps,
        ingredient_food_ids=new_food_ids,
        ingredient_processes=new_processes,
    )

    run1 = run_pipeline_with_db(first, tmp_path / "out_replace_1", cfg, "--parent-existing-mode", "replace")
    run2 = run_pipeline_with_db(second, tmp_path / "out_replace_2", cfg, "--parent-existing-mode", "replace")
    report2 = parse_json_stdout(run2)
    db_report2 = load_db_report_from_pipeline_report(report2)

    parent = fetch_recipe_parent_payload(cfg, recipe_id)
    actual_ingredients = fetch_ingredients_ordered(cfg, recipe_id)
    actual_ingredient_details = fetch_ingredient_food_process_ordered(cfg, recipe_id)
    actual_steps = fetch_steps_ordered(cfg, recipe_id)

    assert run1.returncode == 0
    assert run2.returncode == 0
    assert db_report2["status"] == "SUCCESS"
    assert parent == new_parent
    assert actual_ingredients == new_ingredients
    assert actual_ingredient_details == [
        {"ingredient_name": "新食材A", "food_id": "F2221", "process": "RAW"},
        {"ingredient_name": "新食材B", "food_id": "F2222", "process": "BOIL"},
        {"ingredient_name": "新食材C", "food_id": "F2223", "process": "GRILL"},
    ]
    assert actual_steps == new_steps
    assert not (set(old_ingredients) & set(actual_ingredients))
    assert not (set(old_steps) & set(actual_steps))


def test_postgres_replace_failure_rolls_back_recipe_unit(
    tmp_path: Path, clean_test_tables: PostgresTestConfig
) -> None:
    cfg = clean_test_tables
    recipe_id = "MAIN_TEST_REPLACE_ROLLBACK_0001"

    old_parent = {
        "recipe_name": "親レシピ OLD",
        "energy_kcal": 0,
        "protein_g": 0,
        "fat_g": 0,
        "carbohydrate_g": 0,
    }
    new_parent = {
        "recipe_name": "親レシピ NEW",
        "energy_kcal": 0,
        "protein_g": 0,
        "fat_g": 0,
        "carbohydrate_g": 0,
    }
    old_ingredients = ["旧食材A", "旧食材B"]
    old_steps = ["旧手順1", "旧手順2"]
    failing_ingredient = "FAIL_TRIGGER_INGREDIENT"
    new_ingredients = ["新食材A", failing_ingredient]
    new_steps = ["新手順1", "新手順2", "新手順3"]

    first = rewrite_recipe_with_children(
        write_canonical_workbook(tmp_path / "replace_rollback_first.xlsx"),
        recipe_id=recipe_id,
        recipe_name=old_parent["recipe_name"],
        energy_kcal=old_parent["energy_kcal"],
        protein_g=old_parent["protein_g"],
        fat_g=old_parent["fat_g"],
        carbohydrate_g=old_parent["carbohydrate_g"],
        ingredients=old_ingredients,
        steps=old_steps,
    )
    second = rewrite_recipe_with_children(
        write_canonical_workbook(tmp_path / "replace_rollback_second.xlsx"),
        recipe_id=recipe_id,
        recipe_name=new_parent["recipe_name"],
        energy_kcal=new_parent["energy_kcal"],
        protein_g=new_parent["protein_g"],
        fat_g=new_parent["fat_g"],
        carbohydrate_g=new_parent["carbohydrate_g"],
        ingredients=new_ingredients,
        steps=new_steps,
    )

    run1 = run_pipeline_with_db(first, tmp_path / "out_replace_rollback_1", cfg, "--parent-existing-mode", "replace")
    trigger_name, trigger_fn_name = install_replace_failure_trigger(
        cfg,
        recipe_id=recipe_id,
        failing_ingredient_name=failing_ingredient,
    )
    try:
        run2 = run_pipeline_with_db(second, tmp_path / "out_replace_rollback_2", cfg, "--parent-existing-mode", "replace")
    finally:
        uninstall_replace_failure_trigger(cfg, trigger_name, trigger_fn_name)

    report2 = parse_json_stdout(run2)
    db_report2 = load_db_report_from_pipeline_report(report2)

    parent_after_failure = fetch_recipe_parent_payload(cfg, recipe_id)
    ingredients_after_failure = fetch_ingredients_ordered(cfg, recipe_id)
    steps_after_failure = fetch_steps_ordered(cfg, recipe_id)

    assert run1.returncode == 0
    assert run2.returncode == 1
    assert db_report2["status"] == "FAILED"
    assert parent_after_failure == old_parent
    assert ingredients_after_failure == old_ingredients
    assert steps_after_failure == old_steps
    assert failing_ingredient not in ingredients_after_failure
    assert not (set(new_steps) & set(steps_after_failure))
