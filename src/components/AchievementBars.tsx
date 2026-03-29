"use client";

import { NUTRIENT_DISPLAY } from "@/lib/utils/constants";
import { NutrientMap } from "@/types";

export function AchievementBars({ actual, target }: { actual: NutrientMap; target: NutrientMap }) {
  const keys: (keyof NutrientMap)[] = [
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
  ];

  return (
    <div className="grid gap-3">
      {keys.map((key) => {
        const pct = Math.min((actual[key] / target[key]) * 100, 160);
        const meta = NUTRIENT_DISPLAY[key];
        return (
          <div key={key}>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>
                {meta.label} ({meta.unit})
              </span>
              <span>{pct.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded bg-slate-200">
              <div className="h-2 rounded bg-brand-500" style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
