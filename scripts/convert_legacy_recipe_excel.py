
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

EXCEL_ERROR_TOKENS = {"#N/A", "#VALUE!", "#REF!", "#DIV/0!", "#NAME?", "#NULL!", "#NUM!"}

REQUIRED_COLUMNS = {
    "Recipes": [
        "Recipe_ID", "Recipe_Name", "Category", "Subcategory", "Serving_Size",
        "Yield_Flag", "Retention_Flag", "Total_Time_Min", "Version", "Is_Active",
        "Energy_kcal", "Protein_g", "Fat_g", "Carbohydrate_g",
    ],
    "Ingredients": [
        "Recipe_ID", "Ingredient_No", "Ingredient_Name", "Amount", "Unit", "Net_Weight_g", "Optional_Flag",
    ],
    "Steps": ["Recipe_ID", "Step_No", "Step_Text"],
}

OPTIONAL_COLUMNS = {
    "Recipes": [
        "Meal_Type", "Total_Weight_Before_Cooking_g", "Total_Weight_After_Cooking_g", "Cooking_Method",
        "Prep_Time_Min", "Cook_Time_Min", "Difficulty", "Cost_Estimate_JPY", "Athlete_Tag_List",
        "General_Tag_List", "Timing_Tag_List", "Purpose_Tag_List", "Allergy_Tag_List", "Description", "Notes", "Source",
    ],
    "Ingredients": [
        "Food_ID", "Ingredient_Display_Name", "Gross_Weight_g", "Preparation_State", "Process",
        "Yield_Rate_Applied", "Retention_Rule_Applied", "Substitute_Group", "Notes",
    ],
    "Steps": ["Step_Title", "Step_Time_Min", "Heat_Level", "Cooking_Method", "Notes"],
}

RECIPE_ALIASES = {
    "Recipe_ID": ["Recipe_ID", "recipe_id"],
    "Recipe_Name": ["Recipe_Name", "recipe_name"],
    "Category": ["Category", "category", "category_lv1"],
    "Subcategory": ["Subcategory", "subcategory", "category_lv2"],
    "Serving_Size": ["Serving_Size", "serving_size"],
    "Yield_Flag": ["Yield_Flag", "yield_flag"],
    "Retention_Flag": ["Retention_Flag", "retention_flag"],
    "Total_Time_Min": ["Total_Time_Min", "total_time_min", "Cook_Time_Min", "cook_time_min"],
    "Version": ["Version", "version"],
    "Is_Active": ["Is_Active", "is_active"],
    "Energy_kcal": ["Energy_kcal", "Energy(kcal)", "energy_kcal"],
    "Protein_g": ["Protein_g", "Protein(g)", "protein_g"],
    "Fat_g": ["Fat_g", "Fat(g)", "fat_g"],
    "Carbohydrate_g": ["Carbohydrate_g", "Carbohydrate(g)", "carbohydrate_g"],
    "Cooking_Method": ["Cooking_Method", "cooking_method"],
    "Prep_Time_Min": ["Prep_Time_Min", "prep_time_min"],
    "Cook_Time_Min": ["Cook_Time_Min", "cook_time_min"],
    "Difficulty": ["Difficulty", "difficulty"],
    "Cost_Estimate_JPY": ["Cost_Estimate_JPY", "cost_estimate_jpy"],
    "General_Tag_List": ["General_Tag_List", "Tag", "tags", "Tags"],
    "Notes": ["Notes", "Note", "notes"],
    "Source": ["Source", "source_file", "source"],
}

ING_ALIASES = {
    "Recipe_ID": ["Recipe_ID", "recipe_id"],
    "Ingredient_No": ["Ingredient_No", "line_no", "Line_No", "Sort_Order", "sort_order"],
    "Food_ID": ["Food_ID", "Food_Code", "food_id"],
    "Ingredient_Name": ["Ingredient_Name", "Food_Name", "Ingredient_Display", "Ingredient_Display_Name", "ingredient_name"],
    "Ingredient_Display_Name": ["Ingredient_Display_Name", "Ingredient_Display", "Food_Name"],
    "Amount": ["Amount", "Weight(g)", "weight_g", "Edible_Weight_g", "Final_Weight_g"],
    "Unit": ["Unit", "unit"],
    "Gross_Weight_g": ["Gross_Weight_g", "Raw_Weight_g"],
    "Net_Weight_g": ["Net_Weight_g", "Weight(g)", "Edible_Weight_g", "Final_Weight_g"],
    "Optional_Flag": ["Optional_Flag", "optional_flag"],
    "Notes": ["Notes", "Note", "notes"],
}

