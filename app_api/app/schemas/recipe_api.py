from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class RecipeSummary(BaseModel):
    recipe_id: str
    recipe_name: str
    category_lv1: str
    category_lv2: str
    category_lv3: str | None = None
    tags: str | None = None
    energy_kcal: float
    protein_g: float
    fat_g: float
    carbohydrate_g: float


class IngredientItem(BaseModel):
    line_no: int
    ingredient_name: str
    ingredient_alias: str | None = None
    weight_g: float | None = None
    notes: str | None = None


class StepItem(BaseModel):
    step_number: int
    instruction: str


class RecipeDetail(RecipeSummary):
    cooking_method: str | None = None
    notes: str | None = None
    ingredients: list[IngredientItem]
    steps: list[StepItem]


class RecipeListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[RecipeSummary]


class MenuRequest(BaseModel):
    target_kcal: float = Field(gt=0)
    target_protein_g: float = Field(ge=0)
    meal_type: str | None = Field(
        default=None,
        description=(
            "Optional meal context. Recommended codes: breakfast|lunch|dinner|snack. "
            "Backward-compatible aliases (e.g., 試合前/試合後) are also accepted."
        ),
    )
    scene: str | None = Field(
        default=None,
        description=(
            "Optional scene context. Recommended codes: pre_game|post_game|bulking|cutting|recovery|normal. "
            "Japanese aliases are also accepted."
        ),
    )
    include_dessert: bool = True


class MenuSlot(BaseModel):
    slot: Literal["staple", "main", "side", "soup", "dessert"]
    recipe: RecipeSummary


class NutritionSummary(BaseModel):
    target_kcal: float
    actual_kcal: float
    kcal_gap: float
    target_protein_g: float
    actual_protein_g: float
    protein_gap: float


class ConstraintEvaluation(BaseModel):
    kcal_match_level: Literal["high", "medium", "low"]
    protein_match_level: Literal["high", "medium", "low"]
    constraint_relaxed: bool


class AppliedConditions(BaseModel):
    scene: str | None = None
    scene_normalized: str | None = None
    meal_type: str | None = None
    meal_type_normalized: str | None = None
    include_dessert: bool


class MenuPattern(BaseModel):
    pattern_no: int
    total_kcal: float
    total_protein_g: float
    kcal_min: float
    kcal_max: float
    protein_target_g: float
    within_kcal_range: bool
    protein_target_met: bool
    nutrition_summary: NutritionSummary
    constraint_evaluation: ConstraintEvaluation
    applied_conditions: AppliedConditions
    generation_note: str
    slots: list[MenuSlot]


class MenuResponse(BaseModel):
    target_kcal: float
    target_protein_g: float
    meal_type: str | None = None
    scene: str | None = None
    patterns: list[MenuPattern]


class ErrorResponse(BaseModel):
    error_code: str
    detail: str | list[dict[str, Any]] | dict[str, Any]


class VocabularyOption(BaseModel):
    code: str
    label_ja: str
    aliases: list[str]


class MetaOptionsResponse(BaseModel):
    meal_type: list[VocabularyOption]
    scene: list[VocabularyOption]
    tags_recommended: dict[str, list[str]]
    notes: list[str]

