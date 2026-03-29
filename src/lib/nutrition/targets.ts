import {
  ACTIVITY_FACTORS,
  B_VITAMIN_DENSITY,
  FIXED_MICRO_TARGETS,
  GOAL_ENERGY_ADJUSTMENT,
  GOAL_PFC_RATIO,
} from "@/lib/utils/constants";
import { cloneZeroNutrients, roundNutrients } from "@/lib/utils/nutrients";
import { NutritionTargets, UserProfile } from "@/types";

export const calculateNutritionTargets = (profile: UserProfile): NutritionTargets => {
  const bmrPerKg = profile.sex === "male" ? 24 : 22;
  const bmr = profile.weight_kg * bmrPerKg;
  const activityAdjusted = bmr * ACTIVITY_FACTORS[profile.activity_level];
  const energy = Math.max(1200, Math.round(activityAdjusted + GOAL_ENERGY_ADJUSTMENT[profile.goal_type]));

  const pfcRatio = GOAL_PFC_RATIO[profile.goal_type];
  const protein = (energy * pfcRatio.protein) / 4;
  const fat = (energy * pfcRatio.fat) / 9;
  const carb = (energy * pfcRatio.carb) / 4;

  const targets = cloneZeroNutrients();
  targets.kcal = energy;
  targets.protein = protein;
  targets.fat = fat;
  targets.carb = carb;
  targets.calcium = FIXED_MICRO_TARGETS.calcium;
  targets.iron = FIXED_MICRO_TARGETS.iron[profile.sex];
  targets.salt = FIXED_MICRO_TARGETS.salt[profile.sex];
  targets.vitamin_b1 = 0.3 * (energy / 1000);
  targets.vitamin_b2 = B_VITAMIN_DENSITY.vitamin_b2_mg_per_1000kcal * (energy / 1000);
  targets.vitamin_b6 = B_VITAMIN_DENSITY.vitamin_b6_mg_per_1000kcal * (energy / 1000);
  targets.vitamin_b12 = FIXED_MICRO_TARGETS.vitamin_b12;
  targets.vitamin_c = FIXED_MICRO_TARGETS.vitamin_c;
  targets.vitamin_d = FIXED_MICRO_TARGETS.vitamin_d;
  targets.retinol_activity_equivalent = FIXED_MICRO_TARGETS.retinol_activity_equivalent[profile.sex];

  return roundNutrients(targets);
};
