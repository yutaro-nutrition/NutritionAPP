from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from fnmatch import fnmatch
from pathlib import Path
from typing import Any

import pandas as pd

from normalize_recipe_fields import (
    AliasMaster,
    normalize_ingredients_df,
    normalize_recipe_master_df,
    normalize_steps_df,
)

REQUIRED_SHEETS = ["Ingredients", "Steps", "Recipe_Master"]
REQUIRED_COLUMNS = {
    "Ingredients": ["Recipe_ID", "Ingredient_Name", "Weight(g)", "Notes"],
    "Steps": ["Recipe_ID", "Step_Number", "Instruction"],
    "Recipe_Master": [
        "Recipe_ID",
        "Recipe_Name",
        "Energy(kcal)",
        "Protein(g)",
        "Fat(g)",
        "Carbohydrate(g)",
        "P_ratio",
        "F_ratio",
        "C_ratio",
        "Tag",
        "Cooking_Method",
        "Notes",
    ],
}

MASTER_COLUMNS = [
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
class CategoryMapping:
    file_pattern: str
    category_lv1: str
    category_lv2: str
    default_batch: str
    default_version: str


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_category_master(path: Path) -> list[CategoryMapping]:
    df = pd.read_csv(path, dtype=str).fillna("")
    mappings: list[CategoryMapping] = []
    required = ["file_pattern", "category_lv1", "category_lv2", "default_batch", "default_version"]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"category master missing columns: {missing}")
    for _, row in df.iterrows():
        mappings.append(
            CategoryMapping(
                file_pattern=str(row["file_pattern"]).strip(),
                category_lv1=str(row["category_lv1"]).strip(),
                category_lv2=str(row["category_lv2"]).strip(),
                default_batch=str(row["default_batch"]).strip(),
                default_version=str(row["default_version"]).strip(),
            )
        )
    return mappings


def find_category_mapping(file_name: str, mappings: list[CategoryMapping]) -> CategoryMapping | None:
    for mapping in mappings:
        if fnmatch(file_name, mapping.file_pattern):
            return mapping
    return None


def derive_source_batch(file_name: str, default_batch: str) -> str:
    match = re.search(r"(batch\d+)", file_name, flags=re.IGNORECASE)
    if not match:
        return default_batch
    return match.group(1).lower()


def derive_version(default_version: str, date_str: str) -> str:
    return f"{default_version}_{date_str}"


def read_validation_status(summary_path: Path, validation_dir: Path) -> dict[str, str]:
    status_map: dict[str, str] = {}
    if summary_path.exists():
        data = json.loads(summary_path.read_text(encoding="utf-8"))
        for item in data.get("files", []):
            file_name = Path(item.get("file_name", "")).name
            status = str(item.get("status", "")).strip()
            if file_name and status:
                status_map[file_name] = status

    if validation_dir.exists():
        for report_path in sorted(validation_dir.glob("*_validation.json")):
            if report_path.name == "summary_validation_report.json":
                continue
            try:
                data = json.loads(report_path.read_text(encoding="utf-8"))
            except Exception:
                continue
            file_name = Path(data.get("file_path", "")).name
            if not file_name:
                file_name = str(data.get("metadata", {}).get("target_file_name", "")).strip()
            status = str(data.get("status", "")).strip()
            if file_name and status and file_name not in status_map:
                status_map[file_name] = status
    return status_map


def ensure_required_structure(sheets: dict[str, pd.DataFrame]) -> tuple[bool, str]:
    for sheet_name in REQUIRED_SHEETS:
        if sheet_name not in sheets:
            return False, f"missing required sheet: {sheet_name}"
        missing_cols = [c for c in REQUIRED_COLUMNS[sheet_name] if c not in sheets[sheet_name].columns]
        if missing_cols:
            return False, f"missing required columns in {sheet_name}: {missing_cols}"
    return True, ""


