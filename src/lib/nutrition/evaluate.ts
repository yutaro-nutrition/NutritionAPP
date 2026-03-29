import { CONSTRAINT_PROFILES } from "@/lib/utils/constants";
import { ConstraintProfile, checkPlanConstraints } from "@/lib/scoring/scorePlan";
import { NUTRIENT_KEYS, NutritionEvaluation, NutrientMap } from "@/types";

export const evaluateNutrition = (
  dailyNutrition: NutrientMap,
  targets: NutrientMap,
  profile: ConstraintProfile = CONSTRAINT_PROFILES.strict,
  profileName: "strict" | "relaxed" = "strict",
): NutritionEvaluation => {
  const achievedPercent = {} as Record<(typeof NUTRIENT_KEYS)[number], number>;
  const gap = {} as Record<(typeof NUTRIENT_KEYS)[number], number>;

  let scoreSum = 0;

  for (const key of NUTRIENT_KEYS) {
    const target = targets[key] || 1;
    const actual = dailyNutrition[key] || 0;
    const percent = (actual / target) * 100;
    achievedPercent[key] = Number(percent.toFixed(1));
    gap[key] = Number((target - actual).toFixed(2));

    const capped = Math.min(percent, 100);
    scoreSum += capped;
  }

  const constraints = checkPlanConstraints(dailyNutrition, targets, profile);

  return {
    achievedPercent,
    gap,
    constraintStatus: {
      proteinRate: constraints.proteinRate,
      fatRate: constraints.fatRate,
      proteinOk: constraints.proteinOk,
      fatOk: constraints.fatOk,
      profile: profileName,
    },
    totalScore: Number((scoreSum / NUTRIENT_KEYS.length).toFixed(1)),
  };
};
