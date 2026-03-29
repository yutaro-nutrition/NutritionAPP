from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.mappers import ingredient_to_dict, recipe_to_dict, step_to_dict
from app.core.errors import ApiError, RECIPE_NOT_FOUND
from app.db.session import get_db
from app.repositories.recipe_repository import RecipeListFilters, RecipeRepository
from app.schemas.recipe_api import ErrorResponse, RecipeDetail, RecipeListResponse, RecipeSummary

router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.get(
    "",
    response_model=RecipeListResponse,
    responses={
        422: {
            "model": ErrorResponse,
            "description": "Validation error.",
        }
    },
)
def list_recipes(
    category: str | None = Query(default=None),
    meal_type: str | None = Query(
        default=None,
        description=(
            "Partial-match search against tags/notes. "
            "Recommended values: breakfast|lunch|dinner|snack (and backward-compatible aliases)."
        ),
    ),
    tags: str | None = Query(
        default=None,
        description=(
            "Comma-separated tags for partial matching. "
            "Recommended tag groups are available via GET /meta/options."
        ),
    ),
    min_energy_kcal: float | None = Query(default=None),
    max_energy_kcal: float | None = Query(default=None),
    min_protein_g: float | None = Query(default=None),
    max_protein_g: float | None = Query(default=None),
    min_fat_g: float | None = Query(default=None),
    max_fat_g: float | None = Query(default=None),
    min_carbohydrate_g: float | None = Query(default=None),
    max_carbohydrate_g: float | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> RecipeListResponse:
    repository = RecipeRepository(db)
    tag_list = [x.strip() for x in tags.split(",") if x.strip()] if tags else None
    filters = RecipeListFilters(
        category=category,
        meal_type=meal_type,
        tags=tag_list,
        min_energy_kcal=min_energy_kcal,
        max_energy_kcal=max_energy_kcal,
        min_protein_g=min_protein_g,
        max_protein_g=max_protein_g,
        min_fat_g=min_fat_g,
        max_fat_g=max_fat_g,
        min_carbohydrate_g=min_carbohydrate_g,
        max_carbohydrate_g=max_carbohydrate_g,
        limit=limit,
        offset=offset,
    )
    items, total = repository.list_recipes(filters)
    return RecipeListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[RecipeSummary(**recipe_to_dict(item)) for item in items],
    )


@router.get(
    "/{recipe_id}",
    response_model=RecipeDetail,
    responses={
        404: {
            "model": ErrorResponse,
            "description": "Recipe not found for the given recipe_id.",
        },
        422: {
            "model": ErrorResponse,
            "description": "Validation error.",
        },
    },
)
def get_recipe_detail(
    recipe_id: str,
    db: Session = Depends(get_db),
) -> RecipeDetail:
    repository = RecipeRepository(db)
    recipe = repository.get_recipe_by_id(recipe_id)
    if recipe is None:
        raise ApiError(
            status_code=404,
            error_code=RECIPE_NOT_FOUND,
            detail=f"Recipe not found: {recipe_id}",
        )

    ingredients = repository.get_recipe_ingredients(recipe_id)
    steps = repository.get_recipe_steps(recipe_id)

    payload = recipe_to_dict(recipe)
    payload["ingredients"] = [ingredient_to_dict(x) for x in ingredients]
    payload["steps"] = [step_to_dict(x) for x in steps]
    return RecipeDetail(**payload)

