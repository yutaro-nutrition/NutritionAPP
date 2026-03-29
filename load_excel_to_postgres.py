#!/usr/bin/env python3
"""Excel recipe loader aligned to public.recipes parent model.

Formal behavior:
- Parent load target: public.recipes only
- recipe_master is read-only reference view (never written)
- Children load target: public.recipe_ingredients / public.recipe_steps
- Supported formal modes: skip / replace
- Legacy compatibility mode: update (formal contract outside)
- Load order: recipes -> recipe_ingredients -> recipe_steps
- Validation summary includes counts, added ids, sample checks, orphan and duplicate checks
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import psycopg
from psycopg import sql

EXPECTED_SHEETS = ("Recipes", "Ingredients", "Steps")

SHEET_COLUMN_ALIASES = {
    "Recipes": {
        "recipe_id": ["Recipe_ID", "recipe_id", "RECIPE_ID", "recipeid", "RecipeId"],
        "recipe_name": ["Recipe_Name", "recipe_name", "RECIPE_NAME", "recipename", "RecipeName"],
        "category_code": ["Category_Code", "category_code", "CATEGORY_CODE"],
        "servings": ["Servings", "servings", "SERVINGS"],
        "tags": ["Tag", "tag", "Tags", "tags"],
    },
    "Ingredients": {
        "recipe_id": ["Recipe_ID", "recipe_id", "RECIPE_ID", "recipeid", "RecipeId"],
        "ingredient_no": ["Ingredient_No", "ingredient_no", "INGREDIENT_NO", "IngredientNo"],
        "food_id": ["Food_ID", "food_id", "FOOD_ID", "FoodId", "foodid"],
        "ingredient_name": [
            "Ingredient_Name",
            "ingredient_name",
            "INGREDIENT_NAME",
            "ingredientname",
            "IngredientName",
        ],
        "amount_value": ["Amount_Value", "amount_value", "AMOUNT_VALUE"],
        "unit": ["Unit", "unit", "UNIT"],
        "process_code": ["Process_Code", "process_code", "PROCESS_CODE"],
    },
    "Steps": {
        "recipe_id": ["Recipe_ID", "recipe_id", "RECIPE_ID", "recipeid", "RecipeId"],
        "step_number": [
            "Step_No",
            "step_no",
            "STEP_NO",
            "Step_Number",
            "step_number",
            "STEP_NUMBER",
            "StepNo",
            "stepno",
        ],
        "instruction": ["Instruction", "instruction", "INSTRUCTION", "Instructions", "instructions"],
    },
}

SHEET_REQUIRED_DB_COLUMNS = {
    "Recipes": ["recipe_id", "recipe_name", "category_code", "servings", "tags"],
    "Ingredients": ["recipe_id", "ingredient_no", "food_id", "ingredient_name", "amount_value", "unit", "process_code"],
    "Steps": ["recipe_id", "step_number", "instruction"],
}


class ImportErrorWithContext(Exception):
    """Raised for validation errors with user-friendly context."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Load recipe Excel into public.recipes + child tables with parent-first flow."
    )
    parser.add_argument("--excel", required=True, help="Path to .xlsx file")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--db-name", default="recipe_db")
    parser.add_argument("--user", default="postgres")
    parser.add_argument("--password", default=None, help="DB password (optional if env var exists)")
    parser.add_argument("--schema", default="public")
    parser.add_argument(
        "--parent-existing-mode",
        choices=["skip", "replace", "update"],
        default="skip",
        help=(
            "Parent existing row handling: "
            "skip=keep parent/children unchanged (formal), "
            "replace=replace parent and children by recipe_id (formal), "
            "update=legacy compatibility only; formal contract outside."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Execute in a transaction and roll back at the end (no data persisted).",
    )
    parser.add_argument(
        "--report",
        default=None,
        help="Optional path to write JSON summary report.",
    )
    return parser.parse_args()


def resolve_password(cli_password: str | None) -> str:
    if cli_password:
        return cli_password

    for env_key in ("POSTGRES_PASSWORD", "PGPASSWORD", "DB_PASSWORD"):
        value = os.getenv(env_key)
        if value:
            print(f"[INFO] Password loaded from environment variable: {env_key}")
            return value

    print("[WARN] Password was not provided. Trying empty password.")
    return ""


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def none_if_missing(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if pd.isna(value):
        return None
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed if trimmed else None
    return value


def to_float_or_none(value: Any) -> float | None:
    value = none_if_missing(value)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def to_int_or_none(value: Any) -> int | None:
    value = none_if_missing(value)
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def normalize_amount_to_g(amount_value: Any, unit: Any) -> float | None:
    value = to_float_or_none(amount_value)
    if value is None or value <= 0:
        return None
    unit_s = none_if_missing(unit)
    if unit_s is None:
        return None
    unit_norm = str(unit_s).strip()
    if unit_norm == "g":
        return float(value)
    if unit_norm == "ml":
        # Option 2 policy:
        # ml rows keep raw amount_value/unit in DB and do not derive weight_g
        # without density evidence.
        return None
    return None


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(col).strip() for col in df.columns]
    return df


def normalize_header_key(name: str) -> str:
    return "".join(ch.lower() for ch in str(name).strip() if ch.isalnum())


def build_rename_map(df: pd.DataFrame, sheet_name: str) -> dict[str, str]:
    aliases = SHEET_COLUMN_ALIASES[sheet_name]
    normalized_actual = {normalize_header_key(col): col for col in df.columns}
    rename_map: dict[str, str] = {}

    for db_col, candidates in aliases.items():
        matched_col = None
        for candidate in candidates:
            key = normalize_header_key(candidate)
            if key in normalized_actual:
                matched_col = normalized_actual[key]
                break
        if matched_col:
            rename_map[matched_col] = db_col

    return rename_map


def validate_required_columns(df: pd.DataFrame, required: list[str], sheet_name: str) -> None:
    missing = [col for col in required if col not in df.columns]
    if missing:
        present = ", ".join(df.columns)
        raise ImportErrorWithContext(
            f"Sheet '{sheet_name}' is missing required columns after normalization: {', '.join(missing)}. "
            f"Detected columns: {present}"
        )


def load_excel(path: Path) -> dict[str, pd.DataFrame]:
    if not path.exists():
        raise ImportErrorWithContext(f"Excel file not found: {path}")

    try:
        sheets = pd.read_excel(path, sheet_name=list(EXPECTED_SHEETS), dtype=object, engine="openpyxl")
    except ValueError as exc:
        raise ImportErrorWithContext(
            "Failed to load required sheets. Ensure the workbook has Recipes, Ingredients, Steps."
        ) from exc

    normalized = {}
    for sheet_name, df in sheets.items():
        sheet_df = normalize_columns(df)
        rename_map = build_rename_map(sheet_df, sheet_name)
        sheet_df = sheet_df.rename(columns=rename_map)
        validate_required_columns(sheet_df, SHEET_REQUIRED_DB_COLUMNS[sheet_name], sheet_name)
        normalized[sheet_name] = sheet_df

    return normalized


def derive_source_batch(file_name: str) -> str:
    m = re.search(r"(batch\d+)", file_name, flags=re.IGNORECASE)
    return m.group(1).lower() if m else "batch_unknown"


def prepare_recipes(df: pd.DataFrame, source_file: str, source_batch: str) -> tuple[list[tuple[Any, ...]], dict[str, int]]:
    work = df.copy()
    source_rows = len(work)

    work["recipe_id"] = work["recipe_id"].map(none_if_missing)
    work["recipe_name"] = work["recipe_name"].map(none_if_missing)
    work["category_code"] = work["category_code"].map(none_if_missing).fillna("unknown")
    work["servings"] = work["servings"].map(to_int_or_none).fillna(1).astype(int)
    work["tags"] = work["tags"].map(none_if_missing)
    work = work.dropna(subset=["recipe_id", "recipe_name"])
    dropped_required = source_rows - len(work)

    dup_count = int(work.duplicated(subset=["recipe_id"]).sum())
    if dup_count:
        work = work.drop_duplicates(subset=["recipe_id"], keep="last")

    for col in ["energy_kcal", "protein_g", "fat_g", "carbohydrate_g", "p_ratio", "f_ratio", "c_ratio"]:
        work[col] = 0.0

    # recipe_master view includes category/source/qa/version in current DB model,
    # but Excel does not always contain them. Use safe defaults for recipes base table.
    work["category_lv1"] = work["category_code"]
    work["category_lv2"] = "canonical_v1"
    work["category_lv3"] = None
    work["source_file"] = source_file
    work["source_batch"] = source_batch
    work["qa_status"] = "passed"
    work["version"] = "v1"

    records = [
        (
            row.recipe_id,
            row.recipe_name,
            row.category_lv1,
            row.category_lv2,
            row.category_lv3,
            float(row.energy_kcal),
            float(row.protein_g),
            float(row.fat_g),
            float(row.carbohydrate_g),
            float(row.p_ratio),
            float(row.f_ratio),
            float(row.c_ratio),
            row.tags,
            None,
            None,
            row.source_file,
            row.source_batch,
            row.qa_status,
            row.version,
        )
        for row in work.itertuples(index=False)
    ]

    stats = {
        "source_rows": source_rows,
        "prepared_rows": len(records),
        "dropped_missing_required": dropped_required,
        "deduplicated_rows": dup_count,
    }
    return records, stats


def prepare_ingredients(
    df: pd.DataFrame,
    source_file: str,
    source_batch: str,
) -> tuple[list[tuple[Any, ...]], dict[str, int]]:
    work = df.copy()
    source_rows = len(work)

    work["recipe_id"] = work["recipe_id"].map(none_if_missing)
    work["ingredient_name"] = work["ingredient_name"].map(none_if_missing)
    work["ingredient_no"] = work["ingredient_no"].map(to_int_or_none)
    work["amount_value"] = work["amount_value"].map(to_float_or_none)
    work["unit"] = work["unit"].map(none_if_missing)
    work["food_id"] = work["food_id"].map(none_if_missing)
    work["process_code"] = work["process_code"].map(none_if_missing)
    work["weight_g"] = [
        normalize_amount_to_g(row.amount_value, row.unit)
        for row in work.itertuples(index=False)
    ]
    work["weight_g"] = pd.Series(work["weight_g"])
    work["food_id"] = work["food_id"].map(none_if_missing)

    work = work.dropna(
        subset=["recipe_id", "ingredient_no", "food_id", "ingredient_name", "amount_value", "unit", "process_code"]
    )
    work = work[work["amount_value"] > 0]
    # For g rows, weight_g must stay positive.
    work = work[(work["weight_g"].isna()) | (work["weight_g"] > 0)]
    dropped_required = source_rows - len(work)

    records = [
        (
            row.recipe_id,
            int(row.ingredient_no),
            row.ingredient_name,
            None,
            row.food_id,
            row.process_code,
            float(row.weight_g) if row.weight_g is not None and not pd.isna(row.weight_g) else None,
            float(row.amount_value),
            str(row.unit),
            None,
            source_file,
            source_batch,
            "passed",
            "v1",
        )
        for row in work.itertuples(index=False)
    ]

    stats = {
        "source_rows": source_rows,
        "prepared_rows": len(records),
        "dropped_missing_required": dropped_required,
        "deduplicated_rows": 0,
    }
    return records, stats


def prepare_steps(df: pd.DataFrame, source_file: str, source_batch: str) -> tuple[list[tuple[Any, ...]], dict[str, int]]:
    work = df.copy()
    source_rows = len(work)

    work["recipe_id"] = work["recipe_id"].map(none_if_missing)
    work["step_number"] = work["step_number"].map(to_int_or_none)
    work["instruction"] = work["instruction"].map(none_if_missing)

    work = work.dropna(subset=["recipe_id", "step_number", "instruction"])
    work = work[work["step_number"] >= 1]
    dropped_required = source_rows - len(work)

    dup_count = int(work.duplicated(subset=["recipe_id", "step_number"]).sum())
    if dup_count:
        work = work.drop_duplicates(subset=["recipe_id", "step_number"], keep="last")

    records = [
        (
            row.recipe_id,
            int(row.step_number),
            row.instruction,
            source_file,
            source_batch,
            "passed",
            "v1",
        )
        for row in work.itertuples(index=False)
    ]

    stats = {
        "source_rows": source_rows,
        "prepared_rows": len(records),
        "dropped_missing_required": dropped_required,
        "deduplicated_rows": dup_count,
    }
    return records, stats


def table_counts(cur: psycopg.Cursor, schema: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for t in ("recipes", "recipe_ingredients", "recipe_steps"):
        cur.execute(sql.SQL("SELECT COUNT(*) FROM {}.{}").format(sql.Identifier(schema), sql.Identifier(t)))
        out[t] = int(cur.fetchone()[0])
    return out


def fetch_recipe_ids(cur: psycopg.Cursor, schema: str) -> set[str]:
    cur.execute(sql.SQL("SELECT recipe_id FROM {}.recipes").format(sql.Identifier(schema)))
    return {str(r[0]) for r in cur.fetchall()}


def insert_parents(
    cur: psycopg.Cursor,
    schema: str,
    parent_records: list[tuple[Any, ...]],
    mode: str,
) -> int:
    if not parent_records:
        return 0

    schema_id = sql.Identifier(schema)

    if mode == "skip":
        stmt = sql.SQL(
            """
            INSERT INTO {}.recipes (
                recipe_id, recipe_name, category_lv1, category_lv2, category_lv3,
                energy_kcal, protein_g, fat_g, carbohydrate_g,
                p_ratio, f_ratio, c_ratio,
                tags, cooking_method, notes,
                source_file, source_batch, qa_status, version
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (recipe_id) DO NOTHING
            """
        ).format(schema_id)
    else:
        stmt = sql.SQL(
            """
            INSERT INTO {}.recipes (
                recipe_id, recipe_name, category_lv1, category_lv2, category_lv3,
                energy_kcal, protein_g, fat_g, carbohydrate_g,
                p_ratio, f_ratio, c_ratio,
                tags, cooking_method, notes,
                source_file, source_batch, qa_status, version
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (recipe_id) DO UPDATE SET
                recipe_name = EXCLUDED.recipe_name,
                category_lv1 = EXCLUDED.category_lv1,
                category_lv2 = EXCLUDED.category_lv2,
                category_lv3 = EXCLUDED.category_lv3,
                energy_kcal = EXCLUDED.energy_kcal,
                protein_g = EXCLUDED.protein_g,
                fat_g = EXCLUDED.fat_g,
                carbohydrate_g = EXCLUDED.carbohydrate_g,
                p_ratio = EXCLUDED.p_ratio,
                f_ratio = EXCLUDED.f_ratio,
                c_ratio = EXCLUDED.c_ratio,
                tags = EXCLUDED.tags,
                cooking_method = EXCLUDED.cooking_method,
                notes = EXCLUDED.notes,
                source_file = EXCLUDED.source_file,
                source_batch = EXCLUDED.source_batch,
                qa_status = EXCLUDED.qa_status,
                version = EXCLUDED.version,
                updated_at = NOW()
            """
        ).format(schema_id)

    inserted = 0
    for rec in parent_records:
        cur.execute(stmt, rec)
        inserted += cur.rowcount
    return inserted


def insert_ingredients(cur: psycopg.Cursor, schema: str, records: list[tuple[Any, ...]]) -> int:
    if not records:
        return 0

    stmt = sql.SQL(
        """
        INSERT INTO {}.recipe_ingredients (
            recipe_id, line_no, ingredient_name, ingredient_alias,
            food_id, process, weight_g, amount_value, unit, notes, source_file, source_batch, qa_status, version
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (recipe_id, line_no) DO NOTHING
        """
    ).format(sql.Identifier(schema))

    inserted = 0
    for rec in records:
        cur.execute(stmt, rec)
        inserted += cur.rowcount
    return inserted


def insert_steps(cur: psycopg.Cursor, schema: str, records: list[tuple[Any, ...]]) -> int:
    if not records:
        return 0

    stmt = sql.SQL(
        """
        INSERT INTO {}.recipe_steps (
            recipe_id, step_number, instruction,
            source_file, source_batch, qa_status, version
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (recipe_id, step_number) DO NOTHING
        """
    ).format(sql.Identifier(schema))

    inserted = 0
    for rec in records:
        cur.execute(stmt, rec)
        inserted += cur.rowcount
    return inserted


def delete_children_for_recipe_ids(cur: psycopg.Cursor, schema: str, recipe_ids: list[str]) -> dict[str, int]:
    if not recipe_ids:
        return {"recipe_ingredients": 0, "recipe_steps": 0}

    unique_recipe_ids = sorted(set(recipe_ids))

    cur.execute(
        sql.SQL("DELETE FROM {}.recipe_ingredients WHERE recipe_id = ANY(%s)").format(sql.Identifier(schema)),
        (unique_recipe_ids,),
    )
    deleted_ingredients = int(cur.rowcount)

    cur.execute(
        sql.SQL("DELETE FROM {}.recipe_steps WHERE recipe_id = ANY(%s)").format(sql.Identifier(schema)),
        (unique_recipe_ids,),
    )
    deleted_steps = int(cur.rowcount)

    return {"recipe_ingredients": deleted_ingredients, "recipe_steps": deleted_steps}


def orphan_counts(cur: psycopg.Cursor, schema: str) -> dict[str, int]:
    out: dict[str, int] = {}
    cur.execute(
        sql.SQL(
            """
            SELECT COUNT(*)
            FROM {}.recipe_ingredients ri
            LEFT JOIN {}.recipes r ON r.recipe_id = ri.recipe_id
            WHERE r.recipe_id IS NULL
            """
        ).format(sql.Identifier(schema), sql.Identifier(schema))
    )
    out["recipe_ingredients_orphans"] = int(cur.fetchone()[0])

    cur.execute(
        sql.SQL(
            """
            SELECT COUNT(*)
            FROM {}.recipe_steps rs
            LEFT JOIN {}.recipes r ON r.recipe_id = rs.recipe_id
            WHERE r.recipe_id IS NULL
            """
        ).format(sql.Identifier(schema), sql.Identifier(schema))
    )
    out["recipe_steps_orphans"] = int(cur.fetchone()[0])
    return out


def duplicate_counts(cur: psycopg.Cursor, schema: str) -> dict[str, int]:
    out: dict[str, int] = {}
    cur.execute(
        sql.SQL(
            """
            SELECT COUNT(*)
            FROM (
                SELECT recipe_id, line_no
                FROM {}.recipe_ingredients
                GROUP BY recipe_id, line_no
                HAVING COUNT(*) > 1
            ) d
            """
        ).format(sql.Identifier(schema))
    )
    out["recipe_ingredients_duplicate_keys"] = int(cur.fetchone()[0])

    cur.execute(
        sql.SQL(
            """
            SELECT COUNT(*)
            FROM (
                SELECT recipe_id, step_number
                FROM {}.recipe_steps
                GROUP BY recipe_id, step_number
                HAVING COUNT(*) > 1
            ) d
            """
        ).format(sql.Identifier(schema))
    )
    out["recipe_steps_duplicate_keys"] = int(cur.fetchone()[0])
    return out


def sample_checks(cur: psycopg.Cursor, schema: str, recipe_ids: list[str], limit: int = 5) -> list[dict[str, Any]]:
    details: list[dict[str, Any]] = []
    for rid in recipe_ids[:limit]:
        cur.execute(
            sql.SQL("SELECT COUNT(*) FROM {}.recipe_ingredients WHERE recipe_id = %s").format(sql.Identifier(schema)),
            (rid,),
        )
        ing_count = int(cur.fetchone()[0])

        cur.execute(
            sql.SQL("SELECT COUNT(*) FROM {}.recipe_steps WHERE recipe_id = %s").format(sql.Identifier(schema)),
            (rid,),
        )
        step_count = int(cur.fetchone()[0])

        details.append(
            {
                "recipe_id": rid,
                "ingredients_count": ing_count,
                "steps_count": step_count,
                "ok": ing_count > 0 and step_count > 0,
            }
        )
    return details


def write_report(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    args = parse_args()
    if args.parent_existing_mode == "update":
        print(
            "[WARN] --parent-existing-mode update is a legacy compatibility mode and outside the formal contract. "
            "Use skip or replace for formal operation. update does NOT guarantee parent-child unit consistency.",
            file=sys.stderr,
        )
    excel_path = Path(args.excel).resolve()
    source_file = excel_path.name
    source_batch = derive_source_batch(source_file)
    password = resolve_password(args.password)

    summary: dict[str, Any] = {
        "started_at_utc": now_utc_iso(),
        "status": "FAILED",
        "excel": str(excel_path),
        "db_target": f"{args.host}:{args.port}/{args.db_name}",
        "schema": args.schema,
        "parent_existing_mode": args.parent_existing_mode,
        "dry_run": bool(args.dry_run),
        "formal_spec": {
            "parent_table": f"{args.schema}.recipes",
            "recipe_master_write": "forbidden",
            "children_tables": [f"{args.schema}.recipe_ingredients", f"{args.schema}.recipe_steps"],
            "children_mode": (
                "delete_insert_by_recipe_id"
                if args.parent_existing_mode == "replace"
                else "insert_only"
            ),
            "duplicate_keys": {
                "recipe_ingredients": ["recipe_id", "line_no"],
                "recipe_steps": ["recipe_id", "step_number"],
            },
        },
    }

    try:
        sheets = load_excel(excel_path)
        recipe_records, recipe_stats = prepare_recipes(sheets["Recipes"], source_file, source_batch)
        ingredient_records, ingredient_stats = prepare_ingredients(sheets["Ingredients"], source_file, source_batch)
        step_records, step_stats = prepare_steps(sheets["Steps"], source_file, source_batch)

        summary["prepare_stats"] = {
            "recipes": recipe_stats,
            "recipe_ingredients": ingredient_stats,
            "recipe_steps": step_stats,
        }

        with psycopg.connect(
            host=args.host,
            port=args.port,
            dbname=args.db_name,
            user=args.user,
            password=password,
            autocommit=False,
            options="-c client_encoding=UTF8",
        ) as conn:
            with conn.cursor() as cur:
                before_counts = table_counts(cur, args.schema)
                recipe_ids_before = fetch_recipe_ids(cur, args.schema)

                inserted_parent = insert_parents(cur, args.schema, recipe_records, args.parent_existing_mode)
                deleted_children = {"recipe_ingredients": 0, "recipe_steps": 0}
                if args.parent_existing_mode == "replace":
                    target_recipe_ids = [str(r[0]) for r in recipe_records]
                    deleted_children = delete_children_for_recipe_ids(cur, args.schema, target_recipe_ids)

                recipe_ids_after_parent = fetch_recipe_ids(cur, args.schema)
                child_ids = {r[0] for r in ingredient_records} | {r[0] for r in step_records}
                missing_parent_ids = sorted(list(child_ids - recipe_ids_after_parent))
                if missing_parent_ids:
                    raise ImportErrorWithContext(
                        "Parent keys missing in public.recipes before child inserts: "
                        f"count={len(missing_parent_ids)}, sample={missing_parent_ids[:20]}"
                    )

                inserted_ingredients = insert_ingredients(cur, args.schema, ingredient_records)
                inserted_steps = insert_steps(cur, args.schema, step_records)

                after_counts_tx = table_counts(cur, args.schema)
                recipe_ids_after = fetch_recipe_ids(cur, args.schema)

                added_recipe_ids = sorted(list(recipe_ids_after - recipe_ids_before))
                sample_input_ids = [r[0] for r in recipe_records]
                sample_unique_ids: list[str] = []
                seen: set[str] = set()
                for rid in sample_input_ids:
                    if rid not in seen:
                        seen.add(rid)
                        sample_unique_ids.append(rid)

                sample_result = sample_checks(cur, args.schema, sample_unique_ids, limit=5)
                orphan_result = orphan_counts(cur, args.schema)
                dup_result = duplicate_counts(cur, args.schema)

                summary.update(
                    {
                        "before_counts": before_counts,
                        "after_counts_in_tx": after_counts_tx,
                        "delta_in_tx": {
                            "recipes": after_counts_tx["recipes"] - before_counts["recipes"],
                            "recipe_ingredients": after_counts_tx["recipe_ingredients"] - before_counts["recipe_ingredients"],
                            "recipe_steps": after_counts_tx["recipe_steps"] - before_counts["recipe_steps"],
                        },
                        "insert_counts": {
                            "recipes": inserted_parent,
                            "recipe_ingredients": inserted_ingredients,
                            "recipe_steps": inserted_steps,
                        },
                        "deleted_children_counts": deleted_children,
                        "added_recipe_ids": added_recipe_ids,
                        "sample_check_result": {
                            "sample_size": len(sample_result),
                            "details": sample_result,
                            "all_ok": all(x["ok"] for x in sample_result) if sample_result else True,
                        },
                        "orphan_check_result": orphan_result,
                        "duplicate_check_result": dup_result,
                    }
                )

            if args.dry_run:
                conn.rollback()
                summary["status"] = "DRY_RUN_SUCCESS"
                summary["dry_run_rolled_back"] = True
            else:
                conn.commit()
                summary["status"] = "SUCCESS"
                summary["dry_run_rolled_back"] = False

        summary["finished_at_utc"] = now_utc_iso()

        if args.report:
            write_report(Path(args.report), summary)
            print(f"[INFO] Report written: {args.report}")

        print(f"[SUCCESS] {summary['status']}")
        print(f"[SUMMARY] insert_counts={summary['insert_counts']}")
        print(f"[SUMMARY] delta_in_tx={summary['delta_in_tx']}")
        print(f"[SUMMARY] orphan_check_result={summary['orphan_check_result']}")
        print(f"[SUMMARY] duplicate_check_result={summary['duplicate_check_result']}")
        return 0

    except Exception as exc:
        summary["finished_at_utc"] = now_utc_iso()
        summary["status"] = "FAILED"
        summary["error"] = str(exc)
        summary["traceback"] = traceback.format_exc()

        if args.report:
            write_report(Path(args.report), summary)
            print(f"[INFO] Failure report written: {args.report}")

        print(f"[ERROR] Import failed: {exc}")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
