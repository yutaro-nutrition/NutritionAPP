import { getFoodByIdMap, getIngredientsByRecipeId, getPresetRecipeNutritionMap } from "@/lib/data/loaders";
import { addNutrients, cloneZeroNutrients, roundNutrients, scaleNutrients } from "@/lib/utils/nutrients";
import { RecipeNutrition } from "@/types";

// マスタは静的JSONのため、毎回再構築せずモジュール単位でキャッシュする
const FOOD_BY_ID = getFoodByIdMap();
const INGREDIENTS_BY_RECIPE_ID = getIngredientsByRecipeId();
const PRESET_RECIPE_NUTRITION = getPresetRecipeNutritionMap();

export const calculateRecipeNutrition = (recipeId: string): RecipeNutrition => {
  const preset = PRESET_RECIPE_NUTRITION.get(recipeId);
  if (preset) return preset;

  const ingredients = INGREDIENTS_BY_RECIPE_ID.get(recipeId) ?? [];
  let total = cloneZeroNutrients();

  for (const ingredient of ingredients) {
    const food = FOOD_BY_ID.get(ingredient.food_id);
    if (!food) continue;

    const scaled = scaleNutrients(food, ingredient.amount_g / 100);
    total = addNutrients(total, scaled);
  }

  return {
    recipe_id: recipeId,
    ...roundNutrients(total),
  };
};

export const calculateRecipesNutrition = (recipeIds: string[]): RecipeNutrition[] => {
  return recipeIds.map((id) => calculateRecipeNutrition(id));
};
