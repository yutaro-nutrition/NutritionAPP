from __future__ import annotations

import argparse
import json
import logging
import sys
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Engine, create_engine
from sqlalchemy.exc import SQLAlchemyError


PROJECT_ROOT = Path(__file__).resolve().parents[2]
APP_API_ROOT = PROJECT_ROOT / "app_api"
if str(APP_API_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_API_ROOT))

from app.core.config import settings  # noqa: E402


ALLOWED_QA_STATUS = {"passed", "manual_review", "failed"}
INPUT_FILES = {
    "recipes": PROJECT_ROOT / "output" / "integrated" / "recipe_master_all.csv",
    "ingredients": PROJECT_ROOT / "output" / "integrated" / "recipe_ingredients_all.csv",
    "steps": PROJECT_ROOT / "output" / "integrated" / "recipe_steps_all.csv",
}
INPUT_FILE_LABELS = {
    "recipes": "output/integrated/recipe_master_all.csv",
    "ingredients": "output/integrated/recipe_ingredients_all.csv",
    "steps": "output/integrated/recipe_steps_all.csv",
}
OUTPUT_DIR = PROJECT_ROOT / "output" / "db_load"
LOG_DIR = OUTPUT_DIR / "logs"
DEBUG_DIR = OUTPUT_DIR / "debug"
REPORT_PATH = OUTPUT_DIR / "db_import_report.json"
SQL_PATH = PROJECT_ROOT / "app_api" / "sql" / "create_tables.sql"

RECIPE_COLUMNS = [
    "recipe_id",
    "recipe_name",
    "category_lv1",
    "category_lv2",
    "category_lv3",
    "energy_kcal",
    "protein_g",
    "fat_g",
    "carbohydrate_g",
    "p_ratio",
    "f_ratio",
    "c_ratio",
    "tags",
    "cooking_method",
    "notes",
    "source_file",
    "source_batch",
    "qa_status",
    "version",
    "created_at",
    "updated_at",
]
INGREDIENT_COLUMNS = [
    "recipe_id",
    "line_no",
    "ingredient_name",
    "ingredient_alias",
    "weight_g",
    "notes",
    "source_file",
    "source_batch",
    "qa_status",
    "version",
]
STEP_COLUMNS = [
    "recipe_id",
    "step_number",
    "instruction",
    "source_file",
    "source_batch",
    "qa_status",
    "version",
]


@dataclass
class ValidationFlags:
    input_file_exists: bool = False
    required_columns_ok: bool = False
    recipe_id_unique_ok: bool = False
    foreign_key_ready_ok: bool = False
    qa_status_valid_ok: bool = False
    db_connection_ok: bool = False
    load_completed_ok: bool = False

    def to_dict(self) -> dict[str, bool]:
        return {
            "input_file_exists": self.input_file_exists,
            "required_columns_ok": self.required_columns_ok,
            "recipe_id_unique_ok": self.recipe_id_unique_ok,
            "foreign_key_ready_ok": self.foreign_key_ready_ok,
            "qa_status_valid_ok": self.qa_status_valid_ok,
            "db_connection_ok": self.db_connection_ok,
            "load_completed_ok": self.load_completed_ok,
        }


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_output_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)


def setup_logger() -> logging.Logger:
    ensure_output_dirs()
    logger = logging.getLogger("db_import")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_handler = logging.FileHandler(LOG_DIR / f"db_import_{ts}.log", encoding="utf-8")
    stream_handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
    file_handler.setFormatter(formatter)
    stream_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)
    return logger


def safe_text(value: Any) -> str:
    text_value = str(value)
    encoding = sys.stdout.encoding or "utf-8"
    return text_value.encode(encoding, errors="replace").decode(encoding, errors="replace")


def require_files(files: dict[str, Path]) -> None:
    missing = [str(path) for path in files.values() if not path.exists()]
    if missing:
        raise FileNotFoundError(
            "Required integrated files are missing:\n" + "\n".join(missing)
        )


def read_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str, encoding="utf-8-sig")


def ensure_required_columns(df: pd.DataFrame, required: list[str], file_label: str) -> None:
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"{file_label}: missing required columns: {missing}")


def ensure_non_empty_string(series: pd.Series, label: str) -> None:
    bad = series.isna() | (series.astype(str).str.strip() == "")
    if bad.any():
        raise ValueError(f"{label} contains null/blank values. bad_rows={int(bad.sum())}")