STEP_ALIASES = {
    "Recipe_ID": ["Recipe_ID", "recipe_id"],
    "Step_No": ["Step_No", "Step_Number", "step_number", "step_no"],
    "Step_Text": ["Step_Text", "Instruction", "Step_Description", "instruction"],
    "Step_Title": ["Step_Title", "title"],
    "Step_Time_Min": ["Step_Time_Min", "step_time_min"],
    "Cooking_Method": ["Cooking_Method", "cooking_method"],
    "Notes": ["Notes", "Note", "notes"],
}

NUMERIC_COLUMNS = {
    ("Recipes", "Serving_Size"), ("Recipes", "Total_Time_Min"), ("Recipes", "Prep_Time_Min"), ("Recipes", "Cook_Time_Min"),
    ("Recipes", "Cost_Estimate_JPY"), ("Recipes", "Energy_kcal"), ("Recipes", "Protein_g"), ("Recipes", "Fat_g"),
    ("Recipes", "Carbohydrate_g"), ("Recipes", "Total_Weight_Before_Cooking_g"), ("Recipes", "Total_Weight_After_Cooking_g"),
    ("Ingredients", "Ingredient_No"), ("Ingredients", "Amount"), ("Ingredients", "Gross_Weight_g"), ("Ingredients", "Net_Weight_g"),
    ("Ingredients", "Optional_Flag"), ("Steps", "Step_No"), ("Steps", "Step_Time_Min"),
}


@dataclass
class Issue:
    level: str
    code: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"level": self.level, "code": self.code, "message": self.message, "details": self.details}


def is_null(v: Any) -> bool:
    return pd.isna(v)


def clean_value(v: Any) -> Any:
    if isinstance(v, str):
        t = v.strip()
        if t in EXCEL_ERROR_TOKENS:
            return None
    return v


def normalize_header(name: str) -> str:
    return "".join(ch.lower() for ch in str(name) if ch.isalnum())


def find_column(df: pd.DataFrame, aliases: list[str]) -> str | None:
    cols = [str(c) for c in df.columns]
    norm = {normalize_header(c): c for c in cols}
    for a in aliases:
        key = normalize_header(a)
        if key in norm:
            return norm[key]
    return None


def infer_category_subcategory(file_stem: str, recipe_id: str | None = None) -> tuple[str, str]:
    token = (recipe_id or "").upper()
    name = file_stem.lower()
    if token.startswith(("RICE_", "UDON_", "SOBA_", "RAMEN_", "BREAD_", "DONBURI_")):
        if token.startswith("RICE_"):
            return "主食", "ごはん"
        if token.startswith("UDON_"):
            return "主食", "うどん"
        if token.startswith("SOBA_"):
            return "主食", "そば"
        if token.startswith("RAMEN_"):
            return "主食", "ラーメン"
        if token.startswith("BREAD_"):
            return "主食", "パン"
        return "主食", "丼"
    if token.startswith("MAIN_"):
        return "主菜", "主菜"
    if token.startswith("SIDE_"):
        return "副菜", "副菜"
    if token.startswith("SOUP_"):
        return "汁物", "汁物"
    if token.startswith("DESSERT_"):
        return "デザート", "デザート"

    if "udon" in name:
        return "主食", "うどん"
    if "soba" in name:
        return "主食", "そば"
    if "ramen" in name:
        return "主食", "ラーメン"
    if "bread" in name:
        return "主食", "パン"
    if "donburi" in name:
        return "主食", "丼"
    if "main" in name:
        return "主菜", "主菜"
    if "side" in name:
        return "副菜", "副菜"
    if "soup" in name:
        return "汁物", "汁物"
    if "dessert" in name:
        return "デザート", "デザート"
    if "snack" in name:
        return "補食", "補食"
    return "補食", "未分類"


