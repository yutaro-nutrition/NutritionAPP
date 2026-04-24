export interface AppApiErrorResponse {
  error_code: string;
  detail: string | Record<string, unknown> | Array<Record<string, unknown>>;
}

export interface AppApiRecipeSummary {
  recipe_id: string;
  recipe_name: string;
  category_lv1: string;
  category_lv2: string;
  category_lv3?: string | null;
  tags?: string | null;
  energy_kcal: number;
  protein_g: number;
  fat_g: number;
  carbohydrate_g: number;
}

export interface AppApiIngredientItem {
  line_no: number;
  ingredient_name: string;
  ingredient_alias?: string | null;
  weight_g?: number | null;
  amount_value?: number | null;
  unit?: "g" | "ml" | null;
  notes?: string | null;
}

export interface AppApiStepItem {
  step_number: number;
  instruction: string;
}

export interface AppApiRecipeDetail extends AppApiRecipeSummary {
  cooking_method?: string | null;
  notes?: string | null;
  ingredients: AppApiIngredientItem[];
  steps: AppApiStepItem[];
}

export interface AppApiRecipeListResponse {
  total: number;
  limit: number;
  offset: number;
  items: AppApiRecipeSummary[];
}

export interface AppApiVocabularyOption {
  code: string;
  label_ja: string;
  aliases: string[];
}

export interface AppApiMetaOptionsResponse {
  meal_type: AppApiVocabularyOption[];
  scene: AppApiVocabularyOption[];
  tags_recommended: Record<string, string[]>;
  notes: string[];
}

export interface AppApiMenuSlot {
  slot: "staple" | "main" | "side" | "soup" | "dessert";
  recipe: AppApiRecipeSummary;
}

export interface AppApiNutritionSummary {
  target_kcal: number;
  actual_kcal: number;
  kcal_gap: number;
  target_protein_g: number;
  actual_protein_g: number;
  protein_gap: number;
}

export interface AppApiConstraintEvaluation {
  kcal_match_level: "high" | "medium" | "low";
  protein_match_level: "high" | "medium" | "low";
  constraint_relaxed: boolean;
}

export interface AppApiAppliedConditions {
  scene?: string | null;
  scene_normalized?: string | null;
  meal_type?: string | null;
  meal_type_normalized?: string | null;
  include_dessert: boolean;
}

export interface AppApiMenuPattern {
  pattern_no: number;
  total_kcal: number;
  total_protein_g: number;
  kcal_min: number;
  kcal_max: number;
  protein_target_g: number;
  within_kcal_range: boolean;
  protein_target_met: boolean;
  nutrition_summary: AppApiNutritionSummary;
  constraint_evaluation: AppApiConstraintEvaluation;
  applied_conditions: AppApiAppliedConditions;
  generation_note: string;
  slots: AppApiMenuSlot[];
}

export interface AppApiMenuResponse {
  target_kcal: number;
  target_protein_g: number;
  meal_type?: string | null;
  scene?: string | null;
  patterns: AppApiMenuPattern[];
}

export interface StoredMenuGenerationResult {
  generated_at: string;
  request: {
    target_kcal: number;
    target_protein_g: number;
    meal_type?: string | null;
    meal_type_label?: string | null;
    scene?: string | null;
    scene_label?: string | null;
    include_dessert: boolean;
  };
  response: AppApiMenuResponse;
}
