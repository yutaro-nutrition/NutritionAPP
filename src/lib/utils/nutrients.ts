import { NutrientMap, NUTRIENT_KEYS } from "@/types";
import { ZERO_NUTRIENTS } from "./constants";

export const cloneZeroNutrients = (): NutrientMap => ({ ...ZERO_NUTRIENTS });

export const addNutrients = (base: NutrientMap, add: NutrientMap): NutrientMap => {
  const next = { ...base };
  for (const key of NUTRIENT_KEYS) {
    next[key] = Number((next[key] + add[key]).toFixed(2));
  }
  return next;
};

export const scaleNutrients = (nutrients: NutrientMap, factor: number): NutrientMap => {
  const next = cloneZeroNutrients();
  for (const key of NUTRIENT_KEYS) {
    next[key] = Number((nutrients[key] * factor).toFixed(4));
  }
  return next;
};

export const roundNutrients = (nutrients: NutrientMap): NutrientMap => {
  const next = cloneZeroNutrients();
  for (const key of NUTRIENT_KEYS) {
    next[key] = Number(nutrients[key].toFixed(2));
  }
  return next;
};
