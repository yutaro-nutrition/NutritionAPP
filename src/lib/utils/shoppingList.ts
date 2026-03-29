import { getFoodByIdMap, getIngredientFoodNameByIdMap, getIngredientsByRecipeId } from "@/lib/data/loaders";
import resolvedIngredients from "@/data/recipe_ingredients_resolved.json";
import { ShoppingItem } from "@/types";

const RESOLVED_FOOD_NAME_BY_LEGACY_ID = new Map<string, string>();
for (const row of resolvedIngredients as Array<{ food_id?: string; resolved_food_name?: string }>) {
  const legacyFoodId = row.food_id?.trim();
  const resolvedFoodName = row.resolved_food_name?.trim();
  if (!legacyFoodId || !resolvedFoodName) continue;
  if (!RESOLVED_FOOD_NAME_BY_LEGACY_ID.has(legacyFoodId)) {
    RESOLVED_FOOD_NAME_BY_LEGACY_ID.set(legacyFoodId, resolvedFoodName);
  }
}

export const generateShoppingList = (recipeIds: string[]): ShoppingItem[] => {
  const ingredientsMap = getIngredientsByRecipeId();
  const foodMap = getFoodByIdMap();
  const ingredientFoodNameMap = getIngredientFoodNameByIdMap();
  const amountMap = new Map<string, number>();

  for (const recipeId of recipeIds) {
    const ingredients = ingredientsMap.get(recipeId) ?? [];
    for (const ingredient of ingredients) {
      amountMap.set(ingredient.food_id, (amountMap.get(ingredient.food_id) ?? 0) + ingredient.amount_g);
    }
  }

  return Array.from(amountMap.entries())
    .map(([foodId, total]) => {
      const food = foodMap.get(foodId);
      const resolvedName = RESOLVED_FOOD_NAME_BY_LEGACY_ID.get(foodId);
      const ingredientName = ingredientFoodNameMap.get(foodId);
      return {
        food_id: foodId,
        food_name: resolvedName ?? ingredientName ?? food?.food_name ?? foodId,
        total_amount_g: Number(total.toFixed(1)),
      };
    })
    .sort((a, b) => b.total_amount_g - a.total_amount_g);
};
