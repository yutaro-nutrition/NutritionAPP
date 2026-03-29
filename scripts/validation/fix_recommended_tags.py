from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd

TAG_HIGH_PROTEIN = "高たんぱく"
TAG_LOW_FAT = "低脂質"
TAG_HIGH_CARB = "高炭水化物"
TAG_POST_GAME = "試合後"
TAG_BULKING = "増量期"
TAG_CUTTING = "減量期"
TAG_PRE_GAME = "試合前"

HARD_KEYWORDS = ["揚げ", "フライ", "唐辛子", "激辛", "にんにく", "ガーリック", "こってり", "脂身", "脂っこい"]

TARGET_SHEETS = ["Ingredients", "Steps", "Recipe_Master"]


def _normalize_text(v: Any) -> str:
    if pd.isna(v):
        return ""
    return str(v).strip()


def _parse_tags(cell: Any) -> list[str]:
    text = _normalize_text(cell)
    if not text:
        return []
    for sep in ["、", ";", "|", "/"]:
        text = text.replace(sep, ",")
    tags: list[str] = []
    for item in [t.strip() for t in text.split(",") if t.strip()]:
        if set(item) == {"?"}:
            continue
        if item not in tags:
            tags.append(item)
    return tags


def _is_easy_to_digest(name: str, ingredient_text: str, instruction_text: str) -> bool:
    text = f"{name} {ingredient_text} {instruction_text}".lower()
    return not any(k.lower() in text for k in HARD_KEYWORDS)


def _expected_tags(
    name: str,
    protein: float,
    fat: float,
    carb: float,
    energy: float,
    ingredient_text: str,
    instruction_text: str,
) -> list[str]:
    tags: list[str] = []
    high_protein = protein >= 20.0
    low_fat = fat < 10.0
    high_carb = carb >= 70.0

    if high_protein:
        tags.append(TAG_HIGH_PROTEIN)
    if low_fat:
        tags.append(TAG_LOW_FAT)
    if high_carb:
        tags.append(TAG_HIGH_CARB)
    if high_protein and high_carb:
        tags.append(TAG_POST_GAME)
    if energy >= 650.0 or fat >= 20.0:
        tags.append(TAG_BULKING)
    if high_protein and low_fat:
        tags.append(TAG_CUTTING)
    if low_fat and _is_easy_to_digest(name, ingredient_text, instruction_text):
        tags.append(TAG_PRE_GAME)
    return tags


def _collect_text_map(df: pd.DataFrame, id_col: str, value_col: str) -> dict[str, str]:
    work = df.copy()
    work[id_col] = work[id_col].map(_normalize_text)
    return (
        work.groupby(id_col)[value_col]
        .apply(lambda s: " ".join(_normalize_text(v) for v in s.tolist()))
        .to_dict()
    )


def fix_tags_in_workbook(path: Path, write: bool = True) -> dict[str, Any]:
    result: dict[str, Any] = {"file": str(path), "updated_rows": 0, "status": "ok", "message": ""}

    if not path.exists():
        result["status"] = "missing"
        result["message"] = "file not found"
        return result

    xls = pd.ExcelFile(path, engine="openpyxl")
    sheets = {name: xls.parse(name) for name in xls.sheet_names}
    for s in TARGET_SHEETS:
        if s not in sheets:
            result["status"] = "skipped"
            result["message"] = f"required sheet missing: {s}"
            return result

    master = sheets["Recipe_Master"].copy()
    ingredients = sheets["Ingredients"]
    steps = sheets["Steps"]

    required_master_cols = ["Recipe_ID", "Recipe_Name", "Energy(kcal)", "Protein(g)", "Fat(g)", "Carbohydrate(g)", "Tag"]
    if any(col not in master.columns for col in required_master_cols):
        result["status"] = "skipped"
        result["message"] = "required columns missing in Recipe_Master"
        return result

    ing_map = _collect_text_map(ingredients, "Recipe_ID", "Ingredient_Name")
    step_map = _collect_text_map(steps, "Recipe_ID", "Instruction")

    new_tags: list[str] = []
    updated_rows = 0
    for _, row in master.iterrows():
        rid = _normalize_text(row["Recipe_ID"])
        name = _normalize_text(row["Recipe_Name"])
        protein = pd.to_numeric(row["Protein(g)"], errors="coerce")
        fat = pd.to_numeric(row["Fat(g)"], errors="coerce")
        carb = pd.to_numeric(row["Carbohydrate(g)"], errors="coerce")
        energy = pd.to_numeric(row["Energy(kcal)"], errors="coerce")

        declared = _parse_tags(row.get("Tag"))
        expected: list[str] = []
        if not any(pd.isna(v) for v in [protein, fat, carb, energy]):
            expected = _expected_tags(
                name=name,
                protein=float(protein),
                fat=float(fat),
                carb=float(carb),
                energy=float(energy),
                ingredient_text=ing_map.get(rid, ""),
                instruction_text=step_map.get(rid, ""),
            )

        merged = declared[:]
        for tag in expected:
            if tag not in merged:
                merged.append(tag)
        merged = [t for t in merged if set(t) != {"?"}]
        new_tag = ", ".join(merged)
        if _normalize_text(row.get("Tag")) != new_tag:
            updated_rows += 1
        new_tags.append(new_tag)

    master["Tag"] = new_tags
    sheets["Recipe_Master"] = master
    result["updated_rows"] = updated_rows
    result["message"] = "tag normalization completed"

    if write and updated_rows > 0:
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            for sheet_name in xls.sheet_names:
                sheets[sheet_name].to_excel(writer, sheet_name=sheet_name, index=False)

    return result


def _default_targets(input_dir: Path) -> list[Path]:
    return sorted(input_dir.glob("recipe_db_*.xlsx"))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fix/append recommended tags in recipe DB xlsx files")
    parser.add_argument("--input-dir", default="data/generated", help="Directory containing target xlsx files")
    parser.add_argument("--files", nargs="*", default=None, help="Optional specific file names under input-dir")
    parser.add_argument("--dry-run", action="store_true", help="Do not write files, only show what would change")
    parser.add_argument("--report", default="reports/validation/tag_fix_report.json", help="Path for JSON summary report")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    input_dir = Path(args.input_dir)
    if args.files:
        targets = [input_dir / file_name for file_name in args.files]
    else:
        targets = _default_targets(input_dir)

    results = [fix_tags_in_workbook(path=t, write=not args.dry_run) for t in targets]

    summary = {
        "input_dir": str(input_dir),
        "dry_run": bool(args.dry_run),
        "files": results,
        "totals": {
            "target_files": len(results),
            "updated_files": sum(1 for r in results if r["status"] == "ok" and r["updated_rows"] > 0),
            "updated_rows": sum(int(r["updated_rows"]) for r in results if r["status"] == "ok"),
            "missing_files": sum(1 for r in results if r["status"] == "missing"),
            "skipped_files": sum(1 for r in results if r["status"] == "skipped"),
        },
    }

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(summary["totals"], ensure_ascii=False, indent=2))
    print(f"report saved: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
