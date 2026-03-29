from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import create_engine, text


PROJECT_ROOT = Path(__file__).resolve().parents[2]
APP_API_ROOT = PROJECT_ROOT / "app_api"
if str(APP_API_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_API_ROOT))

from app.core.config import settings  # noqa: E402


OUTPUT_DIR = PROJECT_ROOT / "output" / "db_load"
REPORT_PATH = OUTPUT_DIR / "db_count_check_report.json"
INTEGRATED_DIR = PROJECT_ROOT / "output" / "integrated"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_text(value: Any) -> str:
    text_value = str(value)
    encoding = sys.stdout.encoding or "utf-8"
    return text_value.encode(encoding, errors="replace").decode(encoding, errors="replace")


def fetch_single_value(conn, sql: str) -> int:
    return int(conn.execute(text(sql)).scalar_one())


def fetch_group_counts(conn, sql: str) -> dict[str, int]:
    rows = conn.execute(text(sql)).mappings().all()
    result: dict[str, int] = {}
    for row in rows:
        key = str(row["key"]) if row["key"] is not None else "(null)"
        result[key] = int(row["count"])
    return result


def read_csv_row_count(path: Path) -> int | None:
    if not path.exists():
        return None
    return int(len(pd.read_csv(path, dtype=str, encoding="utf-8-sig")))


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "started_at_utc": utc_now_iso(),
        "finished_at_utc": None,
        "status": "running",
        "db_target": settings.db_target_label,
        "table_counts": {},
        "category_lv1_counts": {},
        "category_lv2_counts": {},
        "qa_status_counts": {},
        "csv_vs_db": {},
        "error_message": None,
    }

    try:
        engine = create_engine(settings.database_url, future=True, pool_pre_ping=True)
        try:
            with engine.connect() as conn:
                table_counts = {
                    "recipes": fetch_single_value(conn, "SELECT COUNT(*) FROM recipes"),
                    "recipe_ingredients": fetch_single_value(
                        conn, "SELECT COUNT(*) FROM recipe_ingredients"
                    ),
                    "recipe_steps": fetch_single_value(conn, "SELECT COUNT(*) FROM recipe_steps"),
                }
                category_lv1_counts = fetch_group_counts(
                    conn,
                    """
                    SELECT category_lv1 AS key, COUNT(*) AS count
                    FROM recipes
                    GROUP BY category_lv1
                    ORDER BY category_lv1
                    """,
                )
                category_lv2_counts = fetch_group_counts(
                    conn,
                    """
                    SELECT category_lv2 AS key, COUNT(*) AS count
                    FROM recipes
                    GROUP BY category_lv2
                    ORDER BY category_lv2
                    """,
                )
                qa_status_counts = fetch_group_counts(
                    conn,
                    """
                    SELECT qa_status AS key, COUNT(*) AS count
                    FROM recipes
                    GROUP BY qa_status
                    ORDER BY qa_status
                    """,
                )
        finally:
            engine.dispose()

        csv_counts = {
            "recipes": read_csv_row_count(INTEGRATED_DIR / "recipe_master_all.csv"),
            "recipe_ingredients": read_csv_row_count(
                INTEGRATED_DIR / "recipe_ingredients_all.csv"
            ),
            "recipe_steps": read_csv_row_count(INTEGRATED_DIR / "recipe_steps_all.csv"),
        }

        csv_vs_db: dict[str, dict[str, Any]] = {}
        for key, db_count in table_counts.items():
            csv_count = csv_counts.get(key)
            csv_vs_db[key] = {
                "csv_count": csv_count,
                "db_count": db_count,
                "match": (csv_count == db_count) if csv_count is not None else None,
            }

        report.update(
            {
                "status": "success",
                "table_counts": table_counts,
                "category_lv1_counts": category_lv1_counts,
                "category_lv2_counts": category_lv2_counts,
                "qa_status_counts": qa_status_counts,
                "csv_vs_db": csv_vs_db,
            }
        )

        print("=== DB Count Check Summary ===")
        print(f"db_target: {report['db_target']}")
        print("table_counts:")
        print(json.dumps(table_counts, ensure_ascii=False, indent=2))
        print("category_lv1_counts:")
        print(json.dumps(category_lv1_counts, ensure_ascii=False, indent=2))
        print("category_lv2_counts:")
        print(json.dumps(category_lv2_counts, ensure_ascii=False, indent=2))
        print("qa_status_counts:")
        print(json.dumps(qa_status_counts, ensure_ascii=False, indent=2))
        print("csv_vs_db:")
        print(json.dumps(csv_vs_db, ensure_ascii=False, indent=2))
    except Exception as exc:
        report["status"] = "failed"
        report["error_message"] = safe_text(exc)
        print("=== DB Count Check Summary ===")
        print("status: failed")
        print(f"error_message: {safe_text(exc)}")
    finally:
        report["finished_at_utc"] = utc_now_iso()
        REPORT_PATH.write_text(
            json.dumps(report, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"report_path: {REPORT_PATH}")

    return 0 if report["status"] == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
