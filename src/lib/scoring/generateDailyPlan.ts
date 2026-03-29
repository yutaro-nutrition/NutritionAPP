import { getRecipeMaster } from "@/lib/data/loaders";
import { calculateRecipeNutrition } from "@/lib/nutrition/recipe";
import { calculateNutritionTargets } from "@/lib/nutrition/targets";
import { ConstraintProfile, checkPlanConstraints, getConstraintPenalty, scoreDailyNutrition, scoreFeasibility } from "@/lib/scoring/scorePlan";
import {
  CONSTRAINT_PROFILES,
  DINNER_STAPLE_ALLOWED_KEYWORDS,
  DINNER_STAPLE_BANNED_KEYWORDS,
  PLAN_CONSTRAINTS,
  PLAN_SEARCH_CONFIG,
  SNACK_PREFERRED_KEYWORDS,
  WHITE_RICE_RECIPE_IDS,
} from "@/lib/utils/constants";
import { addNutrients, cloneZeroNutrients } from "@/lib/utils/nutrients";
import { DailyPlan, RecipeCategory, RecipeMaster, SnackPlan, UserProfile } from "@/types";

type MealKey = "breakfast" | "lunch" | "dinner";
type ProfileName = "strict" | "relaxed";

type Slot = {
  meal: MealKey;
  category: RecipeCategory;
  mealTargetKcal: number;
  pool: RecipeMaster[];
  dinnerStapleOnly?: boolean;
};

type CandidateResult = {
  plan: DailyPlan | null;
  attempts: number;
  validCandidates: number;
  rejectedByProtein: number;
  rejectedByFat: number;
  bestProteinRateTried: number;
  bestFatRateTried: number;
};

type GenerateDailyPlanOptions = {
  excludedRecipeIds?: Set<string>;
  highCarbMode?: boolean;
};

const SNACK_TIMINGS: SnackPlan["timing"][] = ["午前補食", "練習前補食", "練習後補食"];

const normalizeText = (value: string) => value.toLowerCase();

const includesAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

const isWhiteRiceRecipe = (recipe: RecipeMaster) => {
  if (WHITE_RICE_RECIPE_IDS.includes(recipe.recipe_id)) return true;
  const text = normalizeText(`${recipe.recipe_name} ${recipe.main_food} ${(recipe.tags ?? []).join(" ")}`);
  return text.includes("白ごはん") || text.includes("白米") || text.includes("米飯");
};

const isExcludedRecipe = (recipe: RecipeMaster, excludedRecipeIds: Set<string>) => {
  if (excludedRecipeIds.size === 0) return false;
  if (isWhiteRiceRecipe(recipe)) return false;
  return excludedRecipeIds.has(recipe.recipe_id);
};

const isDinnerStapleAllowed = (recipe: RecipeMaster) => {
  const text = normalizeText(`${recipe.recipe_name} ${recipe.main_food} ${(recipe.tags ?? []).join(" ")}`);
  const hasBanned = DINNER_STAPLE_BANNED_KEYWORDS.some((kw) => text.includes(normalizeText(kw)));
  const hasAllowed = DINNER_STAPLE_ALLOWED_KEYWORDS.some((kw) => text.includes(normalizeText(kw)));
  return !hasBanned && hasAllowed;
};

const isRecipeFeasible = (profile: UserProfile, recipe: RecipeMaster, timeLimit: number) => {
  const recipeText = normalizeText(`${recipe.recipe_name} ${recipe.main_food} ${(recipe.tags ?? []).join(" ")}`);
  const dislikes = profile.dislikes.map((x) => normalizeText(x));
  const allergies = profile.allergies.map((x) => normalizeText(x));

  const hasDislike = includesAny(recipeText, dislikes);
  const hasAllergyByName = includesAny(recipeText, allergies);
  const hasAllergyByTag = (recipe.allergens ?? []).some((a) => allergies.includes(normalizeText(a)));

  return !hasDislike && !hasAllergyByName && !hasAllergyByTag && recipe.cook_time_min <= timeLimit && recipe.budget_jpy <= profile.budget_per_meal_jpy;
};

