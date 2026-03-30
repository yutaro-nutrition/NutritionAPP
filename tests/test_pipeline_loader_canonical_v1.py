"""Responsibility label: pipeline_loader_mixed_gate.

This module intentionally mixes:
- non-DB pipeline gate checks (pass/fail on canonical/invalid samples)
- loader-near canonical mapping checks (amount/unit/weight behavior)
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pandas as pd

import load_excel_to_postgres as loader


ROOT = Path(__file__).resolve().parents[1]
PIPELINE_ENTRY = ROOT / "import_recipe_excel_pipeline.py"
TEMPLATE = ROOT / "templates" / "recipe_excel_canonical_template_v1.xlsx"
INVALID_DIR = ROOT / "templates" / "invalid_samples"


def run_pipeline(*args: str) -> tuple[int, dict]:
    proc = subprocess.run(
        [sys.executable, str(PIPELINE_ENTRY), *args, "--json"],
        capture_output=True,
        text=True,
        check=False,
        cwd=str(ROOT),
    )
    payload = json.loads(proc.stdout)
    return proc.returncode, payload


def test_pipeline_accepts_canonical_template_as_valid_structure(tmp_path: Path) -> None:
    rc, payload = run_pipeline(str(TEMPLATE), "--output-dir", str(tmp_path))
    assert rc == 0
    assert payload["status"] == "passed"
    assert payload["summary"]["validation_status"] == "passed"


def test_pipeline_stops_on_invalid_sheet_name_and_keeps_first_failure(tmp_path: Path) -> None:
    rc, payload = run_pipeline(str(INVALID_DIR / "invalid_sheet_name.xlsx"), "--output-dir", str(tmp_path))
    assert rc == 1
    assert payload["status"] == "failed"
    assert payload["errors"][0]["code"] == "P004_VALIDATION_FAILED"
    assert payload["errors"][0]["first_failure"]["error_class"] == "STRUCTURE_ERROR"
    assert payload["errors"][0]["all_errors"]


def test_pipeline_stops_on_required_invalid_samples(tmp_path: Path) -> None:
    targets = [
        "invalid_missing_recipe_column.xlsx",
        "invalid_bad_unit.xlsx",
        "invalid_duplicate_ingredient_no.xlsx",
        "invalid_step_no_duplicate.xlsx",
    ]
    for name in targets:
        rc, payload = run_pipeline(str(INVALID_DIR / name), "--output-dir", str(tmp_path))
        assert rc == 1, name
        assert payload["errors"][0]["code"] == "P004_VALIDATION_FAILED", name


def test_pipeline_does_not_call_db_loader_when_phase1_fails(tmp_path: Path) -> None:
    marker = tmp_path / "db_loader_called.txt"
    fake_loader = tmp_path / "fake_loader.py"
    fake_loader.write_text(
        "from pathlib import Path\n"
        f"Path(r\"{marker}\").write_text('called', encoding='utf-8')\n"
        "print('fake loader called')\n",
        encoding="utf-8",
    )

    rc, payload = run_pipeline(
        str(INVALID_DIR / "invalid_sheet_name.xlsx"),
        "--output-dir",
        str(tmp_path),
        "--import-db",
        "--db-loader-script",
        str(fake_loader),
    )
    assert rc == 1
    assert payload["db_import_executed"] is False
    assert not marker.exists()


def test_loader_reads_canonical_sheets_and_maps_amount_value_unit(tmp_path: Path) -> None:
    excel = tmp_path / "canonical_for_loader.xlsx"

    recipes = pd.DataFrame(
        [
            {
                "Recipe_ID": "R001",
                "Recipe_Name": "Loader Test",
                "Category_Code": "rice",
                "Servings": 2,
                "Tags": "dinner|quick",
            }
        ]
    )
    ingredients = pd.DataFrame(
        [
            {
                "Recipe_ID": "R001",
                "Ingredient_No": 1,
                "Food_ID": "F1001",
                "Ingredient_Name": "water",
                "Amount_Value": 120,
                "Unit": "ml",
                "Process_Code": "RAW",
            }
        ]
    )
    steps = pd.DataFrame([{"Recipe_ID": "R001", "Step_No": 1, "Instruction": "Mix."}])

    with pd.ExcelWriter(excel, engine="openpyxl") as writer:
        recipes.to_excel(writer, sheet_name="Recipes", index=False)
        ingredients.to_excel(writer, sheet_name="Ingredients", index=False)
        steps.to_excel(writer, sheet_name="Steps", index=False)

    sheets = loader.load_excel(excel)
    recipe_records, _ = loader.prepare_recipes(sheets["Recipes"], source_file=excel.name, source_batch="batch_test")
    ingredient_records, _ = loader.prepare_ingredients(
        sheets["Ingredients"], source_file=excel.name, source_batch="batch_test"
    )
    step_records, _ = loader.prepare_steps(sheets["Steps"], source_file=excel.name, source_batch="batch_test")

    assert len(recipe_records) == 1
    assert len(ingredient_records) == 1
    assert len(step_records) == 1
    assert ingredient_records[0][1] == 1  # line_no from Ingredient_No
    assert ingredient_records[0][6] is None  # weight_g is not derived for ml without density evidence
    assert ingredient_records[0][7] == 120.0  # amount_value is retained
    assert ingredient_records[0][8] == "ml"  # unit is retained
    assert step_records[0][1] == 1


def test_loader_sets_weight_g_only_for_unit_g(tmp_path: Path) -> None:
    excel = tmp_path / "canonical_g_for_loader.xlsx"
    recipes = pd.DataFrame(
        [
            {
                "Recipe_ID": "R010",
                "Recipe_Name": "Loader G Test",
                "Category_Code": "main_dish",
                "Servings": 1,
                "Tags": "dinner",
            }
        ]
    )
    ingredients = pd.DataFrame(
        [
            {
                "Recipe_ID": "R010",
                "Ingredient_No": 1,
                "Food_ID": "F2001",
                "Ingredient_Name": "salt",
                "Amount_Value": 15,
                "Unit": "g",
                "Process_Code": "RAW",
            }
        ]
    )
    steps = pd.DataFrame([{"Recipe_ID": "R010", "Step_No": 1, "Instruction": "Mix."}])

    with pd.ExcelWriter(excel, engine="openpyxl") as writer:
        recipes.to_excel(writer, sheet_name="Recipes", index=False)
        ingredients.to_excel(writer, sheet_name="Ingredients", index=False)
        steps.to_excel(writer, sheet_name="Steps", index=False)

    sheets = loader.load_excel(excel)
    ingredient_records, _ = loader.prepare_ingredients(
        sheets["Ingredients"], source_file=excel.name, source_batch="batch_test"
    )
    assert len(ingredient_records) == 1
    assert ingredient_records[0][6] == 15.0  # weight_g derived for unit=g
    assert ingredient_records[0][7] == 15.0
    assert ingredient_records[0][8] == "g"


def test_loader_does_not_do_1to1_ml_to_g_for_shoyu(tmp_path: Path) -> None:
    excel = tmp_path / "canonical_shoyu_ml.xlsx"
    recipes = pd.DataFrame(
        [
            {
                "Recipe_ID": "R020",
                "Recipe_Name": "Shoyu Test",
                "Category_Code": "side_dish",
                "Servings": 1,
                "Tags": "dinner",
            }
        ]
    )
    ingredients = pd.DataFrame(
        [
            {
                "Recipe_ID": "R020",
                "Ingredient_No": 1,
                "Food_ID": "F3001",
                "Ingredient_Name": "しょうゆ",
                "Amount_Value": 15,
                "Unit": "ml",
                "Process_Code": "RAW",
            }
        ]
    )
    steps = pd.DataFrame([{"Recipe_ID": "R020", "Step_No": 1, "Instruction": "Season."}])

    with pd.ExcelWriter(excel, engine="openpyxl") as writer:
        recipes.to_excel(writer, sheet_name="Recipes", index=False)
        ingredients.to_excel(writer, sheet_name="Ingredients", index=False)
        steps.to_excel(writer, sheet_name="Steps", index=False)

    sheets = loader.load_excel(excel)
    ingredient_records, _ = loader.prepare_ingredients(
        sheets["Ingredients"], source_file=excel.name, source_batch="batch_test"
    )
    assert len(ingredient_records) == 1
    # No density evidence: do not derive g from ml.
    assert ingredient_records[0][6] is None
    assert ingredient_records[0][7] == 15.0
    assert ingredient_records[0][8] == "ml"