def normalize_for_insert(recipes: pd.DataFrame, ingredients: pd.DataFrame, steps: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    numeric_recipe_cols = [
        "energy_kcal",
        "protein_g",
        "fat_g",
        "carbohydrate_g",
        "p_ratio",
        "f_ratio",
        "c_ratio",
    ]
    for col in numeric_recipe_cols:
        recipes[col] = pd.to_numeric(recipes[col], errors="coerce")
        if recipes[col].isna().any():
            raise ValueError(f"recipes.{col} contains non-numeric values.")
        if (recipes[col] < 0).any():
            raise ValueError(f"recipes.{col} contains negative values.")

    ingredients["line_no"] = pd.to_numeric(ingredients["line_no"], errors="coerce")
    ingredients["weight_g"] = pd.to_numeric(ingredients["weight_g"], errors="coerce")
    if ingredients["line_no"].isna().any() or (ingredients["line_no"] < 1).any():
        raise ValueError("recipe_ingredients.line_no must be numeric and >= 1.")
    if ingredients["weight_g"].isna().any() or (ingredients["weight_g"] <= 0).any():
        raise ValueError("recipe_ingredients.weight_g must be numeric and > 0.")

    steps["step_number"] = pd.to_numeric(steps["step_number"], errors="coerce")
    if steps["step_number"].isna().any() or (steps["step_number"] < 1).any():
        raise ValueError("recipe_steps.step_number must be numeric and >= 1.")

    recipes["created_at"] = pd.to_datetime(recipes["created_at"], errors="coerce", utc=True)
    recipes["updated_at"] = pd.to_datetime(recipes["updated_at"], errors="coerce", utc=True)
    if recipes["created_at"].isna().any() or recipes["updated_at"].isna().any():
        raise ValueError("recipes.created_at / recipes.updated_at contains invalid timestamp.")

    for frame in (recipes, ingredients, steps):
        for col in ["category_lv3", "tags", "cooking_method", "notes", "ingredient_alias"]:
            if col in frame.columns:
                frame[col] = frame[col].where(frame[col].notna(), None)
                frame[col] = frame[col].replace({"": None})

    ingredients["line_no"] = ingredients["line_no"].astype(int)
    steps["step_number"] = steps["step_number"].astype(int)

    recipes = recipes[RECIPE_COLUMNS].copy()
    ingredients = ingredients[INGREDIENT_COLUMNS].copy()
    steps = steps[STEP_COLUMNS].copy()
    return recipes, ingredients, steps


def run_validations(
    recipes: pd.DataFrame,
    ingredients: pd.DataFrame,
    steps: pd.DataFrame,
) -> None:
    ensure_non_empty_string(recipes["recipe_id"], "recipes.recipe_id")
    ensure_non_empty_string(ingredients["recipe_id"], "recipe_ingredients.recipe_id")
    ensure_non_empty_string(steps["recipe_id"], "recipe_steps.recipe_id")

    if recipes["recipe_id"].duplicated().any():
        dup_count = int(recipes["recipe_id"].duplicated().sum())
        raise ValueError(f"recipes.recipe_id duplicated. duplicated_rows={dup_count}")

    recipe_ids = set(recipes["recipe_id"])
    ing_unknown = sorted(set(ingredients["recipe_id"]) - recipe_ids)
    step_unknown = sorted(set(steps["recipe_id"]) - recipe_ids)
    if ing_unknown or step_unknown:
        raise ValueError(
            "Found child rows with unknown recipe_id. "
            f"ingredients_unknown={len(ing_unknown)}, steps_unknown={len(step_unknown)}"
        )

    for table_name, frame in [
        ("recipes", recipes),
        ("recipe_ingredients", ingredients),
        ("recipe_steps", steps),
    ]:
        actual = set(frame["qa_status"].dropna().astype(str).unique())
        unknown = sorted(actual - ALLOWED_QA_STATUS)
        if unknown:
            raise ValueError(
                f"{table_name}.qa_status contains unsupported values: {unknown}"
            )


def apply_create_tables_sql(engine: Engine, sql_path: Path) -> None:
    if not sql_path.exists():
        raise FileNotFoundError(f"DDL file not found: {sql_path}")
    script = sql_path.read_text(encoding="utf-8")
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cur:
            cur.execute(script)
        raw.commit()
    except Exception:
        raw.rollback()
        raise
    finally:
        raw.close()


def truncate_tables(conn) -> None:
    conn.execute(text("TRUNCATE TABLE recipe_steps RESTART IDENTITY CASCADE"))
    conn.execute(text("TRUNCATE TABLE recipe_ingredients RESTART IDENTITY CASCADE"))
    conn.execute(text("TRUNCATE TABLE recipes RESTART IDENTITY CASCADE"))


def build_report_base(started_at: str, truncate_mode: bool) -> dict[str, Any]:
    return {
        "started_at_utc": started_at,
        "finished_at_utc": None,
        "status": "running",
        "recipes_csv_rows": 0,
        "ingredients_csv_rows": 0,
        "steps_csv_rows": 0,
        "loaded_recipe_rows": 0,
        "loaded_ingredient_rows": 0,
        "loaded_step_rows": 0,
        "input_files": INPUT_FILE_LABELS,
        "db_target": settings.db_target_label,
        "truncate_mode": truncate_mode,
        "validation_checks": {},
        "error_message": None,
    }


def save_report(report: dict[str, Any]) -> None:
    ensure_output_dirs()
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def print_summary(report: dict[str, Any]) -> None:
    print("=== DB Import Summary ===")
    print(f"status: {report['status']}")
    print(f"db_target: {report['db_target']}")
    print(
        "csv_rows: recipes={recipes_csv_rows}, ingredients={ingredients_csv_rows}, steps={steps_csv_rows}".format(
            **report
        )
    )
    print(
        "loaded_rows: recipes={loaded_recipe_rows}, ingredients={loaded_ingredient_rows}, steps={loaded_step_rows}".format(
            **report
        )
    )
    print(f"report_path: {REPORT_PATH}")
    if report["error_message"]:
        print(f"error_message: {safe_text(report['error_message'])}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import integrated CSV files into PostgreSQL safely."
    )
    parser.add_argument(
        "--no-truncate",
        action="store_true",
        help="Disable truncate step (append mode). default is truncate + reload.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    truncate_mode = not args.no_truncate
    logger = setup_logger()
    started_at = utc_now_iso()
    report = build_report_base(started_at=started_at, truncate_mode=truncate_mode)
    checks = ValidationFlags()

    try:
        logger.info("Starting integrated CSV import.")
        require_files(INPUT_FILES)
        checks.input_file_exists = True
        logger.info("Input file existence check passed.")

        recipes_df = read_csv(INPUT_FILES["recipes"])
        ingredients_df = read_csv(INPUT_FILES["ingredients"])
        steps_df = read_csv(INPUT_FILES["steps"])

        report["recipes_csv_rows"] = int(len(recipes_df))
        report["ingredients_csv_rows"] = int(len(ingredients_df))
        report["steps_csv_rows"] = int(len(steps_df))

        ensure_required_columns(recipes_df, RECIPE_COLUMNS, "recipe_master_all.csv")
        ensure_required_columns(ingredients_df, INGREDIENT_COLUMNS, "recipe_ingredients_all.csv")
        ensure_required_columns(steps_df, STEP_COLUMNS, "recipe_steps_all.csv")
        checks.required_columns_ok = True

        run_validations(recipes_df, ingredients_df, steps_df)
        checks.recipe_id_unique_ok = True
        checks.foreign_key_ready_ok = True
        checks.qa_status_valid_ok = True

        recipes_df, ingredients_df, steps_df = normalize_for_insert(
            recipes_df, ingredients_df, steps_df
        )
        debug_stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        recipes_df.head(50).to_json(
            DEBUG_DIR / f"recipes_preview_{debug_stamp}.json",
            orient="records",
            force_ascii=False,
            indent=2,
            date_format="iso",
        )

        engine = create_engine(settings.database_url, future=True, pool_pre_ping=True)
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            checks.db_connection_ok = True
            logger.info("Database connection check passed.")

            apply_create_tables_sql(engine, SQL_PATH)
            logger.info("DDL apply completed.")

            with engine.begin() as conn:
                if truncate_mode:
                    truncate_tables(conn)
                    logger.info("Truncate completed (recipe_steps -> recipe_ingredients -> recipes).")

                recipes_df.to_sql(
                    "recipes",
                    con=conn,
                    if_exists="append",
                    index=False,
                    method="multi",
                    chunksize=1000,
                )
                ingredients_df.to_sql(
                    "recipe_ingredients",
                    con=conn,
                    if_exists="append",
                    index=False,
                    method="multi",
                    chunksize=2000,
                )
                steps_df.to_sql(
                    "recipe_steps",
                    con=conn,
                    if_exists="append",
                    index=False,
                    method="multi",
                    chunksize=2000,
                )
            checks.load_completed_ok = True
            logger.info("All table loads completed.")
        finally:
            engine.dispose()

        report["loaded_recipe_rows"] = int(len(recipes_df))
        report["loaded_ingredient_rows"] = int(len(ingredients_df))
        report["loaded_step_rows"] = int(len(steps_df))
        report["status"] = "success"
        report["error_message"] = None

    except (FileNotFoundError, ValueError, SQLAlchemyError, Exception) as exc:
        error_message = safe_text(exc)
        tb_message = safe_text(traceback.format_exc())
        logger.error("Import failed: %s", error_message)
        logger.error("Traceback:\n%s", tb_message)
        report["status"] = "failed"
        report["error_message"] = error_message
    finally:
        report["validation_checks"] = checks.to_dict()
        report["finished_at_utc"] = utc_now_iso()
        save_report(report)
        print_summary(report)

    return 0 if report["status"] == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
