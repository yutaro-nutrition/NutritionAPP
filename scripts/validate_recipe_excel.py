#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

PHASE_1 = "PHASE_1_STRUCTURE"
PHASE_2 = "PHASE_2_VALUE"
PHASE_3 = "PHASE_3_UNIQUENESS"
PHASE_4 = "PHASE_4_REFERENCE"

EXPECTED_SHEETS = ["Recipes", "Ingredients", "Steps"]
EXPECTED_COLUMNS = {
    "Recipes": ["Recipe_ID", "Recipe_Name", "Category_Code", "Servings", "Tags"],
    "Ingredients": [
        "Recipe_ID",
        "Ingredient_No",
        "Food_ID",
        "Ingredient_Name",
        "Amount_Value",
        "Unit",
        "Process_Code",
    ],
    "Steps": ["Recipe_ID", "Step_No", "Instruction"],
}

ALLOWED_CATEGORY_CODE = {
    "rice",
    "noodle",
    "main_dish",
    "side_dish",
    "soup",
    "snack",
    "drink",
    "dessert",
}
ALLOWED_TAGS = {
    "breakfast",
    "lunch",
    "dinner",
    "snack_time",
    "lunchbox",
    "pre_game",
    "post_game",
    "weight_gain",
    "weight_loss",
    "recovery",
    "high_protein",
    "high_carb",
    "iron_focus",
    "calcium_focus",
    "quick",
    "low_cost",
}
ALLOWED_PROCESS_CODE = {"RAW", "BOIL", "STEAM", "GRILL", "FRY", "SAUTE", "MICROWAVE", "BAKE"}
ALLOWED_UNIT = {"g", "ml"}

ERROR_CLASS_PRIORITY = {
    "STRUCTURE_ERROR": 0,
    "VALUE_ERROR": 1,
    "UNIQUENESS_ERROR": 2,
    "REFERENCE_ERROR": 3,
}

REQUIRED_NON_BLANK_COLUMNS = {
    "Recipes": ["Recipe_ID", "Recipe_Name", "Category_Code", "Servings", "Tags"],
    "Ingredients": ["Recipe_ID", "Ingredient_No", "Food_ID", "Ingredient_Name", "Amount_Value", "Unit", "Process_Code"],
    "Steps": ["Recipe_ID", "Step_No", "Instruction"],
}


@dataclass
class ValidationError:
    phase: str
    error_class: str
    error_code: str
    sheet_name: str | None
    row: int | None
    column: str | None
    message: str
    severity: str = "ERROR"
    is_first_failure: bool = False
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "phase": self.phase,
            "error_class": self.error_class,
            "error_code": self.error_code,
            "sheet_name": self.sheet_name,
            "row": self.row,
            "column": self.column,
            "message": self.message,
            "severity": self.severity,
            "is_first_failure": self.is_first_failure,
            "details": self.details,
        }


def _excel_row(index_zero_based: int) -> int:
    return index_zero_based + 2


def _is_blank(v: Any) -> bool:
    return pd.isna(v) or (isinstance(v, str) and v.strip() == "")


def _as_trimmed_string(v: Any) -> str:
    if isinstance(v, str):
        return v.strip()
    return str(v).strip()


def _is_positive_integer(v: Any) -> bool:
    if isinstance(v, bool):
        return False
    if isinstance(v, int):
        return v > 0
    if isinstance(v, float):
        return v.is_integer() and v > 0
    if isinstance(v, str):
        s = v.strip()
        if s.isdigit():
            return int(s) > 0
    return False


def _to_positive_integer(v: Any) -> int | None:
    if not _is_positive_integer(v):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    return int(str(v).strip())


def _is_positive_number(v: Any) -> bool:
    if isinstance(v, bool):
        return False
    if isinstance(v, (int, float)):
        return v > 0
    if isinstance(v, str):
        s = v.strip()
        try:
            return float(s) > 0
        except ValueError:
            return False
    return False


