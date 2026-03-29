"use client";

import { NUTRIENT_DISPLAY } from "@/lib/utils/constants";
import { NUTRIENT_KEYS, NutrientMap } from "@/types";

export function NutritionTable({ actual, target }: { actual: NutrientMap; target?: NutrientMap }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-700">
          <tr>
            <th className="px-4 py-3">栄養素</th>
            <th className="px-4 py-3">栄養価</th>
            {target ? <th className="px-4 py-3">目標</th> : null}
            {target ? <th className="px-4 py-3">達成率</th> : null}
          </tr>
        </thead>
        <tbody>
          {NUTRIENT_KEYS.map((key) => {
            const actualValue = actual[key];
            const targetValue = target?.[key];
            const rate = targetValue ? (actualValue / targetValue) * 100 : null;
            const meta = NUTRIENT_DISPLAY[key];
            return (
              <tr key={key} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">
                  {meta.label} ({meta.unit})
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {actualValue.toFixed(2)} {meta.unit}
                </td>
                {target ? (
                  <td className="px-4 py-2 text-slate-700">
                    {targetValue?.toFixed(2)} {meta.unit}
                  </td>
                ) : null}
                {target ? <td className="px-4 py-2 text-slate-700">{rate?.toFixed(1)}%</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
