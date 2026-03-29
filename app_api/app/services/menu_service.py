from __future__ import annotations

import random
from dataclasses import dataclass

from app.core.vocabulary import normalize_meal_type, normalize_scene
from app.repositories.recipe_repository import RecipeRepository


class MenuGenerationError(RuntimeError):
    pass


@dataclass(slots=True)
class MenuCandidate:
    staple: object
    main: object
    side: object
    soup: object
    dessert: object | None

    @property
    def recipes(self) -> list[object]:
        items = [self.staple, self.main, self.side, self.soup]
        if self.dessert:
            items.append(self.dessert)
        return items


def _to_float(value) -> float:
    return float(value)


def _totals(candidate: MenuCandidate) -> tuple[float, float]:
    kcal = sum(_to_float(r.energy_kcal) for r in candidate.recipes)
    protein = sum(_to_float(r.protein_g) for r in candidate.recipes)
    return kcal, protein


def _score(candidate: MenuCandidate, target_kcal: float, target_protein_g: float) -> tuple[float, float, float]:
    kcal, protein = _totals(candidate)
    protein_gap = max(0.0, target_protein_g - protein)
    kcal_gap = abs(target_kcal - kcal)
    # Prioritize protein target first, then kcal proximity.
    return (protein_gap, kcal_gap, -protein)


