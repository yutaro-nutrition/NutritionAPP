from __future__ import annotations


MEAL_TYPE_CANONICAL = ("breakfast", "lunch", "dinner", "snack")
SCENE_CANONICAL = ("pre_game", "post_game", "bulking", "cutting", "recovery", "normal")

MEAL_TYPE_ALIASES: dict[str, tuple[str, ...]] = {
    "breakfast": ("breakfast", "朝食"),
    "lunch": ("lunch", "昼食"),
    "dinner": ("dinner", "夕食"),
    "snack": ("snack", "補食", "補食向け"),
    # Backward-compatible aliases currently used by some clients.
    "pre_game": ("pre_game", "試合前"),
    "post_game": ("post_game", "試合後"),
}

SCENE_ALIASES: dict[str, tuple[str, ...]] = {
    "pre_game": ("pre_game", "試合前"),
    "post_game": ("post_game", "試合後"),
    "bulking": ("bulking", "増量", "増量期"),
    "cutting": ("cutting", "減量", "減量期"),
    "recovery": ("recovery", "回復"),
    "normal": ("normal", "通常"),
}

TAGS_RECOMMENDED = {
    "performance_goal": [
        "high_protein",
        "low_fat",
        "high_carb",
        "recovery_support",
    ],
    "timing": [
        "pre_game",
        "post_game",
        "snack",
    ],
    "nutrition_feature": [
        "high_protein",
        "low_fat",
        "high_carb",
        "easy_digest",
    ],
    "user_need": [
        "quick_energy",
        "recovery_support",
        "light_meal",
    ],
}


def _find_canonical(mapping: dict[str, tuple[str, ...]], value: str | None) -> str | None:
    if value is None:
        return None
    needle = value.strip().lower()
    if not needle:
        return None
    for canonical, aliases in mapping.items():
        normalized_aliases = tuple(alias.strip().lower() for alias in aliases)
        if needle in normalized_aliases:
            return canonical
    return None


def normalize_scene(value: str | None) -> str | None:
    return _find_canonical(SCENE_ALIASES, value)


def normalize_meal_type(value: str | None) -> str | None:
    return _find_canonical(MEAL_TYPE_ALIASES, value)


def expand_scene_terms(value: str | None) -> list[str]:
    if value is None:
        return []
    canonical = normalize_scene(value)
    if canonical is None:
        return [value]
    return list(dict.fromkeys(SCENE_ALIASES[canonical]))


def expand_meal_type_terms(value: str | None) -> list[str]:
    if value is None:
        return []
    canonical = normalize_meal_type(value)
    if canonical is None:
        return [value]
    return list(dict.fromkeys(MEAL_TYPE_ALIASES[canonical]))