class Validator:
    def __init__(self, path: Path):
        self.path = path
        self.sheets: dict[str, pd.DataFrame] = {}
        self.sheet_order: list[str] = []
        self.errors: list[ValidationError] = []
        self.executed_phases: list[str] = []
        self.skipped_phases: list[str] = []

    def add_error(
        self,
        *,
        phase: str,
        error_class: str,
        error_code: str,
        sheet_name: str | None,
        row: int | None,
        column: str | None,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.errors.append(
            ValidationError(
                phase=phase,
                error_class=error_class,
                error_code=error_code,
                sheet_name=sheet_name,
                row=row,
                column=column,
                message=message,
                details=details or {},
            )
        )

    def _has_errors_in_phase(self, phase: str) -> bool:
        return any(e.phase == phase for e in self.errors)

    def _load(self) -> None:
        if not self.path.exists():
            self.add_error(
                phase=PHASE_1,
                error_class="STRUCTURE_ERROR",
                error_code="FILE_NOT_FOUND",
                sheet_name=None,
                row=None,
                column=None,
                message=f"Excel file not found: {self.path}",
            )
            return
        try:
            self.sheets = pd.read_excel(self.path, sheet_name=None, dtype=object, engine="openpyxl")
            self.sheet_order = list(self.sheets.keys())
        except Exception as exc:
            self.add_error(
                phase=PHASE_1,
                error_class="STRUCTURE_ERROR",
                error_code="EXCEL_READ_ERROR",
                sheet_name=None,
                row=None,
                column=None,
                message=f"Failed to read Excel: {exc}",
            )

    def _phase1_structure(self) -> None:
        self.executed_phases.append(PHASE_1)
        actual_set = set(self.sheet_order)
        expected_set = set(EXPECTED_SHEETS)

        if len(self.sheet_order) != len(EXPECTED_SHEETS):
            self.add_error(
                phase=PHASE_1,
                error_class="STRUCTURE_ERROR",
                error_code="SHEET_COUNT_MISMATCH",
                sheet_name=None,
                row=None,
                column=None,
                message=f"Workbook must contain exactly 3 sheets: {EXPECTED_SHEETS}.",
                details={"actual_sheet_names": self.sheet_order},
            )

        missing = sorted(expected_set - actual_set)
        if missing:
            self.add_error(
                phase=PHASE_1,
                error_class="STRUCTURE_ERROR",
                error_code="MISSING_REQUIRED_SHEET",
                sheet_name=None,
                row=None,
                column=None,
                message="Required sheet is missing.",
                details={"missing_sheets": missing},
            )

        unexpected = sorted(actual_set - expected_set)
        if unexpected:
            self.add_error(
                phase=PHASE_1,
                error_class="STRUCTURE_ERROR",
                error_code="UNEXPECTED_SHEET",
                sheet_name=None,
                row=None,
                column=None,
                message="Unexpected sheet exists.",
                details={"unexpected_sheets": unexpected},
            )

        for sheet in EXPECTED_SHEETS:
            if sheet not in self.sheets:
                continue
            actual_cols = [str(c) for c in self.sheets[sheet].columns]
            expected_cols = EXPECTED_COLUMNS[sheet]

            if actual_cols != expected_cols:
                self.add_error(
                    phase=PHASE_1,
                    error_class="STRUCTURE_ERROR",
                    error_code="COLUMN_ORDER_OR_NAME_MISMATCH",
                    sheet_name=sheet,
                    row=1,
                    column=None,
                    message="Header columns must match canonical spec exactly in both names and order.",
                    details={"expected_columns": expected_cols, "actual_columns": actual_cols},
                )

    def _iter_non_empty_rows(self, sheet_name: str) -> list[tuple[int, pd.Series]]:
        df = self.sheets[sheet_name]
        rows: list[tuple[int, pd.Series]] = []
        for idx, row in df.iterrows():
            if all(_is_blank(v) for v in row.tolist()):
                continue
            rows.append((idx, row))
        return rows

    def _phase2_value(self) -> None:
        self.executed_phases.append(PHASE_2)

        for sheet_name, columns in REQUIRED_NON_BLANK_COLUMNS.items():
            for idx, row in self._iter_non_empty_rows(sheet_name):
                for col in columns:
                    if _is_blank(row[col]):
                        self.add_error(
                            phase=PHASE_2,
                            error_class="VALUE_ERROR",
                            error_code="REQUIRED_VALUE_MISSING",
                            sheet_name=sheet_name,
                            row=_excel_row(idx),
                            column=col,
                            message=f"{col} must not be blank.",
                        )

        for idx, row in self._iter_non_empty_rows("Recipes"):
            servings = row["Servings"]
            if not _is_blank(servings) and not _is_positive_integer(servings):
                self.add_error(
                    phase=PHASE_2,
                    error_class="VALUE_ERROR",
                    error_code="INVALID_SERVINGS",
                    sheet_name="Recipes",
                    row=_excel_row(idx),
                    column="Servings",
                    message="Servings must be a positive integer.",
                    details={"value": servings},
                )

            category_code = row["Category_Code"]
            if not _is_blank(category_code):
                cc = _as_trimmed_string(category_code)
                if cc not in ALLOWED_CATEGORY_CODE:
                    self.add_error(
                        phase=PHASE_2,
                        error_class="VALUE_ERROR",
                        error_code="INVALID_CATEGORY_CODE",
                        sheet_name="Recipes",
                        row=_excel_row(idx),
                        column="Category_Code",
                        message="Category_Code is not in allowed values.",
                        details={"value": cc},
                    )

            tags_raw = row["Tags"]
            if not _is_blank(tags_raw):
                tag_parts = [part.strip() for part in str(tags_raw).split("|")]
                if any(part == "" for part in tag_parts):
                    self.add_error(
                        phase=PHASE_2,
                        error_class="VALUE_ERROR",
                        error_code="INVALID_TAG_DELIMITER",
                        sheet_name="Recipes",
                        row=_excel_row(idx),
                        column="Tags",
                        message="Tags must be pipe-delimited values without empty segments.",
                        details={"value": tags_raw},
                    )
                    continue

                if not (1 <= len(tag_parts) <= 5):
                    self.add_error(
                        phase=PHASE_2,
                        error_class="VALUE_ERROR",
                        error_code="INVALID_TAG_COUNT",
                        sheet_name="Recipes",
                        row=_excel_row(idx),
                        column="Tags",
                        message="Tags must contain between 1 and 5 values.",
                        details={"count": len(tag_parts)},
                    )

                seen_tags: set[str] = set()
                for tag in tag_parts:
                    if tag in seen_tags:
                        self.add_error(
                            phase=PHASE_2,
                            error_class="VALUE_ERROR",
                            error_code="DUPLICATE_TAG",
                            sheet_name="Recipes",
                            row=_excel_row(idx),
                            column="Tags",
                            message="Tags must not contain duplicate values.",
                            details={"tag": tag},
                        )
                    seen_tags.add(tag)
                    if tag not in ALLOWED_TAGS:
                        self.add_error(
                            phase=PHASE_2,
                            error_class="VALUE_ERROR",
                            error_code="INVALID_TAG_VALUE",
                            sheet_name="Recipes",
                            row=_excel_row(idx),
                            column="Tags",
                            message="Tag is not in allowed values.",
                            details={"tag": tag},
                        )

        for idx, row in self._iter_non_empty_rows("Ingredients"):
            ing_no = row["Ingredient_No"]
            if not _is_blank(ing_no) and not _is_positive_integer(ing_no):
                self.add_error(
                    phase=PHASE_2,
                    error_class="VALUE_ERROR",
                    error_code="INVALID_INGREDIENT_NO",
                    sheet_name="Ingredients",
                    row=_excel_row(idx),
                    column="Ingredient_No",
                    message="Ingredient_No must be a positive integer.",
                    details={"value": ing_no},
                )

            amount = row["Amount_Value"]
            if not _is_blank(amount) and not _is_positive_number(amount):
                self.add_error(
                    phase=PHASE_2,
                    error_class="VALUE_ERROR",
                    error_code="INVALID_AMOUNT_VALUE",
                    sheet_name="Ingredients",
                    row=_excel_row(idx),
                    column="Amount_Value",
                    message="Amount_Value must be a positive number.",
                    details={"value": amount},
                )

            unit = row["Unit"]
            if not _is_blank(unit):
                u = _as_trimmed_string(unit)
                if u == "㎖":
                    self.add_error(
                        phase=PHASE_2,
                        error_class="VALUE_ERROR",
                        error_code="INVALID_UNIT_CHARACTER",
                        sheet_name="Ingredients",
                        row=_excel_row(idx),
                        column="Unit",
                        message="Unit must use 'ml' and must not use '㎖'.",
                        details={"value": u},
                    )
                elif u not in ALLOWED_UNIT:
                    self.add_error(
                        phase=PHASE_2,
                        error_class="VALUE_ERROR",
                        error_code="INVALID_UNIT",
                        sheet_name="Ingredients",
                        row=_excel_row(idx),
                        column="Unit",
                        message="Unit must be either 'g' or 'ml'.",
                        details={"value": u},
                    )

            process_code = row["Process_Code"]
            if not _is_blank(process_code):
                p = _as_trimmed_string(process_code)
                if p not in ALLOWED_PROCESS_CODE:
                    self.add_error(
                        phase=PHASE_2,
                        error_class="VALUE_ERROR",
                        error_code="INVALID_PROCESS_CODE",
                        sheet_name="Ingredients",
                        row=_excel_row(idx),
                        column="Process_Code",
                        message="Process_Code is not in allowed values.",
                        details={"value": p},
                    )

        for idx, row in self._iter_non_empty_rows("Steps"):
            step_no = row["Step_No"]
            if not _is_blank(step_no) and not _is_positive_integer(step_no):
                self.add_error(
                    phase=PHASE_2,
                    error_class="VALUE_ERROR",
                    error_code="INVALID_STEP_NO",
                    sheet_name="Steps",
                    row=_excel_row(idx),
                    column="Step_No",
                    message="Step_No must be a positive integer.",
                    details={"value": step_no},
                )

    def _phase3_uniqueness(self) -> None:
        self.executed_phases.append(PHASE_3)

        recipes_keys: dict[str, int] = {}
        for idx, row in self._iter_non_empty_rows("Recipes"):
            rid = row["Recipe_ID"]
            if _is_blank(rid):
                continue
            rid_s = _as_trimmed_string(rid)
            if rid_s in recipes_keys:
                self.add_error(
                    phase=PHASE_3,
                    error_class="UNIQUENESS_ERROR",
                    error_code="DUPLICATE_RECIPE_ID",
                    sheet_name="Recipes",
                    row=_excel_row(idx),
                    column="Recipe_ID",
                    message="Recipe_ID must be unique in Recipes.",
                    details={"recipe_id": rid_s, "first_seen_row": _excel_row(recipes_keys[rid_s])},
                )
            else:
                recipes_keys[rid_s] = idx

        ing_pairs: dict[tuple[str, int], int] = {}
        for idx, row in self._iter_non_empty_rows("Ingredients"):
            rid = row["Recipe_ID"]
            no = _to_positive_integer(row["Ingredient_No"])
            if _is_blank(rid) or no is None:
                continue
            key = (_as_trimmed_string(rid), no)
            if key in ing_pairs:
                self.add_error(
                    phase=PHASE_3,
                    error_class="UNIQUENESS_ERROR",
                    error_code="DUPLICATE_INGREDIENT_KEY",
                    sheet_name="Ingredients",
                    row=_excel_row(idx),
                    column="Ingredient_No",
                    message="(Recipe_ID, Ingredient_No) must be unique in Ingredients.",
                    details={"recipe_id": key[0], "ingredient_no": key[1], "first_seen_row": _excel_row(ing_pairs[key])},
                )
            else:
                ing_pairs[key] = idx

        step_pairs: dict[tuple[str, int], int] = {}
        for idx, row in self._iter_non_empty_rows("Steps"):
            rid = row["Recipe_ID"]
            no = _to_positive_integer(row["Step_No"])
            if _is_blank(rid) or no is None:
                continue
            key = (_as_trimmed_string(rid), no)
            if key in step_pairs:
                self.add_error(
                    phase=PHASE_3,
                    error_class="UNIQUENESS_ERROR",
                    error_code="DUPLICATE_STEP_KEY",
                    sheet_name="Steps",
                    row=_excel_row(idx),
                    column="Step_No",
                    message="(Recipe_ID, Step_No) must be unique in Steps.",
                    details={"recipe_id": key[0], "step_no": key[1], "first_seen_row": _excel_row(step_pairs[key])},
                )
            else:
                step_pairs[key] = idx

    def _phase4_reference(self) -> None:
        self.executed_phases.append(PHASE_4)

        recipe_ids: set[str] = set()
        for _, row in self._iter_non_empty_rows("Recipes"):
            rid = row["Recipe_ID"]
            if _is_blank(rid):
                continue
            recipe_ids.add(_as_trimmed_string(rid))

        for idx, row in self._iter_non_empty_rows("Ingredients"):
            rid = row["Recipe_ID"]
            if _is_blank(rid):
                continue
            rid_s = _as_trimmed_string(rid)
            if rid_s not in recipe_ids:
                self.add_error(
                    phase=PHASE_4,
                    error_class="REFERENCE_ERROR",
                    error_code="INGREDIENT_RECIPE_ID_NOT_FOUND",
                    sheet_name="Ingredients",
                    row=_excel_row(idx),
                    column="Recipe_ID",
                    message="Ingredients.Recipe_ID must exist in Recipes.Recipe_ID.",
                    details={"recipe_id": rid_s},
                )

        for idx, row in self._iter_non_empty_rows("Steps"):
            rid = row["Recipe_ID"]
            if _is_blank(rid):
                continue
            rid_s = _as_trimmed_string(rid)
            if rid_s not in recipe_ids:
                self.add_error(
                    phase=PHASE_4,
                    error_class="REFERENCE_ERROR",
                    error_code="STEP_RECIPE_ID_NOT_FOUND",
                    sheet_name="Steps",
                    row=_excel_row(idx),
                    column="Recipe_ID",
                    message="Steps.Recipe_ID must exist in Recipes.Recipe_ID.",
                    details={"recipe_id": rid_s},
                )

    def _mark_first_failure(self) -> ValidationError | None:
        if not self.errors:
            return None

        indexed = list(enumerate(self.errors))
        indexed.sort(
            key=lambda pair: (
                ERROR_CLASS_PRIORITY.get(pair[1].error_class, 99),
                pair[0],
            )
        )
        first_idx, _ = indexed[0]
        self.errors[first_idx].is_first_failure = True
        return self.errors[first_idx]

    def run(self) -> dict[str, Any]:
        self._load()
        if self._has_errors_in_phase(PHASE_1):
            self.executed_phases.append(PHASE_1)
            self.skipped_phases.extend([PHASE_2, PHASE_3, PHASE_4])
            first = self._mark_first_failure()
            return self.result(first)

        self._phase1_structure()
        if self._has_errors_in_phase(PHASE_1):
            self.skipped_phases.extend([PHASE_2, PHASE_3, PHASE_4])
            first = self._mark_first_failure()
            return self.result(first)

        self._phase2_value()
        self._phase3_uniqueness()
        self._phase4_reference()

        first = self._mark_first_failure()
        return self.result(first)

    def result(self, first_failure: ValidationError | None) -> dict[str, Any]:
        all_errors = [e.to_dict() for e in self.errors]
        status = "failed" if all_errors else "passed"
        return {
            "status": status,
            "excel_file": str(self.path),
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "phase_execution": {
                "executed_phases": self.executed_phases,
                "skipped_phases": self.skipped_phases,
            },
            "first_failure": first_failure.to_dict() if first_failure else None,
            "all_errors": all_errors,
            "summary": {
                "error_count": len(all_errors),
                "warning_count": 0,
                "total_issue_count": len(all_errors),
                "first_failure_error_class": first_failure.error_class if first_failure else None,
            },
            "errors": all_errors,
            "warnings": [],
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate recipe Excel against canonical spec v1.0")
    parser.add_argument("excel_path", help="Path to .xlsx")
    parser.add_argument("--json", action="store_true", help="Print JSON result")
    parser.add_argument("--output", help="Write JSON result to file")
    parser.add_argument("--fail-on-warning", action="store_true", help="Reserved for compatibility")
    return parser.parse_args()


def print_human(res: dict[str, Any]) -> None:
    summary = res["summary"]
    print(f"[RESULT] status={res['status']}")
    print(f"[RESULT] errors={summary['error_count']} warnings={summary['warning_count']}")
    if res.get("first_failure"):
        ff = res["first_failure"]
        print(
            "[FIRST_FAILURE] "
            f"{ff['error_class']} {ff['error_code']} "
            f"sheet={ff.get('sheet_name')} row={ff.get('row')} column={ff.get('column')}"
        )
    if res["all_errors"]:
        print(f"[ERRORS] {len(res['all_errors'])} issue(s)")
        for e in res["all_errors"][:50]:
            print(
                f"- {e['error_class']} {e['error_code']}: {e['message']} "
                f"(phase={e['phase']}, sheet={e.get('sheet_name')}, row={e.get('row')}, column={e.get('column')})"
            )


def main() -> int:
    args = parse_args()
    result = Validator(Path(args.excel_path)).run()
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.json:
        print(json.dumps(result, ensure_ascii=True, indent=2))
    else:
        print_human(result)
    if result["summary"]["error_count"] > 0:
        return 1
    if args.fail_on_warning and result["summary"]["warning_count"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
