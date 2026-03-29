from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

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

MISSING_REQUIRED_COLUMNS = {
    "Ingredients": ["Recipe_ID", "Ingredient_Name", "Weight(g)"],
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
    ],
}

NUMERIC_COLUMNS = {
    "Ingredients": {"Weight(g)": {"min": 0, "strict_positive": True}},
    "Steps": {"Step_Number": {"min": 1, "integer": True}},
    "Recipe_Master": {
        "Energy(kcal)": {"min": 0},
        "Protein(g)": {"min": 0},
        "Fat(g)": {"min": 0},
        "Carbohydrate(g)": {"min": 0},
        "P_ratio": {"min": 0, "max": 100},
        "F_ratio": {"min": 0, "max": 100},
        "C_ratio": {"min": 0, "max": 100},
    },
}

ABSTRACT_TERMS = ["適量", "少々", "お好み", "ひとつまみ", "適宜"]

CATEGORY_RULES = {
    "udon": {"ingredients_any": ["うどん", "udon"]},
    "soba": {"ingredients_any": ["そば", "蕎麦", "soba"]},
    "ramen": {"ingredients_any": ["ラーメン", "らーめん", "中華麺", "麺", "ramen"]},
    "bread": {
        "ingredients_any": [
            "パン",
            "食パン",
            "バゲット",
            "ロールパン",
            "フランスパン",
            "イングリッシュマフィン",
            "ベーグル",
            "クロワッサン",
            "バンズ",
            "bread",
        ]
    },
    "donburi": {
        "ingredients_any": ["ごはん", "白米", "米", "ライス"],
        "main_any": ["鶏", "豚", "牛", "魚", "卵", "豆腐", "納豆", "鮭", "さば", "ツナ", "肉"],
        "min_protein": 10.0,
    },
    "side_lowprotein": {"protein_max": 5.0},
    "side_protein5": {"protein_min": 4.0, "protein_max_inclusive": 6.5},
    "soup": {
        "name_or_ing_any": ["スープ", "汁", "みそ汁", "味噌汁", "ポタージュ", "吸い物"],
        "energy_max": 350.0,
    },
    "dessert": {
        "name_or_ing_any": ["デザート", "ケーキ", "ゼリー", "プリン", "ヨーグルト", "パフェ", "クッキー", "甘"],
        "forbidden_any": ["ごはん", "白米", "ラーメン", "うどん", "そば", "食パン", "鶏", "豚", "牛", "魚"],
    },
}


@dataclass
class ValidationIssue:
    code: str
    severity: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
            "details": self.details,
        }


def _normalize_text(v: Any) -> str:
    if pd.isna(v):
        return ""
    return str(v).strip()


def _contains_any(text: str, keywords: list[str]) -> bool:
    lowered = text.lower()
    return any(keyword.lower() in lowered for keyword in keywords)


def load_workbook(file_path: str | Path) -> tuple[dict[str, pd.DataFrame], list[ValidationIssue]]:
    path = Path(file_path)
    if not path.exists():
        return {}, [
            ValidationIssue(
                code="FILE_NOT_FOUND",
                severity="error",
                message=f"file not found: {path}",
                details={"file_path": str(path)},
            )
        ]

    try:
        excel_file = pd.ExcelFile(path, engine="openpyxl")
        sheets = {name: excel_file.parse(sheet_name=name) for name in excel_file.sheet_names}
        return sheets, []
    except Exception as exc:
        return {}, [
            ValidationIssue(
                code="FILE_READ_ERROR",
                severity="error",
                message=f"failed to read workbook: {exc}",
                details={"file_path": str(path)},
            )
        ]


