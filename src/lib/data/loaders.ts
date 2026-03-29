import foods from "@/data/food_master_sample.json";
import recipeDetails from "@/data/recipe_details_sample.json";
import ingredients from "@/data/recipe_ingredients_sample.json";
import recipes from "@/data/recipe_master_sample.json";
import gohanMaster from "@/data/gohan120/recipe_master_gohan120.json";
import gohanIngredients from "@/data/gohan120/ingredients_gohan120.json";
import gohanSteps from "@/data/gohan120/steps_gohan120.json";
import { FoodMaster, RecipeDetail, RecipeIngredient, RecipeMaster, RecipeNutrition } from "@/types";

type GohanMasterRow = {
  recipe_id: string;
  recipe_name: string;
  category: string;
  subcategory: string;
  rice_type: string;
  cooking_method: string;
  servings: number;
  ingredient_count: number;
  nutrients_per_serving: {
    enerc_kcal: number;
    protein_g: number;
    fat_g: number;
    carb_g: number;
    calcium_mg: number;
    iron_mg: number;
    salt_g: number;
    vitamin_b1_mg: number;
    vitamin_b2_mg: number;
    vitamin_b6_mg: number;
    vitamin_b12_ug: number;
    vitamin_c_mg: number;
    vitamin_d_ug: number;
    retinol_activity_equivalent_ug: number;
  };
};

type GohanIngredientRow = {
  recipe_id: string;
  ingredient_no: number;
  ingredient_group: string;
  food_code: string;
  food_name: string;
  ingredient_display: string;
  raw_weight_g: number;
};

type GohanStepRow = {
  recipe_id: string;
  step_no: number;
  step_description: string;
};

const toRecipeMasterFromGohan = (row: GohanMasterRow): RecipeMaster => ({
  recipe_id: row.recipe_id,
  recipe_name: row.recipe_name,
  category: "主食",
  cuisine: "和食",
  cook_time_min: 12,
  difficulty: row.ingredient_count >= 8 ? "normal" : "easy",
  budget_jpy: 280,
  main_food: "こめ",
  meal_type: "any",
  allergens: [],
  tags: ["ごはん", row.subcategory].filter(Boolean),
});

const toRecipeIngredientFromGohan = (row: GohanIngredientRow): RecipeIngredient => ({
  recipe_id: row.recipe_id,
  food_id: `G${row.food_code}`,
  amount_g: Number(row.raw_weight_g ?? 0),
  role:
    row.ingredient_group === "main"
      ? "主材料"
      : row.ingredient_group === "protein"
        ? "主材料"
        : row.ingredient_group === "cond"
          ? "調味料"
          : "副材料",
  food_name: row.ingredient_display || row.food_name,
  display_amount: String(row.raw_weight_g ?? 0),
  display_unit: "g",
  sort_order: Number(row.ingredient_no ?? 999),
});

const gohanStepsByRecipe = (gohanSteps as GohanStepRow[]).reduce<Map<string, string[]>>((map, row) => {
  const list = map.get(row.recipe_id) ?? [];
  list.push(row.step_description);
  map.set(row.recipe_id, list);
  return map;
}, new Map());

const toRecipeDetailFromGohan = (row: GohanMasterRow): RecipeDetail => ({
  recipe_id: row.recipe_id,
  servings: Number(row.servings ?? 1) || 1,
  recipe_summary: `${row.subcategory || "ごはん"}の1人前メニュー。`,
  instructions: gohanStepsByRecipe.get(row.recipe_id) ?? ["材料を準備し、加熱して仕上げる。"],
  recipe_points: ["ごはん温度が高すぎると成形しにくいため、少し冷ましてから仕上げる。"],
});

const GOHAN_MASTER_ROWS = gohanMaster as GohanMasterRow[];
const GOHAN_INGREDIENT_ROWS = gohanIngredients as GohanIngredientRow[];

