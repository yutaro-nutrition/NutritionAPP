#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd


EXPECTED_SHEETS = ["Recipes", "Ingredients", "Steps"]


@dataclass
class StepRun:
    name: str
    status: str
    started_at_utc: str
    finished_at_utc: str
    command: list[str] | None = None
    return_code: int | None = None
    stdout: str | None = None
    stderr: str | None = None
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = {
            "name": self.name,
            "status": self.status,
            "started_at_utc": self.started_at_utc,
            "finished_at_utc": self.finished_at_utc,
            "command": self.command,
            "return_code": self.return_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "details": self.details,
        }
        return {k: v for k, v in data.items() if v is not None and v != {}}


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def compact_text(text: str | None, limit: int = 4000) -> str | None:
    if text is None:
        return None
    if len(text) <= limit:
        return text
    omitted = len(text) - limit
    return text[:limit] + f"\n... [truncated {omitted} chars]"


def parse_json_safely(raw: str) -> dict[str, Any] | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def run_command(command: list[str]) -> tuple[int, str, str]:
    proc = subprocess.run(command, capture_output=True, text=True, check=False)
    return proc.returncode, proc.stdout, proc.stderr


def detect_workbook(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "status": "failed",
            "reason": "input_file_not_found",
            "sheet_names": [],
            "is_canonical_sheet_set": False,
        }
    try:
        workbook = pd.ExcelFile(path, engine="openpyxl")
        sheet_names = workbook.sheet_names
    except Exception as exc:
        return {
            "status": "failed",
            "reason": "excel_read_error",
            "error": str(exc),
            "sheet_names": [],
            "is_canonical_sheet_set": False,
        }

    return {
        "status": "ok",
        "sheet_names": sheet_names,
        "is_canonical_sheet_set": set(sheet_names) == set(EXPECTED_SHEETS),
    }


def run_validate(excel_path: Path, validator_script: Path) -> StepRun:
    started = now_utc_iso()
    command = [sys.executable, str(validator_script), str(excel_path), "--json"]
    rc, stdout, stderr = run_command(command)
    payload = parse_json_safely(stdout)

    status = "failed"
    if payload and str(payload.get("status", "")).lower() == "passed":
        status = "passed"

    return StepRun(
        name="validate",
        status=status,
        started_at_utc=started,
        finished_at_utc=now_utc_iso(),
        command=command,
        return_code=rc,
        stdout=compact_text(stdout),
        stderr=compact_text(stderr),
        details={"validation_result": payload or {}},
    )