def validate_sheet_names(sheets: dict[str, pd.DataFrame]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    actual = list(sheets.keys())
    missing = [s for s in REQUIRED_SHEETS if s not in actual]
    extra = [s for s in actual if s not in REQUIRED_SHEETS]
    if missing:
        issues.append(
            ValidationIssue(
                code="MISSING_SHEETS",
                severity="error",
                message="required sheets are missing",
                details={"missing": missing, "actual": actual},
            )
        )
    if actual != REQUIRED_SHEETS:
        issues.append(
            ValidationIssue(
                code="SHEET_ORDER_MISMATCH",
                severity="error",
                message="sheet order does not match required order",
                details={"expected": REQUIRED_SHEETS, "actual": actual},
            )
        )
    if extra:
        issues.append(
            ValidationIssue(
                code="EXTRA_SHEETS",
                severity="warning",
                message="extra sheets exist",
                details={"extra": extra},
            )
        )
    return issues


def validate_columns(sheets: dict[str, pd.DataFrame]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for sheet_name, required in REQUIRED_COLUMNS.items():
        if sheet_name not in sheets:
            continue
        actual_cols = [str(c) for c in sheets[sheet_name].columns]
        missing = [c for c in required if c not in actual_cols]
        extra = [c for c in actual_cols if c not in required]
        if missing:
            issues.append(
                ValidationIssue(
                    code="MISSING_COLUMNS",
                    severity="error",
                    message=f"required columns are missing in {sheet_name}",
                    details={"sheet": sheet_name, "missing": missing, "actual": actual_cols},
                )
            )
        if actual_cols != required:
            issues.append(
                ValidationIssue(
                    code="COLUMN_ORDER_MISMATCH",
                    severity="error",
                    message=f"column order mismatch in {sheet_name}",
                    details={"sheet": sheet_name, "expected": required, "actual": actual_cols},
                )
            )
        if extra:
            issues.append(
                ValidationIssue(
                    code="EXTRA_COLUMNS",
                    severity="warning",
                    message=f"extra columns in {sheet_name}",
                    details={"sheet": sheet_name, "extra": extra},
                )
            )
    return issues


def validate_missing_values(sheets: dict[str, pd.DataFrame]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for sheet_name, cols in MISSING_REQUIRED_COLUMNS.items():
        if sheet_name not in sheets:
            continue
        df = sheets[sheet_name]
        for col in cols:
            if col not in df.columns:
                continue
            normalized = df[col].map(_normalize_text)
            missing_mask = normalized.eq("") | df[col].isna()
            missing_count = int(missing_mask.sum())
            if missing_count > 0:
                issues.append(
                    ValidationIssue(
                        code="MISSING_VALUES",
                        severity="error",
                        message=f"missing values found in {sheet_name}.{col}",
                        details={
                            "sheet": sheet_name,
                            "column": col,
                            "count": missing_count,
                            "sample_rows": df.index[missing_mask].tolist()[:10],
                        },
                    )
                )
    return issues


def validate_duplicates(sheets: dict[str, pd.DataFrame]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    master = sheets.get("Recipe_Master")
    if master is None:
        return issues

    if "Recipe_ID" in master.columns:
        dup_mask = master["Recipe_ID"].astype(str).str.strip().duplicated(keep=False)
        if dup_mask.any():
            dup_ids = master.loc[dup_mask, "Recipe_ID"].astype(str).str.strip().tolist()
            issues.append(
                ValidationIssue(
                    code="DUPLICATE_RECIPE_ID",
                    severity="error",
                    message="duplicate Recipe_ID in Recipe_Master",
                    details={"count": len(dup_ids), "sample": dup_ids[:20]},
                )
            )

    if "Recipe_Name" in master.columns:
        normalized = master["Recipe_Name"].astype(str).str.strip()
        dup_mask = normalized.duplicated(keep=False)
        if dup_mask.any():
            dup_names = normalized[dup_mask].tolist()
            issues.append(
                ValidationIssue(
                    code="DUPLICATE_RECIPE_NAME",
                    severity="error",
                    message="duplicate Recipe_Name in Recipe_Master",
                    details={"count": len(dup_names), "sample": dup_names[:20]},
                )
            )
    return issues


def validate_cross_refs(sheets: dict[str, pd.DataFrame]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    ingredients = sheets.get("Ingredients")
    steps = sheets.get("Steps")
    master = sheets.get("Recipe_Master")
    if ingredients is None or steps is None or master is None:
        return issues

    master_ids = set(master["Recipe_ID"].astype(str).str.strip())
    ing_ids = set(ingredients["Recipe_ID"].astype(str).str.strip())
    step_ids = set(steps["Recipe_ID"].astype(str).str.strip())

    ing_extra = sorted(ing_ids - master_ids)
    step_extra = sorted(step_ids - master_ids)
    if ing_extra:
        issues.append(
            ValidationIssue(
                code="INGREDIENTS_ID_NOT_IN_MASTER",
                severity="error",
                message="Ingredients contains Recipe_ID not present in Recipe_Master",
                details={"count": len(ing_extra), "sample": ing_extra[:20]},
            )
        )
    if step_extra:
        issues.append(
            ValidationIssue(
                code="STEPS_ID_NOT_IN_MASTER",
                severity="error",
                message="Steps contains Recipe_ID not present in Recipe_Master",
                details={"count": len(step_extra), "sample": step_extra[:20]},
            )
        )

    ing_count = ingredients.groupby(ingredients["Recipe_ID"].astype(str).str.strip()).size()
    step_count = steps.groupby(steps["Recipe_ID"].astype(str).str.strip()).size()
    missing_ing = sorted([rid for rid in master_ids if rid not in ing_count.index])
    missing_steps = sorted([rid for rid in master_ids if rid not in step_count.index])
    if missing_ing:
        issues.append(
            ValidationIssue(
                code="MISSING_INGREDIENTS_FOR_RECIPE",
                severity="error",
                message="some recipes have no Ingredients rows",
                details={"count": len(missing_ing), "sample": missing_ing[:20]},
            )
        )
    if missing_steps:
        issues.append(
            ValidationIssue(
                code="MISSING_STEPS_FOR_RECIPE",
                severity="error",
                message="some recipes have no Steps rows",
                details={"count": len(missing_steps), "sample": missing_steps[:20]},
            )
        )
    return issues


def validate_numeric_types(sheets: dict[str, pd.DataFrame]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for sheet_name, rules in NUMERIC_COLUMNS.items():
        if sheet_name not in sheets:
            continue
        df = sheets[sheet_name]
        for col, rule in rules.items():
            if col not in df.columns:
                continue
            numeric = pd.to_numeric(df[col], errors="coerce")
            invalid_mask = numeric.isna()
            if invalid_mask.any():
                issues.append(
                    ValidationIssue(
                        code="NUMERIC_TYPE_ERROR",
                        severity="error",
                        message=f"non-numeric values in {sheet_name}.{col}",
                        details={"sheet": sheet_name, "column": col, "count": int(invalid_mask.sum())},
                    )
                )
                continue

            if "min" in rule:
                min_val = rule["min"]
                min_mask = numeric <= min_val if rule.get("strict_positive") else numeric < min_val
                if min_mask.any():
                    issues.append(
                        ValidationIssue(
                            code="NUMERIC_MIN_VIOLATION",
                            severity="error",
                            message=f"value below minimum in {sheet_name}.{col}",
                            details={"sheet": sheet_name, "column": col, "count": int(min_mask.sum()), "min": min_val},
                        )
                    )
            if "max" in rule:
                max_mask = numeric > rule["max"]
                if max_mask.any():
                    issues.append(
                        ValidationIssue(
                            code="NUMERIC_MAX_VIOLATION",
                            severity="error",
                            message=f"value above maximum in {sheet_name}.{col}",
                            details={"sheet": sheet_name, "column": col, "count": int(max_mask.sum()), "max": rule["max"]},
                        )
                    )
            if rule.get("integer"):
                int_mask = (numeric % 1) != 0
                if int_mask.any():
                    issues.append(
                        ValidationIssue(
                            code="INTEGER_REQUIRED",
                            severity="error",
                            message=f"non-integer values in {sheet_name}.{col}",
                            details={"sheet": sheet_name, "column": col, "count": int(int_mask.sum())},
                        )
                    )
    return issues


def validate_steps(sheets: dict[str, pd.DataFrame]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    steps = sheets.get("Steps")
    if steps is None or "Recipe_ID" not in steps.columns or "Step_Number" not in steps.columns:
        return issues

    work = steps.copy()
    work["Recipe_ID"] = work["Recipe_ID"].astype(str).str.strip()
    work["Step_Number_num"] = pd.to_numeric(work["Step_Number"], errors="coerce")

    for recipe_id, part in work.groupby("Recipe_ID"):
        nums = part["Step_Number_num"].dropna().astype(int).tolist()
        if not nums:
            issues.append(
                ValidationIssue(
                    code="STEP_EMPTY",
                    severity="error",
                    message="recipe has no valid step numbers",
                    details={"recipe_id": recipe_id},
                )
            )
            continue
        expected = list(range(1, len(nums) + 1))
        actual_sorted = sorted(nums)
        if actual_sorted != expected:
            issues.append(
                ValidationIssue(
                    code="STEP_SEQUENCE_ERROR",
                    severity="error",
                    message="step numbers must be consecutive from 1",
                    details={"recipe_id": recipe_id, "actual_sorted": actual_sorted[:20], "expected_head": expected[:20]},
                )
            )
    return issues


def validate_pfc(sheets: dict[str, pd.DataFrame]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    master = sheets.get("Recipe_Master")
    if master is None:
        return issues

    required = ["Recipe_ID", "Energy(kcal)", "Protein(g)", "Fat(g)", "Carbohydrate(g)", "P_ratio", "F_ratio", "C_ratio"]
    if any(col not in master.columns for col in required):
        return issues

    for _, row in master.iterrows():
        rid = _normalize_text(row["Recipe_ID"])
        p = float(pd.to_numeric(row["Protein(g)"], errors="coerce"))
        f = float(pd.to_numeric(row["Fat(g)"], errors="coerce"))
        c = float(pd.to_numeric(row["Carbohydrate(g)"], errors="coerce"))
        energy = float(pd.to_numeric(row["Energy(kcal)"], errors="coerce"))
        pr = float(pd.to_numeric(row["P_ratio"], errors="coerce"))
        fr = float(pd.to_numeric(row["F_ratio"], errors="coerce"))
        cr = float(pd.to_numeric(row["C_ratio"], errors="coerce"))

        if any(pd.isna(v) for v in [p, f, c, energy, pr, fr, cr]):
            continue

        p_kcal = p * 4
        f_kcal = f * 9
        c_kcal = c * 4
        pfc_energy = p_kcal + f_kcal + c_kcal

        tolerance = max(30.0, energy * 0.20)
        diff = abs(pfc_energy - energy)
        if diff > tolerance:
            issues.append(
                ValidationIssue(
                    code="PFC_ENERGY_MISMATCH",
                    severity="error",
                    message="energy and PFC-derived energy differ too much",
                    details={
                        "recipe_id": rid,
                        "energy": energy,
                        "pfc_energy": round(pfc_energy, 2),
                        "diff": round(diff, 2),
                        "tolerance": round(tolerance, 2),
                    },
                )
            )

        if pfc_energy > 0:
            exp_pr = p_kcal / pfc_energy * 100
            exp_fr = f_kcal / pfc_energy * 100
            exp_cr = c_kcal / pfc_energy * 100
            if abs(pr - exp_pr) > 5.0 or abs(fr - exp_fr) > 5.0 or abs(cr - exp_cr) > 5.0:
                issues.append(
                    ValidationIssue(
                        code="PFC_RATIO_MISMATCH",
                        severity="warning",
                        message="P/F/C ratio values are inconsistent with macro values",
                        details={
                            "recipe_id": rid,
                            "declared": {"P_ratio": pr, "F_ratio": fr, "C_ratio": cr},
                            "expected": {
                                "P_ratio": round(exp_pr, 1),
                                "F_ratio": round(exp_fr, 1),
                                "C_ratio": round(exp_cr, 1),
                            },
                        },
                    )
                )
            if abs((pr + fr + cr) - 100.0) > 3.0:
                issues.append(
                    ValidationIssue(
                        code="PFC_RATIO_SUM_ERROR",
                        severity="warning",
                        message="P/F/C ratio sum is not close to 100",
                        details={"recipe_id": rid, "sum": round(pr + fr + cr, 2)},
                    )
                )
    return issues


def _parse_tags(tag_cell: Any) -> set[str]:
    text = _normalize_text(tag_cell)
    if not text:
        return set()
    separators = [",", "、", ";", "|", "/"]
    for sep in separators[1:]:
        text = text.replace(sep, separators[0])
    return {t.strip() for t in text.split(separators[0]) if t.strip()}


def _is_easy_to_digest(name: str, ingredient_text: str, instruction_text: str) -> bool:
    # "脂" の単語単体は「脂質を控える」説明文にも含まれ誤検知しやすいため除外する。
    hard_keywords = ["揚げ", "フライ", "唐辛子", "激辛", "にんにく", "ガーリック", "こってり", "脂身", "脂っこい"]
    text = f"{name} {ingredient_text} {instruction_text}".lower()
    return not any(k.lower() in text for k in hard_keywords)


def _expected_tags(row: pd.Series, ingredient_text: str, instruction_text: str) -> set[str]:
    p = float(pd.to_numeric(row["Protein(g)"], errors="coerce"))
    f = float(pd.to_numeric(row["Fat(g)"], errors="coerce"))
    c = float(pd.to_numeric(row["Carbohydrate(g)"], errors="coerce"))
    e = float(pd.to_numeric(row["Energy(kcal)"], errors="coerce"))
    name = _normalize_text(row["Recipe_Name"])

    if any(pd.isna(v) for v in [p, f, c, e]):
        return set()

    tags: set[str] = set()
    high_protein = p >= 20.0
    low_fat = f < 10.0
    high_carb = c >= 70.0
    if high_protein:
        tags.add("高たんぱく")
    if low_fat:
        tags.add("低脂質")
    if high_carb:
        tags.add("高炭水化物")
    if high_protein and high_carb:
        tags.add("試合後")
    if e >= 650.0 or f >= 20.0:
        tags.add("増量期")
    if high_protein and low_fat:
        tags.add("減量期")
    if low_fat and _is_easy_to_digest(name, ingredient_text, instruction_text):
        tags.add("試合前")
    return tags


def validate_tags(sheets: dict[str, pd.DataFrame]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    master = sheets.get("Recipe_Master")
    ingredients = sheets.get("Ingredients")
    steps = sheets.get("Steps")
    if master is None or ingredients is None or steps is None:
        return issues

    ing_group = ingredients.copy()
    ing_group["Recipe_ID"] = ing_group["Recipe_ID"].astype(str).str.strip()
    ing_text = (
        ing_group.groupby("Recipe_ID")["Ingredient_Name"]
        .apply(lambda s: " ".join(_normalize_text(v) for v in s.tolist()))
        .to_dict()
    )
    step_group = steps.copy()
    step_group["Recipe_ID"] = step_group["Recipe_ID"].astype(str).str.strip()
    step_text = (
        step_group.groupby("Recipe_ID")["Instruction"]
        .apply(lambda s: " ".join(_normalize_text(v) for v in s.tolist()))
        .to_dict()
    )

    for _, row in master.iterrows():
        rid = _normalize_text(row["Recipe_ID"])
        declared = _parse_tags(row.get("Tag"))
        expected = _expected_tags(row, ing_text.get(rid, ""), step_text.get(rid, ""))
        known = {"高たんぱく", "低脂質", "高炭水化物", "試合後", "増量期", "減量期", "試合前"}

        contradiction = sorted([tag for tag in declared.intersection(known) if tag not in expected])
        missing_recommended = sorted([tag for tag in expected if tag not in declared])
        if contradiction:
            issues.append(
                ValidationIssue(
                    code="TAG_CONTRADICTION",
                    severity="error",
                    message="declared tags contradict nutrition-derived tags",
                    details={"recipe_id": rid, "declared_invalid": contradiction, "declared": sorted(declared), "expected": sorted(expected)},
                )
            )
        if missing_recommended:
            issues.append(
                ValidationIssue(
                    code="TAG_MISSING_RECOMMENDED",
                    severity="warning",
                    message="recommended nutrition-derived tags are missing",
                    details={"recipe_id": rid, "missing": missing_recommended, "declared": sorted(declared)},
                )
            )
    return issues


def validate_category(sheets: dict[str, pd.DataFrame], category: str | None) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if not category:
        return issues
    if category not in CATEGORY_RULES:
        issues.append(
            ValidationIssue(
                code="UNKNOWN_CATEGORY",
                severity="warning",
                message=f"no category rule defined for {category}",
                details={"category": category},
            )
        )
        return issues

    ingredients = sheets.get("Ingredients")
    steps = sheets.get("Steps")
    master = sheets.get("Recipe_Master")
    if ingredients is None or master is None:
        return issues

    ing = ingredients.copy()
    ing["Recipe_ID"] = ing["Recipe_ID"].astype(str).str.strip()
    ing_text_map = (
        ing.groupby("Recipe_ID")["Ingredient_Name"]
        .apply(lambda s: " ".join(_normalize_text(v) for v in s.tolist()))
        .to_dict()
    )
    step_text_map: dict[str, str] = {}
    if steps is not None:
        st = steps.copy()
        st["Recipe_ID"] = st["Recipe_ID"].astype(str).str.strip()
        step_text_map = (
            st.groupby("Recipe_ID")["Instruction"]
            .apply(lambda s: " ".join(_normalize_text(v) for v in s.tolist()))
            .to_dict()
        )

    rule = CATEGORY_RULES[category]
    failed_ids: list[str] = []
    for _, row in master.iterrows():
        rid = _normalize_text(row["Recipe_ID"])
        name = _normalize_text(row.get("Recipe_Name"))
        ing_text = ing_text_map.get(rid, "")
        step_text = step_text_map.get(rid, "")
        merged_text = f"{name} {ing_text} {step_text}"
        protein = float(pd.to_numeric(row.get("Protein(g)"), errors="coerce"))
        energy = float(pd.to_numeric(row.get("Energy(kcal)"), errors="coerce"))

        ok = True
        if "ingredients_any" in rule and not _contains_any(ing_text, rule["ingredients_any"]):
            ok = False
        if "name_or_ing_any" in rule and not _contains_any(merged_text, rule["name_or_ing_any"]):
            ok = False
        if "main_any" in rule:
            has_main = _contains_any(merged_text, rule["main_any"])
            protein_ok = not pd.isna(protein) and protein >= float(rule.get("min_protein", 0))
            if not (has_main or protein_ok):
                ok = False
        if "protein_min" in rule and (pd.isna(protein) or protein < float(rule["protein_min"])):
            ok = False
        if "protein_max" in rule and (pd.isna(protein) or protein >= float(rule["protein_max"])):
            ok = False
        if "protein_max_inclusive" in rule and (pd.isna(protein) or protein > float(rule["protein_max_inclusive"])):
            ok = False
        if "energy_max" in rule and (pd.isna(energy) or energy > float(rule["energy_max"])):
            ok = False
        if "forbidden_any" in rule and _contains_any(merged_text, rule["forbidden_any"]):
            ok = False
        if not ok:
            failed_ids.append(rid)

    if failed_ids:
        issues.append(
            ValidationIssue(
                code="CATEGORY_CONDITION_FAILED",
                severity="error",
                message=f"category condition failed for {category}",
                details={"category": category, "count": len(failed_ids), "sample_recipe_ids": failed_ids[:30]},
            )
        )
    return issues


def validate_recipe_count(sheets: dict[str, pd.DataFrame], expected_count: int | None) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if expected_count is None:
        return issues
    master = sheets.get("Recipe_Master")
    if master is None or "Recipe_ID" not in master.columns:
        return issues
    actual = int(master["Recipe_ID"].astype(str).str.strip().nunique())
    if actual != expected_count:
        severity = "error" if actual < expected_count else "warning"
        issues.append(
            ValidationIssue(
                code="RECIPE_COUNT_MISMATCH",
                severity=severity,
                message="recipe count mismatch",
                details={"expected": expected_count, "actual": actual},
            )
        )
    return issues


def validate_abstract_expressions(sheets: dict[str, pd.DataFrame]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    checks = [("Ingredients", "Ingredient_Name"), ("Ingredients", "Notes"), ("Steps", "Instruction")]
    for sheet_name, col in checks:
        df = sheets.get(sheet_name)
        if df is None or col not in df.columns:
            continue
        text = df[col].map(_normalize_text)
        for term in ABSTRACT_TERMS:
            mask = text.str.contains(term, regex=False)
            if mask.any():
                issues.append(
                    ValidationIssue(
                        code="ABSTRACT_EXPRESSION_FOUND",
                        severity="warning",
                        message=f"abstract expression '{term}' found in {sheet_name}.{col}",
                        details={
                            "sheet": sheet_name,
                            "column": col,
                            "term": term,
                            "count": int(mask.sum()),
                            "sample_rows": df.index[mask].tolist()[:20],
                        },
                    )
                )
    return issues


def _calc_status(issues: list[ValidationIssue]) -> str:
    error_count = sum(1 for i in issues if i.severity == "error")
    warning_count = sum(1 for i in issues if i.severity == "warning")
    if error_count > 0:
        return "failed"
    if warning_count > 0:
        return "manual_review"
    return "passed"


def validate_file(
    file_path: str | Path,
    category: str | None = None,
    expected_count: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    all_issues: list[ValidationIssue] = []
    sheets, load_issues = load_workbook(file_path)
    all_issues.extend(load_issues)

    if not load_issues:
        all_issues.extend(validate_sheet_names(sheets))
        all_issues.extend(validate_columns(sheets))
        all_issues.extend(validate_missing_values(sheets))
        all_issues.extend(validate_duplicates(sheets))
        all_issues.extend(validate_cross_refs(sheets))
        all_issues.extend(validate_numeric_types(sheets))
        all_issues.extend(validate_steps(sheets))
        all_issues.extend(validate_pfc(sheets))
        all_issues.extend(validate_tags(sheets))
        all_issues.extend(validate_category(sheets, category))
        all_issues.extend(validate_recipe_count(sheets, expected_count))
        all_issues.extend(validate_abstract_expressions(sheets))

    status = _calc_status(all_issues)
    result = {
        "file_path": str(file_path),
        "category": category,
        "expected_count": expected_count,
        "status": status,
        "summary": {
            "total_issues": len(all_issues),
            "error_count": sum(1 for i in all_issues if i.severity == "error"),
            "warning_count": sum(1 for i in all_issues if i.severity == "warning"),
            "info_count": sum(1 for i in all_issues if i.severity == "info"),
        },
        "issues": [issue.to_dict() for issue in all_issues],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    if metadata:
        result["metadata"] = metadata
    return result


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate recipe DB xlsx file")
    parser.add_argument("--file", required=True, help="Path to .xlsx file")
    parser.add_argument("--category", default=None, help="Category name for category validation")
    parser.add_argument("--expected-count", type=int, default=None, help="Expected recipe count")
    parser.add_argument("--output", default=None, help="Optional path to save JSON report")
    return parser


def main() -> int:
    parser = _build_arg_parser()
    args = parser.parse_args()

    report = validate_file(args.file, category=args.category, expected_count=args.expected_count)
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"saved: {output_path}")
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] != "failed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
