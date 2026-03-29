"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AchievementBars } from "@/components/AchievementBars";
import { NutritionTable } from "@/components/NutritionTable";
import { RESULT_STORAGE_KEY } from "@/lib/utils/defaults";
import { WEEK_DAY_TYPE_LABELS } from "@/lib/utils/constants";
import { GenerateDailyPlanResponse } from "@/types/api";
import { RecipeMaster, WeeklyDayPlan } from "@/types";

const buildFallbackMeals = (recipes: RecipeMaster[]) => {
  const breakfast = recipes.slice(0, 3);
  const lunch = recipes.slice(3, 6);
  const dinner = recipes.slice(6);
  return { breakfast, lunch, dinner };
};

const RecipeLink = ({ recipe }: { recipe: RecipeMaster }) => {
  return (
    <Link
      href={`/recipes/${recipe.recipe_id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-slate-300 hover:text-brand-700"
    >
      {recipe.recipe_name}
    </Link>
  );
};

export default function ResultPage() {
  const [result, setResult] = useState<GenerateDailyPlanResponse | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  useEffect(() => {
    const raw = localStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) return;
    try {
      setResult(JSON.parse(raw) as GenerateDailyPlanResponse);
    } catch {
      localStorage.removeItem(RESULT_STORAGE_KEY);
      setResult(null);
    }
  }, []);

  const weekPlans = useMemo<WeeklyDayPlan[]>(() => {
    if (!result) return [];
    if (result.weekPlans && result.weekPlans.length > 0) return result.weekPlans;
    return [
      {
        dayIndex: 1,
        dayLabel: "1日目",
        dayType: "training",
        plan: result.plan,
        targets: result.targets,
        evaluation: result.evaluation,
      },
    ];
  }, [result]);

  const selectedDay = weekPlans[Math.min(selectedDayIndex, Math.max(weekPlans.length - 1, 0))];

  if (!result || !selectedDay) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-slate-700">結果データがありません。先に献立を生成してください。</p>
        <Link href="/generate" className="mt-4 inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white">
          生成画面へ
        </Link>
      </section>
    );
  }

  const recipes = selectedDay.plan.recipes ?? [];
  const meals = selectedDay.plan.meals ?? buildFallbackMeals(recipes);
  const snacks = Array.isArray(selectedDay.plan.snacks) ? selectedDay.plan.snacks : [];
  const shoppingList = result.weekShoppingList ?? result.shoppingList ?? [];

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">生成結果（7日分）</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold">日別カテゴリー</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {weekPlans.map((day, idx) => (
            <button
              key={`${day.dayIndex}-${day.dayType}`}
              className={`rounded border px-3 py-2 text-left text-sm ${idx === selectedDayIndex ? "border-brand-600 bg-brand-50" : "border-slate-200"}`}
              onClick={() => setSelectedDayIndex(idx)}
            >
              <p className="font-medium">{day.dayIndex}日目</p>
              <p className="text-slate-600">{WEEK_DAY_TYPE_LABELS[day.dayType]}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-2 text-lg font-semibold">{selectedDay.dayIndex}日目の食事プラン（{WEEK_DAY_TYPE_LABELS[selectedDay.dayType]}）</h2>

          <div className="space-y-3">
            {(["breakfast", "lunch", "dinner"] as const).map((mealKey) => (
              <div key={mealKey} className="rounded-lg border border-slate-100 p-3">
                <p className="mb-2 font-semibold text-slate-800">
                  {mealKey === "breakfast" ? "朝食" : mealKey === "lunch" ? "昼食" : "夕食"}
                </p>
                <ul className="grid gap-2">
                  {meals[mealKey].map((recipe) => (
                    <li key={recipe.recipe_id} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex justify-between">
                        <p className="font-medium">
                          {recipe.category}: <RecipeLink recipe={recipe} />
                        </p>
                        <p className="text-sm text-slate-600">
                          {recipe.budget_jpy} 円 / {recipe.cook_time_min} 分
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="rounded-lg border border-slate-100 p-3">
              <p className="mb-2 font-semibold text-slate-800">補食</p>
              {snacks.length === 0 ? (
                <p className="text-sm text-slate-500">補食は不要と判定されました。</p>
              ) : (
                <ul className="grid gap-2">
                  {snacks.map((snack, idx) => (
                    <li key={`${snack.timing}-${idx}`} className="rounded-lg border border-slate-100 p-3 text-sm">
                      <p className="font-medium">{snack.timing}</p>
                      <p className="text-xs text-slate-500">{snack.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-lg font-semibold">目標達成率</h2>
          <AchievementBars actual={selectedDay.plan.dailyNutrition} target={selectedDay.targets} />
          <p className="mt-4 text-sm text-slate-700">総合評価: {selectedDay.evaluation.totalScore}%</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">栄養テーブル（栄養価 / 目標）</h2>
        <NutritionTable actual={selectedDay.plan.dailyNutrition} target={selectedDay.targets} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold">1週間の買い物リスト</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {shoppingList.map((item) => (
            <li key={item.food_id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
              {item.food_name}: {item.total_amount_g} g
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
