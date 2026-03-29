import { getRecipeMaster } from "@/lib/data/loaders";
import { calculateNutritionTargets } from "@/lib/nutrition/targets";
import { evaluateNutrition } from "@/lib/nutrition/evaluate";
import { generateDailyPlan } from "@/lib/scoring/generateDailyPlan";
import { CONSTRAINT_PROFILES, WEEK_DAY_PFC_CONSTRAINTS, WEEK_DAY_TYPE_LABELS, WHITE_RICE_RECIPE_IDS } from "@/lib/utils/constants";
import { generateShoppingList } from "@/lib/utils/shoppingList";
import { DailyPlan, DayPlanType, UserProfile, WeeklyDayPlan } from "@/types";

const withDayTypeProfile = (profile: UserProfile, dayType: DayPlanType): UserProfile => {
  if (dayType === "pre_game") {
    return { ...profile, goal_type: "maintain", activity_level: "moderate" };
  }
  if (dayType === "game_day") {
    return { ...profile, goal_type: "maintain", activity_level: "high" };
  }
  if (dayType === "off_day") {
    return { ...profile, goal_type: "maintain", activity_level: "low" };
  }
  return { ...profile, goal_type: "performance" };
};

const isWhiteRiceRecipe = (plan: DailyPlan, recipeId: string): boolean => {
  if (WHITE_RICE_RECIPE_IDS.includes(recipeId)) return true;
  const recipe = plan.recipes.find((r) => r.recipe_id === recipeId);
  if (!recipe) return false;
  const text = `${recipe.recipe_name} ${recipe.main_food} ${(recipe.tags ?? []).join(" ")}`.toLowerCase();
  return text.includes("白ごはん") || text.includes("白米") || text.includes("米飯");
};

const calcPfcRatio = (plan: DailyPlan) => {
  const p = plan.dailyNutrition.protein * 4;
  const f = plan.dailyNutrition.fat * 9;
  const c = plan.dailyNutrition.carb * 4;
  const total = Math.max(1, p + f + c);
  return {
    protein: (p / total) * 100,
    fat: (f / total) * 100,
    carb: (c / total) * 100,
  };
};

const isPfcSatisfiedByDayType = (plan: DailyPlan, dayType: DayPlanType): boolean => {
  if (dayType !== "pre_game" && dayType !== "game_day") return true;
  const target = WEEK_DAY_PFC_CONSTRAINTS[dayType];
  const pfc = calcPfcRatio(plan);
  return (
    pfc.protein >= target.proteinMin &&
    pfc.protein <= target.proteinMax &&
    pfc.fat >= target.fatMin &&
    pfc.fat <= target.fatMax &&
    pfc.carb >= target.carbMin &&
    pfc.carb <= target.carbMax
  );
};

const calcRecipeVarietyScore = (plan: DailyPlan, usedRecipeIds: Set<string>): number => {
  const fresh = plan.recipes.filter((r) => !usedRecipeIds.has(r.recipe_id)).length;
  return fresh / Math.max(plan.recipes.length, 1);
};

const generateBestPlanForDay = (profile: UserProfile, dayType: DayPlanType, usedRecipeIds: Set<string>): DailyPlan => {
  let best: DailyPlan | null = null;
  let bestScore = -Infinity;
  const highCarbMode = dayType === "pre_game" || dayType === "game_day";

  for (let i = 0; i < 24; i += 1) {
    const plan = generateDailyPlan(profile, { excludedRecipeIds: usedRecipeIds, highCarbMode });
    if (!isPfcSatisfiedByDayType(plan, dayType)) continue;

    const variety = calcRecipeVarietyScore(plan, usedRecipeIds);
    const score = plan.score + variety * 0.6;
    if (score > bestScore) {
      bestScore = score;
      best = plan;
    }
  }

  if (!best) {
    throw new Error(`週間献立生成に失敗しました: ${WEEK_DAY_TYPE_LABELS[dayType]} のPFC制約を満たす候補が不足しています`);
  }
  return best;
};

export const generateWeeklyPlan = (profile: UserProfile, dayTypes: DayPlanType[]): { weekPlans: WeeklyDayPlan[]; weekShoppingList: ReturnType<typeof generateShoppingList> } => {
  const allRecipes = getRecipeMaster();
  const nonWhiteRiceRecipeCount = allRecipes.filter((r) => !WHITE_RICE_RECIPE_IDS.includes(r.recipe_id)).length;
  const minimumRequiredUniqueNonWhite = dayTypes.reduce((sum, dayType) => sum + (dayType === "pre_game" || dayType === "game_day" ? 8 : 9), 0);
  if (nonWhiteRiceRecipeCount < minimumRequiredUniqueNonWhite) {
    throw new Error(
      `重複禁止ルールを満たせません。利用可能な非白ごはんレシピ数=${nonWhiteRiceRecipeCount}、必要最小数=${minimumRequiredUniqueNonWhite}。recipe_masterを拡張してください。`,
    );
  }

  const usedRecipeIds = new Set<string>();
  const weekPlans: WeeklyDayPlan[] = [];

  dayTypes.forEach((dayType, idx) => {
    const dayProfile = withDayTypeProfile(profile, dayType);
    const plan = generateBestPlanForDay(dayProfile, dayType, usedRecipeIds);

    plan.recipes.forEach((r) => {
      if (!isWhiteRiceRecipe(plan, r.recipe_id)) {
        usedRecipeIds.add(r.recipe_id);
      }
    });

    const targets = calculateNutritionTargets(dayProfile);
    const profileName = plan.debug?.constraintProfile ?? "strict";
    const constraintProfile = profileName === "relaxed" ? CONSTRAINT_PROFILES.relaxed : CONSTRAINT_PROFILES.strict;
    const evaluation = evaluateNutrition(plan.dailyNutrition, targets, constraintProfile, profileName);

    weekPlans.push({
      dayIndex: idx + 1,
      dayType,
      dayLabel: `${idx + 1}日目 (${WEEK_DAY_TYPE_LABELS[dayType]})`,
      plan,
      targets,
      evaluation,
    });
  });

  const allRecipeIds = weekPlans.flatMap((d) => d.plan.recipes.map((r) => r.recipe_id));
  const weekShoppingList = generateShoppingList(allRecipeIds);

  return { weekPlans, weekShoppingList };
};