def run_db_import(
    excel_path: Path,
    report_path: Path,
    args: argparse.Namespace,
    loader_script: Path,
) -> StepRun:
    started = now_utc_iso()
    command = [
        sys.executable,
        str(loader_script),
        "--excel",
        str(excel_path),
        "--host",
        args.db_host,
        "--port",
        str(args.db_port),
        "--db-name",
        args.db_name,
        "--user",
        args.db_user,
        "--schema",
        args.db_schema,
        "--parent-existing-mode",
        args.parent_existing_mode,
        "--report",
        str(report_path),
    ]
    if args.db_password is not None:
        command.extend(["--password", args.db_password])
    if args.dry_run:
        command.append("--dry-run")

    rc, stdout, stderr = run_command(command)
    db_report = None
    if report_path.exists():
        try:
            db_report = json.loads(report_path.read_text(encoding="utf-8"))
        except Exception:
            db_report = None

    return StepRun(
        name="db_import",
        status="passed" if rc == 0 else "failed",
        started_at_utc=started,
        finished_at_utc=now_utc_iso(),
        command=command,
        return_code=rc,
        stdout=compact_text(stdout),
        stderr=compact_text(stderr),
        details={"db_import_report": db_report or {}},
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Canonical recipe import pipeline")
    parser.add_argument("input_excel", help="Path to canonical recipe .xlsx")
    parser.add_argument("--output-dir", default="output/pipeline", help="Directory for reports")
    parser.add_argument("--skip-convert", action="store_true", help="Accepted for compatibility; conversion is not used")
    parser.add_argument("--skip-validate", action="store_true", help="Skip validator gate (not recommended)")
    parser.add_argument("--fail-on-warning", action="store_true", help="Accepted for compatibility")
    parser.add_argument("--import-db", action="store_true", help="Run DB import when validation passes")
    parser.add_argument("--json", action="store_true", help="Print full JSON report")

    parser.add_argument("--db-host", default="localhost")
    parser.add_argument("--db-port", type=int, default=5432)
    parser.add_argument("--db-name", default="recipe_db")
    parser.add_argument("--db-user", default="postgres")
    parser.add_argument("--db-password", default=None)
    parser.add_argument("--db-schema", default="public")
    parser.add_argument("--parent-existing-mode", choices=["skip", "replace", "update"], default="skip")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--db-loader-script", default="scripts/load_excel_to_postgres.py")
    return parser.parse_args()


def print_human(report: dict[str, Any]) -> None:
    summary = report.get("summary", {})
    print(f"[PIPELINE] status={report.get('status')} gate_result={report.get('gate_result')}")
    print(f"[PIPELINE] input={report.get('input_excel')}")
    print(
        f"[PIPELINE] errors={summary.get('error_count', 0)} "
        f"warnings={summary.get('warning_count', 0)} "
        f"validation_status={summary.get('validation_status')}"
    )
    for step in report.get("steps", []):
        print(f"- [{step['status']}] {step['name']}")
    if report.get("report_file"):
        print(f"[PIPELINE] report_file={report['report_file']}")


def main() -> int:
    args = parse_args()

    script_path = Path(__file__).resolve()
    if script_path.parent.name == "scripts":
        root_dir = script_path.parent.parent
    else:
        root_dir = script_path.parent
    input_excel = Path(args.input_excel).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    validator_script = root_dir / "scripts" / "validate_recipe_excel.py"
    loader_script_arg = Path(args.db_loader_script)
    loader_script = loader_script_arg.resolve() if loader_script_arg.is_absolute() else (root_dir / loader_script_arg).resolve()

    run_id = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:8]
    pipeline_report_path = output_dir / f"import_pipeline_report_{run_id}.json"
    db_report_path = output_dir / f"db_import_report_{run_id}.json"

    started_at = now_utc_iso()
    steps: list[StepRun] = []
    warnings: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    validation_result: dict[str, Any] = {}
    validation_status = "skipped"

    detect_started = now_utc_iso()
    detection = detect_workbook(input_excel)
    steps.append(
        StepRun(
            name="detect_workbook",
            status="passed" if detection.get("status") == "ok" else "failed",
            started_at_utc=detect_started,
            finished_at_utc=now_utc_iso(),
            details=detection,
        )
    )
    if detection.get("status") != "ok":
        errors.append(
            {
                "code": "P001_WORKBOOK_READ_FAILED",
                "message": "Failed to read workbook.",
                "details": detection,
            }
        )

    if args.skip_validate:
        warnings.append(
            {
                "code": "P101_SKIP_VALIDATE_IGNORED",
                "message": "--skip-validate is ignored. Validation is always executed in canonical pipeline mode.",
            }
        )
    if args.skip_convert:
        warnings.append(
            {
                "code": "P102_SKIP_CONVERT_IGNORED",
                "message": "--skip-convert is ignored in canonical-only pipeline mode.",
            }
        )

    if not errors:
        validate_step = run_validate(input_excel, validator_script)
        steps.append(validate_step)
        validation_result = validate_step.details.get("validation_result", {})
        validation_status = str(validation_result.get("status", "failed"))
        if validate_step.status == "failed":
            errors.append(
                {
                    "code": "P004_VALIDATION_FAILED",
                    "message": "Validation gate failed. Import was stopped.",
                    "first_failure": validation_result.get("first_failure"),
                    "all_errors": validation_result.get("all_errors", []),
                }
            )

    db_import_executed = False
    if args.import_db and not errors:
        db_step = run_db_import(input_excel, db_report_path, args, loader_script)
        steps.append(db_step)
        db_import_executed = True
        if db_step.status == "failed":
            errors.append(
                {
                    "code": "P006_DB_IMPORT_FAILED",
                    "message": "DB import step failed.",
                    "details": db_step.details.get("db_import_report", {}),
                }
            )

    gate_result = "FAIL"
    if not errors:
        gate_result = "PASS_WITH_WARNINGS" if warnings else "PASS"

    status = "failed" if errors else ("passed_with_warnings" if warnings else "passed")

    report: dict[str, Any] = {
        "pipeline_version": "2.0.0",
        "run_id": run_id,
        "status": status,
        "gate_result": gate_result,
        "started_at_utc": started_at,
        "finished_at_utc": now_utc_iso(),
        "input_excel": str(input_excel),
        "canonical_excel": str(input_excel),
        "detected_workbook": detection,
        "db_import_requested": bool(args.import_db),
        "db_import_executed": db_import_executed,
        "artifacts": {
            "pipeline_report": str(pipeline_report_path),
            "db_import_report": str(db_report_path) if db_report_path.exists() else None,
        },
        "summary": {
            "error_count": len(errors),
            "warning_count": len(warnings),
            "validation_status": validation_status,
        },
        "validation_result": validation_result,
        "errors": errors,
        "warnings": warnings,
        "steps": [s.to_dict() for s in steps],
    }

    pipeline_report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    report["report_file"] = str(pipeline_report_path)

    if args.json:
        print(json.dumps(report, ensure_ascii=True, indent=2))
    else:
        print_human(report)

    return 0 if status in {"passed", "passed_with_warnings"} else 1


if __name__ == "__main__":
    sys.exit(main())