class MenuService:
    def __init__(self, repository: RecipeRepository) -> None:
        self.repository = repository

    def _pool_with_fallback(
        self,
        slot: str,
        meal_type: str | None,
        scene: str | None,
    ) -> tuple[list, bool]:
        # Keep input constraints first, then relax only when required to keep MVP usable.
        attempts = [
            (meal_type, scene),
            (None, scene) if meal_type else None,
            (meal_type, None) if scene else None,
            (None, None),
        ]
        for idx, attempt in enumerate(attempts):
            if attempt is None:
                continue
            pool = self.repository.list_by_slot(
                slot,
                meal_type=attempt[0],
                scene=attempt[1],
            )
            if pool:
                return pool, idx > 0
        return [], False

    @staticmethod
    def _kcal_match_level(target_kcal: float, actual_kcal: float) -> str:
        gap = abs(target_kcal - actual_kcal)
        if gap <= target_kcal * 0.05:
            return "high"
        if gap <= target_kcal * 0.15:
            return "medium"
        return "low"

    @staticmethod
    def _protein_match_level(target_protein_g: float, actual_protein_g: float) -> str:
        shortfall = max(0.0, target_protein_g - actual_protein_g)
        if shortfall == 0:
            return "high"
        if shortfall <= max(1.0, target_protein_g * 0.1):
            return "medium"
        return "low"

    def generate_patterns(
        self,
        target_kcal: float,
        target_protein_g: float,
        meal_type: str | None,
        scene: str | None,
        include_dessert: bool,
        pattern_count: int = 3,
    ) -> list[dict]:
        scene_normalized = normalize_scene(scene)
        meal_type_normalized = normalize_meal_type(meal_type)
        staple_pool, staple_relaxed = self._pool_with_fallback(
            "staple", meal_type=meal_type, scene=scene
        )
        main_pool, main_relaxed = self._pool_with_fallback(
            "main", meal_type=meal_type, scene=scene
        )
        side_pool, side_relaxed = self._pool_with_fallback(
            "side", meal_type=meal_type, scene=scene
        )
        soup_pool, soup_relaxed = self._pool_with_fallback(
            "soup", meal_type=meal_type, scene=scene
        )
        dessert_pool, dessert_relaxed = self._pool_with_fallback(
            "dessert", meal_type=meal_type, scene=scene
        )
        constraint_relaxed = (
            staple_relaxed or main_relaxed or side_relaxed or soup_relaxed or dessert_relaxed
        )

        if not staple_pool or not main_pool or not side_pool or not soup_pool:
            raise MenuGenerationError(
                "No recipes available for one or more required slots: staple/main/side/soup."
            )

        kcal_min = target_kcal * 0.8
        kcal_max = target_kcal * 1.2

        attempts = 2000
        candidates: list[MenuCandidate] = []
        seen_keys: set[tuple[str, ...]] = set()

        for _ in range(attempts):
            dessert = None
            if include_dessert and dessert_pool and random.random() < 0.35:
                dessert = random.choice(dessert_pool)
            candidate = MenuCandidate(
                staple=random.choice(staple_pool),
                main=random.choice(main_pool),
                side=random.choice(side_pool),
                soup=random.choice(soup_pool),
                dessert=dessert,
            )
            key = tuple(sorted([r.recipe_id for r in candidate.recipes]))
            if key in seen_keys:
                continue
            seen_keys.add(key)
            candidates.append(candidate)

        if not candidates:
            raise MenuGenerationError("Failed to generate menu candidates.")

        in_range = []
        fallback = []
        for cand in candidates:
            kcal, protein = _totals(cand)
            if kcal_min <= kcal <= kcal_max and protein >= target_protein_g:
                in_range.append(cand)
            else:
                fallback.append(cand)

        protein_matched = [cand for cand in candidates if _totals(cand)[1] >= target_protein_g]
        if not protein_matched:
            raise MenuGenerationError("No menu candidates satisfy the protein target.")

        ranked = sorted(in_range, key=lambda c: _score(c, target_kcal, target_protein_g))
        if len(ranked) < pattern_count:
            ranked += sorted(
                [cand for cand in fallback if cand in protein_matched],
                key=lambda c: _score(c, target_kcal, target_protein_g),
            )

        picked = ranked[:pattern_count]
        if not picked:
            raise MenuGenerationError("No menu patterns could be selected.")

        patterns: list[dict] = []
        for idx, cand in enumerate(picked, start=1):
            kcal, protein = _totals(cand)
            kcal_level = self._kcal_match_level(target_kcal=target_kcal, actual_kcal=kcal)
            protein_level = self._protein_match_level(
                target_protein_g=target_protein_g,
                actual_protein_g=protein,
            )
            slots = [
                ("staple", cand.staple),
                ("main", cand.main),
                ("side", cand.side),
                ("soup", cand.soup),
            ]
            if cand.dessert is not None:
                slots.append(("dessert", cand.dessert))
            if constraint_relaxed:
                generation_note = "条件に合うレシピが少ないため、一部条件を緩和しました"
            elif protein_level == "high":
                generation_note = "高タンパク質を優先した構成です"
            else:
                generation_note = "栄養条件のバランスを優先した構成です"

            patterns.append(
                {
                    "pattern_no": idx,
                    "total_kcal": round(kcal, 2),
                    "total_protein_g": round(protein, 2),
                    "kcal_min": round(kcal_min, 2),
                    "kcal_max": round(kcal_max, 2),
                    "protein_target_g": round(target_protein_g, 2),
                    "within_kcal_range": kcal_min <= kcal <= kcal_max,
                    "protein_target_met": protein >= target_protein_g,
                    "nutrition_summary": {
                        "target_kcal": round(target_kcal, 2),
                        "actual_kcal": round(kcal, 2),
                        "kcal_gap": round(kcal - target_kcal, 2),
                        "target_protein_g": round(target_protein_g, 2),
                        "actual_protein_g": round(protein, 2),
                        "protein_gap": round(protein - target_protein_g, 2),
                    },
                    "constraint_evaluation": {
                        "kcal_match_level": kcal_level,
                        "protein_match_level": protein_level,
                        "constraint_relaxed": constraint_relaxed,
                    },
                    "applied_conditions": {
                        "scene": scene,
                        "scene_normalized": scene_normalized,
                        "meal_type": meal_type,
                        "meal_type_normalized": meal_type_normalized,
                        "include_dessert": include_dessert,
                    },
                    "generation_note": generation_note,
                    "slots": [
                        {
                            "slot": slot_name,
                            "recipe": recipe,
                        }
                        for slot_name, recipe in slots
                    ],
                }
            )
        return patterns