def apply_compat_columns(sheets: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    normalized = {name: df.copy() for name, df in sheets.items()}
    steps = normalized.get("Steps")
    if steps is not None:
        if "Step_Number" not in steps.columns and "Step_No" in steps.columns:
            steps["Step_Number"] = steps["Step_No"]
        if "Instruction" not in steps.columns and "Step_Description" in steps.columns:
            steps["Instruction"] = steps["Step_Description"]
    return normalized


def standardize_recipe_master(
    recipe_master: pd.DataFrame,
    *,
    file_name: str,
    category_lv1: str,
    category_lv2: str,
    source_batch: str,
    qa_status: str,
    version: str,
    run_ts: str,
) -> pd.DataFrame:
    df = recipe_master.rename(
        columns={
            "Recipe_ID": "recipe_id",
            "Recipe_Name": "recipe_name",
            "Energy(kcal)": "energy_kcal",
            "Protein(g)": "protein_g",
            "Fat(g)": "fat_g",
            "Carbohydrate(g)": "carbohydrate_g",
            "P_ratio": "p_ratio",
            "F_ratio": "f_ratio",
            "C_ratio": "c_ratio",
            "Tag": "tags",
            "Cooking_Method": "cooking_method",
            "Notes": "notes",
        }
    ).copy()

    df["category_lv1"] = category_lv1
    df["category_lv2"] = category_lv2
    df["category_lv3"] = ""
    df["source_file"] = file_name
    df["source_batch"] = source_batch
    df["qa_status"] = qa_status
    df["version"] = version
    df["created_at"] = run_ts
    df["updated_at"] = run_ts
    return df[MASTER_COLUMNS]


def standardize_ingredients(
    ingredients: pd.DataFrame,
    *,
    file_name: str,
    source_batch: str,
    qa_status: str,
    version: str,
) -> pd.DataFrame:
    df = ingredients.rename(
        columns={
            "Recipe_ID": "recipe_id",
            "Ingredient_Name": "ingredient_name",
            "Ingredient_Alias": "ingredient_alias",
            "Weight(g)": "weight_g",
            "Notes": "notes",
        }
    ).copy()
    df["line_no"] = df.groupby("recipe_id").cumcount() + 1
    df["source_file"] = file_name
    df["source_batch"] = source_batch
    df["qa_status"] = qa_status
    df["version"] = version
    return df[INGREDIENT_COLUMNS]


def standardize_steps(
    steps: pd.DataFrame,
    *,
    file_name: str,
    source_batch: str,
    qa_status: str,
    version: str,
) -> pd.DataFrame:
    df = steps.rename(columns={"Recipe_ID": "recipe_id", "Step_Number": "step_number", "Instruction": "instruction"}).copy()
    df["source_file"] = file_name
    df["source_batch"] = source_batch
    df["qa_status"] = qa_status
    df["version"] = version
    return df[STEP_COLUMNS]


def calc_blank_rate(df: pd.DataFrame, column: str) -> float:
    if df.empty:
        return 0.0
    series = df[column].fillna("").astype(str).str.strip()
    return round(float((series == "").mean()), 6)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build integrated recipe DB from category xlsx files.")
    parser.add_argument("--project-root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--input-dir", default="data/generated")
    parser.add_argument("--output-dir", default="output/integrated")
    parser.add_argument("--validation-summary", default="reports/validation/summary_validation_report.json")
    parser.add_argument("--validation-dir", default="reports/validation")
    parser.add_argument("--category-master", default="master/category_master.csv")
    parser.add_argument("--ingredient-alias-master", default="master/ingredient_alias_master.csv")
    parser.add_argument("--include-statuses", default="passed", help="Comma separated qa_status values to include")
    parser.add_argument("--write-parquet", action="store_true", default=True)
    parser.add_argument("--no-parquet", dest="write_parquet", action="store_false")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).resolve()
    input_dir = (project_root / args.input_dir).resolve()
    output_dir = (project_root / args.output_dir).resolve()
    rejected_dir = output_dir / "rejected"
    logs_dir = output_dir / "logs"
    debug_dir = output_dir / "debug"
    validation_summary_path = (project_root / args.validation_summary).resolve()
    validation_dir = (project_root / args.validation_dir).resolve()
    category_master_path = (project_root / args.category_master).resolve()
    alias_master_path = (project_root / args.ingredient_alias_master).resolve()

    output_dir.mkdir(parents=True, exist_ok=True)
    rejected_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)
    debug_dir.mkdir(parents=True, exist_ok=True)

    summary: dict[str, Any] = {
        "scanned_files_count": 0,
        "integrated_files_count": 0,
        "rejected_files_count": 0,
        "integrated_recipe_count": 0,
        "integrated_ingredient_rows": 0,
        "integrated_step_rows": 0,
        "duplicated_recipe_id_count": 0,
        "missing_category_mapping_files": [],
        "rejected_files": [],
        "qa_status_breakdown": {},
        "tag_blank_rate": 0.0,
        "notes_blank_rate": 0.0,
        "cooking_method_blank_rate": 0.0,
        "duplicate_recipe_name_category_pairs": [],
        "generated_at_utc": utc_now_iso(),
    }

    if not input_dir.exists():
        summary["fatal_error"] = f"input directory not found: {input_dir}"
        (output_dir / "integration_summary_report.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(summary["fatal_error"])
        return 1

    missing_prerequisites: list[str] = []
    if not category_master_path.exists():
        missing_prerequisites.append(str(category_master_path))
    if not alias_master_path.exists():
        missing_prerequisites.append(str(alias_master_path))
    if missing_prerequisites:
        summary["fatal_error"] = f"missing prerequisite files: {missing_prerequisites}"
        (output_dir / "integration_summary_report.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(summary["fatal_error"])
        return 1

    try:
        category_mappings = load_category_master(category_master_path)
    except Exception as exc:
        summary["fatal_error"] = f"failed to read category master: {exc}"
        (output_dir / "integration_summary_report.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(summary["fatal_error"])
        return 1

    alias_master = AliasMaster.from_csv(alias_master_path)
    qa_status_map = read_validation_status(validation_summary_path, validation_dir)
    include_statuses = [s.strip() for s in args.include_statuses.split(",") if s.strip()]
    run_ts = utc_now_iso()
    run_date = datetime.now(timezone.utc).strftime("%Y%m%d")

    master_frames: list[pd.DataFrame] = []
    ingredient_frames: list[pd.DataFrame] = []
    step_frames: list[pd.DataFrame] = []
    rejected_master_frames: list[pd.DataFrame] = []
    rejected_ingredient_frames: list[pd.DataFrame] = []
    rejected_step_frames: list[pd.DataFrame] = []

    all_files = sorted(input_dir.glob("recipe_db_*.xlsx"))
    summary["scanned_files_count"] = len(all_files)
    if not all_files:
        summary["fatal_error"] = f"no target files found in {input_dir}"
        (output_dir / "integration_summary_report.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(summary["fatal_error"])
        return 1

    for xlsx_path in all_files:
        file_name = xlsx_path.name
        mapping = find_category_mapping(file_name, category_mappings)
        if mapping is None:
            summary["missing_category_mapping_files"].append(file_name)
            summary["rejected_files"].append(
                {
                    "file_name": file_name,
                    "reason": "category_master_mapping_not_found",
                    "qa_status": "",
                }
            )
            continue

        qa_status = qa_status_map.get(file_name, "")
        if not qa_status:
            qa_status = "manual_review"
            summary["rejected_files"].append(
                {"file_name": file_name, "reason": "qa_status_not_found", "qa_status": qa_status}
            )
        summary["qa_status_breakdown"][qa_status] = summary["qa_status_breakdown"].get(qa_status, 0) + 1

        try:
            sheets = pd.read_excel(xlsx_path, sheet_name=None, engine="openpyxl")
        except Exception as exc:
            summary["rejected_files"].append(
                {"file_name": file_name, "reason": f"excel_read_error: {exc}", "qa_status": qa_status}
            )
            continue
        sheets = apply_compat_columns(sheets)

        ok, reason = ensure_required_structure(sheets)
        if not ok:
            summary["rejected_files"].append({"file_name": file_name, "reason": reason, "qa_status": qa_status})
            continue

        source_batch = derive_source_batch(file_name, mapping.default_batch)
        version = derive_version(mapping.default_version, run_date)

        normalized_master = normalize_recipe_master_df(sheets["Recipe_Master"])
        normalized_ingredients = normalize_ingredients_df(sheets["Ingredients"], alias_master=alias_master)
        normalized_steps = normalize_steps_df(sheets["Steps"])

        standardized_master = standardize_recipe_master(
            normalized_master,
            file_name=file_name,
            category_lv1=mapping.category_lv1,
            category_lv2=mapping.category_lv2,
            source_batch=source_batch,
            qa_status=qa_status,
            version=version,
            run_ts=run_ts,
        )
        standardized_ingredients = standardize_ingredients(
            normalized_ingredients,
            file_name=file_name,
            source_batch=source_batch,
            qa_status=qa_status,
            version=version,
        )
        standardized_steps = standardize_steps(
            normalized_steps,
            file_name=file_name,
            source_batch=source_batch,
            qa_status=qa_status,
            version=version,
        )

        if qa_status in include_statuses:
            master_frames.append(standardized_master)
            ingredient_frames.append(standardized_ingredients)
            step_frames.append(standardized_steps)
            summary["integrated_files_count"] += 1
        else:
            rejected_master = standardized_master.copy()
            rejected_master["rejected_reason"] = f"qa_status_{qa_status}"
            rejected_ingredients = standardized_ingredients.copy()
            rejected_ingredients["rejected_reason"] = f"qa_status_{qa_status}"
            rejected_steps = standardized_steps.copy()
            rejected_steps["rejected_reason"] = f"qa_status_{qa_status}"
            rejected_master_frames.append(rejected_master)
            rejected_ingredient_frames.append(rejected_ingredients)
            rejected_step_frames.append(rejected_steps)
            summary["rejected_files"].append(
                {"file_name": file_name, "reason": f"qa_status_not_in_include: {qa_status}", "qa_status": qa_status}
            )

    master_all = pd.concat(master_frames, ignore_index=True) if master_frames else pd.DataFrame(columns=MASTER_COLUMNS)
    ingredients_all = (
        pd.concat(ingredient_frames, ignore_index=True) if ingredient_frames else pd.DataFrame(columns=INGREDIENT_COLUMNS)
    )
    steps_all = pd.concat(step_frames, ignore_index=True) if step_frames else pd.DataFrame(columns=STEP_COLUMNS)

    if not master_all.empty:
        dup_mask = master_all["recipe_id"].astype(str).str.strip().duplicated(keep=False)
        duplicate_ids = sorted(master_all.loc[dup_mask, "recipe_id"].astype(str).unique().tolist())
        summary["duplicated_recipe_id_count"] = len(duplicate_ids)
        if duplicate_ids:
            rejected_dup_master = master_all[dup_mask].copy()
            rejected_dup_master["rejected_reason"] = "duplicate_recipe_id"
            rejected_dup_ing = ingredients_all[ingredients_all["recipe_id"].isin(duplicate_ids)].copy()
            rejected_dup_ing["rejected_reason"] = "duplicate_recipe_id"
            rejected_dup_steps = steps_all[steps_all["recipe_id"].isin(duplicate_ids)].copy()
            rejected_dup_steps["rejected_reason"] = "duplicate_recipe_id"

            rejected_master_frames.append(rejected_dup_master)
            rejected_ingredient_frames.append(rejected_dup_ing)
            rejected_step_frames.append(rejected_dup_steps)

            master_all = master_all[~dup_mask].copy()
            ingredients_all = ingredients_all[~ingredients_all["recipe_id"].isin(duplicate_ids)].copy()
            steps_all = steps_all[~steps_all["recipe_id"].isin(duplicate_ids)].copy()

        pair_counts = (
            master_all.groupby(["recipe_name", "category_lv2"], dropna=False)
            .size()
            .reset_index(name="count")
            .query("count >= 2")
        )
        if not pair_counts.empty:
            summary["duplicate_recipe_name_category_pairs"] = pair_counts.to_dict(orient="records")

    master_all = master_all[MASTER_COLUMNS]
    ingredients_all = ingredients_all[INGREDIENT_COLUMNS]
    steps_all = steps_all[STEP_COLUMNS]

    summary["integrated_recipe_count"] = int(master_all["recipe_id"].nunique()) if not master_all.empty else 0
    summary["integrated_ingredient_rows"] = int(len(ingredients_all))
    summary["integrated_step_rows"] = int(len(steps_all))
    summary["rejected_files_count"] = len(summary["rejected_files"]) + len(summary["missing_category_mapping_files"])
    summary["tag_blank_rate"] = calc_blank_rate(master_all, "tags")
    summary["notes_blank_rate"] = calc_blank_rate(master_all, "notes")
    summary["cooking_method_blank_rate"] = calc_blank_rate(master_all, "cooking_method")

    master_all.to_csv(output_dir / "recipe_master_all.csv", index=False, encoding="utf-8-sig")
    ingredients_all.to_csv(output_dir / "recipe_ingredients_all.csv", index=False, encoding="utf-8-sig")
    steps_all.to_csv(output_dir / "recipe_steps_all.csv", index=False, encoding="utf-8-sig")

    rejected_master_all = (
        pd.concat(rejected_master_frames, ignore_index=True)
        if rejected_master_frames
        else pd.DataFrame(columns=MASTER_COLUMNS + ["rejected_reason"])
    )
    rejected_ingredients_all = (
        pd.concat(rejected_ingredient_frames, ignore_index=True)
        if rejected_ingredient_frames
        else pd.DataFrame(columns=INGREDIENT_COLUMNS + ["rejected_reason"])
    )
    rejected_steps_all = (
        pd.concat(rejected_step_frames, ignore_index=True)
        if rejected_step_frames
        else pd.DataFrame(columns=STEP_COLUMNS + ["rejected_reason"])
    )
    rejected_master_all.to_csv(rejected_dir / "rejected_recipe_master_all.csv", index=False, encoding="utf-8-sig")
    rejected_ingredients_all.to_csv(
        rejected_dir / "rejected_recipe_ingredients_all.csv", index=False, encoding="utf-8-sig"
    )
    rejected_steps_all.to_csv(rejected_dir / "rejected_recipe_steps_all.csv", index=False, encoding="utf-8-sig")
    (rejected_dir / "rejected_files.json").write_text(
        json.dumps(summary["rejected_files"], ensure_ascii=False, indent=2), encoding="utf-8"
    )

    parquet_errors: list[str] = []
    if args.write_parquet:
        try:
            master_all.to_parquet(output_dir / "recipe_master_all.parquet", index=False)
            ingredients_all.to_parquet(output_dir / "recipe_ingredients_all.parquet", index=False)
            steps_all.to_parquet(output_dir / "recipe_steps_all.parquet", index=False)
        except Exception as exc:
            parquet_errors.append(str(exc))
            summary["parquet_write_error"] = str(exc)

    summary["generated_at_utc"] = utc_now_iso()
    (output_dir / "integration_summary_report.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (logs_dir / "integration_log.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"scanned_files_count={summary['scanned_files_count']}")
    print(f"integrated_files_count={summary['integrated_files_count']}")
    print(f"rejected_files_count={summary['rejected_files_count']}")
    print(f"integrated_recipe_count={summary['integrated_recipe_count']}")
    if parquet_errors:
        print(f"parquet_write_error={parquet_errors[0]}")
    print(f"summary_path={output_dir / 'integration_summary_report.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
