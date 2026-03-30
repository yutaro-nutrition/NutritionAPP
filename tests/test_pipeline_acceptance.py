"""Responsibility label: pipeline_acceptance_gate_non_db.

Non-DB acceptance gate for pipeline JSON contract and validation error classes.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PIPELINE_SCRIPT = ROOT / "import_recipe_excel_pipeline.py"
TEMPLATE = ROOT / "templates" / "recipe_excel_canonical_template_v1.xlsx"
INVALID_DIR = ROOT / "templates" / "invalid_samples"


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(PIPELINE_SCRIPT), *args, "--json"],
        capture_output=True,
        text=True,
        check=False,
        cwd=str(ROOT),
    )


def parse_json_stdout(proc: subprocess.CompletedProcess[str]) -> dict:
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError(f"stdout is not valid JSON:\n{proc.stdout}\nstderr:\n{proc.stderr}") from exc


def test_pipeline_accepts_canonical_template(tmp_path: Path) -> None:
    proc = run_cli(str(TEMPLATE), "--output-dir", str(tmp_path))
    report = parse_json_stdout(proc)

    assert proc.returncode == 0
    assert report["status"] == "passed"
    assert report["summary"]["validation_status"] == "passed"
    assert report["errors"] == []


def test_pipeline_blocks_on_structure_error_invalid_sheet_name(tmp_path: Path) -> None:
    proc = run_cli(str(INVALID_DIR / "invalid_sheet_name.xlsx"), "--output-dir", str(tmp_path))
    report = parse_json_stdout(proc)

    assert proc.returncode == 1
    assert report["status"] == "failed"
    assert report["errors"][0]["code"] == "P004_VALIDATION_FAILED"
    assert report["errors"][0]["first_failure"]["error_class"] == "STRUCTURE_ERROR"
    assert report["errors"][0]["all_errors"]


def test_pipeline_blocks_on_structure_error_missing_recipe_column(tmp_path: Path) -> None:
    proc = run_cli(str(INVALID_DIR / "invalid_missing_recipe_column.xlsx"), "--output-dir", str(tmp_path))
    report = parse_json_stdout(proc)

    assert proc.returncode == 1
    assert report["status"] == "failed"
    assert report["errors"][0]["first_failure"]["error_class"] == "STRUCTURE_ERROR"


def test_pipeline_blocks_on_value_error_invalid_bad_unit(tmp_path: Path) -> None:
    proc = run_cli(str(INVALID_DIR / "invalid_bad_unit.xlsx"), "--output-dir", str(tmp_path))
    report = parse_json_stdout(proc)

    assert proc.returncode == 1
    assert report["status"] == "failed"
    assert report["errors"][0]["first_failure"]["error_class"] == "VALUE_ERROR"


def test_pipeline_blocks_on_required_invalid_samples(tmp_path: Path) -> None:
    targets = [
        "invalid_missing_recipe_column.xlsx",
        "invalid_bad_unit.xlsx",
        "invalid_duplicate_ingredient_no.xlsx",
        "invalid_step_no_duplicate.xlsx",
    ]
    for name in targets:
        proc = run_cli(str(INVALID_DIR / name), "--output-dir", str(tmp_path))
        report = parse_json_stdout(proc)
        assert proc.returncode == 1, name
        assert report["errors"][0]["code"] == "P004_VALIDATION_FAILED", name


def test_pipeline_blocks_on_uniqueness_error_samples(tmp_path: Path) -> None:
    for name in ["invalid_duplicate_ingredient_no.xlsx", "invalid_step_no_duplicate.xlsx"]:
        proc = run_cli(str(INVALID_DIR / name), "--output-dir", str(tmp_path))
        report = parse_json_stdout(proc)
        assert proc.returncode == 1, name
        assert report["errors"][0]["first_failure"]["error_class"] == "UNIQUENESS_ERROR", name