class Converter:
    def __init__(self, input_path: Path, output_path: Path, run_validate: bool):
        self.input_path = input_path
        self.output_path = output_path
        self.run_validate = run_validate
        self.issues: list[Issue] = []
        self.map_log: dict[str, dict[str, str]] = {"Recipes": {}, "Ingredients": {}, "Steps": {}}

    def add(self, level: str, code: str, message: str, **details: Any) -> None:
        self.issues.append(Issue(level, code, message, details))

    def load(self) -> dict[str, pd.DataFrame] | None:
        if not self.input_path.exists():
            self.add("ERROR", "C001_INPUT_NOT_FOUND", "Input file does not exist.", input=str(self.input_path))
            return None
        try:
            wb = pd.read_excel(self.input_path, sheet_name=None, dtype=object, engine="openpyxl")
            for name, df in list(wb.items()):
                wb[name] = df.apply(lambda col: col.map(clean_value))
            return wb
        except Exception as exc:
            self.add("ERROR", "C002_READ_ERROR", "Failed to read input workbook.", error=str(exc))
            return None

    def convert(self) -> dict[str, Any]:
        wb = self.load()
        if wb is None:
            return self.report("failed")

        recipes_src = wb.get("Recipes") if "Recipes" in wb else wb.get("Recipe_Master")
        if recipes_src is None:
            self.add("ERROR", "C003_MISSING_RECIPES_SOURCE", "Recipes/Recipe_Master sheet is required.")
            return self.report("failed")
        if "Recipe_Master" in wb and "Recipes" not in wb:
            self.add("WARN", "C101_SHEET_RENAMED", "Sheet Recipe_Master was converted to Recipes.")

        ingredients_src = wb.get("Ingredients")
        steps_src = wb.get("Steps")
        if ingredients_src is None:
            self.add("ERROR", "C004_MISSING_INGREDIENTS_SOURCE", "Ingredients sheet is required.")
        if steps_src is None:
            self.add("ERROR", "C005_MISSING_STEPS_SOURCE", "Steps sheet is required.")
        if any(i.level == "ERROR" for i in self.issues):
            return self.report("failed")

        recipes = self._convert_sheet(recipes_src, "Recipes", REQUIRED_COLUMNS["Recipes"] + OPTIONAL_COLUMNS["Recipes"], RECIPE_ALIASES)
        ingredients = self._convert_sheet(ingredients_src, "Ingredients", REQUIRED_COLUMNS["Ingredients"] + OPTIONAL_COLUMNS["Ingredients"], ING_ALIASES)
        steps = self._convert_sheet(steps_src, "Steps", REQUIRED_COLUMNS["Steps"] + OPTIONAL_COLUMNS["Steps"], STEP_ALIASES)

        self._fill_recipe_defaults(recipes)
        self._fill_ingredient_defaults(ingredients)
        self._fill_step_defaults(steps)
        self._sanitize_recipes(recipes)
        self._sanitize_ingredients(ingredients)
        self._coerce_numeric(recipes, "Recipes")
        self._coerce_numeric(ingredients, "Ingredients")
        self._coerce_numeric(steps, "Steps")

        if any(i.level == "ERROR" for i in self.issues):
            return self.report("failed")

        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        with pd.ExcelWriter(self.output_path, engine="openpyxl") as writer:
            recipes.to_excel(writer, sheet_name="Recipes", index=False)
            ingredients.to_excel(writer, sheet_name="Ingredients", index=False)
            steps.to_excel(writer, sheet_name="Steps", index=False)

        validation_result = None
        if self.run_validate:
            validation_result = self._run_validator()
            if validation_result and validation_result.get("status") == "failed":
                self.add("ERROR", "C900_VALIDATION_FAILED", "Converted workbook failed canonical validation.")

        status = "success"
        if any(i.level == "ERROR" for i in self.issues):
            status = "failed"
        elif any(i.level == "WARN" for i in self.issues):
            status = "success_with_warnings"

        return self.report(status, validation_result)

    def _convert_sheet(self, src: pd.DataFrame, sheet_name: str, columns: list[str], aliases: dict[str, list[str]]) -> pd.DataFrame:
        out = pd.DataFrame(index=src.index)
        for c in columns:
            out[c] = None

        for canonical, cand in aliases.items():
            src_col = find_column(src, cand)
            if src_col is not None and canonical in out.columns:
                out[canonical] = src[src_col]
                self.map_log[sheet_name][canonical] = src_col

        for c in columns:
            if c not in self.map_log[sheet_name]:
                self.add("WARN", "C102_COLUMN_FILLED_DEFAULT", "Column not found in source and filled by default.", sheet=sheet_name, column=c)

        return out

    def _fill_recipe_defaults(self, df: pd.DataFrame) -> None:
        stem = self.input_path.stem
        allowed_category = {"主食", "主菜", "副菜", "汁物", "デザート", "補食"}
        for idx, row in df.iterrows():
            rid = row.get("Recipe_ID")
            cat, sub = infer_category_subcategory(stem, None if is_null(rid) else str(rid).strip())
            raw_cat = row.get("Category")
            if is_null(raw_cat) or str(raw_cat).strip() == "" or str(raw_cat).strip() not in allowed_category:
                df.at[idx, "Category"] = cat
            if is_null(row.get("Subcategory")) or str(row.get("Subcategory")).strip() == "":
                df.at[idx, "Subcategory"] = sub

        defaults = {
            "Serving_Size": 1.0,
            "Yield_Flag": 0,
            "Retention_Flag": 0,
            "Total_Time_Min": 0,
            "Version": "v1.0",
            "Is_Active": 1,
            "Energy_kcal": 0.0,
            "Protein_g": 0.0,
            "Fat_g": 0.0,
            "Carbohydrate_g": 0.0,
        }
        for col, val in defaults.items():
            missing = df[col].isna()
            if missing.any():
                df.loc[missing, col] = val

        missing_id = df["Recipe_ID"].isna() | (df["Recipe_ID"].astype(str).str.strip() == "")
        if missing_id.any():
            self.add("ERROR", "C201_RECIPE_ID_MISSING", "Recipe_ID cannot be derived for some rows.", rows=(missing_id[missing_id].index + 2).tolist()[:50])

        missing_name = df["Recipe_Name"].isna() | (df["Recipe_Name"].astype(str).str.strip() == "")
        if missing_name.any():
            self.add("ERROR", "C202_RECIPE_NAME_MISSING", "Recipe_Name cannot be derived for some rows.", rows=(missing_name[missing_name].index + 2).tolist()[:50])

    def _sanitize_recipes(self, df: pd.DataFrame) -> None:
        allowed_cooking = {"boil", "steam", "grill", "fry", "stir_fry", "bake", "raw", "microwave", "other"}
        allowed_diff = {"easy", "normal", "hard"}
        if "Cooking_Method" in df.columns:
            bad = df["Cooking_Method"].notna() & ~df["Cooking_Method"].astype(str).str.strip().isin(allowed_cooking)
            if bad.any():
                df.loc[bad, "Cooking_Method"] = None
                self.add("WARN", "C107_COOKING_METHOD_CLEARED", "Unknown Cooking_Method values were cleared.", rows=(bad[bad].index + 2).tolist()[:50])
        if "Difficulty" in df.columns:
            bad = df["Difficulty"].notna() & ~df["Difficulty"].astype(str).str.strip().isin(allowed_diff)
            if bad.any():
                df.loc[bad, "Difficulty"] = None
                self.add("WARN", "C108_DIFFICULTY_CLEARED", "Unknown Difficulty values were cleared.", rows=(bad[bad].index + 2).tolist()[:50])
        if "General_Tag_List" in df.columns:
            def sanitize_tags(v: Any) -> Any:
                if is_null(v):
                    return None
                allowed = {
                    "recovery_support", "performance_focus", "pre_game", "post_game", "breakfast", "lunch", "dinner", "snack",
                    "bulking", "cutting", "maintenance", "high_protein", "low_fat", "high_carb", "easy_digest", "iron_support",
                    "calcium_support", "high_fiber_caution", "spicy_caution", "egg", "milk", "wheat", "shrimp", "crab",
                    "peanut", "buckwheat", "quick_energy", "light_meal", "batch_cook",
                }
                tags = [x.strip() for x in str(v).split(",") if x.strip()]
                tags = [t for t in tags if t in allowed]
                return ",".join(tags) if tags else None
            old = df["General_Tag_List"].copy()
            df["General_Tag_List"] = df["General_Tag_List"].map(sanitize_tags)
            changed = old.notna() & df["General_Tag_List"].isna()
            if changed.any():
                self.add("WARN", "C109_TAGS_CLEARED", "Unmapped legacy tags were cleared.", rows=(changed[changed].index + 2).tolist()[:50])

    def _fill_ingredient_defaults(self, df: pd.DataFrame) -> None:
        if "Unit" in df.columns:
            missing = df["Unit"].isna() | (df["Unit"].astype(str).str.strip() == "")
            if missing.any():
                df.loc[missing, "Unit"] = "g"
                self.add("WARN", "C103_UNIT_DEFAULTED", "Unit defaulted to g.", rows=(missing[missing].index + 2).tolist()[:50])

        if "Optional_Flag" in df.columns:
            missing = df["Optional_Flag"].isna()
            if missing.any():
                df.loc[missing, "Optional_Flag"] = 0

        if "Amount" in df.columns and "Net_Weight_g" in df.columns:
            missing_amount = df["Amount"].isna() & df["Net_Weight_g"].notna()
            if missing_amount.any():
                df.loc[missing_amount, "Amount"] = df.loc[missing_amount, "Net_Weight_g"]
                self.add("WARN", "C104_AMOUNT_FROM_NET_WEIGHT", "Amount derived from Net_Weight_g.", rows=(missing_amount[missing_amount].index + 2).tolist()[:50])

        if "Net_Weight_g" in df.columns and "Amount" in df.columns:
            missing_net = df["Net_Weight_g"].isna() & df["Amount"].notna()
            if missing_net.any():
                df.loc[missing_net, "Net_Weight_g"] = df.loc[missing_net, "Amount"]

        if "Ingredient_No" in df.columns and "Recipe_ID" in df.columns:
            need_seq = df["Ingredient_No"].isna()
            if need_seq.any():
                for rid, grp in df.groupby(df["Recipe_ID"].astype(str)):
                    idxs = grp.index.tolist()
                    seq = list(range(1, len(idxs) + 1))
                    for i, no in zip(idxs, seq):
                        if pd.isna(df.at[i, "Ingredient_No"]):
                            df.at[i, "Ingredient_No"] = no
                self.add("WARN", "C105_INGREDIENT_NO_RESEQUENCED", "Ingredient_No was resequenced for missing rows.")

        missing_name = df["Ingredient_Name"].isna() | (df["Ingredient_Name"].astype(str).str.strip() == "")
        if missing_name.any():
            self.add("ERROR", "C203_INGREDIENT_NAME_MISSING", "Ingredient_Name cannot be derived for some rows.", rows=(missing_name[missing_name].index + 2).tolist()[:50])

    def _sanitize_ingredients(self, df: pd.DataFrame) -> None:
        if "Food_ID" in df.columns:
            df["Food_ID"] = df["Food_ID"].astype(object)
            converted_rows: list[int] = []
            cleared_rows: list[int] = []
            for idx, v in df["Food_ID"].items():
                if is_null(v):
                    continue
                s = str(v).strip()
                if s == "":
                    df.at[idx, "Food_ID"] = None
                    continue
                if s.startswith("F") and s[1:].isdigit() and 3 <= len(s[1:]) <= 8:
                    continue
                digits = "".join(ch for ch in s if ch.isdigit())
                if digits and 3 <= len(digits) <= 8:
                    df.at[idx, "Food_ID"] = f"F{digits}"
                    converted_rows.append(idx + 2)
                else:
                    df.at[idx, "Food_ID"] = None
                    cleared_rows.append(idx + 2)
            if converted_rows:
                self.add("WARN", "C110_FOOD_ID_NORMALIZED", "Legacy Food_ID values were normalized.", rows=converted_rows[:50])
            if cleared_rows:
                self.add("WARN", "C111_FOOD_ID_CLEARED", "Invalid Food_ID values were cleared.", rows=cleared_rows[:50])

    def _fill_step_defaults(self, df: pd.DataFrame) -> None:
        if "Step_No" in df.columns and "Recipe_ID" in df.columns:
            need_seq = df["Step_No"].isna()
            if need_seq.any():
                for rid, grp in df.groupby(df["Recipe_ID"].astype(str)):
                    idxs = grp.index.tolist()
                    seq = list(range(1, len(idxs) + 1))
                    for i, no in zip(idxs, seq):
                        if pd.isna(df.at[i, "Step_No"]):
                            df.at[i, "Step_No"] = no
                self.add("WARN", "C106_STEP_NO_RESEQUENCED", "Step_No was resequenced for missing rows.")

        missing_text = df["Step_Text"].isna() | (df["Step_Text"].astype(str).str.strip() == "")
        if missing_text.any():
            self.add("ERROR", "C204_STEP_TEXT_MISSING", "Step_Text cannot be derived for some rows.", rows=(missing_text[missing_text].index + 2).tolist()[:50])

    def _coerce_numeric(self, df: pd.DataFrame, sheet: str) -> None:
        for col in df.columns:
            if (sheet, col) in NUMERIC_COLUMNS:
                df[col] = pd.to_numeric(df[col], errors="coerce")

    def _run_validator(self) -> dict[str, Any] | None:
        validator = Path(__file__).resolve().parent / "validate_recipe_excel.py"
        cmd = [sys.executable, str(validator), str(self.output_path), "--json"]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if not proc.stdout.strip():
                self.add("ERROR", "C901_VALIDATOR_NO_OUTPUT", "Validator did not return JSON output.", stderr=proc.stderr)
                return None
            data = json.loads(proc.stdout)
            return data
        except Exception as exc:
            self.add("ERROR", "C902_VALIDATOR_EXEC_ERROR", "Failed to run validator.", error=str(exc))
            return None

    def report(self, status: str, validation_result: dict[str, Any] | None = None) -> dict[str, Any]:
        errors = [i.to_dict() for i in self.issues if i.level == "ERROR"]
        warnings = [i.to_dict() for i in self.issues if i.level == "WARN"]
        return {
            "status": status,
            "input": str(self.input_path),
            "output": str(self.output_path),
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "summary": {"error_count": len(errors), "warning_count": len(warnings)},
            "column_mapping": self.map_log,
            "errors": errors,
            "warnings": warnings,
            "validation": validation_result,
        }

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Convert legacy Recipe_Master workbook into Canonical workbook")
    p.add_argument("input", help="Input legacy xlsx path")
    p.add_argument("--output", help="Output canonical xlsx path")
    p.add_argument("--validate", action="store_true", help="Run validate_recipe_excel.py against converted file")
    p.add_argument("--json", action="store_true", help="Print JSON report")
    return p.parse_args()


def print_human(report: dict[str, Any]) -> None:
    print(f"[CONVERT] status={report['status']}")
    print(f"[CONVERT] input={report['input']}")
    print(f"[CONVERT] output={report['output']}")
    print(f"[CONVERT] errors={report['summary']['error_count']} warnings={report['summary']['warning_count']}")
    if report["errors"]:
        print("[ERRORS]")
        for e in report["errors"][:50]:
            print(f"- {e['code']}: {e['message']}")
    if report["warnings"]:
        print("[WARNINGS]")
        for w in report["warnings"][:50]:
            print(f"- {w['code']}: {w['message']}")
    if report.get("validation"):
        v = report["validation"]
        print(f"[VALIDATION] status={v.get('status')} errors={v.get('summary', {}).get('error_count')} warnings={v.get('summary', {}).get('warning_count')}")


def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else input_path.with_name(f"{input_path.stem}_canonical.xlsx")

    converter = Converter(input_path, output_path, args.validate)
    report = converter.convert()

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_human(report)

    if report["status"] == "failed":
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

