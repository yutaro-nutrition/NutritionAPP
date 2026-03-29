from __future__ import annotations

from dataclasses import dataclass
from typing import Any


RECIPE_NOT_FOUND = "RECIPE_NOT_FOUND"
INVALID_PARAMETER = "INVALID_PARAMETER"
MENU_GENERATION_FAILED = "MENU_GENERATION_FAILED"
NO_RECIPES_FOUND = "NO_RECIPES_FOUND"
VALIDATION_ERROR = "VALIDATION_ERROR"


@dataclass(slots=True)
class ApiError(Exception):
    status_code: int
    error_code: str
    detail: str | list[dict[str, Any]] | dict[str, Any]


def default_error_code_by_status(status_code: int) -> str:
    if status_code == 422:
        return VALIDATION_ERROR
    if status_code == 404:
        return NO_RECIPES_FOUND
    if status_code == 400:
        return INVALID_PARAMETER
    return MENU_GENERATION_FAILED

