from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd

TAG_PRIORITY = [
    "高たんぱく",
    "低脂質",
    "高炭水化物",
    "試合前",
    "試合後",
    "増量期",
    "減量期",
]

COOKING_METHOD_CANDIDATES = [
    "ゆで",
    "煮る",
    "炒める",
    "焼く",
    "蒸す",
    "揚げる",
    "和える",
    "温製",
    "冷製",
    "かける",
]

COOKING_METHOD_KEYWORDS = {
    "ゆで": ["ゆで", "茹で", "ボイル"],
    "煮る": ["煮", "煮る", "煮込み"],
    "炒める": ["炒め", "ソテー"],
    "焼く": ["焼き", "焼く", "グリル", "炙り"],
    "蒸す": ["蒸し", "蒸す"],
    "揚げる": ["揚げ", "フライ"],
    "和える": ["和え", "あえ"],
    "温製": ["温製", "温か", "ホット"],
    "冷製": ["冷製", "冷や", "コールド"],
    "かける": ["かけ", "トッピング"],
}

TAG_SPLIT_PATTERN = re.compile(r"[,\u3001;/|]+")
WHITESPACE_PATTERN = re.compile(r"\s+")


@dataclass(frozen=True)
class AliasMaster:
    raw_to_normalized: dict[str, str]

    @classmethod
    def from_csv(cls, csv_path: str | Path) -> "AliasMaster":
        path = Path(csv_path)
        if not path.exists():
            return cls(raw_to_normalized={})
        df = pd.read_csv(path, dtype=str).fillna("")
        mapping: dict[str, str] = {}
        for _, row in df.iterrows():
            raw = normalize_text(row.get("raw_name", ""))
            normalized = normalize_text(row.get("normalized_name", ""))
            if raw and normalized:
                mapping[raw] = normalized
        return cls(raw_to_normalized=mapping)


def normalize_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    text = str(value)
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\u3000", " ")
    text = WHITESPACE_PATTERN.sub(" ", text).strip()
    return text


def normalize_recipe_name(value: Any) -> str:
    return normalize_text(value)


def normalize_notes(value: Any) -> str:
    return normalize_text(value)


def normalize_cooking_method(value: Any) -> str:
    text = normalize_text(value)
    if not text:
        return ""
    lowered = text.lower()
    for canonical in COOKING_METHOD_CANDIDATES:
        for keyword in COOKING_METHOD_KEYWORDS[canonical]:
            if keyword.lower() in lowered:
                return canonical
    return text


def normalize_tags(value: Any) -> str:
    text = normalize_text(value)
    if not text:
        return ""
    tags = [normalize_text(tag) for tag in TAG_SPLIT_PATTERN.split(text)]
    tags = [t for t in tags if t]
    unique_tags = list(dict.fromkeys(tags))
    ranked = [t for t in TAG_PRIORITY if t in unique_tags]
    others = sorted([t for t in unique_tags if t not in TAG_PRIORITY])
    return ", ".join(ranked + others)


def normalize_ingredient_name(value: Any, alias_master: AliasMaster | None = None) -> tuple[str, str]:
    ingredient = normalize_text(value)
    if not ingredient:
        return "", ""
    if alias_master is None:
        return ingredient, ingredient
    alias = alias_master.raw_to_normalized.get(ingredient, ingredient)
    return ingredient, alias


def to_numeric_series(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def normalize_recipe_master_df(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "Recipe_Name" in out.columns:
        out["Recipe_Name"] = out["Recipe_Name"].map(normalize_recipe_name)
    if "Tag" in out.columns:
        out["Tag"] = out["Tag"].map(normalize_tags)
    if "Cooking_Method" in out.columns:
        out["Cooking_Method"] = out["Cooking_Method"].map(normalize_cooking_method)
    if "Notes" in out.columns:
        out["Notes"] = out["Notes"].map(normalize_notes)
    if "Recipe_ID" in out.columns:
        out["Recipe_ID"] = out["Recipe_ID"].map(normalize_text)

    for col in ["Energy(kcal)", "Protein(g)", "Fat(g)", "Carbohydrate(g)", "P_ratio", "F_ratio", "C_ratio"]:
        if col in out.columns:
            out[col] = to_numeric_series(out[col])
    return out


def normalize_ingredients_df(df: pd.DataFrame, alias_master: AliasMaster | None = None) -> pd.DataFrame:
    out = df.copy()
    if "Recipe_ID" in out.columns:
        out["Recipe_ID"] = out["Recipe_ID"].map(normalize_text)
    if "Ingredient_Name" in out.columns:
        normalized = out["Ingredient_Name"].map(lambda x: normalize_ingredient_name(x, alias_master))
        out["Ingredient_Name"] = normalized.map(lambda x: x[0])
        out["Ingredient_Alias"] = normalized.map(lambda x: x[1])
    else:
        out["Ingredient_Alias"] = ""
    if "Weight(g)" in out.columns:
        out["Weight(g)"] = to_numeric_series(out["Weight(g)"])
    if "Notes" in out.columns:
        out["Notes"] = out["Notes"].map(normalize_notes)
    return out


def normalize_steps_df(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "Recipe_ID" in out.columns:
        out["Recipe_ID"] = out["Recipe_ID"].map(normalize_text)
    if "Step_Number" in out.columns:
        out["Step_Number"] = to_numeric_series(out["Step_Number"])
    if "Instruction" in out.columns:
        out["Instruction"] = out["Instruction"].map(normalize_text)
    return out
