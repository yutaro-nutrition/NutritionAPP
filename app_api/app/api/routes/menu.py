from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.mappers import recipe_to_dict
from app.core.errors import ApiError, INVALID_PARAMETER, NO_RECIPES_FOUND
from app.db.session import get_db
from app.repositories.recipe_repository import RecipeRepository
from app.schemas.recipe_api import ErrorResponse, MenuRequest, MenuResponse
from app.services.menu_service import MenuGenerationError, MenuService

router = APIRouter(prefix="/menu", tags=["menu"])


@router.post(
    "/generate",
    response_model=MenuResponse,
    responses={
        400: {
            "model": ErrorResponse,
            "description": "Bad request (e.g., invalid slot configuration).",
        },
        404: {
            "model": ErrorResponse,
            "description": "No candidate menus satisfy required constraints.",
        },
        422: {
            "model": ErrorResponse,
            "description": "Validation error.",
        },
    },
)
def generate_menu(
    request: MenuRequest,
    db: Session = Depends(get_db),
) -> MenuResponse:
    repository = RecipeRepository(db)
    service = MenuService(repository)

    try:
        patterns = service.generate_patterns(
            target_kcal=request.target_kcal,
            target_protein_g=request.target_protein_g,
            meal_type=request.meal_type,
            scene=request.scene,
            include_dessert=request.include_dessert,
            pattern_count=3,
        )
    except ValueError as exc:
        raise ApiError(
            status_code=400,
            error_code=INVALID_PARAMETER,
            detail=str(exc),
        ) from exc
    except MenuGenerationError as exc:
        raise ApiError(
            status_code=404,
            error_code=NO_RECIPES_FOUND,
            detail=str(exc),
        ) from exc

    normalized = []
    for pattern in patterns:
        slots = []
        for slot in pattern["slots"]:
            slots.append(
                {
                    "slot": slot["slot"],
                    "recipe": recipe_to_dict(slot["recipe"]),
                }
            )
        normalized.append({**pattern, "slots": slots})

    return MenuResponse(
        target_kcal=request.target_kcal,
        target_protein_g=request.target_protein_g,
        meal_type=request.meal_type,
        scene=request.scene,
        patterns=normalized,
    )

