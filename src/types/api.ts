import { DailyPlan, NutritionEvaluation, NutritionTargets, ShoppingItem, WeeklyDayPlan } from "@/types";

export interface GenerateDailyPlanResponse {
  ok: boolean;
  error?: string;
  plan: DailyPlan;
  targets: NutritionTargets;
  evaluation: NutritionEvaluation;
  shoppingList: ShoppingItem[];
  weekPlans?: WeeklyDayPlan[];
  weekShoppingList?: ShoppingItem[];
}
