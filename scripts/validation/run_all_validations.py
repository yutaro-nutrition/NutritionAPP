from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from validate_recipe_db import validate_file

TARGET_FILES = {
    "recipe_db_udon_100.xlsx": {"category": "udon", "expected_count": 100},
    "recipe_db_soba_50.xlsx": {"category": "soba", "expected_count": 50},
    "recipe_db_ramen_50.xlsx": {"category": "ramen", "expected_count": 50},
    "recipe_db_bread_100.xlsx": {"category": "bread", "expected_count": 100},
    "recipe_db_donburi_100_batch1.xlsx": {"category": "donburi", "expected_count": 100},
}


def _resolve_project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_input_path(project_root: Path, file_name: str) -> tuple[Path, bool]:
    generated_candidate = project_root / "data" / "generated" / file_name
    if generated_candidate.exists():
        return generated_candidate, False
    fallback_candidate = project_root / file_name
    if fallback_candidate.exists():
        return fallback_candidate, True
    return generated_candidate, False


def run_all_validations() -> dict:
    project_root = _resolve_project_root()
    reports_dir = project_root / "reports" / "validation"
    reports_dir.mkdir(parents=True, exist_ok=True)

    file_results = []
    for file_name, cfg in TARGET_FILES.items():
        input_path, fallback_used = _resolve_input_path(project_root, file_name)
        metadata = {
            "target_file_name": file_name,
            "expected_location": str(project_root / "data" / "generated" / file_name),
            "fallback_used": fallback_used,
        }
        report = validate_file(
            input_path,
            category=cfg["category"],
            expected_count=cfg["expected_count"],
            metadata=metadata,
        )
        if fallback_used:
            report["issues"].append(
                {
                    "code": "FILE_LOCATION_FALLBACK",
                    "severity": "warning",
                    "message": "target file was validated from project root fallback path",
                    "details": {"resolved_path": str(input_path)},
                }
            )
            if report["status"] == "passed":
                report["status"] = "manual_review"
            report["summary"]["total_issues"] += 1
            report["summary"]["warning_count"] += 1

        report_path = reports_dir / f"{Path(file_name).stem}_validation.json"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        file_results.append(
            {
                "file_name": file_name,
                "resolved_input_path": str(input_path),
                "report_path": str(report_path),
                "category": cfg["category"],
                "expected_count": cfg["expected_count"],
                "status": report["status"],
                "summary": report["summary"],
            }
        )

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project_root": str(project_root),
        "input_base_dir": str(project_root / "data" / "generated"),
        "output_dir": str(reports_dir),
        "totals": {
            "files": len(file_results),
            "passed": sum(1 for r in file_results if r["status"] == "passed"),
            "manual_review": sum(1 for r in file_results if r["status"] == "manual_review"),
            "failed": sum(1 for r in file_results if r["status"] == "failed"),
        },
        "files": file_results,
    }
    summary_path = reports_dir / "summary_validation_report.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary


def main() -> int:
    summary = run_all_validations()
    totals = summary["totals"]
    print("Validation summary")
    print(
        f"files={totals['files']} passed={totals['passed']} "
        f"manual_review={totals['manual_review']} failed={totals['failed']}"
    )
    print(f"summary_report={Path(summary['output_dir']) / 'summary_validation_report.json'}")
    return 0 if totals["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