const weightedPick = (items: { recipe: RecipeMaster; score: number }[], used: Set<string>) => {
  const filtered = items.filter((x) => !used.has(x.recipe.recipe_id));
  if (filtered.length === 0) return null;

  const minScore = Math.min(...filtered.map((x) => x.score));
  const normalized = filtered.map((x) => ({ ...x, w: Math.max(0.01, x.score - minScore + 0.02) }));
  const total = normalized.reduce((sum, x) => sum + x.w, 0);
  let roll = Math.random() * total;

  for (const item of normalized) {
    roll -= item.w;
    if (roll <= 0) return item.recipe;
  }

  return normalized[normalized.length - 1].recipe;
};

const createSnackReason = (timing: SnackPlan["timing"]) => {
  switch (timing) {
    case "午前補食":
      return "午前中のエネルギー切れを防ぐため";
    case "昼食後〜練習前":
      return "午後の活動に向けたエネルギー補給のため";
    case "練習前補食":
      return "午後練習前のエネルギー補給のため";
    case "練習後補食":
      return "練習後の回復促進のため";
    case "夕食後":
      return "夕食後の不足エネルギーを補うため";
    case "就寝前":
      return "就寝中の回復を支えるため";
  }
};

const chooseSnacks = (
  allRecipes: RecipeMaster[],
  profile: UserProfile,
  usedIds: Set<string>,
  excludedRecipeIds: Set<string>,
  highCarbMode: boolean,
  targetKcal: number,
  currentKcal: number,
  targetProtein: number,
  currentProtein: number,
  getNutrition: (id: string) => ReturnType<typeof calculateRecipeNutrition>,
): { snackRecipes: RecipeMaster[]; snackPlans: SnackPlan[] } => {
  const remaining = Math.max(0, targetKcal - currentKcal);
  const proteinGap = Math.max(0, targetProtein - currentProtein);
  const energyBasedCount = Math.max(0, Math.ceil(remaining / 220));
  const proteinBasedCount = highCarbMode ? 0 : Math.max(0, Math.ceil(proteinGap / 18));
  const snackCount = Math.min(PLAN_SEARCH_CONFIG.maxSnackCount, Math.max(energyBasedCount, proteinBasedCount));

  if (snackCount === 0) {
    return { snackRecipes: [], snackPlans: [] };
  }

  const candidates = allRecipes
    .filter((r) => isRecipeFeasible(profile, r, profile.cook_time_breakfast_min))
    .filter((r) => !usedIds.has(r.recipe_id))
    .filter((r) => !isExcludedRecipe(r, excludedRecipeIds))
    .filter((r) => {
      if (r.category === "デザート" || r.category === "主食") return true;
      if (highCarbMode) return false;
      if (proteinGap > 8 && r.category === "主菜" && r.cook_time_min <= profile.cook_time_dinner_min) return true;
      return false;
    })
    .map((recipe) => {
      const n = getNutrition(recipe.recipe_id);
      const text = normalizeText(`${recipe.recipe_name} ${recipe.main_food} ${(recipe.tags ?? []).join(" ")}`);
      const preferBonus = SNACK_PREFERRED_KEYWORDS.some((kw) => text.includes(normalizeText(kw))) ? 0.6 : 0;
      const carbScore = n.carb / 35;
      const proteinScore = n.protein / 14;
      const proteinDensity = n.protein / Math.max(1, n.fat);
      const fatPenalty = n.fat / 16;
      const energyFit = Math.max(0, 1 - Math.abs(n.kcal - 180) / 220);
      const mainDishPenalty = recipe.category === "主菜" ? 0.2 : 0;
      const proteinNeedBoost = proteinGap > 0 ? 0.8 : 0.25;
      const highCarbPenalty = highCarbMode ? n.protein / 25 + n.fat / 14 : 0;
      const score =
        preferBonus +
        carbScore * (proteinGap > 12 ? 0.6 : 1.0) +
        proteinScore * proteinNeedBoost +
        proteinDensity * 0.08 +
        energyFit -
        fatPenalty -
        mainDishPenalty -
        highCarbPenalty;
      return { recipe, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, PLAN_CONSTRAINTS.maxSnackCandidates);

  const picked: RecipeMaster[] = [];
  const localUsed = new Set<string>(usedIds);

  for (let i = 0; i < snackCount; i += 1) {
    const snack = weightedPick(candidates, localUsed);
    if (!snack) break;
    localUsed.add(snack.recipe_id);
    picked.push(snack);
  }

  const snackPlans = picked.map((recipe, index) => {
    const timing = SNACK_TIMINGS[index] ?? "夕食後";
    return {
      timing,
      recipes: [recipe.recipe_id],
      reason: createSnackReason(timing),
    };
  });

  return { snackRecipes: picked, snackPlans };
};

const buildCandidateSearch = (
  profile: UserProfile,
  slots: Slot[],
  slotCountByMeal: Record<MealKey, number>,
  slotCandidates: { recipe: RecipeMaster; score: number }[][],
  allRecipes: RecipeMaster[],
  excludedRecipeIds: Set<string>,
  highCarbMode: boolean,
  targets: ReturnType<typeof calculateNutritionTargets>,
  getNutrition: (id: string) => ReturnType<typeof calculateRecipeNutrition>,
  profileName: ProfileName,
  constraintProfile: ConstraintProfile,
  trials: number,
): CandidateResult => {
  let bestPlan: DailyPlan | null = null;
  let bestScore = -Infinity;

  let validCandidates = 0;
  let rejectedByProtein = 0;
  let rejectedByFat = 0;
  let bestProteinRateTried = 0;
  let bestFatRateTried = 999;

  for (let attempt = 0; attempt < trials; attempt += 1) {
    const usedIds = new Set<string>();
    const selected: RecipeMaster[] = [];
    let failed = false;

    for (let idx = 0; idx < slots.length; idx += 1) {
      const picked = weightedPick(slotCandidates[idx], usedIds);
      if (!picked) {
        failed = true;
        break;
      }
      usedIds.add(picked.recipe_id);
      selected.push(picked);
    }

    if (failed) continue;

    const breakfastCount = slotCountByMeal.breakfast;
    const lunchCount = slotCountByMeal.lunch;
    const dinnerCount = slotCountByMeal.dinner;
    const breakfast = selected.slice(0, breakfastCount);
    const lunch = selected.slice(breakfastCount, breakfastCount + lunchCount);
    const dinner = selected.slice(breakfastCount + lunchCount, breakfastCount + lunchCount + dinnerCount);

    let mealNutrition = cloneZeroNutrients();
    for (const recipe of selected) {
      mealNutrition = addNutrients(mealNutrition, getNutrition(recipe.recipe_id));
    }

    const { snackRecipes, snackPlans } = chooseSnacks(
      allRecipes,
      profile,
      usedIds,
      excludedRecipeIds,
      highCarbMode,
      targets.kcal,
      mealNutrition.kcal,
      targets.protein,
      mealNutrition.protein,
      getNutrition,
    );
    const allSelectedRecipes = [...selected, ...snackRecipes];

    const recipeNutritions = allSelectedRecipes.map((r) => getNutrition(r.recipe_id));
    let dailyNutrition = cloneZeroNutrients();
    for (const n of recipeNutritions) {
      dailyNutrition = addNutrients(dailyNutrition, n);
    }

    const constraints = checkPlanConstraints(dailyNutrition, targets, constraintProfile);
    bestProteinRateTried = Math.max(bestProteinRateTried, constraints.proteinRate);
    bestFatRateTried = Math.min(bestFatRateTried, constraints.fatRate);

    if (!constraints.proteinOk) rejectedByProtein += 1;
    if (!constraints.fatOk) rejectedByFat += 1;

    const nutritionScore = scoreDailyNutrition(dailyNutrition, targets);
    const feasibilityScore = scoreFeasibility(
      allSelectedRecipes.reduce((sum, r) => sum + r.budget_jpy, 0),
      allSelectedRecipes.reduce((sum, r) => sum + r.cook_time_min, 0),
      profile.budget_per_meal_jpy * (3 + snackRecipes.length),
      profile.cook_time_breakfast_min + profile.cook_time_dinner_min * 2 + 20,
    );
    const variationScore = new Set(allSelectedRecipes.map((r) => r.cuisine)).size / Math.max(allSelectedRecipes.length, 1);
    const penalty = getConstraintPenalty(dailyNutrition, targets, constraintProfile);

    const score = Number((nutritionScore * 0.58 + feasibilityScore * 0.22 + variationScore * 0.2 - penalty.totalPenalty * 0.35).toFixed(4));

    if (constraints.isValid) {
      validCandidates += 1;
      if (score > bestScore) {
        bestScore = score;
        bestPlan = {
          meals: { breakfast, lunch, dinner },
          snacks: snackPlans,
          recipes: allSelectedRecipes,
          recipeNutritions,
          dailyNutrition,
          totalBudget: allSelectedRecipes.reduce((sum, r) => sum + r.budget_jpy, 0),
          totalCookTime: allSelectedRecipes.reduce((sum, r) => sum + r.cook_time_min, 0),
          score,
          debug: {
            constraintProfile: profileName,
            attempts: attempt + 1,
            validCandidates,
            rejectedByProtein,
            rejectedByFat,
            bestProteinRateTried: Number(bestProteinRateTried.toFixed(1)),
            bestFatRateTried: Number(bestFatRateTried.toFixed(1)),
          },
        };
      }
    }
  }

  return {
    plan: bestPlan,
    attempts: trials,
    validCandidates,
    rejectedByProtein,
    rejectedByFat,
    bestProteinRateTried: Number(bestProteinRateTried.toFixed(1)),
    bestFatRateTried: Number(bestFatRateTried.toFixed(1)),
  };
};

export const generateDailyPlan = (profile: UserProfile, options: GenerateDailyPlanOptions = {}): DailyPlan => {
  const allRecipes = getRecipeMaster();
  const excludedRecipeIds = options.excludedRecipeIds ?? new Set<string>();
  const highCarbMode = options.highCarbMode ?? false;
  const targets = calculateNutritionTargets(profile);

  const nutritionMap = new Map<string, ReturnType<typeof calculateRecipeNutrition>>();
  for (const recipe of allRecipes) {
    nutritionMap.set(recipe.recipe_id, calculateRecipeNutrition(recipe.recipe_id));
  }

  const getNutrition = (recipeId: string) => {
    const n = nutritionMap.get(recipeId);
    if (!n) throw new Error(`栄養計算データが見つかりません: ${recipeId}`);
    return n;
  };

  const breakfastPool = allRecipes.filter((r) => isRecipeFeasible(profile, r, profile.cook_time_breakfast_min));
  const lunchPool = allRecipes.filter((r) => isRecipeFeasible(profile, r, profile.cook_time_dinner_min));
  const dinnerPool = allRecipes.filter((r) => isRecipeFeasible(profile, r, profile.cook_time_dinner_min));

  const slots: Slot[] = highCarbMode
    ? [
        { meal: "breakfast", category: "主食", mealTargetKcal: targets.kcal * 0.3, pool: breakfastPool },
        { meal: "breakfast", category: "主菜", mealTargetKcal: targets.kcal * 0.3, pool: breakfastPool },
        { meal: "breakfast", category: "副菜", mealTargetKcal: targets.kcal * 0.3, pool: breakfastPool },
        { meal: "lunch", category: "主食", mealTargetKcal: targets.kcal * 0.35, pool: lunchPool },
        { meal: "lunch", category: "副菜", mealTargetKcal: targets.kcal * 0.35, pool: lunchPool },
        { meal: "lunch", category: "汁物", mealTargetKcal: targets.kcal * 0.35, pool: lunchPool },
        { meal: "dinner", category: "主食", mealTargetKcal: targets.kcal * 0.35, pool: dinnerPool, dinnerStapleOnly: true },
        { meal: "dinner", category: "副菜", mealTargetKcal: targets.kcal * 0.35, pool: dinnerPool },
        { meal: "dinner", category: "汁物", mealTargetKcal: targets.kcal * 0.35, pool: dinnerPool },
      ]
    : [
        { meal: "breakfast", category: "主食", mealTargetKcal: targets.kcal * 0.25, pool: breakfastPool },
        { meal: "breakfast", category: "主菜", mealTargetKcal: targets.kcal * 0.25, pool: breakfastPool },
        { meal: "breakfast", category: "副菜", mealTargetKcal: targets.kcal * 0.25, pool: breakfastPool },
        { meal: "lunch", category: "主食", mealTargetKcal: targets.kcal * 0.35, pool: lunchPool },
        { meal: "lunch", category: "主菜", mealTargetKcal: targets.kcal * 0.35, pool: lunchPool },
        { meal: "lunch", category: "副菜", mealTargetKcal: targets.kcal * 0.35, pool: lunchPool },
        { meal: "dinner", category: "主食", mealTargetKcal: targets.kcal * 0.3, pool: dinnerPool, dinnerStapleOnly: true },
        { meal: "dinner", category: "主菜", mealTargetKcal: targets.kcal * 0.3, pool: dinnerPool },
        { meal: "dinner", category: "副菜", mealTargetKcal: targets.kcal * 0.3, pool: dinnerPool },
        { meal: "dinner", category: "汁物", mealTargetKcal: targets.kcal * 0.3, pool: dinnerPool },
      ];

  const likes = profile.likes.map((x) => normalizeText(x));
  const slotCountByMeal = slots.reduce<Record<MealKey, number>>(
    (acc, slot) => {
      acc[slot.meal] += 1;
      return acc;
    },
    { breakfast: 0, lunch: 0, dinner: 0 },
  );

  const slotCandidates = slots.map((slot) => {
    const perDishTarget = slot.mealTargetKcal / Math.max(slotCountByMeal[slot.meal], 1);
    const list = slot.pool
      .filter((r) => r.category === slot.category)
      .filter((r) => (slot.dinnerStapleOnly ? isDinnerStapleAllowed(r) : true))
      .filter((r) => !isExcludedRecipe(r, excludedRecipeIds))
      .map((recipe) => {
        const n = getNutrition(recipe.recipe_id);
        const text = normalizeText(`${recipe.recipe_name} ${recipe.main_food} ${(recipe.tags ?? []).join(" ")}`);
        const likeBonus = includesAny(text, likes) ? 0.08 : 0;

        const energyFit = Math.max(0, 1 - Math.abs(n.kcal - perDishTarget) / Math.max(perDishTarget, 1));
        const fatPenalty = n.fat / 25;
        const mainDishLeanBonus =
          slot.category === "主菜"
            ? highCarbMode
              ? n.protein / 24 - n.fat / 22
              : n.protein / 10 + n.protein / Math.max(8, n.fat * 2.8) - n.fat / 18
            : 0;
        const dinnerStapleFatPenalty = slot.meal === "dinner" && slot.category === "主食" ? n.fat / 18 : 0;

        const score = energyFit + likeBonus + mainDishLeanBonus - fatPenalty - dinnerStapleFatPenalty;
        return { recipe, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, PLAN_CONSTRAINTS.maxCandidatesPerSlot);

    return list;
  });

  if (slotCandidates.some((list) => list.length === 0)) {
    throw new Error("条件を満たす候補が不足しています。アレルギー・調理時間・予算条件を少し緩めてください。");
  }

  const strictResult = buildCandidateSearch(
    profile,
    slots,
    slotCountByMeal,
    slotCandidates,
    allRecipes,
    excludedRecipeIds,
    highCarbMode,
    targets,
    getNutrition,
    "strict",
    highCarbMode ? { ...CONSTRAINT_PROFILES.strict, proteinMin: 0 } : CONSTRAINT_PROFILES.strict,
    PLAN_SEARCH_CONFIG.strictTrials,
  );

  if (strictResult.plan) {
    return strictResult.plan;
  }

  if (PLAN_SEARCH_CONFIG.allowRelaxedFallback) {
    const relaxedResult = buildCandidateSearch(
      profile,
      slots,
      slotCountByMeal,
      slotCandidates,
      allRecipes,
      excludedRecipeIds,
      highCarbMode,
      targets,
      getNutrition,
      "relaxed",
      highCarbMode ? { ...CONSTRAINT_PROFILES.relaxed, proteinMin: 0 } : CONSTRAINT_PROFILES.relaxed,
      PLAN_SEARCH_CONFIG.relaxedTrials,
    );

    if (relaxedResult.plan) {
      return relaxedResult.plan;
    }

    throw new Error(
      `献立生成失敗: strict(valid=${strictResult.validCandidates}, proteinNG=${strictResult.rejectedByProtein}, fatNG=${strictResult.rejectedByFat}, bestProtein=${strictResult.bestProteinRateTried}%, bestFat=${strictResult.bestFatRateTried}%), relaxed(valid=${relaxedResult.validCandidates}, proteinNG=${relaxedResult.rejectedByProtein}, fatNG=${relaxedResult.rejectedByFat}, bestProtein=${relaxedResult.bestProteinRateTried}%, bestFat=${relaxedResult.bestFatRateTried}%)`,
    );
  }

  throw new Error(
    `献立生成失敗: strict(valid=${strictResult.validCandidates}, proteinNG=${strictResult.rejectedByProtein}, fatNG=${strictResult.rejectedByFat}, bestProtein=${strictResult.bestProteinRateTried}%, bestFat=${strictResult.bestFatRateTried}%)`,
  );
};
