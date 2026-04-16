"""Responsibility label: pipeline_db_import_acceptance_fake_db.

Acceptance for `--import-db` orchestration using a fake DB loader (no real PostgreSQL).
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pandas as pd

from tests.fixtures.workbook_factory import write_canonical_workbook

ROOT_DIR = Path(__file__).resolve().parents[1]
PIPELINE_SCRIPT = "scripts/import_recipe_excel_pipeline.py"


def run_cli(script_name: str, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(ROOT_DIR / script_name), *args],
        capture_output=True,
        text=True,
        cwd=ROOT_DIR,
        check=False,
    )


def parse_json_stdout(proc: subprocess.CompletedProcess[str]) -> dict:
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError(f"stdout is not valid JSON:\n{proc.stdout}\nstderr:\n{proc.stderr}") from exc


def write_fake_db_loader(path: Path) -> Path:
    script = r'''#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--excel", required=True)
    p.add_argument("--host")
    p.add_argument("--port")
    p.add_argument("--db-name", required=True)
    p.add_argument("--user")
    p.add_argument("--schema")
    p.add_argument("--parent-existing-mode")
    p.add_argument("--report", required=True)
    p.add_argument("--password")
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()


def norm(v: object) -> str | None:
    if v is None:
        return None
    if isinstance(v, float) and pd.isna(v):
        return None
    s = str(v).strip()
    return s or None


def to_int(v: object) -> int | None:
    s = norm(v)
    if s is None:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def to_float(v: object) -> float | None:
    s = norm(v)
    if s is None:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def read_keys(excel_path: Path) -> tuple[set[str], set[str], set[str]]:
    sheets = pd.read_excel(
        excel_path,
        sheet_name=["Recipes", "Ingredients", "Steps"],
        dtype=object,
        engine="openpyxl",
    )
    recipes_df = sheets["Recipes"].copy()
    ingredients_df = sheets["Ingredients"].copy()
    steps_df = sheets["Steps"].copy()

    recipes: set[str] = set()
    for _, row in recipes_df.iterrows():
        rid = norm(row.get("Recipe_ID"))
        name = norm(row.get("Recipe_Name"))
        if rid and name:
            recipes.add(rid)

    ingredients: set[str] = set()
    for _, row in ingredients_df.iterrows():
        rid = norm(row.get("Recipe_ID"))
        ingredient_no = to_int(row.get("Ingredient_No"))
        name = norm(row.get("Ingredient_Name"))
        amount_value = to_float(row.get("Amount_Value"))
        if rid and ingredient_no is not None and name and amount_value is not None and amount_value > 0:
            ingredients.add(f"{rid}::{ingredient_no}")

    steps: set[str] = set()
    for _, row in steps_df.iterrows():
        rid = norm(row.get("Recipe_ID"))
        step_no = to_int(row.get("Step_No"))
        instruction = norm(row.get("Instruction"))
        if rid and step_no is not None and instruction:
            steps.add(f"{rid}::{step_no}")

    return recipes, ingredients, steps


def main() -> int:
    args = parse_args()
    state_path = Path(args.db_name)
    if state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
    else:
        state = {"recipes": [], "recipe_ingredients": [], "recipe_steps": []}

    before = {
        "recipes": len(state["recipes"]),
        "recipe_ingredients": len(state["recipe_ingredients"]),
        "recipe_steps": len(state["recipe_steps"]),
    }

    src_recipes, src_ingredients, src_steps = read_keys(Path(args.excel))
    cur_recipes = set(state["recipes"])
    cur_ingredients = set(state["recipe_ingredients"])
    cur_steps = set(state["recipe_steps"])

    ins_recipes = len(src_recipes - cur_recipes)
    ins_ingredients = len(src_ingredients - cur_ingredients)
    ins_steps = len(src_steps - cur_steps)

    if not args.dry_run:
        cur_recipes |= src_recipes
        cur_ingredients |= src_ingredients
        cur_steps |= src_steps
        state_path.write_text(
            json.dumps(
                {
                    "recipes": sorted(cur_recipes),
                    "recipe_ingredients": sorted(cur_ingredients),
                    "recipe_steps": sorted(cur_steps),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    after = {
        "recipes": len(cur_recipes),
        "recipe_ingredients": len(cur_ingredients),
        "recipe_steps": len(cur_steps),
    }
    delta = {
        "recipes": after["recipes"] - before["recipes"],
        "recipe_ingredients": after["recipe_ingredients"] - before["recipe_ingredients"],
        "recipe_steps": after["recipe_steps"] - before["recipe_steps"],
    }

    report = {
        "status": "DRY_RUN_SUCCESS" if args.dry_run else "SUCCESS",
        "before_counts": before,
        "after_counts_in_tx": after,
        "delta_in_tx": delta,
        "insert_counts": {
            "recipes": ins_recipes,
            "recipe_ingredients": ins_ingredients,
            "recipe_steps": ins_steps,
        },
        "dry_run_rolled_back": bool(args.dry_run),
    }
    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
'''
    path.write_text(script, encoding="utf-8")
    return path


def rewrite_recipe_id(path: Path, recipe_id: str) -> Path:
    sheets = pd.read_excel(path, sheet_name=["Recipes", "Ingredients", "Steps"], dtype=object, engine="openpyxl")
    sheets["Recipes"]["Recipe_ID"] = recipe_id
    sheets["Ingredients"]["Recipe_ID"] = recipe_id
    sheets["Steps"]["Recipe_ID"] = recipe_id
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        sheets["Recipes"].to_excel(writer, sheet_name="Recipes", index=False)
        sheets["Ingredients"].to_excel(writer, sheet_name="Ingredients", index=False)
        sheets["Steps"].to_excel(writer, sheet_name="Steps", index=False)
    return path


def load_db_report_from_pipeline_report(pipeline_report: dict) -> dict:
    db_report_path = pipeline_report["artifacts"]["db_import_report"]
    assert db_report_path
    return json.loads(Path(db_report_path).read_text(encoding="utf-8"))


def load_loader_workbook_from_pipeline_report(pipeline_report: dict) -> dict[str, pd.DataFrame]:
    loader_workbook = pipeline_report["artifacts"]["loader_compat_excel"]
    assert loader_workbook
    return pd.read_excel(loader_workbook, sheet_name=["Recipes", "Ingredients", "Steps"], dtype=object, engine="openpyxl")


def test_pipeline_imports_to_db_only_when_validation_passes(tmp_path: Path) -> None:
    canonical = write_canonical_workbook(tmp_path / "canonical_ok.xlsx")
    fake_loader = write_fake_db_loader(tmp_path / "fake_db_loader.py")
    state_file = tmp_path / "fake_db_state.json"

    pipeline = run_cli(
        PIPELINE_SCRIPT,
        str(canonical),
        "--json",
        "--import-db",
        "--db-loader-script",
        str(fake_loader),
        "--db-name",
        str(state_file),
        "--output-dir",
        str(tmp_path / "pipeline_out"),
    )
    report = parse_json_stdout(pipeline)

    assert pipeline.returncode == 0
    assert report["status"] == "passed"
    assert report["gate_result"] == "PASS"
    assert report["db_import_requested"] is True
    assert report["db_import_executed"] is True
    assert state_file.exists()

    db_report = load_db_report_from_pipeline_report(report)
    assert db_report["status"] == "SUCCESS"
    assert db_report["insert_counts"]["recipes"] == 1
    assert db_report["insert_counts"]["recipe_ingredients"] == 1
    assert db_report["insert_counts"]["recipe_steps"] == 1


def test_pipeline_loader_workbook_keeps_food_id_and_process(tmp_path: Path) -> None:
    canonical = write_canonical_workbook(
        tmp_path / "canonical_food_process.xlsx",
        food_id="F9001",
        process="BOIL",
    )
    fake_loader = write_fake_db_loader(tmp_path / "fake_db_loader.py")
    state_file = tmp_path / "fake_db_state.json"

    pipeline = run_cli(
        PIPELINE_SCRIPT,
        str(canonical),
        "--json",
        "--import-db",
        "--db-loader-script",
        str(fake_loader),
        "--db-name",
        str(state_file),
        "--output-dir",
        str(tmp_path / "pipeline_out"),
    )
    report = parse_json_stdout(pipeline)
    sheets = load_loader_workbook_from_pipeline_report(report)
    ingredients = sheets["Ingredients"]

    assert pipeline.returncode == 0
    assert report["status"] == "passed"
    assert "Food_ID" in ingredients.columns
    assert "Process_Code" in ingredients.columns
    assert str(ingredients.loc[0, "Food_ID"]) == "F9001"
    assert str(ingredients.loc[0, "Process_Code"]) == "BOIL"


def test_pipeline_blocks_db_import_on_validation_fail(tmp_path: Path) -> None:
    invalid = write_canonical_workbook(tmp_path / "canonical_invalid.xlsx", ingredient_name=None)
    fake_loader = write_fake_db_loader(tmp_path / "fake_db_loader.py")
    state_file = tmp_path / "fake_db_state.json"

    pipeline = run_cli(
        PIPELINE_SCRIPT,
        str(invalid),
        "--json",
        "--import-db",
        "--db-loader-script",
        str(fake_loader),
        "--db-name",
        str(state_file),
        "--output-dir",
        str(tmp_path / "pipeline_out"),
    )
    report = parse_json_stdout(pipeline)

    assert pipeline.returncode == 1
    assert report["status"] == "failed"
    assert report["gate_result"] == "FAIL"
    assert any(err["code"] == "P004_VALIDATION_FAILED" for err in report["errors"])
    assert report["db_import_requested"] is True
    assert report["db_import_executed"] is False
    assert report["artifacts"]["db_import_report"] is None
    assert not state_file.exists()


def test_pipeline_blocks_db_import_with_fail_on_warning(tmp_path: Path) -> None:
    warning_file = write_canonical_workbook(tmp_path / "canonical_warn.xlsx", food_id=None)
    fake_loader = write_fake_db_loader(tmp_path / "fake_db_loader.py")
    state_file = tmp_path / "fake_db_state.json"

    pipeline = run_cli(
        PIPELINE_SCRIPT,
        str(warning_file),
        "--json",
        "--import-db",
        "--fail-on-warning",
        "--db-loader-script",
        str(fake_loader),
        "--db-name",
        str(state_file),
        "--output-dir",
        str(tmp_path / "pipeline_out"),
    )
    report = parse_json_stdout(pipeline)

    assert pipeline.returncode == 1
    assert report["status"] == "failed"
    assert report["gate_result"] == "FAIL"
    assert any(err["code"] == "P004_VALIDATION_FAILED" for err in report["errors"])
    assert report["db_import_requested"] is True
    assert report["db_import_executed"] is False
    assert report["artifacts"]["db_import_report"] is None
    assert not state_file.exists()


def test_pipeline_dry_run_does_not_change_db_state(tmp_path: Path) -> None:
    first = write_canonical_workbook(tmp_path / "first.xlsx")
    second = rewrite_recipe_id(write_canonical_workbook(tmp_path / "second.xlsx"), "MAIN_TEST_0002")
    fake_loader = write_fake_db_loader(tmp_path / "fake_db_loader.py")
    state_file = tmp_path / "fake_db_state.json"

    first_run = run_cli(
        PIPELINE_SCRIPT,
        str(first),
        "--json",
        "--import-db",
        "--db-loader-script",
        str(fake_loader),
        "--db-name",
        str(state_file),
        "--output-dir",
        str(tmp_path / "out_first"),
    )
    first_report = parse_json_stdout(first_run)
    assert first_run.returncode == 0
    assert state_file.exists()
    before_state = json.loads(state_file.read_text(encoding="utf-8"))

    dry_run = run_cli(
        PIPELINE_SCRIPT,
        str(second),
        "--json",
        "--import-db",
        "--dry-run",
        "--db-loader-script",
        str(fake_loader),
        "--db-name",
        str(state_file),
        "--output-dir",
        str(tmp_path / "out_dry"),
    )
    dry_report = parse_json_stdout(dry_run)
    dry_db_report = load_db_report_from_pipeline_report(dry_report)
    after_state = json.loads(state_file.read_text(encoding="utf-8"))

    assert first_report["db_import_executed"] is True
    assert dry_run.returncode == 0
    assert dry_report["db_import_executed"] is True
    assert dry_db_report["status"] == "DRY_RUN_SUCCESS"
    assert dry_db_report["dry_run_rolled_back"] is True
    assert dry_db_report["insert_counts"]["recipes"] == 1
    assert dry_db_report["insert_counts"]["recipe_ingredients"] == 1
    assert dry_db_report["insert_counts"]["recipe_steps"] == 1
    assert before_state == after_state


def test_pipeline_reimport_same_file_is_idempotent(tmp_path: Path) -> None:
    canonical = write_canonical_workbook(tmp_path / "canonical_ok.xlsx")
    fake_loader = write_fake_db_loader(tmp_path / "fake_db_loader.py")
    state_file = tmp_path / "fake_db_state.json"

    first = run_cli(
        PIPELINE_SCRIPT,
        str(canonical),
        "--json",
        "--import-db",
        "--db-loader-script",
        str(fake_loader),
        "--db-name",
        str(state_file),
        "--output-dir",
        str(tmp_path / "out_first"),
    )
    first_report = parse_json_stdout(first)
    first_db_report = load_db_report_from_pipeline_report(first_report)

    second = run_cli(
        PIPELINE_SCRIPT,
        str(canonical),
        "--json",
        "--import-db",
        "--db-loader-script",
        str(fake_loader),
        "--db-name",
        str(state_file),
        "--output-dir",
        str(tmp_path / "out_second"),
    )
    second_report = parse_json_stdout(second)
    second_db_report = load_db_report_from_pipeline_report(second_report)
    final_state = json.loads(state_file.read_text(encoding="utf-8"))

    assert first.returncode == 0
    assert second.returncode == 0
    assert first_db_report["insert_counts"] == {
        "recipes": 1,
        "recipe_ingredients": 1,
        "recipe_steps": 1,
    }
    assert second_db_report["insert_counts"] == {
        "recipes": 0,
        "recipe_ingredients": 0,
        "recipe_steps": 0,
    }
    assert second_db_report["delta_in_tx"] == {
        "recipes": 0,
        "recipe_ingredients": 0,
        "recipe_steps": 0,
    }
    assert len(final_state["recipes"]) == 1
    assert len(final_state["recipe_ingredients"]) == 1
    assert len(final_state["recipe_steps"]) == 1
