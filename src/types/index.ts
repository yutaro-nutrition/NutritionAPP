export const NUTRIENT_KEYS = [
  "kcal",
  "protein",
  "fat",
  "carb",
  "calcium",
  "iron",
  "salt",
  "vitamin_b1",
  "vitamin_b2",
  "vitamin_b6",
  "vitamin_b12",
  "vitamin_c",
  "vitamin_d",
  "retinol_activity_equivalent",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export type NutrientMap = Record<NutrientKey, number>;

export type Sex = "male" | "female";
export type ActivityLevel = "low" | "moderate" | "high" | "athlete";
export type GoalType = "fat_loss" | "maintain" | "muscle_gain" | "performance";

export interface UserProfile {
  age: number;
  sex: Sex;
  height_cm: number;
  weight_kg: number;
  body_fat_percent?: number;
  sport: string;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  likes: string[];
  dislikes: string[];
  allergies: string[];
  family_size: number;
  cook_time_breakfast_min: number;
  cook_time_dinner_min: number;
  budget_per_meal_jpy: number;
}

export interface FoodMaster extends NutrientMap {
  food_id: string;
  food_name: string;
  category: string;
}

export type RecipeCategory = "主食" | "主菜" | "副菜" | "汁物" | "デザート";

export interface RecipeMaster {
  recipe_id: string;
  recipe_name: string;
  category: RecipeCategory;
  cuisine: string;
  cook_time_min: number;
  difficulty: "easy" | "normal" | "hard";
  budget_jpy: number;
  main_food: string;
  meal_type?: "breakfast" | "dinner" | "any";
  allergens?: string[];
  tags?: string[];
}

export interface RecipeIngredient {
  recipe_id: string;
  food_id: string;
  amount_g: number;
  role: string;
  food_name?: string;
  display_amount?: string;
  display_unit?: string;
  sort_order?: number;
}

export type FoodLinkMatchType =
  | "exact_match"
  | "normalized_match"
  | "synonym_match"
  | "category_assisted_match"
  | "manual_fallback"
  | "unresolved";

export interface RecipeIngredientResolved extends RecipeIngredient {
  ingredient_source_name: string;
  resolved_food_id: string;
  resolved_food_name: string;
  match_type: FoodLinkMatchType;
  confidence: number;
  review_required: boolean;
  candidate_foods?: Array<{ food_id: string; food_name: string; category?: string }>;
  reason?: string;
}

export interface RecipeInstruction {
  recipe_id: string;
  instructions: string[];
}

export interface RecipeDetail {
  recipe_id: string;
  servings: number;
  recipe_summary?: string;
  instructions: string[];
  recipe_points?: string[];
}

export interface RecipeNutrition extends NutrientMap {
  recipe_id: string;
}

export interface MealRecipes {
  breakfast: RecipeMaster[];
  lunch: RecipeMaster[];
  dinner: RecipeMaster[];
}

export interface SnackPlan {
  timing: "午前補食" | "昼食後〜練習前" | "練習前補食" | "練習後補食" | "夕食後" | "就寝前";
  recipes: string[];
  reason: string;
}

export interface DailyPlan {
  meals: MealRecipes;
  snacks: SnackPlan[];
  recipes: RecipeMaster[];
  recipeNutritions: RecipeNutrition[];
  dailyNutrition: NutrientMap;
  totalBudget: number;
  totalCookTime: number;
  score: number;
  debug?: {
    constraintProfile: "strict" | "relaxed";
    attempts: number;
    validCandidates: number;
    rejectedByProtein: number;
    rejectedByFat: number;
    bestProteinRateTried: number;
    bestFatRateTried: number;
  };
}

export type DayPlanType = "training" | "pre_game" | "game_day" | "off_day";

export interface NutritionTargets extends NutrientMap {}

export interface NutritionEvaluation {
  achievedPercent: Record<NutrientKey, number>;
  gap: Record<NutrientKey, number>;
  constraintStatus: {
    proteinRate: number;
    fatRate: number;
    proteinOk: boolean;
    fatOk: boolean;
    profile?: "strict" | "relaxed";
  };
  totalScore: number;
}

export interface ShoppingItem {
  food_id: string;
  food_name: string;
  total_amount_g: number;
}

export interface WeeklyDayPlan {
  dayIndex: number;
  dayLabel: string;
  dayType: DayPlanType;
  plan: DailyPlan;
  targets: NutritionTargets;
  evaluation: NutritionEvaluation;
}
