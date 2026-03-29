from __future__ import annotations

import random
from dataclasses import dataclass

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.vocabulary import expand_meal_type_terms, expand_scene_terms
from app.models.recipe_models import Recipe, RecipeIngredient, RecipeStep


ROLE_SLOTS = {"staple", "main", "side", "soup", "dessert"}


@dataclass(slots=True)
class RecipeListFilters:
    category: str | None = None
    meal_type: str | None = None
    tags: list[str] | None = None
    min_energy_kcal: float | None = None
    max_energy_kcal: float | None = None
    min_protein_g: float | None = None
    max_protein_g: float | None = None
    min_fat_g: float | None = None
    max_fat_g: float | None = None
    min_carbohydrate_g: float | None = None
    max_carbohydrate_g: float | None = None
    limit: int = 20
    offset: int = 0


class RecipeRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _slot_condition(slot: str):
        if slot not in ROLE_SLOTS:
            raise ValueError(f"Unsupported category slot: {slot}")
        if slot == "staple":
            return or_(
                Recipe.category_lv1 == "主食",
                Recipe.recipe_id.like("RICE%"),
                Recipe.recipe_id.like("UDON%"),
                Recipe.recipe_id.like("SOBA%"),
                Recipe.recipe_id.like("RAMEN%"),
                Recipe.recipe_id.like("BREAD%"),
                Recipe.recipe_id.like("DONBURI%"),
            )
        if slot == "main":
            return or_(
                Recipe.category_lv1 == "主菜",
                Recipe.recipe_id.like("MAIN_%"),
            )
        if slot == "side":
            return or_(
                Recipe.category_lv1 == "副菜",
                Recipe.recipe_id.like("SIDE_%"),
            )
        if slot == "soup":
            return or_(
                Recipe.category_lv1 == "汁物",
                Recipe.recipe_id.like("SOUP_%"),
            )
        return or_(
            Recipe.category_lv1 == "デザート",
            Recipe.recipe_id.like("DESSERT_%"),
        )

    @staticmethod
    def _apply_nutrition_filters(query, filters: RecipeListFilters):
        if filters.min_energy_kcal is not None:
            query = query.where(Recipe.energy_kcal >= filters.min_energy_kcal)
        if filters.max_energy_kcal is not None:
            query = query.where(Recipe.energy_kcal <= filters.max_energy_kcal)
        if filters.min_protein_g is not None:
            query = query.where(Recipe.protein_g >= filters.min_protein_g)
        if filters.max_protein_g is not None:
            query = query.where(Recipe.protein_g <= filters.max_protein_g)
        if filters.min_fat_g is not None:
            query = query.where(Recipe.fat_g >= filters.min_fat_g)
        if filters.max_fat_g is not None:
            query = query.where(Recipe.fat_g <= filters.max_fat_g)
        if filters.min_carbohydrate_g is not None:
            query = query.where(Recipe.carbohydrate_g >= filters.min_carbohydrate_g)
        if filters.max_carbohydrate_g is not None:
            query = query.where(Recipe.carbohydrate_g <= filters.max_carbohydrate_g)
        return query

    @staticmethod
    def _apply_tag_filters(query, filters: RecipeListFilters):
        if filters.tags:
            for tag in filters.tags:
                query = query.where(Recipe.tags.ilike(f"%{tag.strip()}%"))
        if filters.meal_type:
            meal_terms = expand_meal_type_terms(filters.meal_type)
            if not meal_terms:
                meal_terms = [filters.meal_type]
            meal_conditions = []
            for term in meal_terms:
                meal_conditions.extend(
                    [
                        Recipe.tags.ilike(f"%{term}%"),
                        Recipe.notes.ilike(f"%{term}%"),
                    ]
                )
            query = query.where(
                or_(*meal_conditions)
            )
        return query

    @staticmethod
    def _apply_category_filters(query, filters: RecipeListFilters):
        if not filters.category:
            return query
        category = filters.category.strip().lower()
        if category in {"staple", "main", "side", "soup", "dessert"}:
            return query.where(RecipeRepository._slot_condition(category))
        return query.where(
            or_(
                Recipe.category_lv1.ilike(f"%{filters.category}%"),
                Recipe.category_lv2.ilike(f"%{filters.category}%"),
                Recipe.recipe_id.ilike(f"{filters.category}%"),
            )
        )

    def list_recipes(self, filters: RecipeListFilters) -> tuple[list[Recipe], int]:
        base_query = select(Recipe)
        base_query = self._apply_category_filters(base_query, filters)
        base_query = self._apply_tag_filters(base_query, filters)
        base_query = self._apply_nutrition_filters(base_query, filters)

        count_query = select(func.count()).select_from(base_query.subquery())
        total = int(self.db.execute(count_query).scalar_one())

        paged_query = (
            base_query.order_by(Recipe.recipe_id)
            .offset(filters.offset)
            .limit(filters.limit)
        )
        rows = list(self.db.execute(paged_query).scalars().all())
        return rows, total

    def get_recipe_by_id(self, recipe_id: str) -> Recipe | None:
        query = select(Recipe).where(Recipe.recipe_id == recipe_id)
        return self.db.execute(query).scalar_one_or_none()

    def get_recipe_ingredients(self, recipe_id: str) -> list[RecipeIngredient]:
        query = (
            select(RecipeIngredient)
            .where(RecipeIngredient.recipe_id == recipe_id)
            .order_by(RecipeIngredient.line_no)
        )
        return list(self.db.execute(query).scalars().all())

    def get_recipe_steps(self, recipe_id: str) -> list[RecipeStep]:
        query = (
            select(RecipeStep)
            .where(RecipeStep.recipe_id == recipe_id)
            .order_by(RecipeStep.step_number)
        )
        return list(self.db.execute(query).scalars().all())

    def get_random_recipe_by_slot(
        self,
        slot: str,
        meal_type: str | None = None,
        scene: str | None = None,
    ) -> Recipe | None:
        query = select(Recipe).where(self._slot_condition(slot))
        if meal_type:
            meal_terms = expand_meal_type_terms(meal_type)
            if not meal_terms:
                meal_terms = [meal_type]
            meal_conditions = []
            for term in meal_terms:
                meal_conditions.extend(
                    [
                        Recipe.tags.ilike(f"%{term}%"),
                        Recipe.notes.ilike(f"%{term}%"),
                    ]
                )
            query = query.where(
                or_(*meal_conditions)
            )
        if scene:
            scene_terms = expand_scene_terms(scene)
            if not scene_terms:
                scene_terms = [scene]
            query = query.where(or_(*[Recipe.tags.ilike(f"%{term}%") for term in scene_terms]))

        rows = list(self.db.execute(query).scalars().all())
        if not rows:
            return None
        return random.choice(rows)

    def list_by_slot(
        self,
        slot: str,
        meal_type: str | None = None,
        scene: str | None = None,
    ) -> list[Recipe]:
        query = select(Recipe).where(self._slot_condition(slot))
        if meal_type:
            meal_terms = expand_meal_type_terms(meal_type)
            if not meal_terms:
                meal_terms = [meal_type]
            meal_conditions = []
            for term in meal_terms:
                meal_conditions.extend(
                    [
                        Recipe.tags.ilike(f"%{term}%"),
                        Recipe.notes.ilike(f"%{term}%"),
                    ]
                )
            query = query.where(
                or_(*meal_conditions)
            )
        if scene:
            scene_terms = expand_scene_terms(scene)
            if not scene_terms:
                scene_terms = [scene]
            query = query.where(or_(*[Recipe.tags.ilike(f"%{term}%") for term in scene_terms]))
        return list(self.db.execute(query).scalars().all())

