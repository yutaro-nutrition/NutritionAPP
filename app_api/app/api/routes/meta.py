from __future__ import annotations

from fastapi import APIRouter

from app.core.vocabulary import MEAL_TYPE_ALIASES, SCENE_ALIASES, TAGS_RECOMMENDED
from app.schemas.recipe_api import MetaOptionsResponse, VocabularyOption

router = APIRouter(prefix="/meta", tags=["meta"])


_MEAL_TYPE_LABELS = {
    "breakfast": "朝食",
    "lunch": "昼食",
    "dinner": "夕食",
    "snack": "補食",
    "pre_game": "試合前（互換）",
    "post_game": "試合後（互換）",
}

_SCENE_LABELS = {
    "pre_game": "試合前",
    "post_game": "試合後",
    "bulking": "増量",
    "cutting": "減量",
    "recovery": "回復",
    "normal": "通常",
}


@router.get("/options", response_model=MetaOptionsResponse)
def get_meta_options() -> MetaOptionsResponse:
    meal_type = [
        VocabularyOption(
            code=code,
            label_ja=_MEAL_TYPE_LABELS.get(code, code),
            aliases=list(aliases),
        )
        for code, aliases in MEAL_TYPE_ALIASES.items()
    ]
    scene = [
        VocabularyOption(
            code=code,
            label_ja=_SCENE_LABELS.get(code, code),
            aliases=list(aliases),
        )
        for code, aliases in SCENE_ALIASES.items()
    ]
    return MetaOptionsResponse(
        meal_type=meal_type,
        scene=scene,
        tags_recommended=TAGS_RECOMMENDED,
        notes=[
            "Use code values for new frontend implementations.",
            "Japanese aliases are kept for backward compatibility.",
            "Current DB filtering is based on partial string matching in tags/notes.",
        ],
    )