const GOHAN_RECIPE_MASTER: RecipeMaster[] = GOHAN_MASTER_ROWS.map(toRecipeMasterFromGohan);
const GOHAN_RECIPE_INGREDIENTS: RecipeIngredient[] = GOHAN_INGREDIENT_ROWS.map(toRecipeIngredientFromGohan);
const GOHAN_RECIPE_DETAILS: RecipeDetail[] = GOHAN_MASTER_ROWS.map(toRecipeDetailFromGohan);

export const getFoodMaster = (): FoodMaster[] => foods as FoodMaster[];

export const getRecipeMaster = (): RecipeMaster[] => {
  const base = recipes as RecipeMaster[];
  const map = new Map<string, RecipeMaster>();
  // gohan120を優先参照
  [...GOHAN_RECIPE_MASTER, ...base].forEach((r) => {
    if (!map.has(r.recipe_id)) map.set(r.recipe_id, r);
  });
  return Array.from(map.values());
};

export const getRecipeIngredients = (): RecipeIngredient[] => {
  const base = ingredients as RecipeIngredient[];
  return [...GOHAN_RECIPE_INGREDIENTS, ...base];
};

export const getRecipeDetails = (): RecipeDetail[] => {
  const base = recipeDetails as RecipeDetail[];
  const map = new Map<string, RecipeDetail>();
  [...GOHAN_RECIPE_DETAILS, ...base].forEach((d) => {
    if (!map.has(d.recipe_id)) map.set(d.recipe_id, d);
  });
  return Array.from(map.values());
};

export const getFoodByIdMap = (): Map<string, FoodMaster> => {
  return new Map(getFoodMaster().map((food) => [food.food_id, food]));
};

export const getIngredientFoodNameByIdMap = (): Map<string, string> => {
  const map = new Map<string, string>();
  for (const ing of getRecipeIngredients()) {
    if (!ing.food_id) continue;
    if (ing.food_name && !map.has(ing.food_id)) {
      map.set(ing.food_id, ing.food_name);
    }
  }
  return map;
};

export const getRecipeByIdMap = (): Map<string, RecipeMaster> => {
  return new Map(getRecipeMaster().map((recipe) => [recipe.recipe_id, recipe]));
};

export const getIngredientsByRecipeId = (): Map<string, RecipeIngredient[]> => {
  const map = new Map<string, RecipeIngredient[]>();
  for (const ingredient of getRecipeIngredients()) {
    const list = map.get(ingredient.recipe_id) ?? [];
    list.push(ingredient);
    map.set(ingredient.recipe_id, list);
  }
  return map;
};

export const getRecipeDetailByIdMap = (): Map<string, RecipeDetail> => {
  return new Map(getRecipeDetails().map((detail) => [detail.recipe_id, detail]));
};

export const getPresetRecipeNutritionMap = (): Map<string, RecipeNutrition> => {
  const map = new Map<string, RecipeNutrition>();
  for (const row of GOHAN_MASTER_ROWS) {
    const n = row.nutrients_per_serving;
    map.set(row.recipe_id, {
      recipe_id: row.recipe_id,
      kcal: Number(n.enerc_kcal ?? 0),
      protein: Number(n.protein_g ?? 0),
      fat: Number(n.fat_g ?? 0),
      carb: Number(n.carb_g ?? 0),
      calcium: Number(n.calcium_mg ?? 0),
      iron: Number(n.iron_mg ?? 0),
      salt: Number(n.salt_g ?? 0),
      vitamin_b1: Number(n.vitamin_b1_mg ?? 0),
      vitamin_b2: Number(n.vitamin_b2_mg ?? 0),
      vitamin_b6: Number(n.vitamin_b6_mg ?? 0),
      vitamin_b12: Number(n.vitamin_b12_ug ?? 0),
      vitamin_c: Number(n.vitamin_c_mg ?? 0),
      vitamin_d: Number(n.vitamin_d_ug ?? 0),
      retinol_activity_equivalent: Number(n.retinol_activity_equivalent_ug ?? 0),
    });
  }
  return map;
};
