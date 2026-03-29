import { CONSTRAINT_PROFILES } from "@/lib/utils/constants";
import { NutritionTargets, NutrientMap } from "@/types";

export type ConstraintProfile = {
  proteinMin: number;
  proteinMax: number | null;
  fatMax: number;
};

const fitRatioScore = (actual: number, target: number) => {
  if (target <= 0) return 0;
  const diffRatio = Math.abs(actual - target) / target;
  return Math.max(0, 1 - diffRatio);
};

export const scoreDailyNutrition = (daily: NutrientMap, targets: NutritionTargets): number => {
  const energyScore = fitRatioScore(daily.kcal, targets.kcal);

  const proteinScore = fitRatioScore(daily.protein, targets.protein);
  const fatScore = fitRatioScore(daily.fat, targets.fat);
  const carbScore = fitRatioScore(daily.carb, targets.carb);
  const pfcScore = (proteinScore + fatScore + carbScore) / 3;

  const microKeys: (keyof NutrientMap)[] = [
    "calcium",
    "iron",
    "vitamin_b1",
    "vitamin_b2",
    "vitamin_b6",
    "vitamin_b12",
    "vitamin_c",
    "vitamin_d",
    "retinol_activity_equivalent",
  ];
  const microScore =
    microKeys.reduce((acc, key) => acc + Math.min((daily[key] || 0) / (targets[key] || 1), 1), 0) /
    microKeys.length;

  return Number((energyScore * 0.35 + pfcScore * 0.35 + microScore * 0.3).toFixed(4));
};

export const scoreFeasibility = (totalBudget: number, totalTime: number, budgetLimit: number, timeLimit: number): number => {
  const budgetScore = totalBudget <= budgetLimit ? 1 : Math.max(0, 1 - (totalBudget - budgetLimit) / budgetLimit);
  const timeScore = totalTime <= timeLimit ? 1 : Math.max(0, 1 - (totalTime - timeLimit) / timeLimit);
  return Number(((budgetScore + timeScore) / 2).toFixed(4));
};

export const getMacroAchievementRates = (daily: NutrientMap, targets: NutritionTargets) => {
  const proteinRate = ((daily.protein || 0) / Math.max(targets.protein || 1, 1)) * 100;
  const fatRate = ((daily.fat || 0) / Math.max(targets.fat || 1, 1)) * 100;

  return {
    proteinRate: Number(proteinRate.toFixed(1)),
    fatRate: Number(fatRate.toFixed(1)),
  };
};

export const getConstraintPenalty = (
  daily: NutrientMap,
  targets: NutritionTargets,
  profile: ConstraintProfile = CONSTRAINT_PROFILES.strict,
) => {
  const { proteinRate, fatRate } = getMacroAchievementRates(daily, targets);

  const proteinLack = Math.max(0, profile.proteinMin - proteinRate);
  const proteinExcess = profile.proteinMax == null ? 0 : Math.max(0, proteinRate - profile.proteinMax);
  const fatExcess = Math.max(0, fatRate - profile.fatMax);

  // 0.0 ~ 1.0 を超える程度の連続ペナルティ
  const penalty = proteinLack / 60 + proteinExcess / 80 + fatExcess / 60;

  return {
    proteinLack: Number(proteinLack.toFixed(1)),
    proteinExcess: Number(proteinExcess.toFixed(1)),
    fatExcess: Number(fatExcess.toFixed(1)),
    totalPenalty: Number(penalty.toFixed(4)),
  };
};

export const checkPlanConstraints = (
  daily: NutrientMap,
  targets: NutritionTargets,
  profile: ConstraintProfile = CONSTRAINT_PROFILES.strict,
) => {
  const { proteinRate, fatRate } = getMacroAchievementRates(daily, targets);
  const proteinMinOk = proteinRate >= profile.proteinMin;
  const proteinMaxOk = profile.proteinMax == null ? true : proteinRate <= profile.proteinMax;
  const fatOk = fatRate <= profile.fatMax;

  return {
    proteinOk: proteinMinOk && proteinMaxOk,
    fatOk,
    proteinRate,
    fatRate,
    isValid: proteinMinOk && proteinMaxOk && fatOk,
  };
};
